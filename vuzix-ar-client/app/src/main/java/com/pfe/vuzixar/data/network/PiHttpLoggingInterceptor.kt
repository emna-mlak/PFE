package com.pfe.vuzixar.data.network

import android.util.Log
import java.io.IOException
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Logs URL complète, durée et erreurs TCP/HTTP (tag logcat VuzixAR).
 */
class PiHttpLoggingInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val startNs = System.nanoTime()
        Log.i(TAG, "--> ${request.method} ${request.url}")
        request.headers.forEach { (name, value) ->
            if (name.equals("Authorization", ignoreCase = true)) return@forEach
            Log.d(TAG, "    $name: $value")
        }

        return try {
            val response = chain.proceed(request)
            val tookMs = (System.nanoTime() - startNs) / 1_000_000
            Log.i(TAG, "<-- ${response.code} ${request.url} (${tookMs}ms)")
            response
        } catch (e: IOException) {
            val tookMs = (System.nanoTime() - startNs) / 1_000_000
            Log.e(TAG, "<-- ERREUR ${request.url} (${tookMs}ms): ${e.message}", e)
            throw e
        }
    }

    companion object {
        private const val TAG = "VuzixAR/Http"
    }
}
