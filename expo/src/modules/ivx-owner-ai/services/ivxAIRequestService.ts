import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID } from '@/constants/ivx-owner-ai';
import {
  getIVXAccessToken,
  getIVXOwnerAIConfigAudit,
  getIVXOwnerAICandidateEndpoints,
  getIVXOwnerAIEndpoint,
  type IVXOwnerAIConfigAudit,
} from '@/lib/ivx-supabase-client';
import type {
  IVXOwnerAICanonicalResponse,
  IVXOwnerAIHealthProbeResponse,
  IVXOwnerAIRejectedResponse,
  IVXOwnerAIRequest,
  IVXOwnerAIResponse,
  IVXOwnerAIRoomStatus,
} from '@/shared/ivx';
import type { ServiceRuntimeHealth } from '@/src/modules/chat/types/chat';
import { buildOwnerTrustPromptBlock } from './ownerTrust';

export type IVXOwnerAIProbeResult = {
  health: ServiceRuntimeHealth;
  roomStatus: IVXOwnerAIRoomStatus | null;
  source: 'remote_api' | 'toolkit_fallback' | 'unknown';
  endpoint: string | null;
  deploymentMarker: string | null;
  capabilities: IVXOwnerAIHealthProbeResponse['capabilities'] | null;
};

export type IVXOwnerAIRequestDiagnosticStage = 'routing' | 'auth' | 'network' | 'http' | 'response' | 'unknown';

export type IVXOwnerAIRequestDiagnostics = {
  stage: IVXOwnerAIRequestDiagnosticStage;
  classification: string;
  statusCode: number | null;
  endpoint: string | null;
  baseUrl: string | null;
  requestId: string | null;
  detail: string;
  responsePreview: string | null;
  routingPolicy: IVXOwnerAIConfigAudit['routingPolicy'];
  selectionReason: string;
  fallbackUsed: boolean;
};

export type IVXOwnerAIRuntimeProof = {
  source: 'remote_api' | 'toolkit_fallback' | 'pending';
  requestStage: string;
  failureClass: string;
  statusCode: number | null;
  endpoint: string | null;
  baseUrl: string | null;
  requestId: string | null;
  detail: string;
  responsePreview: string | null;
  deploymentMarker: string | null;
  lastUpdatedAt: number;
};

type EndpointFetchResult = {
  endpoint: string;
  response: Response;
};

export class IVXOwnerAIRequestError extends Error {
  readonly diagnostics: IVXOwnerAIRequestDiagnostics;

  constructor(message: string, diagnostics: IVXOwnerAIRequestDiagnostics) {
    super(message);
    this.name = 'IVXOwnerAIRequestError';
    this.diagnostics = diagnostics;
  }
}

let lastOwnerAIRuntimeProof: IVXOwnerAIRuntimeProof | null = null;

function setLastOwnerAIRuntimeProof(proof: IVXOwnerAIRuntimeProof): void {
  lastOwnerAIRuntimeProof = proof;
  console.log('[IVXAIRequestService] Runtime proof updated:', proof);
}

export function getLastIVXOwnerAIRuntimeProof(): IVXOwnerAIRuntimeProof | null {
  return lastOwnerAIRuntimeProof;
}

function createRequestDiagnostics(input: {
  stage: IVXOwnerAIRequestDiagnosticStage;
  classification: string;
  statusCode?: number | null;
  endpoint?: string | null;
  baseUrl?: string | null;
  requestId?: string | null;
  detail: string;
  responsePreview?: string | null;
  audit: IVXOwnerAIConfigAudit;
}): IVXOwnerAIRequestDiagnostics {
  return {
    stage: input.stage,
    classification: input.classification,
    statusCode: input.statusCode ?? null,
    endpoint: input.endpoint ?? input.audit.activeEndpoint ?? null,
    baseUrl: input.baseUrl ?? input.audit.activeBaseUrl ?? null,
    requestId: input.requestId ?? null,
    detail: input.detail,
    responsePreview: input.responsePreview ?? null,
    routingPolicy: input.audit.routingPolicy,
    selectionReason: input.audit.selectionReason,
    fallbackUsed: input.audit.fallbackUsed,
  };
}

function createRuntimeProofFromDiagnostics(
  diagnostics: IVXOwnerAIRequestDiagnostics,
  source: 'remote_api' | 'toolkit_fallback',
  deploymentMarker: string | null = null,
): IVXOwnerAIRuntimeProof {
  return {
    source,
    requestStage: diagnostics.stage,
    failureClass: diagnostics.classification,
    statusCode: diagnostics.statusCode,
    endpoint: diagnostics.endpoint,
    baseUrl: diagnostics.baseUrl,
    requestId: diagnostics.requestId,
    detail: diagnostics.detail,
    responsePreview: diagnostics.responsePreview,
    deploymentMarker,
    lastUpdatedAt: Date.now(),
  };
}

function summarizePayloadPreview(payload: unknown): string | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed ? trimmed.slice(0, 240) : null;
  }

  if (Array.isArray(payload)) {
    return `array(${payload.length})`;
  }

  if (isRecord(payload)) {
    return Object.keys(payload).slice(0, 12).join(', ');
  }

  return String(payload).slice(0, 240);
}

function classifyHttpFailure(status: number): string {
  if (status === 401 || status === 403) {
    return 'auth_rejected';
  }

  if (status === 404 || status === 405) {
    return 'route_unavailable';
  }

  if (status >= 500) {
    return 'backend_failure';
  }

  return 'http_error';
}

function classifyUnknownFailure(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('network request failed') || message.includes('failed to fetch') || message.includes('load failed')) {
    return 'network_unreachable';
  }
  if (message.includes('auth') || message.includes('token') || message.includes('owner session')) {
    return 'auth_missing';
  }
  if (message.includes('route') || message.includes('endpoint') || message.includes('not configured')) {
    return 'routing_blocked';
  }
  if (message.includes('schema') || message.includes('payload') || message.includes('json')) {
    return 'response_invalid';
  }
  return 'unknown_failure';
}

export function getIVXOwnerAIErrorDiagnostics(error: unknown): IVXOwnerAIRequestDiagnostics | null {
  if (error instanceof IVXOwnerAIRequestError) {
    return error.diagnostics;
  }

  return null;
}

function toIVXOwnerAIRequestError(input: {
  error: unknown;
  audit: IVXOwnerAIConfigAudit;
  stage?: IVXOwnerAIRequestDiagnosticStage;
  classification?: string;
  statusCode?: number | null;
  endpoint?: string | null;
  requestId?: string | null;
  responsePreview?: string | null;
}): IVXOwnerAIRequestError {
  if (input.error instanceof IVXOwnerAIRequestError) {
    return input.error;
  }

  const detail = input.error instanceof Error ? input.error.message : 'Unable to reach IVX Owner AI.';
  return new IVXOwnerAIRequestError(
    detail,
    createRequestDiagnostics({
      stage: input.stage ?? 'unknown',
      classification: input.classification ?? classifyUnknownFailure(input.error),
      statusCode: input.statusCode ?? null,
      endpoint: input.endpoint ?? null,
      requestId: input.requestId ?? null,
      responsePreview: input.responsePreview ?? null,
      detail,
      audit: input.audit,
    }),
  );
}

function throwIVXOwnerAIRequestError(input: {
  message: string;
  audit: IVXOwnerAIConfigAudit;
  stage: IVXOwnerAIRequestDiagnosticStage;
  classification: string;
  statusCode?: number | null;
  endpoint?: string | null;
  requestId?: string | null;
  responsePreview?: string | null;
}): never {
  throw new IVXOwnerAIRequestError(
    input.message,
    createRequestDiagnostics({
      stage: input.stage,
      classification: input.classification,
      statusCode: input.statusCode ?? null,
      endpoint: input.endpoint ?? null,
      requestId: input.requestId ?? null,
      responsePreview: input.responsePreview ?? null,
      detail: input.message,
      audit: input.audit,
    }),
  );
}

type OwnerAIRequestPayload = {
  requestId: string;
  conversationId: string;
  message: string;
  senderLabel: string | null;
  mode: 'chat' | 'command';
  persistUserMessage: boolean;
  persistAssistantMessage: boolean;
  devTestModeActive: boolean;
};

class IVXOwnerAIRoutingError extends Error {
  readonly audit = getIVXOwnerAIConfigAudit();

  constructor(message?: string) {
    super(message ?? getIVXOwnerAIConfigAudit().configurationError ?? 'Owner AI routing is blocked by configuration.');
    this.name = 'IVXOwnerAIRoutingError';
  }
}

function readErrorMessage(payload: unknown): string {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (!payload || typeof payload !== 'object') {
    return 'Unable to reach IVX Owner AI.';
  }

  const record = payload as Record<string, unknown>;
  const nestedError = record.error;
  if (typeof nestedError === 'string' && nestedError.trim().length > 0) {
    return nestedError.trim();
  }

  if (nestedError && typeof nestedError === 'object' && typeof (nestedError as { message?: unknown }).message === 'string') {
    return ((nestedError as { message: string }).message).trim();
  }

  if (typeof record.message === 'string' && record.message.trim().length > 0) {
    return record.message.trim();
  }

  return 'Unable to reach IVX Owner AI.';
}

async function readOwnerAIResponseBody(response: Response): Promise<unknown> {
  let responseText: unknown;
  try {
    responseText = await response.text();
  } catch (readError) {
    console.log('[IVXAIRequestService] Failed to read response body:', readError instanceof Error ? readError.message : 'unknown');
    return null;
  }
  if (typeof responseText !== 'string') {
    console.log('[IVXAIRequestService] response.text() returned non-string:', typeof responseText);
    return null;
  }
  const rawText = responseText;
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch (error) {
    console.log('[IVXAIRequestService] Response body was not valid JSON:', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      preview: rawText.slice(0, 240),
      parseError: error instanceof Error ? error.message : 'unknown',
    });
    return rawText;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getPayloadType(value: unknown): IVXOwnerAIRejectedResponse['payloadType'] {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value as IVXOwnerAIRejectedResponse['payloadType'];
}

function validateCanonicalOwnerAIResponse(
  payload: unknown,
  fallbackRequestPrefix: string,
): {
  data: IVXOwnerAICanonicalResponse | null;
  rejection: IVXOwnerAIRejectedResponse | null;
} {
  if (!isRecord(payload)) {
    return {
      data: null,
      rejection: {
        reason: 'non_object_payload',
        payloadType: getPayloadType(payload),
      },
    };
  }

  const requestId = payload.requestId;
  const conversationId = payload.conversationId;
  const answer = payload.answer;
  const model = payload.model;
  const status = payload.status;
  const deploymentMarker = payload.deploymentMarker;
  const normalizedRequestId = typeof requestId === 'string' && requestId.trim().length > 0
    ? requestId.trim()
    : `${fallbackRequestPrefix}-canonical`;

  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    return { data: null, rejection: { reason: 'missing_conversation_id', payloadType: 'object' } };
  }

  if (typeof answer !== 'string' || !answer.trim()) {
    return { data: null, rejection: { reason: 'missing_answer', payloadType: 'object' } };
  }

  if (typeof model !== 'string' || !model.trim()) {
    return { data: null, rejection: { reason: 'missing_model', payloadType: 'object' } };
  }

  if (status !== 'ok') {
    return { data: null, rejection: { reason: 'invalid_status', payloadType: 'object' } };
  }

  if (deploymentMarker !== undefined && typeof deploymentMarker !== 'string') {
    return { data: null, rejection: { reason: 'invalid_deployment_marker', payloadType: 'object' } };
  }

  return {
    data: {
      requestId: normalizedRequestId,
      conversationId: conversationId.trim(),
      answer: answer.trim(),
      model: model.trim(),
      status: 'ok',
      deploymentMarker: typeof deploymentMarker === 'string' && deploymentMarker.trim() ? deploymentMarker.trim() : undefined,
    },
    rejection: null,
  };
}

function extractCompatibilityOwnerAIResponse(
  payload: unknown,
  fallbackConversationId: string,
  fallbackRequestPrefix: string,
): IVXOwnerAICanonicalResponse | null {
  const record = isRecord(payload) ? payload : null;
  const resultRecord = isRecord(record?.result) ? record.result : null;
  const answerCandidate = [
    record?.answer,
    record?.response,
    record?.text,
    resultRecord?.answer,
    resultRecord?.response,
    resultRecord?.text,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  const requestIdCandidate = [
    record?.requestId,
    record?.request_id,
    resultRecord?.requestId,
    resultRecord?.request_id,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  const conversationIdCandidate = [
    record?.conversationId,
    record?.conversation_id,
    resultRecord?.conversationId,
    resultRecord?.conversation_id,
    fallbackConversationId,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  const modelCandidate = [
    record?.model,
    resultRecord?.model,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  const deploymentMarkerCandidate = [
    record?.deploymentMarker,
    record?.deployment_marker,
    resultRecord?.deploymentMarker,
    resultRecord?.deployment_marker,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  if (
    typeof conversationIdCandidate !== 'string'
    || typeof answerCandidate !== 'string'
    || typeof modelCandidate !== 'string'
  ) {
    return null;
  }

  const normalizedRequestId = typeof requestIdCandidate === 'string' && requestIdCandidate.trim().length > 0
    ? requestIdCandidate.trim()
    : `${fallbackRequestPrefix}-compat`;

  return {
    requestId: normalizedRequestId,
    conversationId: conversationIdCandidate.trim(),
    answer: answerCandidate.trim(),
    model: modelCandidate.trim(),
    status: 'ok',
    deploymentMarker: typeof deploymentMarkerCandidate === 'string' && deploymentMarkerCandidate.trim()
      ? deploymentMarkerCandidate.trim()
      : undefined,
  };
}

function normalizeOwnerAIResponse(
  payload: unknown,
  fallbackConversationId: string,
  fallbackRequestPrefix: string,
  allowCompatibility: boolean,
): IVXOwnerAIResponse {
  const canonicalValidation = validateCanonicalOwnerAIResponse(payload, fallbackRequestPrefix);
  if (canonicalValidation.data) {
    return canonicalValidation.data;
  }

  if (allowCompatibility) {
    const compatibility = extractCompatibilityOwnerAIResponse(payload, fallbackConversationId, fallbackRequestPrefix);
    if (compatibility) {
      console.log('[IVXAIRequestService] Compatibility response shape accepted temporarily:', {
        fallbackConversationId,
        fallbackRequestPrefix,
        requestId: compatibility.requestId,
        keys: isRecord(payload) ? Object.keys(payload).slice(0, 12) : [],
      });
      return compatibility;
    }
  }

  console.log('[IVXAIRequestService] Owner AI response rejected:', {
    fallbackConversationId,
    fallbackRequestPrefix,
    rejection: canonicalValidation.rejection,
    payloadPreview: isRecord(payload) ? Object.keys(payload).slice(0, 12) : payload,
  });
  throw new Error(readErrorMessage(payload) || 'Owner AI response did not match the canonical schema.');
}

function normalizeOwnerAIHealthProbeResponse(payload: unknown): IVXOwnerAIHealthProbeResponse | null {
  if (!isRecord(payload)) {
    return null;
  }

  const record = payload;
  const normalized = normalizeOwnerAIResponse(payload, IVX_OWNER_AI_ROOM_ID, 'ivx-remote-probe', false);
  const roomStatus = record.roomStatus;
  const capabilities = record.capabilities;

  return {
    ...normalized,
    probe: true,
    resolvedSchema: record.resolvedSchema === 'ivx' || record.resolvedSchema === 'generic' || record.resolvedSchema === 'none'
      ? record.resolvedSchema
      : 'none',
    roomStatus: roomStatus && typeof roomStatus === 'object'
      ? roomStatus as IVXOwnerAIHealthProbeResponse['roomStatus']
      : {
          storageMode: 'local_device_only',
          visibility: 'local_only',
          deliveryMethod: 'local_only',
        },
    capabilities: capabilities && typeof capabilities === 'object'
      ? capabilities as IVXOwnerAIHealthProbeResponse['capabilities']
      : {
          ai_chat: true,
          knowledge_answers: true,
          owner_commands: true,
          code_aware_support: true,
          file_upload: true,
          inbox_sync: true,
        },
  };
}

function createLocalRequestId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createRemoteRequestId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }

  const seed = `${Date.now().toString(16).padStart(12, '0')}${Math.random().toString(16).slice(2).padEnd(20, '0')}`.slice(0, 32);
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-a${seed.slice(17, 20)}-${seed.slice(20, 32)}`;
}

function shouldFallbackToToolkit(status: number | null, message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  if (status !== null && status !== 401 && status !== 403 && (status === 404 || status === 405 || status >= 500)) {
    return true;
  }

  return normalizedMessage.includes('network request failed')
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('load failed')
    || normalizedMessage.includes('not found')
    || normalizedMessage.includes('abort')
    || normalizedMessage.includes('only absolute urls are supported');
}

function buildToolkitPrompt(input: IVXOwnerAIRequest): string {
  const senderLabel = input.senderLabel?.trim() || 'IVX Owner';
  const conversationId = input.conversationId?.trim() || IVX_OWNER_AI_ROOM_ID;
  const isTestMode = input.devTestModeActive === true;
  const trustPolicy = buildOwnerTrustPromptBlock({
    messageText: input.message,
    ownerRoomAuthenticated: true,
    backendAdminVerified: isTestMode,
    fallbackModeActive: !isTestMode,
    devTestModeActive: isTestMode,
  });
  const coreInstruction = isTestMode
    ? 'Execute owner commands directly. Respond with concise status updates only. Do not provide checklists, deployment guidance, instructional templates, or post-confirmation coaching unless the owner explicitly asks.'
    : 'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.';
  const fallbackDisclaimer = isTestMode
    ? ''
    : 'You are running in the in-app fallback path, so do not claim server-side actions were completed unless the user already confirmed them.';
  const parts = [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    coreInstruction,
    trustPolicy,
  ];
  if (fallbackDisclaimer) {
    parts.push(fallbackDisclaimer);
  }
  parts.push(
    `Conversation ID: ${conversationId}`,
    `Mode: ${input.mode ?? 'chat'}`,
    `Sender label: ${senderLabel}`,
    `Owner request: ${input.message}`,
  );
  return parts.join('\n\n');
}

function buildRequestPayload(input: IVXOwnerAIRequest): OwnerAIRequestPayload {
  return {
    requestId: input.requestId ?? createRemoteRequestId(),
    conversationId: input.conversationId ?? IVX_OWNER_AI_ROOM_ID,
    message: input.message,
    senderLabel: input.senderLabel ?? null,
    mode: input.mode ?? 'chat',
    persistUserMessage: input.persistUserMessage ?? false,
    persistAssistantMessage: input.persistAssistantMessage ?? false,
    devTestModeActive: input.devTestModeActive === true,
  };
}

function assertRemoteRoutingAvailable(): void {
  const audit = getIVXOwnerAIConfigAudit();
  if (audit.blocksRemoteRequests || !audit.activeEndpoint) {
    console.log('[IVXAIRequestService] Owner AI routing blocked:', audit);
    throw new IVXOwnerAIRoutingError();
  }
}

function allowToolkitFallbackForRemoteFailures(_audit: IVXOwnerAIConfigAudit): boolean {
  return true;
}

function logOwnerAIRoutingDebug(label: string, audit: IVXOwnerAIConfigAudit, endpoint: string | null): void {
  const baseUrl = audit.activeBaseUrl ?? 'unconfigured';
  const fullUrl = endpoint ?? audit.activeEndpoint ?? 'unconfigured';
  console.log(`[IVXAIRequestService] ${label} BASE_URL:`, baseUrl);
  console.log(`[IVXAIRequestService] ${label} FULL_URL:`, fullUrl);
  console.log(`[IVXAIRequestService] ${label} routing audit:`, {
    routingPolicy: audit.routingPolicy,
    configuredBaseUrl: audit.configuredBaseUrl,
    activeBaseUrl: audit.activeBaseUrl,
    activeEndpoint: audit.activeEndpoint,
    candidateEndpoints: audit.candidateEndpoints,
    fallbackUsed: audit.fallbackUsed,
    blocksRemoteRequests: audit.blocksRemoteRequests,
  });
}

function extractToolkitText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      return record.text.trim();
    }
    if (typeof record.content === 'string' && record.content.trim()) {
      return record.content.trim();
    }
    if (typeof record.answer === 'string' && record.answer.trim()) {
      return record.answer.trim();
    }
  }
  return '';
}

async function requestToolkitFallback(input: IVXOwnerAIRequest): Promise<IVXOwnerAIResponse> {
  const prompt = buildToolkitPrompt(input);
  const rawAnswer = await toolkitGenerateText({
    messages: [{ role: 'user', content: prompt }],
  });
  const answer = extractToolkitText(rawAnswer);

  if (!answer) {
    console.log('[IVXAIRequestService] Toolkit fallback returned non-usable output:', typeof rawAnswer, rawAnswer);
    throw new Error('AI returned an empty fallback response.');
  }

  console.log('[IVXAIRequestService] Toolkit fallback reply received, length:', answer.length);

  const requestId = createLocalRequestId('ivx-toolkit');
  setLastOwnerAIRuntimeProof({
    source: 'toolkit_fallback',
    requestStage: 'fallback_reply',
    failureClass: 'none',
    statusCode: null,
    endpoint: null,
    baseUrl: null,
    requestId,
    detail: 'Toolkit fallback produced visible response text.',
    responsePreview: answer.slice(0, 240),
    deploymentMarker: null,
    lastUpdatedAt: Date.now(),
  });

  return {
    requestId,
    conversationId: input.conversationId ?? IVX_OWNER_AI_ROOM_ID,
    answer,
    model: 'rork-toolkit-fallback',
    status: 'ok',
    source: 'toolkit_fallback',
    endpoint: undefined,
    deploymentMarker: undefined,
  };
}

async function probeToolkitFallback(): Promise<IVXOwnerAIProbeResult> {
  try {
    const rawProbeAnswer = await toolkitGenerateText({
      messages: [{ role: 'user', content: 'Reply with READY only.' }],
    });
    const answer = extractToolkitText(rawProbeAnswer);

    if (!answer) {
      console.log('[IVXAIRequestService] Toolkit fallback probe returned empty output');
      return {
        health: 'inactive',
        roomStatus: null,
        source: 'toolkit_fallback',
        endpoint: null,
        deploymentMarker: null,
        capabilities: null,
      };
    }

    console.log('[IVXAIRequestService] Toolkit fallback probe succeeded');
    return {
      health: 'degraded',
      roomStatus: null,
      source: 'toolkit_fallback',
      endpoint: null,
      deploymentMarker: null,
      capabilities: null,
    };
  } catch (error) {
    console.log('[IVXAIRequestService] Toolkit fallback probe failed:', (error as Error)?.message ?? 'unknown');
    return {
      health: 'inactive',
      roomStatus: null,
      source: 'toolkit_fallback',
      endpoint: null,
      deploymentMarker: null,
      capabilities: null,
    };
  }
}

async function fetchOwnerAIEndpointWithFallback(
  accessToken: string,
  payload: OwnerAIRequestPayload,
  requestLabel: string,
): Promise<EndpointFetchResult> {
  assertRemoteRoutingAvailable();
  const candidateEndpoints = getIVXOwnerAICandidateEndpoints();
  let lastResponse: EndpointFetchResult | null = null;
  let lastRecoverableError: Error | null = null;

  for (const endpoint of candidateEndpoints) {
    try {
      console.log(`[IVXAIRequestService] ${requestLabel} attempting endpoint:`, endpoint);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        console.log(`[IVXAIRequestService] ${requestLabel} endpoint unavailable:`, endpoint, 'status:', response.status);
        lastResponse = { endpoint, response };
        continue;
      }

      return { endpoint, response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown endpoint error';
      if (shouldFallbackToToolkit(null, message)) {
        console.log(`[IVXAIRequestService] ${requestLabel} endpoint failed, trying next candidate:`, endpoint, message);
        lastRecoverableError = error instanceof Error ? error : new Error(message);
        continue;
      }

      throw error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastRecoverableError ?? new Error(`Unable to reach IVX Owner AI at ${getIVXOwnerAIEndpoint()}`);
}

export const ivxAIRequestService = {
  async requestOwnerAI(input: IVXOwnerAIRequest): Promise<IVXOwnerAIResponse> {
    const accessToken = await getIVXAccessToken();
    const payload = buildRequestPayload(input);
    const routingAudit = getIVXOwnerAIConfigAudit();

    setLastOwnerAIRuntimeProof({
      source: 'pending',
      requestStage: 'request_started',
      failureClass: 'pending',
      statusCode: null,
      endpoint: routingAudit.activeEndpoint,
      baseUrl: routingAudit.activeBaseUrl,
      requestId: payload.requestId,
      detail: 'Remote IVX request started.',
      responsePreview: null,
      deploymentMarker: null,
      lastUpdatedAt: Date.now(),
    });

    if (!accessToken) {
      const diagnostics = createRequestDiagnostics({
        audit: routingAudit,
        stage: 'auth',
        classification: 'auth_missing',
        requestId: payload.requestId,
        detail: 'Remote IVX request could not start because no owner auth token was available. Falling back to toolkit reply.',
      });
      setLastOwnerAIRuntimeProof(createRuntimeProofFromDiagnostics(diagnostics, 'toolkit_fallback'));
      console.log('[IVXAIRequestService] No auth token, using toolkit fallback for owner AI request');
      return await requestToolkitFallback(input);
    }

    if (routingAudit.blocksRemoteRequests) {
      const diagnostics = createRequestDiagnostics({
        audit: routingAudit,
        stage: 'routing',
        classification: 'routing_blocked',
        requestId: payload.requestId,
        detail: routingAudit.configurationError ?? 'Owner AI routing is blocked by configuration.',
      });
      setLastOwnerAIRuntimeProof(createRuntimeProofFromDiagnostics(diagnostics, 'toolkit_fallback'));
      console.log('[IVXAIRequestService] Routing blocked, using toolkit fallback:', routingAudit.configurationError);
      return await requestToolkitFallback(input);
    }

    const resolvedEndpoint = getIVXOwnerAIEndpoint();
    logOwnerAIRoutingDebug('requestOwnerAI', routingAudit, resolvedEndpoint);
    console.log('[IVXAIRequestService] Sending AI request:', {
      endpoint: resolvedEndpoint,
      conversationId: payload.conversationId,
      hasMessage: (typeof input.message === 'string' ? input.message.trim() : '').length > 0,
      mode: payload.mode,
      devTestModeActive: payload.devTestModeActive,
      routingPolicy: routingAudit.routingPolicy,
      requestId: payload.requestId,
    });

    try {
      const result = await fetchOwnerAIEndpointWithFallback(accessToken, payload, 'Owner AI request');
      console.log('[IVXAIRequestService] Owner AI request resolved endpoint:', result.endpoint, 'status:', result.response.status);

      const payloadResponse = await readOwnerAIResponseBody(result.response);
      console.log('[IVXAIRequestService] Owner AI raw response payload:', payloadResponse);

      if (!result.response.ok) {
        const errorMessage = readErrorMessage(payloadResponse);
        if (shouldFallbackToToolkit(result.response.status, errorMessage) && allowToolkitFallbackForRemoteFailures(routingAudit)) {
          const diagnostics = createRequestDiagnostics({
            audit: routingAudit,
            stage: result.response.status === 401 || result.response.status === 403 ? 'auth' : 'http',
            classification: classifyHttpFailure(result.response.status),
            statusCode: result.response.status,
            endpoint: result.endpoint,
            requestId: payload.requestId,
            responsePreview: summarizePayloadPreview(payloadResponse),
            detail: errorMessage,
          });
          setLastOwnerAIRuntimeProof(createRuntimeProofFromDiagnostics(diagnostics, 'toolkit_fallback'));
          console.log('[IVXAIRequestService] Remote AI request unavailable in development, using toolkit fallback:', result.response.status, errorMessage);
          return await requestToolkitFallback(input);
        }
        throwIVXOwnerAIRequestError({
          message: errorMessage,
          audit: routingAudit,
          stage: result.response.status === 401 || result.response.status === 403 ? 'auth' : 'http',
          classification: classifyHttpFailure(result.response.status),
          statusCode: result.response.status,
          endpoint: result.endpoint,
          requestId: payload.requestId,
          responsePreview: summarizePayloadPreview(payloadResponse),
        });
      }

      try {
        const data = normalizeOwnerAIResponse(
          payloadResponse,
          payload.conversationId,
          payload.requestId,
          routingAudit.currentEnvironment === 'development',
        );
        setLastOwnerAIRuntimeProof({
          source: 'remote_api',
          requestStage: 'response_ok',
          failureClass: 'none',
          statusCode: result.response.status,
          endpoint: result.endpoint,
          baseUrl: routingAudit.activeBaseUrl,
          requestId: data.requestId,
          detail: 'Remote IVX endpoint replied with the canonical contract.',
          responsePreview: data.answer.slice(0, 240),
          deploymentMarker: data.deploymentMarker ?? null,
          lastUpdatedAt: Date.now(),
        });
        return {
          ...data,
          source: 'remote_api',
          endpoint: result.endpoint,
          deploymentMarker: data.deploymentMarker,
        } satisfies IVXOwnerAIResponse;
      } catch (responseError) {
        throw toIVXOwnerAIRequestError({
          error: responseError,
          audit: routingAudit,
          stage: 'response',
          classification: 'response_invalid',
          endpoint: result.endpoint,
          requestId: payload.requestId,
          responsePreview: summarizePayloadPreview(payloadResponse),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach IVX Owner AI.';
      if (shouldFallbackToToolkit(null, message) && allowToolkitFallbackForRemoteFailures(routingAudit)) {
        const diagnostics = createRequestDiagnostics({
          audit: routingAudit,
          stage: 'network',
          classification: classifyUnknownFailure(error),
          endpoint: resolvedEndpoint,
          requestId: payload.requestId,
          detail: message,
        });
        setLastOwnerAIRuntimeProof(createRuntimeProofFromDiagnostics(diagnostics, 'toolkit_fallback'));
        console.log('[IVXAIRequestService] Request failed before remote response in development, using toolkit fallback:', message);
        return await requestToolkitFallback(input);
      }

      const requestError = toIVXOwnerAIRequestError({
        error,
        audit: routingAudit,
        endpoint: resolvedEndpoint,
        requestId: payload.requestId,
      });
      setLastOwnerAIRuntimeProof(createRuntimeProofFromDiagnostics(requestError.diagnostics, 'remote_api'));
      console.log('[IVXAIRequestService] Request failed with diagnostics:', requestError.diagnostics);
      throw requestError;
    }
  },

  async probeOwnerAIHealth(): Promise<IVXOwnerAIProbeResult> {
    const accessToken = await getIVXAccessToken();
    const payload = buildRequestPayload({
      message: 'health_probe',
      mode: 'chat',
    });
    const routingAudit = getIVXOwnerAIConfigAudit();

    if (!accessToken) {
      console.log('[IVXAIRequestService] No auth token for owner AI probe, using toolkit fallback health');
      return await probeToolkitFallback();
    }

    if (routingAudit.blocksRemoteRequests) {
      console.log('[IVXAIRequestService] Owner AI probe blocked by routing policy, trying toolkit fallback');
      return await probeToolkitFallback();
    }

    const resolvedEndpoint = getIVXOwnerAIEndpoint();
    logOwnerAIRoutingDebug('probeOwnerAIHealth', routingAudit, resolvedEndpoint);
    console.log('[IVXAIRequestService] Probing owner AI health:', resolvedEndpoint);

    try {
      const result = await fetchOwnerAIEndpointWithFallback(accessToken, payload, 'Owner AI probe');
      console.log('[IVXAIRequestService] Owner AI probe resolved endpoint:', result.endpoint, 'status:', result.response.status);

      const payloadResponse = await readOwnerAIResponseBody(result.response);
      console.log('[IVXAIRequestService] Owner AI raw probe payload:', payloadResponse);

      if (!result.response.ok) {
        const errorMessage = readErrorMessage(payloadResponse);
        if (result.response.status === 401 || result.response.status === 403) {
          console.log('[IVXAIRequestService] Owner AI probe unauthorized:', result.response.status, errorMessage);
          return {
            health: 'inactive',
            roomStatus: null,
            source: 'remote_api',
            endpoint: result.endpoint,
            deploymentMarker: null,
            capabilities: null,
          };
        }

        if (shouldFallbackToToolkit(result.response.status, errorMessage) && allowToolkitFallbackForRemoteFailures(routingAudit)) {
          console.log('[IVXAIRequestService] Owner AI probe falling back to toolkit in development:', result.response.status, errorMessage);
          return await probeToolkitFallback();
        }

        return {
          health: 'inactive',
          roomStatus: null,
          source: 'remote_api',
          endpoint: result.endpoint,
          deploymentMarker: null,
          capabilities: null,
        };
      }

      const data = normalizeOwnerAIHealthProbeResponse(payloadResponse);
      return {
        health: 'active',
        roomStatus: data?.roomStatus ?? null,
        source: 'remote_api',
        endpoint: result.endpoint,
        deploymentMarker: data?.deploymentMarker ?? null,
        capabilities: data?.capabilities ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown probe error';
      if (error instanceof IVXOwnerAIRoutingError) {
        console.log('[IVXAIRequestService] Owner AI probe routing error:', error.message);
        return {
          health: 'inactive',
          roomStatus: null,
          source: 'remote_api',
          endpoint: routingAudit.activeEndpoint,
          deploymentMarker: null,
          capabilities: null,
        };
      }
      if (shouldFallbackToToolkit(null, message) && allowToolkitFallbackForRemoteFailures(routingAudit)) {
        console.log('[IVXAIRequestService] Owner AI probe network failure in development, using toolkit fallback:', message);
        return await probeToolkitFallback();
      }

      console.log('[IVXAIRequestService] Owner AI probe failed:', message);
      return {
        health: 'inactive',
        roomStatus: null,
        source: 'remote_api',
        endpoint: null,
        deploymentMarker: null,
        capabilities: null,
      };
    }
  },
};
