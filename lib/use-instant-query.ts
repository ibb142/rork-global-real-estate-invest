import { useState, useEffect, useRef, useMemo } from 'react';
import { getInstant, setInstant, isCacheReady, onCacheReady } from './instant-cache';

export function useInstantCache<T>(
  cacheKey: string,
  queryData: T | undefined,
  isSuccess: boolean
): T | undefined {
  const immediateCache = useMemo(() => getInstant<T>(cacheKey), [cacheKey]);
  const [cachedData, setCachedData] = useState<T | undefined>(immediateCache);
  const lastWrittenRef = useRef<string>(immediateCache ? JSON.stringify(immediateCache) : '');
  const initCheckedRef = useRef(isCacheReady());

  useEffect(() => {
    if (initCheckedRef.current) return;
    const unsub = onCacheReady(() => {
      initCheckedRef.current = true;
      const cached = getInstant<T>(cacheKey);
      if (cached !== undefined) {
        setCachedData(cached);
      }
    });
    return unsub;
  }, [cacheKey]);

  useEffect(() => {
    if (isSuccess && queryData !== undefined) {
      const serialized = JSON.stringify(queryData);
      if (serialized !== lastWrittenRef.current) {
        lastWrittenRef.current = serialized;
        setCachedData(queryData);
        setInstant(cacheKey, queryData);
      }
    }
  }, [isSuccess, queryData, cacheKey]);

  return cachedData ?? queryData;
}

export function getInitialCacheData<T>(cacheKey: string): T | undefined {
  return getInstant<T>(cacheKey);
}

export function useInstantCacheMulti(
  entries: Array<{
    cacheKey: string;
    data: any;
    isSuccess: boolean;
  }>
): void {
  const lastWrittenRef = useRef<Record<string, string>>({});

  useEffect(() => {
    for (const entry of entries) {
      if (entry.isSuccess && entry.data !== undefined) {
        const serialized = JSON.stringify(entry.data);
        if (serialized !== lastWrittenRef.current[entry.cacheKey]) {
          lastWrittenRef.current[entry.cacheKey] = serialized;
          setInstant(entry.cacheKey, entry.data);
        }
      }
    }
  }, [entries]);
}
