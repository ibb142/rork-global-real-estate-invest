/**
 * IVX Block 28/30 — CTO Operational Dashboard (owner-only).
 *
 * Aggregates orchestration data across blocks 25–29:
 *   - parent + child parallel tasks
 *   - active agents, audit, handoffs, memory
 *   - retry / blocked / risk telemetry
 *   - autonomous engineering cycles and deploy proposals
 *   - safe owner controls: retry, cancel, pause, resume, approve (low-risk)
 *
 * All controls are owner-only. High-risk approval is rejected here.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  AGENTS,
  approveTask,
  cancelTask,
  getTask,
  listActiveAgents,
  listAudit,
  listHandoffs,
  listTasks,
  pauseTask,
  retryTask,
  resumeTask,
  type AgentExecutionStatus,
  type AgentId,
  type AgentRiskLevel,
  type AgentTaskRecord,
} from '../services/agents/multi-agent-framework';
import {
  getParentTask,
  getParentTaskTree,
  listParentTasks,
} from '../services/agents/parallel-execution';
import {
  approveLowRiskDeployProposal,
  getCycle,
  listCycles,
  rejectCycleProposal,
  rerunCycleValidation,
  runAutonomousDashboardValidation,
  type ConfidenceBand,
  type CycleRecord,
  type CycleStatus,
  type IssueKind,
} from '../services/agents/autonomous-cycle';

export const CTO_DASHBOARD_MARKER = 'ivx-cto-dashboard-2026-05-17t-block30';

const VALID_AGENT_IDS = new Set(Object.keys(AGENTS));
const VALID_STATUSES: ReadonlySet<AgentExecutionStatus> = new Set([
  'pending', 'running', 'blocked', 'completed', 'failed', 'paused', 'cancelled',
]);
const VALID_RISKS: ReadonlySet<AgentRiskLevel> = new Set(['low', 'medium', 'high']);
const VALID_ISSUE_KINDS: ReadonlySet<IssueKind> = new Set([
  'ui_bug', 'lint_type_issue', 'stale_dependency', 'broken_endpoint', 'deploy_warning', 'performance_anomaly',
]);
const VALID_CONFIDENCE: ReadonlySet<ConfidenceBand> = new Set(['low', 'medium', 'high']);
const VALID_CYCLE_STATUSES: ReadonlySet<CycleStatus> = new Set([
  'detected', 'classified', 'routed', 'patched', 'validated', 'rollback_simulated', 'deploy_proposed', 'completed', 'failed', 'blocked',
]);

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readAgentId(value: unknown): AgentId | undefined {
  const s = readTrimmed(value);
  return VALID_AGENT_IDS.has(s) ? (s as AgentId) : undefined;
}

function getStatus(error: unknown): number {
  const m = error instanceof Error ? error.message.toLowerCase() : '';
  if (m.includes('missing bearer token') || m.includes('invalid or expired')) return 401;
  if (m.includes('privileged ivx access is required')) return 403;
  if (m.includes('high-risk') || m.includes('medium/high-risk')) return 403;
  if (m.includes('required') || m.includes('not found')) return 400;
  return 500;
}

function errorResponse(error: unknown): Response {
  const msg = error instanceof Error ? error.message : 'IVX CTO dashboard route failed.';
  return ownerOnlyJson({
    ok: false,
    error: msg.slice(0, 320),
    marker: CTO_DASHBOARD_MARKER,
    timestamp: new Date().toISOString(),
  }, getStatus(error));
}

export function OPTIONS(): Response { return ownerOnlyOptions(); }

function mapCycleForDashboard(cycle: CycleRecord): Record<string, unknown> {
  return {
    id: cycle.id,
    issueType: cycle.classification.kind,
    assignedAgent: cycle.task?.assignedAgent ?? cycle.classification.preferredAgent,
    confidence: cycle.classification.confidence,
    risk: cycle.deploy?.riskLevel ?? cycle.task?.risk ?? 'low',
    status: cycle.status,
    detectedSignal: cycle.signal.description,
    patchProposal: cycle.patch,
    validationResult: cycle.validation,
    rollbackSimulation: cycle.rollback,
    deployProposal: cycle.deploy,
    approvalStatus: cycle.approval.status,
    approval: cycle.approval,
    auditStatus: cycle.steps.length > 0 ? 'recorded' : 'missing',
    memoryWriteStatus: cycle.patch ? 'recorded' : cycle.status === 'blocked' ? 'not_applicable' : 'pending',
    taskId: cycle.task?.id ?? null,
    error: cycle.error,
    steps: cycle.steps,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  };
}

function applyCycleFilters(cycleList: CycleRecord[], url: URL): CycleRecord[] {
  const issueType = readTrimmed(url.searchParams.get('issueType'));
  const agentId = readAgentId(url.searchParams.get('cycleAgentId')) ?? readAgentId(url.searchParams.get('agentId'));
  const confidence = readTrimmed(url.searchParams.get('confidence'));
  const status = readTrimmed(url.searchParams.get('cycleStatus')) || readTrimmed(url.searchParams.get('status'));
  const risk = readTrimmed(url.searchParams.get('cycleRisk')) || readTrimmed(url.searchParams.get('risk'));
  return cycleList.filter((cycle) => {
    if (issueType && VALID_ISSUE_KINDS.has(issueType as IssueKind) && cycle.classification.kind !== issueType) return false;
    const assigned = cycle.task?.assignedAgent ?? cycle.classification.preferredAgent;
    if (agentId && assigned !== agentId) return false;
    if (confidence && VALID_CONFIDENCE.has(confidence as ConfidenceBand) && cycle.classification.confidence !== confidence) return false;
    if (status && VALID_CYCLE_STATUSES.has(status as CycleStatus) && cycle.status !== status) return false;
    const cycleRisk = cycle.deploy?.riskLevel ?? cycle.task?.risk;
    if (risk && VALID_RISKS.has(risk as AgentRiskLevel) && cycleRisk !== risk) return false;
    return true;
  });
}

function applyTaskFilters(tasksList: AgentTaskRecord[], url: URL): AgentTaskRecord[] {
  const agentId = readAgentId(url.searchParams.get('agentId'));
  const status = readTrimmed(url.searchParams.get('status'));
  const risk = readTrimmed(url.searchParams.get('risk'));
  const sinceRaw = readTrimmed(url.searchParams.get('since'));
  const untilRaw = readTrimmed(url.searchParams.get('until'));

  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;
  const untilMs = untilRaw ? Date.parse(untilRaw) : NaN;

  return tasksList.filter((t) => {
    if (agentId && t.assignedAgent !== agentId) return false;
    if (status && VALID_STATUSES.has(status as AgentExecutionStatus) && t.status !== status) return false;
    if (risk && VALID_RISKS.has(risk as AgentRiskLevel) && t.risk !== risk) return false;
    if (Number.isFinite(sinceMs)) {
      const tMs = Date.parse(t.createdAt);
      if (Number.isFinite(tMs) && tMs < sinceMs) return false;
    }
    if (Number.isFinite(untilMs)) {
      const tMs = Date.parse(t.createdAt);
      if (Number.isFinite(tMs) && tMs > untilMs) return false;
    }
    return true;
  });
}

/** GET /api/ivx/cto-dashboard/overview — aggregated owner-only snapshot. */
export async function handleDashboardOverview(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '40', 10) || 40;

    const tasksAll = listTasks(200);
    const tasksFiltered = applyTaskFilters(tasksAll, url).slice(0, limit);

    const counts: Record<AgentExecutionStatus, number> = {
      pending: 0, running: 0, blocked: 0, completed: 0, failed: 0, paused: 0, cancelled: 0,
    };
    const riskCounts: Record<AgentRiskLevel, number> = { low: 0, medium: 0, high: 0 };
    for (const t of tasksAll) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      riskCounts[t.risk] = (riskCounts[t.risk] ?? 0) + 1;
    }

    const active = listActiveAgents();
    const handoffs = listHandoffs(50);
    const audit = listAudit(80);
    const parents = listParentTasks(20);
    const blockedTasks = tasksAll.filter((t) => t.status === 'blocked').slice(0, 20);
    const retryEvents = audit.filter((a) => a.action.startsWith('parent.child.retry'));
    const autonomousCyclesAll = listCycles(120);
    const autonomousCyclesFiltered = applyCycleFilters(autonomousCyclesAll, url).slice(0, limit);

    // Synthetic deploy proposals — surface medium-risk, approval-required tasks
    // as candidate deploys requiring owner action.
    const deployProposals = tasksAll
      .filter((t) => t.approvalRequired && t.risk !== 'high' && (t.status === 'blocked' || t.status === 'pending'))
      .slice(0, 10)
      .map((t) => ({
        taskId: t.id,
        agentId: t.assignedAgent,
        risk: t.risk,
        goal: t.goal,
        blockedReason: t.blockedReason,
        approvedBy: t.approvedBy,
      }));

    return ownerOnlyJson({
      ok: true,
      marker: CTO_DASHBOARD_MARKER,
      ownerOnly: true,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTasks: tasksAll.length,
        statusCounts: counts,
        riskCounts,
        activeAgentsCount: active.filter((a) => a.activeTaskCount > 0).length,
        handoffsCount: handoffs.length,
        auditEntries: audit.length,
        retryEventsCount: retryEvents.length,
        blockedTasksCount: blockedTasks.length,
        parentTaskCount: parents.length,
        deployProposalsCount: deployProposals.length,
        autonomousCyclesCount: autonomousCyclesAll.length,
        autonomousBlockedCount: autonomousCyclesAll.filter((c) => c.status === 'blocked').length,
        autonomousApprovalQueueCount: autonomousCyclesAll.filter((c) => c.approval.status === 'pending_owner_approval').length,
      },
      activeAgents: active,
      tasks: tasksFiltered,
      blockedTasks,
      parents: parents.map((p) => ({
        id: p.id,
        goal: p.goal,
        status: p.status,
        children: p.children.length,
        createdAt: p.createdAt,
        completedAt: p.completedAt,
        aggregation: p.aggregation,
      })),
      handoffs,
      audit,
      deployProposals,
      retryEvents,
      autonomousCycles: autonomousCyclesFiltered.map(mapCycleForDashboard),
      autonomousCycleFilters: {
        issueTypes: Array.from(VALID_ISSUE_KINDS),
        confidence: Array.from(VALID_CONFIDENCE),
        statuses: Array.from(VALID_CYCLE_STATUSES),
        risks: Array.from(VALID_RISKS),
      },
    });
  } catch (error) { return errorResponse(error); }
}

/** GET /api/ivx/cto-dashboard/parent/:id/tree */
export async function handleParentTree(request: Request, parentId: string): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const tree = getParentTaskTree(parentId);
    if (!tree) throw new Error('parent task not found');
    const parent = getParentTask(parentId);
    return ownerOnlyJson({
      ok: true,
      marker: CTO_DASHBOARD_MARKER,
      tree,
      parent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) { return errorResponse(error); }
}

/** GET /api/ivx/cto-dashboard/audit?agentId=&q= */
export async function handleAuditSearch(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const url = new URL(request.url);
    const agentId = readAgentId(url.searchParams.get('agentId'));
    const q = readTrimmed(url.searchParams.get('q')).toLowerCase();
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '120', 10) || 120;
    const rows = listAudit(500, agentId);
    const filtered = q
      ? rows.filter((r) => r.action.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q) || (r.taskId ?? '').toLowerCase().includes(q))
      : rows;
    return ownerOnlyJson({
      ok: true,
      marker: CTO_DASHBOARD_MARKER,
      audit: filtered.slice(0, Math.max(1, Math.min(500, limit))),
      total: filtered.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) { return errorResponse(error); }
}

/** POST /api/ivx/cto-dashboard/control — { action, taskId, approverEmail? } */
export async function handleControlAction(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = readTrimmed(body.action).toLowerCase();
    const taskId = readTrimmed(body.taskId);
    if (!taskId) throw new Error('taskId is required.');
    const reason = readTrimmed(body.reason) || undefined;

    let task: AgentTaskRecord;
    switch (action) {
      case 'retry':
        task = retryTask(taskId);
        break;
      case 'cancel':
        task = cancelTask(taskId, reason ?? 'cancelled by owner');
        break;
      case 'pause':
        task = pauseTask(taskId, reason ?? 'paused by owner');
        break;
      case 'resume':
        task = resumeTask(taskId);
        break;
      case 'approve': {
        const approverEmail = readTrimmed(body.approverEmail);
        if (!approverEmail) throw new Error('approverEmail is required for approve.');
        task = approveTask(taskId, approverEmail);
        break;
      }
      case 'inspect': {
        const found = getTask(taskId);
        if (!found) throw new Error('task not found');
        task = found;
        break;
      }
      default:
        throw new Error('unknown action; allowed: retry, cancel, pause, resume, approve, inspect');
    }

    return ownerOnlyJson({
      ok: true,
      marker: CTO_DASHBOARD_MARKER,
      action,
      task,
      timestamp: new Date().toISOString(),
    });
  } catch (error) { return errorResponse(error); }
}

/** POST /api/ivx/cto-dashboard/autonomous-cycle/control — { action, cycleId, approverEmail?, reason? } */
export async function handleAutonomousCycleControl(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = readTrimmed(body.action).toLowerCase();
    const cycleId = readTrimmed(body.cycleId);
    if (!cycleId) throw new Error('cycleId is required.');
    const approverEmail = readTrimmed(body.approverEmail);
    const reason = readTrimmed(body.reason) || undefined;

    let cycle: CycleRecord;
    switch (action) {
      case 'approve_low_risk_deploy':
        cycle = approveLowRiskDeployProposal(cycleId, approverEmail);
        break;
      case 'reject_proposal':
        cycle = rejectCycleProposal(cycleId, approverEmail || 'owner', reason ?? 'rejected by owner');
        break;
      case 'rerun_validation':
        cycle = rerunCycleValidation(cycleId);
        break;
      case 'inspect': {
        const found = getCycle(cycleId);
        if (!found) throw new Error('cycle not found');
        cycle = found;
        break;
      }
      default:
        throw new Error('unknown action; allowed: approve_low_risk_deploy, reject_proposal, rerun_validation, inspect');
    }

    return ownerOnlyJson({
      ok: true,
      marker: CTO_DASHBOARD_MARKER,
      action,
      cycle: mapCycleForDashboard(cycle),
      timestamp: new Date().toISOString(),
    });
  } catch (error) { return errorResponse(error); }
}

/** POST /api/ivx/cto-dashboard/autonomous-cycle/validate — dashboard-specific owner-only validation. */
export async function handleAutonomousCycleDashboardValidate(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const validation = await runAutonomousDashboardValidation();
    return ownerOnlyJson({
      ok: validation.ok,
      marker: CTO_DASHBOARD_MARKER,
      validation: {
        ok: validation.ok,
        marker: validation.marker,
        checks: validation.checks,
        cycleSummaries: validation.cycles.map((cycle) => mapCycleForDashboard(cycle)),
      },
      timestamp: new Date().toISOString(),
    }, validation.ok ? 200 : 207);
  } catch (error) { return errorResponse(error); }
}
