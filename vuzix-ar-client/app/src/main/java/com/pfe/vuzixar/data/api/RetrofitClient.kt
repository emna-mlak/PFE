package com.pfe.vuzixar.data.api

import android.content.Context
import android.util.Log
import com.pfe.vuzixar.BuildConfig
import com.pfe.vuzixar.data.config.NetworkConfig
import com.pfe.vuzixar.data.network.PiHttpLoggingInterceptor
import com.pfe.vuzixar.data.network.PiNetworkBinder
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object RetrofitClient {

    private const val TAG = "VuzixAR/Retrofit"

    private lateinit var retrofit: Retrofit
    private lateinit var baseHttpUrl: HttpUrl
    private var appContext: Context? = null

    val api: ApiService
        get() = retrofit.create(ApiService::class.java)

    val baseUrlString: String
        get() = if (::baseHttpUrl.isInitialized) baseHttpUrl.toString() else NetworkConfig.DEFAULT_PI_BASE_URL

    fun healthUrl(): String = NetworkConfig.resolveEndpoint(baseHttpUrl, NetworkConfig.HEALTH_PATH)

    fun recognizePlateUrl(): String =
        NetworkConfig.resolveEndpoint(baseHttpUrl, NetworkConfig.RECOGNIZE_PLATE_PATH)

    fun prepare(context: Context) {
        appContext = context.applicationContext
        PiNetworkBinder.unbindProcess(context.applicationContext)
        val resolved = BuildConfig.PI_BASE_URL
        if (!::baseHttpUrl.isInitialized || baseHttpUrl.toString() != NetworkConfig.normalizePiBaseUrl(resolved).toString()) {
            init(context.applicationContext, resolved)
        }
    }

    fun rebindWifiIfNeeded() {
        appContext?.let { PiNetworkBinder.unbindProcess(it) }
    }

    fun init(context: Context, baseUrlRaw: String = NetworkConfig.DEFAULT_PI_BASE_URL) {
        appContext = context.applicationContext
        baseHttpUrl = NetworkConfig.normalizePiBaseUrl(baseUrlRaw)
        PiNetworkBinder.unbindProcess(context.applicationContext)

        val piLog = PiHttpLoggingInterceptor()
        val okhttpLog = HttpLoggingInterceptor { message -> Log.d("VuzixAR/OkHttp", message) }.apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.HEADERS
            } else {
                HttpLoggingInterceptor.Level.BASIC
            }
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(piLog)
            .addInterceptor(okhttpLog)
            .build()

        retrofit = Retrofit.Builder()
            .baseUrl(baseHttpUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        Log.i(TAG, "Retrofit | base=$baseHttpUrl | GET ${healthUrl()}")
    }
}
