/**
 * IVX enterprise audit job client.
 *
 * Talks to the backend persistent audit engine (`/api/ivx/audit-jobs`). The
 * engine generates 1–5000+ item audits in the background, chunk-by-chunk, and
 * persists each chunk. This client lets the UI:
 *   - start a job and get a jobId immediately,
 *   - poll status (cursor + progress percent),
 *   - lazily load chunks append-only (offset/limit) as the user scrolls,
 *   - resume/pause/cancel,
 *   - export the assembled report.
 */
import { getIVXAccessToken, getIVXOwnerAIEndpoint } from '@/lib/ivx-supabase-client';

export type IVXAuditJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type IVXAuditJobSummary = {
  id: string;
  status: IVXAuditJobStatus;
  prompt: string;
  targetItemCount: number | null;
  cursorLastItem: number;
  chunkCount: number;
  totalChars: number;
  progressPercent: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type IVXAuditChunk = {
  index: number;
  partNumber: number;
  text: string;
  itemStart: number | null;
  itemEnd: number | null;
  createdAt: string;
};

export type IVXAuditChunkPage = {
  job: IVXAuditJobSummary;
  chunks: IVXAuditChunk[];
  total: number;
  nextOffset: number | null;
};

/** Derive the API origin from the configured owner-AI endpoint. */
function resolveAuditApiBase(): string {
  const endpoint = getIVXOwnerAIEndpoint();
  try {
    const url = new URL(endpoint);
    return `${url.origin}/api/ivx/audit-jobs`;
  } catch {
    // On native a relative path has no origin to resolve against, so fall back
    // to the configured API base env before giving up on a relative path.
    const base =
      process.env.EXPO_PUBLIC_IVX_API_BASE_URL ??
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      '';
    const trimmed = base.replace(/\/+$/, '');
    return trimmed ? `${trimmed}/api/ivx/audit-jobs` : '/api/ivx/audit-jobs';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIVXAccessToken();
  if (!token) {
    // Never send `Bearer null` — surface a clear auth error instead of a 401
    // that looks like a server fault.
    throw new Error('IVX owner session is not available. Please sign in again.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, error: `Unexpected response (HTTP ${response.status}).` };
  }
}

function assertOk(payload: Record<string, unknown>, response: Response): void {
  if (!response.ok || payload.ok === false) {
    const message = typeof payload.error === 'string' ? payload.error : `Audit job request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
}

export async function startAuditJob(input: {
  prompt: string;
  conversationId?: string | null;
  targetItemCount?: number | null;
  model?: string | null;
}): Promise<IVXAuditJobSummary> {
  const response = await fetch(resolveAuditApiBase(), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      prompt: input.prompt,
      conversationId: input.conversationId ?? null,
      targetItemCount: input.targetItemCount ?? null,
      model: input.model ?? null,
    }),
  });
  const payload = await parseJson(response);
  assertOk(payload, response);
  return payload.job as IVXAuditJobSummary;
}

export async function getAuditJobStatus(jobId: string): Promise<IVXAuditJobSummary> {
  const response = await fetch(`${resolveAuditApiBase()}/${encodeURIComponent(jobId)}`, {
    headers: await authHeaders(),
  });
  const payload = await parseJson(response);
  assertOk(payload, response);
  return payload.job as IVXAuditJobSummary;
}

export async function listAuditJobs(): Promise<IVXAuditJobSummary[]> {
  const response = await fetch(resolveAuditApiBase(), { headers: await authHeaders() });
  const payload = await parseJson(response);
  assertOk(payload, response);
  return (payload.jobs as IVXAuditJobSummary[]) ?? [];
}

/** Lazy-load a window of chunks. Use the returned `nextOffset` to append-load more. */
export async function loadAuditChunks(
  jobId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<IVXAuditChunkPage> {
  const url = `${resolveAuditApiBase()}/${encodeURIComponent(jobId)}/chunks?offset=${offset}&limit=${limit}`;
  const response = await fetch(url, { headers: await authHeaders() });
  const payload = await parseJson(response);
  assertOk(payload, response);
  return {
    job: payload.job as IVXAuditJobSummary,
    chunks: (payload.chunks as IVXAuditChunk[]) ?? [],
    total: typeof payload.total === 'number' ? payload.total : 0,
    nextOffset: typeof payload.nextOffset === 'number' ? payload.nextOffset : null,
  };
}

export async function exportAuditReport(jobId: string): Promise<{ job: IVXAuditJobSummary; report: string; reportChars: number }> {
  const response = await fetch(`${resolveAuditApiBase()}/${encodeURIComponent(jobId)}/export`, {
    headers: await authHeaders(),
  });
  const payload = await parseJson(response);
  assertOk(payload, response);
  return {
    job: payload.job as IVXAuditJobSummary,
    report: typeof payload.report === 'string' ? payload.report : '',
    reportChars: typeof payload.reportChars === 'number' ? payload.reportChars : 0,
  };
}

async function postJobAction(jobId: string, action: 'resume' | 'pause' | 'cancel'): Promise<IVXAuditJobSummary> {
  const response = await fetch(`${resolveAuditApiBase()}/${encodeURIComponent(jobId)}/${action}`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  const payload = await parseJson(response);
  assertOk(payload, response);
  return payload.job as IVXAuditJobSummary;
}

export function resumeAuditJob(jobId: string): Promise<IVXAuditJobSummary> {
  return postJobAction(jobId, 'resume');
}

export function pauseAuditJob(jobId: string): Promise<IVXAuditJobSummary> {
  return postJobAction(jobId, 'pause');
}

export function cancelAuditJob(jobId: string): Promise<IVXAuditJobSummary> {
  return postJobAction(jobId, 'cancel');
}

export function isAuditJobTerminal(status: IVXAuditJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
