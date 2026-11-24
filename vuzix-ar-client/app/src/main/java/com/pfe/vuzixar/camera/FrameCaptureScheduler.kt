package com.pfe.vuzixar.camera

import com.pfe.vuzixar.data.config.NetworkConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Boucle de capture périodique (~2 FPS) — squelette STEP 1.
 *
 * STEP 2 branchera [onCaptureTick] sur ImageAnalysis + encodage JPEG
 * puis POST /recognize_plate via Retrofit.
 */
class FrameCaptureScheduler(
    private val scope: CoroutineScope,
    private val intervalMs: Long = NetworkConfig.FRAME_INTERVAL_MS,
) {
    private var loopJob: Job? = null

    var isRunning: Boolean = false
        private set

    /**
     * Appelé à chaque tick (~500 ms). Retourne true si une frame a été « prise ».
     * STEP 1 : le callback est vide côté UI ; sert à valider le rythme.
     */
    fun start(onCaptureTick: suspend () -> Boolean) {
        if (isRunning) return
        isRunning = true
        loopJob = scope.launch {
            while (isActive && isRunning) {
                onCaptureTick()
                delay(intervalMs)
            }
        }
    }

    fun stop() {
        isRunning = false
        loopJob?.cancel()
        loopJob = null
    }
}
