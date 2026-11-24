package com.pfe.vuzixar.data.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.util.Log
import java.net.InetAddress
import okhttp3.Dns

/**
 * Liaison optionnelle au Wi‑Fi. Sur Vuzix, un mauvais bind peut casser la route par défaut.
 */
object PiNetworkBinder {

    private const val TAG = "VuzixAR/Network"

    fun unbindProcess(context: Context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        cm.bindProcessToNetwork(null)
        Log.i(TAG, "bindProcessToNetwork(null) — route par défaut")
    }

    fun findWifiNetwork(context: Context): Network? {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val active = cm.activeNetwork
        if (active != null) {
            val caps = cm.getNetworkCapabilities(active)
            if (caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) {
                Log.i(TAG, "Wi‑Fi (activeNetwork): $active")
                return active
            }
        }

        @Suppress("DEPRECATION")
        for (network in cm.allNetworks) {
            val caps = cm.getNetworkCapabilities(network) ?: continue
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                Log.i(TAG, "Wi‑Fi (allNetworks): $network")
                return network
            }
        }
        Log.w(TAG, "Aucun réseau Wi‑Fi détecté par ConnectivityManager")
        return null
    }

    fun bindProcessToWifi(context: Context): Network? {
        val network = findWifiNetwork(context) ?: return null
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val bound = cm.bindProcessToNetwork(network)
        Log.i(TAG, "bindProcessToNetwork(wifi)=$bound network=$network")
        return network
    }

    fun wifiDns(network: Network?): Dns {
        val wifi = network ?: return Dns.SYSTEM
        return object : Dns {
            override fun lookup(hostname: String): List<InetAddress> {
                return wifi.getAllByName(hostname).toList()
            }
        }
    }
}
