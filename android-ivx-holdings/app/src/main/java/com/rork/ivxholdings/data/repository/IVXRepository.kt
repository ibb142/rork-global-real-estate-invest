package com.rork.ivxholdings.data.repository

import com.rork.ivxholdings.data.model.AgentState
import com.rork.ivxholdings.data.model.HealthResponse
import com.rork.ivxholdings.data.model.InventoryResponse
import com.rork.ivxholdings.data.model.OwnerAIRequestResponse
import com.rork.ivxholdings.data.model.VercelDependency
import com.rork.ivxholdings.data.model.VercelExitDashboard
import com.rork.ivxholdings.data.remote.IVXApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

class IVXRepository(private val apiService: IVXApiService) {

    fun setAuthToken(token: String?) = apiService.setAuthToken(token)

    suspend fun login(email: String) = withContext(Dispatchers.IO) {
        apiService.passwordlessLogin(email).onSuccess { response ->
            response.accessToken?.let { apiService.setAuthToken(it) }
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        apiService.clearAuthToken()
    }

    suspend fun fetchDashboard(): Result<VercelExitDashboard> = withContext(Dispatchers.IO) {
        apiService.fetchDashboard()
    }

    suspend fun fetchAgents(): Result<List<AgentState>> = withContext(Dispatchers.IO) {
        apiService.fetchAgents().map { it.agents }
    }

    suspend fun fetchInventory(): Result<InventoryResponse> = withContext(Dispatchers.IO) {
        apiService.fetchInventory()
    }

    suspend fun sendOwnerMessage(message: String): Result<String> = withContext(Dispatchers.IO) {
        apiService.requestOwnerAI(message).map { response ->
            if (response.status == "completed" && response.result != null) {
                response.result.answer ?: "No answer returned."
            } else {
                "Request accepted (traceId: ${response.traceId}). Polling for result..."
            }
        }
    }

    suspend fun fetchHealth(): Result<HealthResponse> = withContext(Dispatchers.IO) {
        apiService.fetchHealth()
    }

    suspend fun fetchVersion(): Result<String> = withContext(Dispatchers.IO) {
        apiService.fetchVersion().map { it.commitShort }
    }
}
