/**
 * Realtime delta updates for projects (properties) and deals (jv_deals).
 *
 * Applies INSERT/UPDATE/DELETE changes by stable record ID to React Query cache
 * WITHOUT refetching the full collection after every event.
 *
 * Features:
 * - Apply changes by stable record ID
 * - No full refetch after every event
 * - Prevent duplicate subscriptions
 * - Unsubscribe on unmount
 * - Unsubscribe on account change
 * - Preserve pagination state
 * - Avoid duplicate records
 */
import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { invalidateDealsCache, invalidatePropertiesCache } from '@/lib/canonical-query';

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';
type TableName = 'jv_deals' | 'properties';

interface DeltaPayload {
  eventType: RealtimeEvent;
  new: Record<string, unknown> | undefined;
  old: Record<string, unknown> | undefined;
}

/** Active subscription channels — prevents duplicate subscriptions */
const activeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

/** Track subscribed user IDs — unsubscribe on account change */
let _subscribedUserId: string | null = null;

function applyDeltaToQueryCache(
  queryClient: QueryClient,
  queryKeyPrefix: string[],
  event: RealtimeEvent,
  record: Record<string, unknown> | undefined,
): void {
  if (!record) return;
  const recordId = String(record.id ?? '');
  if (!recordId) return;

  // Find all cached pages for this query key prefix
  queryClient.setQueriesData<{ items: unknown[]; hasMore: boolean }>(
    { queryKey: queryKeyPrefix },
    (cached) => {
      if (!cached || !Array.isArray(cached.items)) return cached;

      const items = cached.items as Array<Record<string, unknown> & { id?: string }>;
      const existingIndex = items.findIndex((item) => String(item?.id) === recordId);

      switch (event) {
        case 'INSERT': {
          if (existingIndex >= 0) {
            // Already exists — update in place (avoid duplicate)
            const updated = [...items];
            updated[existingIndex] = record as Record<string, unknown> & { id?: string };
            return { ...cached, items: updated };
          }
          // Insert at the beginning (newest first)
          return { ...cached, items: [record as Record<string, unknown> & { id?: string }, ...items] };
        }
        case 'UPDATE': {
          if (existingIndex >= 0) {
            const updated = [...items];
            updated[existingIndex] = record as Record<string, unknown> & { id?: string };
            return { ...cached, items: updated };
          }
          // Not in current page — ignore (will appear on next page fetch)
          return cached;
        }
        case 'DELETE': {
          if (existingIndex >= 0) {
            return { ...cached, items: items.filter((_, i) => i !== existingIndex) };
          }
          return cached;
        }
        default:
          return cached;
      }
    },
  );
}

function setupRealtimeChannel(
  queryClient: QueryClient,
  table: TableName,
  queryKeyPrefix: string[],
  cacheInvalidator: () => void,
): ReturnType<typeof supabase.channel> | null {
  if (!isSupabaseConfigured()) return null;

  const channelName = `delta-${table}`;

  // Prevent duplicate subscriptions
  if (activeChannels.has(channelName)) {
    console.log(`[DeltaRealtime] Channel ${channelName} already active — skipping duplicate`);
    return activeChannels.get(channelName) ?? null;
  }

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload: DeltaPayload) => {
      const eventType = payload.eventType as RealtimeEvent;
      const record = payload.new ?? payload.old;
      const recordId = String(record?.id ?? 'unknown');

      console.log(`[DeltaRealtime] ${table} ${eventType} | id: ${recordId}`);

      // Apply delta to query cache — no full refetch
      applyDeltaToQueryCache(queryClient, queryKeyPrefix, eventType, record);

      // Invalidate the canonical SWR cache so next page fetch gets fresh data
      cacheInvalidator();
    })
    .subscribe((status) => {
      console.log(`[DeltaRealtime] Channel ${channelName} status: ${status}`);
    });

  activeChannels.set(channelName, channel);
  return channel;
}

function removeRealtimeChannel(channelName: string): void {
  const channel = activeChannels.get(channelName);
  if (channel) {
    try {
      void supabase.removeChannel(channel);
    } catch {
      // ignore
    }
    activeChannels.delete(channelName);
    console.log(`[DeltaRealtime] Channel ${channelName} removed`);
  }
}

/**
 * Hook for realtime delta updates on jv_deals.
 * Subscribes to INSERT/UPDATE/DELETE events and applies them to React Query cache
 * without refetching the full collection.
 *
 * Unsubscribes on unmount and on account change.
 */
export function useDealsRealtime(userId: string | null | undefined): void {
  const queryClient = useQueryClient();
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Unsubscribe on account change
    if (userIdRef.current !== null && userIdRef.current !== userId) {
      console.log('[DeltaRealtime] Account changed — unsubscribing deals channel');
      removeRealtimeChannel('delta-jv_deals');
      userIdRef.current = userId ?? null;
    }

    userIdRef.current = userId ?? null;

    const channel = setupRealtimeChannel(
      queryClient,
      'jv_deals',
      ['jvAgreements.list'],
      invalidateDealsCache,
    );

    return () => {
      removeRealtimeChannel('delta-jv_deals');
    };
  }, [queryClient, userId]);
}

/**
 * Hook for realtime delta updates on properties.
 * Subscribes to INSERT/UPDATE/DELETE events and applies them to React Query cache
 * without refetching the full collection.
 *
 * Unsubscribes on unmount and on account change.
 */
export function usePropertiesRealtime(userId: string | null | undefined): void {
  const queryClient = useQueryClient();
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Unsubscribe on account change
    if (userIdRef.current !== null && userIdRef.current !== userId) {
      console.log('[DeltaRealtime] Account changed — unsubscribing properties channel');
      removeRealtimeChannel('delta-properties');
      userIdRef.current = userId ?? null;
    }

    userIdRef.current = userId ?? null;

    const channel = setupRealtimeChannel(
      queryClient,
      'properties',
      ['admin-properties'],
      invalidatePropertiesCache,
    );

    return () => {
      removeRealtimeChannel('delta-properties');
    };
  }, [queryClient, userId]);
}

/**
 * Combined hook for both deals and properties realtime.
 * Use this in screens that display both.
 */
export function useProjectsAndDealsRealtime(userId: string | null | undefined): void {
  useDealsRealtime(userId);
  usePropertiesRealtime(userId);
}
