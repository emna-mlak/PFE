package com.pfe.vuzixar.ui

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pfe.vuzixar.BuildConfig
import com.pfe.vuzixar.camera.CameraPipeline
import com.pfe.vuzixar.camera.CameraXBindings
import com.pfe.vuzixar.camera.FrameQuality
import com.pfe.vuzixar.data.config.CaptureConfig
import com.pfe.vuzixar.camera.FrameCaptureScheduler
import com.pfe.vuzixar.data.api.RetrofitClient
import com.pfe.vuzixar.data.api.model.HealthResponse
import com.pfe.vuzixar.data.api.model.RecognizePlateResponse
import com.pfe.vuzixar.data.network.PiConnection
import com.pfe.vuzixar.data.network.PiGatewayResolver
import com.pfe.vuzixar.data.repository.PlateRecognitionRepository
import com.pfe.vuzixar.ui.model.PlateHudDisplay
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

data class MainUiState(
    val healthLoading: Boolean = false,
    val healthMessage: String? = null,
    val healthSuccess: Boolean? = null,
    val lastHealth: HealthResponse? = null,
    val networkDiagnostics: String? = null,
    val captureLoopEnabled: Boolean = false,
    val isUploading: Boolean = false,
    val framesEncoded: Int = 0,
    val uploadsAttempted: Int = 0,
    val uploadsSucceeded: Int = 0,
    val framesSkipped: Int = 0,
    val framesRejectedBlur: Int = 0,
    val plateHud: PlateHudDisplay? = null,
    val ocrStatusHint: String? = null,
    val liveStatusLine: String = "v${BuildConfig.VERSION_NAME} — Tester Pi puis ANPR",
)

class MainViewModel(application: Application) : AndroidViewModel(application) {

    /** Pipeline créé ici — jamais null quand l'utilisateur appuie sur ANPR. */
    val cameraPipeline = CameraPipeline()

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    private val captureScheduler = FrameCaptureScheduler(viewModelScope)
    private var plateRepository = newPlateRepository()
    private val uploadInProgress = AtomicBoolean(false)
    private var lastConsensusPlate: String? = null
    private var consensusCount = 0
    private var consecutiveMissCount = 0

    init {
        plateRepository = newPlateRepository()
    }

    private fun newPlateRepository() =
        PlateRecognitionRepository(getApplication(), RetrofitClient.api)

    fun refreshNetworkDiagnostics(context: android.content.Context) {
        val snap = PiGatewayResolver.snapshot(context.applicationContext)
        _uiState.update {
            it.copy(networkDiagnostics = PiGatewayResolver.formatDiagnostics(snap))
        }
    }

    fun checkPiHealth() {
        viewModelScope.launch {
            val app = getApplication<Application>()
            val snap = PiGatewayResolver.snapshot(app)
            val diag = PiGatewayResolver.formatDiagnostics(snap)

            _uiState.update {
                it.copy(healthLoading = true, healthMessage = null, healthSuccess = null, networkDiagnostics = diag)
            }

            PiConnection.probeAndGetHealth(app)
                .onSuccess { (body, _) ->
                    RetrofitClient.prepare(app)
                    plateRepository = newPlateRepository()
                    _uiState.update {
                        it.copy(
                            healthLoading = false,
                            healthSuccess = body.status == "ok",
                            healthMessage = buildHealthSummary(body),
                            lastHealth = body,
                            networkDiagnostics = diag,
                            liveStatusLine = "Pi OK → appuyez ANPR (1 FPS HD)",
                            ocrStatusHint = "Centrez la plaque, restez stable 1–2 s",
                        )
                    }
                }
                .onFailure { err ->
                    Log.e(TAG, "health failed", err)
                    _uiState.update {
                        it.copy(
                            healthLoading = false,
                            healthSuccess = false,
                            healthMessage = formatNetworkError(err, snap),
                            networkDiagnostics = diag,
                        )
                    }
                }
        }
    }

    fun toggleCaptureLoop() {
        val enable = !_uiState.value.captureLoopEnabled
        cameraPipeline.captureActive.set(enable)

        if (enable) {
            RetrofitClient.prepare(getApplication())
            plateRepository = newPlateRepository()
            cameraPipeline.framesEncoded.set(0)
            lastConsensusPlate = null
            consensusCount = 0
            consecutiveMissCount = 0
            captureScheduler.start { processCaptureTick() }
            _uiState.update {
                it.copy(
                    captureLoopEnabled = true,
                    isUploading = false,
                    framesEncoded = 0,
                    uploadsAttempted = 0,
                    uploadsSucceeded = 0,
                    framesSkipped = 0,
                    framesRejectedBlur = 0,
                    plateHud = null,
                    ocrStatusHint = "ANPR HD 1280×720 — stabilisez la vue",
                    liveStatusLine = "ANPR ON | frames 0 | envois 0",
                )
            }
            viewModelScope.launch {
                delay(4_000)
                if (_uiState.value.captureLoopEnabled &&
                    _uiState.value.framesEncoded == 0 &&
                    _uiState.value.uploadsAttempted == 0
                ) {
                    _uiState.update {
                        it.copy(
                            ocrStatusHint = "⚠ Aucune frame — ImageCapture va prendre le relais…",
                        )
                    }
                }
            }
        } else {
            captureScheduler.stop()
            cameraPipeline.frameStore.clear()
            uploadInProgress.set(false)
            _uiState.update {
                it.copy(
                    captureLoopEnabled = false,
                    isUploading = false,
                    ocrStatusHint = null,
                    liveStatusLine = "ANPR arrêté",
                )
            }
        }
    }

    private suspend fun processCaptureTick(): Boolean {
        val pipeline = cameraPipeline
        val encoded = pipeline.framesEncoded.get()
        _uiState.update {
            it.copy(
                framesEncoded = encoded,
                liveStatusLine = buildLiveLine(encoded, it.uploadsAttempted, it.uploadsSucceeded, it.isUploading, it.framesRejectedBlur),
            )
        }

        if (uploadInProgress.get()) {
            _uiState.update { it.copy(framesSkipped = it.framesSkipped + 1) }
            return false
        }

        // OCR : toujours ImageCapture HD (pas le flux analyse 640×480).
        val capture = pipeline.imageCaptureRef.get() ?: return false
        val rawJpeg = CameraXBindings.captureJpeg(getApplication(), capture) ?: return false
        pipeline.framesEncoded.incrementAndGet()

        val blurCount = _uiState.value.framesRejectedBlur
        val bypassBlur = blurCount >= CaptureConfig.BLUR_BYPASS_AFTER_REJECTIONS
        val prepared = FrameQuality.prepareForOcr(rawJpeg, bypassSharpness = bypassBlur)
        if (prepared == null) {
            _uiState.update {
                it.copy(
                    framesEncoded = pipeline.framesEncoded.get(),
                    framesRejectedBlur = it.framesRejectedBlur + 1,
                    ocrStatusHint = if (it.framesRejectedBlur + 1 >= CaptureConfig.BLUR_BYPASS_AFTER_REJECTIONS) {
                        "Envoi même si flou…"
                    } else {
                        "Image floue — rapprochez / stabilisez"
                    },
                    liveStatusLine = buildLiveLine(
                        pipeline.framesEncoded.get(),
                        it.uploadsAttempted,
                        it.uploadsSucceeded,
                        false,
                        it.framesRejectedBlur + 1,
                    ),
                )
            }
            return false
        }

        val jpeg = prepared.jpeg
        Log.i(TAG, "OCR frame sharpness=${"%.0f".format(prepared.sharpness)} size=${jpeg.size}")

        uploadInProgress.set(true)
        _uiState.update {
            it.copy(
                isUploading = true,
                uploadsAttempted = it.uploadsAttempted + 1,
                ocrStatusHint = "OCR en cours (${it.uploadsAttempted + 1})… patience",
            )
        }

        return try {
            plateRepository.recognizePlate(jpeg)
                .onSuccess { response ->
                    val (candidate, showHud, hint) = resolveHudAfterOcr(response)

                    _uiState.update {
                        it.copy(
                            plateHud = if (showHud) candidate else it.plateHud,
                            uploadsSucceeded = it.uploadsSucceeded + 1,
                            ocrStatusHint = hint,
                            liveStatusLine = buildLiveLine(
                                pipeline.framesEncoded.get(),
                                it.uploadsAttempted,
                                it.uploadsSucceeded + 1,
                                false,
                                it.framesRejectedBlur,
                            ) + if (showHud) " | ${candidate.plateLine}" else "",
                        )
                    }
                    if (showHud) Log.i(TAG, "OCR confirmé: ${candidate.plateLine} / ${candidate.statusLine}")
                    true
                }
                .onFailure { err ->
                    Log.e(TAG, "OCR failed", err)
                    _uiState.update {
                        it.copy(
                            plateHud = PlateHudDisplay.networkError(err.message ?: "erreur"),
                            ocrStatusHint = "Erreur OCR — retry…",
                        )
                    }
                    false
                }
                .isSuccess
        } finally {
            uploadInProgress.set(false)
            _uiState.update { it.copy(isUploading = false) }
        }
    }

    /**
     * Plaque : 2 lectures identiques avant affichage.
     * « Aucune plaque » : seulement après 3 échecs consécutifs (évite faux négatif immédiat).
     */
    private fun resolveHudAfterOcr(
        response: RecognizePlateResponse,
    ): Triple<PlateHudDisplay, Boolean, String?> {
        val hasPlate = response.detected ||
            !response.matricule.isNullOrBlank() ||
            !response.display.isNullOrBlank()

        if (hasPlate) {
            consecutiveMissCount = 0
            val candidate = PlateHudDisplay.fromResponse(response)
            val plateKey = candidate.plateLine.trim()
            if (plateKey == lastConsensusPlate) {
                consensusCount++
            } else {
                lastConsensusPlate = plateKey
                consensusCount = 1
            }
            val showHud = consensusCount >= 2
            val hint = if (showHud) null else "Confirmation… ($consensusCount/2) ${candidate.plateLine}"
            return Triple(candidate, showHud, hint)
        }

        consecutiveMissCount++
        consensusCount = 0
        lastConsensusPlate = null
        val candidate = PlateHudDisplay.noDetection()
        val showHud = consecutiveMissCount >= 3
        val hint = if (showHud) {
            "Pi : aucune plaque sur ${consecutiveMissCount} images — cadrez la plaque"
        } else {
            "Recherche plaque… (${consecutiveMissCount}/3)"
        }
        return Triple(candidate, showHud, hint)
    }

    private fun buildLiveLine(
        frames: Int,
        attempts: Int,
        ok: Int,
        uploading: Boolean,
        blur: Int = 0,
    ): String {
        return buildString {
            append("ANPR HD")
            append(" | frames $frames")
            append(" | ↑$attempts ok$ok")
            if (blur > 0) append(" | flou $blur")
            if (uploading) append(" | envoi…")
        }
    }

    override fun onCleared() {
        cameraPipeline.captureActive.set(false)
        captureScheduler.stop()
        super.onCleared()
    }

    private fun formatNetworkError(err: Throwable, snap: PiGatewayResolver.WifiSnapshot): String {
        val msg = err.message ?: "erreur"
        return "Échec Pi. ${PiGatewayResolver.formatDiagnostics(snap)} $msg"
    }

    private fun buildHealthSummary(body: HealthResponse): String {
        return buildString {
            append("Pi : ${body.status ?: "?"}")
            body.plateOcrPipelineReady?.let { append(" | OCR ready: $it") }
        }
    }

    companion object {
        private const val TAG = "VuzixAR/ViewModel"
    }
}
