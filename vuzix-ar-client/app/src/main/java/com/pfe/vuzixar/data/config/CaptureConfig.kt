package com.pfe.vuzixar.data.config

import android.util.Size

/**
 * Paramètres capture lunettes → Pi.
 * Preview léger ; OCR via ImageCapture haute résolution.
 */
object CaptureConfig {
    /** Preview HUD (fluide). */
    val previewResolution = Size(640, 480)

    /** Photo OCR envoyée à la Pi — netteté plaque prioritaire. */
    val captureResolution = Size(1280, 720)

    /** Qualité JPEG OCR (0–100). */
    const val JPEG_QUALITY = 92

    /** ~1 FPS : laisse l'autofocus Vuzix se stabiliser entre deux envois. */
    const val MIN_ENCODE_INTERVAL_MS = 900L

    /**
     * Seuil netteté — Vuzix produit souvent des images plus douces que la Pi.
     * 80 rejetait presque tout → aucun envoi OCR.
     */
    const val MIN_SHARPNESS_SCORE = 25.0

    /** 1.0 = image complète (la plaque est souvent en bas du cadre, pas au centre). */
    const val CENTER_CROP_RATIO = 1.0f

    /** Après N rejets flou, envoi quand même (mieux que silence total). */
    const val BLUR_BYPASS_AFTER_REJECTIONS = 3
}
