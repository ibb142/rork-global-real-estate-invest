/**
 * IVX Block 28 — CTO Operational Dashboard service (owner-only).
 *
 * Aggregates calls to /api/ivx/cto-dashboard/* through the same owner-AI
 * URL discovery used by the rest of the IVX modules.
 */
import { getIVXAccessToken, getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

export type IVXAgentRiskLevel = 'low' | 'medium' | 'high';
export type IVXAgentExecutionStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type IVXAgentId =
  | 'cto_orchestrator'
  | 'backend_developer'
  | 'frontend_developer'
  | 'infrastructure_sre'
  | 'supabase_database'
  | 'investor_relations'
  | 'analytics'
  | 'operations';

export type IVXCTOTaskRecord = {
  id: string;
  goal: string;
  assignedAgent: IVXAgentId;
  status: IVXAgentExecutionStatus;
  risk: IVXAgentRiskLevel;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  blockedReason: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  handoffs: { id: string; fromAgent: IVXAgentId; toAgent: IVXAgentId; reason: string; at: string }[];
  steps: { agentId: IVXAgentId; action: string; status: string; detail: string; at: string }[];
  createdAt: string;
  updatedAt: string;
};

export type IVXCTOActiveAgent = {
  id: IVXAgentId;
  name: string;
  role: string;
  memoryNamespace: string;
  riskLimit: IVXAgentRiskLevel;
  allowedTools: readonly string[];
  activeTaskCount: number;
};

export type IVXCTOParentSummary = {
  id: string;
  goal: string;
  status: 'pending' | 'running' | 'partial' | 'completed' | 'failed';
  children: number;
  createdAt: string;
  completedAt: string | null;
  aggregation: null | {
    summary: string;
    successCount: number;
    failCount: number;
    blockedCount: number;
    skippedCount: number;
    agentsUsed: IVXAgentId[];
    at: string;
  };
};

export type IVXCTOAuditEntry = {
  id: string;
  agentId: IVXAgentId;
  taskId: string | null;
  action: string;
  detail: string;
  metadata: Record<string, unknown>;
  at: string;
};

export type IVXCTOHandoffRecord = {
  id: string;
  fromAgent: IVXAgentId;
  toAgent: IVXAgentId;
  taskId: string;
  reason: string;
  at: string;
};

export type IVXCTODeployProposal = {
  taskId: string;
  agentId: IVXAgentId;
  risk: IVXAgentRiskLevel;
  goal: string;
  blockedReason: string | null;
  approvedBy: string | null;
};

export type IVXCTODashboardOverview = {
  ok: boolean;
  marker: string;
  ownerOnly: boolean;
  generatedAt: string;
  summary: {
    totalTasks: number;
    statusCounts: Record<IVXAgentExecutionStatus, number>;
    riskCounts: Record<IVXAgentRiskLevel, number>;
    activeAgentsCount: number;
    handoffsCount: number;
    auditEntries: number;
    retryEventsCount: number;
    blockedTasksCount: number;
    parentTaskCount: number;
    deployProposalsCount: number;
  };
  activeAgents: IVXCTOActiveAgent[];
  tasks: IVXCTOTaskRecord[];
  blockedTasks: IVXCTOTaskRecord[];
  parents: IVXCTOParentSummary[];
  handoffs: IVXCTOHandoffRecord[];
  audit: IVXCTOAuditEntry[];
  deployProposals: IVXCTODeployProposal[];
  retryEvents: IVXCTOAuditEntry[];
};

export type IVXCTODashboardFilters = {
  agentId?: IVXAgentId;
  status?: IVXAgentExecutionStatus;
  risk?: IVXAgentRiskLevel;
  since?: string;
  until?: string;
  limit?: number;
};

export type IVXCTOControlAction = 'retry' | 'cancel' | 'pause' | 'resume' | 'approve' | 'inspect';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildDashboardUrls(suffix: string): string[] {
  const audit = getIVXOwnerAIConfigAudit();
  const urls: string[] = [];
  const push = (raw: string | null | undefined) => {
    const trimmed = raw?.trim();
    if (!trimmed || urls.includes(trimmed)) return;
    urls.push(trimmed);
  };
  if (audit.activeBaseUrl) {
    push(`${audit.activeBaseUrl.replace(/\/+$/, '')}${suffix}`);
  }
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

async function ownerFetch<T>(suffix: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token is not connected.');
  }
  const urls = buildDashboardUrls(suffix);
  if (urls.length === 0) {
    throw new Error('Owner AI backend URL is not configured.');
  }
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) as unknown : null; } catch { payload = { error: text.slice(0, 240) }; }
      if (!response.ok) {
        const msg = isRecord(payload) ? (typeof payload.error === 'string' ? payload.error : '') : '';
        throw new Error(msg || `CTO dashboard request failed (${response.status}).`);
      }
      return payload as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log('[IVXCTODashboardService] endpoint failed', { url, message: lastError.message });
    }
  }
  throw lastError ?? new Error('CTO dashboard is not reachable.');
}

export async function getIVXCTODashboardOverview(filters: IVXCTODashboardFilters = {}): Promise<IVXCTODashboardOverview> {
  const params = new URLSearchParams();
  if (filters.agentId) params.set('agentId', filters.agentId);
  if (filters.status) params.set('status', filters.status);
  if (filters.risk) params.set('risk', filters.risk);
  if (filters.since) params.set('since', filters.since);
  if (filters.until) params.set('until', filters.until);
  if (filters.limit) params.set('limit', String(filters.limit));
  const suffix = params.toString().length > 0
    ? `/api/ivx/cto-dashboard/overview?${params.toString()}`
    : '/api/ivx/cto-dashboard/overview';
  return ownerFetch<IVXCTODashboardOverview>(suffix, { method: 'GET' });
}

export async function searchIVXCTOAuditLog(opts: { agentId?: IVXAgentId; q?: string; limit?: number } = {}): Promise<{ ok: boolean; audit: IVXCTOAuditEntry[]; total: number; marker: string }> {
  const params = new URLSearchParams();
  if (opts.agentId) params.set('agentId', opts.agentId);
  if (opts.q) params.set('q', opts.q);
  if (opts.limit) params.set('limit', String(opts.limit));
  const suffix = params.toString().length > 0
    ? `/api/ivx/cto-dashboard/audit?${params.toString()}`
    : '/api/ivx/cto-dashboard/audit';
  return ownerFetch(suffix, { method: 'GET' });
}

export async function getIVXCTOParentTree(parentId: string): Promise<{ ok: boolean; tree: unknown; parent: unknown; marker: string }> {
  return ownerFetch(`/api/ivx/cto-dashboard/parent/${encodeURIComponent(parentId)}/tree`, { method: 'GET' });
}

export async function performIVXCTOControlAction(input: {
  action: IVXCTOControlAction;
  taskId: string;
  approverEmail?: string;
  reason?: string;
}): Promise<{ ok: boolean; action: IVXCTOControlAction; task: IVXCTOTaskRecord; marker: string }> {
  return ownerFetch('/api/ivx/cto-dashboard/control', {
    method: 'POST',
    body: JSON.stringify({
      action: input.action,
      taskId: input.taskId,
      approverEmail: input.approverEmail,
      reason: input.reason,
    }),
  });
}
