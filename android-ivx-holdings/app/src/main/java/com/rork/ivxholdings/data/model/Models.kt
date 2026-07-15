package com.rork.ivxholdings.data.model

import kotlinx.serialization.Serializable

@Serializable
data class PasswordlessLoginRequest(val email: String)

@Serializable
data class PasswordlessLoginResponse(
    val success: Boolean,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresAt: Long? = null,
    val userId: String? = null,
    val email: String? = null,
    val message: String? = null,
    val rootCause: String? = null
)

@Serializable
data class OwnerAIRequestBody(
    val message: String,
    val conversationId: String? = null,
    val messageId: String? = null,
    val senderLabel: String = "owner-android"
)

@Serializable
data class OwnerAIRequestResponse(
    val traceId: String,
    val requestId: String,
    val status: String,
    val idempotencyKey: String,
    val duplicate: Boolean,
    val message: String,
    val result: OwnerAIResult? = null
)

@Serializable
data class OwnerAIResult(
    val answer: String? = null,
    val error: String? = null,
    val httpStatus: Int? = null
)

@Serializable
data class OwnerAIStatusResponse(
    val traceId: String,
    val requestId: String,
    val status: String,
    val idempotencyKey: String,
    val retryCount: Int,
    val terminalResult: OwnerAIResult? = null,
    val structuredError: StructuredError? = null
)

@Serializable
data class StructuredError(
    val code: String,
    val message: String,
    val checkpoint: String? = null
)

@Serializable
data class VercelExitDashboard(
    val migrationStatus: String,
    val dependenciesDiscovered: Int,
    val dependenciesRemoved: Int,
    val dependenciesRemaining: Int,
    val overallCompletion: Double,
    val currentPhase: String,
    val vercelTraffic: String,
    val ivxTraffic: String,
    val costBefore: String,
    val costAfter: String,
    val monthlySavings: String,
    val annualSavings: String,
    val ownerControls: OwnerControls? = null
)

@Serializable
data class OwnerControls(
    val migrationPaused: Boolean,
    val deploymentsFrozen: Boolean,
    val cutoverApproved: Boolean,
    val rollbackTriggered: Boolean,
    val lastOwnerAction: String,
    val lastOwnerActionTime: String
)

@Serializable
data class AgentState(
    val agentNumber: Int,
    val agentName: String,
    val role: String,
    val currentTask: String,
    val status: String,
    val progress: Double,
    val filesReserved: List<String> = emptyList(),
    val filesChanged: List<String> = emptyList(),
    val testsExecuted: Int = 0,
    val testResult: String = "pending",
    val lastCommitSha: String? = null,
    val pullRequest: String? = null,
    val productionVerification: Boolean = false,
    val currentBlocker: String? = null,
    val nextAction: String = "",
    val timeWorking: String = "",
    val tasksCompletedToday: Int = 0,
    val tasksFailedToday: Int = 0
)

@Serializable
data class AgentsResponse(
    val agents: List<AgentState>,
    val activeAgents: Int,
    val blockedAgents: Int,
    val completedAgents: Int
)

@Serializable
data class VercelDependency(
    val dependencyId: String,
    val vercelService: String,
    val dependencyType: String,
    val sourceFile: String,
    val lineReference: String,
    val runtimeEnvironment: String,
    val currentPurpose: String,
    val replacementService: String,
    val assignedAI: Int,
    val risk: String,
    val migrationStatus: String,
    val testStatus: String
)

@Serializable
data class InventoryResponse(
    val dependencies: List<VercelDependency>,
    val totalCount: Int,
    val criticalCount: Int,
    val highCount: Int,
    val mediumCount: Int,
    val lowCount: Int
)

@Serializable
data class HealthResponse(
    val status: String,
    val commitShort: String,
    val commitSha: String? = null,
    val routes: List<String> = emptyList()
)

@Serializable
data class VersionResponse(
    val commitShort: String,
    val commitSha: String? = null,
    val bootTime: String? = null
)

@Serializable
data class ApiError(
    val error: String? = null,
    val message: String? = null
)
