package com.pfe.vuzixar.data.network

import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.pfe.vuzixar.data.config.NetworkConfig
import java.util.Locale

object PiGatewayResolver {

    private const val TAG = "VuzixAR/Network"
    private const val API_PORT = 8000

    data class WifiSnapshot(
        val gateway: String?,
        val localIp: String?,
        val ssid: String?,
        val wifiNetwork: Network?,
        val locationPermissionGranted: Boolean,
        val locationServicesEnabled: Boolean,
    )

    fun snapshot(context: Context): WifiSnapshot {
        val app = context.applicationContext
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val wifiNetwork = PiNetworkBinder.findWifiNetwork(app)
        val link = wifiNetwork?.let { cm.getLinkProperties(it) }

        val locGranted = hasLocationPermission(app)
        val locOn = isLocationEnabled(app)

        val gateway = if (locGranted) {
            link?.routes?.firstOrNull { it.isDefaultRoute }?.gateway?.hostAddress
                ?: readLegacyDhcpGateway(app)
        } else {
            null
        }

        val localIp = if (locGranted) {
            link?.linkAddresses
                ?.firstOrNull { it.address.hostAddress?.contains('.') == true }
                ?.address?.hostAddress
                ?: readLegacyLocalIp(app)
        } else {
            null
        }

        val ssid = if (locGranted) readSsid(app) else "<permission requise>"

        Log.i(
            TAG,
            "snapshot: ssid=$ssid ip=$localIp gw=$gateway locPerm=$locGranted locOn=$locOn",
        )

        return WifiSnapshot(
            gateway = gateway,
            localIp = localIp,
            ssid = ssid,
            wifiNetwork = wifiNetwork,
            locationPermissionGranted = locGranted,
            locationServicesEnabled = locOn,
        )
    }

    fun resolveBaseUrl(context: Context): String {
        val gateway = snapshot(context).gateway?.takeIf { it.isNotBlank() && it != "0.0.0.0" }
        return if (gateway != null) {
            "http://$gateway:$API_PORT/"
        } else {
            NetworkConfig.DEFAULT_PI_BASE_URL
        }
    }

    fun formatDiagnostics(snap: WifiSnapshot): String {
        return buildString {
            append("Wi‑Fi: ${snap.ssid ?: "?"}")
            append(" | IP lunettes: ${snap.localIp ?: "?"}")
            append(" | Gateway: ${snap.gateway ?: "10.42.0.1 (défaut)"}")
            if (!snap.locationPermissionGranted) {
                append(" | ⚠ Autoriser POSITION dans Réglages")
            } else if (!snap.locationServicesEnabled) {
                append(" | ⚠ Activer GPS/localisation système")
            }
        }
    }

    private fun hasLocationPermission(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    private fun isLocationEnabled(context: Context): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            lm.isLocationEnabled
        } else {
            @Suppress("DEPRECATION")
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
    }

    @Suppress("DEPRECATION")
    private fun readLegacyDhcpGateway(context: Context): String? {
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val dhcp = wm.dhcpInfo ?: return null
        return intToIp(dhcp.gateway).takeIf { it != "0.0.0.0" }
    }

    @Suppress("DEPRECATION")
    private fun readLegacyLocalIp(context: Context): String? {
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val dhcp = wm.dhcpInfo ?: return null
        return intToIp(dhcp.ipAddress).takeIf { it != "0.0.0.0" }
    }

    @Suppress("DEPRECATION")
    private fun readSsid(context: Context): String? {
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val info = wm.connectionInfo ?: return null
        val raw = info.ssid ?: return null
        return raw.trim('"').takeIf { it.isNotBlank() && !raw.contains("unknown", true) }
    }

    private fun intToIp(value: Int): String {
        return String.format(
            Locale.US,
            "%d.%d.%d.%d",
            value and 0xff,
            value shr 8 and 0xff,
            value shr 16 and 0xff,
            value shr 24 and 0xff,
        )
    }
}
