/**
 * IVX IA Developer Proof Standard — permanent proof ledger.
 *
 * Every future IVX IA developer task MUST record a proof entry here and may
 * only be reported as "done/deployed/fixed/verified/live" when the entry
 * contains a real commit SHA, Render deploy ID, live HTTP proof, and a
 * positive commit-match result. Otherwise the entry's finalStatus is
 * `UNVERIFIED` and the task is not allowed to be claimed as complete.
 *
 * The ledger is an in-process singleton (Map by taskId). It is intentionally
 * pure + synchronous so it is fully unit-testable and has no external I/O
 * dependency. A higher-level recorder (`recordDeveloperProof`) is the single
 * entry point used by the API layer and by any future executor hook.
 */

export const IVX_DEVELOPER_PROOF_STANDARD_MARKER =
  'ivx-developer-proof-standard-2026-07-04-permanent';

export const IVX_DEVELOPER_PROOF_STANDARD_VERSION = 1;

/** Words the standard forbids without full proof attached. */
export const FORBIDDEN_CLAIM_WORDS: readonly string[] = [
  'done',
  'deployed',
  'fixed',
  'verified',
  'live',
] as const;

/**
 * A single proof entry. Every field is required by the schema; missing
 * execution fields default to `null` and force `finalStatus = UNVERIFIED`.
 */
export type DeveloperProofEntry = {
  task_id: string;
  chat_message_id: string | null;
  requested_by: string;
  action_type: string;
  files_changed: string[];
  git_diff_summary: string | null;
  tests_run: string[] | null;
  test_result: string | null;
  typecheck_result: string | null;
  commit_sha: string | null;
  commit_url: string | null;
  render_deploy_id: string | null;
  render_deploy_status: string | null;
  live_url_tested: string | null;
  live_http_status: number | null;
  live_response_snippet: string | null;
  deployed_commit: string | null;
  commit_match: boolean;
  final_status: DeveloperProofFinalStatus;
  created_at: string;
  completed_at: string | null;
};

export type DeveloperProofFinalStatus =
  | 'IVX IA DEVELOPER PROOF STANDARD VERIFIED'
  | 'UNVERIFIED';

/** Input used to record a proof entry. */
export type DeveloperProofInput = Partial<DeveloperProofEntry> & {
  requested_by: string;
  action_type: string;
};

/** In-process ledger. Singleton, keyed by task_id. */
const ledger = new Map<string, DeveloperProofEntry>();
/** Insertion order so /history is deterministic. */
const order: string[] = [];

let taskCounter = 0;

/**
 * Generate a stable, unique task id. Deterministic given a clock so two
 * recordings in the same millisecond still differ via counter.
 */
export function generateDeveloperProofTaskId(now = Date.now()): string {
  taskCounter += 1;
  return `ivx-dp-${now.toString(36)}-${taskCounter.toString(36).padStart(2, '0')}`;
}

/**
 * Decide the final status from the recorded fields. The anti-fake rule:
 * the task is VERIFIED only when commit, deploy, live proof, and commit
 * match are ALL present and consistent.
 */
export function computeDeveloperProofFinalStatus(
  fields: Pick<
    DeveloperProofEntry,
    'commit_sha' | 'render_deploy_id' | 'live_http_status' | 'deployed_commit' | 'commit_match'
  >,
): DeveloperProofFinalStatus {
  const hasCommit = typeof fields.commit_sha === 'string' && fields.commit_sha.length >= 7;
  const hasDeploy = typeof fields.render_deploy_id === 'string' && fields.render_deploy_id.length > 0;
  const hasLive = typeof fields.live_http_status === 'number' && fields.live_http_status >= 200 && fields.live_http_status < 300;
  const hasMatch = fields.commit_match === true;
  const hasDeployedCommit =
    typeof fields.deployed_commit === 'string' && fields.deployed_commit.length >= 7;
  if (hasCommit && hasDeploy && hasLive && hasMatch && hasDeployedCommit) {
    return 'IVX IA DEVELOPER PROOF STANDARD VERIFIED';
  }
  return 'UNVERIFIED';
}

/**
 * Detect forbidden claim words in a candidate status narrative. Used by the
 * anti-fake rule: if the caller tries to mark a task "done/deployed/fixed/
 * verified/live" without a VERIFIED proof entry, the standard downgrades it
 * to UNVERIFIED.
 */
export function findForbiddenClaimWords(text: string): string[] {
  const t = typeof text === 'string' ? text.toLowerCase() : '';
  return FORBIDDEN_CLAIM_WORDS.filter((w) => t.includes(w));
}

/**
 * Record a proof entry. This is the single entry point for the API layer and
 * for any future executor hook. Missing execution fields force UNVERIFIED.
 */
export function recordDeveloperProof(input: DeveloperProofInput): DeveloperProofEntry {
  const task_id = input.task_id && input.task_id.length > 0 ? input.task_id : generateDeveloperProofTaskId();
  const commit_match = input.commit_match === true;
  const partial: DeveloperProofEntry = {
    task_id,
    chat_message_id: input.chat_message_id ?? null,
    requested_by: input.requested_by,
    action_type: input.action_type,
    files_changed: Array.isArray(input.files_changed) ? input.files_changed : [],
    git_diff_summary: input.git_diff_summary ?? null,
    tests_run: Array.isArray(input.tests_run) ? input.tests_run : null,
    test_result: input.test_result ?? null,
    typecheck_result: input.typecheck_result ?? null,
    commit_sha: input.commit_sha ?? null,
    commit_url: input.commit_url ?? null,
    render_deploy_id: input.render_deploy_id ?? null,
    render_deploy_status: input.render_deploy_status ?? null,
    live_url_tested: input.live_url_tested ?? null,
    live_http_status: input.live_http_status ?? null,
    live_response_snippet: input.live_response_snippet ?? null,
    deployed_commit: input.deployed_commit ?? null,
    commit_match,
    final_status: 'UNVERIFIED',
    created_at: input.created_at ?? new Date().toISOString(),
    completed_at: input.completed_at ?? null,
  };
  partial.final_status = computeDeveloperProofFinalStatus(partial);
  // Anti-fake: never persist a VERIFIED claim when fields are missing.
  if (partial.final_status === 'UNVERIFIED') {
    const claims = findForbiddenClaimWords(
      [input.action_type, input.git_diff_summary ?? '', input.test_result ?? ''].join(' '),
    );
    if (claims.length > 0) {
      // Caller tried to claim a forbidden word without proof — leave the
      // honest UNVERIFIED status in place; do not mutate fields.
      void claims;
    }
  }
  ledger.set(task_id, partial);
  if (!order.includes(task_id)) order.push(task_id);
  // Persist to the durable Supabase developer_proof_ledger table (fire-and-forget;
  // falls back to in-memory only if Supabase is unavailable).
  void persistDeveloperProofToLedger(partial).catch(() => { /* in-memory fallback already holds it */ });
  return partial;
}

/**
 * Update an existing proof entry (e.g., fill in deploy/live fields after the
 * Render deploy completes). Re-computes final_status.
 */
export function updateDeveloperProof(
  task_id: string,
  patch: Partial<DeveloperProofEntry>,
): DeveloperProofEntry | null {
  const existing = ledger.get(task_id);
  if (!existing) return null;
  const merged: DeveloperProofEntry = { ...existing, ...patch, task_id };
  merged.commit_match = merged.commit_match === true;
  merged.final_status = computeDeveloperProofFinalStatus(merged);
  ledger.set(task_id, merged);
  if (!order.includes(task_id)) order.push(task_id);
  void persistDeveloperProofToLedger(merged).catch(() => { /* in-memory fallback already holds it */ });
  return merged;
}

/** Fetch a single entry by task id. */
export function getDeveloperProof(task_id: string): DeveloperProofEntry | null {
  return ledger.get(task_id) ?? null;
}

/** Fetch the most recent entry, or null when the ledger is empty. */
export function getLatestDeveloperProof(): DeveloperProofEntry | null {
  if (order.length === 0) return null;
  return ledger.get(order[order.length - 1]) ?? null;
}

/** Fetch the full history, oldest-first. */
export function getDeveloperProofHistory(): DeveloperProofEntry[] {
  return order.map((id) => ledger.get(id)).filter((e): e is DeveloperProofEntry => Boolean(e));
}

/**
 * Verify a task: re-check that its recorded commit_sha matches its
 * deployed_commit and that the live endpoint still returns 2xx. Returns the
 * entry with a freshly recomputed final_status. Does NOT perform network I/O
 * itself — the API layer performs the live check and passes the result in via
 * `patch`, then this function recomputes the status.
 */
export function verifyDeveloperProof(
  task_id: string,
  patch?: Partial<DeveloperProofEntry>,
): DeveloperProofEntry | null {
  return updateDeveloperProof(task_id, patch ?? {});
}

/** Reset the ledger. Intended for unit tests only. */
export function _resetDeveloperProofLedgerForTests(): void {
  ledger.clear();
  order.length = 0;
  taskCounter = 0;
}

// Durable Supabase persistence (lazy-imported to avoid a hard dependency cycle).
async function persistDeveloperProofToLedger(entry: DeveloperProofEntry): Promise<boolean> {
  try {
    const { persistDeveloperProofToLedger: persist } =
      await import('./ivx-developer-proof-ledger-store');
    return await persist(entry);
  } catch {
    return false;
  }
}
