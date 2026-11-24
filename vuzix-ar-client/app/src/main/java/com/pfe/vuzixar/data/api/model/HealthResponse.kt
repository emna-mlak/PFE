package com.pfe.vuzixar.data.api.model

import com.google.gson.annotations.SerializedName

/**
 * Réponse de GET /health (contrat FastAPI existant sur la Pi).
 */
data class HealthResponse(
    @SerializedName("status")
    val status: String? = null,
    @SerializedName("alerts_connected_clients")
    val alertsConnectedClients: Int? = null,
    @SerializedName("camera_mjpeg_enabled")
    val cameraMjpegEnabled: Boolean? = null,
    @SerializedName("plate_ocr_pipeline_ready")
    val plateOcrPipelineReady: Boolean? = null,
    @SerializedName("ocr_pipeline_revision")
    val ocrPipelineRevision: String? = null,
)
