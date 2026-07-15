package com.rork.ivxholdings.data.remote

import com.rork.ivxholdings.data.model.AgentsResponse
import com.rork.ivxholdings.data.model.HealthResponse
import com.rork.ivxholdings.data.model.InventoryResponse
import com.rork.ivxholdings.data.model.OwnerAIRequestBody
import com.rork.ivxholdings.data.model.OwnerAIRequestResponse
import com.rork.ivxholdings.data.model.OwnerAIStatusResponse
import com.rork.ivxholdings.data.model.PasswordlessLoginRequest
import com.rork.ivxholdings.data.model.PasswordlessLoginResponse
import com.rork.ivxholdings.data.model.VercelExitDashboard
import com.rork.ivxholdings.data.model.VersionResponse
import com.rork.ivxholdings.util.AppConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.ANDROID
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.logging.LoggingConfig
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

class IVXApiService {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val client = HttpClient(Android) {
        install(ContentNegotiation) { json(json) }
        install(Logging) {
            logger = Logger.ANDROID
            level = LogLevel.INFO
        }
        defaultRequest {
            url(AppConfig.API_BASE_URL)
            contentType(ContentType.Application.Json)
        }
        expectSuccess = false
    }

    private var authToken: String? = null

    fun setAuthToken(token: String?) {
        authToken = token
    }

    fun clearAuthToken() {
        authToken = null
    }

    suspend fun passwordlessLogin(email: String): Result<PasswordlessLoginResponse> = safeCall {
        client.post(AppConfig.OWNER_PASSWORDLESS_LOGIN_PATH) {
            setBody(PasswordlessLoginRequest(email))
        }.body()
    }

    suspend fun fetchDashboard(): Result<VercelExitDashboard> = authorizedCall {
        client.get(AppConfig.VERCEL_EXIT_DASHBOARD_PATH) {
            authHeader()
        }.body()
    }

    suspend fun fetchAgents(): Result<AgentsResponse> = authorizedCall {
        client.get(AppConfig.VERCEL_EXIT_AGENTS_PATH) {
            authHeader()
        }.body()
    }

    suspend fun fetchInventory(): Result<InventoryResponse> = authorizedCall {
        client.get(AppConfig.VERCEL_EXIT_INVENTORY_PATH) {
            authHeader()
        }.body()
    }

    suspend fun requestOwnerAI(message: String): Result<OwnerAIRequestResponse> = authorizedCall {
        client.post(AppConfig.OWNER_AI_REQUEST_PATH) {
            authHeader()
            setBody(OwnerAIRequestBody(message = message))
        }.body()
    }

    suspend fun fetchOwnerAIStatus(traceId: String): Result<OwnerAIStatusResponse> = authorizedCall {
        client.get("${AppConfig.OWNER_AI_REQUEST_PATH}/$traceId/status") {
            authHeader()
        }.body()
    }

    suspend fun fetchHealth(): Result<HealthResponse> = safeCall {
        client.get(AppConfig.HEALTH_PATH).body()
    }

    suspend fun fetchVersion(): Result<VersionResponse> = safeCall {
        client.get(AppConfig.VERSION_PATH).body()
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authHeader() {
        authToken?.let { header("Authorization", "Bearer $it") }
    }

    private suspend inline fun <reified T> authorizedCall(call: suspend () -> T): Result<T> {
        if (authToken == null) return Result.failure(UnauthorizedException("No session token. Please log in."))
        return safeCall(call)
    }

    private suspend inline fun <reified T> safeCall(call: suspend () -> T): Result<T> {
        return try {
            Result.success(call())
        } catch (e: ClientRequestException) {
            val body = try { e.response.bodyAsText() } catch (_: Exception) { "" }
            Result.failure(ApiException(e.response.status.value, body, e))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    class UnauthorizedException(message: String) : Exception(message)
    class ApiException(val statusCode: Int, val body: String, cause: Throwable) : Exception("HTTP $statusCode: $body", cause)
}
