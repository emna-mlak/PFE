package com.pfe.vuzixar

import android.app.Application
import android.util.Log
import com.pfe.vuzixar.data.api.RetrofitClient

/**
 * Point d'entrée application — initialise le client HTTP vers la Raspberry Pi.
 */
class VuzixArApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "init PI_BASE_URL=${BuildConfig.PI_BASE_URL}")
        RetrofitClient.init(applicationContext, BuildConfig.PI_BASE_URL)
    }

    companion object {
        private const val TAG = "VuzixAR/App"
    }
}
