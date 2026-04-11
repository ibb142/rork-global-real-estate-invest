import { AppState, type AppStateStatus } from 'react-native';
import { runAllFlowProbes } from './flow-probes';
import { autoHealFromProbeResults, getRecentHealAttempts } from './auto-healer';
import { detectAndCreateRepairTasks, getOpenRepairTasks } from './repair-pipeline';
import { getRecentDiagnosticEvents } from './diagnostic-events';
import type {
  QCAuditCycleResult,
  QCAuditSummary,
  QCDashboardSnapshot,
  QCHealAttempt,
  QCProbeResult,
  QCRepairTask,
} from './types';

const DEFAULT_CYCLE_INTERVAL_MS = 120_000;
const MIN_CYCLE_INTERVAL_MS = 30_000;
const MAX_CYCLE_HISTORY = 10;

type DaemonState = 'idle' | 'running' | 'paused';

interface DaemonConfig {
  cycleIntervalMs: number;
  autoHealEnabled: boolean;
  repairDetectionEnabled: boolean;
  pauseWhenBackground: boolean;
}

let daemonState: DaemonState = 'idle';
let cycleTimer: ReturnType<typeof setInterval> | null = null;
let inFlightCycle: Promise<QCAuditCycleResult> | null = null;
let cycleHistory: QCAuditCycleResult[] = [];
let lastCycleAt: string | null = null;
let cycleCount = 0;
let appStateSubscription: { remove: () => void } | null = null;

const config: DaemonConfig = {
  cycleIntervalMs: DEFAULT_CYCLE_INTERVAL_MS,
  autoHealEnabled: true,
  repairDetectionEnabled: true,
  pauseWhenBackground: true,
};

type DaemonListener = (snapshot: QCDashboardSnapshot) => void;
const listeners = new Set<DaemonListener>();

function notifyListeners(): void {
  const snapshot = getDashboardSnapshot();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // listener error
    }
  });
}

export function subscribeToDaemon(fn: DaemonListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function computeSummary(
  probeResults: QCProbeResult[],
  healAttempts: QCHealAttempt[],
  newTasks: QCRepairTask[],
): QCAuditSummary {
  const passed = probeResults.filter((r) => r.status === 'pass').length;
  const warned = probeResults.filter((r) => r.status === 'warn').length;
  const failed = probeResults.filter((r) => r.status === 'fail').length;
  const skipped = probeResults.filter((r) => r.status === 'skip').length;
  const healsSucceeded = healAttempts.filter((a) => a.success).length;

  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (failed >= 2) overallHealth = 'critical';
  else if (failed >= 1 || warned >= 3) overallHealth = 'degraded';

  return {
    totalProbes: probeResults.length,
    passed,
    warned,
    failed,
    skipped,
    healsAttempted: healAttempts.length,
    healsSucceeded,
    newTasksCreated: newTasks.length,
    overallHealth,
  };
}

async function executeCycle(): Promise<QCAuditCycleResult> {
  const cycleId = `cycle_${++cycleCount}_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const start = Date.now();

  console.log(`[QC:Daemon] Starting audit cycle ${cycleId}`);

  const probeResults = await runAllFlowProbes();

  let healAttempts: QCHealAttempt[] = [];
  if (config.autoHealEnabled) {
    healAttempts = await autoHealFromProbeResults(probeResults);
  }

  let newRepairTasks: QCRepairTask[] = [];
  if (config.repairDetectionEnabled) {
    newRepairTasks = await detectAndCreateRepairTasks(probeResults);
  }

  const durationMs = Date.now() - start;
  const summary = computeSummary(probeResults, healAttempts, newRepairTasks);

  const result: QCAuditCycleResult = {
    cycleId,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    probeResults,
    healAttempts,
    newRepairTasks,
    summary,
  };

  cycleHistory.push(result);
  if (cycleHistory.length > MAX_CYCLE_HISTORY) {
    cycleHistory = cycleHistory.slice(-MAX_CYCLE_HISTORY);
  }

  lastCycleAt = result.completedAt;

  console.log(
    `[QC:Daemon] Cycle ${cycleId} complete in ${durationMs}ms — ` +
    `health=${summary.overallHealth} pass=${summary.passed} warn=${summary.warned} fail=${summary.failed} ` +
    `heals=${summary.healsSucceeded}/${summary.healsAttempted} tasks=${summary.newTasksCreated}`,
  );

  notifyListeners();
  return result;
}

export async function runAuditCycle(): Promise<QCAuditCycleResult> {
  if (inFlightCycle) {
    console.log('[QC:Daemon] Joining in-flight cycle');
    return inFlightCycle;
  }

  inFlightCycle = executeCycle();
  return inFlightCycle.finally(() => {
    inFlightCycle = null;
  });
}

export function startMonitorDaemon(intervalMs?: number): void {
  if (daemonState === 'running') {
    console.log('[QC:Daemon] Already running');
    return;
  }

  const interval = Math.max(MIN_CYCLE_INTERVAL_MS, intervalMs ?? config.cycleIntervalMs);
  config.cycleIntervalMs = interval;

  console.log(`[QC:Daemon] Starting with ${interval}ms interval`);
  daemonState = 'running';

  void runAuditCycle();

  cycleTimer = setInterval(() => {
    if (daemonState === 'running') {
      void runAuditCycle();
    }
  }, interval);

  if (config.pauseWhenBackground && !appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  }
}

export function stopMonitorDaemon(): void {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
  daemonState = 'idle';
  appStateSubscription?.remove();
  appStateSubscription = null;
  console.log('[QC:Daemon] Stopped');
}

export function pauseMonitorDaemon(): void {
  if (daemonState === 'running') {
    daemonState = 'paused';
    console.log('[QC:Daemon] Paused');
  }
}

export function resumeMonitorDaemon(): void {
  if (daemonState === 'paused') {
    daemonState = 'running';
    console.log('[QC:Daemon] Resumed');
    void runAuditCycle();
  }
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (nextState === 'active') {
    resumeMonitorDaemon();
  } else if (nextState === 'background' || nextState === 'inactive') {
    pauseMonitorDaemon();
  }
}

export function getDaemonState(): DaemonState {
  return daemonState;
}

export function getDaemonConfig(): DaemonConfig {
  return { ...config };
}

export function updateDaemonConfig(update: Partial<DaemonConfig>): void {
  if (update.cycleIntervalMs !== undefined) {
    config.cycleIntervalMs = Math.max(MIN_CYCLE_INTERVAL_MS, update.cycleIntervalMs);
  }
  if (update.autoHealEnabled !== undefined) {
    config.autoHealEnabled = update.autoHealEnabled;
  }
  if (update.repairDetectionEnabled !== undefined) {
    config.repairDetectionEnabled = update.repairDetectionEnabled;
  }
  if (update.pauseWhenBackground !== undefined) {
    config.pauseWhenBackground = update.pauseWhenBackground;
  }
  console.log('[QC:Daemon] Config updated:', config);
}

export function getLastCycleResult(): QCAuditCycleResult | null {
  return cycleHistory.length > 0 ? cycleHistory[cycleHistory.length - 1] ?? null : null;
}

export function getCycleHistory(): QCAuditCycleResult[] {
  return [...cycleHistory];
}

export function getDashboardSnapshot(): QCDashboardSnapshot {
  const lastCycle = getLastCycleResult();
  const nextCycleAt = lastCycleAt
    ? new Date(new Date(lastCycleAt).getTime() + config.cycleIntervalMs).toISOString()
    : null;

  return {
    lastCycleResult: lastCycle,
    openRepairTasks: [],
    recentHealAttempts: getRecentHealAttempts(10),
    recentDiagnosticEvents: getRecentDiagnosticEvents(20),
    monitoringActive: daemonState === 'running',
    cycleIntervalMs: config.cycleIntervalMs,
    lastCycleAt,
    nextCycleAt,
  };
}

export async function getDashboardSnapshotAsync(): Promise<QCDashboardSnapshot> {
  const base = getDashboardSnapshot();
  const openTasks = await getOpenRepairTasks();
  return {
    ...base,
    openRepairTasks: openTasks,
  };
}
