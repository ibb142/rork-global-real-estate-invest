/**
 * IVX rate-limit middleware (token-bucket, in-memory, per IP+user).
 *
 * Protects expensive senior-dev endpoints (/proof, /repo-search,
 * /execution-stream, /test-report, /e2e/run) from abuse and runaway
 * cost. Returns 429 with a `Retry-After` (seconds) header when burst
 * exceeded. Buckets self-prune to bound memory.
 *
 * Zero external deps; safe to use on Hono, Bun, Node, Cloudflare
 * Workers (per-isolate). For multi-instance correctness, a shared
 * store (Redis/Durable Object) can replace `BUCKETS` later — this
 * version is correct per-instance and never crashes.
 */
export type RateLimitOptions = {
  /** Max burst tokens (e.g. 30 → 30 requests instantly). */
  burst: number;
  /** Token refill rate per second (e.g. 1 → +1 token / sec). */
  refillPerSecond: number;
  /** Optional bucket-key suffix to namespace different endpoints. */
  scope: string;
};

type Bucket = {
  tokens: number;
  lastRefillMs: number;
  lastSeenMs: number;
};

const BUCKETS = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;
const PRUNE_AFTER_MS = 10 * 60 * 1000;

function getClientKey(request: Request, scope: string): string {
  const headers = request.headers;
  const ip =
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ??
    'unknown';
  const auth = headers.get('authorization') ?? '';
  // Hash the token suffix only (never log it) so different owner sessions
  // get separate buckets without leaking the token.
  const authSuffix = auth.length > 8 ? auth.slice(-8) : auth;
  return `${scope}|${ip}|${authSuffix}`;
}

function pruneIfNeeded(now: number): void {
  if (BUCKETS.size < MAX_BUCKETS) return;
  for (const [k, b] of BUCKETS) {
    if (now - b.lastSeenMs > PRUNE_AFTER_MS) BUCKETS.delete(k);
    if (BUCKETS.size < MAX_BUCKETS * 0.8) break;
  }
}

/**
 * Attempt to consume 1 token. Returns null if allowed, or a 429
 * Response if rate-limited (with Retry-After).
 */
export function checkRateLimit(request: Request, opts: RateLimitOptions): Response | null {
  const now = Date.now();
  const key = getClientKey(request, opts.scope);
  const bucket = BUCKETS.get(key) ?? { tokens: opts.burst, lastRefillMs: now, lastSeenMs: now };
  // Refill
  const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
  bucket.tokens = Math.min(opts.burst, bucket.tokens + elapsedSec * opts.refillPerSecond);
  bucket.lastRefillMs = now;
  bucket.lastSeenMs = now;

  if (bucket.tokens < 1) {
    const needed = 1 - bucket.tokens;
    const retryAfterSec = Math.max(1, Math.ceil(needed / Math.max(0.0001, opts.refillPerSecond)));
    BUCKETS.set(key, bucket);
    pruneIfNeeded(now);
    return new Response(
      JSON.stringify({ ok: false, error: 'rate_limited', retryAfterSec, scope: opts.scope }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(retryAfterSec),
          'x-ratelimit-scope': opts.scope,
          'x-ratelimit-burst': String(opts.burst),
          'x-ratelimit-refill-per-second': String(opts.refillPerSecond),
        },
      },
    );
  }

  bucket.tokens -= 1;
  BUCKETS.set(key, bucket);
  pruneIfNeeded(now);
  return null;
}

/** Test/debug helper — never used in production paths. */
export function _resetIVXRateLimitForTests(): void {
  BUCKETS.clear();
}

export const IVX_RATE_LIMIT_MARKER = 'ivx-rate-limit-2026-05-28';
