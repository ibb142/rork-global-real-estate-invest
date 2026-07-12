/**
 * IVX Executive Dashboard service (owner-only) — Phase 1 cockpit.
 *
 * One aggregation over the live backend that powers the new Executive tab:
 *   - Agent roster + autonomy levels  (/api/ivx/agents/status)
 *   - Agent activity, tasks, approvals (/api/ivx/cto-dashboard/overview)
 *   - Executive scorecards + spend     (/api/ivx/executive-layer)
 *
 * Every value is sourced from a real endpoint — nothing is fabricated. Auth and
 * base-URL discovery reuse the same owner-session pattern as the rest of the
 * IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';
import {
  getIVXCTODashboardOverview,
  performIVXCTOControlAction,
  type IVXCTOControlAction,
  type IVXCTODashboardOverview,
  type IVXCTOTaskRecord,
} from '@/src/modules/ivx-owner-ai/services/ivxCTODashboardService';
import { getExecutiveLayer, type ExecutiveLayer } from './executiveLayerService';

export type ApprovalLevel = 1 | 2 | 3 | 4 | 5;

export type ExecutiveAgentRosterEntry = {
  id: string;
  name: string;
  role: string;
  memoryNamespace: string;
  riskLimit: 'low' | 'medium' | 'high';
  allowedTools: string[];
  approvalLevel: ApprovalLevel;
};

export type ExecutiveAgentRoster = {
  agents: ExecutiveAgentRosterEntry[];
  approvalLevels: Record<string, string>;
  marker: string | null;
};

export type ExecutiveDashboardData = {
  generatedAt: string;
  roster: ExecutiveAgentRoster | null;
  overview: IVXCTODashboardOverview | null;
  executive: ExecutiveLayer | null;
  /** Tasks that need an owner decision right now. */
  approvalsInbox: IVXCTOTaskRecord[];
  errors: string[];
};

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown, fallback: string = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function readApprovalLevel(value: unknown): ApprovalLevel {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return 2;
}

function readRiskLimit(value: unknown): 'low' | 'medium' | 'high' {
  const s = readString(value);
  return s === 'high' || s === 'medium' ? s : 'low';
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
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    payload = { error: text.slice(0, 240) };
  }
  if (!response.ok) {
    const record = readRecord(payload);
    throw new Error(readString(record.error, `IVX executive request failed with HTTP ${response.status}.`));
  }
  return payload;
}

/** Live agent roster with autonomy levels. */
export async function getExecutiveAgentRoster(): Promise<ExecutiveAgentRoster> {
  const payload = readRecord(await ownerFetch('/api/ivx/agents/status', { method: 'GET' }));
  const rawAgents = Array.isArray(payload.agents) ? payload.agents : [];
  const agents: ExecutiveAgentRosterEntry[] = rawAgents.map((entry) => {
    const record = readRecord(entry);
    return {
      id: readString(record.id),
      name: readString(record.name, 'Agent'),
      role: readString(record.role),
      memoryNamespace: readString(record.memoryNamespace),
      riskLimit: readRiskLimit(record.riskLimit),
      allowedTools: Array.isArray(record.allowedTools) ? record.allowedTools.map((t) => readString(t)).filter(Boolean) : [],
      approvalLevel: readApprovalLevel(record.approvalLevel),
    };
  });
  const approvalLevels: Record<string, string> = {};
  const rawLevels = readRecord(payload.approvalLevels);
  for (const key of Object.keys(rawLevels)) {
    approvalLevels[key] = readString(rawLevels[key]);
  }
  return { agents, approvalLevels, marker: readString(payload.marker) || null };
}

/** A task needs an owner decision when approval is required and it is not yet approved. */
export function isAwaitingApproval(task: IVXCTOTaskRecord): boolean {
  if (!task.approvalRequired || task.approvedBy) return false;
  return task.status === 'blocked' || task.status === 'pending' || task.status === 'paused';
}

/** Fetch the whole cockpit in parallel; partial failures are reported, not thrown. */
export async function getExecutiveDashboard(): Promise<ExecutiveDashboardData> {
  const [rosterResult, overviewResult, executiveResult] = await Promise.allSettled([
    getExecutiveAgentRoster(),
    getIVXCTODashboardOverview({ limit: 60 }),
    getExecutiveLayer(),
  ]);

  const errors: string[] = [];
  const roster = rosterResult.status === 'fulfilled' ? rosterResult.value : null;
  if (rosterResult.status === 'rejected') {
    errors.push(rosterResult.reason instanceof Error ? rosterResult.reason.message : 'Agent roster unavailable.');
  }
  const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
  if (overviewResult.status === 'rejected') {
    errors.push(overviewResult.reason instanceof Error ? overviewResult.reason.message : 'Agent activity unavailable.');
  }
  const executive = executiveResult.status === 'fulfilled' ? executiveResult.value : null;
  if (executiveResult.status === 'rejected') {
    errors.push(executiveResult.reason instanceof Error ? executiveResult.reason.message : 'Executive scorecards unavailable.');
  }

  const approvalsInbox = (overview?.tasks ?? []).filter(isAwaitingApproval);

  return {
    generatedAt: new Date().toISOString(),
    roster,
    overview,
    executive,
    approvalsInbox,
    errors,
  };
}

/** Owner approve / reject / control of a queued task. */
export async function controlExecutiveTask(input: {
  action: IVXCTOControlAction;
  taskId: string;
  approverEmail?: string;
  reason?: string;
}): Promise<IVXCTOTaskRecord> {
  const result = await performIVXCTOControlAction(input);
  return result.task;
}
