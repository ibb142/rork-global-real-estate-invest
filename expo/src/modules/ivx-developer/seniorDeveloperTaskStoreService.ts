/**
 * IVX IA Senior Developer — canonical task store client.
 *
 * Reads the single production task store served by the live backend:
 *   GET /api/ivx/senior-developer/tasks          → counts + evidence-gated tasks
 *   GET /api/ivx/senior-developer/tasks/:taskId  → blocks + events + evidence
 *
 * NEVER loads tasks from hardcoded arrays, bundled JSON, mocks, or device
 * storage — every record comes from the durable orchestrator ledger on the
 * production server, normalized through the five-point verified-evidence gate.
 */
import { getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

export type CanonicalTaskStatus =
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'BLOCKED_OWNER_APPROVAL'
  | 'CANCELLED_OBSOLETE'
  | 'NOT_DEPLOYED'
  | 'DEPLOYED'
  | 'PRODUCTION_VERIFIED'
  | 'FAILED'
  | 'WAITING_APPROVAL';

export type CanonicalTaskEvidence = {
  repository: string | null;
  branch: string | null;
  commit_sha: string | null;
  push_status: string | null;
  deployment_platform: string | null;
  deployment_id: string | null;
  deployment_status: string | null;
  deployment_timestamp: string | null;
  production_url: string | null;
  health_endpoint: string | null;
  health_http_status: number | null;
  running_commit_sha: string | null;
  commit_match: boolean;
  verification_time: string | null;
  qa_result: string | null;
};

export type CanonicalVerifiedGate = {
  passed: boolean;
  real_commit_sha: boolean;
  real_deployment_id: boolean;
  health_200: boolean;
  running_commit_match: boolean;
  qa_evidence: boolean;
};

export type CanonicalTask = {
  id: string;
  number: number;
  title: string;
  description: string;
  department: string;
  feature: string;
  status: CanonicalTaskStatus;
  raw_status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  commit_sha: string | null;
  deployment_id: string | null;
  deployment_status: string | null;
  production_url: string | null;
  qa_status: string | null;
  evidence: CanonicalTaskEvidence | null;
  disposition: Record<string, unknown> | null;
  error: string | null;
  assigned_agent: string;
  source: string;
  priority: string;
  total_blocks: number;
  completed_blocks: number;
  blocked_blocks: number;
  failed_blocks: number;
  verified_gate: CanonicalVerifiedGate;
};

export type CanonicalTaskCounts = {
  TOTAL_TASKS: number;
  IN_PROGRESS: number;
  BLOCKED: number;
  BLOCKED_OWNER_APPROVAL?: number;
  CANCELLED_OBSOLETE?: number;
  NOT_DEPLOYED: number;
  DEPLOYED: number;
  PRODUCTION_VERIFIED: number;
  FAILED: number;
  WAITING_APPROVAL: number;
};

export type CanonicalTaskStoreResponse = {
  ok: boolean;
  marker: string;
  generated_at: string;
  source: string;
  runtime_deployment: {
    platform: string;
    instance_id: string | null;
    service_id: string | null;
    git_commit: string | null;
    external_url: string | null;
  };
  counts: CanonicalTaskCounts;
  total_matching: number;
  tasks: CanonicalTask[];
  fetched_from: string;
};

export type CanonicalTaskBlock = {
  id: string;
  index: number;
  title: string;
  goal: string;
  filesInvolved: string[];
  status: string;
  codeChanges: string | null;
  testResult: string | null;
  commitHash: string | null;
  deploymentStatus: string | null;
  blocker: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type CanonicalTaskEvent = {
  at?: string;
  type?: string;
  blockId?: string | null;
  detail?: string;
  evidence?: Record<string, unknown>;
};

export type CanonicalTaskDetailResponse = {
  ok: boolean;
  task: CanonicalTask;
  blocks: CanonicalTaskBlock[];
  events: CanonicalTaskEvent[];
  fetched_from: string;
};

/** Hard production fallback — the live Render backend that owns the ledger. */
const PRODUCTION_BASE_URL = 'https://ivx-holdings-platform.onrender.com';

function buildBaseUrls(): string[] {
  const urls: string[] = [];
  const push = (raw: string | null | undefined): void => {
    const base = raw?.trim().replace(/\/+$/, '');
    if (!base || urls.includes(base)) return;
    urls.push(base);
  };
  try {
    const audit = getIVXOwnerAIConfigAudit();
    push(audit.activeBaseUrl);
    for (const endpoint of audit.candidateEndpoints) {
      const normalized = endpoint.replace(/\/+$/, '');
      if (normalized.endsWith('/api/ivx/owner-ai')) {
        push(normalized.slice(0, -'/api/ivx/owner-ai'.length));
      } else if (normalized.endsWith('/ivx/owner-ai')) {
        push(normalized.slice(0, -'/ivx/owner-ai'.length));
      }
    }
  } catch (error) {
    console.log('[IVXTaskStore] config audit unavailable:', error instanceof Error ? error.message : error);
  }
  push(PRODUCTION_BASE_URL);
  return urls;
}

async function fetchFirstOk<T extends { ok: boolean }>(suffix: string): Promise<T & { fetched_from: string }> {
  const bases = buildBaseUrls();
  let lastError = 'no backend endpoint available';
  for (const base of bases) {
    const url = `${base}${suffix}`;
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await response.text();
      const payload = JSON.parse(text) as T;
      if (response.ok && payload.ok) {
        return { ...payload, fetched_from: url };
      }
      lastError = `HTTP ${response.status} from ${url}`;
    } catch (error) {
      lastError = `${url}: ${error instanceof Error ? error.message : 'network error'}`;
    }
  }
  throw new Error(lastError);
}

export type CanonicalTaskQuery = {
  status?: string;
  feature?: string;
  search?: string;
  sinceHours?: number;
};

export async function fetchCanonicalTaskStore(query: CanonicalTaskQuery): Promise<CanonicalTaskStoreResponse> {
  const params = new URLSearchParams();
  if (query.status && query.status !== 'ALL') params.set('status', query.status);
  if (query.feature && query.feature !== 'All') params.set('feature', query.feature);
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (typeof query.sinceHours === 'number' && query.sinceHours > 0) params.set('sinceHours', String(query.sinceHours));
  const qs = params.toString();
  return fetchFirstOk<CanonicalTaskStoreResponse>(`/api/ivx/senior-developer/tasks${qs ? `?${qs}` : ''}`);
}

export async function fetchCanonicalTaskDetail(taskId: string): Promise<CanonicalTaskDetailResponse> {
  const safe = encodeURIComponent(taskId);
  return fetchFirstOk<CanonicalTaskDetailResponse>(`/api/ivx/senior-developer/tasks/${safe}`);
}
