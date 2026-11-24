package com.pfe.vuzixar.camera

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Log
import androidx.camera.core.ImageProxy
import com.pfe.vuzixar.data.config.CaptureConfig
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * Convertit une frame CameraX en JPEG compressé (640×480 cible).
 * Exécuter hors du thread UI (thread analyseur CameraX).
 */
object FrameEncoder {

    private const val TAG = "VuzixAR/Encoder"

    fun encodeToJpeg(imageProxy: ImageProxy): ByteArray? {
        return try {
            when (imageProxy.format) {
                ImageFormat.JPEG -> imageProxy.planes[0].buffer.toByteArray()
                else -> rgbaOrYuvToJpeg(imageProxy)
            }
        } catch (e: Exception) {
            Log.w(TAG, "encode failed: ${e.message}")
            null
        }
    }

    private fun rgbaOrYuvToJpeg(imageProxy: ImageProxy): ByteArray? {
        val bitmap = imageProxy.toBitmap() ?: return null
        val targetW = CaptureConfig.previewResolution.width
        val targetH = CaptureConfig.previewResolution.height
        val scaled = if (bitmap.width > targetW || bitmap.height > targetH) {
            Bitmap.createScaledBitmap(bitmap, targetW, targetH, true).also {
                if (it !== bitmap) bitmap.recycle()
            }
        } else {
            bitmap
        }
        return ByteArrayOutputStream().use { stream ->
            scaled.compress(Bitmap.CompressFormat.JPEG, CaptureConfig.JPEG_QUALITY, stream)
            if (scaled !== bitmap) scaled.recycle()
            stream.toByteArray()
        }
    }

    private fun ImageProxy.toBitmap(): Bitmap? {
        return when (format) {
            ImageFormat.YUV_420_888 -> yuv420ToBitmap()
            else -> rgba8888ToBitmap()
        }
    }

    private fun ImageProxy.rgba8888ToBitmap(): Bitmap? {
        val plane = planes.firstOrNull() ?: return null
        val buffer: ByteBuffer = plane.buffer.duplicate()
        buffer.rewind()
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width
        val bmpWidth = width + rowPadding / pixelStride
        val bitmap = Bitmap.createBitmap(bmpWidth, height, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(buffer)
        return if (bmpWidth == width) {
            bitmap
        } else {
            Bitmap.createBitmap(bitmap, 0, 0, width, height).also { bitmap.recycle() }
        }
    }

    private fun ImageProxy.yuv420ToBitmap(): Bitmap? {
        val nv21 = yuv420888ToNv21() ?: return null
        val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        if (!yuv.compressToJpeg(Rect(0, 0, width, height), CaptureConfig.JPEG_QUALITY, out)) {
            return null
        }
        val jpegBytes = out.toByteArray()
        return BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
    }

    private fun ImageProxy.yuv420888ToNv21(): ByteArray? {
        val yPlane = planes.getOrNull(0) ?: return null
        val uPlane = planes.getOrNull(1) ?: return null
        val vPlane = planes.getOrNull(2) ?: return null
        val ySize = yPlane.buffer.remaining()
        val uvSize = width * height / 2
        val nv21 = ByteArray(ySize + uvSize)
        yPlane.buffer.get(nv21, 0, ySize)
        val chromaHeight = height / 2
        val chromaWidth = width / 2
        var offset = ySize
        for (row in 0 until chromaHeight) {
            for (col in 0 until chromaWidth) {
                val vuIndex = row * vPlane.rowStride + col * vPlane.pixelStride
                nv21[offset++] = vPlane.buffer.get(vuIndex)
                nv21[offset++] = uPlane.buffer.get(vuIndex)
            }
        }
        return nv21
    }

    private fun ByteBuffer.toByteArray(): ByteArray {
        rewind()
        val bytes = ByteArray(remaining())
        get(bytes)
        return bytes
    }
}
