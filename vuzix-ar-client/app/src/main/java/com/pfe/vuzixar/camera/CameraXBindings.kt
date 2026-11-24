package com.pfe.vuzixar.camera

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.pfe.vuzixar.data.config.CaptureConfig
import java.io.File
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

object CameraXBindings {

    private const val TAG = "VuzixAR/Camera"
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private val captureExecutor = Executors.newSingleThreadExecutor()

    data class BindResult(
        val imageCapture: ImageCapture,
        val selectorUsed: CameraSelector,
    )

    suspend fun bindCamera(
        context: Context,
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        analyzer: ImageAnalysis.Analyzer,
    ): BindResult {
        val provider = context.getCameraProvider()
        val selector = resolveCameraSelector(provider)

        val preview = Preview.Builder().build().also {
            it.surfaceProvider = previewView.surfaceProvider
        }

        val imageCapture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setTargetResolution(CaptureConfig.captureResolution)
            .setJpegQuality(CaptureConfig.JPEG_QUALITY)
            .build()

        val imageAnalysis = ImageAnalysis.Builder()
            .setTargetResolution(CaptureConfig.previewResolution)
            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { analysis ->
                analysis.setAnalyzer(analysisExecutor, analyzer)
            }

        provider.unbindAll()
        provider.bindToLifecycle(
            lifecycleOwner,
            selector,
            preview,
            imageCapture,
            imageAnalysis,
        )

        Log.i(
            TAG,
            "Camera liée: selector=$selector preview=${CaptureConfig.previewResolution} " +
                "ocr=${CaptureConfig.captureResolution} q=${CaptureConfig.JPEG_QUALITY}",
        )
        return BindResult(imageCapture, selector)
    }

    /** Capture JPEG directe (fiable sur Vuzix quand ImageAnalysis ne produit rien). */
    suspend fun captureJpeg(context: Context, imageCapture: ImageCapture): ByteArray? =
        suspendCoroutine { cont ->
            val file = File(context.cacheDir, "vuzix_capture_${System.currentTimeMillis()}.jpg")
            val options = ImageCapture.OutputFileOptions.Builder(file).build()
            imageCapture.takePicture(
                options,
                captureExecutor,
                object : ImageCapture.OnImageSavedCallback {
                    override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                        val bytes = runCatching { file.readBytes() }.getOrNull()
                        file.delete()
                        Log.i(TAG, "ImageCapture OK: ${bytes?.size ?: 0} bytes")
                        cont.resume(bytes)
                    }

                    override fun onError(exception: ImageCaptureException) {
                        Log.e(TAG, "ImageCapture FAIL: ${exception.message}", exception)
                        file.delete()
                        cont.resume(null)
                    }
                },
            )
        }

    private fun resolveCameraSelector(provider: ProcessCameraProvider): CameraSelector {
        val candidates = listOf(
            CameraSelector.DEFAULT_BACK_CAMERA,
            CameraSelector.DEFAULT_FRONT_CAMERA,
        )
        for (selector in candidates) {
            if (provider.hasCamera(selector)) {
                Log.i(TAG, "Sélecteur caméra: $selector")
                return selector
            }
        }
        Log.w(TAG, "Fallback DEFAULT_BACK_CAMERA")
        return CameraSelector.DEFAULT_BACK_CAMERA
    }

    private suspend fun Context.getCameraProvider(): ProcessCameraProvider =
        suspendCoroutine { continuation ->
            ProcessCameraProvider.getInstance(this).also { future ->
                future.addListener(
                    { continuation.resume(future.get()) },
                    ContextCompat.getMainExecutor(this),
                )
            }
        }
}
