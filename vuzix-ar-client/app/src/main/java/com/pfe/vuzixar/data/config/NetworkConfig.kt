package com.pfe.vuzixar.data.config

import android.util.Log
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Constantes réseau pour l'approche 3 (lunettes → Pi hotspot).
 *
 * La Pi expose FastAPI sur le gateway du hotspot : 10.42.0.1:8000
 */
object NetworkConfig {

    const val DEFAULT_PI_BASE_URL = "http://10.42.0.1:8000/"
    const val HEALTH_PATH = "health"
    const val RECOGNIZE_PLATE_PATH = "recognize_plate"

    /** ~1 FPS : laisse le temps à l'autofocus + upload JPEG HD. */
    const val FRAME_INTERVAL_MS = 1000L

    private const val TAG = "VuzixAR/Network"

    /**
     * Valide et normalise la base URL Retrofit.
     * Résultat attendu : `http://10.42.0.1:8000/` (slash final obligatoire pour Retrofit).
     */
    fun normalizePiBaseUrl(raw: String): HttpUrl {
        var trimmed = raw.trim()
        require(trimmed.isNotEmpty()) { "PI_BASE_URL vide" }
        if (!trimmed.endsWith("/")) {
            trimmed += "/"
        }

        val httpUrl = trimmed.toHttpUrlOrNull()
            ?: throw IllegalArgumentException("PI_BASE_URL invalide (HttpUrl): $raw")

        require(httpUrl.scheme == "http") {
            "PI_BASE_URL doit être en http:// (cleartext hotspot), reçu: ${httpUrl.scheme}"
        }

        Log.i(
            TAG,
            "Base URL validée: scheme=${httpUrl.scheme} host=${httpUrl.host} port=${httpUrl.port} " +
                "path=${httpUrl.encodedPath} → $httpUrl",
        )

        return httpUrl
    }

    fun resolveEndpoint(base: HttpUrl, path: String): String {
        val cleanPath = path.trimStart('/')
        return base.resolve(cleanPath)?.toString()
            ?: throw IllegalStateException("Impossible de résoudre $path depuis $base")
    }
}
