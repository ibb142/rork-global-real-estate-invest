/**
 * Canonical data-fetching layer for IVX projects (properties) and deals (jv_deals).
 *
 * One source of truth per module — no duplicate Supabase queries scattered across screens.
 * Features:
 * - Request cancellation via AbortController
 * - Retry only on retryable errors (network, 5xx) — no retry on 400/401/403
 * - Exponential backoff with jitter
 * - Stale-while-revalidate (return cached data while refetching)
 * - Background refresh
 * - Request deduplication (in-flight request sharing)
 * - No copying every response into global context
 */
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CanonicalQueryOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Override stale-while-revalidate cache TTL (ms) */
  staleTimeMs?: number;
  /** Disable SWR — always fetch fresh */
  noCache?: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
}

// ─── Error classification ────────────────────────────────────────────────────

const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 409, 422]);

export function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: string; message?: string; status?: number };

  // Abort errors are never retried
  if (err.code === 'ABORTED' || err.message?.includes('aborted')) return false;

  // Supabase/PostgREST error codes
  const code = err.code ?? '';
  if (NON_RETRYABLE_STATUS.has(Number(code))) return false;
  if (err.status && NON_RETRYABLE_STATUS.has(err.status)) return false;

  // Network errors, timeouts, 5xx — retryable
  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR') return true;
  if (err.message?.includes('timeout')) return true;
  if (err.message?.includes('network')) return true;
  if (err.message?.includes('fetch')) return true;
  if (Number(code) >= 500) return true;

  // Default: retry on unknown errors (safer for transient Supabase issues)
  return true;
}

// ─── Exponential backoff ─────────────────────────────────────────────────────

export function getBackoffDelay(attempt: number, baseMs: number = 800, maxMs: number = 8000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * 0.3 * exp;
  return Math.round(exp + jitter);
}

// ─── Stale-while-revalidate cache ────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  promise: Promise<T> | null;
}

const DEFAULT_STALE_TIME = 1000 * 60 * 2; // 2 minutes
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, staleTimeMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age > staleTimeMs * 3) {
    // Too old — evict
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now(), promise: null });
}

// ─── Request deduplication ───────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

async function dedupeFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // If already in-flight, share the same promise
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fetcher().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

// ─── Retry wrapper ───────────────────────────────────────────────────────────

async function withRetry<T>(
  fetcher: () => Promise<T>,
  options: { signal?: AbortSignal; maxRetries?: number } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new Error('Request aborted');
    }

    try {
      const result = await fetcher();
      return result;
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error)) {
        throw error;
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = getBackoffDelay(attempt);
      console.log(`[CanonicalQuery] Retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, (error as Error)?.message);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Request aborted'));
        }, { once: true });
      });
    }
  }

  throw lastError;
}

// ─── Canonical properties (projects) query ───────────────────────────────────

const PROPERTIES_QUERY_KEY = 'canonical-properties';
const PROPERTIES_PAGE_SIZE = 10;

/**
 * Fetch one page of properties from Supabase with cursor pagination.
 * This is the ONE canonical query for properties — all screens should use this.
 */
export async function fetchPropertiesPage(
  page: number,
  pageSize: number = PROPERTIES_PAGE_SIZE,
  options?: CanonicalQueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * pageSize;
  const cacheKey = `${PROPERTIES_QUERY_KEY}-page-${page}-${pageSize}`;

  // Stale-while-revalidate: return cached data if available
  if (!options?.noCache) {
    const cached = getCached<PaginatedResult<Record<string, unknown>>>(cacheKey, options?.staleTimeMs ?? DEFAULT_STALE_TIME);
    if (cached) {
      // Background refresh if stale
      if (Date.now() - (cache.get(cacheKey)?.timestamp ?? 0) > (options?.staleTimeMs ?? DEFAULT_STALE_TIME)) {
        void dedupeFetch(cacheKey, () =>
          withRetry(() => fetchPropertiesPageFromSupabase(offset, pageSize), { signal: options?.signal })
            .then(result => { setCached(cacheKey, result); return result; })
        ).catch(() => {});
      }
      return cached;
    }
  }

  const result = await dedupeFetch(cacheKey, () =>
    withRetry(() => fetchPropertiesPageFromSupabase(offset, pageSize), { signal: options?.signal }),
  );

  setCached(cacheKey, result);
  return result;
}

async function fetchPropertiesPageFromSupabase(
  offset: number,
  pageSize: number,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;
  const items = (data ?? []) as Record<string, unknown>[];
  return { items, hasMore: items.length === pageSize };
}

// ─── Canonical deals (jv_deals) query ────────────────────────────────────────

const DEALS_QUERY_KEY = 'canonical-deals';
const DEALS_PAGE_SIZE = 10;

/**
 * Fetch one page of JV deals from Supabase with cursor pagination.
 * This is the ONE canonical query for jv_deals — all screens should use this.
 */
export async function fetchDealsPage(
  page: number,
  pageSize: number = DEALS_PAGE_SIZE,
  options?: CanonicalQueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * pageSize;
  const cacheKey = `${DEALS_QUERY_KEY}-page-${page}-${pageSize}`;

  if (!options?.noCache) {
    const cached = getCached<PaginatedResult<Record<string, unknown>>>(cacheKey, options?.staleTimeMs ?? DEFAULT_STALE_TIME);
    if (cached) {
      if (Date.now() - (cache.get(cacheKey)?.timestamp ?? 0) > (options?.staleTimeMs ?? DEFAULT_STALE_TIME)) {
        void dedupeFetch(cacheKey, () =>
          withRetry(() => fetchDealsPageFromSupabase(offset, pageSize), { signal: options?.signal })
            .then(result => { setCached(cacheKey, result); return result; })
        ).catch(() => {});
      }
      return cached;
    }
  }

  const result = await dedupeFetch(cacheKey, () =>
    withRetry(() => fetchDealsPageFromSupabase(offset, pageSize), { signal: options?.signal }),
  );

  setCached(cacheKey, result);
  return result;
}

async function fetchDealsPageFromSupabase(
  offset: number,
  pageSize: number,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('jv_deals')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;
  const items = (data ?? []) as Record<string, unknown>[];
  return { items, hasMore: items.length === pageSize };
}

// ─── Cache management ────────────────────────────────────────────────────────

/** Invalidate all cached property pages (e.g. after CRUD mutation). */
export function invalidatePropertiesCache(): void {
  for (const key of cache.keys()) {
    if (key.startsWith(PROPERTIES_QUERY_KEY)) {
      cache.delete(key);
    }
  }
}

/** Invalidate all cached deal pages (e.g. after CRUD mutation). */
export function invalidateDealsCache(): void {
  for (const key of cache.keys()) {
    if (key.startsWith(DEALS_QUERY_KEY)) {
      cache.delete(key);
    }
  }
}

/** Invalidate all cached data. */
export function invalidateAllCache(): void {
  cache.clear();
}

/** Get cache stats for diagnostics. */
export function getCanonicalCacheStats(): { entries: number; keys: string[] } {
  return {
    entries: cache.size,
    keys: Array.from(cache.keys()),
  };
}
