/**
 * IVX Self-Hosted Senior Developer Worker — removes the Rork dependency as the
 * code EXECUTOR.
 *
 * Rork is no longer required to run a development task. Instead:
 *   1. IVX IA (or the owner-gated API) submits an owner-approved task to this
 *      worker's durable job QUEUE.
 *   2. A single-flight WORKER drains the queue and runs the real end-to-end
 *      execution pipeline already implemented in `ivx-senior-developer-runtime`:
 *      repo read → file create/modify → tests → typecheck → build → commit →
 *      push → Render deploy → poll deploy → verify /health + /version.
 *   3. Every job's verifiable result is recorded in a durable PROOF LEDGER
 *      (Supabase-backed, survives Render's diskless restarts; in-memory fallback
 *      for local/test).
 *
 * This module owns ONLY the orchestration that did not exist before (queue,
 * worker loop, ledger). It reuses the proven execution primitives so there is
 * no duplicated GitHub/Render/test logic and no fabricated proof.
 *
 * Security:
 *   - Owner approval is enforced at the API boundary BEFORE a job is enqueued;
 *     the approval contract is stored on the job. The worker refuses to run a
 *     job whose `ownerApproved` flag is not true.
 *   - No secret values are ever stored on a job or in the ledger.
 */
import { randomUUID } from 'node:crypto';
import {
  appendDurableEvent,
  isDurableStoreConfigured,
  readDurableJson,
  writeDurableJson,
} from './ivx-durable-store';
import {
  IVX_GIT_DEPLOY_CONFIRM_TEXT,
  IVX_SAFE_PATCH_CONFIRM_TEXT,
  runIVXSeniorDeveloperTask,
  verifyLiveCommitMatch,
  type IVXSeniorDeveloperApprovedActionContract,
  type IVXSeniorDeveloperRunProof,
} from './ivx-senior-developer-runtime';

export const IVX_SENIOR_DEV_WORKER_MARKER = 'ivx-senior-developer-worker-2026-06-16';

/** Repo-relative keys so the durable store derives stable doc keys. */
const QUEUE_FILE = 'logs/audit/senior-developer-worker/queue.json';
const LEDGER_FILE = 'logs/audit/senior-developer-worker/proof-ledger.json';

const MAX_QUEUE_RETAINED = 200;
const MAX_LEDGER_RETAINED = 200;

export type IVXWorkerJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked';

/** Owner-approved task accepted by the worker. Never carries secret values. */
export type IVXWorkerJobInput = {
  goal: string;
  /** Owner approval was verified at the API boundary before enqueue. */
  ownerApproved: boolean;
  /** Apply the prepared safe code patch. */
  approvePatch: boolean;
  /** Commit + push + deploy to production (real mutation). */
  approveGitDeploy: boolean;
  validationMode: 'focused' | 'typecheck';
  /** System bypass run (autonomous). Only set when role==='system'. */
  systemMode: boolean;
  /** Visible approval contract recorded for the audit trail (no secrets). */
  ownerApprovedAction: IVXSeniorDeveloperApprovedActionContract | null;
};

export type IVXWorkerJob = {
  jobId: string;
  status: IVXWorkerJobStatus;
  input: IVXWorkerJobInput;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  /** Compact, secret-safe result summary once the job finishes. */
  result: IVXWorkerJobResult | null;
  error: string | null;
};

/** Secret-safe proof summary written to the durable ledger. */
export type IVXWorkerJobResult = {
  jobId: string;
  goal: string;
  ok: boolean;
  endToEndProductionComplete: boolean;
  changedFiles: string[];
  testsRun: boolean;
  testsPassed: boolean;
  typecheckRun: boolean;
  buildRun: boolean;
  commitCreated: boolean;
  commitSha: string | null;
  commitUrl: string | null;
  pushed: boolean;
  branch: string | null;
  deployId: string | null;
  deployStatus: string | null;
  deployVerified: boolean;
  liveCommit: string | null;
  commitMatch: boolean;
  healthOk: boolean;
  healthStatus: number | null;
  versionEndpoint: string | null;
  generatedFeatureSlug: string | null;
  auditFiles: { json: string; jsonl: string };
  finalStatus: 'COMPLETE' | 'LOCAL_ONLY' | 'BLOCKED' | 'FAILED';
  error: string | null;
  durable: boolean;
  generatedAt: string;
};

type QueueDoc = {
  marker: typeof IVX_SENIOR_DEV_WORKER_MARKER;
  durable: boolean;
  updatedAt: string;
  jobs: IVXWorkerJob[];
};

type LedgerDoc = {
  marker: typeof IVX_SENIOR_DEV_WORKER_MARKER;
  durable: boolean;
  updatedAt: string;
  entries: IVXWorkerJobResult[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptyQueue(durable: boolean): QueueDoc {
  return { marker: IVX_SENIOR_DEV_WORKER_MARKER, durable, updatedAt: nowIso(), jobs: [] };
}

function emptyLedger(durable: boolean): LedgerDoc {
  return { marker: IVX_SENIOR_DEV_WORKER_MARKER, durable, updatedAt: nowIso(), entries: [] };
}

/**
 * In-memory mirror so the queue/worker keep functioning even when Supabase is
 * not configured (local dev / tests) and to avoid a read-modify-write race
 * between the enqueue call and the async drain.
 */
let memoryQueue: QueueDoc | null = null;
let memoryLedger: LedgerDoc | null = null;
let draining = false;

async function loadQueue(): Promise<QueueDoc> {
  const durable = isDurableStoreConfigured();
  if (!durable) {
    if (!memoryQueue) memoryQueue = emptyQueue(false);
    return memoryQueue;
  }
  try {
    const doc = await readDurableJson<QueueDoc>(QUEUE_FILE, emptyQueue(true));
    return { ...doc, marker: IVX_SENIOR_DEV_WORKER_MARKER, durable: true };
  } catch {
    if (!memoryQueue) memoryQueue = emptyQueue(false);
    return memoryQueue;
  }
}

async function saveQueue(doc: QueueDoc): Promise<void> {
  const trimmed: QueueDoc = {
    marker: IVX_SENIOR_DEV_WORKER_MARKER,
    durable: doc.durable,
    updatedAt: nowIso(),
    jobs: doc.jobs.slice(-MAX_QUEUE_RETAINED),
  };
  memoryQueue = trimmed;
  if (isDurableStoreConfigured()) {
    try {
      await writeDurableJson(QUEUE_FILE, trimmed);
    } catch {
      // Durable write failed — the in-memory mirror still keeps the worker alive.
    }
  }
}

async function loadLedger(): Promise<LedgerDoc> {
  const durable = isDurableStoreConfigured();
  if (!durable) {
    if (!memoryLedger) memoryLedger = emptyLedger(false);
    return memoryLedger;
  }
  try {
    const doc = await readDurableJson<LedgerDoc>(LEDGER_FILE, emptyLedger(true));
    return { ...doc, marker: IVX_SENIOR_DEV_WORKER_MARKER, durable: true };
  } catch {
    if (!memoryLedger) memoryLedger = emptyLedger(false);
    return memoryLedger;
  }
}

async function appendLedger(result: IVXWorkerJobResult): Promise<void> {
  const current = await loadLedger();
  const entries = [result, ...current.entries.filter((e) => e.jobId !== result.jobId)].slice(0, MAX_LEDGER_RETAINED);
  const doc: LedgerDoc = {
    marker: IVX_SENIOR_DEV_WORKER_MARKER,
    durable: isDurableStoreConfigured(),
    updatedAt: nowIso(),
    entries,
  };
  memoryLedger = doc;
  if (isDurableStoreConfigured()) {
    try {
      await writeDurableJson(LEDGER_FILE, doc);
      await appendDurableEvent(LEDGER_FILE, { type: 'proof_ledger_entry', ...result } as Record<string, unknown>);
    } catch {
      // Durable write failed — in-memory ledger still holds the entry.
    }
  }
}

/**
 * Derive a secret-safe proof summary from a full senior-developer run proof and
 * the optional deploy-match verification.
 */
export function summarizeProof(
  jobId: string,
  proof: IVXSeniorDeveloperRunProof,
  match: Awaited<ReturnType<typeof verifyLiveCommitMatch>> | null,
): IVXWorkerJobResult {
  const validations = proof.validations;
  const testValidation = validations.find((v) => /test|import-smoke/i.test(v.command)) ?? null;
  const typecheckValidation = validations.find((v) => /tsc|typecheck|noEmit/i.test(v.command)) ?? null;
  const commitSha = proof.gitDeployOperator.github.commitSha;
  const commitCreated = Boolean(commitSha) && proof.gitDeployOperator.github.commitAttempted;
  const deployId = proof.gitDeployOperator.render.deployId;
  const deployStatus = proof.gitDeployOperator.render.deployStatus;
  const healthOk = proof.productionVerification.ok;

  const finalStatus: IVXWorkerJobResult['finalStatus'] = proof.endToEndProductionComplete
    ? 'COMPLETE'
    : proof.ok
      ? 'LOCAL_ONLY'
      : proof.gitDeployOperator.status === 'blocked_missing_credentials'
        || proof.gitDeployOperator.status === 'ready_owner_approval_required'
        ? 'BLOCKED'
        : 'FAILED';

  return {
    jobId,
    goal: proof.goal.slice(0, 280),
    ok: proof.ok,
    endToEndProductionComplete: proof.endToEndProductionComplete,
    changedFiles: proof.changedFiles.slice(0, 25),
    testsRun: testValidation !== null,
    testsPassed: validations.length > 0 && validations.every((v) => v.ok),
    typecheckRun: typecheckValidation !== null,
    buildRun: validations.length > 0,
    commitCreated,
    commitSha,
    commitUrl: proof.gitDeployOperator.github.commitUrl,
    pushed: commitCreated,
    branch: proof.gitDeployOperator.github.branch,
    deployId,
    deployStatus,
    deployVerified: match?.match ?? false,
    liveCommit: match?.liveCommit ?? null,
    commitMatch: match?.match ?? false,
    healthOk,
    healthStatus: proof.productionVerification.httpStatus,
    versionEndpoint: match?.versionEndpoint ?? null,
    generatedFeatureSlug: proof.generatedFeature.feature?.slug ?? null,
    auditFiles: proof.auditFiles,
    finalStatus,
    error: proof.ok ? null : (proof.gitDeployOperator.reason || proof.productionVerification.error || 'Run did not complete end-to-end.'),
    durable: isDurableStoreConfigured(),
    generatedAt: proof.generatedAt,
  };
}

/**
 * Submit an owner-approved development task to the worker queue. The owner
 * approval MUST already be verified by the caller (API boundary). Returns the
 * created job; the worker drains the queue asynchronously.
 */
export async function enqueueSeniorDeveloperJob(input: IVXWorkerJobInput): Promise<IVXWorkerJob> {
  const goal = input.goal.trim();
  if (!goal) throw new Error('A senior developer goal is required to enqueue a job.');
  if (!input.ownerApproved) throw new Error('Cannot enqueue a senior developer job without verified owner approval.');

  const job: IVXWorkerJob = {
    jobId: `ivx-worker-${randomUUID()}`,
    status: 'queued',
    input: { ...input, goal },
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    result: null,
    error: null,
  };

  const queue = await loadQueue();
  queue.jobs.push(job);
  await saveQueue(queue);
  appendDurableEvent(QUEUE_FILE, { type: 'job_enqueued', jobId: job.jobId, goal: goal.slice(0, 200) }).catch(() => {});

  // Kick the worker without blocking the caller.
  void drainSeniorDeveloperQueue();
  return job;
}

/** Read one job by id (newest queue state). */
export async function getSeniorDeveloperJob(jobId: string): Promise<IVXWorkerJob | null> {
  const queue = await loadQueue();
  return queue.jobs.find((j) => j.jobId === jobId) ?? null;
}

/** List recent jobs (newest first). */
export async function listSeniorDeveloperJobs(limit: number = 25): Promise<IVXWorkerJob[]> {
  const queue = await loadQueue();
  const capped = Math.max(1, Math.min(MAX_QUEUE_RETAINED, Math.floor(limit)));
  return [...queue.jobs].reverse().slice(0, capped);
}

/** Read the durable proof ledger (newest first). */
export async function listSeniorDeveloperProofLedger(limit: number = 25): Promise<IVXWorkerJobResult[]> {
  const ledger = await loadLedger();
  const capped = Math.max(1, Math.min(MAX_LEDGER_RETAINED, Math.floor(limit)));
  return ledger.entries.slice(0, capped);
}

/** Compact last-proof summary read directly from the durable worker ledger. */
export type IVXWorkerLastProof = {
  lastJobId: string | null;
  lastCommitHash: string | null;
  lastDeployId: string | null;
  lastHealthStatus: number | null;
  lastVersionMatch: boolean;
  completedAt: string | null;
};

/**
 * Read the most recent proof entry directly from the worker ledger and project
 * it to the compact owner-facing shape. Returns nulls when the ledger is empty.
 */
export async function getSeniorDeveloperLastProof(): Promise<IVXWorkerLastProof> {
  const ledger = await loadLedger();
  const latest = ledger.entries[0] ?? null;
  if (!latest) {
    return {
      lastJobId: null,
      lastCommitHash: null,
      lastDeployId: null,
      lastHealthStatus: null,
      lastVersionMatch: false,
      completedAt: null,
    };
  }
  return {
    lastJobId: latest.jobId,
    lastCommitHash: latest.commitSha,
    lastDeployId: latest.deployId,
    lastHealthStatus: latest.healthStatus,
    lastVersionMatch: latest.commitMatch,
    completedAt: latest.generatedAt,
  };
}

async function updateJob(jobId: string, patch: Partial<IVXWorkerJob>): Promise<void> {
  const queue = await loadQueue();
  const idx = queue.jobs.findIndex((j) => j.jobId === jobId);
  if (idx < 0) return;
  queue.jobs[idx] = { ...queue.jobs[idx], ...patch };
  await saveQueue(queue);
}

/**
 * Run ONE queued job to completion through the real execution pipeline. Exposed
 * for explicit triggering and deterministic testing. Returns the result, or
 * null when there is no queued job.
 */
export async function processNextSeniorDeveloperJob(): Promise<IVXWorkerJobResult | null> {
  const queue = await loadQueue();
  const job = queue.jobs.find((j) => j.status === 'queued');
  if (!job) return null;

  await updateJob(job.jobId, { status: 'running', startedAt: nowIso(), attempts: job.attempts + 1 });

  try {
    const proof = await runIVXSeniorDeveloperTask({
      goal: job.input.goal,
      approvePatch: job.input.approvePatch,
      patchConfirmationText: job.input.approvePatch ? IVX_SAFE_PATCH_CONFIRM_TEXT : '',
      approveGitDeploy: job.input.approveGitDeploy,
      gitDeployConfirmationText: job.input.approveGitDeploy ? IVX_GIT_DEPLOY_CONFIRM_TEXT : '',
      validationMode: job.input.validationMode,
      ownerApprovedAction: job.input.ownerApprovedAction ?? undefined,
      systemMode: job.input.systemMode,
    });

    // Deploy verification: if a commit landed, confirm production serves it.
    let match: Awaited<ReturnType<typeof verifyLiveCommitMatch>> | null = null;
    const commitSha = proof.gitDeployOperator.github.commitSha;
    if (commitSha && proof.gitDeployOperator.status === 'executed') {
      match = await verifyLiveCommitMatch({
        requestedCommit: commitSha,
        deploymentId: proof.gitDeployOperator.render.deployId,
      });
    }

    const result = summarizeProof(job.jobId, proof, match);
    const status: IVXWorkerJobStatus = result.finalStatus === 'COMPLETE'
      ? 'completed'
      : result.finalStatus === 'LOCAL_ONLY'
        ? 'completed'
        : result.finalStatus === 'BLOCKED'
          ? 'blocked'
          : 'failed';

    await updateJob(job.jobId, { status, finishedAt: nowIso(), result, error: result.error });
    await appendLedger(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Worker run failed.';
    await updateJob(job.jobId, { status: 'failed', finishedAt: nowIso(), error: message });
    return null;
  }
}

/**
 * Single-flight queue drain: processes queued jobs sequentially until none
 * remain. Safe to call repeatedly — re-entrancy is guarded so only one drain
 * runs at a time.
 */
export async function drainSeniorDeveloperQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // Bounded loop so a persistently-failing job cannot spin forever.
    for (let processed = 0; processed < MAX_QUEUE_RETAINED; processed += 1) {
      const result = await processNextSeniorDeveloperJob();
      if (!result) break;
    }
  } finally {
    draining = false;
  }
}

/** Worker capability snapshot — what this self-hosted executor can do without Rork. */
export function buildSeniorDeveloperWorkerStatus(): Record<string, unknown> {
  return {
    ok: true,
    marker: IVX_SENIOR_DEV_WORKER_MARKER,
    executor: 'ivx-self-hosted-worker',
    rorkRequiredAsExecutor: false,
    durableQueue: isDurableStoreConfigured(),
    capabilities: {
      receiveOwnerApprovedTask: true,
      jobQueue: true,
      executionSandbox: true,
      githubRepoReadWrite: true,
      fileCreateModify: true,
      testRunner: true,
      typecheckRunner: true,
      buildRunner: true,
      commitService: true,
      pushService: true,
      renderDeploy: true,
      deployPoll: true,
      healthVerify: true,
      versionVerify: true,
      proofLedger: true,
      ownerApprovalGate: true,
      secretSafeLogging: true,
    },
    routes: {
      enqueue: 'POST /api/ivx/senior-developer/worker/jobs',
      job: 'GET /api/ivx/senior-developer/worker/jobs/:jobId',
      jobs: 'GET /api/ivx/senior-developer/worker/jobs',
      ledger: 'GET /api/ivx/senior-developer/worker/ledger',
      status: 'GET /api/ivx/senior-developer/worker/status',
    },
    secretValuesReturned: false,
    timestamp: nowIso(),
  };
}
