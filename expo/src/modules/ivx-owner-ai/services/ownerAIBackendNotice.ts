/**
 * Owner AI transient backend-notice detection (pure, runtime-free).
 *
 * The owner-AI request layer NEVER throws on a backend hiccup; instead it
 * completes the request with a plain, recoverable notice (e.g. "the backend
 * replied, but I couldn't read its response", rate-limited, 5xx, streaming
 * dropped). These notices are render-only and must never overwrite or follow a
 * REAL answer that already arrived for the same turn.
 *
 * The screenshot bug: the backend persisted the real task report server-side
 * (persistAssistantMessage), AND the client's streaming path synthesized an
 * empty final body that failed to parse — producing a second "couldn't read its
 * response" bubble right after the real report. This module lets the chat
 * recognize such a notice and suppress it when a genuine reply is already
 * present.
 */

/**
 * Canonical fragments of the recoverable, non-answer notices produced by
 * `buildOwnerAIBackendErrorResponse`. Matching is case-insensitive and on a
 * normalized (curly-quote-folded) copy so the parse/rate-limit/5xx notices are
 * detected regardless of the apostrophe variant the runtime emitted.
 */
const TRANSIENT_NOTICE_FRAGMENTS: readonly string[] = [
  "couldn't read its response",
  'could not read its response',
  'replied, but i',
  'rate-limited right now',
  'too many requests',
  'route returned',
  'route not available',
  'hit a server error',
  'backend rejected the request',
  'streaming connection to ivx owner ai dropped',
  'please resend',
];

function normalizeNoticeText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True when `text` is one of the recoverable, render-only backend notices
 * (parse error / rate-limit / 5xx / dropped stream) rather than a real answer.
 */
export function isTransientOwnerAIBackendNotice(text: unknown): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  const normalized = normalizeNoticeText(text);
  if (!normalized) {
    return false;
  }
  return TRANSIENT_NOTICE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Decide whether a freshly returned answer should be suppressed because it is a
 * transient backend notice AND a real assistant reply for this turn already
 * exists in the transcript. Suppressing prevents the "success reply followed by
 * a contradicting error" double bubble.
 */
export function shouldSuppressOwnerAIBackendNotice(input: {
  answer: string;
  hasExistingAssistantReply: boolean;
}): boolean {
  return input.hasExistingAssistantReply && isTransientOwnerAIBackendNotice(input.answer);
}
