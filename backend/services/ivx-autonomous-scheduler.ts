/**
 * IVX Autonomous Scheduler (owner-only) — BLOCK 41.
 *
 * The keystone that turns the BLOCK 37–39 continuous-improvement + memory +
 * action-loop pieces into a self-DRIVING system: a durable, restart-safe
 * scheduler that automatically runs the daily self-audit and daily architecture
 * drift detection on an interval — no human prompt — and wires every result into
 * the Unified Executive Memory (so every brain remembers what was found) and the
 * Executive Action Loop (recommendation → execution → outcome → learning), so the
 * learning feedback loop advances on its own.
 *
 * HARD HONESTY RULES:
 *   - The scheduler runs the REAL scans (`runDailySelfAudit`, `detectArchitectureDrift`);
 *     it never fabricates findings. An empty workspace yields an honest empty audit.
 *   - Every run writes an attributed (`source: 'autonomous_mode'`) memory record and
 *     a real action-loop cycle grounded in the actual audit numbers.
 *   - State is durable (atomic temp-file + rename) so `lastRunAt` / `nextDueAt`
 *     survive a process restart and the scheduler never double-runs a fresh boot.
 *   - A failed job never throws into the ticker; it records `failed` + the reason
 *     and re-arms for the next interval.
 *
 * Durable layout (mirrors the proven continuous-execution / unified-memory stores):
 *   logs/audit/scheduler/state.json   scheduler + per-job state (atomic materialised)
 *   logs/audit/scheduler/runs.jsonl   append-only run ledger (forensics)
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  runDailySelfAudit,
  planSafeAutoImprovements,
  type DailySelfAuditRun,
} from './ivx-continuous-improvement';
import {
  detectArchitectureDrift,
  type ArchitectureDriftReport,
} from './ivx-architecture-drift';
import { remember } from './ivx-unified-memory-store';
import {
  recordRecommendation,
  recordExecution,
  recordOutcome,
} from './ivx-executive-action-loop';

export const IVX_SCHEDULER_MARKER = 'ivx-autonomous-scheduler-2026-06-02';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ticker cadence — the per-job interval gates whether work actually runs. */
const TICK_MS = 5 * 60 * 1000;

export type ScheduledJobKind = 'daily_self_audit' | 'daily_drift_detection';

export const SCHEDULED_JOB_KINDS: readonly ScheduledJobKind[] = [
  'daily_self_audit',
  'daily_drift_detection',
];

export type JobRunStatus = 'never' | 'ok' | 'failed';

export type ScheduledJobState = {
  kind: ScheduledJobKind;
  /** How often the job should run (default 24h). */
  intervalMs: number;
  lastRunAt: string | null;
  nextDueAt: string | null;
  lastStatus: JobRunStatus;
  lastDurationMs: number | null;
  lastSummary: string;
  runCount: number;
  failureCount: number;
};

export type SchedulerState = {
  marker: string;
  startedAt: string;
  updatedAt: string;
  enabled: boolean;
  jobs: Record<ScheduledJobKind, ScheduledJobState>;
};

const DIR = path.join(process.cwd(), 'logs', 'audit', 'scheduler');
const STATE_PATH = path.join(DIR, 'state.json');
const TMP_PATH = path.join(DIR, 'state.json.tmp');
const LOG_PATH = path.join(DIR, 'runs.jsonl');

let timer: ReturnType<typeof setInterval> | null = null;
let writeChain: Promise<void> = Promise.resolve();
/** Per-process guard so a long-running job is never started twice concurrently. */
const inFlight = new Set<ScheduledJobKind>();

function nowIso(now: number = Date.now()): string {
  return new Date(now).toISOString();
}

// ── Pure helpers (unit-testable, no I/O) ─────────────────────────────────────

export function freshJobState(kind: ScheduledJobKind, now: number = Date.now()): ScheduledJobState {
  return {
    kind,
    intervalMs: DAY_MS,
    lastRunAt: null,
    // Due immediately on first boot so the first audit runs without waiting a day.
    nextDueAt: nowIso(now),
    lastStatus: 'never',
    lastDurationMs: null,
    lastSummary: 'Not run yet.',
    runCount: 0,
    failureCount: 0,
  };
}

export function freshSchedulerState(now: number = Date.now()): SchedulerState {
  return {
    marker: IVX_SCHEDULER_MARKER,
    startedAt: nowIso(now),
    updatedAt: nowIso(now),
    enabled: true,
    jobs: {
      daily_self_audit: freshJobState('daily_self_audit', now),
      daily_drift_detection: freshJobState('daily_drift_detection', now),
    },
  };
}

/** A job is due when it has never run, or its nextDueAt is at/after now. */
export function isJobDue(job: ScheduledJobState, now: number = Date.now()): boolean {
  if (!job.nextDueAt) return true;
  return Date.parse(job.nextDueAt) <= now;
}

/** The next time a freshly-completed job should run. */
export function computeNextDue(now: number, intervalMs: number): string {
  const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DAY_MS;
  return nowIso(now + safeInterval);
}

/** Which jobs are due right now (pure). */
export function selectDueJobs(state: SchedulerState, now: number = Date.now()): ScheduledJobKind[] {
  if (!state.enabled) return [];
  return SCHEDULED_JOB_KINDS.filter((kind) => isJobDue(state.jobs[kind], now));
}

// ── Durable state I/O ────────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  await mkdir(DIR, { recursive: true });
}

function normalizeState(parsed: unknown): SchedulerState {
  const fresh = freshSchedulerState();
  if (!parsed || typeof parsed !== 'object') return fresh;
  const obj = parsed as Partial<SchedulerState>;
  const jobs = (obj.jobs ?? {}) as Partial<Record<ScheduledJobKind, ScheduledJobState>>;
  return {
    marker: IVX_SCHEDULER_MARKER,
    startedAt: typeof obj.startedAt === 'string' ? obj.startedAt : fresh.startedAt,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : fresh.updatedAt,
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
    jobs: {
      daily_self_audit: { ...fresh.jobs.daily_self_audit, ...(jobs.daily_self_audit ?? {}), kind: 'daily_self_audit' },
      daily_drift_detection: {
        ...fresh.jobs.daily_drift_detection,
        ...(jobs.daily_drift_detection ?? {}),
        kind: 'daily_drift_detection',
      },
    },
  };
}

export async function getSchedulerState(): Promise<SchedulerState> {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return freshSchedulerState();
  }
}

async function writeSchedulerState(state: SchedulerState): Promise<void> {
  await ensureDir();
  const next: SchedulerState = { ...state, updatedAt: nowIso() };
  await writeFile(TMP_PATH, JSON.stringify(next, null, 2), 'utf8');
  await rename(TMP_PATH, STATE_PATH);
}

async function appendRunLog(event: Record<string, unknown>): Promise<void> {
  try {
    await ensureDir();
    await appendFile(LOG_PATH, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // forensic log is best-effort.
  }
}

/** Serialize state mutations so concurrent job completions can't race. */
function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function patchJobState(
  kind: ScheduledJobKind,
  patch: (job: ScheduledJobState, now: number) => ScheduledJobState,
  now: number = Date.now(),
): Promise<SchedulerState> {
  return enqueueWrite(async () => {
    const state = await getSchedulerState();
    state.jobs[kind] = patch(state.jobs[kind], now);
    await writeSchedulerState(state);
    return state;
  });
}

// ── Memory + action-loop wiring (autonomous evolution) ───────────────────────

async function rememberSafely(input: Parameters<typeof remember>[0]): Promise<void> {
  try {
    await remember(input);
  } catch {
    // remembering must never break a scheduled run.
  }
}

/**
 * Drive ONE full action-loop cycle from a self-audit run: record a
 * recommendation, mark it executed/skipped, and record the outcome — so the
 * learning feedback loop (`learnFromOutcomes`) advances autonomously. KPI =
 * count of safe-to-auto-apply proposals surfaced this cycle.
 */
async function driveSelfAuditActionLoop(audit: DailySelfAuditRun, safePlanCount: number): Promise<void> {
  try {
    const top = audit.proposals[0];
    const title = top
      ? `Daily self-audit: ${top.title}`
      : 'Daily self-audit: workspace clean';
    const action = top
      ? top.recommendedAction
      : 'No actionable findings this cycle — keep monitoring.';
    const started = await recordRecommendation({
      title,
      action,
      rationale: `Autonomous daily self-audit ${audit.auditId}: ${audit.summary.totalProposals} proposal(s), ${safePlanCount} safe-to-auto-apply.`,
      category: 'continuous_improvement',
      estimatedImpact: `${safePlanCount} mechanical fix(es) eligible for the safe lane`,
      riskLevel: 'low',
      source: 'autonomous_mode',
    });
    if (!started.ok) return;
    const loopId = started.loop.id;
    // The scheduler proposes + records; it never auto-applies owner-gated work.
    await recordExecution(loopId, {
      status: safePlanCount > 0 ? 'pending' : 'skipped',
      detail:
        safePlanCount > 0
          ? `${safePlanCount} safe proposal(s) queued for the owner-safe auto-apply lane.`
          : 'No safe-to-auto-apply proposals this cycle.',
    });
    await recordOutcome(loopId, {
      result: 'success',
      kpi: 'safe-to-auto-apply proposals',
      kpiBefore: 0,
      kpiAfter: safePlanCount,
      lessonsLearned:
        audit.summary.totalProposals > 0
          ? [`${audit.summary.bySeverity.high} high-severity finding(s) need owner review.`]
          : ['Workspace clean — no debt/freeze findings this cycle.'],
    });
  } catch {
    // action loop is best-effort; a failure never breaks the scheduled run.
  }
}

// ── Job runners ──────────────────────────────────────────────────────────────

export type ScheduledJobResult = {
  kind: ScheduledJobKind;
  ok: boolean;
  durationMs: number;
  summary: string;
  error?: string;
};

/** Optional injectable dependencies so the runner is unit-testable without real scans. */
export type SelfAuditDeps = {
  runDailySelfAudit?: () => Promise<DailySelfAuditRun>;
  planSafeAutoImprovements?: (opts: { audit: DailySelfAuditRun }) => Promise<{ safeProposals: unknown[] }>;
};

export type DriftDeps = {
  detectArchitectureDrift?: () => Promise<ArchitectureDriftReport>;
};

async function runSelfAuditJob(deps: SelfAuditDeps = {}): Promise<ScheduledJobResult> {
  const start = Date.now();
  try {
    const audit = await (deps.runDailySelfAudit ?? runDailySelfAudit)();
    const plan = await (deps.planSafeAutoImprovements ?? planSafeAutoImprovements)({ audit });
    const safeCount = plan.safeProposals.length;

    await rememberSafely({
      kind: 'technical_debt',
      title: `Daily self-audit ${new Date().toISOString().slice(0, 10)}`,
      summary: `${audit.summary.totalProposals} proposal(s), ${safeCount} safe-to-auto-apply, ${audit.techDebt.totals.freezeRisks} freeze risk(s).`,
      data: {
        auditId: audit.auditId,
        filesScanned: audit.techDebt.filesScanned,
        totals: audit.techDebt.totals,
        bySeverity: audit.summary.bySeverity,
        totalProposals: audit.summary.totalProposals,
        safeToAutoApply: safeCount,
      },
      tags: ['self-audit', 'continuous-improvement', 'autonomous'],
      source: 'autonomous_mode',
      status: 'active',
    });

    await driveSelfAuditActionLoop(audit, safeCount);

    const summary = `Self-audit ${audit.auditId}: ${audit.summary.totalProposals} proposal(s), ${safeCount} safe.`;
    return { kind: 'daily_self_audit', ok: true, durationMs: Date.now() - start, summary };
  } catch (error) {
    return {
      kind: 'daily_self_audit',
      ok: false,
      durationMs: Date.now() - start,
      summary: 'Self-audit failed.',
      error: error instanceof Error ? error.message : 'Self-audit failed.',
    };
  }
}

async function runDriftJob(deps: DriftDeps = {}): Promise<ScheduledJobResult> {
  const start = Date.now();
  try {
    const drift = await (deps.detectArchitectureDrift ?? detectArchitectureDrift)();

    await rememberSafely({
      kind: 'architecture_decision',
      title: `Architecture drift check ${new Date().toISOString().slice(0, 10)}`,
      summary: drift.summary,
      data: {
        hasBaseline: drift.hasBaseline,
        overallSeverity: drift.overallSeverity,
        driftCount: drift.drift.length,
      },
      tags: ['architecture-drift', 'continuous-improvement', 'autonomous'],
      source: 'autonomous_mode',
      status: drift.overallSeverity === 'none' ? 'active' : 'open',
    });

    const summary = drift.hasBaseline
      ? `Drift: ${drift.overallSeverity} (${drift.drift.length} metric(s)).`
      : 'No architecture baseline yet — capture one to arm drift tracking.';
    return { kind: 'daily_drift_detection', ok: true, durationMs: Date.now() - start, summary };
  } catch (error) {
    return {
      kind: 'daily_drift_detection',
      ok: false,
      durationMs: Date.now() - start,
      summary: 'Drift detection failed.',
      error: error instanceof Error ? error.message : 'Drift detection failed.',
    };
  }
}

/**
 * Run a single scheduled job NOW (regardless of due time) and persist its
 * result + next-due. Concurrency-guarded per kind. Never throws.
 */
export async function runScheduledJob(
  kind: ScheduledJobKind,
  deps: { selfAudit?: SelfAuditDeps; drift?: DriftDeps } = {},
): Promise<ScheduledJobResult> {
  if (inFlight.has(kind)) {
    return { kind, ok: false, durationMs: 0, summary: 'Already running.', error: 'Job already in flight.' };
  }
  inFlight.add(kind);
  try {
    const result =
      kind === 'daily_self_audit'
        ? await runSelfAuditJob(deps.selfAudit)
        : await runDriftJob(deps.drift);

    await patchJobState(kind, (job, now) => ({
      ...job,
      lastRunAt: nowIso(now),
      nextDueAt: computeNextDue(now, job.intervalMs),
      lastStatus: result.ok ? 'ok' : 'failed',
      lastDurationMs: result.durationMs,
      lastSummary: result.error ? `${result.summary} (${result.error})` : result.summary,
      runCount: job.runCount + 1,
      failureCount: job.failureCount + (result.ok ? 0 : 1),
    }));
    await appendRunLog({ type: 'job_run', kind, ok: result.ok, durationMs: result.durationMs, summary: result.summary, at: nowIso() });
    return result;
  } finally {
    inFlight.delete(kind);
  }
}

/** Run every job that is currently due. Returns the results of the jobs it ran. */
export async function runDueJobs(now: number = Date.now()): Promise<ScheduledJobResult[]> {
  const state = await getSchedulerState();
  const due = selectDueJobs(state, now);
  const results: ScheduledJobResult[] = [];
  for (const kind of due) {
    results.push(await runScheduledJob(kind));
  }
  return results;
}

/** Enable/disable the scheduler (persisted). */
export async function setSchedulerEnabled(enabled: boolean): Promise<SchedulerState> {
  return enqueueWrite(async () => {
    const state = await getSchedulerState();
    state.enabled = enabled;
    await writeSchedulerState(state);
    await appendRunLog({ type: enabled ? 'enabled' : 'disabled', at: nowIso() });
    return state;
  });
}

// ── Background ticker ─────────────────────────────────────────────────────────

/** Start the background scheduler. Idempotent; gated by IVX_SCHEDULER env. */
export function startAutonomousScheduler(): void {
  if (timer) return;
  if ((process.env.IVX_SCHEDULER ?? 'on').toLowerCase() === 'off') return;
  timer = setInterval(() => {
    void (async () => {
      try {
        await runDueJobs();
      } catch (err) {
        console.warn('[IVXScheduler] tick failed:', err instanceof Error ? err.message : err);
      }
    })();
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('[IVXScheduler] autonomous scheduler started');
}

export function stopAutonomousScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
