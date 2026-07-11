/**
 * IVX Deployment Claim Gate.
 *
 * Root cause fixed by this module (owner-reported incident, 2026-07-10): the
 * IVX Owner AI chat returned fabricated deployment confirmations —
 * "**Deployment Proceeding**", "### Deployment Confirmation",
 * "Deployment ID: [AUTO-GENERATED]", "Commit SHA: [CURRENT SHA]",
 * "The changes are live", "Health Check: Passed successfully" — with NO real
 * execution behind them. Those replies came from the general chat-model path,
 * which was not covered by the developer-execution guard (that guard only runs
 * on routed development commands) and the senior-developer narrative gate was
 * only applied on the public-chat path.
 *
 * This gate is applied at the single choke point every visible Owner AI answer
 * passes through (`assertVisibleOwnerAIAnswer`), so no path can bypass it.
 *
 * Hard rules:
 *  - Placeholder proof values ([AUTO-GENERATED], [CURRENT SHA], [placeholder],
 *    bracketed deployment IDs / commit SHAs) are NEVER valid — they are blocked
 *    unconditionally, even when other text looks like evidence.
 *  - Deployment-success narratives ("Deployment Proceeding", "Deployment
 *    Confirmation", "The changes are live", "Health check passed",
 *    "successfully deployed") are blocked unless the answer carries REAL
 *    evidence: raw command output (`$ cmd ... exit code: N`) or a real commit
 *    hash / live health proof line.
 *  - The replacement answer states the honest deployment state
 *    (NOT_DEPLOYED) from the deployment state machine — never a success claim.
 *
 * Pure + deterministic (no I/O, network, or AI) so it is fully unit-testable.
 */

import { hasDeploymentProof, hasRawCommandOutput } from './ivx-developer-execution-guard';

export const IVX_DEPLOYMENT_CLAIM_GATE_MARKER = 'ivx-deployment-claim-gate-2026-07-10';

/**
 * Placeholder proof values. A real deployment report NEVER contains these —
 * they are template slots the model failed to fill with real tool output.
 * Blocked unconditionally.
 */
const PLACEHOLDER_DEPLOYMENT_VALUES: readonly { marker: RegExp; label: string }[] = [
  { marker: /\[auto[-\s_]?generated\]/i, label: 'placeholder deployment ID (AUTO-GENERATED)' },
  { marker: /\[current[-\s_]?sha\]/i, label: 'placeholder commit SHA (CURRENT SHA)' },
  { marker: /\[placeholder\]/i, label: 'literal placeholder token' },
  { marker: /\[pending\]/i, label: 'pending placeholder token' },
  { marker: /\[unknown\]/i, label: 'unknown placeholder token' },
  { marker: /\[example[^\]]*\]/i, label: 'example placeholder token' },
  { marker: /\b(?:deployment|deploy)\s*id\s*:?\**\s*\[[^\]]*\]/i, label: 'bracketed deployment ID slot' },
  { marker: /\bcommit(?:\s*sha)?\s*:?\**\s*\[[^\]]*\]/i, label: 'bracketed commit SHA slot' },
  // Owner spec (2026-07-11) Step 4: evidence fields may never carry these
  // template values. "Deployment ID: MOCK", "Commit SHA: SIMULATED",
  // "Deploy status: AUTO-GENERATED" etc. block unconditionally.
  {
    marker: /\b(?:deployment\s*id|deploy\s*id|commit(?:\s*sha)?|branch|push\s*status|deploy(?:ment)?\s*status|health(?:\s*(?:check|endpoint|status))?|runtime\s*version|running\s*commit)\s*:?\**\s*(?:auto[-\s_]?generated|unknown|pending|placeholder|mock(?:ed)?|narrative|generated|simulated|estimated|assumed)\b/i,
    label: 'forbidden evidence value (AUTO-GENERATED/UNKNOWN/PENDING/PLACEHOLDER/MOCK/NARRATIVE/GENERATED/SIMULATED/ESTIMATED/ASSUMED)',
  },
];

/**
 * Fabricated deployment-confirmation narratives. Blocked when the answer lacks
 * real execution evidence. Sourced from the exact bad responses the owner
 * reported from the live chat.
 */
const FAKE_DEPLOYMENT_CONFIRMATIONS: readonly { marker: RegExp; label: string }[] = [
  { marker: /deployment\s+proceeding/i, label: 'Deployment Proceeding template' },
  { marker: /deployment\s+confirmation/i, label: 'Deployment Confirmation template' },
  { marker: /the\s+changes\s+are\s+(?:now\s+)?live/i, label: 'fabricated changes-are-live claim' },
  { marker: /changes\s+have\s+been\s+successfully\s+deployed/i, label: 'fabricated deployed-successfully claim' },
  { marker: /successfully\s+deployed\s+to\s+(?:production|prod|render|live)/i, label: 'fabricated deployed-to-production claim' },
  { marker: /health\s+check(?:s)?\s*:?\**\s*(?:passed|✅)/i, label: 'Health check passed claim' },
  { marker: /health\s+check(?:s)?\s+passed\s+successfully/i, label: 'Health check passed successfully claim' },
  { marker: /running\s+post-?deployment\s+health\s+checks/i, label: 'post-deployment health checks narrative' },
  { marker: /deploying\s+(?:changes\s+)?(?:now\s+)?(?:to\s+production|based\s+on\s+your\s+approval)/i, label: 'deploying-now narrative' },
  // Owner spec (2026-07-11) Step 0: prohibited narrative phrases. Blocked
  // unless the answer carries REAL execution evidence.
  { marker: /deployment\s+(?:was\s+|is\s+|has\s+been\s+)?successful/i, label: 'fabricated Deployment successful claim' },
  { marker: /\bsuccessfully\s+deployed\b/i, label: 'fabricated Successfully deployed claim' },
  { marker: /build\s+(?:was\s+|is\s+|has\s+been\s+)?(?:completed|successful)/i, label: 'fabricated Build completed claim' },
  { marker: /changes\s+(?:were\s+|have\s+been\s+|are\s+)?applied/i, label: 'fabricated Changes applied claim' },
  { marker: /production\s+(?:was\s+|is\s+|has\s+been\s+)?updated/i, label: 'fabricated Production updated claim' },
  { marker: /\blive\s+on\s+render\b/i, label: 'fabricated Live on Render claim' },
  { marker: /\bfix\s+(?:is\s+)?complete\b/i, label: 'fabricated Fix complete claim' },
];

/** Placeholder proof values present in an answer. Pure — deterministic. */
export function findPlaceholderDeploymentValues(answer: string): string[] {
  const text = typeof answer === 'string' ? answer : '';
  return PLACEHOLDER_DEPLOYMENT_VALUES.filter(({ marker }) => marker.test(text)).map(({ label }) => label);
}

/** Fabricated deployment-confirmation markers present in an answer. Pure. */
export function findFakeDeploymentConfirmations(answer: string): string[] {
  const text = typeof answer === 'string' ? answer : '';
  return FAKE_DEPLOYMENT_CONFIRMATIONS.filter(({ marker }) => marker.test(text)).map(({ label }) => label);
}

/**
 * Real deployment evidence: raw command output (`$ cmd ... exit code: N`) or a
 * real commit hash / live health proof line. Only answers produced by the real
 * execution pipeline contain these.
 */
export function hasRealDeploymentEvidence(answer: string): boolean {
  const text = typeof answer === 'string' ? answer : '';
  return hasRawCommandOutput(text) || hasDeploymentProof(text);
}

/**
 * The honest replacement returned when a fake deployment narrative is blocked.
 * States the true deployment-state-machine position (NOT_DEPLOYED) and the only
 * valid path to a COMPLETE status. Never contains a success claim.
 */
export function buildRejectedDeploymentNarrativeAnswer(violations: string[]): string {
  const reasons = violations.length > 0 ? violations.map((v) => ` - ${v}`).join('\n') : ' - fabricated deployment narrative';
  return [
    `GATE=${IVX_DEPLOYMENT_CLAIM_GATE_MARKER}`,
    'DEPLOYMENT_STATE=NOT_DEPLOYED',
    'FINAL_STATUS=BLOCKED_FAKE_DEPLOYMENT_NARRATIVE',
    `REASON=The generated reply claimed deployment success without real execution evidence. Rejected markers:\n${reasons}`,
    'REQUIRED_EVIDENCE=real GitHub commit SHA, real branch, real push result, real Render deployment ID and status, production URL, /health HTTP status, live commit from /version, and an exact GitHub-to-production commit match.',
    'EXACT_ACTION_REQUIRED=Run the real Senior Developer pipeline (Admin → IVX Developer Workspace → Patches → Run Senior Developer). Deployment may only be reported from its recorded evidence — never from generated text.',
  ].join('\n');
}

export type DeploymentClaimGateResult = {
  /** The answer to return (rewritten when the gate intervenes). */
  answer: string;
  /** Whether the gate replaced the answer. */
  gated: boolean;
  /** The violations that triggered the gate. */
  violations: string[];
};

/**
 * Apply the Deployment Claim Gate to a visible chat answer.
 *
 *  - Placeholder proof values block unconditionally.
 *  - Fake deployment confirmations block unless real evidence is present.
 *  - Idempotent: a previously gated answer (carrying the gate marker) passes.
 *
 * Pure — deterministic, no I/O.
 */
export function applyDeploymentClaimGate(input: { answer: string }): DeploymentClaimGateResult {
  const text = typeof input.answer === 'string' ? input.answer : '';

  // Idempotency sentinel — the honest blocked answer quotes violation labels
  // and must never re-trigger the gate on itself.
  if (text.includes(IVX_DEPLOYMENT_CLAIM_GATE_MARKER)) {
    return { answer: text, gated: false, violations: [] };
  }

  const placeholderViolations = findPlaceholderDeploymentValues(text);
  const confirmationViolations = findFakeDeploymentConfirmations(text);

  // Placeholders are never valid, evidence or not.
  if (placeholderViolations.length > 0) {
    const violations = [...placeholderViolations, ...confirmationViolations];
    return { answer: buildRejectedDeploymentNarrativeAnswer(violations), gated: true, violations };
  }

  // Deployment-success narratives require real evidence.
  if (confirmationViolations.length > 0 && !hasRealDeploymentEvidence(text)) {
    return {
      answer: buildRejectedDeploymentNarrativeAnswer(confirmationViolations),
      gated: true,
      violations: confirmationViolations,
    };
  }

  return { answer: text, gated: false, violations: [] };
}
