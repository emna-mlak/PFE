package com.pfe.vuzixar.data.network

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.pfe.vuzixar.BuildConfig
import com.pfe.vuzixar.data.api.model.HealthResponse
import com.pfe.vuzixar.data.api.model.RecognizePlateResponse
import com.pfe.vuzixar.data.config.NetworkConfig
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Plusieurs stratégies de connexion (route par défaut puis Wi‑Fi lié).
 * URL fixe [BuildConfig.PI_BASE_URL] — pas de dépendance au SSID affiché.
 */
object PiConnection {

    private const val TAG = "VuzixAR/Connection"
    private val gson = Gson()

    data class ProbeResult(
        val strategy: String,
        val baseUrl: String,
        val healthUrl: String,
        val tcpOk: Boolean,
        val httpCode: Int?,
        val bodySnippet: String?,
        val error: String?,
    )

    suspend fun probeAndGetHealth(context: Context): Result<Pair<HealthResponse, ProbeResult>> =
        withContext(Dispatchers.IO) {
            val app = context.applicationContext
            val snap = PiGatewayResolver.snapshot(app)
            val baseUrl = NetworkConfig.normalizePiBaseUrl(BuildConfig.PI_BASE_URL).toString()
            val healthUrl = "${baseUrl}health"
            val host = URL(baseUrl).host
            val port = if (URL(baseUrl).port != -1) URL(baseUrl).port else 8000

            Log.i(TAG, "Probe | ${PiGatewayResolver.formatDiagnostics(snap)}")
            Log.i(TAG, "Cible fixe: GET $healthUrl")

            val failures = mutableListOf<String>()

            // 1) Route par défaut (souvent la bonne si seul le hotspot Pi est actif)
            PiNetworkBinder.unbindProcess(app)
            tryStrategy(
                name = "default_route",
                healthUrl = healthUrl,
                baseUrl = baseUrl,
                tcp = { tcpProbeDefault(host, port) },
                http = { httpGetDefault(healthUrl) },
            )?.let { return@withContext Result.success(it) }
                ?: failures.add("default_route échoué")

            // 2) Processus lié au Wi‑Fi
            val wifi = PiNetworkBinder.bindProcessToWifi(app)
            if (wifi != null) {
                tryStrategy(
                    name = "wifi_bound",
                    healthUrl = healthUrl,
                    baseUrl = baseUrl,
                    tcp = { tcpProbeBound(wifi, host, port) },
                    http = { httpGetBound(wifi, healthUrl) },
                )?.let { return@withContext Result.success(it) }
                    ?: failures.add("wifi_bound échoué")
            } else {
                failures.add("pas de réseau Wi‑Fi pour bind")
            }

            Result.failure(
                IOException(
                    failures.joinToString(" | ") + " | " + PiGatewayResolver.formatDiagnostics(snap),
                ),
            )
        }

    private fun tryStrategy(
        name: String,
        healthUrl: String,
        baseUrl: String,
        tcp: () -> Boolean,
        http: () -> Pair<Int, String>?,
    ): Pair<HealthResponse, ProbeResult>? {
        Log.i(TAG, "=== Stratégie: $name ===")
        if (!tcp()) {
            Log.w(TAG, "$name: TCP KO")
            return null
        }
        val httpResult = http() ?: run {
            Log.w(TAG, "$name: HTTP KO")
            return null
        }
        val (code, body) = httpResult
        Log.i(TAG, "$name: HTTP $code body=${body.take(100)}")

        val probe = ProbeResult(
            strategy = name,
            baseUrl = baseUrl,
            healthUrl = healthUrl,
            tcpOk = true,
            httpCode = code,
            bodySnippet = body.take(200),
            error = if (code !in 200..299) "HTTP $code" else null,
        )

        if (code !in 200..299) return null

        val health = gson.fromJson(body, HealthResponse::class.java) ?: return null
        return health to probe
    }

    private fun tcpProbeDefault(host: String, port: Int): Boolean =
        try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, port), 10_000)
            }
            Log.i(TAG, "TCP OK (default) $host:$port")
            true
        } catch (e: Exception) {
            Log.e(TAG, "TCP FAIL (default) $host:$port — ${e.message}", e)
            false
        }

    private fun tcpProbeBound(network: android.net.Network, host: String, port: Int): Boolean =
        try {
            Socket().use { socket ->
                network.bindSocket(socket)
                socket.connect(InetSocketAddress(host, port), 10_000)
            }
            Log.i(TAG, "TCP OK (wifi) $host:$port")
            true
        } catch (e: Exception) {
            Log.e(TAG, "TCP FAIL (wifi) $host:$port — ${e.message}", e)
            false
        }

    private fun httpGetDefault(healthUrl: String): Pair<Int, String>? =
        try {
            val conn = URL(healthUrl).openConnection() as HttpURLConnection
            readHttp(conn)
        } catch (e: Exception) {
            Log.e(TAG, "HTTP FAIL (default) $healthUrl — ${e.message}", e)
            null
        }

    private fun httpGetBound(network: android.net.Network, healthUrl: String): Pair<Int, String>? =
        try {
            val conn = network.openConnection(URL(healthUrl)) as HttpURLConnection
            readHttp(conn)
        } catch (e: Exception) {
            Log.e(TAG, "HTTP FAIL (wifi) $healthUrl — ${e.message}", e)
            null
        }

    private fun readHttp(conn: HttpURLConnection): Pair<Int, String> {
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        conn.requestMethod = "GET"
        conn.useCaches = false
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        return code to body
    }

    /** POST /recognize_plate — même stratégie réseau que /health (route par défaut puis Wi‑Fi). */
    suspend fun postRecognizePlate(context: Context, jpegBytes: ByteArray): Result<RecognizePlateResponse> =
        withContext(Dispatchers.IO) {
            val app = context.applicationContext
            val baseUrl = NetworkConfig.normalizePiBaseUrl(BuildConfig.PI_BASE_URL).toString()
            val url = "${baseUrl}recognize_plate"
            Log.i(TAG, "POST $url | jpeg=${jpegBytes.size} bytes")

            PiNetworkBinder.unbindProcess(app)
            postMultipartDefault(url, jpegBytes)?.let { return@withContext Result.success(it) }

            val wifi = PiNetworkBinder.bindProcessToWifi(app)
            if (wifi != null) {
                postMultipartBound(wifi, url, jpegBytes)?.let { return@withContext Result.success(it) }
            }

            Result.failure(IOException("POST recognize_plate échoué (default + wifi)"))
        }

    private fun postMultipartDefault(url: String, jpeg: ByteArray): RecognizePlateResponse? =
        try {
            val conn = URL(url).openConnection() as HttpURLConnection
            val (code, body) = writeMultipart(conn, jpeg)
            parseRecognizeResponse(code, body, url)
        } catch (e: Exception) {
            Log.e(TAG, "POST FAIL (default) $url — ${e.message}", e)
            null
        }

    private fun postMultipartBound(
        network: android.net.Network,
        url: String,
        jpeg: ByteArray,
    ): RecognizePlateResponse? =
        try {
            val conn = network.openConnection(URL(url)) as HttpURLConnection
            val (code, body) = writeMultipart(conn, jpeg)
            parseRecognizeResponse(code, body, url)
        } catch (e: Exception) {
            Log.e(TAG, "POST FAIL (wifi) $url — ${e.message}", e)
            null
        }

    private fun writeMultipart(conn: HttpURLConnection, jpeg: ByteArray): Pair<Int, String> {
        val boundary = "----Vuzix${System.currentTimeMillis()}"
        conn.doOutput = true
        conn.doInput = true
        conn.connectTimeout = 15_000
        conn.readTimeout = 120_000
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        conn.useCaches = false

        conn.outputStream.buffered().use { out ->
            out.write("--$boundary\r\n".toByteArray())
            out.write("Content-Disposition: form-data; name=\"file\"; filename=\"vuzix_frame.jpg\"\r\n".toByteArray())
            out.write("Content-Type: image/jpeg\r\n\r\n".toByteArray())
            out.write(jpeg)
            out.write("\r\n--$boundary--\r\n".toByteArray())
        }

        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        Log.i(TAG, "POST multipart → HTTP $code body=${body.take(150)}")
        return code to body
    }

    private fun parseRecognizeResponse(code: Int, body: String, url: String): RecognizePlateResponse? {
        if (code !in 200..299) {
            Log.w(TAG, "POST $url HTTP $code: ${body.take(80)}")
            return null
        }
        return gson.fromJson(body, RecognizePlateResponse::class.java)
    }
}
