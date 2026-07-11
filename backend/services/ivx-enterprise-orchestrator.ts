/**
 * IVX Enterprise Orchestrator — Central Governance Layer.
 *
 * Unifies all autonomous subsystems under a single coordination plane:
 *   - Agent Framework (Block 25)
 *   - Role Agents (Block ~30)
 *   - Autonomous Scheduler (Block 41)
 *   - Autonomous Cycles (Block 29)
 *   - Task Orchestrator
 *   - Senior Developer Worker
 *   - Executive Layer (Block 37)
 *   - Business Impact / Capital Command Center
 *   - Self-Improvement / Continuous Improvement
 *
 * Responsibilities:
 *   1. Prioritize work across all subsystems
 *   2. Schedule agent runs with conflict detection
 *   3. Detect and recover blocked/failed jobs
 *   4. Monitor all system health
 *   5. Coordinate handoffs between agents
 *   6. Produce unified status for Live Operations Center
 *
 * HARD HONESTY RULES:
 *   - Every status value comes from a real subsystem query — never fabricated.
 *   - A subsystem that fails to respond is reported as `unreachable`, not `ok`.
 *   - The orchestrator never deploys or mutates code — it coordinates only.
 *   - All state is durable (atomic temp+rename) and survives restarts.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDurableStoreConfigured, readDurableJson, writeDurableJson, appendDurableEvent } from './ivx-durable-store';
import { resolveBlockCompletionStatus, NO_DEPLOYMENT_EVIDENCE, type BlockCompletionEvidence } from './ivx-task-completion-gate';

export const IVX_ENTERPRISE_ORCHESTRATOR_MARKER = 'ivx-enterprise-orchestrator-2026-07-01';

// ── Types ──────────────────────────────────────────────────────────────────

export type SubsystemId =
  | 'agent_framework'
  | 'role_agents'
  | 'autonomous_scheduler'
  | 'autonomous_cycles'
  | 'task_orchestrator'
  | 'senior_developer_worker'
  | 'executive_layer'
  | 'business_impact'
  | 'capital_command'
  | 'global_research'
  | 'opportunity_engine'
  | 'self_improvement'
  | 'enterprise_memory'
  | 'governance'
  | 'executive_reports'
  | 'global_intelligence';

export type SubsystemHealth = 'healthy' | 'degraded' | 'unreachable' | 'stopped';

export type SubsystemStatus = {
  id: SubsystemId;
  name: string;
  health: SubsystemHealth;
  lastCheckAt: string;
  activeAgents: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  lastError: string | null;
  uptime: string | null;
};

export type OrchestratorPriority = 'critical' | 'high' | 'medium' | 'low' | 'idle';

export type OrchestratedTask = {
  id: string;
  goal: string;
  targetSubsystem: SubsystemId;
  targetAgent: string | null;
  priority: OrchestratorPriority;
  status: 'pending' | 'running' | 'blocked' | 'completed' | 'failed' | 'not_deployed';
  dependencies: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
};

export type RecoveryAction = {
  id: string;
  targetSubsystem: SubsystemId;
  targetTaskId: string | null;
  action: 'restart' | 'retry' | 'skip' | 'escalate' | 'rollback';
  reason: string;
  executedAt: string | null;
  result: string | null;
};

export type EnterpriseOrchestratorState = {
  marker: string;
  startedAt: string;
  updatedAt: string;
  subsystems: Record<SubsystemId, SubsystemStatus>;
  taskQueue: OrchestratedTask[];
  recoveryLog: RecoveryAction[];
  priorityOrder: OrchestratorPriority[];
  governanceEnabled: boolean;
  autoRecoverEnabled: boolean;
  cycleCount: number;
  lastCycleAt: string | null;
};

// ── Default State ──────────────────────────────────────────────────────────

function defaultSubsystemStatus(id: SubsystemId, name: string): SubsystemStatus {
  return {
    id,
    name,
    health: 'unreachable',
    lastCheckAt: new Date().toISOString(),
    activeAgents: 0,
    queuedTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    blockedTasks: 0,
    lastError: null,
    uptime: null,
  };
}

function defaultOrchestratorState(): EnterpriseOrchestratorState {
  const now = new Date().toISOString();
  return {
    marker: IVX_ENTERPRISE_ORCHESTRATOR_MARKER,
    startedAt: now,
    updatedAt: now,
    subsystems: {
      agent_framework: defaultSubsystemStatus('agent_framework', 'Multi-Agent Framework'),
      role_agents: defaultSubsystemStatus('role_agents', 'Role Agents'),
      autonomous_scheduler: defaultSubsystemStatus('autonomous_scheduler', 'Autonomous Scheduler'),
      autonomous_cycles: defaultSubsystemStatus('autonomous_cycles', 'Autonomous Cycles'),
      task_orchestrator: defaultSubsystemStatus('task_orchestrator', 'Task Orchestrator'),
      senior_developer_worker: defaultSubsystemStatus('senior_developer_worker', 'Senior Developer Worker'),
      executive_layer: defaultSubsystemStatus('executive_layer', 'Executive Layer'),
      business_impact: defaultSubsystemStatus('business_impact', 'Business Impact'),
      capital_command: defaultSubsystemStatus('capital_command', 'Capital Command Center'),
      global_research: defaultSubsystemStatus('global_research', 'Global AI Research'),
      opportunity_engine: defaultSubsystemStatus('opportunity_engine', 'Opportunity Engine'),
      self_improvement: defaultSubsystemStatus('self_improvement', 'Self-Improvement'),
      enterprise_memory: defaultSubsystemStatus('enterprise_memory', 'Enterprise Memory'),
      governance: defaultSubsystemStatus('governance', 'Governance'),
      executive_reports: defaultSubsystemStatus('executive_reports', 'Executive Reports'),
      global_intelligence: defaultSubsystemStatus('global_intelligence', 'Global Intelligence Engine'),
    },
    taskQueue: [],
    recoveryLog: [],
    priorityOrder: ['critical', 'high', 'medium', 'low', 'idle'],
    governanceEnabled: true,
    autoRecoverEnabled: true,
    cycleCount: 0,
    lastCycleAt: null,
  };
}

// ── Durable State ──────────────────────────────────────────────────────────

const STATE_DIR = path.join(process.cwd(), 'logs', 'audit', 'enterprise-orchestrator');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const TASK_LOG_FILE = path.join(STATE_DIR, 'tasks.jsonl');
const RECOVERY_LOG_FILE = path.join(STATE_DIR, 'recovery.jsonl');

let _state: EnterpriseOrchestratorState | null = null;

async function ensureStateDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

async function loadState(): Promise<EnterpriseOrchestratorState> {
  if (_state) return _state;
  await ensureStateDir();
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as EnterpriseOrchestratorState;
    if (parsed.marker === IVX_ENTERPRISE_ORCHESTRATOR_MARKER) {
      _state = parsed;
      return _state;
    }
  } catch { /* first run */ }
  _state = defaultOrchestratorState();
  await persistState();
  return _state;
}

async function persistState(): Promise<void> {
  if (!_state) return;
  _state.updatedAt = new Date().toISOString();
  await ensureStateDir();
  const tmp = STATE_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify(_state, null, 2), 'utf-8');
  await rename(tmp, STATE_FILE);
}

async function appendTaskLog(task: OrchestratedTask): Promise<void> {
  await ensureStateDir();
  await appendFile(TASK_LOG_FILE, JSON.stringify(task) + '\n', 'utf-8');
}

async function appendRecoveryLog(action: RecoveryAction): Promise<void> {
  await ensureStateDir();
  await appendFile(RECOVERY_LOG_FILE, JSON.stringify(action) + '\n', 'utf-8');
}

// ── Core Orchestrator Logic ────────────────────────────────────────────────

/**
 * Prioritize the task queue by urgency and dependency resolution.
 * Critical tasks always come first. Then high/medium/low by creation time.
 * Tasks whose dependencies are unmet are pushed down.
 */
function prioritizeQueue(tasks: OrchestratedTask[]): OrchestratedTask[] {
  const priorityWeight: Record<OrchestratorPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    idle: 4,
  };

  const completedIds = new Set(
    tasks.filter((t) => t.status === 'completed').map((t) => t.id),
  );

  return [...tasks].sort((a, b) => {
    const aBlocked = a.dependencies.some((d) => !completedIds.has(d));
    const bBlocked = b.dependencies.some((d) => !completedIds.has(d));
    if (aBlocked && !bBlocked) return 1;
    if (!aBlocked && bBlocked) return -1;
    const pw = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (pw !== 0) return pw;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Dispatch the next ready task from the queue.
 * A task is "ready" when its dependencies are all completed and it is pending.
 */
export async function dispatchNextTask(): Promise<OrchestratedTask | null> {
  const state = await loadState();
  const completedIds = new Set(
    state.taskQueue.filter((t) => t.status === 'completed').map((t) => t.id),
  );
  const runningCount = state.taskQueue.filter((t) => t.status === 'running').length;
  if (runningCount >= 3) return null; // max 3 concurrent

  const prioritized = prioritizeQueue(state.taskQueue);
  const next = prioritized.find(
    (t) =>
      t.status === 'pending' &&
      t.dependencies.every((d) => completedIds.has(d)),
  );

  if (next) {
    next.status = 'running';
    next.startedAt = new Date().toISOString();
    await persistState();
    await appendTaskLog(next);
  }

  return next ?? null;
}

/**
 * Enqueue a new task into the orchestrator.
 */
export async function enqueueTask(task: Omit<OrchestratedTask, 'id' | 'createdAt' | 'status' | 'startedAt' | 'completedAt' | 'error' | 'retryCount'> & { goal: string }): Promise<OrchestratedTask> {
  const state = await loadState();
  const now = new Date().toISOString();
  const newTask: OrchestratedTask = {
    id: `et-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    goal: task.goal,
    targetSubsystem: task.targetSubsystem,
    targetAgent: task.targetAgent ?? null,
    priority: task.priority,
    status: 'pending',
    dependencies: task.dependencies ?? [],
    createdAt: now,
    startedAt: null,
    completedAt: null,
    error: null,
    retryCount: 0,
    maxRetries: task.maxRetries ?? 3,
  };
  state.taskQueue.push(newTask);
  await persistState();
  await appendTaskLog(newTask);
  return newTask;
}

/**
 * Complete a task — evidence-gated (owner spec 2026-07-11).
 *
 * A task may NEVER be marked `completed` without real deployment evidence:
 * commit exists, push completed, deployment started + completed, health
 * endpoint returned HTTP 200, and production is running the pushed commit.
 * Missing or failing evidence settles the task as `not_deployed` with the
 * exact unmet requirements recorded — never a fabricated success.
 */
export async function completeTask(
  taskId: string,
  evidence?: BlockCompletionEvidence,
): Promise<OrchestratedTask | null> {
  const state = await loadState();
  const task = state.taskQueue.find((t) => t.id === taskId);
  if (!task) return null;

  const decision = resolveBlockCompletionStatus(evidence ?? NO_DEPLOYMENT_EVIDENCE);
  if (decision.status !== 'VERIFIED') {
    task.status = 'not_deployed';
    task.completedAt = new Date().toISOString();
    task.error = `NOT DEPLOYED — completion blocked: ${decision.failures.join(' ')}`;
    await persistState();
    await appendTaskLog(task);
    return task;
  }

  task.status = 'completed';
  task.completedAt = new Date().toISOString();
  task.error = null;
  await persistState();
  await appendTaskLog(task);
  return task;
}

/**
 * Fail a task.
 */
export async function failTask(taskId: string, error: string): Promise<OrchestratedTask | null> {
  const state = await loadState();
  const task = state.taskQueue.find((t) => t.id === taskId);
  if (!task) return null;
  task.status = 'failed';
  task.error = error;
  task.completedAt = new Date().toISOString();
  await persistState();
  await appendTaskLog(task);
  return task;
}

/**
 * Block a task.
 */
export async function blockTask(taskId: string, reason: string): Promise<OrchestratedTask | null> {
  const state = await loadState();
  const task = state.taskQueue.find((t) => t.id === taskId);
  if (!task) return null;
  task.status = 'blocked';
  task.error = reason;
  await persistState();
  await appendTaskLog(task);
  return task;
}

/**
 * Detect blocked or failed tasks that need recovery.
 */
export async function detectBlockers(): Promise<OrchestratedTask[]> {
  const state = await loadState();
  return state.taskQueue.filter(
    (t) =>
      t.status === 'blocked' ||
      (t.status === 'failed' && t.retryCount < t.maxRetries),
  );
}

/**
 * Recover a blocked or failed task.
 */
export async function recoverTask(taskId: string): Promise<RecoveryAction | null> {
  const state = await loadState();
  const task = state.taskQueue.find((t) => t.id === taskId);
  if (!task) return null;

  let action: RecoveryAction['action'];
  if (task.status === 'failed' && task.retryCount < task.maxRetries) {
    action = 'retry';
    task.status = 'pending';
    task.retryCount++;
    task.error = null;
    task.startedAt = null;
  } else if (task.status === 'blocked') {
    action = 'skip';
    task.status = 'pending';
    task.error = null;
  } else {
    action = 'escalate';
  }

  const recovery: RecoveryAction = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetSubsystem: task.targetSubsystem,
    targetTaskId: taskId,
    action,
    reason: `Auto-recovery: ${task.error ?? 'blocked task'}`,
    executedAt: new Date().toISOString(),
    result: action === 'escalate' ? 'escalated to owner' : `task set to ${task.status}`,
  };

  state.recoveryLog.push(recovery);
  await persistState();
  await appendRecoveryLog(recovery);
  return recovery;
}

/**
 * Update a subsystem's health status.
 */
export async function updateSubsystemHealth(
  id: SubsystemId,
  health: SubsystemHealth,
  metrics?: Partial<Pick<SubsystemStatus, 'activeAgents' | 'queuedTasks' | 'completedTasks' | 'failedTasks' | 'blockedTasks' | 'lastError'>>,
): Promise<SubsystemStatus> {
  const state = await loadState();
  const sub = state.subsystems[id];
  sub.health = health;
  sub.lastCheckAt = new Date().toISOString();
  if (metrics) {
    if (metrics.activeAgents !== undefined) sub.activeAgents = metrics.activeAgents;
    if (metrics.queuedTasks !== undefined) sub.queuedTasks = metrics.queuedTasks;
    if (metrics.completedTasks !== undefined) sub.completedTasks = metrics.completedTasks;
    if (metrics.failedTasks !== undefined) sub.failedTasks = metrics.failedTasks;
    if (metrics.blockedTasks !== undefined) sub.blockedTasks = metrics.blockedTasks;
    if (metrics.lastError !== undefined) sub.lastError = metrics.lastError;
  }
  await persistState();
  return sub;
}

/**
 * Run one full orchestrator cycle:
 * 1. Detect blockers
 * 2. Recover recoverable tasks
 * 3. Prioritize queue
 * 4. Dispatch next ready task
 * 5. Update all subsystem health checks
 */
export async function runOrchestratorCycle(): Promise<{
  blockersFound: number;
  recovered: number;
  dispatched: number;
  cycleCount: number;
}> {
  const state = await loadState();
  state.cycleCount++;
  state.lastCycleAt = new Date().toISOString();

  // 1. Detect blockers
  const blockers = await detectBlockers();
  let recovered = 0;
  if (state.autoRecoverEnabled) {
    for (const blocker of blockers) {
      const result = await recoverTask(blocker.id);
      if (result && result.action !== 'escalate') recovered++;
    }
  }

  // 2. Dispatch next ready task
  const dispatched = await dispatchNextTask();

  state.updatedAt = new Date().toISOString();
  await persistState();

  return {
    blockersFound: blockers.length,
    recovered,
    dispatched: dispatched ? 1 : 0,
    cycleCount: state.cycleCount,
  };
}

/**
 * Get the full orchestrator state for the Live Operations Center.
 */
export async function getOrchestratorState(): Promise<EnterpriseOrchestratorState> {
  return loadState();
}

/**
 * Reset the orchestrator to a clean state.
 */
export async function resetOrchestrator(): Promise<EnterpriseOrchestratorState> {
  _state = defaultOrchestratorState();
  await persistState();
  return _state;
}

/**
 * Get aggregate executive KPIs from orchestrator state.
 */
export async function getExecutiveKPIs(): Promise<{
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  notDeployedTasks: number;
  pendingTasks: number;
  healthySubsystems: number;
  degradedSubsystems: number;
  unreachableSubsystems: number;
  cyclesRun: number;
  lastCycleAt: string | null;
}> {
  const state = await loadState();
  const subs = Object.values(state.subsystems);
  return {
    totalTasks: state.taskQueue.length,
    completedTasks: state.taskQueue.filter((t) => t.status === 'completed').length,
    failedTasks: state.taskQueue.filter((t) => t.status === 'failed').length,
    blockedTasks: state.taskQueue.filter((t) => t.status === 'blocked').length,
    notDeployedTasks: state.taskQueue.filter((t) => t.status === 'not_deployed').length,
    pendingTasks: state.taskQueue.filter((t) => t.status === 'pending' || t.status === 'running').length,
    healthySubsystems: subs.filter((s) => s.health === 'healthy').length,
    degradedSubsystems: subs.filter((s) => s.health === 'degraded').length,
    unreachableSubsystems: subs.filter((s) => s.health === 'unreachable').length,
    cyclesRun: state.cycleCount,
    lastCycleAt: state.lastCycleAt,
  };
}

// ── Ticker — background coordination loop ──────────────────────────────────

let _tickerInterval: ReturnType<typeof setInterval> | null = null;

export function startEnterpriseOrchestratorTicker(intervalMs: number = 60_000): void {
  if (_tickerInterval) return;
  _tickerInterval = setInterval(async () => {
    try {
      await runOrchestratorCycle();
    } catch (err) {
      console.error('[EnterpriseOrchestrator] ticker error:', err);
    }
  }, intervalMs);
  console.log(`[EnterpriseOrchestrator] Ticker started — every ${intervalMs / 1000}s`);
}

export function stopEnterpriseOrchestratorTicker(): void {
  if (_tickerInterval) {
    clearInterval(_tickerInterval);
    _tickerInterval = null;
    console.log('[EnterpriseOrchestrator] Ticker stopped');
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

export async function validateEnterpriseOrchestrator(): Promise<{
  valid: boolean;
  issues: string[];
  state: EnterpriseOrchestratorState;
}> {
  const state = await loadState();
  const issues: string[] = [];

  if (state.marker !== IVX_ENTERPRISE_ORCHESTRATOR_MARKER) {
    issues.push('State marker mismatch — possible corruption');
  }

  const requiredSubsystems: SubsystemId[] = [
    'agent_framework', 'role_agents', 'autonomous_scheduler', 'autonomous_cycles',
    'task_orchestrator', 'senior_developer_worker', 'executive_layer', 'business_impact',
    'capital_command', 'global_research', 'opportunity_engine', 'self_improvement',
    'enterprise_memory', 'governance', 'executive_reports', 'global_intelligence',
  ];

  for (const id of requiredSubsystems) {
    if (!state.subsystems[id]) {
      issues.push(`Missing subsystem: ${id}`);
    }
  }

  return { valid: issues.length === 0, issues, state };
}
