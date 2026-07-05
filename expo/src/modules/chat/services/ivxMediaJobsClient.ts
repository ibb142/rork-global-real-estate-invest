/**
 * IVX Media Jobs Client — owner-only frontend client for the backend media-job lifecycle.
 *
 * Lifecycle:
 *   queued → running → analyzing_media → generating_answer → completed/failed
 *
 * Streaming pattern: createMediaJob() returns immediately; the caller polls
 * `pollMediaJobUntilTerminal()` and receives status events for chat UI updates.
 */

import { getApiBaseUrl } from '@/lib/api-base';

export type IVXMediaJobState =
  | 'queued'
  | 'running'
  | 'analyzing_media'
  | 'generating_answer'
  | 'completed'
  | 'failed';

export type IVXMediaJobLog = {
  ts: string;
  state: IVXMediaJobState;
  message: string;
};

export type IVXMediaJobErrorState = {
  message: string;
  code: string;
  attempts: number;
};

export type IVXMediaJobSnapshot = {
  id: string;
  ownerId: string | null;
  mediaCount: number;
  mediaTypes: Record<string, number>;
  state: IVXMediaJobState;
  progress: number;
  logs: IVXMediaJobLog[];
  finalResult: string | null;
  errorState: IVXMediaJobErrorState | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type IVXMediaJobCreateInput = {
  mediaCount: number;
  mediaTypes: Record<string, number>;
  prompt: string;
  ownerId?: string | null;
  bearerToken?: string | null;
};

export type IVXMediaJobAdvanceInput = {
  jobId: string;
  state: IVXMediaJobState;
  message: string;
  bearerToken?: string | null;
};

export type IVXMediaJobCompleteInput = {
  jobId: string;
  finalResult: string;
  bearerToken?: string | null;
};

export type IVXMediaJobFailInput = {
  jobId: string;
  errorMessage: string;
  code: string;
  bearerToken?: string | null;
};

const TERMINAL_STATES: ReadonlySet<IVXMediaJobState> = new Set(['completed', 'failed']);

function buildHeaders(bearerToken: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearerToken && bearerToken.trim().length > 0) {
    headers.Authorization = `Bearer ${bearerToken.trim()}`;
  }
  return headers;
}

function buildUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  return `${base}${path}`;
}

export async function createMediaJob(input: IVXMediaJobCreateInput): Promise<IVXMediaJobSnapshot> {
  const response = await fetch(buildUrl('/api/ivx/media-jobs'), {
    method: 'POST',
    headers: buildHeaders(input.bearerToken),
    body: JSON.stringify({
      mediaCount: input.mediaCount,
      mediaTypes: input.mediaTypes,
      prompt: input.prompt,
      ownerId: input.ownerId ?? null,
    }),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { payload = {}; }
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Media job create failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  const job = (payload.job ?? null) as IVXMediaJobSnapshot | null;
  if (!job || typeof job.id !== 'string') {
    throw new Error('Media job create response missing job id.');
  }
  return job;
}

export async function getMediaJob(jobId: string, bearerToken?: string | null): Promise<IVXMediaJobSnapshot> {
  const response = await fetch(buildUrl(`/api/ivx/media-jobs/${encodeURIComponent(jobId)}`), {
    method: 'GET',
    headers: buildHeaders(bearerToken),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Media job fetch failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return payload.job as IVXMediaJobSnapshot;
}

export async function advanceMediaJob(input: IVXMediaJobAdvanceInput): Promise<IVXMediaJobSnapshot> {
  const response = await fetch(buildUrl(`/api/ivx/media-jobs/${encodeURIComponent(input.jobId)}/advance`), {
    method: 'POST',
    headers: buildHeaders(input.bearerToken),
    body: JSON.stringify({ state: input.state, message: input.message }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Media job advance failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return payload.job as IVXMediaJobSnapshot;
}

export async function completeMediaJob(input: IVXMediaJobCompleteInput): Promise<IVXMediaJobSnapshot> {
  const response = await fetch(buildUrl(`/api/ivx/media-jobs/${encodeURIComponent(input.jobId)}/complete`), {
    method: 'POST',
    headers: buildHeaders(input.bearerToken),
    body: JSON.stringify({ finalResult: input.finalResult }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Media job complete failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return payload.job as IVXMediaJobSnapshot;
}

export async function failMediaJob(input: IVXMediaJobFailInput): Promise<IVXMediaJobSnapshot> {
  const response = await fetch(buildUrl(`/api/ivx/media-jobs/${encodeURIComponent(input.jobId)}/fail`), {
    method: 'POST',
    headers: buildHeaders(input.bearerToken),
    body: JSON.stringify({ errorMessage: input.errorMessage, code: input.code }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Media job fail failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return payload.job as IVXMediaJobSnapshot;
}

export type IVXMediaJobPollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (job: IVXMediaJobSnapshot) => void;
  bearerToken?: string | null;
};

/**
 * Poll the media job until it reaches a terminal state (completed/failed) or times out.
 * Calls `onUpdate` on every state change.
 */
export async function pollMediaJobUntilTerminal(
  jobId: string,
  options: IVXMediaJobPollOptions = {},
): Promise<IVXMediaJobSnapshot> {
  const intervalMs = Math.max(250, options.intervalMs ?? 1200);
  const timeoutMs = Math.max(intervalMs, options.timeoutMs ?? 90_000);
  const startedAt = Date.now();
  let lastState: IVXMediaJobState | null = null;
  while (true) {
    const job = await getMediaJob(jobId, options.bearerToken);
    if (job.state !== lastState) {
      lastState = job.state;
      try { options.onUpdate?.(job); } catch { /* ignore subscriber errors */ }
    }
    if (TERMINAL_STATES.has(job.state)) {
      return job;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Media job ${jobId} did not reach a terminal state within ${timeoutMs}ms (last state: ${job.state}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export function describeMediaJobStateForChat(state: IVXMediaJobState): string {
  switch (state) {
    case 'queued': return 'Reading files…';
    case 'running': return 'Reading files…';
    case 'analyzing_media': return 'Analyzing images / processing video…';
    case 'generating_answer': return 'Generating answer…';
    case 'completed': return 'Completed.';
    case 'failed': return 'Media analysis failed.';
    default: return 'Working…';
  }
}
