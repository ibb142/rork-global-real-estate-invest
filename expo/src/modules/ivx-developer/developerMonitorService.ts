/**
 * IVX Live Developer Monitor service (owner-only).
 *
 * Thin client over the crash-safe task orchestrator (BLOCK 10) so the in-app
 * Live Developer Monitor can stream real engineering progress:
 *   - start the daily self-improvement loop ("Improve IVX today")
 *   - poll the active task, its blocks, and its append-only event log
 *
 * Auth + base URL reuse the same owner-session pattern as the rest of the IVX
 * developer module (`getDirectApiBaseUrl` + `getIVXAccessToken`).
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type IVXTaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export type IVXBlockStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'DEPLOYED'
  | 'VERIFIED';

export type IVXMonitorTask = {
  id: string;
  status: IVXTaskStatus;
  ownerCommand: string;
  originalTask: string;
  totalBlocks: number;
  currentBlockIndex: number;
  currentBlockId: string | null;
  completedBlocks: number;
  failedBlocks: number;
  blockedBlocks: number;
  deploymentStatus: string | null;
  progressPercent: number;
  lastCrash: { at: string; detail: string; blockId: string | null } | null;
  recoveryCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type IVXBlockVerification = {
  endpoint: string;
  ok: boolean;
  httpStatus: number | null;
  changedRouteOk: boolean;
  verifiedAt: string;
};

export type IVXMonitorBlock = {
  id: string;
  index: number;
  title: string;
  goal: string;
  filesInvolved: string[];
  status: IVXBlockStatus;
  codeChanges: string | null;
  /** Real unified-diff / source text written during this block, for the live coding stream. */
  codeDiff: string | null;
  validationCommand: string | null;
  testResult: string | null;
  commitHash: string | null;
  deploymentStatus: string | null;
  /** Real post-deploy verification evidence (null until verified). */
  verification: IVXBlockVerification | null;
  blocker: string | null;
  nextBlockId: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type IVXMonitorEvent = {
  at: string;
  type: string;
  blockId: string | null;
  detail: string;
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
    throw new Error(readError(payload, `IVX developer monitor request failed with HTTP ${response.status}.`));
  }
  return payload;
}

/** List recent orchestrator tasks (newest first). */
export async function listMonitorTasks(): Promise<IVXMonitorTask[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/tasks'));
  const tasks = Array.isArray(payload.tasks) ? (payload.tasks as IVXMonitorTask[]) : [];
  return tasks;
}

/** Fetch a single task's status + roll-ups. */
export async function getMonitorTask(taskId: string): Promise<IVXMonitorTask | null> {
  const payload = readRecord(await ownerFetch(`/api/ivx/tasks/${encodeURIComponent(taskId)}`));
  return (payload.task as IVXMonitorTask | undefined) ?? null;
}

/** Fetch a task's full ordered block array. */
export async function getMonitorTaskBlocks(taskId: string): Promise<{ task: IVXMonitorTask | null; blocks: IVXMonitorBlock[] }> {
  const payload = readRecord(await ownerFetch(`/api/ivx/tasks/${encodeURIComponent(taskId)}/blocks`));
  return {
    task: (payload.task as IVXMonitorTask | undefined) ?? null,
    blocks: Array.isArray(payload.blocks) ? (payload.blocks as IVXMonitorBlock[]) : [],
  };
}

/** Fetch a task's append-only event log (newest entries appended last). */
export async function getMonitorTaskEvents(taskId: string, limit: number = 60): Promise<IVXMonitorEvent[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const payload = readRecord(await ownerFetch(`/api/ivx/tasks/${encodeURIComponent(taskId)}/events?limit=${safeLimit}`));
  return Array.isArray(payload.events) ? (payload.events as IVXMonitorEvent[]) : [];
}

/** Resume a task from its durable cursor (after a crash/pause). */
export async function resumeMonitorTask(taskId: string): Promise<IVXMonitorTask | null> {
  const payload = readRecord(await ownerFetch(`/api/ivx/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST', body: '{}' }));
  return (payload.task as IVXMonitorTask | undefined) ?? null;
}

/**
 * Start the autonomous daily self-improvement loop ("Improve IVX today").
 * Routes through the owner-AI command so the same intent/handler runs whether the
 * owner types the command in chat or taps the button in the monitor.
 */
export async function startDailyImprovement(): Promise<{ taskId: string | null; answer: string }> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/owner-ai', {
      method: 'POST',
      body: JSON.stringify({ message: 'Improve IVX today', source: 'live_developer_monitor' }),
    }),
  );
  const answer = typeof payload.answer === 'string' ? payload.answer : '';
  const taskId = typeof payload.taskId === 'string' ? payload.taskId : null;
  return { taskId, answer };
}
