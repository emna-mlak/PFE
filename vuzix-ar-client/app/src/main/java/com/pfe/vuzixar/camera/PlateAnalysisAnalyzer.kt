package com.pfe.vuzixar.camera

import android.os.SystemClock
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.pfe.vuzixar.data.config.CaptureConfig
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Analyseur CameraX : encode au plus ~2 FPS quand la boucle pseudo-stream est active.
 */
class PlateAnalysisAnalyzer(
    private val frameStore: JpegFrameStore,
    private val captureActive: AtomicBoolean,
    private val framesEncoded: java.util.concurrent.atomic.AtomicInteger,
) : ImageAnalysis.Analyzer {

    private var lastEncodeElapsedMs = 0L

    override fun analyze(imageProxy: ImageProxy) {
        if (!captureActive.get()) {
            imageProxy.close()
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastEncodeElapsedMs < CaptureConfig.MIN_ENCODE_INTERVAL_MS) {
            imageProxy.close()
            return
        }

        val jpeg = FrameEncoder.encodeToJpeg(imageProxy)
        imageProxy.close()

        if (jpeg != null) {
            lastEncodeElapsedMs = now
            frameStore.update(jpeg)
            framesEncoded.incrementAndGet()
            Log.i(TAG, "frame #${framesEncoded.get()}: ${jpeg.size} bytes")
        } else {
            Log.w(TAG, "encode failed format=${imageProxy.format} ${imageProxy.width}x${imageProxy.height}")
        }
    }

    companion object {
        private const val TAG = "VuzixAR/Analyzer"
    }
}
