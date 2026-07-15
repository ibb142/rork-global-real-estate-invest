/**
 * IVX IA Reliability Gate — Single Decision Engine.
 *
 * Problem (owner spec): IVX IA sometimes returns contradictory messages in the
 * same conversation — "Task completed" + "Task blocked" + "I'll inspect now" +
 * "Open Developer Workspace" — which destroys trust.
 *
 * This gate enforces four owner-required rules, deterministically and with no I/O:
 *
 *  1. SINGLE DECISION ENGINE — every reply carries exactly ONE status, picked
 *     from a fixed state machine: READY | RUNNING | WAITING_OWNER | BLOCKED |
 *     FAILED | VERIFIED. Never mixed.
 *  2. NO GENERIC PROMISES — "I'll inspect now", "I'll fix it", "One moment",
 *     "hold on", "let me check" are blocked unless the answer also carries real
 *     evidence (a task id, files changed, commit SHA, deploy id, or live
 *     verification line). A promise without evidence is rewritten to UNVERIFIED.
 *  3. EVIDENCE-FIRST — any claim of Done / Fixed / Verified / Deployed must be
 *     backed by evidence fields (Task ID, Files changed, Commit SHA, Render
 *     Deploy ID, Live verification). Missing evidence → answer becomes
 *     "UNVERIFIED" with the exact missing artifact named.
 *  4. REMOVE CONTRADICTIONS — an answer that asserts a success state (Done /
 *     Completed / Verified / Deployed) AND a failure state (Blocked / Failed /
 *     Waiting) in the same message is contradictory. The gate resolves to the
 *     lower-confidence state and explains the event that caused the change.
 *
 * Pure + deterministic (no network, filesystem, or AI) so it is fully
 * unit-testable. It runs AFTER the senior-developer / access-status / execution
 * gates so it never re-implements their work — it only polishes the final answer
 * into a single-state, evidence-first reply.
 */
export const IVX_IA_RELIABILITY_GATE_MARKER =
  'ivx-ia-reliability-gate-2026-07-04-v1';

/** The single allowed decision state for any IVX IA reply. */
export type IVXIAState =
  | 'READY'
  | 'RUNNING'
  | 'WAITING_OWNER'
  | 'BLOCKED'
  | 'FAILED'
  | 'VERIFIED'
  | 'UNVERIFIED';

/** Evidence fields that turn a promise into a verifiable claim. */
export type IVXIAEvidence = {
  taskId?: string | null;
  filesChanged?: string[] | null;
  commitSha?: string | null;
  renderDeployId?: string | null;
  liveVerification?: string | null;
};

export type IVXIAReliabilityGateInput = {
  message: string;
  answer: string;
  evidence?: IVXIAEvidence | null;
};

export type IVXIAReliabilityGateResult = {
  answer: string;
  gated: boolean;
  state: IVXIAState;
  contradictions: string[];
  bannedPromises: string[];
  missingEvidence: string[];
  reason: string | null;
};

/**
 * Generic promise / filler phrases the owner explicitly banned. They are only
 * allowed when the answer also carries real evidence (task id / files / commit /
 * deploy / live verification); otherwise the promise is fabricated intent.
 */
export const BANNED_GENERIC_PROMISES: readonly string[] = [
  "i'll inspect",
  "i will inspect",
  "i'll fix",
  "i will fix",
  "i'll patch",
  "i will patch",
  "i'll validate",
  "i will validate",
  "i'll implement",
  "i will implement",
  "i'll return proof",
  "i will return proof",
  "i'll check",
  "i will check",
  "i'll look",
  "i will look",
  "i'll review",
  "i will review",
  "let me check",
  "let me look",
  "let me inspect",
  "let me review",
  "let me see",
  'one moment',
  'one sec',
  'just a moment',
  'just a second',
  'give me a moment',
  'give me a second',
  'hold on',
  'please wait',
  'stand by',
  'standby',
  "i'll get back to you",
  'i will get back to you',
  'i will update you shortly',
  "i'll update you shortly",
  'checking now',
  'executing that now',
  'starting now',
  'i am starting',
  'i am inspecting',
  'i am checking',
  'i am executing',
];

/**
 * Success-state assertions. When any of these appear, the answer is claiming a
 * positive outcome and must carry evidence — otherwise it is a fabricated
 * completion claim.
 */
const SUCCESS_STATE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\btask\s+completed\b/i, label: 'Task completed' },
  { pattern: /\btask\s+done\b/i, label: 'Task done' },
  { pattern: /\bdone\b/i, label: 'Done' },
  { pattern: /\bcompleted\b/i, label: 'Completed' },
  { pattern: /\bfinished\b/i, label: 'Finished' },
  { pattern: /\bshipped\b/i, label: 'Shipped' },
  { pattern: /\bfixed\b/i, label: 'Fixed' },
  { pattern: /\bverified\b/i, label: 'Verified' },
  { pattern: /\bdeployed\b/i, label: 'Deployed' },
  { pattern: /\bdeploy\s+(?:is\s+)?live\b/i, label: 'Deploy live' },
  { pattern: /\blive\s+in\s+production\b/i, label: 'Live in production' },
  { pattern: /\ball\s+checks\s+pass(?:ed|ing)?\b/i, label: 'All checks passed' },
  { pattern: /\btests?\s+passed\b/i, label: 'Tests passed' },
  { pattern: /\bbuild\s+succeeded\b/i, label: 'Build succeeded' },
];

/**
 * Failure / waiting-state assertions. When one of these coexists with a success
 * assertion in the same answer, the reply is contradictory.
 */
const FAILURE_STATE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bblocked\b/i, label: 'Blocked' },
  { pattern: /\bfailed\b/i, label: 'Failed' },
  { pattern: /\bwaiting\s+for\s+owner\b/i, label: 'Waiting for owner' },
  { pattern: /\bawaiting\s+approval\b/i, label: 'Awaiting approval' },
  { pattern: /\brequires?\s+owner\s+(?:confirmation|approval)\b/i, label: 'Requires owner approval' },
  { pattern: /\bnot\s+verified\b/i, label: 'Not verified' },
  { pattern: /\bunverified\b/i, label: 'Unverified' },
  { pattern: /\bcould\s+not\s+complete\b/i, label: 'Could not complete' },
  { pattern: /\bunable\s+to\b/i, label: 'Unable to' },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value: string): string {
  return value.toLowerCase();
}

/** Detect banned generic promise phrases in an answer. */
export function findBannedGenericPromises(answer: string): string[] {
  const text = lower(answer);
  return BANNED_GENERIC_PROMISES.filter((phrase) => text.includes(phrase));
}

/** Detect success-state assertions in an answer. */
export function findSuccessStateAssertions(answer: string): string[] {
  return SUCCESS_STATE_PATTERNS.filter(({ pattern }) => pattern.test(answer)).map(
    ({ label }) => label,
  );
}

/** Detect failure / waiting-state assertions in an answer. */
export function findFailureStateAssertions(answer: string): string[] {
  return FAILURE_STATE_PATTERNS.filter(({ pattern }) => pattern.test(answer)).map(
    ({ label }) => label,
  );
}

/**
 * Evidence required to back a success claim. Returns the list of missing
 * evidence fields given the claimed success labels and the attached evidence.
 */
export function findMissingEvidence(
  answer: string,
  evidence: IVXIAEvidence | null | undefined,
): string[] {
  const text = answer ?? '';
  const ev = evidence ?? {};
  const missing: string[] = [];

  const hasTaskId = trimmed(ev.taskId).length > 0 || /\btask\s*id[:\s]+[a-z0-9_-]{4,}/i.test(text);
  const hasFiles = (ev.filesChanged && ev.filesChanged.length > 0)
    || /\bfiles?\s+changed[:\s]+[^\n]+/i.test(text);
  const hasCommit = trimmed(ev.commitSha).length > 0 || /\bcommit(?:_?sha)?[:\s]+[0-9a-f]{6,}/i.test(text);
  const hasDeploy = trimmed(ev.renderDeployId).length > 0
    || /\brender\s+deploy(?:ment)?\s+id[:\s]+[^\s\n]+/i.test(text)
    || /\bdeploy_?id[:\s]+[^\s\n]+/i.test(text);
  const hasLive = trimmed(ev.liveVerification).length > 0
    || /live\s+verification[:\s]+/i.test(text)
    || /production\s+\/health:\s*200/i.test(text)
    || /HTTP\s+200/i.test(text);

  // A "Verified" / "Deployed" / "Live in production" claim requires the full chain.
  const claimsVerified = /\bverified\b/i.test(text);
  const claimsDeployed = /\bdeployed\b/i.test(text) || /\blive\s+in\s+production\b/i.test(text);
  const claimsDone = /\b(?:done|completed|finished|shipped|fixed)\b/i.test(text);

  if (claimsDone && !hasFiles) missing.push('Files changed');
  if (claimsDone && !hasTaskId) missing.push('Task ID');
  if ((claimsVerified || claimsDeployed) && !hasCommit) missing.push('Commit SHA');
  if ((claimsVerified || claimsDeployed) && !hasDeploy) missing.push('Render Deploy ID');
  if ((claimsVerified || claimsDeployed) && !hasLive) missing.push('Live verification');

  return missing;
}

/**
 * Resolve a single decision state from the answer + evidence.
 *
 * Priority (lowest confidence wins so a contradiction never overclaims):
 *  1. If both success and failure assertions are present → contradiction →
 *     resolve to the failure side (BLOCKED / FAILED / WAITING_OWNER).
 *  2. If a success assertion is present but evidence is missing → UNVERIFIED is
 *     NOT a positive state; the gate rewrites the answer, and the state is
 *     BLOCKED (the missing evidence is the blocker).
 *  3. If only success assertions + full evidence → VERIFIED.
 *  4. If only failure assertions → BLOCKED / FAILED / WAITING_OWNER depending on
 *     the exact label.
 *  5. If only banned promises + no evidence → BLOCKED (generic promise without
 *     evidence).
 *  6. Otherwise → READY (normal conversational reply, no claim made).
 */
export function resolveSingleState(
  answer: string,
  evidence: IVXIAEvidence | null | undefined,
): {
  state: IVXIAState;
  contradictions: string[];
  bannedPromises: string[];
  missingEvidence: string[];
  reason: string | null;
} {
  const successAssertions = findSuccessStateAssertions(answer);
  const failureAssertions = findFailureStateAssertions(answer);
  const bannedPromises = findBannedGenericPromises(answer);
  const missingEvidence = successAssertions.length > 0
    ? findMissingEvidence(answer, evidence)
    : [];

  // Contradiction: success + failure in the same message.
  const contradictions: string[] = [];
  if (successAssertions.length > 0 && failureAssertions.length > 0) {
    for (const s of successAssertions) {
      for (const f of failureAssertions) {
        contradictions.push(`${s} + ${f}`);
      }
    }
  }

  if (contradictions.length > 0) {
    // Resolve to the failure side — never overclaim.
    const lowerFailure = failureAssertions.map((f) => lower(f));
    const isWaiting = lowerFailure.some((f) => f.includes('waiting') || f.includes('awaiting') || f.includes('approval'));
    const isFailed = lowerFailure.some((f) => f.includes('failed') || f.includes('could not') || f.includes('unable'));
    const state: IVXIAState = isWaiting ? 'WAITING_OWNER' : isFailed ? 'FAILED' : 'BLOCKED';
    return {
      state,
      contradictions,
      bannedPromises,
      missingEvidence,
      reason: `Contradictory states detected (${contradictions.join('; ')}). Resolved to ${state} — a success claim was retracted because a failure/waiting state appeared in the same reply.`,
    };
  }

  if (successAssertions.length > 0 && missingEvidence.length > 0) {
    return {
      state: 'BLOCKED',
      contradictions,
      bannedPromises,
      missingEvidence,
      reason: `Success claim (${successAssertions.join(', ')}) without required evidence: ${missingEvidence.join(', ')}.`,
    };
  }

  if (successAssertions.length > 0 && missingEvidence.length === 0) {
    return { state: 'VERIFIED', contradictions, bannedPromises, missingEvidence, reason: null };
  }

  if (failureAssertions.length > 0) {
    const lowerFailure = failureAssertions.map((f) => lower(f));
    const isWaiting = lowerFailure.some((f) => f.includes('waiting') || f.includes('awaiting') || f.includes('approval'));
    const isFailed = lowerFailure.some((f) => f.includes('failed') || f.includes('could not') || f.includes('unable'));
    const isNotVerified = lowerFailure.some((f) => f.includes('not verified') || f.includes('unverified'));
    const state: IVXIAState = isWaiting ? 'WAITING_OWNER' : isFailed ? 'FAILED' : isNotVerified ? 'BLOCKED' : 'BLOCKED';
    return { state, contradictions, bannedPromises, missingEvidence, reason: null };
  }

  if (bannedPromises.length > 0) {
    return {
      state: 'BLOCKED',
      contradictions,
      bannedPromises,
      missingEvidence,
      reason: `Generic promise without evidence: ${bannedPromises.join(', ')}. Inspection has not actually started (no task id or evidence attached).`,
    };
  }

  return { state: 'READY', contradictions, bannedPromises, missingEvidence, reason: null };
}

/**
 * Build the replacement answer for a gated reply. Always carries exactly one
 * state header and the exact blocker / missing evidence / required action.
 */
export function buildReliabilityBlockedAnswer(input: {
  state: IVXIAState;
  reason: string;
  missingEvidence: string[];
  contradictions: string[];
  bannedPromises: string[];
}): string {
  const lines: string[] = [];
  lines.push(`STATE: ${input.state}`);
  lines.push('');

  if (input.contradictions.length > 0) {
    lines.push('CONTRADICTION DETECTED:');
    for (const c of input.contradictions) {
      lines.push(` - ${c}`);
    }
    lines.push('A success claim was retracted because a failure/waiting state appeared in the same reply.');
    lines.push('');
  }

  if (input.bannedPromises.length > 0) {
    lines.push('GENERIC PROMISE WITHOUT EVIDENCE:');
    for (const p of input.bannedPromises) {
      lines.push(` - "${p}"`);
    }
    lines.push('Inspection / execution has not actually started — no task id or evidence is attached to this turn.');
    lines.push('');
  }

  if (input.missingEvidence.length > 0) {
    lines.push('MISSING EVIDENCE:');
    for (const m of input.missingEvidence) {
      lines.push(` - ${m}`);
    }
    lines.push('');
  }

  lines.push(`REASON: ${input.reason}`);

  if (input.state === 'BLOCKED' || input.state === 'FAILED') {
    lines.push('');
    lines.push('REQUIRED ACTION:');
    if (input.missingEvidence.length > 0) {
      lines.push(` - Provide the missing evidence: ${input.missingEvidence.join(', ')}.`);
    }
    if (input.bannedPromises.length > 0) {
      lines.push(' - Run the real inspection / execution first, then reply with the task id and evidence.');
    }
    if (input.contradictions.length > 0) {
      lines.push(' - Pick exactly one status for this task. Do not assert Done and Blocked in the same reply.');
    }
    if (input.missingEvidence.length === 0 && input.bannedPromises.length === 0 && input.contradictions.length === 0) {
      lines.push(' - See the reason above and resolve the exact blocker.');
    }
  }

  if (input.state === 'WAITING_OWNER') {
    lines.push('');
    lines.push('REQUIRED ACTION:');
    lines.push(' - Sign in as the owner and explicitly authorize the guarded action to proceed.');
  }

  lines.push('');
  lines.push('UNVERIFIED — no success claim is valid without the evidence fields above.');
  return lines.join('\n');
}

/**
 * Apply the IVX IA Reliability Gate to a chat answer.
 *
 * The gate intervenes (rewrites the answer) when:
 *  - The answer contradicts itself (success + failure states together).
 *  - The answer makes a success claim without the required evidence.
 *  - The answer contains a banned generic promise with no evidence.
 *
 * Otherwise the answer passes through unchanged. The resolved state is always
 * returned so the caller can attach it to the response payload.
 */
export function applyIVXIAReliabilityGate(
  input: IVXIAReliabilityGateInput,
): IVXIAReliabilityGateResult {
  const answer = trimmed(input.answer);
  const resolution = resolveSingleState(answer, input.evidence);

  // Pass-through states: READY (no claim), VERIFIED (claim + full evidence),
  // and pure failure/waiting states that have NO contradictions, banned promises,
  // or missing evidence (e.g. an already-BLOCKED senior-developer answer).
  // We only intervene when there is an actual reliability violation to fix.
  const hasViolation =
    resolution.contradictions.length > 0
    || resolution.bannedPromises.length > 0
    || resolution.missingEvidence.length > 0;

  if (!hasViolation) {
    return {
      answer,
      gated: false,
      state: resolution.state,
      contradictions: resolution.contradictions,
      bannedPromises: resolution.bannedPromises,
      missingEvidence: resolution.missingEvidence,
      reason: resolution.reason,
    };
  }

  // Intervene: rewrite to a single-state, evidence-first blocked answer.
  const replacement = buildReliabilityBlockedAnswer({
    state: resolution.state,
    reason: resolution.reason ?? 'IVX IA reliability gate intervened.',
    missingEvidence: resolution.missingEvidence,
    contradictions: resolution.contradictions,
    bannedPromises: resolution.bannedPromises,
  });

  return {
    answer: replacement,
    gated: true,
    state: resolution.state,
    contradictions: resolution.contradictions,
    bannedPromises: resolution.bannedPromises,
    missingEvidence: resolution.missingEvidence,
    reason: resolution.reason,
  };
}
