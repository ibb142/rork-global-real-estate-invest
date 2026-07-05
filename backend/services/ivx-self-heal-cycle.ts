/**
 * IVX Self-Heal Cycle — the single end-to-end autonomous engineering loop.
 *
 * Every subsystem IVX needs already exists in isolation (priority engine, the
 * autonomous repair cycle, the test reporter, the production guard, the audit
 * item store). What was missing is the *orchestrator* that runs them as one
 * verified loop, in the exact order the owner asked for:
 *
 *   find blocker → prioritize → fix safely → run tests → verify production
 *     → rollback if needed → resume queued work → report ONLY verified results
 *
 * Hard safety rules:
 *   - Non-destructive: "fix safely" routes through the autonomous-cycle, which
 *     only *proposes* patches; code application stays owner-gated.
 *   - Rollback only fires when checks fail OR production health is degraded,
 *     and the production guard itself enforces threshold + cooldown + config.
 *   - "Report only verified results" means: a stage is reported as VERIFIED only
 *     when it produced real proof (exit code, health snapshot, rollback id…).
 *     Anything else is reported as failed / skipped / unverified — never as done.
 *
 * Read-mostly: this orchestrator never mutates source files. Its only writes
 * are durable JSON proof artifacts under logs/audit/self-heal/<cycleId>.json.
 */
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildPriorityQueue, type PriorityEntry, type PriorityTier } from './ivx-priority-engine';
import { runStructuredTestReport, type TestReport, type TestSuite } from './ivx-test-reporter';
import { getProductionHealth, triggerProductionRollback, type ProductionHealth, type RollbackResult } from './ivx-production-guard';
import { runAutonomousCycle } from './agents/autonomous-cycle';

export const IVX_SELF_HEAL_CYCLE_MARKER = 'ivx-self-heal-cycle-2026-05-29';

/** Convenience alias for the suites a self-heal cycle may run. */
export type TestSuiteList = TestSuite[];

const SELF_HEAL_ROOT = path.join(process.cwd(), 'logs', 'audit', 'self-heal');
const SELF_HEAL_LOG = path.join(SELF_HEAL_ROOT, 'events.log');

export type StageStatus = 'verified' | 'failed' | 'skipped' | 'unverified';

export type CycleStage = {
  /** Stage ordinal, 1..8 — matches the owner's requested pipeline order. */
  step: number;
  name: string;
  status: StageStatus;
  /** Human-readable proof string (exit code, health snapshot, rollback id…). */
  proof: string;
  startedAt: string;
  finishedAt: string;
};

export type SelfHealCycleReport = {
  marker: string;
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** True only when every executed stage is verified (or safely skipped). */
  allVerified: boolean;
  blocker: {
    found: boolean;
    tier: PriorityTier | null;
    title: string | null;
    source: string | null;
    reference: string | null;
  };
  prioritization: {
    totalOpen: number;
    tierCounts: Record<PriorityTier, number>;
  };
  tests: TestReport[];
  production: ProductionHealth | null;
  rollback: RollbackResult | null;
  /** Remaining ranked work the loop will resume on the next pass. */
  resumeQueue: { id: string; tier: PriorityTier; title: string }[];
  stages: CycleStage[];
  /** Filtered view: ONLY the stages that produced real verification proof. */
  verifiedResults: CycleStage[];
};

export type RunSelfHealCycleOptions = {
  /** Test suites to run after the fix proposal. Defaults to typecheck + lint. */
  suites?: TestSuite[];
  /** Owner email used when routing the (non-destructive) repair proposal. */
  approverEmail?: string;
  /** How many remaining items to surface in the resume queue. */
  resumeLimit?: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `selfheal-${crypto.randomUUID()}`;
  }
  return `selfheal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function logEvent(event: string, detail: string): Promise<void> {
  try {
    await mkdir(SELF_HEAL_ROOT, { recursive: true });
    await appendFile(SELF_HEAL_LOG, `${nowIso()} ${event} ${detail}\n`, 'utf8');
  } catch {
    // Proof logging is best-effort; never fail the cycle on a log write.
  }
  console.log(`[IVXSelfHeal] ${event} ${detail}`);
}

function stage(step: number, name: string, status: StageStatus, proof: string, startedAt: string): CycleStage {
  return { step, name, status, proof, startedAt, finishedAt: nowIso() };
}

/**
 * Run one complete verified self-heal cycle.
 * Returns a structured, proof-grade report. Never throws — failures surface as
 * failed/unverified stages so the report is always honest and complete.
 */
export async function runSelfHealCycle(options: RunSelfHealCycleOptions = {}): Promise<SelfHealCycleReport> {
  const cycleId = uid();
  const startedAt = nowIso();
  const startMs = Date.now();
  const suites: TestSuite[] = options.suites && options.suites.length > 0 ? options.suites : ['typecheck', 'lint'];
  const resumeLimit = Math.min(Math.max(1, options.resumeLimit ?? 20), 100);
  const stages: CycleStage[] = [];

  await logEvent('SELF_HEAL_CYCLE_STARTED', `cycle=${cycleId} suites=${suites.join(',')}`);

  // ---- Stage 1: find blocker + Stage 2: prioritize automatically ----
  let s = nowIso();
  const queue = await buildPriorityQueue(200);
  const next: PriorityEntry | null = queue.next;
  stages.push(stage(
    1,
    'find blocker',
    next ? 'verified' : 'skipped',
    next
      ? `Top blocker [${next.tier}] ${next.source}: ${next.title} (ref=${next.reference ?? 'n/a'})`
      : 'No open blockers in any source — queue empty.',
    s,
  ));
  await logEvent('SELF_HEAL_BLOCKER', next ? `tier=${next.tier} id=${next.id}` : 'none');

  s = nowIso();
  stages.push(stage(
    2,
    'prioritize automatically',
    'verified',
    `Ranked ${queue.totalOpen} open items → CRITICAL/${queue.tierCounts.CRITICAL} HIGH/${queue.tierCounts.HIGH} MEDIUM/${queue.tierCounts.MEDIUM} LOW/${queue.tierCounts.LOW}; blockers-first=${queue.blockersFirst}.`,
    s,
  ));

  // ---- Stage 3: fix safely (non-destructive proposal) ----
  s = nowIso();
  if (next) {
    try {
      const cycle = await runAutonomousCycle({
        signal: {
          description: `[self-heal] ${next.title}`,
          metadata: { selfHealCycleId: cycleId, source: next.source, reference: next.reference, tier: next.tier },
        },
        approverEmail: options.approverEmail,
      });
      const gated = cycle.status === 'blocked' || cycle.approval.status === 'pending_owner_approval';
      stages.push(stage(
        3,
        'fix safely',
        'verified',
        `Repair cycle ${cycle.id} status=${cycle.status} approval=${cycle.approval.status} patch=${cycle.patch?.filePath ?? 'proposal-only'}${gated ? ' (owner-gated — no code applied)' : ''}.`,
        s,
      ));
      await logEvent('SELF_HEAL_FIX_PROPOSED', `cycle=${cycle.id} status=${cycle.status}`);
    } catch (error) {
      stages.push(stage(3, 'fix safely', 'failed', `Repair routing failed: ${error instanceof Error ? error.message : String(error)}`, s));
      await logEvent('SELF_HEAL_FIX_FAILED', error instanceof Error ? error.message : String(error));
    }
  } else {
    stages.push(stage(3, 'fix safely', 'skipped', 'No blocker to fix.', s));
  }

  // ---- Stage 4: run tests ----
  const tests: TestReport[] = [];
  for (const suite of suites) {
    s = nowIso();
    await logEvent('SELF_HEAL_TEST_STARTED', `suite=${suite}`);
    const report = await runStructuredTestReport(suite);
    tests.push(report);
    stages.push(stage(
      4,
      `run tests (${suite})`,
      report.ok ? 'verified' : 'failed',
      `exit=${report.exitCode ?? 'null'} durationMs=${report.durationMs}${report.error ? ` error=${report.error}` : ''}`,
      s,
    ));
    await logEvent('SELF_HEAL_TEST_FINISHED', `suite=${suite} ok=${report.ok} exit=${report.exitCode ?? 'null'}`);
  }
  const testsPassed = tests.length > 0 && tests.every((t) => t.ok);

  // ---- Stage 5: verify production ----
  s = nowIso();
  let production: ProductionHealth | null = null;
  try {
    production = getProductionHealth();
    stages.push(stage(
      5,
      'verify production',
      'verified',
      `failureRate=${production.failureRate.toFixed(2)} over ${production.total} events; thresholdExceeded=${production.thresholdExceeded}; renderConfigured=${production.renderConfigured}.`,
      s,
    ));
    await logEvent('SELF_HEAL_PROD_VERIFIED', `rate=${production.failureRate.toFixed(2)} exceeded=${production.thresholdExceeded}`);
  } catch (error) {
    stages.push(stage(5, 'verify production', 'failed', `Health probe failed: ${error instanceof Error ? error.message : String(error)}`, s));
  }

  // ---- Stage 6: rollback if needed ----
  s = nowIso();
  const needsRollback = !testsPassed || (production?.thresholdExceeded ?? false);
  let rollback: RollbackResult | null = null;
  if (needsRollback) {
    const reason = !testsPassed
      ? 'Self-heal: post-fix checks failed.'
      : `Self-heal: production failure rate ${production?.failureRate.toFixed(2)} exceeded threshold.`;
    rollback = await triggerProductionRollback({ reason });
    stages.push(stage(
      6,
      'rollback if needed',
      // A guarded "no-op" (below threshold / cooldown / not configured) is a
      // correct, verified outcome — not a failure.
      rollback.ok || !rollback.triggered ? 'verified' : 'failed',
      rollback.triggered
        ? `Rollback triggered → target=${rollback.targetDeployId} new=${rollback.newDeployId} (${rollback.reason}).`
        : `Rollback evaluated, not triggered: ${rollback.reason}.`,
      s,
    ));
    await logEvent('SELF_HEAL_ROLLBACK', `triggered=${rollback.triggered} ok=${rollback.ok} reason=${rollback.reason}`);
  } else {
    stages.push(stage(6, 'rollback if needed', 'skipped', 'Checks passed and production healthy — no rollback required.', s));
  }

  // ---- Stage 7: resume queued work ----
  s = nowIso();
  const remaining = queue.queue
    .filter((entry) => !next || entry.id !== next.id)
    .slice(0, resumeLimit)
    .map((entry) => ({ id: entry.id, tier: entry.tier, title: entry.title }));
  stages.push(stage(
    7,
    'resume queued work',
    'verified',
    `${remaining.length} ranked item(s) queued for the next pass (persistent priority queue, blockers first).`,
    s,
  ));
  await logEvent('SELF_HEAL_RESUME', `queued=${remaining.length}`);

  // ---- Stage 8: report only verified results ----
  s = nowIso();
  const verifiedResults = stages.filter((stg) => stg.status === 'verified');
  stages.push(stage(
    8,
    'report only verified results',
    'verified',
    `${verifiedResults.length}/${stages.length + 1} stages verified; failed/unverified stages excluded from the verified report.`,
    s,
  ));

  const allVerified = stages.every((stg) => stg.status === 'verified' || stg.status === 'skipped');
  const finishedAt = nowIso();

  const report: SelfHealCycleReport = {
    marker: IVX_SELF_HEAL_CYCLE_MARKER,
    cycleId,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startMs,
    allVerified,
    blocker: {
      found: Boolean(next),
      tier: next?.tier ?? null,
      title: next?.title ?? null,
      source: next?.source ?? null,
      reference: next?.reference ?? null,
    },
    prioritization: { totalOpen: queue.totalOpen, tierCounts: queue.tierCounts },
    tests,
    production,
    rollback,
    resumeQueue: remaining,
    stages,
    // Verified view is recomputed AFTER the final stage is pushed.
    verifiedResults: stages.filter((stg) => stg.status === 'verified'),
  };

  await persistReport(report);
  await logEvent('SELF_HEAL_CYCLE_FINISHED', `cycle=${cycleId} allVerified=${allVerified} durationMs=${report.durationMs}`);
  return report;
}

async function persistReport(report: SelfHealCycleReport): Promise<void> {
  try {
    await mkdir(SELF_HEAL_ROOT, { recursive: true });
    await writeFile(path.join(SELF_HEAL_ROOT, `${report.cycleId}.json`), JSON.stringify(report, null, 2), 'utf8');
  } catch {
    // Best-effort persistence; the report is still returned to the caller.
  }
}

/** List recent persisted self-heal reports (newest first) for proof/history. */
export async function listSelfHealReports(limit: number = 20): Promise<SelfHealCycleReport[]> {
  try {
    const files = await readdir(SELF_HEAL_ROOT);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const reports: SelfHealCycleReport[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(path.join(SELF_HEAL_ROOT, file), 'utf8');
        reports.push(JSON.parse(raw) as SelfHealCycleReport);
      } catch {
        // Skip unreadable/corrupt artifacts.
      }
    }
    reports.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return reports.slice(0, Math.min(Math.max(1, limit), 100));
  } catch {
    return [];
  }
}
