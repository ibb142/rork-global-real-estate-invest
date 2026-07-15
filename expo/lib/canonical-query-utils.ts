/**
 * Pure utility functions for canonical query layer — no React Native deps.
 * Extracted so they can be unit-tested without importing supabase/react-native.
 */

const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 409, 422]);

export function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { code?: string; message?: string; status?: number };

  if (err.code === 'ABORTED' || err.message?.includes('aborted')) return false;

  const code = err.code ?? '';
  if (NON_RETRYABLE_STATUS.has(Number(code))) return false;
  if (err.status && NON_RETRYABLE_STATUS.has(err.status)) return false;

  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR') return true;
  if (err.message?.includes('timeout')) return true;
  if (err.message?.includes('network')) return true;
  if (err.message?.includes('fetch')) return true;
  if (Number(code) >= 500) return true;

  return true;
}

export function getBackoffDelay(attempt: number, baseMs: number = 800, maxMs: number = 8000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * 0.3 * exp;
  return Math.round(exp + jitter);
}
