package com.pfe.vuzixar.camera

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.pfe.vuzixar.data.config.CaptureConfig
/**
 * Filtre netteté + recadrage centre pour améliorer la lecture plaque côté Pi.
 */
object FrameQuality {

    private const val TAG = "VuzixAR/Quality"

    data class Result(
        val jpeg: ByteArray,
        val sharpness: Double,
        val cropped: Boolean,
    )

    /** Décode, recadre optionnel, vérifie netteté, ré-encode JPEG. */
    fun prepareForOcr(jpeg: ByteArray, bypassSharpness: Boolean = false): Result? {
        val decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return null
        val ratio = CaptureConfig.CENTER_CROP_RATIO
        val cropped = if (ratio >= 0.99f) decoded else centerCrop(decoded, ratio)
        if (cropped !== decoded) decoded.recycle()

        val sharpness = laplacianVariance(cropped)
        if (!bypassSharpness && sharpness < CaptureConfig.MIN_SHARPNESS_SCORE) {
            Log.d(TAG, "frame rejetée (floue): sharpness=${"%.1f".format(sharpness)}")
            cropped.recycle()
            return null
        }

        // Image déjà nette : éviter une double compression JPEG.
        if (ratio >= 0.99f && (bypassSharpness || sharpness >= CaptureConfig.MIN_SHARPNESS_SCORE)) {
            return Result(jpeg = jpeg, sharpness = sharpness, cropped = false)
        }

        val out = java.io.ByteArrayOutputStream()
        cropped.compress(Bitmap.CompressFormat.JPEG, CaptureConfig.JPEG_QUALITY, out)
        cropped.recycle()
        return Result(
            jpeg = out.toByteArray(),
            sharpness = sharpness,
            cropped = ratio < 0.99f,
        )
    }

    private fun centerCrop(source: Bitmap, ratio: Float): Bitmap {
        val r = ratio.coerceIn(0.5f, 1f)
        val cropW = (source.width * r).toInt()
        val cropH = (source.height * r).toInt()
        if (cropW >= source.width && cropH >= source.height) return source
        val left = (source.width - cropW) / 2
        val top = (source.height - cropH) / 2
        return Bitmap.createBitmap(source, left, top, cropW, cropH)
    }

    /** Score de netteté — plus haut = plus net. */
    private fun laplacianVariance(bitmap: Bitmap): Double {
        val w = bitmap.width
        val h = bitmap.height
        if (w < 3 || h < 3) return 0.0

        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)

        var sum = 0.0
        var sumSq = 0.0
        var count = 0

        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val c = gray(pixels[y * w + x])
                val lap = 4 * c -
                    gray(pixels[(y - 1) * w + x]) -
                    gray(pixels[(y + 1) * w + x]) -
                    gray(pixels[y * w + (x - 1)]) -
                    gray(pixels[y * w + (x + 1)])
                sum += lap
                sumSq += lap * lap
                count++
            }
        }
        if (count == 0) return 0.0
        val mean = sum / count
        return sumSq / count - mean * mean
    }

    private fun gray(argb: Int): Double {
        val r = (argb shr 16) and 0xFF
        val g = (argb shr 8) and 0xFF
        val b = argb and 0xFF
        return 0.299 * r + 0.587 * g + 0.114 * b
    }
}
