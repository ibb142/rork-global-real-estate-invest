import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type IVXAgentJobStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'canceled';
export type IVXAgentJobLogLevel = 'info' | 'warn' | 'error';

export type IVXAgentJobLog = {
  id: string;
  job_id: string;
  level: IVXAgentJobLogLevel;
  step: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type IVXAgentJob = {
  id: string;
  type: string;
  status: IVXAgentJobStatus;
  prompt: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  approval_required: boolean;
  approved_at: string | null;
  approved_by: string | null;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  next_run_at: string;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  logs: IVXAgentJobLog[];
};

export type IVXAgentWorkerStatus = {
  serverSide: boolean;
  loopStarted: boolean;
  workerId: string;
  intervalMs: number;
  inFlight: boolean;
  lastTickAt: string | null;
  lastTickResult: Record<string, unknown> | null;
  lastTickError: string | null;
  independentOfPhone: boolean;
  independentOfRorkChat: boolean;
  independentOfAppOpen: boolean;
};

export type IVXAgentJobsStatusResponse = {
  ok: boolean;
  marker: string;
  worker: IVXAgentWorkerStatus;
  tables: string[];
  counts: Record<IVXAgentJobStatus, number>;
  timestamp: string;
};

export type IVXAgentJobsListResponse = {
  ok: boolean;
  marker: string;
  jobs: IVXAgentJob[];
  timestamp: string;
};

export type CreateIVXAgentJobInput = {
  type: string;
  prompt: string;
  payload?: Record<string, unknown>;
  approvalRequired?: boolean;
  maxAttempts?: number;
};

const AGENT_JOBS_PATH = '/api/ivx/agent-jobs';

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
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readError(payload: unknown, fallback: string): string {
  const record = readRecord(payload);
  return typeof record.error === 'string' && record.error.trim()
    ? record.error.trim()
    : typeof record.detail === 'string' && record.detail.trim()
      ? record.detail.trim()
      : fallback;
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
    throw new Error(readError(payload, `IVX agent jobs request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getIVXAgentJobsStatus(): Promise<IVXAgentJobsStatusResponse> {
  return await ownerFetch(`${AGENT_JOBS_PATH}/status`) as IVXAgentJobsStatusResponse;
}

export async function listIVXAgentJobs(status?: IVXAgentJobStatus | 'all'): Promise<IVXAgentJobsListResponse> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  return await ownerFetch(`${AGENT_JOBS_PATH}${query}`) as IVXAgentJobsListResponse;
}

export async function createIVXAgentJob(input: CreateIVXAgentJobInput): Promise<IVXAgentJobsListResponse & { job: IVXAgentJob }> {
  return await ownerFetch(AGENT_JOBS_PATH, {
    method: 'POST',
    body: JSON.stringify(input),
  }) as IVXAgentJobsListResponse & { job: IVXAgentJob };
}

export async function runIVXAgentJobAction(jobId: string, action: 'retry' | 'cancel' | 'approve'): Promise<IVXAgentJobsListResponse & { job: IVXAgentJob | null }> {
  return await ownerFetch(`${AGENT_JOBS_PATH}/${encodeURIComponent(jobId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  }) as IVXAgentJobsListResponse & { job: IVXAgentJob | null };
}

export async function runIVXAgentWorkerOnce(): Promise<{ ok: boolean; marker: string; result: Record<string, unknown>; workerId: string; timestamp: string }> {
  return await ownerFetch('/api/ivx/agent-worker/run-once', {
    method: 'POST',
    body: JSON.stringify({ reason: 'owner_admin_manual_worker_tick' }),
  }) as { ok: boolean; marker: string; result: Record<string, unknown>; workerId: string; timestamp: string };
}
