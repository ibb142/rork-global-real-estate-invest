import AsyncStorage from '@react-native-async-storage/async-storage';
import { performanceMonitor } from '@/lib/performance-monitor';

export type BackendStatus = 'online' | 'degraded' | 'offline' | 'unknown';

interface HealthState {
  supabaseStatus: BackendStatus;
  lastSupabaseCheck: number;
  consecutiveSupabaseFailures: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const CACHE_PREFIX = 'ipx_cache_';
const HEALTH_CHECK_INTERVAL = 180_000;
const SUPABASE_TIMEOUT = 10_000;
const MAX_CACHE_AGE = 1000 * 60 * 60 * 24;
const REQUEST_DEDUP_WINDOW = 2_000;
const RATE_LIMIT_WINDOW = 60_000;
const DEFAULT_RATE_LIMIT = 30;

const _rateLimitMap = new Map<string, RateLimitEntry>();

const _pendingRequests = new Map<string, { promise: Promise<unknown>; timestamp: number }>();

export function deduplicatedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = _pendingRequests.get(key);
  if (existing && now - existing.timestamp < REQUEST_DEDUP_WINDOW) {
    console.log('[Resilience] Dedup hit for:', key);
    return existing.promise as Promise<T>;
  }

  const promise = fn().finally(() => {
    setTimeout(() => _pendingRequests.delete(key), REQUEST_DEDUP_WINDOW);
  });
  _pendingRequests.set(key, { promise, timestamp: now });
  return promise;
}

let _state: HealthState = {
  supabaseStatus: 'unknown',
  lastSupabaseCheck: 0,
  consecutiveSupabaseFailures: 0,
};

type Listener = (state: HealthState) => void;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((fn) => {
    try { fn({ ..._state }); } catch {}
  });
}

export function subscribeHealth(fn: Listener): () => void {
  _listeners.add(fn);
  fn({ ..._state });
  return () => { _listeners.delete(fn); };
}

export function getHealthState(): HealthState {
  return { ..._state };
}

export async function checkSupabaseHealth(): Promise<BackendStatus> {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  if (!url) {
    _state.supabaseStatus = 'offline';
    _state.lastSupabaseCheck = Date.now();
    notify();
    return 'offline';
  }

  const timeSinceLast = Date.now() - _state.lastSupabaseCheck;
  if (timeSinceLast < 30_000 && _state.supabaseStatus === 'online') {
    return _state.supabaseStatus;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT);

    const res = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      },
    });
    clearTimeout(timeout);

    _state.supabaseStatus = res.status < 500 ? 'online' : 'degraded';
    _state.consecutiveSupabaseFailures = 0;
  } catch {
    _state.consecutiveSupabaseFailures++;
    _state.supabaseStatus = _state.consecutiveSupabaseFailures >= 3 ? 'offline' : 'degraded';
  }

  _state.lastSupabaseCheck = Date.now();
  notify();
  return _state.supabaseStatus;
}

export async function runFullHealthCheck(): Promise<{ supabase: BackendStatus }> {
  const supabase = await checkSupabaseHealth();
  console.log(`[Resilience] Health: supabase=${supabase}`);
  return { supabase };
}

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startHealthMonitor() {
  if (_intervalId) return;
  void runFullHealthCheck();
  _intervalId = setInterval(() => {
    void runFullHealthCheck();
  }, HEALTH_CHECK_INTERVAL);
  console.log('[Resilience] Health monitor started');
}

export function stopHealthMonitor() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

export function isSupabaseAvailable(): boolean {
  return _state.supabaseStatus === 'online' || _state.supabaseStatus === 'degraded';
}

export async function cacheData(key: string, data: unknown): Promise<void> {
  try {
    const entry = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch (err) {
    console.log('[Resilience] Cache write error:', (err as Error)?.message);
  }
}

export async function getCachedData<T>(key: string): Promise<{ data: T; age: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;

    const entry = JSON.parse(raw) as { data: T; timestamp: number };
    const age = Date.now() - entry.timestamp;

    if (age > MAX_CACHE_AGE) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return { data: entry.data, age };
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    console.log('[Resilience] Cache cleared:', cacheKeys.length, 'entries');
  } catch (err) {
    console.log('[Resilience] Cache clear error:', (err as Error)?.message);
  }
}

export function checkRateLimit(key: string, maxRequests: number = DEFAULT_RATE_LIMIT): boolean {
  const now = Date.now();
  const entry = _rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    _rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxRequests) {
    console.log(`[Resilience] Rate limit hit for ${key}: ${entry.count}/${maxRequests} in window`);
    return false;
  }

  entry.count++;
  return true;
}

export function getRateLimitStats(): Record<string, { count: number; remaining: number; windowMs: number }> {
  const now = Date.now();
  const stats: Record<string, { count: number; remaining: number; windowMs: number }> = {};

  for (const [key, entry] of _rateLimitMap.entries()) {
    const windowRemaining = Math.max(0, RATE_LIMIT_WINDOW - (now - entry.windowStart));
    stats[key] = {
      count: entry.count,
      remaining: Math.max(0, DEFAULT_RATE_LIMIT - entry.count),
      windowMs: windowRemaining,
    };
  }
  return stats;
}

export async function resilientFetch<T>(
  primaryFn: () => Promise<T>,
  fallbackFn?: () => Promise<T>,
  cacheKey?: string,
): Promise<{ data: T; source: 'primary' | 'fallback' | 'cache' }> {
  const timerName = cacheKey ? `resilient_fetch_${cacheKey}` : `resilient_fetch_${Date.now()}`;
  performanceMonitor.startTimer(timerName);

  try {
    const data = await primaryFn();
    const latency = performanceMonitor.endTimer(timerName, { source: 'primary' });
    if (cacheKey) {
      performanceMonitor.recordApiLatency(cacheKey, latency);
      void cacheData(cacheKey, data);
    }
    return { data, source: 'primary' };
  } catch (primaryErr) {
    console.log('[Resilience] Primary fetch failed:', (primaryErr as Error)?.message);

    if (fallbackFn) {
      try {
        const data = await fallbackFn();
        const latency = performanceMonitor.endTimer(timerName, { source: 'fallback' });
        if (cacheKey) {
          performanceMonitor.recordApiLatency(cacheKey, latency);
          void cacheData(cacheKey, data);
        }
        return { data, source: 'fallback' };
      } catch (fallbackErr) {
        console.log('[Resilience] Fallback fetch failed:', (fallbackErr as Error)?.message);
      }
    }

    if (cacheKey) {
      const cached = await getCachedData<T>(cacheKey);
      if (cached) {
        performanceMonitor.endTimer(timerName, { source: 'cache' });
        console.log(`[Resilience] Serving from cache (age: ${Math.round(cached.age / 1000)}s)`);
        return { data: cached.data, source: 'cache' };
      }
    }

    performanceMonitor.endTimer(timerName, { source: 'error' });
    throw primaryErr;
  }
}
