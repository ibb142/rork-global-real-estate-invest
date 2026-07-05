/**
 * IVX Live Work service (owner-only).
 *
 * Thin client over the owner-gated Live Work API so the tablet (IVX → Live Work)
 * can watch the entire workflow live — current task + module + percent, the
 * background-agent queue, live logs, proof output, recent completed tasks — and
 * run the staged "Check Supabase" diagnostic.
 *
 * Auth + base URL reuse the same owner-session pattern as the rest of the IVX
 * developer module (`getDirectApiBaseUrl` + `getIVXAccessToken`).
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type LiveWorkLogLevel = 'info' | 'success' | 'error' | 'running';

export type LiveWorkLogEntry = {
  at: string;
  channel: string;
  level: LiveWorkLogLevel;
  message: string;
};

export type LiveWorkProofItem = {
  label: string;
  value: string;
  ok: boolean;
};

export type LiveWorkCurrentTask = {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  totalBlocks: number;
  completedBlocks: number;
  failedBlocks: number;
  blockedBlocks: number;
  currentModule: string;
  currentModuleStatus: string | null;
  currentModuleDetail: string;
  blocker: string | null;
  updatedAt: string;
} | null;

export type AgentRun = {
  id: string;
  kind: string;
  label: string;
  why: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  expectedCompletionAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  detail: string;
  proof: string | null;
  error: string | null;
};

export type LiveWorkCompletedTask = {
  id: string;
  title: string;
  status: string;
  completedBlocks: number;
  totalBlocks: number;
  completedAt: string | null;
};

export type LiveWorkSnapshot = {
  marker: string;
  generatedAt: string;
  currentTask: LiveWorkCurrentTask;
  activeAgents: AgentRun[];
  recentAgents: AgentRun[];
  liveLogs: LiveWorkLogEntry[];
  proofOutput: LiveWorkProofItem[];
  recentCompletedTasks: LiveWorkCompletedTask[];
  counts: {
    activeTasks: number;
    activeAgents: number;
    completedTasks: number;
    failedTasks: number;
  };
  summary: string;
};

export type SupabaseCheckStageStatus = 'ok' | 'failed' | 'skipped';

export type SupabaseCheckStage = {
  name: string;
  title: string;
  status: SupabaseCheckStageStatus;
  detail: string;
  httpStatus: number | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

export type SupabaseCheckResult = {
  marker: string;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  projectHostMasked: string | null;
  table: string;
  rowCount: number | null;
  stages: SupabaseCheckStage[];
  summary: string;
};

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readError(payload: unknown, fallback: string): string {
  const record = readRecord(payload);
  return typeof record.error === 'string' && record.error.trim() ? record.error.trim() : fallback;
}

async function ownerFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `IVX live-work request failed with HTTP ${response.status}.`));
  }
  return payload;
}

/** Fetch the full live-work snapshot (current task, agents, logs, proof, recent). */
export async function getLiveWorkFeed(logLimit: number = 60): Promise<LiveWorkSnapshot> {
  const safe = Math.max(1, Math.min(200, Math.floor(logLimit)));
  const payload = readRecord(await ownerFetch(`/api/ivx/live-work/feed?logs=${safe}`));
  return payload.snapshot as LiveWorkSnapshot;
}

/** Fetch recent background-agent runs. */
export async function getLiveWorkAgents(limit: number = 50): Promise<AgentRun[]> {
  const safe = Math.max(1, Math.min(200, Math.floor(limit)));
  const payload = readRecord(await ownerFetch(`/api/ivx/live-work/agents?limit=${safe}`));
  return Array.isArray(payload.agents) ? (payload.agents as AgentRun[]) : [];
}

/**
 * Run the staged "Check Supabase" diagnostic and return every stage
 * (connection → authentication → query → response → verification → completion).
 */
export async function runSupabaseCheck(): Promise<SupabaseCheckResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/live-work/check-supabase', { method: 'POST', body: '{}' }));
  return payload.check as SupabaseCheckResult;
}
