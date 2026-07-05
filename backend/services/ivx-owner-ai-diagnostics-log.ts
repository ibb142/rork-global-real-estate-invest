/**
 * Permanent diagnostics ring buffer for owner AI message lifecycle.
 *
 * Every owner AI request stamps a single entry capturing every stage:
 *   - requestId, conversationId
 *   - planner decision (route / useTools / intent)
 *   - source/provider/model
 *   - provider latency (ms)
 *   - DB insert status (assistant message persisted yes/no)
 *   - HTTP status, error, deployment marker
 *   - timestamps
 *
 * Frontend stages (render success, realtime delivery) are appended later via
 * the diagnostics client-event endpoint and merged into the same entry by
 * `requestId`. This gives the owner a single auditable record per message
 * without secrets.
 *
 * Storage is intentionally in-memory (200-entry ring) so it survives a single
 * backend process and is owner-only readable. No PII, no message bodies, no
 * tokens.
 */
import { recordMetricSample } from './ivx-metrics-store';

export type OwnerAIDiagnosticsStage =
  | 'received'
  | 'auth_ok'
  | 'planner'
  | 'documents_extracted'
  | 'videos_analyzed'
  | 'provider_start'
  | 'provider_ok'
  | 'provider_failed'
  | 'db_insert_ok'
  | 'db_insert_failed'
  | 'http_responded'
  | 'frontend_request_started'
  | 'frontend_response_received'
  | 'frontend_render_ok'
  | 'frontend_render_failed'
  | 'frontend_realtime_delivered'
  | 'frontend_typing_cleared'
  | 'frontend_error';

export type OwnerAIDiagnosticsStageEntry = {
  stage: OwnerAIDiagnosticsStage;
  at: string;
  detail?: Record<string, unknown> | null;
};

export type OwnerAIDiagnosticsEntry = {
  requestId: string;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
  // Backend fields
  plannerRoute: string | null;
  plannerIntent: string | null;
  plannerUseTools: boolean | null;
  source: string | null;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  providerLatencyMs: number | null;
  assistantPersisted: boolean | null;
  assistantMessageId: string | null;
  httpStatus: number | null;
  error: string | null;
  deploymentMarker: string | null;
  // Frontend fields (filled by client events)
  frontendRequestStartedAt: string | null;
  frontendResponseReceivedAt: string | null;
  frontendRenderedAt: string | null;
  frontendRealtimeDeliveredAt: string | null;
  frontendTypingClearedAt: string | null;
  frontendError: string | null;
  // Full stage log
  stages: OwnerAIDiagnosticsStageEntry[];
};

const MAX_ENTRIES = 200;
const STORE: Map<string, OwnerAIDiagnosticsEntry> = new Map();
const ORDER: string[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

function ensureEntry(requestId: string, conversationId?: string | null): OwnerAIDiagnosticsEntry {
  const existing = STORE.get(requestId);
  if (existing) {
    if (conversationId && !existing.conversationId) {
      existing.conversationId = conversationId;
    }
    return existing;
  }
  const entry: OwnerAIDiagnosticsEntry = {
    requestId,
    conversationId: conversationId ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    plannerRoute: null,
    plannerIntent: null,
    plannerUseTools: null,
    source: null,
    provider: null,
    model: null,
    endpoint: null,
    providerLatencyMs: null,
    assistantPersisted: null,
    assistantMessageId: null,
    httpStatus: null,
    error: null,
    deploymentMarker: null,
    frontendRequestStartedAt: null,
    frontendResponseReceivedAt: null,
    frontendRenderedAt: null,
    frontendRealtimeDeliveredAt: null,
    frontendTypingClearedAt: null,
    frontendError: null,
    stages: [],
  };
  STORE.set(requestId, entry);
  ORDER.push(requestId);
  while (ORDER.length > MAX_ENTRIES) {
    const oldest = ORDER.shift();
    if (oldest) STORE.delete(oldest);
  }
  return entry;
}

export function recordOwnerAIDiagnosticStage(input: {
  requestId: string;
  conversationId?: string | null;
  stage: OwnerAIDiagnosticsStage;
  detail?: Record<string, unknown> | null;
}): void {
  if (!input.requestId || typeof input.requestId !== 'string') return;
  const entry = ensureEntry(input.requestId, input.conversationId ?? null);
  entry.updatedAt = nowIso();
  entry.stages.push({ stage: input.stage, at: entry.updatedAt, detail: input.detail ?? null });
  const d = input.detail ?? {};
  // Pull known fields onto the entry header for easy scanning.
  const pickString = (k: string): string | null => {
    const v = (d as Record<string, unknown>)[k];
    return typeof v === 'string' && v.trim().length > 0 ? v : null;
  };
  const pickBool = (k: string): boolean | null => {
    const v = (d as Record<string, unknown>)[k];
    return typeof v === 'boolean' ? v : null;
  };
  const pickNum = (k: string): number | null => {
    const v = (d as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  if (input.stage === 'planner') {
    entry.plannerRoute = pickString('route') ?? entry.plannerRoute;
    entry.plannerIntent = pickString('semanticIntent') ?? entry.plannerIntent;
    entry.plannerUseTools = pickBool('useTools') ?? entry.plannerUseTools;
  } else if (input.stage === 'provider_ok' || input.stage === 'provider_failed') {
    entry.source = pickString('source') ?? entry.source;
    entry.provider = pickString('provider') ?? entry.provider;
    entry.model = pickString('model') ?? entry.model;
    entry.endpoint = pickString('endpoint') ?? entry.endpoint;
    entry.providerLatencyMs = pickNum('latencyMs') ?? entry.providerLatencyMs;
    if (input.stage === 'provider_failed') {
      entry.error = pickString('error') ?? entry.error;
    }
    // Metric: AI provider (OpenAI) request latency + success.
    recordMetricSample({
      kind: 'openai_request',
      latencyMs: pickNum('latencyMs'),
      success: input.stage === 'provider_ok',
      detail: entry.provider ?? entry.model ?? null,
    });
  } else if (input.stage === 'db_insert_ok') {
    entry.assistantPersisted = true;
    entry.assistantMessageId = pickString('assistantMessageId') ?? entry.assistantMessageId;
  } else if (input.stage === 'db_insert_failed') {
    entry.assistantPersisted = false;
    entry.error = pickString('error') ?? entry.error;
  } else if (input.stage === 'http_responded') {
    entry.httpStatus = pickNum('httpStatus') ?? entry.httpStatus;
    entry.deploymentMarker = pickString('deploymentMarker') ?? entry.deploymentMarker;
    // Metrics: overall owner-AI HTTP round-trip latency + owner-route success.
    const httpStatus = entry.httpStatus;
    const success = typeof httpStatus === 'number' && httpStatus >= 200 && httpStatus < 300;
    const createdMs = Date.parse(entry.createdAt);
    const apiLatencyMs = Number.isFinite(createdMs) ? Date.now() - createdMs : null;
    recordMetricSample({ kind: 'api_request', latencyMs: apiLatencyMs, success, statusCode: httpStatus ?? null, detail: entry.endpoint ?? null });
    recordMetricSample({ kind: 'owner_route', latencyMs: apiLatencyMs, success, statusCode: httpStatus ?? null, detail: entry.endpoint ?? null });
  } else if (input.stage === 'frontend_request_started') {
    entry.frontendRequestStartedAt = entry.updatedAt;
  } else if (input.stage === 'frontend_response_received') {
    entry.frontendResponseReceivedAt = entry.updatedAt;
  } else if (input.stage === 'frontend_render_ok') {
    entry.frontendRenderedAt = entry.updatedAt;
  } else if (input.stage === 'frontend_render_failed') {
    entry.frontendError = pickString('error') ?? entry.frontendError;
  } else if (input.stage === 'frontend_realtime_delivered') {
    entry.frontendRealtimeDeliveredAt = entry.updatedAt;
  } else if (input.stage === 'frontend_typing_cleared') {
    entry.frontendTypingClearedAt = entry.updatedAt;
  } else if (input.stage === 'frontend_error') {
    entry.frontendError = pickString('error') ?? entry.frontendError;
  }
}

export function listOwnerAIDiagnostics(limit: number = 50): OwnerAIDiagnosticsEntry[] {
  const safeLimit = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit)));
  const ids = ORDER.slice(-safeLimit).reverse();
  return ids.map((id) => STORE.get(id)).filter((e): e is OwnerAIDiagnosticsEntry => Boolean(e));
}

export function getOwnerAIDiagnostic(requestId: string): OwnerAIDiagnosticsEntry | null {
  return STORE.get(requestId) ?? null;
}

export function clearOwnerAIDiagnosticsForTest(): void {
  STORE.clear();
  ORDER.length = 0;
}
