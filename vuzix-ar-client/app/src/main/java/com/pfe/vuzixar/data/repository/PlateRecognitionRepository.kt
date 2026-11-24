package com.pfe.vuzixar.data.repository

import android.content.Context
import android.util.Log
import com.pfe.vuzixar.data.api.ApiService
import com.pfe.vuzixar.data.api.RetrofitClient
import com.pfe.vuzixar.data.api.model.RecognizePlateResponse
import com.pfe.vuzixar.data.network.PiConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * OCR via HTTP natif (même chemin que /health), repli Retrofit si besoin.
 */
class PlateRecognitionRepository(
    private val context: Context,
    private val api: ApiService,
) {

    suspend fun recognizePlate(jpegBytes: ByteArray): Result<RecognizePlateResponse> =
        withContext(Dispatchers.IO) {
            PiConnection.postRecognizePlate(context, jpegBytes)
                .onSuccess { payload ->
                    Log.i(
                        TAG,
                        "Pi /recognize_plate: detected=${payload.detected} display=${payload.display} " +
                            "matricule=${payload.matricule} vehicleStatus=${payload.vehicleStatus} " +
                            "lookupErr=${payload.vehicleLookupError} conf=${payload.confidence}",
                    )
                }
                .onFailure { nativeErr ->
                    Log.w(TAG, "OCR natif échoué, repli Retrofit: ${nativeErr.message}")
                }
                .recoverCatching {
                    val url = RetrofitClient.recognizePlateUrl()
                    Log.i(TAG, "POST Retrofit $url | jpeg=${jpegBytes.size}")
                    val body = jpegBytes.toRequestBody(MEDIA_TYPE_JPEG)
                    val part = MultipartBody.Part.createFormData(FORM_FIELD_FILE, FILE_NAME, body)
                    val response = api.recognizePlate(part)
                    if (!response.isSuccessful) {
                        error("HTTP ${response.code()} ${response.message()}")
                    }
                    response.body() ?: error("Corps JSON vide")
                }
        }

    companion object {
        private const val TAG = "VuzixAR/Repo"
        private val MEDIA_TYPE_JPEG = "image/jpeg".toMediaType()
        private const val FORM_FIELD_FILE = "file"
        private const val FILE_NAME = "vuzix_frame.jpg"
    }
}
