import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GET, OPTIONS as ownerAIOptions, handleIVXOwnerAIProxyStatus, handleIVXOwnerAIRequest, handleIVXOwnerAIToolRequest } from './api/ivx-owner-ai';
import { OPTIONS as auditReportOptions, handleIVXAuditReportRequest } from './api/ivx-audit-report';
import { OPTIONS as supabaseInspectionOptions, handleIVXSupabaseInspectionRequest, inspectSupabaseTables } from './api/ivx-supabase-inspection';
import { executeIVXAIBrainTool } from './services/ivx-ai-brain-tool-executor';
import { OPTIONS as supabaseOwnerActionOptions, handleIVXSupabaseOwnerActionRequest } from './api/ivx-supabase-owner-actions';
import { OPTIONS as ownerRegistrationOptions, handleIVXOwnerAccessRepairRequest, handleIVXOwnerAccessRepairStatusRequest, handleIVXOwnerRegistrationRepairRequest, handleIVXOwnerRegistrationRequest, handleIVXOwnerRegistrationStatusRequest, handleIVXOwnerSignupAuditRequest } from './api/ivx-owner-registration';
import { handleIVXDevelopmentActionRequest, handleIVXDevelopmentControlRequest, ivxDevelopmentControlOptions } from './api/ivx-development-control';
import { OPTIONS as aiBrainToolsOptions, handleIVXAIBrainToolExecuteRequest, handleIVXAIBrainToolsListRequest } from './api/ivx-ai-brain-tools';
import { OPTIONS as controlRoomStatusOptions, handleIVXControlRoomStatusRequest } from './api/ivx-control-room-status';
import { OPTIONS as developerDeployOptions, handleIVXDeveloperDeployActionRequest, handleIVXDeveloperDeployStatusRequest } from './api/ivx-developer-deploy-control';
import { OPTIONS as variablesToolOptions, handleIVXVariablesToolSaveRequest, handleIVXVariablesToolStatusRequest } from './api/ivx-variables-tool';
import { OPTIONS as ownerVariablesOptions, getIVXOwnerVariableRuntimeValue, hasIVXOwnerVariableRuntimeValue, handleIVXOwnerVariablesDeleteRequest, handleIVXOwnerVariablesSaveRequest, handleIVXOwnerVariablesSelfSyncRequest, handleIVXOwnerVariablesStatusRequest, handleIVXOwnerVariablesTestRequest } from './api/ivx-owner-variables';
import { OPTIONS as independenceStatusOptions, handleIVXIndependenceStatusRequest } from './api/ivx-independence-status';
import { OPTIONS as agentJobsOptions, handleIVXAgentJobActionRequest, handleIVXAgentJobsCreateRequest, handleIVXAgentJobsListRequest, handleIVXAgentJobsStatusRequest, handleIVXAgentWorkerRunOnceRequest } from './api/ivx-agent-jobs';
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
} from './api/ivx-cto-dashboard';
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
import { handleOwnerAudioTranscribe, ownerTranscriptionOptions } from './api/owner-transcription';

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
const DEPLOYMENT_MARKER = 'ivx-owner-ai-hono-2026-05-14t-render-validator-routes';
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

app.get('/readiness', (context) => {
  return context.json({
    ok: true,
    ready: true,
    status: 'ok',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
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
app.post('/tool', async (context) => handleIVXOwnerAIToolRequest(context.req.raw));
app.post('/api/tool', async (context) => handleIVXOwnerAIToolRequest(context.req.raw));

app.options('/api/ivx/audit-report', () => auditReportOptions());
app.get('/api/ivx/audit-report', async (context) => handleIVXAuditReportRequest(context.req.raw));

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
app.options('/api/ivx/cto-dashboard/parent/:parentId/tree', () => ctoDashboardOptions());
app.get('/api/ivx/cto-dashboard/parent/:parentId/tree', async (context) => handleCTODashboardParentTree(context.req.raw, context.req.param('parentId')));

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

app.onError((error, context) => {
  console.log('[IVXOwnerAI-Hono] Unhandled error:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
    message: error instanceof Error ? error.message : 'unknown',
  });
  return context.json({
    error: 'Internal server error',
    detail: error instanceof Error ? error.message : 'unknown',
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

export default app;
