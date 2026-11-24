package com.pfe.vuzixar.data.api

import com.pfe.vuzixar.data.api.model.HealthResponse
import com.pfe.vuzixar.data.api.model.RecognizePlateResponse
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

/**
 * Contrat HTTP vers la Raspberry Pi — endpoints existants uniquement.
 */
interface ApiService {

    @GET("health")
    suspend fun getHealth(): Response<HealthResponse>

    @Multipart
    @POST("recognize_plate")
    suspend fun recognizePlate(
        @Part file: MultipartBody.Part,
    ): Response<RecognizePlateResponse>
}
