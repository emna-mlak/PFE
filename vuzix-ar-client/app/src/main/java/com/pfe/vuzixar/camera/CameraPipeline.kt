package com.pfe.vuzixar.camera

import androidx.camera.core.ImageCapture
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class CameraPipeline {
    val frameStore = JpegFrameStore()
    val captureActive = AtomicBoolean(false)
    val framesEncoded = AtomicInteger(0)
    val imageCaptureRef = AtomicReference<ImageCapture?>(null)
    val analyzer = PlateAnalysisAnalyzer(frameStore, captureActive, framesEncoded)
}
