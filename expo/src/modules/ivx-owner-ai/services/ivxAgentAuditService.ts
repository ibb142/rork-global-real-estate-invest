/**
 * IVX AI Engineering Command Center service (owner-only).
 *
 * Client for the /api/ivx/agent-audit/* endpoints. Provides the full
 * 12-agent audit, seniority scores, task ledger, and ownership rules.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type CapabilityScore = 'PASS' | 'PARTIAL' | 'FAIL' | 'NOT_CONFIGURED';
export type SeniorityLevel = 'SENIOR' | 'MID' | 'JUNIOR' | 'NOT_A_DEVELOPER';

export type CapabilityAssessment = {
  capability: string;
  score: CapabilityScore;
  evidence: string;
};

export type AgentAuditResult = {
  agentNumber: number;
  executiveAgentId: string;
  currentName: string;
  currentRole: string;
  currentEngine: string;
  frameworkAgentId: string;
  allowedTools: string[];
  riskLevel: string;
  canExecuteCode: boolean;
  capabilities: CapabilityAssessment[];
  scorePercentage: number;
  seniority: SeniorityLevel;
  assignedRole: string;
  assignedRoleTitle: string;
  mainGap: string;
  filesOwned: string[];
  currentBlocker: string;
};

export type TaskLedgerEntry = {
  taskId: string;
  title: string;
  module: string;
  assignedAI: number;
  reviewingAI: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  startTime: string | null;
  lastActivityTime: string | null;
  filesChanged: string[];
  databaseMigrations: string[];
  apiRoutesChanged: string[];
  testCommand: string | null;
  testResult: string | null;
  commitSha: string | null;
  pullRequest: string | null;
  deploymentId: string | null;
  productionUrl: string | null;
  verificationEvidence: string | null;
  blocker: string | null;
  remainingWork: string | null;
};

export type AuditSummary = {
  totalAgents: number;
  seniorCount: number;
  midCount: number;
  juniorCount: number;
  notDeveloperCount: number;
  withRepoExecution: number;
  withDeploymentCapability: number;
  withProductionEvidence: number;
  criticalGaps: string[];
  recommendedChanges: string[];
};

export type AgentAuditOverview = {
  ok: boolean;
  marker: string;
  generatedAt: string;
  summary: AuditSummary;
  agents: AgentAuditResult[];
  taskLedger: TaskLedgerEntry[];
  ownershipRules: string[];
};

async function ownerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getIVXAccessToken();
  const baseUrl = getDirectApiBaseUrl();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`IVX agent audit request failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function getAgentAuditOverview(): Promise<AgentAuditOverview> {
  return ownerFetch<AgentAuditOverview>('/api/ivx/agent-audit/overview');
}

export async function getTaskLedger(): Promise<{ ok: boolean; ledger: TaskLedgerEntry[]; count: number }> {
  return ownerFetch('/api/ivx/agent-audit/ledger');
}

export async function createTaskLedgerEntry(input: {
  title: string;
  module: string;
  assignedAI: number;
  reviewingAI: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}): Promise<{ ok: boolean; entry: TaskLedgerEntry }> {
  return ownerFetch('/api/ivx/agent-audit/ledger', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTaskLedgerEntry(taskId: string, updates: Partial<TaskLedgerEntry>): Promise<{ ok: boolean; entry: TaskLedgerEntry }> {
  const params = new URLSearchParams({ taskId });
  return ownerFetch(`/api/ivx/agent-audit/ledger/update?${params.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}
