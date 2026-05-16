/**
 * AI request reliability layer for the IVX Owner AI chat path.
 *
 * Wraps `ivxAIRequestService.requestOwnerAI` (single-shot HTTP) with:
 *   1. Per-conversation in-flight cancellation (sending a new message or
 *      navigating away cancels the previous request cleanly).
 *   2. Overall request timeout (default 45s) via AbortController.
 *   3. Exponential-backoff retry on transient failures only
 *      (network unreachable, 429, 5xx, `service_unavailable_html`).
 *   4. Honest, log-only retry trace so the runtime dashboard can show
 *      attempts without leaking secrets.
 *
 * This module is deliberately backend-agnostic. When the streaming
 * `/api/ivx/owner-ai/stream` route lands in production it will plug in
 * here by replacing the inner call without touching callers.
 */

/**
 * Note: We intentionally do NOT import `IVXOwnerAIRequestError` or
 * `getIVXOwnerAIErrorDiagnostics` from the heavy `ivxAIRequestService`
 * module (it transitively pulls in `react-native`, which breaks the
 * bun-test runtime). Instead we duck-type the diagnostics shape that
 * the service attaches to its thrown errors.
 */

type DiagnosticsLike = {
  classification?: string | null;
  statusCode?: number | null;
};

function readDiagnostics(error: unknown): DiagnosticsLike | null {
  if (!error || typeof error !== 'object') return null;
  const diag = (error as { diagnostics?: unknown }).diagnostics;
  if (!diag || typeof diag !== 'object') return null;
  return diag as DiagnosticsLike;
}

function isIVXOwnerAIRequestError(error: unknown): error is { reliabilityTrace?: ReliabilityTrace } {
  return !!error && typeof error === 'object' && (error as { name?: string }).name === 'IVXOwnerAIRequestError';
}

export type RetryClassification =
  | 'retry'
  | 'no_retry'
  | 'abort';

export type ReliabilityAttempt = {
  attempt: number;
  delayMs: number;
  classification: RetryClassification;
  reason: string;
  statusCode: number | null;
};

export type ReliabilityTrace = {
  conversationId: string;
  attempts: ReliabilityAttempt[];
  totalElapsedMs: number;
  finalOutcome: 'ok' | 'aborted' | 'failed';
};

export type ReliabilityOptions = {
  /** Caller-provided AbortSignal (e.g. user navigated away). */
  signal?: AbortSignal;
  /** Total budget across all attempts. Default 45_000. */
  totalTimeoutMs?: number;
  /** Max attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms. Default 600. Doubles each attempt. */
  baseDelayMs?: number;
  /** Max single backoff in ms. Default 4_000. */
  maxDelayMs?: number;
};

const DEFAULTS = {
  totalTimeoutMs: 45_000,
  maxAttempts: 3,
  baseDelayMs: 600,
  maxDelayMs: 4_000,
} as const;

/**
 * Pure classifier — given an error from `requestOwnerAI`, decide whether
 * the next attempt should run. Exported for unit tests.
 */
export function classifyForRetry(error: unknown): { retry: boolean; reason: string; statusCode: number | null } {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { retry: false, reason: 'abort', statusCode: null };
  }

  const diagnostics = readDiagnostics(error);
  const status = diagnostics?.statusCode ?? null;
  const classification = diagnostics?.classification ?? null;

  // Transient HTTP — retry.
  if (status === 429 || (typeof status === 'number' && status >= 500 && status <= 599)) {
    return { retry: true, reason: `transient_http_${status}`, statusCode: status };
  }

  // HTML / service unavailable responses (e.g. Render cold-start, edge cache miss) — retry.
  if (classification === 'service_unavailable_html') {
    return { retry: true, reason: 'service_unavailable_html', statusCode: status };
  }

  // Network unreachable / timeouts — retry.
  if (classification === 'network_unreachable') {
    return { retry: true, reason: 'network_unreachable', statusCode: status };
  }

  // Auth / 4xx / response_invalid — do not retry.
  if (diagnostics) {
    return { retry: false, reason: classification ?? 'non_transient', statusCode: status };
  }

  // Unknown error shape — fall back to a single non-retry.
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('timed out')
    || message.includes('timeout')
  ) {
    return { retry: true, reason: 'network_unreachable', statusCode: null };
  }
  return { retry: false, reason: 'unknown', statusCode: null };
}

/**
 * Compute exponential backoff with full jitter, bounded by `maxDelayMs`.
 * Exported for unit tests.
 */
export function computeBackoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number = Math.random): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.floor(random() * exp);
}

type InFlightEntry = { controller: AbortController; startedAt: number };
const inFlight = new Map<string, InFlightEntry>();

/** Cancel any in-flight reliable AI request for a conversation. */
export function cancelInFlightAIRequest(conversationId: string, reason: string = 'superseded'): void {
  const entry = inFlight.get(conversationId);
  if (!entry) return;
  console.log('[AIReliability] Cancelling in-flight request:', { conversationId, reason });
  try { entry.controller.abort(); } catch (e) { console.log('[AIReliability] abort threw:', (e as Error)?.message); }
  inFlight.delete(conversationId);
}

/** Current number of in-flight reliable requests (for diagnostics). */
export function getInFlightAIRequestCount(): number {
  return inFlight.size;
}

function combineSignals(external: AbortSignal | undefined, internal: AbortSignal): AbortSignal {
  if (!external) return internal;
  const ctrl = new AbortController();
  const onInternal = () => ctrl.abort((internal as AbortSignal & { reason?: unknown }).reason);
  const onExternal = () => ctrl.abort((external as AbortSignal & { reason?: unknown }).reason);
  if (internal.aborted) ctrl.abort();
  else internal.addEventListener('abort', onInternal, { once: true });
  if (external.aborted) ctrl.abort();
  else external.addEventListener('abort', onExternal, { once: true });
  return ctrl.signal;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export type ReliableExecutor<T> = (signal: AbortSignal, attempt: number) => Promise<T>;

/**
 * Execute an AI request with reliability guarantees. Returns the resolved
 * value and an attached trace (also logged). Throws the last underlying
 * error on failure (preserving `IVXOwnerAIRequestError` diagnostics).
 */
export async function executeReliably<T>(
  conversationId: string,
  executor: ReliableExecutor<T>,
  options: ReliabilityOptions = {},
): Promise<{ value: T; trace: ReliabilityTrace }> {
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULTS.totalTimeoutMs;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULTS.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;

  cancelInFlightAIRequest(conversationId, 'new_request');

  const overallController = new AbortController();
  const startedAt = Date.now();
  const timeoutTimer = setTimeout(() => overallController.abort(new DOMException('Total timeout exceeded', 'AbortError')), totalTimeoutMs);
  inFlight.set(conversationId, { controller: overallController, startedAt });

  const attempts: ReliabilityAttempt[] = [];
  const combined = combineSignals(options.signal, overallController.signal);

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (combined.aborted) {
        attempts.push({ attempt, delayMs: 0, classification: 'abort', reason: 'aborted_before_attempt', statusCode: null });
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        const value = await executor(combined, attempt);
        attempts.push({ attempt, delayMs: 0, classification: 'no_retry', reason: 'ok', statusCode: null });
        const trace: ReliabilityTrace = {
          conversationId,
          attempts,
          totalElapsedMs: Date.now() - startedAt,
          finalOutcome: 'ok',
        };
        console.log('[AIReliability] success', { conversationId, attempt, totalElapsedMs: trace.totalElapsedMs });
        return { value, trace };
      } catch (error) {
        const decision = classifyForRetry(error);
        const isLast = attempt >= maxAttempts;
        const shouldRetry = decision.retry && !isLast && !combined.aborted;

        if (!shouldRetry) {
          attempts.push({
            attempt,
            delayMs: 0,
            classification: decision.reason === 'abort' ? 'abort' : 'no_retry',
            reason: decision.reason,
            statusCode: decision.statusCode,
          });
          const trace: ReliabilityTrace = {
            conversationId,
            attempts,
            totalElapsedMs: Date.now() - startedAt,
            finalOutcome: decision.reason === 'abort' ? 'aborted' : 'failed',
          };
          console.log('[AIReliability] giving up', { conversationId, attempt, reason: decision.reason, statusCode: decision.statusCode, totalElapsedMs: trace.totalElapsedMs });
          if (isIVXOwnerAIRequestError(error)) {
            (error as { reliabilityTrace?: ReliabilityTrace }).reliabilityTrace = trace;
          }
          throw error;
        }

        const backoff = computeBackoffMs(attempt, baseDelayMs, maxDelayMs);
        attempts.push({ attempt, delayMs: backoff, classification: 'retry', reason: decision.reason, statusCode: decision.statusCode });
        console.log('[AIReliability] retrying', { conversationId, attempt, nextDelayMs: backoff, reason: decision.reason, statusCode: decision.statusCode });
        await delay(backoff, combined);
      }
    }
    // Unreachable: loop always returns or throws.
    throw new Error('AI reliability loop exited unexpectedly.');
  } finally {
    clearTimeout(timeoutTimer);
    const entry = inFlight.get(conversationId);
    if (entry && entry.controller === overallController) inFlight.delete(conversationId);
  }
}
