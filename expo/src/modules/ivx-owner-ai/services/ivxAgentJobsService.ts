/**
 * IVX Block 32 — Live Agent Activity service (owner-only).
 *
 * Wraps the owner-only `/api/ivx/agent-jobs/live-activity` endpoint with the
 * same URL discovery used by the rest of the IVX owner AI modules.
 */
import { getIVXAccessToken, getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

export type IVXAgentJobStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'canceled';

export type IVXAgentJobLogEntry = {
  step: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  chatMessage: string | null;
  at: string;
};

export type IVXLiveAgentJob = {
  id: string;
  type: string;
  status: IVXAgentJobStatus;
  progress: number;
  agentName: string | null;
  currentStep: string | null;
  etaSeconds: number | null;
  chatMessage: string | null;
  attempts: number;
  maxAttempts: number;
  startedAt: string | null;
  updatedAt: string | null;
  promptPreview: string;
  logs: IVXAgentJobLogEntry[];
};

export type IVXRecentAgentJob = {
  id: string;
  type: string;
  status: IVXAgentJobStatus;
  progress: number;
  agentName: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  error: string | null;
  chatMessage: string | null;
};

export type IVXLiveActivityResponse = {
  ok: boolean;
  marker: string;
  ownerOnly: boolean;
  worker: {
    loopStarted: boolean;
    intervalMs: number;
    inFlight: boolean;
    lastTickAt: string | null;
  };
  activeCount: number;
  activeJobs: IVXLiveAgentJob[];
  recentCompleted: IVXRecentAgentJob[];
  timestamp: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildUrls(suffix: string): string[] {
  const audit = getIVXOwnerAIConfigAudit();
  const urls: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t || urls.includes(t)) return;
    urls.push(t);
  };
  if (audit.activeBaseUrl) push(`${audit.activeBaseUrl.replace(/\/+$/, '')}${suffix}`);
  for (const endpoint of audit.candidateEndpoints) {
    const normalized = endpoint.replace(/\/+$/, '');
    if (normalized.endsWith('/api/ivx/owner-ai')) {
      push(`${normalized.slice(0, -'/api/ivx/owner-ai'.length)}${suffix}`);
    } else if (normalized.endsWith('/ivx/owner-ai')) {
      push(`${normalized.slice(0, -'/ivx/owner-ai'.length)}${suffix}`);
    }
  }
  return urls;
}

export async function getIVXAgentLiveActivity(limit: number = 40): Promise<IVXLiveActivityResponse> {
  const accessToken = await getIVXAccessToken();
  const tokenPresent = !!accessToken;
  console.log('[IVXAgentJobsService] Owner token check', { tokenPresent });
  if (!accessToken) {
    throw new Error('Owner session token is not connected.');
  }
  const suffix = `/api/ivx/agent-jobs/live-activity?limit=${encodeURIComponent(String(Math.max(1, Math.min(100, Math.floor(limit)))))}`;
  const urls = buildUrls(suffix);
  if (urls.length === 0) {
    throw new Error('Owner AI backend URL is not configured.');
  }
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      console.log('[IVXAgentJobsService] Sending request', { bearerHeaderPresent: true, url: suffix });
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) as unknown : null; } catch { payload = { error: text.slice(0, 200) }; }
      if (!response.ok) {
        const msg = isRecord(payload) ? (typeof payload.error === 'string' ? payload.error : '') : '';
        throw new Error(msg || `Live activity request failed (${response.status}).`);
      }
      return payload as IVXLiveActivityResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log('[IVXAgentJobsService] endpoint failed', { url, message: lastError.message });
    }
  }
  throw lastError ?? new Error('Live activity endpoint is not reachable.');
}
