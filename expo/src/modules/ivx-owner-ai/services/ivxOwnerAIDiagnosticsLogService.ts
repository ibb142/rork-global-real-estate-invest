/**
 * Owner-only client for the permanent owner-AI diagnostics ring buffer.
 *
 * The backend stamps every owner AI request lifecycle stage (planner,
 * provider start/ok/failed, db insert, http) into an in-memory ring keyed
 * by requestId. The frontend appends its own stages (request started,
 * response received, render ok/failed, realtime delivered, typing cleared,
 * frontend error) so the owner can audit any individual message end-to-end.
 *
 * Public surface:
 *   - listOwnerAIDiagnosticEntries({ limit })
 *   - getOwnerAIDiagnosticEntry(requestId)
 *   - recordOwnerAIDiagnosticClientEvent({ requestId, conversationId, stage, detail })
 *
 * No message bodies, no tokens. Owner bearer required.
 */

import { getIVXAccessToken, getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

export type OwnerAIDiagnosticsStage =
  | 'received'
  | 'auth_ok'
  | 'planner'
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
  frontendRequestStartedAt: string | null;
  frontendResponseReceivedAt: string | null;
  frontendRenderedAt: string | null;
  frontendRealtimeDeliveredAt: string | null;
  frontendTypingClearedAt: string | null;
  frontendError: string | null;
  stages: OwnerAIDiagnosticsStageEntry[];
};

function resolveBaseUrl(): string | null {
  try {
    return getIVXOwnerAIConfigAudit().activeBaseUrl;
  } catch {
    return null;
  }
}

async function resolveAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = await getIVXAccessToken();
    if (token && typeof token === 'string' && token.length > 0) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // owner bearer unavailable; backend will reject with 401, surfaced to caller.
  }
  return headers;
}

export async function listOwnerAIDiagnosticEntries(input: { limit?: number } = {}): Promise<{
  ok: boolean;
  count: number;
  entries: OwnerAIDiagnosticsEntry[];
  error: string | null;
  httpStatus: number;
}> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    return { ok: false, count: 0, entries: [], error: 'No active IVX backend base URL configured.', httpStatus: 0 };
  }
  const limit = Math.max(1, Math.min(200, Math.floor(input.limit ?? 50)));
  const url = `${baseUrl.replace(/\/+$/, '')}/api/ivx/owner-ai/diagnostics?limit=${limit}`;
  try {
    const headers = await resolveAuthHeaders();
    const response = await fetch(url, { method: 'GET', headers });
    const body = await response.json().catch(() => null) as { entries?: OwnerAIDiagnosticsEntry[]; count?: number; error?: string } | null;
    if (!response.ok) {
      return {
        ok: false,
        count: 0,
        entries: [],
        error: body?.error ?? `HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }
    return {
      ok: true,
      count: typeof body?.count === 'number' ? body.count : (body?.entries?.length ?? 0),
      entries: Array.isArray(body?.entries) ? body.entries : [],
      error: null,
      httpStatus: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, count: 0, entries: [], error: message, httpStatus: 0 };
  }
}

export async function recordOwnerAIDiagnosticClientEvent(input: {
  requestId: string;
  conversationId?: string | null;
  stage: OwnerAIDiagnosticsStage;
  detail?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; error: string | null }> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    return { ok: false, error: 'No active IVX backend base URL configured.' };
  }
  if (!input.requestId || typeof input.requestId !== 'string') {
    return { ok: false, error: 'requestId is required for diagnostic client event.' };
  }
  const url = `${baseUrl.replace(/\/+$/, '')}/api/ivx/owner-ai/diagnostics/client-event`;
  try {
    const headers = await resolveAuthHeaders();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requestId: input.requestId,
        conversationId: input.conversationId ?? null,
        stage: input.stage,
        detail: input.detail ?? null,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    // Diagnostic events must never throw into the chat hot path.
    return { ok: false, error: message };
  }
}
