/**
 * IVX Autonomous Operations Dashboard client (owner-only).
 *
 * Thin client over the owner-gated unified dashboard API. Aggregates all
 * autonomous agent activity, daily reports, proof ledger, owner actions,
 * and deployment status into a single response.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type AgentStatus =
  | 'ACTIVE'
  | 'IDLE'
  | 'RUNNING'
  | 'TESTING'
  | 'DEPLOYING'
  | 'VERIFYING'
  | 'RETRYING'
  | 'BLOCKED'
  | 'OWNER_ACTION_REQUIRED'
  | 'FAILED'
  | 'COMPLETED';

export type ActivityCategory =
  | 'DEVELOPMENT'
  | 'INVESTORS'
  | 'BUYERS'
  | 'LEADS_CRM'
  | 'PROPERTIES_DEALS'
  | 'MARKETING'
  | 'FINANCIAL'
  | 'AUTONOMOUS_SYSTEM';

export type UnifiedAgent = {
  agentNumber: number;
  agentId: string;
  name: string;
  department: string;
  primaryResponsibility: string;
  status: AgentStatus;
  currentTask: string | null;
  tasksStartedToday: number;
  tasksCompletedToday: number;
  tasksFailedToday: number;
  tasksBlockedToday: number;
  lastActivityTime: string | null;
  totalExecutionTimeMs: number | null;
  successRate: number | null;
  evidenceLink: string | null;
  traceId: string | null;
};

export type ActivityItem = {
  itemNumber: number;
  agent: string;
  department: string;
  category: ActivityCategory;
  task: string;
  actionExecuted: string;
  result: string;
  status: AgentStatus;
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  repository: string | null;
  branch: string | null;
  commitSha: string | null;
  deploymentId: string | null;
  productionUrl: string | null;
  investorId: string | null;
  propertyId: string | null;
  leadId: string | null;
  error: string | null;
  retryCount: number;
  evidence: string;
  traceId: string | null;
};

export type CategorySummary = {
  category: ActivityCategory;
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  items: ActivityItem[];
};

export type DailySummary = {
  reportDate: string;
  totalTasksStarted: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  totalTasksBlocked: number;
  totalRetries: number;
  totalDeployments: number;
  totalCodeCommits: number;
  totalBugsFixed: number;
  totalInvestorsProcessed: number;
  totalBuyersProcessed: number;
  totalLeadsGenerated: number;
  totalPropertiesUpdated: number;
  totalMessagesSent: number;
  totalRevenueOpportunities: number;
  totalOwnerActionsRequired: number;
  agentUtilization: Array<{ agentId: string; name: string; tasksToday: number; utilization: number }>;
  topCompletedWork: string[];
  topFailures: string[];
  businessRisks: string[];
  next24HourPlan: string[];
};

export type LiveFeedEntry = {
  time: string;
  agent: string;
  department: string;
  currentAction: string;
  status: AgentStatus;
  progressPercent: number;
  traceId: string | null;
  taskId: string | null;
};

export type OwnerActionEntry = {
  traceId: string;
  title: string;
  status: string;
  createdAt: string;
  blocker: string | null;
};

export type AutonomousOpsDashboard = {
  marker: string;
  generatedAt: string;
  backendCommitSha: string | null;
  backendBootTime: string | null;
  backendRouteCount: number;
  githubHeadSha: string | null;
  commitMatch: boolean;
  dateRange: { start: string; end: string; label: string };
  agents: UnifiedAgent[];
  activityItems: ActivityItem[];
  categoryBreakdown: CategorySummary[];
  dailySummary: DailySummary | null;
  liveActivityFeed: LiveFeedEntry[];
  ownerActionRequests: OwnerActionEntry[];
  deploymentStatus: {
    renderDeployId: string | null;
    renderDeployStatus: string | null;
    renderCommitSha: string | null;
    productionHealthy: boolean;
  };
  realAgentCount: number;
  placeholderAgentCount: number;
  disclaimer: string;
};

export type DateRange = 'today' | 'yesterday' | '7d' | '30d';

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function ownerFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  const baseUrl = getDirectApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`IVX autonomous-ops request failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

export async function getAutonomousOpsDashboard(opts?: {
  range?: DateRange;
  agent?: string | null;
  category?: string | null;
}): Promise<AutonomousOpsDashboard> {
  const params = new URLSearchParams();
  if (opts?.range) params.set('range', opts.range);
  if (opts?.agent) params.set('agent', opts.agent);
  if (opts?.category) params.set('category', opts.category);
  const qs = params.toString();
  const payload = readRecord(await ownerFetch(`/api/ivx/autonomous-ops/dashboard${qs ? `?${qs}` : ''}`));
  const dashboard = readRecord(payload.dashboard);
  return dashboard as unknown as AutonomousOpsDashboard;
}
