/**
 * Runtime-free client-side classifier for the LATEST owner message.
 *
 * The owner-gated `/api/ivx/owner-ai` route runs the BLOCK 28 intent router
 * (exact-echo + execution/task-block detection) server-side. But when the
 * in-app owner session is not privileged the owner route returns 401/403 and
 * the client recovers via the no-auth `/public/chat` generic deal-intelligence
 * engine (BLOCK 13). That generic engine CANNOT execute tasks, run the intent
 * router, or echo verbatim — so a task command answered via the fallback comes
 * back as an unrelated generic deal answer ("fake chat that doesn't match my
 * request").
 *
 * This module mirrors the two backend detectors so the client can recognise
 * those command classes BEFORE handing them to the generic fallback and avoid
 * the mismatch. It has ZERO runtime imports so it stays unit-testable without
 * the app bundle, Supabase, or the network.
 *
 * Source of truth (kept in sync): `backend/services/ivx-owner-ai-intent-router.ts`
 *   - `resolveExactEchoCommand`
 *   - `isOwnerExecutionOrTaskBlock`
 */

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministic exact-echo command detector (BLOCK 28 acceptance test B).
 * Returns the exact payload to echo VERBATIM (original casing preserved), or null.
 */
export function resolveExactEchoCommand(prompt: string): string | null {
  const raw = prompt.trim();
  if (!raw) {
    return null;
  }
  const match = raw.match(
    /^(?:please\s+)?(?:reply|respond|answer|say|repeat|echo|output|return|print)\s+(?:back\s+)?exactly(?:\s+with)?\s*[:\-]?\s*([\s\S]+)$/i,
  );
  if (!match) {
    return null;
  }
  let payload = match[1].trim();
  const quoted = payload.match(/^(["'\u201c\u2018])([\s\S]+)(["'\u201d\u2019])$/);
  if (quoted) {
    payload = quoted[2].trim();
  }
  return payload.length > 0 ? payload : null;
}

/**
 * Detects a long, structured owner EXECUTION command or task block (e.g.
 * "BLOCK 28 Visitor-to-Investor Conversion Engine / Create: ... / Track: ...").
 * These must NEVER be answered by the generic /public/chat fallback, which
 * cannot execute them and produces an unrelated generic reply.
 */
export function isOwnerExecutionOrTaskBlock(prompt: string): boolean {
  const raw = prompt.trim();
  if (!raw) {
    return false;
  }
  const normalized = normalizePrompt(prompt);

  if (/\b(block|step|phase)\s*\d+\b/.test(normalized)) {
    return true;
  }

  const specMarkerCount = (raw.match(
    /^\s*(create|track|stages?|capabilities|dashboard|requirements?|safety|store|return|show|build|objective|audit|capabilities?|metrics?)\s*:/gim,
  ) ?? []).length;
  if (specMarkerCount >= 2) {
    return true;
  }

  const lineCount = raw.split(/\n/).filter((line) => line.trim().length > 0).length;
  if (raw.length >= 320 && lineCount >= 4) {
    return true;
  }

  if (
    raw.length >= 90
    && /\b(engine|system|pipeline|module|platform|dashboard|workflow)\b/.test(normalized)
    && /\b(create|build|implement|add|wire|ship|deploy|design|develop)\b/.test(normalized)
  ) {
    return true;
  }

  return false;
}

export type OwnerCommandClass = 'exact_echo' | 'execution_task_block' | 'conversational';

export type OwnerCommandClassification = {
  commandClass: OwnerCommandClass;
  /** Verbatim payload for exact-echo commands, else null. */
  echoPayload: string | null;
  /**
   * True when the generic /public/chat fallback would produce a mismatched
   * answer for this message (exact-echo or execution/task block) and must NOT
   * be used as-is.
   */
  requiresPrivilegedExecution: boolean;
};

/**
 * Classify the LATEST owner message into the command class that determines
 * whether the generic /public/chat fallback is appropriate.
 */
export function classifyLatestOwnerCommand(message: string): OwnerCommandClassification {
  const echoPayload = resolveExactEchoCommand(message);
  if (echoPayload !== null) {
    return { commandClass: 'exact_echo', echoPayload, requiresPrivilegedExecution: true };
  }
  if (isOwnerExecutionOrTaskBlock(message)) {
    return { commandClass: 'execution_task_block', echoPayload: null, requiresPrivilegedExecution: true };
  }
  return { commandClass: 'conversational', echoPayload: null, requiresPrivilegedExecution: false };
}
