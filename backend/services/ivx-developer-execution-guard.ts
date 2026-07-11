/**
 * IVX Developer Execution Output Guard
 *
 * Final safety net for the self-developer route. The router already sends
 * development commands to the senior-developer runtime, and
 * `buildSeniorDeveloperExecutionAnswer` already renders the strict evidence
 * format. This module is the LAST line of defence: it inspects the answer that
 * is about to be returned to the owner and BLOCKS it when it is narrative-only
 * or makes a claim it has not proven.
 *
 * Hard rules enforced here (owner spec):
 *   - No narrative-only answers. The strict section headers must be present.
 *   - No "reviewed/prepared/initialized/awaiting approval/development phase/
 *     schema planning" prose unless real proof (raw command output) is present.
 *   - No "verified" claim without raw command output (`$ ... exit code:`).
 *   - No "deployed" claim without a live endpoint / commit proof line.
 *   - No "done/complete" claim without a real file diff.
 *
 * Pure and deterministic (no network / filesystem / AI) so it is fully unit
 * testable.
 */

/**
 * Sentinel embedded in a guard-blocked answer. When present (together with a
 * BLOCKED status and NO CODE CHANGED), the answer is a recognised compliant
 * terminal state: it makes no success claims, so validation must not re-trigger
 * on the violation reasons it quotes (which legitimately mention words like
 * "verified"/"deployed"). This keeps the guard idempotent.
 */
export const DEVELOPER_EXECUTION_GUARD_MARKER = 'failed developer-execution enforcement';

/** Section headers every development-task answer must contain, in order. */
export const REQUIRED_DEVELOPER_SECTIONS: readonly string[] = [
  'TASK UNDERSTOOD:',
  'FILES INSPECTED:',
  'FILES CHANGED:',
  'COMMANDS RUN:',
  'TEST RESULT:',
  'TYPECHECK RESULT:',
  'STATUS:',
  'PROOF:',
];

/**
 * Narrative phrases the owner explicitly banned. They are only allowed when the
 * answer also carries real proof (raw command output), because a genuine run can
 * legitimately say e.g. "reviewed" alongside the evidence.
 */
export const BANNED_NARRATIVE_PHRASES: readonly string[] = [
  'i reviewed',
  'i have reviewed',
  'i prepared',
  'i have prepared',
  'i initialized',
  'i have initialized',
  'i will begin',
  'i will start',
  // Promise-only / future-tense execution claims the owner explicitly banned.
  // A real run reports past-tense facts with raw proof; these say work "will"
  // happen and must be BLOCKED unless raw command output accompanies them.
  'starting implementation',
  'starting the implementation',
  'starting development verification',
  'i will inspect',
  'i will patch',
  'i will validate',
  'i will fix',
  'i will implement',
  'i will return proof',
  "i'll inspect",
  "i'll patch",
  "i'll validate",
  "i'll fix",
  "i'll implement",
  "i'll return proof",
  'and return only files changed',
  'awaiting approval',
  'development phase',
  'schema planning',
  'once approved',
  'i am ready to',
  'i would',
  'next, i will',
  // Planner / chat-template narrative headers the owner keeps seeing instead of
  // real execution. These are the exact phrases reported from the IVX Owner AI
  // chat path and must never reach the owner without real command proof.
  'architecture proposal',
  'execution plan',
  'implementation plan',
  'development plan',
  'initial actions',
  'next steps required',
  'next steps:',
  'i will proceed',
  'i will now proceed',
  'i will then',
  'phase 1',
  'phase 2',
  'phase 3',
  'phase 4',
];

/**
 * Placeholder proof values. A real execution report NEVER contains these —
 * they are unfilled template slots ([AUTO-GENERATED], [CURRENT SHA], …) and are
 * rejected unconditionally, even when raw command output is also present.
 * Sourced from the owner-reported live incident (2026-07-10).
 */
export const PLACEHOLDER_PROOF_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\[auto[-\s_]?generated\]/i, label: 'AUTO-GENERATED placeholder' },
  { pattern: /\[current[-\s_]?sha\]/i, label: 'CURRENT SHA placeholder' },
  { pattern: /\[placeholder\]/i, label: 'literal placeholder token' },
  { pattern: /\[pending\]/i, label: 'pending placeholder token' },
  { pattern: /\[unknown\]/i, label: 'unknown placeholder token' },
  { pattern: /\b(?:deployment|deploy)\s*id\s*:?\**\s*\[[^\]]*\]/i, label: 'bracketed deployment ID slot' },
  { pattern: /\bcommit(?:\s*sha)?\s*:?\**\s*\[[^\]]*\]/i, label: 'bracketed commit SHA slot' },
];

/** Placeholder proof values present in an answer. Pure — deterministic. */
export function findPlaceholderProofValues(answer: string): string[] {
  const text = answer ?? '';
  return PLACEHOLDER_PROOF_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

export type DeveloperExecutionGuardResult = {
  ok: boolean;
  violations: string[];
  hasAllSections: boolean;
  hasRawCommandOutput: boolean;
};

/** Raw command output looks like `$ <cmd> ... exit code: N`. */
export function hasRawCommandOutput(answer: string): boolean {
  const text = answer ?? '';
  const hasCommandLine = /^\s*\$\s+\S+/m.test(text);
  const hasExitCode = /\bexit\s+code:\s*\S+/i.test(text) || /→\s*exit\s+\S+/i.test(text);
  return hasCommandLine && hasExitCode;
}

/** A positive "verified" claim (not the allowed "NOT VERIFIED — ..." line). */
export function claimsVerified(answer: string): boolean {
  const text = (answer ?? '').toLowerCase();
  // Strip the explicit honest negatives so they never count as a claim.
  const stripped = text
    .replace(/not\s+verified[^\n]*/g, '')
    .replace(/typecheck\s+result:/g, '')
    .replace(/test\s+result:/g, '');
  return /\bverified\b|\bverification\s+passed\b|\ball\s+checks\s+pass(?:ed)?\b/.test(stripped);
}

/** A "deployed/live in production" claim. */
export function claimsDeployed(answer: string): boolean {
  const text = (answer ?? '').toLowerCase();
  const stripped = text
    .replace(/local\s+only/g, '')
    .replace(/not\s+deployed/g, '')
    .replace(/deploy\s+attempted/g, '');
  return /\bstatus:\s*\n?\s*deployed\b/.test(stripped)
    || /\bdeployed\s+to\s+(?:prod|production|live|render)\b/.test(stripped)
    || /\blive\s+in\s+production\b/.test(stripped);
}

/** A "done/complete/finished" success claim. */
export function claimsDone(answer: string): boolean {
  const text = (answer ?? '').toLowerCase();
  const stripped = text.replace(/no\s+development\s+was\s+completed/g, '');
  return /\b(?:task\s+)?(?:done|completed|complete|finished|shipped)\b/.test(stripped);
}

/** True when the answer proves a real file diff (changed paths in PROOF). */
export function hasFileDiffProof(answer: string): boolean {
  const text = answer ?? '';
  if (/NO CODE CHANGED/.test(text)) {
    return false;
  }
  // git diff --stat (applied patch) followed by a " path | summary" line, or a
  // git status --short " M path" line.
  return /git\s+diff\s+--stat[^\n]*\n\s*\S+\s*\|/i.test(text)
    || /git\s+status\s+--short:[\s\S]*\n\s*[AM]\s+\S+/i.test(text);
}

/** True when a live endpoint / commit proof line is present. */
export function hasDeploymentProof(answer: string): boolean {
  const text = answer ?? '';
  return /\bcommit:\s*[0-9a-f]{6,}/i.test(text)
    || /production\s+\/health:\s*healthy/i.test(text)
    || /changed\s+route:\s*live/i.test(text);
}

/**
 * Validate that a candidate answer is a real developer-execution response and not
 * narrative-only or an unproven claim.
 */
export function validateDeveloperExecutionAnswer(answer: string): DeveloperExecutionGuardResult {
  const text = answer ?? '';

  // A guard-blocked answer is a recognised compliant terminal state. It carries
  // the sentinel marker, a BLOCKED status, and NO CODE CHANGED — it makes no
  // success claims, so it passes without re-triggering on the violation reasons
  // it quotes. This guarantees enforcement is idempotent.
  if (text.includes(DEVELOPER_EXECUTION_GUARD_MARKER) && /STATUS:\s*\n?\s*BLOCKED/.test(text) && text.includes('NO CODE CHANGED')) {
    return { ok: true, violations: [], hasAllSections: true, hasRawCommandOutput: false };
  }

  const violations: string[] = [];

  const missingSections = REQUIRED_DEVELOPER_SECTIONS.filter((header) => !text.includes(header));
  const hasAllSections = missingSections.length === 0;
  if (!hasAllSections) {
    violations.push(`missing required sections: ${missingSections.join(', ')}`);
  }

  const rawOutput = hasRawCommandOutput(text);

  // Placeholder proof values are NEVER valid — rejected even when raw command
  // output is also present. A template slot is not evidence.
  for (const label of findPlaceholderProofValues(text)) {
    violations.push(`placeholder proof value: ${label}`);
  }

  // Banned narrative phrases are only tolerated when real proof accompanies them.
  if (!rawOutput) {
    const lower = text.toLowerCase();
    for (const phrase of BANNED_NARRATIVE_PHRASES) {
      if (lower.includes(phrase)) {
        violations.push(`narrative phrase without proof: "${phrase}"`);
      }
    }
  }

  if (claimsVerified(text) && !rawOutput) {
    violations.push('claims "verified" without raw command output');
  }

  if (claimsDeployed(text) && !hasDeploymentProof(text)) {
    violations.push('claims "deployed" without live endpoint / commit proof');
  }

  if (claimsDone(text) && !hasFileDiffProof(text)) {
    violations.push('claims "done/complete" without a real file diff');
  }

  return {
    ok: violations.length === 0,
    violations,
    hasAllSections,
    hasRawCommandOutput: rawOutput,
  };
}

/**
 * Replacement message returned to the owner when a development answer fails the
 * guard. Keeps the strict format so the client renders it consistently and the
 * owner immediately sees it was blocked rather than a fake success.
 */
export function buildBlockedDeveloperExecutionAnswer(violations: string[]): string {
  const reasons = violations.length > 0 ? violations.map((v) => ` - ${v}`).join('\n') : ' - narrative-only response blocked';
  return [
    `TASK UNDERSTOOD:\nDevelopment-task response blocked by the execution guard (${DEVELOPER_EXECUTION_GUARD_MARKER}).`,
    'FILES INSPECTED:\nnone — output rejected before delivery.',
    'FILES CHANGED:\nNO CODE CHANGED — no development was completed.',
    'COMMANDS RUN:\nNONE — no commands were executed.',
    'TEST RESULT:\nNOT VERIFIED — tests were not run.',
    'TYPECHECK RESULT:\nNOT VERIFIED — typecheck was not run.',
    'STATUS:\nBLOCKED',
    `PROOF:\nBLOCKED — the generated answer ${DEVELOPER_EXECUTION_GUARD_MARKER}:\n${reasons}`,
  ].join('\n\n');
}

/**
 * Enforce developer-execution mode on a candidate answer. Returns the original
 * answer when it passes, otherwise a BLOCKED replacement. Never lets a
 * narrative-only / unproven answer reach the owner.
 */
export function enforceDeveloperExecutionAnswer(answer: string): {
  answer: string;
  enforced: boolean;
  result: DeveloperExecutionGuardResult;
} {
  const result = validateDeveloperExecutionAnswer(answer);
  if (result.ok) {
    return { answer, enforced: false, result };
  }
  return {
    answer: buildBlockedDeveloperExecutionAnswer(result.violations),
    enforced: true,
    result,
  };
}
