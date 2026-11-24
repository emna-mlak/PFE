package com.pfe.vuzixar.ui.model

import com.pfe.vuzixar.data.api.model.RecognizePlateResponse

/**
 * Texte HUD — le statut vient UNIQUEMENT de la Pi (vehicleStatus), jamais inventé côté app.
 */
data class PlateHudDisplay(
    val plateLine: String,
    val statusLine: String,
    val rawStatus: String?,
    val detected: Boolean,
    val confidence: Double? = null,
    val lastError: String? = null,
) {
    companion object {
        fun fromResponse(response: RecognizePlateResponse): PlateHudDisplay {
            val plate = response.display
                ?.takeIf { it.isNotBlank() }
                ?: response.matricule?.takeIf { it.isNotBlank() }
                ?: "—"

            // Ne JAMAIS afficher « OK » par défaut : uniquement ce que renvoie la Pi.
            val statusKey = when {
                !response.vehicleStatus.isNullOrBlank() ->
                    response.vehicleStatus.trim()
                !response.vehicleLookupError.isNullOrBlank() ->
                    "indisponible"
                response.detected ->
                    "statut_inconnu"
                else ->
                    "aucune_detection"
            }

            val lookupHint = response.vehicleLookupError?.takeIf { it.isNotBlank() }

            return PlateHudDisplay(
                plateLine = plate,
                statusLine = formatStatusLabel(statusKey),
                rawStatus = statusKey,
                detected = response.detected,
                confidence = response.confidence,
                lastError = lookupHint,
            )
        }

        fun noDetection(): PlateHudDisplay = PlateHudDisplay(
            plateLine = "—",
            statusLine = "AUCUNE PLAQUE",
            rawStatus = "aucune_detection",
            detected = false,
        )

        fun networkError(message: String): PlateHudDisplay = PlateHudDisplay(
            plateLine = "—",
            statusLine = "ERREUR RÉSEAU",
            rawStatus = null,
            detected = false,
            lastError = message,
        )

        private fun formatStatusLabel(status: String): String = when (status.lowercase()) {
            "vehicule_recherche" -> "VÉHICULE RECHERCHÉ"
            "vignette_impayee" -> "VIGNETTE IMPAYÉE"
            "ok" -> "OK"
            "indisponible" -> "STATUT INDISPONIBLE"
            "statut_inconnu" -> "PLAQUE LUE — STATUT INCONNU"
            "non_trouve_base" -> "NON TROUVÉ EN BASE"
            "aucune_detection" -> "AUCUNE PLAQUE"
            else -> status.replace('_', ' ').uppercase()
        }
    }
}
