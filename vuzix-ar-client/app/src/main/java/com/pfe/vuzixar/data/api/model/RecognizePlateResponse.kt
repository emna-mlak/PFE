package com.pfe.vuzixar.data.api.model

import com.google.gson.annotations.SerializedName

/**
 * Réponse réelle de POST /recognize_plate (contrat FastAPI Pi existant).
 */
data class RecognizePlateResponse(
    @SerializedName("detected")
    val detected: Boolean = false,
    @SerializedName("matricule")
    val matricule: String? = null,
    @SerializedName("display")
    val display: String? = null,
    @SerializedName("confidence")
    val confidence: Double? = null,
    @SerializedName("vehicleStatus")
    val vehicleStatus: String? = null,
    @SerializedName("vehicleLookupError")
    val vehicleLookupError: String? = null,
    @SerializedName("dashboardPublished")
    val dashboardPublished: Boolean? = null,
)
