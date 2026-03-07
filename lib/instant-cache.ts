import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'ic_';
const memoryCache = new Map<string, { data: any; timestamp: number }>();
let initialized = false;
const initListeners: Array<() => void> = [];
const MAX_CACHE_AGE = 1000 * 60 * 30;
const initPromise = initializeFromDisk();

type CacheKey = string;

async function initializeFromDisk(): Promise<void> {
  if (initialized) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length === 0) {
      initialized = true;
      notifyListeners();
      return;
    }
    const pairs = await AsyncStorage.multiGet(cacheKeys);
    const now = Date.now();
    for (const [key, value] of pairs) {
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.timestamp && (now - parsed.timestamp) < MAX_CACHE_AGE) {
            memoryCache.set(key.replace(CACHE_PREFIX, ''), parsed);
          }
        } catch {}
      }
    }
    initialized = true;
    console.log(`[InstantCache] Loaded ${memoryCache.size} entries from disk in memory`);
    notifyListeners();
  } catch (e) {
    console.log('[InstantCache] Init error:', e);
    initialized = true;
    notifyListeners();
  }
}

function notifyListeners(): void {
  for (const listener of initListeners) {
    listener();
  }
  initListeners.length = 0;
}

export function onCacheReady(callback: () => void): () => void {
  if (initialized) {
    callback();
    return () => {};
  }
  initListeners.push(callback);
  return () => {
    const idx = initListeners.indexOf(callback);
    if (idx >= 0) initListeners.splice(idx, 1);
  };
}

export function getInstant<T>(key: CacheKey): T | undefined {
  const entry = memoryCache.get(key);
  if (entry) {
    return entry.data as T;
  }
  return undefined;
}

export function setInstant<T>(key: CacheKey, data: T): void {
  const entry = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)).catch(() => {});
}

export function clearInstant(key: CacheKey): void {
  memoryCache.delete(key);
  AsyncStorage.removeItem(CACHE_PREFIX + key).catch(() => {});
}

export function clearAllInstant(): void {
  const keys = Array.from(memoryCache.keys());
  memoryCache.clear();
  AsyncStorage.multiRemove(keys.map(k => CACHE_PREFIX + k)).catch(() => {});
}

export async function ensureCacheReady(): Promise<void> {
  await initPromise;
}

export function isCacheReady(): boolean {
  return initialized;
}

export function getCacheAge(key: CacheKey): number | null {
  const entry = memoryCache.get(key);
  if (entry) {
    return Date.now() - entry.timestamp;
  }
  return null;
}

export function hasCachedData(key: CacheKey): boolean {
  return memoryCache.has(key);
}
