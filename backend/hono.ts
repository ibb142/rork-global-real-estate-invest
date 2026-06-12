import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GET, OPTIONS as ownerAIOptions, handleIVXOwnerAIProxyStatus, handleIVXOwnerAIRequest, handleIVXOwnerAIToolRequest } from './api/ivx-owner-ai';
import {
  handleIVXIaMemoryDeleteRequest,
  handleIVXIaMemoryForgetNameRequest,
  handleIVXIaMemoryGreetingRequest,
  handleIVXIaMemoryListRequest,
  handleIVXIaMemoryOptions,
  handleIVXIaMemoryUpsertRequest,
} from './api/ivx-ia-memory';
import { handleIVXOwnerAIDiagnosticsClientEventRequest, handleIVXOwnerAIDiagnosticsGetRequest, handleIVXOwnerAIDiagnosticsListRequest, ivxOwnerAIDiagnosticsOptions } from './api/ivx-owner-ai-diagnostics';
import { handleIVXOwnerAIAuthDiagnosticGet, handleIVXOwnerAIAuthDiagnosticPost, ivxOwnerAIAuthDiagnosticOptions } from './api/ivx-owner-ai-auth-diagnostic';
import { OPTIONS as ownerAIStreamOptions, handleIVXOwnerAIStreamRequest } from './api/ivx-owner-ai-stream';
import { OPTIONS as ownerAIJobsOptions, handleIVXAIJobStartRequest, handleIVXAIJobStatusRequest, handleIVXAIJobsListRequest, handleIVXAIRuntimeObservabilityRequest } from './api/ivx-owner-ai-jobs';
import { OPTIONS as auditReportOptions, handleIVXAuditReportRequest } from './api/ivx-audit-report';
import {
  OPTIONS as auditJobsOptions,
  handleStartAuditJobRequest,
  handleListAuditJobsRequest,
  handleAuditJobStatusRequest,
  handleAuditJobChunksRequest,
  handleAuditJobExportRequest,
  handleResumeAuditJobRequest,
  handlePauseAuditJobRequest,
  handleCancelAuditJobRequest,
} from './api/ivx-audit-jobs';
import {
  OPTIONS as taskOrchestratorOptions,
  handleStartTaskRequest,
  handleListTasksRequest,
  handleTaskStatusRequest,
  handleTaskBlocksRequest,
  handleTaskEventsRequest,
  handleTaskReviewRequest,
  handleResumeTaskRequest,
  handlePauseTaskRequest,
  handleCancelTaskRequest,
} from './api/ivx-task-orchestrator';
import {
  OPTIONS as autonomousCoreOptions,
  handleLifecycleProofRequest,
  handleAutonomousDashboardRequest,
  handleHandoffReadinessRequest,
  handlePriorityQueueRequest,
  handleCodeIndexRequest,
  handleCodeIndexSummaryRequest,
  handleCodeIndexRebuildRequest,
  handleAuditItemSetsListRequest,
  handleAuditItemSetCreateRequest,
  handleAuditItemSetGetRequest,
  handleAuditItemsUpsertRequest,
  handleAuditItemStatusRequest,
  handleSelfHealRunRequest,
  handleSelfHealListRequest,
  handleCodeGraphRequest,
  handleCodeGraphSummaryRequest,
  handleCodeGraphRebuildRequest,
  handleBlastRadiusRequest,
  handleContinuousGetRequest,
  handleContinuousStartRequest,
  handleContinuousStopRequest,
  handleContinuousAdvanceRequest,
} from './api/ivx-autonomous-core';
import {
  OPTIONS as autonomousScaleOptions,
  handleScaleDashboardRequest,
  handleScaleReportsRequest,
  handleScaleRunRequest,
  handleScaleEnableRequest,
} from './api/ivx-autonomous-scale';
import { startScaleLoopScheduler } from './services/ivx-autonomous-scale-loop';
import {
  OPTIONS as capabilitiesOptions,
  handleCapabilityRegistryRequest,
  handleCapabilityByIdRequest,
  handleReadinessRequest,
} from './api/ivx-capabilities';
import {
  OPTIONS as appGeneratorOptions,
  handleAppGeneratorStatusRequest,
  handleAppGeneratorGenerateRequest,
  handleAppGeneratorRegisterRequest,
  handleAppGeneratorPlanRequest,
  handleAppGeneratorFilesPreviewRequest,
  handleAppGeneratorDeployRequest,
} from './api/ivx-app-generator';
import {
  OPTIONS as credentialReadinessOptions,
  handleCredentialReadinessRequest,
  handleCredentialDeploymentRequest,
  handleCredentialApprovalGateRequest,
} from './api/ivx-credential-readiness';
import {
  OPTIONS as toolSystemOptions,
  handleToolSystemDashboardRequest,
  handleToolSystemToolsRequest,
  handleToolSystemCatalogRequest,
  handleToolSystemInstallRequest,
  handleToolSystemSelfUpgradeRequest,
  handleToolSystemUseRequest,
} from './api/ivx-tool-system';
import {
  OPTIONS as innovationOptions,
  handleInnovationDashboardRequest,
  handleInnovationScanRequest,
  handleInnovationIdeasListRequest,
  handleInnovationIdeaStatusRequest,
  handleInnovationHypothesesListRequest,
  handleInnovationHypothesisCreateRequest,
  handleInnovationHypothesisStatusRequest,
  handleInnovationExperimentsListRequest,
  handleInnovationExperimentCreateRequest,
  handleInnovationExperimentUpdateRequest,
} from './api/ivx-innovation';
import {
  OPTIONS as opportunityOptions,
  handleOpportunityDashboardRequest,
  handleOpportunityScanRequest,
  handleOpportunityListRequest,
  handleOpportunityBestRequest,
  handleOpportunityStatusRequest,
  handleOpportunityAlertsRequest,
  handleOpportunityAlertAckRequest,
  handleOpportunityResearchRequest,
} from './api/ivx-opportunity';
import {
  OPTIONS as businessImpactOptions,
  handleBusinessImpactDashboardRequest,
} from './api/ivx-business-impact';
import {
  OPTIONS as executiveLayerOptions,
  handleExecutiveLayerRequest,
} from './api/ivx-executive-layer';
import {
  OPTIONS as rorkIndependenceOptions,
  handleRorkIndependenceRequest,
} from './api/ivx-rork-independence';
import {
  OPTIONS as dailyReportOptions,
  handleDailyReportLatest,
  handleDailyReportGenerate,
  handleDailyReportHistory,
  handleDailyReportPreview,
} from './api/ivx-daily-report';
import {
  OPTIONS as technologyDiscoveryOptions,
  handleTechnologyDiscoveryStatusRequest,
  handleTechnologyDiscoveryScanRequest,
} from './api/ivx-technology-discovery';
import {
  OPTIONS as unifiedMemoryOptions,
  handleMemoryListRequest,
  handleMemorySummaryRequest,
  handleMemoryCreateRequest,
  handleMemoryGetRequest,
  handleMemoryUpdateRequest,
  handleMemoryForgetRequest,
} from './api/ivx-unified-memory';
import {
  OPTIONS as actionLoopOptions,
  handleActionLoopListRequest,
  handleActionLoopCreateRequest,
  handleActionLoopLearningRequest,
  handleActionLoopGetRequest,
  handleActionLoopExecutionRequest,
  handleActionLoopOutcomeRequest,
} from './api/ivx-executive-action-loop';
import {
  OPTIONS as capitalNetworkOptions,
  handleCapitalNetworkDashboardRequest,
  handleCapitalNetworkScanRequest,
  handleCapitalNetworkProspectsRequest,
  handleCapitalOutreachRequest,
  handleCapitalNetworkStatusRequest,
  handleCapitalProspectActionPlanRequest,
  handleCapitalProspectResearchRequest,
  handleCapitalProspectOutreachDraftRequest,
} from './api/ivx-capital-network';
import {
  OPTIONS as liveWorkOptions,
  handleLiveWorkFeedRequest,
  handleLiveWorkAgentsRequest,
  handleLiveWorkCheckSupabaseRequest,
} from './api/ivx-live-work';
import {
  OPTIONS as investorDiscoveryOptions,
  handleInvestorDiscoveryGetRequest,
  handleInvestorDiscoveryScanRequest,
} from './api/ivx-investor-discovery';
import {
  OPTIONS as executionTraceOptions,
  handleExecutionTraceListRequest,
  handleExecutionTraceGetRequest,
} from './api/ivx-execution-trace';
import {
  OPTIONS as autonomousModeOptions,
  handleAutonomousModeToolsRequest,
  handleAutonomousModeRunRequest,
} from './api/ivx-autonomous-mode';
import {
  OPTIONS as ownerOperationsOptions,
  handleOwnerOperationsDashboardRequest,
  handleOwnerOperationsConnectionsRequest,
  handleOwnerOperationsConnectionTestRequest,
  handleOwnerOperationsActionsRequest,
  handleOwnerOperationsRorkRemovalPreflightRequest,
} from './api/ivx-owner-operations';
import {
  OPTIONS as continuousImprovementOptions,
  handleContinuousImprovementDashboardRequest,
  handleContinuousImprovementSelfAuditRequest,
  handleContinuousImprovementProposalsRequest,
  handleContinuousImprovementDriftRequest,
  handleContinuousImprovementBaselineRequest,
  handleContinuousImprovementSafePlanRequest,
  handleContinuousImprovementSafeFixesRequest,
} from './api/ivx-continuous-improvement';
import {
  OPTIONS as schedulerOptions,
  handleSchedulerStatusRequest,
  handleSchedulerRunNowRequest,
  handleSchedulerEnableRequest,
} from './api/ivx-scheduler';
import { startAutonomousScheduler } from './services/ivx-autonomous-scheduler';
import { startLandingSeoAutodeploy } from './services/ivx-landing-seo-autodeploy';
import {
  OPTIONS as deliverablesOptions,
  handleDeliverableCreateRequest,
  handleDeliverableListRequest,
  handleDeliverableNotificationsRequest,
  handleDeliverableGetRequest,
  handleDeliverableVerifyRequest,
} from './api/ivx-deliverables';
import {
  OPTIONS as metricsOptions,
  handleMetricsRequest,
} from './api/ivx-metrics';
import {
  OPTIONS as runtimeVariablesOptions,
  handleRuntimeVariablesRequest,
  handleRuntimeVariablesVerifyRequest,
  handleRuntimeVariablesSyncRequest,
  handleRuntimeVariablesSaveRequest,
  handleRuntimeVariablesAuditRequest,
} from './api/ivx-runtime-variables';
import {
  OPTIONS as investorCrmOptions,
  handleInvestorListRequest,
  handleInvestorCreateRequest,
  handleInvestorGetRequest,
  handleInvestorUpdateRequest,
  handleInvestorStatusRequest,
  handleInvestorDeleteRequest,
  handleInvestorImportRequest,
} from './api/ivx-investor-crm';
import {
  OPTIONS as capitalPipelineOptions,
  handlePipelineListRequest,
  handlePipelineCreateRequest,
  handlePipelineGetRequest,
  handlePipelineUpdateRequest,
  handlePipelineStageRequest,
  handlePipelineDeleteRequest,
} from './api/ivx-capital-pipeline';
import {
  OPTIONS as powerToolsOptions,
  handleLeadCaptureRequest,
  handleLeadListRequest,
  handleLeadGetRequest,
  handleLeadBehaviorRequest,
  handleLeadStageRequest,
  handleLeadFollowUpRequest,
  handleLeadDeleteRequest,
  handleDealPacketListRequest,
  handleDealPacketCreateRequest,
  handleDealPacketGetRequest,
  handleDealPacketItemRequest,
  handleDealPacketDeleteRequest,
  handlePowerToolsDashboardRequest,
  handlePowerToolsDraftRequest,
} from './api/ivx-power-tools';
import {
  OPTIONS as gmailOptions,
  handleGmailStatusRequest,
  handleGmailConnectRequest,
  handleGmailDisconnectRequest,
  handleGmailRefreshRequest,
  handleGmailTestRequest,
  handleGmailDraftsListRequest,
  handleGmailDraftCreateRequest,
} from './api/ivx-gmail';
import {
  OPTIONS as outreachOptions,
  handleOutreachListRequest,
  handleOutreachPreviewRequest,
  handleOutreachCreateRequest,
  handleOutreachGetRequest,
  handleOutreachUpdateRequest,
  handleOutreachSubmitRequest,
  handleOutreachApproveRequest,
  handleOutreachSendRequest,
  handleOutreachEngagementRequest,
  handleOutreachDeleteRequest,
} from './api/ivx-outreach';
import {
  OPTIONS as leadScoringOptions,
  handleLeadScoringRequest,
} from './api/ivx-lead-scoring';
import {
  OPTIONS as dealMatchingOptions,
  handleDealMatchingRequest,
} from './api/ivx-deal-matching';
import {
  OPTIONS as dealTrackingOptions,
  handleDealTrackingListRequest,
  handleDealTrackingCreateRequest,
  handleDealTrackingGetRequest,
  handleDealTrackingUpdateRequest,
  handleDealTrackingMilestoneRequest,
  handleDealTrackingStatusRequest,
  handleDealTrackingDeleteRequest,
} from './api/ivx-deal-tracking';
import {
  OPTIONS as dealPipelineSeedOptions,
  handleDealPipelineSeedRequest,
} from './api/ivx-deal-pipeline-seed';
import {
  OPTIONS as capitalCommandCenterOptions,
  handleCapitalCommandCenterRequest,
  handleCapitalCommandActivityRequest,
  handleBestInvestorWorkflowRequest,
} from './api/ivx-capital-command-center';
import { OPTIONS as supabaseInspectionOptions, handleIVXSupabaseInspectionRequest, inspectSupabaseTables } from './api/ivx-supabase-inspection';
import { executeIVXAIBrainTool } from './services/ivx-ai-brain-tool-executor';
import { OPTIONS as supabaseOwnerActionOptions, handleIVXSupabaseOwnerActionRequest } from './api/ivx-supabase-owner-actions';
import { OPTIONS as ownerRegistrationOptions, handleIVXOwnerAccessRepairRequest, handleIVXOwnerAccessRepairStatusRequest, handleIVXOwnerRegistrationRepairRequest, handleIVXOwnerRegistrationRequest, handleIVXOwnerRegistrationStatusRequest, handleIVXOwnerSignupAuditRequest } from './api/ivx-owner-registration';
import { handleIVXDevelopmentActionRequest, handleIVXDevelopmentControlRequest, ivxDevelopmentControlOptions } from './api/ivx-development-control';
import { OPTIONS as aiBrainToolsOptions, handleIVXAIBrainToolExecuteRequest, handleIVXAIBrainToolsListRequest } from './api/ivx-ai-brain-tools';
import { OPTIONS as controlRoomStatusOptions, handleIVXControlRoomStatusRequest } from './api/ivx-control-room-status';
import { OPTIONS as developerDeployOptions, handleIVXDeveloperDeployActionRequest, handleIVXDeveloperDeployStatusRequest } from './api/ivx-developer-deploy-control';
import { handleIVXOwnerAuditOptions, handleIVXOwnerAuditRecentConversationsRequest } from './api/ivx-owner-audit';
import { OPTIONS as variablesToolOptions, handleIVXVariablesToolSaveRequest, handleIVXVariablesToolStatusRequest } from './api/ivx-variables-tool';
import { OPTIONS as ownerVariablesOptions, getIVXOwnerVariableRuntimeValue, hasIVXOwnerVariableRuntimeValue, handleIVXOwnerVariablesDeleteRequest, handleIVXOwnerVariablesSaveRequest, handleIVXOwnerVariablesSelfSyncRequest, handleIVXOwnerVariablesStatusRequest, handleIVXOwnerVariablesTestRequest } from './api/ivx-owner-variables';
import { OPTIONS as independenceStatusOptions, handleIVXIndependenceStatusRequest } from './api/ivx-independence-status';
import { handleProofTestRequest, proofTestOptions } from './api/proof-test';
import { chatDurabilityProofOptions, handleChatDurabilityProofRequest } from './api/chat-durability-proof';
import { handleProjectDashboardRequest, projectDashboardOptions } from './api/ivx-project-dashboard';
import { OPTIONS as renderDiagnosticOptions, handleIVXRenderDiagnosticRequest } from './api/ivx-render-diagnostic';
import { OPTIONS as renderDeployLatestOptions, handleIVXRenderDeployLatestRequest } from './api/ivx-render-deploy-latest';
import {
  handleIVXIncidentIngest,
  handleIVXIncidentsList,
  handleIVXIncidentGet,
  handleIVXIncidentDiagnose,
  handleIVXIncidentApprove,
  handleIVXIncidentStage,
  handleIVXIncidentReplay,
  handleIVXIncidentPromote,
  handleIVXIncidentPolicy,
  handleIVXProductionGuardHealth,
  handleIVXProductionGuardRollback,
} from './api/ivx-incidents';
import { recordIncident } from './services/ivx-incident-store';
import { evaluateAndMaybeRollback } from './services/ivx-production-guard';
import { OPTIONS as agentJobsOptions, handleIVXAgentJobActionRequest, handleIVXAgentJobsCreateRequest, handleIVXAgentJobsListRequest, handleIVXAgentJobsLiveActivityRequest, handleIVXAgentJobsStatusRequest, handleIVXAgentWorkerRunOnceRequest } from './api/ivx-agent-jobs';
import { OPTIONS as agentTestTokenOptions, handleIVXAgentTestRunRequest, handleIVXAgentTestTokenMintRequest } from './api/ivx-agent-test-token';
import { OPTIONS as seniorDeveloperOptions, handleIVXSeniorDeveloperCredentialAuditRequest, handleIVXSeniorDeveloperGithubAuditRequest, handleIVXSeniorDeveloperRunRequest, handleIVXSeniorDeveloperStatusRequest } from './api/ivx-senior-developer-runtime';
import { OPTIONS as seniorDevToolsOptions, handleIVXSeniorDevAuditReportRequest, handleIVXSeniorDevToolsExecuteRequest, handleIVXSeniorDevToolsListRequest } from './api/ivx-senior-dev-tools';
import {
  OPTIONS as seniorDevBuildOptions,
  handleProofRequest as handleSeniorDevProofPost,
  handleProofListRequest as handleSeniorDevProofList,
  handleEvidenceRequest as handleSeniorDevEvidence,
  handleOTelStatusRequest as handleSeniorDevOTel,
  handleRepoSearchRequest as handleSeniorDevRepoSearch,
  handleTestReportRequest as handleSeniorDevTestReport,
  handleE2EPlanRequest as handleSeniorDevE2EPlan,
  handleE2ERunRequest as handleSeniorDevE2ERun,
  handleExecutionStreamRequest as handleSeniorDevExecutionStream,
  handleExecutionRecordRequest as handleSeniorDevExecutionRecord,
} from './api/ivx-senior-dev-build';
import { checkRateLimit } from './middleware/ivx-rate-limit';

/** Apply rate limit; if blocked, return the 429 directly. */
async function withRateLimit<T extends Response>(
  raw: Request,
  scope: string,
  burst: number,
  refillPerSecond: number,
  handler: () => Promise<T> | T,
): Promise<Response> {
  const blocked = checkRateLimit(raw, { burst, refillPerSecond, scope });
  if (blocked) return blocked;
  return await handler();
}
import {
  OPTIONS as autonomyOptions,
  handleIVXAutonomyStatusRequest,
  handleIVXAutonomyCloudFrontInvalidateRequest,
  handleIVXAutonomySecretScanRequest,
  handleIVXAutonomyDeployLogRotateRequest,
  handleIVXAutonomyGitRollbackCheckRequest,
  handleIVXAutonomyUptimeProbeRunRequest,
  handleIVXAutonomyUptimeProbeListRequest,
  handleIVXAutonomySSEReplayStatsRequest,
  handleIVXAutonomyTokenBudgetRequest,
  handleIVXAutonomyAIProvidersRequest,
  handleIVXAutonomyDeployApproveAndRunRequest,
  handleIVXAutonomyDeployRollbackRequest,
  handleIVXAutonomyGithubSyncRequest,
} from './api/ivx-autonomy';
import {
  OPTIONS as adminSyncOptions,
  handleIVXAdminSyncRorkToGithubRequest,
} from './api/ivx-admin-sync';
import { handleIVXRepairJobStart, handleIVXRepairJobList, handleIVXRepairJobGet, handleIVXRepairJobByIncident } from './api/ivx-repair-jobs';
import {
  OPTIONS as nightOpsOptions,
  handleIVXNightOpsStatusRequest,
  handleIVXNightOpsConfigRequest,
  handleIVXNightOpsRunRequest,
  handleIVXNightOpsTouchOwnerRequest,
  handleIVXNightOpsRunsListRequest,
  handleIVXNightOpsRunGetRequest,
  handleIVXNightOpsRoadmapGetRequest,
  handleIVXNightOpsRoadmapAdvanceRequest,
} from './api/ivx-night-ops';
import { startNightOpsScheduler } from './services/ivx-night-ops';
import { startContinuousExecutionScheduler } from './services/ivx-continuous-execution';
import {
  OPTIONS as opMemoryOptions,
  handleStatus as handleOpMemoryStatus,
  handleSearch as handleOpMemorySearch,
  handleList as handleOpMemoryList,
  handleUpsert as handleOpMemoryUpsert,
  handleReindex as handleOpMemoryReindex,
  handleLoopRun as handleOpMemoryLoopRun,
  handleTasksList as handleOpMemoryTasksList,
  handleTaskGet as handleOpMemoryTaskGet,
  handleRollback as handleOpMemoryRollback,
  handleSnapshot as handleOpMemorySnapshot,
} from './api/ivx-operational-memory';
import {
  OPTIONS as engIntelOptions,
  handleStatus as handleEngIntelStatus,
  handleDashboard as handleEngIntelDashboard,
  handleDetect as handleEngIntelDetect,
  handleListIncidents as handleEngIntelListIncidents,
  handleListDecisions as handleEngIntelListDecisions,
  handleListFixOutcomes as handleEngIntelListFixOutcomes,
  handleListSnapshots as handleEngIntelListSnapshots,
  handleTelemetryIngest as handleEngIntelTelemetryIngest,
  handleTelemetryStats as handleEngIntelTelemetryStats,
  handleConfidence as handleEngIntelConfidence,
  handleGate as handleEngIntelGate,
  handleRecordIncident as handleEngIntelRecordIncident,
  handleRecordDecision as handleEngIntelRecordDecision,
  handleRecordFixOutcome as handleEngIntelRecordFixOutcome,
  handleSnapshotCapture as handleEngIntelSnapshotCapture,
  handleSimulate as handleEngIntelSimulate,
} from './api/ivx-engineering-intelligence';
import {
  OPTIONS as multiAgentOptions,
  handleStatus as handleMultiAgentStatus,
  handleListActiveAgents as handleMultiAgentActive,
  handleDispatch as handleMultiAgentDispatch,
  handleListTasks as handleMultiAgentListTasks,
  handleGetTask as handleMultiAgentGetTask,
  handleHandoff as handleMultiAgentHandoff,
  handleListHandoffs as handleMultiAgentListHandoffs,
  handleAudit as handleMultiAgentAudit,
  handleMemoryWrite as handleMultiAgentMemoryWrite,
  handleMemoryRead as handleMultiAgentMemoryRead,
  handleComplete as handleMultiAgentComplete,
  handleFail as handleMultiAgentFail,
  handleRoutePreview as handleMultiAgentRoutePreview,
  handleValidate as handleMultiAgentValidate,
} from './api/ivx-multi-agent';
import {
  OPTIONS as selfExecOptions,
  handleRunSelfExecution as handleSelfExecRun,
  handleGetSelfExecutionResult as handleSelfExecResult,
} from './api/ivx-agent-self-execution';
import {
  OPTIONS as parallelAgentsOptions,
  handleParallelDispatch,
  handleParallelList,
  handleParallelGet,
  handleParallelGetTree,
  handleParallelDecomposePreview,
  handleParallelValidate,
} from './api/ivx-parallel-agents';
import {
  OPTIONS as ctoDashboardOptions,
  handleDashboardOverview as handleCTODashboardOverview,
  handleParentTree as handleCTODashboardParentTree,
  handleAuditSearch as handleCTODashboardAuditSearch,
  handleControlAction as handleCTODashboardControl,
  handleAutonomousCycleControl as handleCTODashboardAutonomousCycleControl,
  handleAutonomousCycleDashboardValidate as handleCTODashboardAutonomousCycleValidate,
} from './api/ivx-cto-dashboard';
import {
  OPTIONS as autonomousCycleOptions,
  handleStatus as handleAutonomousCycleStatus,
  handleClassify as handleAutonomousCycleClassify,
  handleRun as handleAutonomousCycleRun,
  handleList as handleAutonomousCycleList,
  handleGet as handleAutonomousCycleGet,
  handleValidate as handleAutonomousCycleValidate,
} from './api/ivx-autonomous-cycle';
import { OPTIONS as assistantOptions, POST as handleAssistantPost } from './api/assistant';
import { OPTIONS as planCreatorOptions, POST as handlePlanCreatorPost } from './api/plan-creator';
import {
  handlePublicChatPost,
  handlePublicChatHistoryGet,
  handlePublicChatSessionsGet,
  setPublicChatHistoryStorage,
} from './api/public-chat';
import { ChatStorage } from './chat-storage';
import type { ChatRoomMessage } from './chat-types';
import {
  generatePublicChatAnswer,
  getPublicChatHealthSnapshot,
  mapRoomMessagesToPublicChatHistory,
} from './public-chat-ai';
import {
  handleChatPost,
  handleDiagnosticsGet,
  handleFallbackReply,
  handleInboxSync,
  handleMessagesGet,
  handleMessagesPost,
  handleMessagesSearch,
  handleRoomsGet,
  handleRoomsPost,
  handleUploadPost,
  ownerRoutesOptions,
} from './api/owner-routes';
import {
  handleMultimodalAnalyze,
  handleMultimodalGoogleDriveImport,
  handleMultimodalImageUpload,
  handleMultimodalPdfUpload,
  handleMultimodalSummary,
  handleMultimodalVideoUpload,
  ownerMultimodalOptions,
} from './api/owner-multimodal';
import {
  OPTIONS as multimodalStackOptions,
  handleMultimodalStatusRequest,
  handleMultimodalGenerateImageRequest,
  handleMultimodalUnderstandVideoRequest,
  handleMultimodalGenerate3DRequest,
} from './api/ivx-multimodal';
import { handleOwnerAudioTranscribe, ownerTranscriptionOptions } from './api/owner-transcription';
import {
  handleIVXMediaJobsAdvanceRequest,
  handleIVXMediaJobsCompleteRequest,
  handleIVXMediaJobsCreateRequest,
  handleIVXMediaJobsFailRequest,
  handleIVXMediaJobsGetRequest,
  ivxMediaJobsOptions,
} from './api/ivx-media-jobs';

async function loadRoute53Module() {
  try {
    return await import('./api/route53-dns');
  } catch (error) {
    console.log('[IVXOwnerAI-Hono] Route53 module unavailable:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

function route53UnavailableResponse(): Response {
  return new Response(JSON.stringify({
    error: 'Route53 DNS tooling is unavailable in this runtime.',
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

async function handleRoute53Options(): Promise<Response> {
  const route53Module = await loadRoute53Module();
  if (!route53Module) {
    return route53UnavailableResponse();
  }

  return route53Module.route53DnsOptions();
}

async function handleRoute53Request(
  request: Request,
  action: 'audit' | 'upsert',
): Promise<Response> {
  const route53Module = await loadRoute53Module();
  if (!route53Module) {
    return route53UnavailableResponse();
  }

  if (action === 'audit') {
    return route53Module.handleRoute53DNSAudit(request);
  }

  return route53Module.handleRoute53DNSUpsert(request);
}

const app = new Hono();
// NOTE: This is a static build label, NOT a deploy timestamp. Do not read freshness
// from this string. Use the `commit` (RENDER_GIT_COMMIT) and `bootTime` fields on
// /health for actual deploy verification.
const DEPLOYMENT_MARKER = 'ivx-owner-ai-hono-autodeploy-live (see commit+bootTime for freshness)';
/**
 * Live build proof. Render injects RENDER_GIT_COMMIT at deploy time; we surface it on
 * /health so the deployed commit is verifiable from the outside. Falls back to other
 * common CI commit vars, then 'unknown' for local runs.
 */
const LIVE_COMMIT_SHA = (
  process.env.RENDER_GIT_COMMIT?.trim() ||
  process.env.GIT_COMMIT?.trim() ||
  process.env.SOURCE_VERSION?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  'unknown'
);
const LIVE_COMMIT_SHORT = LIVE_COMMIT_SHA === 'unknown' ? 'unknown' : LIVE_COMMIT_SHA.slice(0, 8);
const SERVER_BOOT_TIME = new Date().toISOString();
const OWNER_SIGNUP_AUDIT_SOURCE_PROOF = 'owner-password-owner-vars-route-registered-2026-05-09t1115z';
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIST_ROOT = path.join(SERVER_ROOT, 'expo', 'dist');
const CHAT_DATABASE_PATH = (process.env.CHAT_DATABASE_PATH?.trim() || path.join(SERVER_ROOT, 'data', 'chat-room.sqlite'));
const CHAT_DEFAULT_ROOM_ID = (process.env.CHAT_ROOM_ID?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40) || 'main-room');
const publicChatStorage = new ChatStorage(CHAT_DATABASE_PATH);
setPublicChatHistoryStorage(publicChatStorage);
const publicRoomMembers = new Map<string, number>();
type RenderProofToolName = 'time-now' | 'room-status' | 'supabase-tables' | 'storage-diagnostics' | 'github-status' | 'aws-status' | 'supabase-status' | 'render-status';

type RenderProofToolPayload = {
  ok: boolean;
  status: 'verified' | 'not_verified' | 'missing_access';
  tool: RenderProofToolName;
  endpoint: string;
  deploymentMarker: string;
  timestamp: string;
  data?: Record<string, unknown>;
  error?: string;
  missingEnvNames?: string[];
};

const RENDER_PROOF_TOOL_NAMES: readonly RenderProofToolName[] = [
  'time-now',
  'room-status',
  'supabase-tables',
  'storage-diagnostics',
  'github-status',
  'aws-status',
  'supabase-status',
  'render-status',
] as const;

const REQUIRED_PRODUCTION_ACCESS_ENV_NAMES = [
  'API_BASE_URL',
  'GITHUB_REPO_URL',
  'GITHUB_TOKEN',
  'RENDER_API_KEY',
  'RENDER_SERVICE_ID',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'POSTGRES_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'S3_BUCKET_NAME',
  'CLOUDFRONT_DISTRIBUTION_ID',
  'AI_GATEWAY_API_KEY',
  'JWT_SECRET',
  'APP_SECRET',
] as const;

const OPTIONAL_PRODUCTION_ACCESS_ENV_NAMES = [
  'MINIO_PASSWORD',
  'STRIPE_API_KEY',
] as const;

const REQUESTED_PRODUCTION_ACCESS_ENV_NAMES = [
  ...REQUIRED_PRODUCTION_ACCESS_ENV_NAMES,
  ...OPTIONAL_PRODUCTION_ACCESS_ENV_NAMES,
] as const;

const RENDER_API_BASE_URL = 'https://api.render.com/v1';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function hasWebDistBuild(): boolean {
  return existsSync(WEB_DIST_ROOT);
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitizeRoomId(value: unknown): string {
  const normalized = readTrimmed(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  return normalized || '';
}

function readPublicLimit(value: unknown): number {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : '';
  const parsed = Number.parseInt(readTrimmed(raw), 10);
  if (!Number.isFinite(parsed)) {
    return 80;
  }

  return Math.min(Math.max(parsed, 1), 200);
}

function sanitizePublicUsername(value: unknown): string {
  return readTrimmed(value).replace(/\s+/g, ' ').slice(0, 32) || 'Guest';
}

function sanitizePublicMessage(value: unknown): string {
  return readTrimmed(value).replace(/\s+/g, ' ').slice(0, 1200);
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function publicJson(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function getPublicRoomSnapshot(roomId: string): { roomId: string; onlineCount: number; messageCount: number } {
  return {
    roomId,
    onlineCount: publicRoomMembers.get(roomId) ?? 0,
    messageCount: publicChatStorage.getRoomMessageCount(roomId),
  };
}

function isRenderProofToolName(value: string): value is RenderProofToolName {
  return (RENDER_PROOF_TOOL_NAMES as readonly string[]).includes(value);
}

function getMissingEnvNames(names: readonly string[]): string[] {
  return names.filter((name) => !readTrimmed(process.env[name]));
}

function summarizeGithubOutput(output: unknown): Record<string, unknown> {
  const record = output && typeof output === 'object' && !Array.isArray(output) ? output as Record<string, unknown> : {};
  const latestCommit = record.latestCommit && typeof record.latestCommit === 'object' && !Array.isArray(record.latestCommit)
    ? record.latestCommit as Record<string, unknown>
    : null;
  const branchNames = Array.isArray(record.branchNames) ? record.branchNames.filter((item): item is string => typeof item === 'string') : [];

  return {
    repoUrlConfigured: record.repoUrlConfigured === true || Boolean(readTrimmed(process.env.GITHUB_REPO_URL)),
    credentialSource: readObject(record.credentialSource),
    owner: readTrimmed(record.owner) || null,
    repo: readTrimmed(record.repo) || null,
    private: typeof record.private === 'boolean' ? record.private : null,
    defaultBranch: readTrimmed(record.defaultBranch) || null,
    branchCount: branchNames.length,
    tokenConfigured: record.tokenConfigured === true,
    tokenMode: readTrimmed(record.tokenMode) || 'not_configured',
    latestCommit: latestCommit
      ? {
        shaPrefix: readTrimmed(latestCommit.sha).slice(0, 12) || null,
        authorDate: readTrimmed(latestCommit.authorDate) || null,
      }
      : null,
  };
}

function summarizeSupabaseReadinessOutput(output: unknown): Record<string, unknown> {
  const record = readObject(output);
  const checks = Array.isArray(record.checks) ? record.checks.map((item) => {
    const check = readObject(item);
    return {
      name: readTrimmed(check.name) || null,
      status: readTrimmed(check.status) || null,
      httpStatus: typeof check.httpStatus === 'number' ? check.httpStatus : null,
      accessLevel: readTrimmed(check.accessLevel) || null,
      requiredForMinimum: check.requiredForMinimum === true,
      missingCredentialNames: Array.isArray(check.missingCredentialNames) ? check.missingCredentialNames.map(readTrimmed).filter(Boolean) : [],
    };
  }) : [];
  const requiredChecks = checks.filter((check) => check.requiredForMinimum === true);
  const requiredChecksVerified = requiredChecks.length > 0 && requiredChecks.every((check) => check.status === 'verified');
  const minimumReadOnlyReady = record.minimumReadOnlyReady === true && requiredChecksVerified;
  return {
    status: minimumReadOnlyReady ? 'verified' : 'not_verified',
    minimumReadOnlyReady,
    projectUrlConfigured: record.projectUrlConfigured === true,
    anonKeyConfigured: record.anonKeyConfigured === true,
    serviceRoleConfigured: record.serviceRoleConfigured === true,
    writeCapableCredentialConfigured: record.writeCapableCredentialConfigured === true,
    checks,
    honestStatus: minimumReadOnlyReady
      ? 'Supabase minimum read-only runtime access is verified.'
      : 'Supabase route is reachable, but at least one required read-only check is not verified. Do not report Supabase as fully working until this passes.',
  };
}

function buildMultimodalStatusPayload(): Record<string, unknown> {
  const aiGatewayConfigured = Boolean(readTrimmed(process.env.AI_GATEWAY_API_KEY));
  const supabaseStorageConfigured = Boolean(readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL) && (readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY)));
  return {
    ok: true,
    status: 'production_routes_registered',
    deploymentMarker: DEPLOYMENT_MARKER,
    minimumDeploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
    routes: [
      'POST /api/upload/image',
      'POST /api/upload/pdf',
      'POST /api/upload/video',
      'POST /api/google-drive/import',
      'POST /api/files/:fileId/analyze',
      'POST /api/files/:fileId/summary',
    ],
    storage: {
      privateSignedUrls: true,
      supabaseStorageConfigured,
      publicBucketExposure: false,
    },
    capabilities: {
      imageUpload: true,
      imageVisionAnalysis: aiGatewayConfigured,
      multipleImagesInChatContext: false,
      pdfUpload: true,
      pdfTextExtraction: 'best_effort_text_layer_only',
      scannedPdfOcr: false,
      pdfPageReferences: 'page_count_only_until_pdf_parser_worker_enabled',
      videoUpload: true,
      videoMetadataSummary: true,
      videoFrameAnalysis: false,
      videoTranscriptExtraction: false,
      googleDriveSharedFileImport: true,
      googleWorkspaceDocsExportToPdf: true,
      googleDrivePrivateOwnerOAuth: false,
    },
    honestBlockersForFullChatGPTParity: [
      'If https://api.ivxholding.com/api/multimodal/status returns 404 or an older deployment marker, production is still serving an old backend deploy and uploads must be treated as FAIL until Render deploys this marker.',
      'Private Google Drive owner OAuth is not connected without a Google OAuth access/refresh token flow.',
      'Scanned-PDF OCR requires an OCR worker.',
      'Video frame extraction/transcription requires a media worker such as ffmpeg plus speech-to-text.',
      'Multiple uploaded files are listed in the Files workspace, but automatic multi-file chat memory/RAG is not fully wired.',
    ],
  };
}

function summarizeAwsOutput(output: unknown): Record<string, unknown> {
  const record = output && typeof output === 'object' && !Array.isArray(output) ? output as Record<string, unknown> : {};
  const account = readTrimmed(record.account);
  const arn = readTrimmed(record.arn);
  const arnParts = arn.split(':');
  return {
    identityVerified: Boolean(account || arn),
    accountSuffix: account ? account.slice(-4).padStart(account.length, '*') : null,
    arnType: arnParts.length >= 6 ? arnParts[5]?.split('/')[0] ?? null : null,
    region: readTrimmed(record.region) || readTrimmed(process.env.AWS_REGION) || 'us-east-1',
    credentialConfigured: getMissingEnvNames(['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']).length === 0
      || getMissingEnvNames(['IVX_AWS_READONLY_ACCESS_KEY_ID', 'IVX_AWS_READONLY_SECRET_ACCESS_KEY']).length === 0,
  };
}

function extractRenderEnvVarKeyNames(data: unknown): string[] {
  const values = Array.isArray(data) ? data : Array.isArray(readObject(data).envVars) ? readObject(data).envVars as unknown[] : [];
  return values
    .map((item) => {
      const record = readObject(item);
      const envVar = readObject(record.envVar);
      return readTrimmed(record.key) || readTrimmed(envVar.key);
    })
    .filter(Boolean);
}

async function fetchRenderRuntimeStatus(): Promise<{ ok: boolean; status: 'verified' | 'not_verified' | 'missing_access'; data: Record<string, unknown>; missingEnvNames: string[]; error?: string }> {
  const envApiKey = readTrimmed(process.env.RENDER_API_KEY);
  const envServiceId = readTrimmed(process.env.RENDER_SERVICE_ID);
  const ownerApiKey = envApiKey ? '' : await getIVXOwnerVariableRuntimeValue('RENDER_API_KEY');
  const ownerServiceId = envServiceId ? '' : await getIVXOwnerVariableRuntimeValue('RENDER_SERVICE_ID');
  const apiKey = envApiKey || ownerApiKey;
  const serviceId = envServiceId || ownerServiceId;
  const missingEnvNames = [
    ...(!apiKey ? ['RENDER_API_KEY'] : []),
    ...(!serviceId ? ['RENDER_SERVICE_ID'] : []),
  ];
  const renderCredentialSource = {
    RENDER_API_KEY: envApiKey ? 'env' : ownerApiKey ? 'owner_variables' : 'missing',
    RENDER_SERVICE_ID: envServiceId ? 'env' : ownerServiceId ? 'owner_variables' : 'missing',
  };
  const requiredRuntimeMissing = REQUIRED_PRODUCTION_ACCESS_ENV_NAMES.filter((name) => {
    if (name === 'RENDER_API_KEY') return !apiKey;
    if (name === 'RENDER_SERVICE_ID') return !serviceId;
    return !readTrimmed(process.env[name]);
  });
  const optionalRuntimeMissing = getMissingEnvNames(OPTIONAL_PRODUCTION_ACCESS_ENV_NAMES);
  const runtimeMissing = requiredRuntimeMissing;
  const envGroupMarkerPresent = readTrimmed(process.env.IVX_ENV_GROUP_ATTACHED).toLowerCase() === 'true' && readTrimmed(process.env.IVX_ENV_GROUP_NAME) === 'my-env-group';

  if (!apiKey || !serviceId) {
    return {
      ok: false,
      status: 'missing_access',
      missingEnvNames,
      data: {
        apiKeyConfigured: Boolean(apiKey),
        serviceIdConfigured: Boolean(serviceId),
        credentialSource: renderCredentialSource,
        serviceName: readTrimmed(process.env.RENDER_SERVICE_NAME) || 'ivx-holdings-platform',
        envGroupMarkerPresent,
        requestedCredentialPresentByNameOnly: Object.fromEntries(REQUESTED_PRODUCTION_ACCESS_ENV_NAMES.map((name) => [name, name === 'RENDER_API_KEY' ? Boolean(apiKey) : name === 'RENDER_SERVICE_ID' ? Boolean(serviceId) : Boolean(readTrimmed(process.env[name]))])),
        requiredRuntimeMissingEnvNames: requiredRuntimeMissing,
        optionalRuntimeMissingEnvNames: optionalRuntimeMissing,
        runtimeMissingEnvNames: runtimeMissing,
      },
      error: 'Render API runtime credentials are not loaded in this backend runtime.',
    };
  }

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    const [serviceResponse, envVarsResponse, envGroupsResponse] = await Promise.all([
      fetch(`${RENDER_API_BASE_URL}/services/${encodeURIComponent(serviceId)}`, { headers }),
      fetch(`${RENDER_API_BASE_URL}/services/${encodeURIComponent(serviceId)}/env-vars?limit=100`, { headers }),
      fetch(`${RENDER_API_BASE_URL}/env-groups?name=my-env-group&limit=20`, { headers }).catch(() => null),
    ]);
    const [serviceData, envVarsData, envGroupsData] = await Promise.all([
      serviceResponse.text().then((text) => text ? JSON.parse(text) as unknown : null).catch(() => null),
      envVarsResponse.text().then((text) => text ? JSON.parse(text) as unknown : []).catch(() => []),
      envGroupsResponse?.text().then((text) => text ? JSON.parse(text) as unknown : []).catch(() => []) ?? Promise.resolve([]),
    ]);
    const serviceRecord = readObject(readObject(serviceData).service ?? serviceData);
    const envVarKeys = extractRenderEnvVarKeyNames(envVarsData);
    const envVarKeySet = new Set(envVarKeys);
    const envGroupRows = Array.isArray(envGroupsData) ? envGroupsData : Array.isArray(readObject(envGroupsData).envGroups) ? readObject(envGroupsData).envGroups as unknown[] : [];
    const envGroupExists = envGroupRows.some((item) => readTrimmed(readObject(readObject(item).envGroup ?? item).name) === 'my-env-group');
    const requiredEnvVarsPresentInRender = REQUIRED_PRODUCTION_ACCESS_ENV_NAMES.filter((name) => envVarKeySet.has(name));
    const requiredEnvVarsMissingInRender = REQUIRED_PRODUCTION_ACCESS_ENV_NAMES.filter((name) => !envVarKeySet.has(name));
    const optionalEnvVarsPresentInRender = OPTIONAL_PRODUCTION_ACCESS_ENV_NAMES.filter((name) => envVarKeySet.has(name));
    const optionalEnvVarsMissingInRender = OPTIONAL_PRODUCTION_ACCESS_ENV_NAMES.filter((name) => !envVarKeySet.has(name));
    const renderApiAuthorized = serviceResponse.ok && envVarsResponse.ok;

    return {
      ok: renderApiAuthorized && runtimeMissing.length === 0,
      status: !renderApiAuthorized ? 'not_verified' : runtimeMissing.length === 0 ? 'verified' : 'missing_access',
      missingEnvNames: runtimeMissing,
      data: {
        renderApiAuthorized,
        serviceHttpStatus: serviceResponse.status,
        envVarsHttpStatus: envVarsResponse.status,
        serviceIdConfigured: true,
        credentialSource: renderCredentialSource,
        serviceIdSuffix: serviceId.slice(-6).padStart(serviceId.length, '*'),
        serviceName: readTrimmed(serviceRecord.name) || readTrimmed(process.env.RENDER_SERVICE_NAME) || 'ivx-holdings-platform',
        serviceType: readTrimmed(serviceRecord.type) || null,
        serviceSuspended: serviceRecord.suspended === true,
        envGroupExists,
        envGroupMarkerPresent,
        requestedCredentialPresentByNameOnly: Object.fromEntries(REQUESTED_PRODUCTION_ACCESS_ENV_NAMES.map((name) => [name, name === 'RENDER_API_KEY' ? Boolean(apiKey) : name === 'RENDER_SERVICE_ID' ? Boolean(serviceId) : Boolean(readTrimmed(process.env[name]))])),
        requiredEnvVarsPresentInRender,
        requiredEnvVarsMissingInRender,
        optionalEnvVarsPresentInRender,
        optionalEnvVarsMissingInRender,
        requiredRuntimeMissingEnvNames: requiredRuntimeMissing,
        optionalRuntimeMissingEnvNames: optionalRuntimeMissing,
        runtimeMissingEnvNames: runtimeMissing,
      },
      error: renderApiAuthorized ? undefined : `Render API check returned service=${serviceResponse.status}, envVars=${envVarsResponse.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'not_verified',
      missingEnvNames,
      data: {
        apiKeyConfigured: true,
        serviceIdConfigured: true,
        credentialSource: renderCredentialSource,
        requestedCredentialPresentByNameOnly: Object.fromEntries(REQUESTED_PRODUCTION_ACCESS_ENV_NAMES.map((name) => [name, name === 'RENDER_API_KEY' ? Boolean(apiKey) : name === 'RENDER_SERVICE_ID' ? Boolean(serviceId) : Boolean(readTrimmed(process.env[name]))])),
      },
      error: error instanceof Error ? error.message : 'Render runtime status check failed.',
    };
  }
}

async function buildRenderEnvDebugPayload(): Promise<Record<string, unknown>> {
  const envApiKeyExists = Boolean(readTrimmed(process.env.RENDER_API_KEY));
  const envServiceIdExists = Boolean(readTrimmed(process.env.RENDER_SERVICE_ID));
  const ownerApiKeyExists = await hasIVXOwnerVariableRuntimeValue('RENDER_API_KEY');
  const ownerServiceIdExists = await hasIVXOwnerVariableRuntimeValue('RENDER_SERVICE_ID');
  const apiKeyExists = envApiKeyExists || ownerApiKeyExists;
  const serviceIdExists = envServiceIdExists || ownerServiceIdExists;
  const exists = apiKeyExists && serviceIdExists;
  const source = envApiKeyExists && envServiceIdExists
    ? 'env'
    : ownerApiKeyExists && ownerServiceIdExists
      ? 'owner_variables'
      : exists
        ? 'mixed'
        : apiKeyExists || serviceIdExists
          ? 'partial'
          : 'missing';

  return {
    exists,
    source,
    loadedAtRuntime: exists,
    secretValuesReturned: false,
  };
}

async function fetchSupabaseStorageDiagnostics(): Promise<{ ok: boolean; status: 'verified' | 'not_verified' | 'missing_access'; data: Record<string, unknown>; missingEnvNames: string[]; error?: string }> {
  const supabaseUrl = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const accessKey = serviceRoleKey || anonKey;
  const missingEnvNames = getMissingEnvNames(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']);

  if (!supabaseUrl || !accessKey) {
    return {
      ok: false,
      status: 'missing_access',
      missingEnvNames,
      data: {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      },
      error: 'Supabase storage diagnostics env is not fully configured.',
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'GET',
      headers: {
        apikey: accessKey,
        Authorization: `Bearer ${accessKey}`,
      },
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) as unknown : [];
    const buckets = Array.isArray(parsed) ? parsed : [];
    return {
      ok: response.ok,
      status: response.ok ? 'verified' : 'not_verified',
      missingEnvNames,
      data: {
        httpStatus: response.status,
        hasSupabaseUrl: true,
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
        bucketCount: buckets.length,
        bucketNames: buckets.map((bucket) => readTrimmed((bucket as Record<string, unknown>).name)).filter(Boolean).slice(0, 20),
      },
      error: response.ok ? undefined : text.slice(0, 240),
    };
  } catch (error) {
    return {
      ok: false,
      status: 'not_verified',
      missingEnvNames,
      data: {
        hasSupabaseUrl: true,
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      },
      error: error instanceof Error ? error.message : 'Supabase storage diagnostics failed.',
    };
  }
}

async function buildRenderProofToolPayload(tool: RenderProofToolName, endpoint: string): Promise<RenderProofToolPayload> {
  if (tool === 'time-now') {
    const now = new Date();
    return {
      ok: true,
      status: 'verified',
      tool,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: now.toISOString(),
      data: {
        source: 'server_runtime_date',
        epochMs: now.getTime(),
        timezone: 'UTC',
        formatted: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' }).format(now),
      },
    };
  }

  if (tool === 'room-status') {
    const room = getPublicRoomSnapshot(CHAT_DEFAULT_ROOM_ID);
    return {
      ok: true,
      status: 'verified',
      tool,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      data: {
        room,
        totalMessageCount: publicChatStorage.getTotalMessageCount(),
        storageMode: 'portable_json',
      },
    };
  }

  if (tool === 'supabase-tables') {
    const tables = await inspectSupabaseTables(null, null, 200);
    return {
      ok: true,
      status: 'verified',
      tool,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      data: {
        tableCount: tables.length,
        tableNames: tables.map((row) => `${row.schema_name}.${row.table_name}`),
        sample: tables.slice(0, 20),
      },
    };
  }

  if (tool === 'storage-diagnostics') {
    const storage = await fetchSupabaseStorageDiagnostics();
    return {
      ok: storage.ok,
      status: storage.status,
      tool,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      data: storage.data,
      error: storage.error,
      missingEnvNames: storage.missingEnvNames,
    };
  }

  if (tool === 'supabase-status') {
    const result = await executeIVXAIBrainTool({ tool: 'supabase_readiness_check', input: {} });
    const data = summarizeSupabaseReadinessOutput(result.output);
    const minimumReady = data.minimumReadOnlyReady === true;
    const hasMissingEnv = result.missingEnvNames.length > 0;
    const ok = result.ok === true && minimumReady === true && hasMissingEnv === false;
    return {
      ok,
      status: hasMissingEnv ? 'missing_access' : ok ? 'verified' : 'not_verified',
      tool,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      data,
      error: minimumReady ? result.error : result.error ?? 'Supabase route is reachable, but minimum read-only access is not verified.',
      missingEnvNames: result.missingEnvNames,
    };
  }

  if (tool === 'render-status') {
    const render = await fetchRenderRuntimeStatus();
    return {
      ok: render.ok,
      status: render.status,
      tool,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      data: render.data,
      error: render.error,
      missingEnvNames: render.missingEnvNames,
    };
  }

  const aiTool = tool === 'github-status' ? 'github_repo_status' : 'aws_identity_check';
  const result = await executeIVXAIBrainTool({ tool: aiTool, input: {} });
  return {
    ok: result.ok,
    status: result.missingEnvNames.length > 0 ? 'missing_access' : result.ok ? 'verified' : 'not_verified',
    tool,
    endpoint,
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
    data: tool === 'github-status' ? summarizeGithubOutput(result.output) : summarizeAwsOutput(result.output),
    error: result.error,
    missingEnvNames: result.missingEnvNames,
  };
}

async function handleRenderProofToolRequest(toolName: string, endpoint: string): Promise<Response> {
  const normalizedToolName = toolName.trim().toLowerCase();
  if (!isRenderProofToolName(normalizedToolName)) {
    return publicJson({
      ok: false,
      error: 'Unknown Render proof tool endpoint.',
      supportedTools: RENDER_PROOF_TOOL_NAMES,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    }, 404);
  }

  try {
    return publicJson(buildRecord(await buildRenderProofToolPayload(normalizedToolName, endpoint)));
  } catch (error) {
    return publicJson({
      ok: false,
      status: 'not_verified',
      tool: normalizedToolName,
      endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      error: error instanceof Error ? error.message : 'Render proof tool endpoint failed.',
    }, 200);
  }
}

function buildRecord(payload: RenderProofToolPayload): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>;
}

async function handlePublicRoomMessages(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const roomId = sanitizeRoomId(url.searchParams.get('roomId')) || CHAT_DEFAULT_ROOM_ID;
  const limit = readPublicLimit(url.searchParams.get('limit'));
  const messages = publicChatStorage.listMessages(roomId, limit);
  return publicJson({
    ok: true,
    roomId,
    messages,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

async function handlePublicRoomState(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const roomId = sanitizeRoomId(url.searchParams.get('roomId')) || CHAT_DEFAULT_ROOM_ID;
  return publicJson({
    ok: true,
    room: getPublicRoomSnapshot(roomId),
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

async function handlePublicRoomSend(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const roomId = sanitizeRoomId(body.roomId) || CHAT_DEFAULT_ROOM_ID;
  const username = sanitizePublicUsername(body.username);
  const text = sanitizePublicMessage(body.text);
  const source = body.source === 'assistant' || body.source === 'system' ? body.source : 'user';

  if (!text) {
    return publicJson({
      ok: false,
      error: 'Message text is required.',
      deploymentMarker: DEPLOYMENT_MARKER,
    }, 400);
  }

  const message: ChatRoomMessage = publicChatStorage.createMessage({
    roomId,
    username,
    text,
    source,
  });

  const nextOnlineCount = Math.max(publicRoomMembers.get(roomId) ?? 0, 1);
  publicRoomMembers.set(roomId, nextOnlineCount);

  console.log('[IVXOwnerAI-Hono] Public room message stored', {
    roomId,
    username,
    source,
    messageId: message.id,
    marker: DEPLOYMENT_MARKER,
  });

  const roomMessages = publicChatStorage
    .listMessages(roomId, 24)
    .filter((storedMessage) => storedMessage.id !== message.id);
  const aiResult = await generatePublicChatAnswer({
    message: text,
    history: mapRoomMessagesToPublicChatHistory(roomMessages),
    sessionId: roomId,
  });
  const assistantMessage: ChatRoomMessage = publicChatStorage.createMessage({
    roomId,
    username: 'IVX Owner AI',
    text: aiResult.answer,
    source: 'assistant',
  });

  console.log('[IVXOwnerAI-Hono] Public room assistant reply stored', {
    roomId,
    messageId: assistantMessage.id,
    model: aiResult.model,
    source: aiResult.source,
    endpoint: aiResult.endpoint,
    marker: DEPLOYMENT_MARKER,
  });

  return publicJson({
    ok: true,
    message,
    assistantMessage,
    ai: {
      source: aiResult.source,
      model: aiResult.model,
      endpoint: aiResult.endpoint,
    },
    requestId: createId('public-room-request'),
    room: getPublicRoomSnapshot(roomId),
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
  }, 201);
}

function normalizeWebPath(requestPath: string): string {
  const normalized = requestPath.split('?')[0]?.trim() ?? '/';
  if (!normalized || normalized === '/') {
    return '/';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function buildWebCandidates(requestPath: string): string[] {
  const normalizedPath = normalizeWebPath(requestPath);
  const trimmedPath = normalizedPath.replace(/^\/+/, '').replace(/\/+$/, '');

  if (!trimmedPath) {
    return ['index.html'];
  }

  const candidates = [
    trimmedPath,
    `${trimmedPath}.html`,
    path.join(trimmedPath, 'index.html'),
  ];

  return Array.from(new Set(candidates));
}

function resolveStaticFilePath(relativePath: string): string | null {
  const candidatePath = path.resolve(WEB_DIST_ROOT, relativePath);
  if (candidatePath !== WEB_DIST_ROOT && !candidatePath.startsWith(`${WEB_DIST_ROOT}${path.sep}`)) {
    return null;
  }

  return candidatePath;
}

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function loadWebResponse(requestPath: string, method: string): Promise<Response | null> {
  if (!hasWebDistBuild()) {
    return null;
  }

  const shouldServeBody = method === 'GET';
  if (!shouldServeBody && method !== 'HEAD') {
    return null;
  }

  for (const candidate of buildWebCandidates(requestPath)) {
    const filePath = resolveStaticFilePath(candidate);
    if (!filePath) {
      continue;
    }

    try {
      const fileContents = await readFile(filePath);
      return new Response(shouldServeBody ? fileContents : null, {
        status: 200,
        headers: {
          'Content-Type': getMimeType(filePath),
          'Cache-Control': candidate.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      continue;
    }
  }

  return null;
}

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Type', 'Cache-Control'],
  maxAge: 86400,
}));

app.use('*', async (context, next) => {
  const startedAt = Date.now();
  console.log('[IVXOwnerAI-Hono] Incoming request:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
  });
  await next();
  console.log('[IVXOwnerAI-Hono] Request complete:', {
    method: context.req.method,
    path: context.req.path,
    status: context.res.status,
    durationMs: Date.now() - startedAt,
    marker: DEPLOYMENT_MARKER,
  });
});

app.get('/', async (context) => {
  const webResponse = await loadWebResponse('/', context.req.method);
  if (webResponse) {
    return webResponse;
  }

  return context.json({
    ok: true,
    status: 'ok',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
    frontend: 'https://chat.ivxholding.com',
    api: 'https://api.ivxholding.com',
    endpoints: [
      { method: 'GET', path: '/health', description: 'Liveness check' },
      { method: 'GET', path: '/readiness', description: 'Readiness check' },
      { method: 'GET', path: '/api/ivx/agent-jobs/live-activity', description: 'Live agent activity feed' },
      { method: 'GET', path: '/api/ivx/senior-developer/status', description: 'Senior developer runtime status' },
      { method: 'GET', path: '/api/ivx/senior-developer/credential-audit', description: 'GitHub/Render credential audit' },
      { method: 'POST', path: '/api/ivx/senior-developer/run', description: 'Run senior developer task' },
      { method: 'GET', path: '/api/ivx/senior-developer/features', description: 'List features the senior developer built from scratch (live production visibility)' },
      { method: 'GET', path: '/api/ivx/senior-developer/features/:slug', description: 'Get one generated feature by slug' },
    ],
    docsHint: 'Use GET /health for liveness, GET /readiness for readiness, POST /public/chat for the public chat frontend, and POST /chat for owner AI responses.',
  });
});

app.get('/health', (context) => {
  const publicChatHealth = getPublicChatHealthSnapshot();

  return context.json({
    ok: true,
    status: 'healthy',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
    sourceProof: OWNER_SIGNUP_AUDIT_SOURCE_PROOF,
    commit: LIVE_COMMIT_SHA,
    commitShort: LIVE_COMMIT_SHORT,
    bootTime: SERVER_BOOT_TIME,
    autonomousCoreRoutesRegistered: true,
    frontendUrl: 'https://chat.ivxholding.com',
    apiUrl: 'https://api.ivxholding.com',
    socketPath: '/socket.io',
    defaultRoomId: CHAT_DEFAULT_ROOM_ID,
    messageCount: publicChatStorage.getTotalMessageCount(),
    aiEnabled: publicChatHealth.aiEnabled,
    openAIModel: publicChatHealth.openAIModel,
    aiProvider: publicChatHealth.aiProvider,
    aiEndpoint: publicChatHealth.aiEndpoint,
    timestamp: nowIso(),
    routes: [
      'GET /',
      'GET /health',
      'GET /readiness',
      'POST /public/chat',
      'GET /api/public/messages',
      'GET /api/public/rooms',
      'POST /api/public/send-message',
      'POST /chat',
      'GET /messages',
      'POST /messages',
      'POST /upload',
      'GET /rooms',
      'POST /rooms',
      'POST /inbox/sync',
      'GET /diagnostics',
      'POST /fallback/reply',
      'POST /api/ivx/owner-ai',
      'GET /api/ivx/owner-ai/proxy-status',
      'POST /api/ivx/owner-ai/tools',
      'POST /tool',
      'POST /api/tool',
      'GET /api/ivx/audit-report',
      'GET /api/ivx/development-control',
      'POST /api/ivx/development-action',
      'GET /tool/render-status',
      'GET /tool/supabase-status',
      'GET /api/tool/render-status',
      'GET /api/tool/supabase-status',
      'GET /api/ivx/control-room/status',
      'GET /api/ivx/developer-deploy/status',
      'POST /api/ivx/developer-deploy/action',
      'GET /api/ivx/env-debug/render',
      'GET /api/ivx/variables-tool/status',
      'POST /api/ivx/variables-tool/save',
      'GET /api/ivx/owner-variables/status',
      'POST /api/ivx/owner-variables/save',
      'POST /api/ivx/owner-variables/test',
      'POST /api/ivx/owner-variables/delete',
      'POST /api/ivx/owner-variables/self-sync',
      'GET /api/ivx/independence/status',
      'GET /api/ivx/agent-jobs/status',
      'GET /api/ivx/agent-jobs',
      'POST /api/ivx/agent-jobs',
      'POST /api/ivx/agent-jobs/:jobId/retry',
      'POST /api/ivx/agent-jobs/:jobId/cancel',
      'POST /api/ivx/agent-jobs/:jobId/approve',
      'POST /api/ivx/agent-worker/run-once',
      'GET /api/ivx/agent-jobs/live-activity',
      'POST /api/ivx/agent-jobs/test-token',
      'POST /api/ivx/agent-jobs/test-run',
      'GET /api/ivx/ai-brain/tools',
      'POST /api/ivx/ai-brain/tools',
      'POST /api/ivx/ai-brain/tools/execute',
      'GET /api/ivx/supabase/tables',
      'GET /api/ivx/supabase/schema',
      'GET /api/ivx/supabase/columns',
      'GET /api/ivx/supabase/rls',
      'POST /api/ivx/supabase/owner-action',
      'GET /api/ivx/supabase/owner-action-health',
      'GET /api/ivx/owner-registration/status',
      'GET /api/ivx/owner-signup-audit',
      'POST /api/ivx/owner-registration',
      'POST /api/ivx/owner-registration/repair',
      'POST /api/ivx/owner-access-repair',
      'GET /api/ivx/owner-access-repair/status',
      'POST /api/assistant',
      'POST /api/plan-creator',
      'POST /api/upload/image',
      'POST /api/upload/pdf',
      'POST /api/upload/video',
      'POST /api/google-drive/import',
      'POST /api/files/:fileId/analyze',
      'POST /api/files/:fileId/summary',
      'GET /api/multimodal/status',
    ],
  });
});

// owner-ai-proof-test module: public full-stack proof endpoint.
app.options('/api/proof-test', () => proofTestOptions());
app.options('/proof-test', () => proofTestOptions());
app.get('/api/proof-test', (context) => handleProofTestRequest(context.req.raw));
app.get('/proof-test', (context) => handleProofTestRequest(context.req.raw));

// Owner-gated server-side chat-durability end-to-end proof (write -> read-back ->
// search -> count -> restart survival), computed where the secrets live.
app.options('/api/ivx/owner-ai/chat-durability-proof', () => chatDurabilityProofOptions());
app.options('/ivx/owner-ai/chat-durability-proof', () => chatDurabilityProofOptions());
app.get('/api/ivx/owner-ai/chat-durability-proof', (context) => handleChatDurabilityProofRequest(context.req.raw));
app.get('/ivx/owner-ai/chat-durability-proof', (context) => handleChatDurabilityProofRequest(context.req.raw));
app.post('/api/ivx/owner-ai/chat-durability-proof', (context) => handleChatDurabilityProofRequest(context.req.raw));
app.post('/ivx/owner-ai/chat-durability-proof', (context) => handleChatDurabilityProofRequest(context.req.raw));

// AI Project Dashboard: public-safe engineering health aggregation (no secrets).
app.options('/api/ivx/project-dashboard', () => projectDashboardOptions());
app.options('/ivx/project-dashboard', () => projectDashboardOptions());
app.get('/api/ivx/project-dashboard', (context) => handleProjectDashboardRequest(context.req.raw));
app.get('/ivx/project-dashboard', (context) => handleProjectDashboardRequest(context.req.raw));

app.get('/readiness', (context) => {
  return context.json({
    ok: true,
    ready: true,
    status: 'ok',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
  });
});

// IVX Senior Developer end-to-end proof feature.
// Created by the Senior Developer, committed to GitHub, and deployed to Render
// through POST /api/ivx/developer-deploy/action (owner-approved). This live
// route proves the full create -> commit -> deploy -> verify chain.
app.get('/api/ivx/feature/senior-dev-proof', (context) => {
  return context.json({
    ok: true,
    feature: 'senior-developer-end-to-end-proof',
    generatedBy: 'IVX Senior Developer',
    deploymentMarker: DEPLOYMENT_MARKER,
    commit: LIVE_COMMIT_SHA,
    commitShort: LIVE_COMMIT_SHORT,
    bootTime: SERVER_BOOT_TIME,
    message:
      'This route was created by the Senior Developer, committed to GitHub, and deployed to Render end-to-end.',
    timestamp: nowIso(),
  });
});

// Owner AI canonical paths
app.options('/ivx/owner-ai', () => ownerAIOptions());
app.options('/api/ivx/owner-ai', () => ownerAIOptions());
app.options('/ivx/owner-ai/tools', () => ownerAIOptions());
app.options('/api/ivx/owner-ai/tools', () => ownerAIOptions());
app.options('/tool', () => ownerAIOptions());
app.options('/api/tool', () => ownerAIOptions());
app.options('/tool/:toolName', () => ownerAIOptions());
app.options('/api/tool/:toolName', () => ownerAIOptions());
app.get('/ivx/owner-ai', () => GET());
app.get('/api/ivx/owner-ai', () => GET());
app.get('/tool/:toolName', async (context) => handleRenderProofToolRequest(context.req.param('toolName'), `/tool/${context.req.param('toolName')}`));
app.get('/api/tool/:toolName', async (context) => handleRenderProofToolRequest(context.req.param('toolName'), `/api/tool/${context.req.param('toolName')}`));
app.post('/ivx/owner-ai', async (context) => handleIVXOwnerAIRequest(context.req.raw));
app.post('/api/ivx/owner-ai', async (context) => handleIVXOwnerAIRequest(context.req.raw));
app.post('/ivx/owner-ai/tools', async (context) => handleIVXOwnerAIToolRequest(context.req.raw));
app.post('/api/ivx/owner-ai/tools', async (context) => handleIVXOwnerAIToolRequest(context.req.raw));
app.options('/api/ivx/owner-ai/proxy-status', () => ownerAIOptions());
app.get('/api/ivx/owner-ai/proxy-status', () => handleIVXOwnerAIProxyStatus());
app.options('/ivx/owner-ai/proxy-status', () => ownerAIOptions());
app.get('/ivx/owner-ai/proxy-status', () => handleIVXOwnerAIProxyStatus());
app.options('/api/ivx/owner-ai/diagnostics', () => ivxOwnerAIDiagnosticsOptions());
app.get('/api/ivx/owner-ai/diagnostics', async (context) => handleIVXOwnerAIDiagnosticsListRequest(context.req.raw));
app.options('/api/ivx/owner-ai/diagnostics/client-event', () => ivxOwnerAIDiagnosticsOptions());
app.post('/api/ivx/owner-ai/diagnostics/client-event', async (context) => handleIVXOwnerAIDiagnosticsClientEventRequest(context.req.raw));
app.options('/api/ivx/owner-ai/diagnostics/:requestId', () => ivxOwnerAIDiagnosticsOptions());
app.get('/api/ivx/owner-ai/diagnostics/:requestId', async (context) => handleIVXOwnerAIDiagnosticsGetRequest(context.req.raw, context.req.param('requestId')));
app.options('/api/ivx/owner-ai/auth-diagnostic', () => ivxOwnerAIAuthDiagnosticOptions());
app.get('/api/ivx/owner-ai/auth-diagnostic', () => handleIVXOwnerAIAuthDiagnosticGet());
app.post('/api/ivx/owner-ai/auth-diagnostic', async (context) => handleIVXOwnerAIAuthDiagnosticPost(context.req.raw));
app.options('/ivx/owner-ai/auth-diagnostic', () => ivxOwnerAIAuthDiagnosticOptions());
app.get('/ivx/owner-ai/auth-diagnostic', () => handleIVXOwnerAIAuthDiagnosticGet());
app.post('/ivx/owner-ai/auth-diagnostic', async (context) => handleIVXOwnerAIAuthDiagnosticPost(context.req.raw));

// Owner AI streaming (SSE) — renders partial tokens immediately, escapes the 10s watchdog wall
app.options('/api/ivx/owner-ai/stream', () => ownerAIStreamOptions());
app.post('/api/ivx/owner-ai/stream', async (context) => handleIVXOwnerAIStreamRequest(context.req.raw));
app.options('/ivx/owner-ai/stream', () => ownerAIStreamOptions());
app.post('/ivx/owner-ai/stream', async (context) => handleIVXOwnerAIStreamRequest(context.req.raw));

// Owner AI background generation jobs — for long analytical reports
app.options('/api/ivx/owner-ai/jobs', () => ownerAIJobsOptions());
app.post('/api/ivx/owner-ai/jobs', async (context) => handleIVXAIJobStartRequest(context.req.raw));
app.get('/api/ivx/owner-ai/jobs', async (context) => handleIVXAIJobsListRequest(context.req.raw));
app.options('/api/ivx/owner-ai/jobs/:jobId', () => ownerAIJobsOptions());
app.get('/api/ivx/owner-ai/jobs/:jobId', async (context) => handleIVXAIJobStatusRequest(context.req.raw, context.req.param('jobId')));

// Owner AI runtime observability — queue depth + provider telemetry summary
app.options('/api/ivx/owner-ai/runtime', () => ownerAIJobsOptions());
app.get('/api/ivx/owner-ai/runtime', async (context) => handleIVXAIRuntimeObservabilityRequest(context.req.raw));

// IVX IA Brain Memory — durable owner/user-profile memory (view/edit/delete + greeting)
app.options('/api/ivx/ia-memory', () => handleIVXIaMemoryOptions());
app.get('/api/ivx/ia-memory', async (context) => handleIVXIaMemoryListRequest(context.req.raw));
app.post('/api/ivx/ia-memory', async (context) => handleIVXIaMemoryUpsertRequest(context.req.raw));
app.options('/api/ivx/ia-memory/greeting', () => handleIVXIaMemoryOptions());
app.get('/api/ivx/ia-memory/greeting', async (context) => handleIVXIaMemoryGreetingRequest(context.req.raw));
app.options('/api/ivx/ia-memory/forget-name', () => handleIVXIaMemoryOptions());
app.post('/api/ivx/ia-memory/forget-name', async (context) => handleIVXIaMemoryForgetNameRequest(context.req.raw));
app.options('/api/ivx/ia-memory/:userId', () => handleIVXIaMemoryOptions());
app.delete('/api/ivx/ia-memory/:userId', async (context) => handleIVXIaMemoryDeleteRequest(context.req.raw, context.req.param('userId')));
app.options('/api/ivx/owner-audit/recent-conversations', () => handleIVXOwnerAuditOptions());
app.get('/api/ivx/owner-audit/recent-conversations', async (context) => handleIVXOwnerAuditRecentConversationsRequest(context.req.raw));
app.options('/ivx/owner-audit/recent-conversations', () => handleIVXOwnerAuditOptions());
app.get('/ivx/owner-audit/recent-conversations', async (context) => handleIVXOwnerAuditRecentConversationsRequest(context.req.raw));
app.post('/tool', async (context) => handleIVXOwnerAIToolRequest(context.req.raw));
app.post('/api/tool', async (context) => handleIVXOwnerAIToolRequest(context.req.raw));

app.options('/api/ivx/audit-report', () => auditReportOptions());
app.get('/api/ivx/audit-report', async (context) => handleIVXAuditReportRequest(context.req.raw));

// Enterprise persistent audit jobs — background, resumable, indexed, 1–5000+ items
app.options('/api/ivx/audit-jobs', () => auditJobsOptions());
app.post('/api/ivx/audit-jobs', async (context) => handleStartAuditJobRequest(context.req.raw));
app.get('/api/ivx/audit-jobs', async (context) => handleListAuditJobsRequest(context.req.raw));
app.options('/api/ivx/audit-jobs/:jobId', () => auditJobsOptions());
app.get('/api/ivx/audit-jobs/:jobId', async (context) => handleAuditJobStatusRequest(context.req.raw, context.req.param('jobId')));
app.get('/api/ivx/audit-jobs/:jobId/chunks', async (context) => handleAuditJobChunksRequest(context.req.raw, context.req.param('jobId')));
app.get('/api/ivx/audit-jobs/:jobId/export', async (context) => handleAuditJobExportRequest(context.req.raw, context.req.param('jobId')));
app.options('/api/ivx/audit-jobs/:jobId/resume', () => auditJobsOptions());
app.post('/api/ivx/audit-jobs/:jobId/resume', async (context) => handleResumeAuditJobRequest(context.req.raw, context.req.param('jobId')));
app.post('/api/ivx/audit-jobs/:jobId/pause', async (context) => handlePauseAuditJobRequest(context.req.raw, context.req.param('jobId')));
app.post('/api/ivx/audit-jobs/:jobId/cancel', async (context) => handleCancelAuditJobRequest(context.req.raw, context.req.param('jobId')));

// Crash-safe task orchestrator — split a large owner task into durable blocks,
// execute one at a time, persist after each, resume from the cursor after a crash.
app.options('/api/ivx/tasks', () => taskOrchestratorOptions());
app.post('/api/ivx/tasks', async (context) => handleStartTaskRequest(context.req.raw));
app.get('/api/ivx/tasks', async (context) => handleListTasksRequest(context.req.raw));
app.options('/api/ivx/tasks/:taskId', () => taskOrchestratorOptions());
app.get('/api/ivx/tasks/:taskId', async (context) => handleTaskStatusRequest(context.req.raw, context.req.param('taskId')));
app.get('/api/ivx/tasks/:taskId/blocks', async (context) => handleTaskBlocksRequest(context.req.raw, context.req.param('taskId')));
app.get('/api/ivx/tasks/:taskId/events', async (context) => handleTaskEventsRequest(context.req.raw, context.req.param('taskId')));
app.get('/api/ivx/tasks/:taskId/review', async (context) => handleTaskReviewRequest(context.req.raw, context.req.param('taskId')));
app.options('/api/ivx/tasks/:taskId/resume', () => taskOrchestratorOptions());
app.post('/api/ivx/tasks/:taskId/resume', async (context) => handleResumeTaskRequest(context.req.raw, context.req.param('taskId')));
app.post('/api/ivx/tasks/:taskId/pause', async (context) => handlePauseTaskRequest(context.req.raw, context.req.param('taskId')));
app.post('/api/ivx/tasks/:taskId/cancel', async (context) => handleCancelTaskRequest(context.req.raw, context.req.param('taskId')));

// Autonomous Core — unified status surface for the senior-developer agent.
app.options('/api/ivx/autonomous-core/lifecycle-proof', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/lifecycle-proof', async (context) => handleLifecycleProofRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/dashboard', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/dashboard', async (context) => handleAutonomousDashboardRequest(context.req.raw));
app.options('/api/ivx/handoff/readiness', () => autonomousCoreOptions());
app.get('/api/ivx/handoff/readiness', async (context) => handleHandoffReadinessRequest(context.req.raw));
app.options('/api/ivx/capabilities', () => capabilitiesOptions());
app.get('/api/ivx/capabilities', async (context) => handleCapabilityRegistryRequest(context.req.raw));
app.options('/api/ivx/capabilities/:capabilityId', () => capabilitiesOptions());
app.get('/api/ivx/capabilities/:capabilityId', async (context) => handleCapabilityByIdRequest(context.req.raw, context.req.param('capabilityId')));
app.options('/api/ivx/readiness', () => capabilitiesOptions());
app.get('/api/ivx/readiness', async (context) => handleReadinessRequest(context.req.raw));
// Universal App Generator (owner-only) — generate full app/module scaffold blueprints.
app.options('/api/ivx/app-generator', () => appGeneratorOptions());
app.get('/api/ivx/app-generator', async (context) => handleAppGeneratorStatusRequest(context.req.raw));
app.options('/api/ivx/app-generator/status', () => appGeneratorOptions());
app.get('/api/ivx/app-generator/status', async (context) => handleAppGeneratorStatusRequest(context.req.raw));
app.options('/api/ivx/app-generator/generate', () => appGeneratorOptions());
app.post('/api/ivx/app-generator/generate', async (context) => handleAppGeneratorGenerateRequest(context.req.raw));
app.options('/api/ivx/app-generator/plan', () => appGeneratorOptions());
app.post('/api/ivx/app-generator/plan', async (context) => handleAppGeneratorPlanRequest(context.req.raw));
app.options('/api/ivx/app-generator/files-preview', () => appGeneratorOptions());
app.post('/api/ivx/app-generator/files-preview', async (context) => handleAppGeneratorFilesPreviewRequest(context.req.raw));
app.options('/api/ivx/app-generator/deploy-request', () => appGeneratorOptions());
app.post('/api/ivx/app-generator/deploy-request', async (context) => handleAppGeneratorDeployRequest(context.req.raw));
app.options('/api/ivx/app-generator/register', () => appGeneratorOptions());
app.post('/api/ivx/app-generator/register', async (context) => handleAppGeneratorRegisterRequest(context.req.raw));
// Credential Readiness (owner-only) — presence/diagnostics/approval-gate/deploy-token/fallback.
app.options('/api/ivx/credentials', () => credentialReadinessOptions());
app.get('/api/ivx/credentials', async (context) => handleCredentialReadinessRequest(context.req.raw));
app.options('/api/ivx/credentials/deployment', () => credentialReadinessOptions());
app.get('/api/ivx/credentials/deployment', async (context) => handleCredentialDeploymentRequest(context.req.raw));
app.options('/api/ivx/credentials/approval-gate', () => credentialReadinessOptions());
app.post('/api/ivx/credentials/approval-gate', async (context) => handleCredentialApprovalGateRequest(context.req.raw));
// Multimodal stack — image/video understanding, image + 3D generation (owner-only).
app.options('/api/ivx/multimodal/status', () => multimodalStackOptions());
app.get('/api/ivx/multimodal/status', async (context) => handleMultimodalStatusRequest(context.req.raw));
app.options('/api/ivx/multimodal/generate-image', () => multimodalStackOptions());
app.post('/api/ivx/multimodal/generate-image', async (context) => handleMultimodalGenerateImageRequest(context.req.raw));
app.options('/api/ivx/multimodal/understand-video', () => multimodalStackOptions());
app.post('/api/ivx/multimodal/understand-video', async (context) => handleMultimodalUnderstandVideoRequest(context.req.raw));
app.options('/api/ivx/multimodal/generate-3d', () => multimodalStackOptions());
app.post('/api/ivx/multimodal/generate-3d', async (context) => handleMultimodalGenerate3DRequest(context.req.raw));
// Self-Upgrade Tool System — registry / installer / tester / self-upgrade / dashboard (owner-only).
app.options('/api/ivx/tool-system/dashboard', () => toolSystemOptions());
app.get('/api/ivx/tool-system/dashboard', async (context) => handleToolSystemDashboardRequest(context.req.raw));
app.options('/api/ivx/tool-system/tools', () => toolSystemOptions());
app.get('/api/ivx/tool-system/tools', async (context) => handleToolSystemToolsRequest(context.req.raw));
app.options('/api/ivx/tool-system/catalog', () => toolSystemOptions());
app.get('/api/ivx/tool-system/catalog', async (context) => handleToolSystemCatalogRequest(context.req.raw));
app.options('/api/ivx/tool-system/install', () => toolSystemOptions());
app.post('/api/ivx/tool-system/install', async (context) => handleToolSystemInstallRequest(context.req.raw));
app.options('/api/ivx/tool-system/self-upgrade', () => toolSystemOptions());
app.post('/api/ivx/tool-system/self-upgrade', async (context) => handleToolSystemSelfUpgradeRequest(context.req.raw));
app.options('/api/ivx/tool-system/use', () => toolSystemOptions());
app.post('/api/ivx/tool-system/use', async (context) => handleToolSystemUseRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/priority-queue', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/priority-queue', async (context) => handlePriorityQueueRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/self-heal', () => autonomousCoreOptions());
app.post('/api/ivx/autonomous-core/self-heal', async (context) => handleSelfHealRunRequest(context.req.raw));
app.get('/api/ivx/autonomous-core/self-heal', async (context) => handleSelfHealListRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/code-index', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/code-index', async (context) => handleCodeIndexRequest(context.req.raw));
app.get('/api/ivx/autonomous-core/code-index/summary', async (context) => handleCodeIndexSummaryRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/code-index/rebuild', () => autonomousCoreOptions());
app.post('/api/ivx/autonomous-core/code-index/rebuild', async (context) => handleCodeIndexRebuildRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/audit-items', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/audit-items', async (context) => handleAuditItemSetsListRequest(context.req.raw));
app.post('/api/ivx/autonomous-core/audit-items', async (context) => handleAuditItemSetCreateRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/audit-items/:auditId', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/audit-items/:auditId', async (context) => handleAuditItemSetGetRequest(context.req.raw, context.req.param('auditId')));
app.post('/api/ivx/autonomous-core/audit-items/:auditId/items', async (context) => handleAuditItemsUpsertRequest(context.req.raw, context.req.param('auditId')));
app.post('/api/ivx/autonomous-core/audit-items/:auditId/status', async (context) => handleAuditItemStatusRequest(context.req.raw, context.req.param('auditId')));
app.options('/api/ivx/autonomous-core/code-graph', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/code-graph', async (context) => handleCodeGraphRequest(context.req.raw));
app.get('/api/ivx/autonomous-core/code-graph/summary', async (context) => handleCodeGraphSummaryRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/code-graph/rebuild', () => autonomousCoreOptions());
app.post('/api/ivx/autonomous-core/code-graph/rebuild', async (context) => handleCodeGraphRebuildRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/blast-radius', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/blast-radius', async (context) => handleBlastRadiusRequest(context.req.raw));
app.options('/api/ivx/autonomous-core/continuous', () => autonomousCoreOptions());
app.get('/api/ivx/autonomous-core/continuous', async (context) => handleContinuousGetRequest(context.req.raw));
app.post('/api/ivx/autonomous-core/continuous/start', async (context) => handleContinuousStartRequest(context.req.raw));
app.post('/api/ivx/autonomous-core/continuous/stop', async (context) => handleContinuousStopRequest(context.req.raw));
app.post('/api/ivx/autonomous-core/continuous/advance', async (context) => handleContinuousAdvanceRequest(context.req.raw));
app.options('/api/ivx/autonomous-scale/dashboard', () => autonomousScaleOptions());
app.get('/api/ivx/autonomous-scale/dashboard', async (context) => handleScaleDashboardRequest(context.req.raw));
app.options('/api/ivx/autonomous-scale/reports', () => autonomousScaleOptions());
app.get('/api/ivx/autonomous-scale/reports', async (context) => handleScaleReportsRequest(context.req.raw));
app.options('/api/ivx/autonomous-scale/run', () => autonomousScaleOptions());
app.post('/api/ivx/autonomous-scale/run', async (context) => handleScaleRunRequest(context.req.raw));
app.options('/api/ivx/autonomous-scale/enable', () => autonomousScaleOptions());
app.post('/api/ivx/autonomous-scale/enable', async (context) => handleScaleEnableRequest(context.req.raw));

// IVX Autonomous Innovation System (owner-only): Innovation Engine + Research Lab + Innovation Dashboard.
app.options('/api/ivx/innovation/dashboard', () => innovationOptions());
app.get('/api/ivx/innovation/dashboard', async (context) => handleInnovationDashboardRequest(context.req.raw));
app.options('/api/ivx/innovation/scan', () => innovationOptions());
app.post('/api/ivx/innovation/scan', async (context) => handleInnovationScanRequest(context.req.raw));
app.options('/api/ivx/innovation/ideas', () => innovationOptions());
app.get('/api/ivx/innovation/ideas', async (context) => handleInnovationIdeasListRequest(context.req.raw));
app.options('/api/ivx/innovation/ideas/:ideaId/status', () => innovationOptions());
app.post('/api/ivx/innovation/ideas/:ideaId/status', async (context) => handleInnovationIdeaStatusRequest(context.req.raw, context.req.param('ideaId')));
app.options('/api/ivx/innovation/hypotheses', () => innovationOptions());
app.get('/api/ivx/innovation/hypotheses', async (context) => handleInnovationHypothesesListRequest(context.req.raw));
app.post('/api/ivx/innovation/hypotheses', async (context) => handleInnovationHypothesisCreateRequest(context.req.raw));
app.options('/api/ivx/innovation/hypotheses/:hypothesisId/status', () => innovationOptions());
app.post('/api/ivx/innovation/hypotheses/:hypothesisId/status', async (context) => handleInnovationHypothesisStatusRequest(context.req.raw, context.req.param('hypothesisId')));
app.options('/api/ivx/innovation/experiments', () => innovationOptions());
app.get('/api/ivx/innovation/experiments', async (context) => handleInnovationExperimentsListRequest(context.req.raw));
app.post('/api/ivx/innovation/experiments', async (context) => handleInnovationExperimentCreateRequest(context.req.raw));
app.options('/api/ivx/innovation/experiments/:experimentId', () => innovationOptions());
app.post('/api/ivx/innovation/experiments/:experimentId', async (context) => handleInnovationExperimentUpdateRequest(context.req.raw, context.req.param('experimentId')));

app.options('/api/ivx/opportunity/dashboard', () => opportunityOptions());
app.get('/api/ivx/opportunity/dashboard', async (context) => handleOpportunityDashboardRequest(context.req.raw));
app.options('/api/ivx/opportunity/scan', () => opportunityOptions());
app.post('/api/ivx/opportunity/scan', async (context) => handleOpportunityScanRequest(context.req.raw));
app.options('/api/ivx/opportunity/opportunities', () => opportunityOptions());
app.get('/api/ivx/opportunity/opportunities', async (context) => handleOpportunityListRequest(context.req.raw));
app.options('/api/ivx/opportunity/best', () => opportunityOptions());
app.get('/api/ivx/opportunity/best', async (context) => handleOpportunityBestRequest(context.req.raw));
app.options('/api/ivx/opportunity/research', () => opportunityOptions());
app.get('/api/ivx/opportunity/research', async (context) => handleOpportunityResearchRequest(context.req.raw));
app.options('/api/ivx/opportunity/alerts', () => opportunityOptions());
app.get('/api/ivx/opportunity/alerts', async (context) => handleOpportunityAlertsRequest(context.req.raw));
app.options('/api/ivx/opportunity/alerts/:alertId/ack', () => opportunityOptions());
app.post('/api/ivx/opportunity/alerts/:alertId/ack', async (context) => handleOpportunityAlertAckRequest(context.req.raw, context.req.param('alertId')));
app.options('/api/ivx/opportunity/:opportunityId/status', () => opportunityOptions());
app.post('/api/ivx/opportunity/:opportunityId/status', async (context) => handleOpportunityStatusRequest(context.req.raw, context.req.param('opportunityId')));

app.options('/api/ivx/investor-discovery', () => investorDiscoveryOptions());
app.get('/api/ivx/investor-discovery', async (context) => handleInvestorDiscoveryGetRequest(context.req.raw));
app.options('/api/ivx/investor-discovery/scan', () => investorDiscoveryOptions());
app.post('/api/ivx/investor-discovery/scan', async (context) => handleInvestorDiscoveryScanRequest(context.req.raw));

app.options('/api/ivx/capital-network/dashboard', () => capitalNetworkOptions());
app.get('/api/ivx/capital-network/dashboard', async (context) => handleCapitalNetworkDashboardRequest(context.req.raw));
app.options('/api/ivx/capital-network/scan', () => capitalNetworkOptions());
app.post('/api/ivx/capital-network/scan', async (context) => handleCapitalNetworkScanRequest(context.req.raw));
app.options('/api/ivx/capital-network/prospects', () => capitalNetworkOptions());
app.get('/api/ivx/capital-network/prospects', async (context) => handleCapitalNetworkProspectsRequest(context.req.raw));
app.options('/api/ivx/capital-network/outreach', () => capitalNetworkOptions());
app.get('/api/ivx/capital-network/outreach', async (context) => handleCapitalOutreachRequest(context.req.raw));
app.options('/api/ivx/capital-network/:prospectId/status', () => capitalNetworkOptions());
app.post('/api/ivx/capital-network/:prospectId/status', async (context) => handleCapitalNetworkStatusRequest(context.req.raw, context.req.param('prospectId')));
app.options('/api/ivx/capital-network/:prospectId/action-plan', () => capitalNetworkOptions());
app.post('/api/ivx/capital-network/:prospectId/action-plan', async (context) => handleCapitalProspectActionPlanRequest(context.req.raw, context.req.param('prospectId')));
app.options('/api/ivx/capital-network/:prospectId/research', () => capitalNetworkOptions());
app.post('/api/ivx/capital-network/:prospectId/research', async (context) => handleCapitalProspectResearchRequest(context.req.raw, context.req.param('prospectId')));
app.options('/api/ivx/capital-network/:prospectId/outreach-draft', () => capitalNetworkOptions());
app.post('/api/ivx/capital-network/:prospectId/outreach-draft', async (context) => handleCapitalProspectOutreachDraftRequest(context.req.raw, context.req.param('prospectId')));

app.options('/api/ivx/investors', () => investorCrmOptions());
app.get('/api/ivx/investors', async (context) => handleInvestorListRequest(context.req.raw));
app.post('/api/ivx/investors', async (context) => handleInvestorCreateRequest(context.req.raw));
app.options('/api/ivx/investors/import', () => investorCrmOptions());
app.post('/api/ivx/investors/import', async (context) => handleInvestorImportRequest(context.req.raw));
app.options('/api/ivx/investors/:investorId', () => investorCrmOptions());
app.get('/api/ivx/investors/:investorId', async (context) => handleInvestorGetRequest(context.req.raw, context.req.param('investorId')));
app.post('/api/ivx/investors/:investorId', async (context) => handleInvestorUpdateRequest(context.req.raw, context.req.param('investorId')));
app.options('/api/ivx/investors/:investorId/status', () => investorCrmOptions());
app.post('/api/ivx/investors/:investorId/status', async (context) => handleInvestorStatusRequest(context.req.raw, context.req.param('investorId')));
app.options('/api/ivx/investors/:investorId/delete', () => investorCrmOptions());
app.post('/api/ivx/investors/:investorId/delete', async (context) => handleInvestorDeleteRequest(context.req.raw, context.req.param('investorId')));

app.options('/api/ivx/capital-pipeline', () => capitalPipelineOptions());
app.get('/api/ivx/capital-pipeline', async (context) => handlePipelineListRequest(context.req.raw));
app.post('/api/ivx/capital-pipeline', async (context) => handlePipelineCreateRequest(context.req.raw));
app.options('/api/ivx/capital-pipeline/:entryId', () => capitalPipelineOptions());
app.get('/api/ivx/capital-pipeline/:entryId', async (context) => handlePipelineGetRequest(context.req.raw, context.req.param('entryId')));
app.post('/api/ivx/capital-pipeline/:entryId', async (context) => handlePipelineUpdateRequest(context.req.raw, context.req.param('entryId')));
app.options('/api/ivx/capital-pipeline/:entryId/stage', () => capitalPipelineOptions());
app.post('/api/ivx/capital-pipeline/:entryId/stage', async (context) => handlePipelineStageRequest(context.req.raw, context.req.param('entryId')));
app.options('/api/ivx/capital-pipeline/:entryId/delete', () => capitalPipelineOptions());
app.post('/api/ivx/capital-pipeline/:entryId/delete', async (context) => handlePipelineDeleteRequest(context.req.raw, context.req.param('entryId')));

app.options('/api/ivx/outreach', () => outreachOptions());
app.get('/api/ivx/outreach', async (context) => handleOutreachListRequest(context.req.raw));
app.post('/api/ivx/outreach', async (context) => handleOutreachCreateRequest(context.req.raw));
app.options('/api/ivx/outreach/draft', () => outreachOptions());
app.post('/api/ivx/outreach/draft', async (context) => handleOutreachPreviewRequest(context.req.raw));
app.options('/api/ivx/outreach/:messageId', () => outreachOptions());
app.get('/api/ivx/outreach/:messageId', async (context) => handleOutreachGetRequest(context.req.raw, context.req.param('messageId')));
app.post('/api/ivx/outreach/:messageId', async (context) => handleOutreachUpdateRequest(context.req.raw, context.req.param('messageId')));
app.options('/api/ivx/outreach/:messageId/submit', () => outreachOptions());
app.post('/api/ivx/outreach/:messageId/submit', async (context) => handleOutreachSubmitRequest(context.req.raw, context.req.param('messageId')));
app.options('/api/ivx/outreach/:messageId/approve', () => outreachOptions());
app.post('/api/ivx/outreach/:messageId/approve', async (context) => handleOutreachApproveRequest(context.req.raw, context.req.param('messageId')));
app.options('/api/ivx/outreach/:messageId/send', () => outreachOptions());
app.post('/api/ivx/outreach/:messageId/send', async (context) => handleOutreachSendRequest(context.req.raw, context.req.param('messageId')));
app.options('/api/ivx/outreach/:messageId/engagement', () => outreachOptions());
app.post('/api/ivx/outreach/:messageId/engagement', async (context) => handleOutreachEngagementRequest(context.req.raw, context.req.param('messageId')));
app.options('/api/ivx/outreach/:messageId/delete', () => outreachOptions());
app.post('/api/ivx/outreach/:messageId/delete', async (context) => handleOutreachDeleteRequest(context.req.raw, context.req.param('messageId')));

app.options('/api/ivx/lead-scoring', () => leadScoringOptions());
app.get('/api/ivx/lead-scoring', async (context) => handleLeadScoringRequest(context.req.raw));

// BLOCK 98 — Power Tools Core: Lead Capture Engine + CRM pipeline + Deal Packet Builder + dashboard.
app.options('/api/ivx/leads/capture', () => powerToolsOptions());
app.post('/api/ivx/leads/capture', async (context) => handleLeadCaptureRequest(context.req.raw)); // PUBLIC inbound capture
app.options('/api/ivx/leads', () => powerToolsOptions());
app.get('/api/ivx/leads', async (context) => handleLeadListRequest(context.req.raw));
app.options('/api/ivx/leads/:leadId', () => powerToolsOptions());
app.get('/api/ivx/leads/:leadId', async (context) => handleLeadGetRequest(context.req.raw, context.req.param('leadId')));
app.options('/api/ivx/leads/:leadId/behavior', () => powerToolsOptions());
app.post('/api/ivx/leads/:leadId/behavior', async (context) => handleLeadBehaviorRequest(context.req.raw, context.req.param('leadId')));
app.options('/api/ivx/leads/:leadId/stage', () => powerToolsOptions());
app.post('/api/ivx/leads/:leadId/stage', async (context) => handleLeadStageRequest(context.req.raw, context.req.param('leadId')));
app.options('/api/ivx/leads/:leadId/follow-up', () => powerToolsOptions());
app.post('/api/ivx/leads/:leadId/follow-up', async (context) => handleLeadFollowUpRequest(context.req.raw, context.req.param('leadId')));
app.options('/api/ivx/leads/:leadId/delete', () => powerToolsOptions());
app.post('/api/ivx/leads/:leadId/delete', async (context) => handleLeadDeleteRequest(context.req.raw, context.req.param('leadId')));

app.options('/api/ivx/deal-packets', () => powerToolsOptions());
app.get('/api/ivx/deal-packets', async (context) => handleDealPacketListRequest(context.req.raw));
app.post('/api/ivx/deal-packets', async (context) => handleDealPacketCreateRequest(context.req.raw));
app.options('/api/ivx/deal-packets/:packetId', () => powerToolsOptions());
app.get('/api/ivx/deal-packets/:packetId', async (context) => handleDealPacketGetRequest(context.req.raw, context.req.param('packetId')));
app.options('/api/ivx/deal-packets/:packetId/item', () => powerToolsOptions());
app.post('/api/ivx/deal-packets/:packetId/item', async (context) => handleDealPacketItemRequest(context.req.raw, context.req.param('packetId')));
app.options('/api/ivx/deal-packets/:packetId/delete', () => powerToolsOptions());
app.post('/api/ivx/deal-packets/:packetId/delete', async (context) => handleDealPacketDeleteRequest(context.req.raw, context.req.param('packetId')));

app.options('/api/ivx/power-tools/dashboard', () => powerToolsOptions());
app.get('/api/ivx/power-tools/dashboard', async (context) => handlePowerToolsDashboardRequest(context.req.raw));
app.options('/api/ivx/power-tools/draft', () => powerToolsOptions());
app.post('/api/ivx/power-tools/draft', async (context) => handlePowerToolsDraftRequest(context.req.raw));

app.options('/api/ivx/gmail/status', () => gmailOptions());
app.get('/api/ivx/gmail/status', async (context) => handleGmailStatusRequest(context.req.raw));
app.options('/api/ivx/gmail/connect', () => gmailOptions());
app.post('/api/ivx/gmail/connect', async (context) => handleGmailConnectRequest(context.req.raw));
app.options('/api/ivx/gmail/disconnect', () => gmailOptions());
app.post('/api/ivx/gmail/disconnect', async (context) => handleGmailDisconnectRequest(context.req.raw));
app.options('/api/ivx/gmail/refresh', () => gmailOptions());
app.post('/api/ivx/gmail/refresh', async (context) => handleGmailRefreshRequest(context.req.raw));
app.options('/api/ivx/gmail/test', () => gmailOptions());
app.post('/api/ivx/gmail/test', async (context) => handleGmailTestRequest(context.req.raw));
app.options('/api/ivx/gmail/drafts', () => gmailOptions());
app.get('/api/ivx/gmail/drafts', async (context) => handleGmailDraftsListRequest(context.req.raw));
app.options('/api/ivx/gmail/draft', () => gmailOptions());
app.post('/api/ivx/gmail/draft', async (context) => handleGmailDraftCreateRequest(context.req.raw));

app.options('/api/ivx/deal-matching', () => dealMatchingOptions());
app.get('/api/ivx/deal-matching', async (context) => handleDealMatchingRequest(context.req.raw));

app.options('/api/ivx/deal-tracking', () => dealTrackingOptions());
app.get('/api/ivx/deal-tracking', async (context) => handleDealTrackingListRequest(context.req.raw));
app.post('/api/ivx/deal-tracking', async (context) => handleDealTrackingCreateRequest(context.req.raw));
app.options('/api/ivx/deal-tracking/:dealId', () => dealTrackingOptions());
app.get('/api/ivx/deal-tracking/:dealId', async (context) => handleDealTrackingGetRequest(context.req.raw, context.req.param('dealId')));
app.post('/api/ivx/deal-tracking/:dealId', async (context) => handleDealTrackingUpdateRequest(context.req.raw, context.req.param('dealId')));
app.options('/api/ivx/deal-tracking/:dealId/milestone', () => dealTrackingOptions());
app.post('/api/ivx/deal-tracking/:dealId/milestone', async (context) => handleDealTrackingMilestoneRequest(context.req.raw, context.req.param('dealId')));
app.options('/api/ivx/deal-tracking/:dealId/status', () => dealTrackingOptions());
app.post('/api/ivx/deal-tracking/:dealId/status', async (context) => handleDealTrackingStatusRequest(context.req.raw, context.req.param('dealId')));
app.options('/api/ivx/deal-tracking/:dealId/delete', () => dealTrackingOptions());
app.post('/api/ivx/deal-tracking/:dealId/delete', async (context) => handleDealTrackingDeleteRequest(context.req.raw, context.req.param('dealId')));

app.options('/api/ivx/deal-pipeline/seed', () => dealPipelineSeedOptions());
app.post('/api/ivx/deal-pipeline/seed', async (context) => handleDealPipelineSeedRequest(context.req.raw));

app.options('/api/ivx/capital-command-center', () => capitalCommandCenterOptions());
app.get('/api/ivx/capital-command-center', async (context) => handleCapitalCommandCenterRequest(context.req.raw));
app.options('/api/ivx/capital-command-center/activity', () => capitalCommandCenterOptions());
app.get('/api/ivx/capital-command-center/activity', async (context) => handleCapitalCommandActivityRequest(context.req.raw));
app.options('/api/ivx/capital-command-center/best-investor', () => capitalCommandCenterOptions());
app.post('/api/ivx/capital-command-center/best-investor', async (context) => handleBestInvestorWorkflowRequest(context.req.raw));

app.options('/api/ivx/business-impact/dashboard', () => businessImpactOptions());
app.get('/api/ivx/business-impact/dashboard', async (context) => handleBusinessImpactDashboardRequest(context.req.raw));
app.options('/api/ivx/executive-layer', () => executiveLayerOptions());
app.get('/api/ivx/executive-layer', async (context) => handleExecutiveLayerRequest(context.req.raw));
app.options('/api/ivx/daily-report', () => dailyReportOptions());
app.get('/api/ivx/daily-report', async (context) => handleDailyReportLatest(context.req.raw));
app.post('/api/ivx/daily-report', async (context) => handleDailyReportGenerate(context.req.raw));
app.options('/api/ivx/daily-report/preview', () => dailyReportOptions());
app.post('/api/ivx/daily-report/preview', async (context) => handleDailyReportPreview(context.req.raw));
app.options('/api/ivx/daily-report/history', () => dailyReportOptions());
app.get('/api/ivx/daily-report/history', async (context) => handleDailyReportHistory(context.req.raw));
app.options('/api/ivx/technology-discovery', () => technologyDiscoveryOptions());
app.get('/api/ivx/technology-discovery', async (context) => handleTechnologyDiscoveryStatusRequest(context.req.raw));
app.options('/api/ivx/technology-discovery/scan', () => technologyDiscoveryOptions());
app.post('/api/ivx/technology-discovery/scan', async (context) => handleTechnologyDiscoveryScanRequest(context.req.raw));
app.options('/api/ivx/rork-independence', () => rorkIndependenceOptions());
app.get('/api/ivx/rork-independence', async (context) => handleRorkIndependenceRequest(context.req.raw));

app.options('/api/ivx/memory', () => unifiedMemoryOptions());
app.get('/api/ivx/memory', async (context) => handleMemoryListRequest(context.req.raw));
app.post('/api/ivx/memory', async (context) => handleMemoryCreateRequest(context.req.raw));
app.options('/api/ivx/memory/summary', () => unifiedMemoryOptions());
app.get('/api/ivx/memory/summary', async (context) => handleMemorySummaryRequest(context.req.raw));
app.options('/api/ivx/memory/:id', () => unifiedMemoryOptions());
app.get('/api/ivx/memory/:id', async (context) => handleMemoryGetRequest(context.req.raw, context.req.param('id')));
app.post('/api/ivx/memory/:id', async (context) => handleMemoryUpdateRequest(context.req.raw, context.req.param('id')));
app.options('/api/ivx/memory/:id/forget', () => unifiedMemoryOptions());
app.post('/api/ivx/memory/:id/forget', async (context) => handleMemoryForgetRequest(context.req.raw, context.req.param('id')));

app.options('/api/ivx/action-loop', () => actionLoopOptions());
app.get('/api/ivx/action-loop', async (context) => handleActionLoopListRequest(context.req.raw));
app.post('/api/ivx/action-loop', async (context) => handleActionLoopCreateRequest(context.req.raw));
app.options('/api/ivx/action-loop/learning', () => actionLoopOptions());
app.get('/api/ivx/action-loop/learning', async (context) => handleActionLoopLearningRequest(context.req.raw));
app.options('/api/ivx/action-loop/:id', () => actionLoopOptions());
app.get('/api/ivx/action-loop/:id', async (context) => handleActionLoopGetRequest(context.req.raw, context.req.param('id')));
app.options('/api/ivx/action-loop/:id/execution', () => actionLoopOptions());
app.post('/api/ivx/action-loop/:id/execution', async (context) => handleActionLoopExecutionRequest(context.req.raw, context.req.param('id')));
app.options('/api/ivx/action-loop/:id/outcome', () => actionLoopOptions());
app.post('/api/ivx/action-loop/:id/outcome', async (context) => handleActionLoopOutcomeRequest(context.req.raw, context.req.param('id')));

app.options('/api/ivx/live-work/feed', () => liveWorkOptions());
app.get('/api/ivx/live-work/feed', async (context) => handleLiveWorkFeedRequest(context.req.raw));
app.options('/api/ivx/live-work/agents', () => liveWorkOptions());
app.get('/api/ivx/live-work/agents', async (context) => handleLiveWorkAgentsRequest(context.req.raw));
app.options('/api/ivx/live-work/check-supabase', () => liveWorkOptions());
app.post('/api/ivx/live-work/check-supabase', async (context) => handleLiveWorkCheckSupabaseRequest(context.req.raw));
app.options('/api/ivx/execution-trace', () => executionTraceOptions());
app.get('/api/ivx/execution-trace', async (context) => handleExecutionTraceListRequest(context.req.raw));
app.options('/api/ivx/execution-trace/:id', () => executionTraceOptions());
app.get('/api/ivx/execution-trace/:id', async (context) => handleExecutionTraceGetRequest(context.req.raw, context.req.param('id')));

app.options('/api/ivx/autonomous-mode/tools', () => autonomousModeOptions());
app.get('/api/ivx/autonomous-mode/tools', async (context) => handleAutonomousModeToolsRequest(context.req.raw));
app.options('/api/ivx/autonomous-mode/run', () => autonomousModeOptions());
app.post('/api/ivx/autonomous-mode/run', async (context) => handleAutonomousModeRunRequest(context.req.raw));

app.options('/api/ivx/owner-operations/dashboard', () => ownerOperationsOptions());
app.get('/api/ivx/owner-operations/dashboard', async (context) => handleOwnerOperationsDashboardRequest(context.req.raw));
app.options('/api/ivx/owner-operations/connections', () => ownerOperationsOptions());
app.get('/api/ivx/owner-operations/connections', async (context) => handleOwnerOperationsConnectionsRequest(context.req.raw));
app.options('/api/ivx/owner-operations/connections/test', () => ownerOperationsOptions());
app.post('/api/ivx/owner-operations/connections/test', async (context) => handleOwnerOperationsConnectionTestRequest(context.req.raw));
app.options('/api/ivx/owner-operations/actions', () => ownerOperationsOptions());
app.get('/api/ivx/owner-operations/actions', async (context) => handleOwnerOperationsActionsRequest(context.req.raw));
app.options('/api/ivx/owner-operations/rork-removal/preflight', () => ownerOperationsOptions());
app.get('/api/ivx/owner-operations/rork-removal/preflight', async (context) => handleOwnerOperationsRorkRemovalPreflightRequest(context.req.raw));

app.options('/api/ivx/continuous-improvement/dashboard', () => continuousImprovementOptions());
app.get('/api/ivx/continuous-improvement/dashboard', async (context) => handleContinuousImprovementDashboardRequest(context.req.raw));
app.options('/api/ivx/continuous-improvement/self-audit', () => continuousImprovementOptions());
app.post('/api/ivx/continuous-improvement/self-audit', async (context) => handleContinuousImprovementSelfAuditRequest(context.req.raw));
app.options('/api/ivx/scheduler', () => schedulerOptions());
app.get('/api/ivx/scheduler', async (context) => handleSchedulerStatusRequest(context.req.raw));
app.options('/api/ivx/scheduler/run-now', () => schedulerOptions());
app.post('/api/ivx/scheduler/run-now', async (context) => handleSchedulerRunNowRequest(context.req.raw));
app.options('/api/ivx/scheduler/enable', () => schedulerOptions());
app.post('/api/ivx/scheduler/enable', async (context) => handleSchedulerEnableRequest(context.req.raw));
app.options('/api/ivx/continuous-improvement/proposals', () => continuousImprovementOptions());
app.get('/api/ivx/continuous-improvement/proposals', async (context) => handleContinuousImprovementProposalsRequest(context.req.raw));
app.options('/api/ivx/continuous-improvement/drift', () => continuousImprovementOptions());
app.get('/api/ivx/continuous-improvement/drift', async (context) => handleContinuousImprovementDriftRequest(context.req.raw));
app.options('/api/ivx/continuous-improvement/baseline', () => continuousImprovementOptions());
app.post('/api/ivx/continuous-improvement/baseline', async (context) => handleContinuousImprovementBaselineRequest(context.req.raw));
app.options('/api/ivx/continuous-improvement/safe-plan', () => continuousImprovementOptions());
app.get('/api/ivx/continuous-improvement/safe-plan', async (context) => handleContinuousImprovementSafePlanRequest(context.req.raw));
app.options('/api/ivx/continuous-improvement/safe-fixes', () => continuousImprovementOptions());
app.get('/api/ivx/continuous-improvement/safe-fixes', async (context) => handleContinuousImprovementSafeFixesRequest(context.req.raw));

app.options('/api/ivx/deliverables', () => deliverablesOptions());
app.get('/api/ivx/deliverables', async (context) => handleDeliverableListRequest(context.req.raw));
app.post('/api/ivx/deliverables', async (context) => handleDeliverableCreateRequest(context.req.raw));
app.options('/api/ivx/deliverables/notifications', () => deliverablesOptions());
app.get('/api/ivx/deliverables/notifications', async (context) => handleDeliverableNotificationsRequest(context.req.raw));
app.options('/api/ivx/deliverables/:id', () => deliverablesOptions());
app.get('/api/ivx/deliverables/:id', async (context) => handleDeliverableGetRequest(context.req.raw, context.req.param('id')));
app.options('/api/ivx/deliverables/:id/verify', () => deliverablesOptions());
app.get('/api/ivx/deliverables/:id/verify', async (context) => handleDeliverableVerifyRequest(context.req.raw, context.req.param('id')));

app.options('/api/ivx/metrics', () => metricsOptions());
app.get('/api/ivx/metrics', async (context) => handleMetricsRequest(context.req.raw));

app.options('/api/ivx/runtime-variables', () => runtimeVariablesOptions());
app.get('/api/ivx/runtime-variables', async (context) => handleRuntimeVariablesRequest(context.req.raw));
app.options('/api/ivx/runtime-variables/verify', () => runtimeVariablesOptions());
app.post('/api/ivx/runtime-variables/verify', async (context) => handleRuntimeVariablesVerifyRequest(context.req.raw));
app.options('/api/ivx/runtime-variables/sync', () => runtimeVariablesOptions());
app.post('/api/ivx/runtime-variables/sync', async (context) => handleRuntimeVariablesSyncRequest(context.req.raw));
app.options('/api/ivx/runtime-variables/save', () => runtimeVariablesOptions());
app.post('/api/ivx/runtime-variables/save', async (context) => handleRuntimeVariablesSaveRequest(context.req.raw));
app.options('/api/ivx/runtime-variables/audit', () => runtimeVariablesOptions());
app.get('/api/ivx/runtime-variables/audit', async (context) => handleRuntimeVariablesAuditRequest(context.req.raw));

app.options('/api/ivx/development-control', () => ivxDevelopmentControlOptions());
app.get('/api/ivx/development-control', async (context) => handleIVXDevelopmentControlRequest(context.req.raw));
app.options('/api/ivx/development-action', () => ivxDevelopmentControlOptions());
app.post('/api/ivx/development-action', async (context) => handleIVXDevelopmentActionRequest(context.req.raw));

app.options('/api/ivx/control-room/status', () => controlRoomStatusOptions());
app.get('/api/ivx/control-room/status', async (context) => handleIVXControlRoomStatusRequest(context.req.raw));
app.options('/api/ivx/developer-deploy/status', () => developerDeployOptions());
app.get('/api/ivx/developer-deploy/status', async (context) => handleIVXDeveloperDeployStatusRequest(context.req.raw));
app.options('/api/ivx/developer-deploy/action', () => developerDeployOptions());
app.post('/api/ivx/developer-deploy/action', async (context) => handleIVXDeveloperDeployActionRequest(context.req.raw));
app.options('/api/ivx/senior-developer/status', () => seniorDeveloperOptions());
app.get('/api/ivx/senior-developer/status', async (context) => handleIVXSeniorDeveloperStatusRequest(context.req.raw));
app.options('/api/ivx/senior-developer/github-audit', () => seniorDeveloperOptions());
app.get('/api/ivx/senior-developer/github-audit', async (context) => handleIVXSeniorDeveloperGithubAuditRequest(context.req.raw));
app.options('/api/ivx/senior-developer/credential-audit', () => seniorDeveloperOptions());
app.get('/api/ivx/senior-developer/credential-audit', async (context) => handleIVXSeniorDeveloperCredentialAuditRequest(context.req.raw));
app.options('/api/ivx/senior-developer/run', () => seniorDeveloperOptions());
app.post('/api/ivx/senior-developer/run', async (context) => handleIVXSeniorDeveloperRunRequest(context.req.raw));
// Live, publicly-readable production visibility for features the Senior Developer builds from scratch.
// Every committed + deployed feature appears here, proving the new production feature is visible.
app.options('/api/ivx/senior-developer/features', () => seniorDeveloperOptions());
app.get('/api/ivx/senior-developer/features', async (context) => {
  const { listGeneratedFeatures, IVX_GENERATED_FEATURE_REGISTRY_MARKER } = await import('./services/ivx-generated-feature-registry');
  const features = await listGeneratedFeatures();
  return context.json({
    ok: true,
    marker: IVX_GENERATED_FEATURE_REGISTRY_MARKER,
    count: features.length,
    features,
    timestamp: new Date().toISOString(),
  });
});
app.options('/api/ivx/senior-developer/features/:slug', () => seniorDeveloperOptions());
app.get('/api/ivx/senior-developer/features/:slug', async (context) => {
  const { getGeneratedFeature, IVX_GENERATED_FEATURE_REGISTRY_MARKER } = await import('./services/ivx-generated-feature-registry');
  const slug = context.req.param('slug');
  const feature = await getGeneratedFeature(slug);
  if (!feature) {
    return context.json({ ok: false, marker: IVX_GENERATED_FEATURE_REGISTRY_MARKER, error: `No generated feature found for slug "${slug}".`, slug, timestamp: new Date().toISOString() }, 404);
  }
  return context.json({ ok: true, marker: IVX_GENERATED_FEATURE_REGISTRY_MARKER, feature, timestamp: new Date().toISOString() });
});
// ONE-CLICK, NO-TOKEN end-to-end production self-proof. Runs the REAL Senior
// Developer runtime in-process in systemMode (using the production-side
// GitHub/Render/Supabase credentials), then returns the 5 artifacts the owner
// asked for: new feature, commit pushed, GitHub SHA, Render deploy, live HTTP
// 200. Cooldown-guarded so it can never be used to spam commits/deploys.
app.options('/api/ivx/senior-developer/self-proof', () => seniorDeveloperOptions());
app.get('/api/ivx/senior-developer/self-proof', async (context) => {
  try {
    const { runSeniorDeveloperSelfProof } = await import('./services/ivx-senior-developer-self-proof');
    const force = ['1', 'true', 'yes'].includes((context.req.query('force') ?? '').trim().toLowerCase());
    const proof = await runSeniorDeveloperSelfProof({ force });
    return context.json(proof, proof.ok ? 200 : 409);
  } catch (error) {
    return context.json({
      ok: false,
      marker: 'ivx-senior-developer-self-proof-v1',
      error: error instanceof Error ? error.message.slice(0, 500) : 'Senior developer self-proof failed.',
      secretValuesReturned: false,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});
app.get('/api/ivx/senior-developer/self-proof/latest', async (context) => {
  const { getLatestSeniorDeveloperSelfProof } = await import('./services/ivx-senior-developer-self-proof');
  const latest = await getLatestSeniorDeveloperSelfProof();
  if (!latest) {
    return context.json({
      ok: false,
      marker: 'ivx-senior-developer-self-proof-v1',
      error: 'No self-proof has been run yet. Call GET /api/ivx/senior-developer/self-proof to run it.',
      timestamp: new Date().toISOString(),
    }, 404);
  }
  return context.json(latest, latest.ok ? 200 : 409);
});
app.options('/api/ivx/senior-dev-proof', () => seniorDevToolsOptions());
app.get('/api/ivx/senior-dev-proof', async (context) => {
  try {
    const { assertIVXOwnerOnly, ownerOnlyJson } = await import('./api/owner-only');
    await assertIVXOwnerOnly(context.req.raw);
    return ownerOnlyJson({
      ok: true,
      role: 'senior-developer',
      canReadCode: true,
      canPatchCode: true,
      canRunValidation: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'owner_auth_required';
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
});
app.options('/api/ivx/senior-dev/tools', () => seniorDevToolsOptions());
app.get('/api/ivx/senior-dev/tools', async (context) => handleIVXSeniorDevToolsListRequest(context.req.raw));
app.post('/api/ivx/senior-dev/tools', async (context) => handleIVXSeniorDevToolsExecuteRequest(context.req.raw));
app.options('/api/ivx/senior-dev/audit-report', () => seniorDevToolsOptions());
app.post('/api/ivx/senior-dev/audit-report', async (context) => handleIVXSeniorDevAuditReportRequest(context.req.raw));
// Rate-limited senior-dev endpoints. Buckets are per IP + per token suffix
// so each owner session has its own quota. Tight budgets are applied to the
// expensive surfaces (proof / repo-search / test-report / e2e-run) and a
// generous bucket to the high-frequency execution-stream poll.
app.options('/api/ivx/senior-dev/proof', () => seniorDevBuildOptions());
app.post('/api/ivx/senior-dev/proof', async (c) => withRateLimit(c.req.raw, 'senior-dev:proof', 10, 0.2, () => handleSeniorDevProofPost(c.req.raw)));
app.get('/api/ivx/senior-dev/proofs', async (c) => withRateLimit(c.req.raw, 'senior-dev:proofs-list', 30, 1, () => handleSeniorDevProofList(c.req.raw)));
app.options('/api/ivx/senior-dev/evidence', () => seniorDevBuildOptions());
app.get('/api/ivx/senior-dev/evidence', async (c) => withRateLimit(c.req.raw, 'senior-dev:evidence', 30, 1, () => handleSeniorDevEvidence(c.req.raw)));
app.options('/api/ivx/senior-dev/otel', () => seniorDevBuildOptions());
app.get('/api/ivx/senior-dev/otel', async (c) => withRateLimit(c.req.raw, 'senior-dev:otel', 30, 1, () => handleSeniorDevOTel(c.req.raw)));
app.options('/api/ivx/senior-dev/repo-search', () => seniorDevBuildOptions());
app.post('/api/ivx/senior-dev/repo-search', async (c) => withRateLimit(c.req.raw, 'senior-dev:repo-search', 10, 0.2, () => handleSeniorDevRepoSearch(c.req.raw)));
app.options('/api/ivx/senior-dev/test-report', () => seniorDevBuildOptions());
app.post('/api/ivx/senior-dev/test-report', async (c) => withRateLimit(c.req.raw, 'senior-dev:test-report', 6, 0.1, () => handleSeniorDevTestReport(c.req.raw)));
app.options('/api/ivx/senior-dev/e2e', () => seniorDevBuildOptions());
app.get('/api/ivx/senior-dev/e2e', async (c) => withRateLimit(c.req.raw, 'senior-dev:e2e', 30, 1, () => handleSeniorDevE2EPlan(c.req.raw)));
app.options('/api/ivx/senior-dev/e2e/run', () => seniorDevBuildOptions());
app.post('/api/ivx/senior-dev/e2e/run', async (c) => withRateLimit(c.req.raw, 'senior-dev:e2e-run', 4, 0.05, () => handleSeniorDevE2ERun(c.req.raw)));
app.options('/api/ivx/senior-dev/execution-stream', () => seniorDevBuildOptions());
// High-frequency poll — generous burst, ~2 rps sustained per session.
app.get('/api/ivx/senior-dev/execution-stream', async (c) => withRateLimit(c.req.raw, 'senior-dev:execution-stream', 60, 2, () => handleSeniorDevExecutionStream(c.req.raw)));
app.options('/api/ivx/senior-dev/execution-record', () => seniorDevBuildOptions());
app.post('/api/ivx/senior-dev/execution-record', async (c) => withRateLimit(c.req.raw, 'senior-dev:execution-record', 60, 2, () => handleSeniorDevExecutionRecord(c.req.raw)));
app.options('/api/ivx/autonomy/status', () => autonomyOptions());
app.get('/api/ivx/autonomy/status', async (c) => handleIVXAutonomyStatusRequest(c.req.raw));
app.options('/api/ivx/autonomy/cloudfront/invalidate', () => autonomyOptions());
app.post('/api/ivx/autonomy/cloudfront/invalidate', async (c) => handleIVXAutonomyCloudFrontInvalidateRequest(c.req.raw));
app.options('/api/ivx/autonomy/secret-scan', () => autonomyOptions());
app.post('/api/ivx/autonomy/secret-scan', async (c) => handleIVXAutonomySecretScanRequest(c.req.raw));
app.options('/api/ivx/autonomy/deploy-log/rotate', () => autonomyOptions());
app.post('/api/ivx/autonomy/deploy-log/rotate', async (c) => handleIVXAutonomyDeployLogRotateRequest(c.req.raw));
app.options('/api/ivx/autonomy/git/rollback-check', () => autonomyOptions());
app.get('/api/ivx/autonomy/git/rollback-check', async (c) => handleIVXAutonomyGitRollbackCheckRequest(c.req.raw));
app.options('/api/ivx/autonomy/uptime/probe', () => autonomyOptions());
app.get('/api/ivx/autonomy/uptime/probe', async (c) => handleIVXAutonomyUptimeProbeListRequest(c.req.raw));
app.post('/api/ivx/autonomy/uptime/probe', async (c) => handleIVXAutonomyUptimeProbeRunRequest(c.req.raw));
app.options('/api/ivx/autonomy/sse-replay/stats', () => autonomyOptions());
app.get('/api/ivx/autonomy/sse-replay/stats', async (c) => handleIVXAutonomySSEReplayStatsRequest(c.req.raw));
app.options('/api/ivx/autonomy/token-budget', () => autonomyOptions());
app.get('/api/ivx/autonomy/token-budget', async (c) => handleIVXAutonomyTokenBudgetRequest(c.req.raw));
app.options('/api/ivx/autonomy/ai-providers', () => autonomyOptions());
app.get('/api/ivx/autonomy/ai-providers', async (c) => handleIVXAutonomyAIProvidersRequest(c.req.raw));
app.options('/api/ivx/autonomy/deploy/approve-and-run', () => autonomyOptions());
app.post('/api/ivx/autonomy/deploy/approve-and-run', async (c) => handleIVXAutonomyDeployApproveAndRunRequest(c.req.raw));
app.options('/api/ivx/autonomy/deploy/rollback', () => autonomyOptions());
app.post('/api/ivx/autonomy/deploy/rollback', async (c) => handleIVXAutonomyDeployRollbackRequest(c.req.raw));
app.options('/api/ivx/autonomy/github/sync', () => autonomyOptions());
app.post('/api/ivx/autonomy/github/sync', async (c) => handleIVXAutonomyGithubSyncRequest(c.req.raw));
// Owner-only one-shot delivery chain: Rork workspace → GitHub push → Render deploy → live /health verify.
app.options('/api/ivx/admin/sync-rork-to-github', () => adminSyncOptions());
app.post('/api/ivx/admin/sync-rork-to-github', async (c) => handleIVXAdminSyncRorkToGithubRequest(c.req.raw));
app.options('/api/ivx/night-ops/status', () => nightOpsOptions());
app.get('/api/ivx/night-ops/status', async (c) => handleIVXNightOpsStatusRequest(c.req.raw));
app.options('/api/ivx/night-ops/config', () => nightOpsOptions());
app.post('/api/ivx/night-ops/config', async (c) => handleIVXNightOpsConfigRequest(c.req.raw));
app.options('/api/ivx/night-ops/run', () => nightOpsOptions());
app.post('/api/ivx/night-ops/run', async (c) => handleIVXNightOpsRunRequest(c.req.raw));
app.options('/api/ivx/night-ops/touch-owner', () => nightOpsOptions());
app.post('/api/ivx/night-ops/touch-owner', async (c) => handleIVXNightOpsTouchOwnerRequest(c.req.raw));
app.options('/api/ivx/night-ops/runs', () => nightOpsOptions());
app.get('/api/ivx/night-ops/runs', async (c) => handleIVXNightOpsRunsListRequest(c.req.raw));
app.options('/api/ivx/night-ops/runs/:runId', () => nightOpsOptions());
app.get('/api/ivx/night-ops/runs/:runId', async (c) => handleIVXNightOpsRunGetRequest(c.req.raw, c.req.param('runId') ?? ''));
app.options('/api/ivx/night-ops/roadmap', () => nightOpsOptions());
app.get('/api/ivx/night-ops/roadmap', async (c) => handleIVXNightOpsRoadmapGetRequest(c.req.raw));
app.options('/api/ivx/night-ops/roadmap/advance', () => nightOpsOptions());
app.post('/api/ivx/night-ops/roadmap/advance', async (c) => handleIVXNightOpsRoadmapAdvanceRequest(c.req.raw));
app.options('/api/ivx/env-debug/render', () => publicJson({ ok: true }, 204));
app.get('/api/ivx/env-debug/render', async (context) => context.json(await buildRenderEnvDebugPayload(), 200, {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
}));
app.options('/api/ivx/variables-tool/status', () => variablesToolOptions());
app.get('/api/ivx/variables-tool/status', async (context) => handleIVXVariablesToolStatusRequest(context.req.raw));
app.options('/api/ivx/variables-tool/save', () => variablesToolOptions());
app.post('/api/ivx/variables-tool/save', async (context) => handleIVXVariablesToolSaveRequest(context.req.raw));
app.options('/api/ivx/owner-variables/status', () => ownerVariablesOptions());
app.get('/api/ivx/owner-variables/status', async (context) => handleIVXOwnerVariablesStatusRequest(context.req.raw));
app.options('/api/ivx-owner-variables/status', () => publicJson({ ok: true }, 204));
app.get('/api/ivx-owner-variables/status', () => publicJson({
  ok: true,
  ownerOnly: false,
  routeRegistered: true,
  authenticatedStatusRoute: '/api/ivx/owner-variables/status',
  selfSyncRoute: '/api/ivx-owner-variables/self-sync',
  selfSyncRequiresOwnerBearer: true,
  secretValuesReturned: false,
  deploymentMarker: DEPLOYMENT_MARKER,
  timestamp: nowIso(),
}));
app.options('/api/ivx/owner-variables/save', () => ownerVariablesOptions());
app.post('/api/ivx/owner-variables/save', async (context) => handleIVXOwnerVariablesSaveRequest(context.req.raw));
app.options('/api/ivx/owner-variables/test', () => ownerVariablesOptions());
app.post('/api/ivx/owner-variables/test', async (context) => handleIVXOwnerVariablesTestRequest(context.req.raw));
app.options('/api/ivx/owner-variables/delete', () => ownerVariablesOptions());
app.post('/api/ivx/owner-variables/delete', async (context) => handleIVXOwnerVariablesDeleteRequest(context.req.raw));
app.options('/api/ivx/owner-variables/self-sync', () => ownerVariablesOptions());
app.post('/api/ivx/owner-variables/self-sync', async (context) => handleIVXOwnerVariablesSelfSyncRequest(context.req.raw));
app.options('/api/ivx-owner-variables/self-sync', () => ownerVariablesOptions());
app.post('/api/ivx-owner-variables/self-sync', async (context) => handleIVXOwnerVariablesSelfSyncRequest(context.req.raw));
app.options('/api/ivx/independence/status', () => independenceStatusOptions());
app.get('/api/ivx/independence/status', async (context) => handleIVXIndependenceStatusRequest(context.req.raw));

app.options('/api/ivx/agent-jobs/status', () => agentJobsOptions());
app.get('/api/ivx/agent-jobs/status', async (context) => handleIVXAgentJobsStatusRequest(context.req.raw));
app.options('/api/ivx/agent-jobs', () => agentJobsOptions());
app.get('/api/ivx/agent-jobs', async (context) => handleIVXAgentJobsListRequest(context.req.raw));
app.post('/api/ivx/agent-jobs', async (context) => handleIVXAgentJobsCreateRequest(context.req.raw));
app.options('/api/ivx/agent-jobs/:jobId/retry', () => agentJobsOptions());
app.post('/api/ivx/agent-jobs/:jobId/retry', async (context) => handleIVXAgentJobActionRequest(context.req.raw, context.req.param('jobId'), 'retry'));
app.options('/api/ivx/agent-jobs/:jobId/cancel', () => agentJobsOptions());
app.post('/api/ivx/agent-jobs/:jobId/cancel', async (context) => handleIVXAgentJobActionRequest(context.req.raw, context.req.param('jobId'), 'cancel'));
app.options('/api/ivx/agent-jobs/:jobId/approve', () => agentJobsOptions());
app.post('/api/ivx/agent-jobs/:jobId/approve', async (context) => handleIVXAgentJobActionRequest(context.req.raw, context.req.param('jobId'), 'approve'));
app.options('/api/ivx/agent-worker/run-once', () => agentJobsOptions());
app.post('/api/ivx/agent-worker/run-once', async (context) => handleIVXAgentWorkerRunOnceRequest(context.req.raw));
app.options('/api/ivx/agent-jobs/live-activity', () => agentJobsOptions());
app.get('/api/ivx/agent-jobs/live-activity', async (context) => handleIVXAgentJobsLiveActivityRequest(context.req.raw));

// Block 2 — Media job lifecycle (queued → running → analyzing_media → generating_answer → completed/failed)
app.options('/api/ivx/media-jobs', () => ivxMediaJobsOptions());
app.post('/api/ivx/media-jobs', async (context) => handleIVXMediaJobsCreateRequest(context.req.raw));
app.options('/api/ivx/media-jobs/:jobId', () => ivxMediaJobsOptions());
app.get('/api/ivx/media-jobs/:jobId', async (context) => handleIVXMediaJobsGetRequest(context.req.raw, context.req.param('jobId')));
app.options('/api/ivx/media-jobs/:jobId/advance', () => ivxMediaJobsOptions());
app.post('/api/ivx/media-jobs/:jobId/advance', async (context) => handleIVXMediaJobsAdvanceRequest(context.req.raw, context.req.param('jobId')));
app.options('/api/ivx/media-jobs/:jobId/complete', () => ivxMediaJobsOptions());
app.post('/api/ivx/media-jobs/:jobId/complete', async (context) => handleIVXMediaJobsCompleteRequest(context.req.raw, context.req.param('jobId')));
app.options('/api/ivx/media-jobs/:jobId/fail', () => ivxMediaJobsOptions());
app.post('/api/ivx/media-jobs/:jobId/fail', async (context) => handleIVXMediaJobsFailRequest(context.req.raw, context.req.param('jobId')));

// Scoped, single-use, 10-min TTL test token for IVX Agent Runtime verification.
// Mint requires owner bearer; test-run accepts only ivx_test_* tokens with scope agent-jobs:test.
app.options('/api/ivx/agent-jobs/test-token', () => agentTestTokenOptions());
app.post('/api/ivx/agent-jobs/test-token', async (context) => handleIVXAgentTestTokenMintRequest(context.req.raw));
app.options('/api/ivx/agent-jobs/test-run', () => agentTestTokenOptions());
app.post('/api/ivx/agent-jobs/test-run', async (context) => handleIVXAgentTestRunRequest(context.req.raw));

// Owner-only Render deploy diagnostic — reads private credentials from process.env
// or the encrypted Owner Variables runtime bridge, without returning secret values.
app.options('/api/ivx/render-diagnostic', () => renderDiagnosticOptions());
app.get('/api/ivx/render-diagnostic', async (context) => handleIVXRenderDiagnosticRequest(context.req.raw));
app.options('/api/ivx/render-deploy-latest', () => renderDeployLatestOptions());
app.post('/api/ivx/render-deploy-latest', async (context) => handleIVXRenderDeployLatestRequest(context.req.raw));

// Block 23 — Operational memory (pgvector) + autonomous execution loop
app.options('/api/ivx/operational-memory/status', () => opMemoryOptions());
app.get('/api/ivx/operational-memory/status', async (context) => handleOpMemoryStatus(context.req.raw));
app.options('/api/ivx/operational-memory/search', () => opMemoryOptions());
app.get('/api/ivx/operational-memory/search', async (context) => handleOpMemorySearch(context.req.raw));
app.options('/api/ivx/operational-memory/list', () => opMemoryOptions());
app.get('/api/ivx/operational-memory/list', async (context) => handleOpMemoryList(context.req.raw));
app.options('/api/ivx/operational-memory', () => opMemoryOptions());
app.post('/api/ivx/operational-memory', async (context) => handleOpMemoryUpsert(context.req.raw));
app.options('/api/ivx/operational-memory/reindex', () => opMemoryOptions());
app.post('/api/ivx/operational-memory/reindex', async (context) => handleOpMemoryReindex(context.req.raw));
app.options('/api/ivx/operational-memory/snapshot', () => opMemoryOptions());
app.get('/api/ivx/operational-memory/snapshot', async (context) => handleOpMemorySnapshot(context.req.raw));
app.options('/api/ivx/operational-memory/loop', () => opMemoryOptions());
app.post('/api/ivx/operational-memory/loop', async (context) => handleOpMemoryLoopRun(context.req.raw));
app.options('/api/ivx/operational-memory/tasks', () => opMemoryOptions());
app.get('/api/ivx/operational-memory/tasks', async (context) => handleOpMemoryTasksList(context.req.raw));
app.options('/api/ivx/operational-memory/tasks/:taskId', () => opMemoryOptions());
app.get('/api/ivx/operational-memory/tasks/:taskId', async (context) => handleOpMemoryTaskGet(context.req.raw, context.req.param('taskId')));
app.options('/api/ivx/operational-memory/tasks/:taskId/rollback', () => opMemoryOptions());
app.post('/api/ivx/operational-memory/tasks/:taskId/rollback', async (context) => handleOpMemoryRollback(context.req.raw, context.req.param('taskId')));

// Block 24 — Active Engineering Intelligence
const engIntelRoutes: Array<[string, 'GET' | 'POST', (request: Request) => Promise<Response>]> = [
  ['/api/ivx/engineering/status', 'GET', handleEngIntelStatus],
  ['/api/ivx/engineering/dashboard', 'GET', handleEngIntelDashboard],
  ['/api/ivx/engineering/detect', 'GET', handleEngIntelDetect],
  ['/api/ivx/engineering/incidents', 'GET', handleEngIntelListIncidents],
  ['/api/ivx/engineering/decisions', 'GET', handleEngIntelListDecisions],
  ['/api/ivx/engineering/fix-outcomes', 'GET', handleEngIntelListFixOutcomes],
  ['/api/ivx/engineering/snapshots', 'GET', handleEngIntelListSnapshots],
  ['/api/ivx/engineering/telemetry', 'POST', handleEngIntelTelemetryIngest],
  ['/api/ivx/engineering/telemetry/stats', 'GET', handleEngIntelTelemetryStats],
  ['/api/ivx/engineering/confidence', 'GET', handleEngIntelConfidence],
  ['/api/ivx/engineering/gate', 'GET', handleEngIntelGate],
  ['/api/ivx/engineering/incidents/record', 'POST', handleEngIntelRecordIncident],
  ['/api/ivx/engineering/decisions/record', 'POST', handleEngIntelRecordDecision],
  ['/api/ivx/engineering/fix-outcomes/record', 'POST', handleEngIntelRecordFixOutcome],
  ['/api/ivx/engineering/snapshots/capture', 'POST', handleEngIntelSnapshotCapture],
  ['/api/ivx/engineering/simulate', 'POST', handleEngIntelSimulate],
];
for (const [routePath, method, handler] of engIntelRoutes) {
  app.options(routePath, () => engIntelOptions());
  if (method === 'GET') {
    app.get(routePath, async (context) => handler(context.req.raw));
  } else {
    app.post(routePath, async (context) => handler(context.req.raw));
  }
}

// Block 25: Multi-Agent Framework (owner-only)
const multiAgentGetRoutes: Array<[string, (request: Request) => Promise<Response>]> = [
  ['/api/ivx/agents/status', handleMultiAgentStatus],
  ['/api/ivx/agents/active', handleMultiAgentActive],
  ['/api/ivx/agents/tasks', handleMultiAgentListTasks],
  ['/api/ivx/agents/handoffs', handleMultiAgentListHandoffs],
  ['/api/ivx/agents/audit', handleMultiAgentAudit],
  ['/api/ivx/agents/memory', handleMultiAgentMemoryRead],
  ['/api/ivx/agents/validate', handleMultiAgentValidate],
];
const multiAgentPostRoutes: Array<[string, (request: Request) => Promise<Response>]> = [
  ['/api/ivx/agents/dispatch', handleMultiAgentDispatch],
  ['/api/ivx/agents/handoff', handleMultiAgentHandoff],
  ['/api/ivx/agents/memory', handleMultiAgentMemoryWrite],
  ['/api/ivx/agents/complete', handleMultiAgentComplete],
  ['/api/ivx/agents/fail', handleMultiAgentFail],
  ['/api/ivx/agents/route-preview', handleMultiAgentRoutePreview],
];
for (const [routePath, handler] of multiAgentGetRoutes) {
  app.options(routePath, () => multiAgentOptions());
  app.get(routePath, async (context) => handler(context.req.raw));
}
for (const [routePath, handler] of multiAgentPostRoutes) {
  app.options(routePath, () => multiAgentOptions());
  app.post(routePath, async (context) => handler(context.req.raw));
}
app.options('/api/ivx/agents/tasks/:taskId', () => multiAgentOptions());
app.get('/api/ivx/agents/tasks/:taskId', async (context) => handleMultiAgentGetTask(context.req.raw, context.req.param('taskId')));

// Block 26: Agent Self-Execution Test (owner-only)
app.options('/api/ivx/agents/self-execute', () => selfExecOptions());
app.post('/api/ivx/agents/self-execute', async (context) => handleSelfExecRun(context.req.raw));
app.options('/api/ivx/agents/self-execute/result', () => selfExecOptions());
app.get('/api/ivx/agents/self-execute/result', async (context) => handleSelfExecResult(context.req.raw));

// Block 27: Parallel Agent Execution (owner-only)
app.options('/api/ivx/agents/parallel/dispatch', () => parallelAgentsOptions());
app.post('/api/ivx/agents/parallel/dispatch', async (context) => handleParallelDispatch(context.req.raw));
app.options('/api/ivx/agents/parallel/list', () => parallelAgentsOptions());
app.get('/api/ivx/agents/parallel/list', async (context) => handleParallelList(context.req.raw));
app.options('/api/ivx/agents/parallel/decompose', () => parallelAgentsOptions());
app.post('/api/ivx/agents/parallel/decompose', async (context) => handleParallelDecomposePreview(context.req.raw));
app.options('/api/ivx/agents/parallel/validate', () => parallelAgentsOptions());
app.post('/api/ivx/agents/parallel/validate', async (context) => handleParallelValidate(context.req.raw));
app.options('/api/ivx/agents/parallel/:parentId', () => parallelAgentsOptions());
app.get('/api/ivx/agents/parallel/:parentId', async (context) => handleParallelGet(context.req.raw, context.req.param('parentId')));
app.options('/api/ivx/agents/parallel/:parentId/tree', () => parallelAgentsOptions());
app.get('/api/ivx/agents/parallel/:parentId/tree', async (context) => handleParallelGetTree(context.req.raw, context.req.param('parentId')));

// Block 28: CTO Operational Dashboard (owner-only)
app.options('/api/ivx/cto-dashboard/overview', () => ctoDashboardOptions());
app.get('/api/ivx/cto-dashboard/overview', async (context) => handleCTODashboardOverview(context.req.raw));
app.options('/api/ivx/cto-dashboard/audit', () => ctoDashboardOptions());
app.get('/api/ivx/cto-dashboard/audit', async (context) => handleCTODashboardAuditSearch(context.req.raw));
app.options('/api/ivx/cto-dashboard/control', () => ctoDashboardOptions());
app.post('/api/ivx/cto-dashboard/control', async (context) => handleCTODashboardControl(context.req.raw));
app.options('/api/ivx/cto-dashboard/autonomous-cycle/control', () => ctoDashboardOptions());
app.post('/api/ivx/cto-dashboard/autonomous-cycle/control', async (context) => handleCTODashboardAutonomousCycleControl(context.req.raw));
app.options('/api/ivx/cto-dashboard/autonomous-cycle/validate', () => ctoDashboardOptions());
app.post('/api/ivx/cto-dashboard/autonomous-cycle/validate', async (context) => handleCTODashboardAutonomousCycleValidate(context.req.raw));
app.options('/api/ivx/cto-dashboard/parent/:parentId/tree', () => ctoDashboardOptions());
app.get('/api/ivx/cto-dashboard/parent/:parentId/tree', async (context) => handleCTODashboardParentTree(context.req.raw, context.req.param('parentId')));

// Block 29: Autonomous Real-World Engineering Cycle (owner-only)
app.options('/api/ivx/autonomous-cycle/status', () => autonomousCycleOptions());
app.get('/api/ivx/autonomous-cycle/status', async (context) => handleAutonomousCycleStatus(context.req.raw));
app.options('/api/ivx/autonomous-cycle/classify', () => autonomousCycleOptions());
app.post('/api/ivx/autonomous-cycle/classify', async (context) => handleAutonomousCycleClassify(context.req.raw));
app.options('/api/ivx/autonomous-cycle/run', () => autonomousCycleOptions());
app.post('/api/ivx/autonomous-cycle/run', async (context) => handleAutonomousCycleRun(context.req.raw));
app.options('/api/ivx/autonomous-cycle/list', () => autonomousCycleOptions());
app.get('/api/ivx/autonomous-cycle/list', async (context) => handleAutonomousCycleList(context.req.raw));
app.options('/api/ivx/autonomous-cycle/validate', () => autonomousCycleOptions());
app.post('/api/ivx/autonomous-cycle/validate', async (context) => handleAutonomousCycleValidate(context.req.raw));
app.options('/api/ivx/autonomous-cycle/:cycleId', () => autonomousCycleOptions());
app.get('/api/ivx/autonomous-cycle/:cycleId', async (context) => handleAutonomousCycleGet(context.req.raw, context.req.param('cycleId')));

app.options('/api/ivx/ai-brain/tools', () => aiBrainToolsOptions());
app.get('/api/ivx/ai-brain/tools', async (context) => handleIVXAIBrainToolsListRequest(context.req.raw));
app.post('/api/ivx/ai-brain/tools', async (context) => handleIVXAIBrainToolExecuteRequest(context.req.raw));
app.options('/api/ivx/ai-brain/tools/execute', () => aiBrainToolsOptions());
app.post('/api/ivx/ai-brain/tools/execute', async (context) => handleIVXAIBrainToolExecuteRequest(context.req.raw));

const supabaseInspectionRoutePairs: Array<[string, 'tables' | 'schema' | 'columns' | 'rls']> = [
  ['/api/ivx/supabase/tables', 'tables'],
  ['/api/ivx/supabase/schema', 'schema'],
  ['/api/ivx/supabase/columns', 'columns'],
  ['/api/ivx/supabase/rls', 'rls'],
];

for (const [routePath, kind] of supabaseInspectionRoutePairs) {
  app.options(routePath, () => supabaseInspectionOptions());
  app.get(routePath, async (context) => handleIVXSupabaseInspectionRequest(context.req.raw, kind));
}

app.options('/api/ivx/supabase/owner-action', () => supabaseOwnerActionOptions());
app.post('/api/ivx/supabase/owner-action', async (context) => handleIVXSupabaseOwnerActionRequest(context.req.raw));
app.options('/api/ivx/supabase/owner-action-health', () => publicJson({ ok: true }, 204));
app.get('/api/ivx/supabase/owner-action-health', async () => {
  const endpoint = '/api/ivx/supabase/owner-action-health';
  try {
    const payload = await buildRenderProofToolPayload('supabase-status', endpoint);
    const data = readObject(payload.data);
    const minimumReady = data.minimumReadOnlyReady === true;
    return publicJson({
      ok: payload.ok && minimumReady,
      status: payload.status,
      service: 'ivx-supabase-owner-action-health',
      endpoint,
      ownerActionRoute: 'POST /api/ivx/supabase/owner-action',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: payload.timestamp,
      supabase: data,
      error: payload.error,
      missingEnvNames: payload.missingEnvNames ?? [],
    });
  } catch (error) {
    return publicJson({
      ok: false,
      status: 'not_verified',
      service: 'ivx-supabase-owner-action-health',
      endpoint,
      ownerActionRoute: 'POST /api/ivx/supabase/owner-action',
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
      error: error instanceof Error ? error.message : 'Supabase owner-action health probe failed.',
    }, 200);
  }
});

app.options('/api/ivx/owner-registration', () => ownerRegistrationOptions());
app.options('/api/ivx/owner-registration/status', () => ownerRegistrationOptions());
app.options('/api/ivx/owner-registration/repair', () => ownerRegistrationOptions());
app.options('/api/ivx/owner-access-repair', () => ownerRegistrationOptions());
app.options('/api/ivx/owner-access-repair/status', () => ownerRegistrationOptions());
app.options('/api/ivx/owner-signup-audit', () => ownerRegistrationOptions());
app.get('/api/ivx/owner-registration/status', async (context) => handleIVXOwnerRegistrationStatusRequest(context.req.raw));
app.get('/api/ivx/owner-access-repair/status', async (context) => handleIVXOwnerAccessRepairStatusRequest(context.req.raw));
app.get('/api/ivx/owner-signup-audit', async (context) => handleIVXOwnerSignupAuditRequest(context.req.raw));
app.post('/api/ivx/owner-registration', async (context) => handleIVXOwnerRegistrationRequest(context.req.raw));
app.post('/api/ivx/owner-registration/repair', async (context) => handleIVXOwnerRegistrationRepairRequest(context.req.raw));
app.post('/api/ivx/owner-access-repair', async (context) => handleIVXOwnerAccessRepairRequest(context.req.raw));

app.options('/assistant', () => assistantOptions());
app.options('/api/assistant', () => assistantOptions());
app.post('/assistant', async (context) => handleAssistantPost(context.req.raw));
app.post('/api/assistant', async (context) => handleAssistantPost(context.req.raw));

app.options('/plan-creator', () => planCreatorOptions());
app.options('/api/plan-creator', () => planCreatorOptions());
app.post('/plan-creator', async (context) => handlePlanCreatorPost(context.req.raw));
app.post('/api/plan-creator', async (context) => handlePlanCreatorPost(context.req.raw));

app.options('/public/chat', (context) => context.body(null, 204));
app.options('/api/public/chat', (context) => context.body(null, 204));
app.options('/public/chat/history', (context) => context.body(null, 204));
app.options('/api/public/chat/history', (context) => context.body(null, 204));
app.options('/public/chat/sessions', (context) => context.body(null, 204));
app.options('/api/public/chat/sessions', (context) => context.body(null, 204));
app.options('/public/messages', (context) => context.body(null, 204));
app.options('/api/public/messages', (context) => context.body(null, 204));
app.options('/public/rooms', (context) => context.body(null, 204));
app.options('/api/public/rooms', (context) => context.body(null, 204));
app.options('/public/send-message', (context) => context.body(null, 204));
app.options('/api/public/send-message', (context) => context.body(null, 204));
app.post('/public/chat', async (context) => handlePublicChatPost(context.req.raw));
app.post('/api/public/chat', async (context) => handlePublicChatPost(context.req.raw));
app.get('/public/chat/history', async (context) => handlePublicChatHistoryGet(context.req.raw));
app.get('/api/public/chat/history', async (context) => handlePublicChatHistoryGet(context.req.raw));
app.get('/public/chat/sessions', async (context) => handlePublicChatSessionsGet(context.req.raw));
app.get('/api/public/chat/sessions', async (context) => handlePublicChatSessionsGet(context.req.raw));
app.get('/public/messages', async (context) => handlePublicRoomMessages(context.req.raw));
app.get('/api/public/messages', async (context) => handlePublicRoomMessages(context.req.raw));
app.get('/public/rooms', async (context) => handlePublicRoomState(context.req.raw));
app.get('/api/public/rooms', async (context) => handlePublicRoomState(context.req.raw));
app.post('/public/send-message', async (context) => handlePublicRoomSend(context.req.raw));
app.post('/api/public/send-message', async (context) => handlePublicRoomSend(context.req.raw));

// Owner room routes (primary + /api-prefixed aliases)
const ownerRoutePairs: Array<[string, string]> = [
  ['/chat', '/api/chat'],
  ['/messages', '/api/messages'],
  ['/messages/search', '/api/messages/search'],
  ['/upload', '/api/upload'],
  ['/rooms', '/api/rooms'],
  ['/inbox/sync', '/api/inbox/sync'],
  ['/diagnostics', '/api/diagnostics'],
  ['/fallback/reply', '/api/fallback/reply'],
];

for (const [primary, aliased] of ownerRoutePairs) {
  app.options(primary, () => ownerRoutesOptions());
  app.options(aliased, () => ownerRoutesOptions());
}

app.post('/chat', async (c) => handleChatPost(c.req.raw));
app.post('/api/chat', async (c) => handleChatPost(c.req.raw));

app.get('/messages/search', async (c) => handleMessagesSearch(c.req.raw));
app.get('/api/messages/search', async (c) => handleMessagesSearch(c.req.raw));
app.get('/messages', async (c) => handleMessagesGet(c.req.raw));
app.get('/api/messages', async (c) => handleMessagesGet(c.req.raw));
app.post('/messages', async (c) => handleMessagesPost(c.req.raw));
app.post('/api/messages', async (c) => handleMessagesPost(c.req.raw));

app.post('/upload', async (c) => handleUploadPost(c.req.raw));
app.post('/api/upload', async (c) => handleUploadPost(c.req.raw));

app.get('/rooms', async (c) => handleRoomsGet(c.req.raw));
app.get('/api/rooms', async (c) => handleRoomsGet(c.req.raw));
app.post('/rooms', async (c) => handleRoomsPost(c.req.raw));
app.post('/api/rooms', async (c) => handleRoomsPost(c.req.raw));

app.post('/inbox/sync', async (c) => handleInboxSync(c.req.raw));
app.post('/api/inbox/sync', async (c) => handleInboxSync(c.req.raw));

app.get('/diagnostics', async (c) => handleDiagnosticsGet(c.req.raw));
app.get('/api/diagnostics', async (c) => handleDiagnosticsGet(c.req.raw));

app.post('/fallback/reply', async (c) => handleFallbackReply(c.req.raw));
app.post('/api/fallback/reply', async (c) => handleFallbackReply(c.req.raw));

// Owner-only multimodal upload + analysis
app.options('/api/upload/image', () => ownerMultimodalOptions());
app.options('/api/upload/pdf', () => ownerMultimodalOptions());
app.options('/api/upload/video', () => ownerMultimodalOptions());
app.options('/api/google-drive/import', () => ownerMultimodalOptions());
app.options('/api/files/:fileId/analyze', () => ownerMultimodalOptions());
app.options('/api/files/:fileId/summary', () => ownerMultimodalOptions());
app.options('/api/multimodal/status', () => publicJson({ ok: true }, 204));
app.get('/api/multimodal/status', () => publicJson(buildMultimodalStatusPayload()));
app.post('/api/upload/image', async (c) => handleMultimodalImageUpload(c.req.raw));
app.post('/api/upload/pdf', async (c) => handleMultimodalPdfUpload(c.req.raw));
app.post('/api/upload/video', async (c) => handleMultimodalVideoUpload(c.req.raw));
app.post('/api/google-drive/import', async (c) => handleMultimodalGoogleDriveImport(c.req.raw));
app.post('/api/files/:fileId/analyze', async (c) => handleMultimodalAnalyze(c.req.raw, c.req.param('fileId')));
app.post('/api/files/:fileId/summary', async (c) => handleMultimodalSummary(c.req.raw, c.req.param('fileId')));
app.options('/audio/transcribe', () => ownerTranscriptionOptions());
app.options('/api/audio/transcribe', () => ownerTranscriptionOptions());
app.post('/audio/transcribe', async (c) => handleOwnerAudioTranscribe(c.req.raw));
app.post('/api/audio/transcribe', async (c) => handleOwnerAudioTranscribe(c.req.raw));

// Route53 diagnostics
app.options('/api/aws/route53/audit', async () => handleRoute53Options());
app.options('/api/aws/route53/upsert', async () => handleRoute53Options());
app.post('/api/aws/route53/audit', async (c) => handleRoute53Request(c.req.raw, 'audit'));
app.post('/api/aws/route53/upsert', async (c) => handleRoute53Request(c.req.raw, 'upsert'));

// ---- IVX Autonomous Repair Brain: incidents + production guard ----
app.options('/api/ivx/incidents', () => new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } }));
app.post('/api/ivx/incidents', async (c) => handleIVXIncidentIngest(c.req.raw));
app.get('/api/ivx/incidents', async (c) => handleIVXIncidentsList(c.req.raw));
app.get('/api/ivx/incidents/:id', async (c) => handleIVXIncidentGet(c.req.raw, c.req.param('id')));
app.post('/api/ivx/incidents/:id/diagnose', async (c) => handleIVXIncidentDiagnose(c.req.raw, c.req.param('id')));
app.post('/api/ivx/incidents/:id/approve', async (c) => handleIVXIncidentApprove(c.req.raw, c.req.param('id')));
app.post('/api/ivx/incidents/:id/stage', async (c) => handleIVXIncidentStage(c.req.raw, c.req.param('id')));
app.post('/api/ivx/incidents/:id/replay', async (c) => handleIVXIncidentReplay(c.req.raw, c.req.param('id')));
app.post('/api/ivx/incidents/:id/promote', async (c) => handleIVXIncidentPromote(c.req.raw, c.req.param('id')));
app.get('/api/ivx/incidents/:id/policy', async (c) => handleIVXIncidentPolicy(c.req.raw, c.req.param('id')));
app.get('/api/ivx/production-guard/health', async (c) => handleIVXProductionGuardHealth(c.req.raw));
app.post('/api/ivx/production-guard/rollback', async (c) => handleIVXProductionGuardRollback(c.req.raw));

// ---- IVX Repair Job Orchestrator (async pipeline) ----
app.options('/api/ivx/repair-jobs', () => new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } }));
app.post('/api/ivx/repair-jobs', async (c) => handleIVXRepairJobStart(c.req.raw));
app.get('/api/ivx/repair-jobs', async (c) => handleIVXRepairJobList(c.req.raw));
app.get('/api/ivx/repair-jobs/:id', async (c) => handleIVXRepairJobGet(c.req.raw, c.req.param('id')));
app.get('/api/ivx/repair-jobs/by-incident/:incidentId', async (c) => handleIVXRepairJobByIncident(c.req.raw, c.req.param('incidentId')));

app.onError((error, context) => {
  const message = error instanceof Error ? error.message : 'unknown';
  const stack = error instanceof Error ? error.stack ?? null : null;
  console.log('[IVXOwnerAI-Hono] Unhandled error:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
    message,
  });
  try {
    recordIncident({
      source: 'backend',
      severity: 'error',
      message: `Unhandled error on ${context.req.method} ${context.req.path}: ${message}`,
      stack,
      checkpoint: 'hono.onError',
      responseStatus: 500,
    });
    void evaluateAndMaybeRollback();
  } catch {
    // never let the error handler throw
  }
  return context.json({
    error: 'Internal server error',
    detail: message,
    deploymentMarker: DEPLOYMENT_MARKER,
  }, 500);
});

app.notFound(async (context) => {
  const webResponse = await loadWebResponse(context.req.path, context.req.method);
  if (webResponse) {
    console.log('[IVXOwnerAI-Hono] Served static web asset:', {
      method: context.req.method,
      path: context.req.path,
      marker: DEPLOYMENT_MARKER,
    });
    return webResponse;
  }

  console.log('[IVXOwnerAI-Hono] Route not found:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
  });
  return context.json({ error: 'Not found', deploymentMarker: DEPLOYMENT_MARKER }, 404);
});

try { startNightOpsScheduler(); } catch (err) { console.warn('[IVXOwnerAI-Hono] night ops scheduler failed to start:', err instanceof Error ? err.message : err); }
try { startContinuousExecutionScheduler(); } catch (err) { console.warn('[IVXOwnerAI-Hono] continuous execution scheduler failed to start:', err instanceof Error ? err.message : err); }
try { startAutonomousScheduler(); } catch (err) { console.warn('[IVXOwnerAI-Hono] autonomous scheduler failed to start:', err instanceof Error ? err.message : err); }
try { startScaleLoopScheduler(); } catch (err) { console.warn('[IVXOwnerAI-Hono] scale loop scheduler failed to start:', err instanceof Error ? err.message : err); }
try { startLandingSeoAutodeploy(); } catch (err) { console.warn('[IVXOwnerAI-Hono] landing SEO autodeploy failed to start:', err instanceof Error ? err.message : err); }

export default app;
