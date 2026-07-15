import { useEffect, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface RealtimeSubscriptionConfig {
  channelName: string;
  table: string;
  schema?: string;
  event?: EventType;
  filter?: string;
  queryKeys: string[][];
  onPayload?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

const INVALIDATION_THROTTLE = 3_000;
const _lastInvalidation = new Map<string, number>();

function throttledInvalidate(queryClient: QueryClient, keys: string[][]) {
  const now = Date.now();
  for (const key of keys) {
    const keyStr = JSON.stringify(key);
    const last = _lastInvalidation.get(keyStr) ?? 0;
    if (now - last < INVALIDATION_THROTTLE) continue;
    _lastInvalidation.set(keyStr, now);
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

function setupChannels(
  configs: RealtimeSubscriptionConfig[],
  queryClient: QueryClient,
  channelsRef: React.MutableRefObject<RealtimeChannel[]>,
  activeRef: React.MutableRefObject<boolean>,
) {
  for (const ch of channelsRef.current) {
    try { void supabase.removeChannel(ch); } catch {}
  }
  channelsRef.current = [];

  for (const config of configs) {
    const channel = supabase
      .channel(config.channelName)
      .on(
        'postgres_changes' as any,
        {
          event: config.event || '*',
          schema: config.schema || 'public',
          table: config.table,
          ...(config.filter ? { filter: config.filter } : {}),
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (!activeRef.current) return;

          console.log(`[Realtime] ${config.table} ${payload.eventType}`, payload.new ? (payload.new as any).id : '');

          throttledInvalidate(queryClient, config.queryKeys);

          if (config.onPayload) {
            try {
              config.onPayload(payload);
            } catch (err) {
              console.log('[Realtime] onPayload error:', (err as Error)?.message);
            }
          }
        }
      )
      .subscribe((status: string) => {
        console.log(`[Realtime] ${config.channelName}: ${status}`);
      });

    channelsRef.current.push(channel);
  }
}

export function useRealtimeSubscription(configs: RealtimeSubscriptionConfig[]) {
  const queryClient = useQueryClient();
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const activeRef = useRef(true);

  const channelKey = useMemo(
    () => configs.map(c => c.channelName).join(','),
    [configs]
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      console.log('[Realtime] Supabase not configured — skipping subscriptions');
      return;
    }

    if (configs.length === 0) return;

    activeRef.current = true;

    setupChannels(configs, queryClient, channelsRef, activeRef);

    let lastForeground = Date.now();
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const elapsed = Date.now() - lastForeground;
        lastForeground = Date.now();
        if (elapsed < 10000) {
          console.log('[Realtime] App foregrounded too quickly — skipping resubscribe');
          return;
        }
        console.log('[Realtime] App foregrounded — resubscribing');
        setupChannels(configs, queryClient, channelsRef, activeRef);
        throttledInvalidate(queryClient, configs.flatMap(c => c.queryKeys));
      } else if (nextState === 'background') {
        console.log('[Realtime] App backgrounded — unsubscribing to save connections');
        for (const ch of channelsRef.current) {
          try { void supabase.removeChannel(ch); } catch {}
        }
        channelsRef.current = [];
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      activeRef.current = false;
      appStateSub.remove();
      for (const ch of channelsRef.current) {
        try { void supabase.removeChannel(ch); } catch {}
      }
      channelsRef.current = [];
      console.log('[Realtime] Cleaned up all subscriptions');
    };
  }, [channelKey, configs, queryClient]);
}

export function useRealtimeTable(
  table: string,
  queryKeys: string[][],
  options?: {
    event?: EventType;
    filter?: string;
    onPayload?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  }
) {
  const configs = useMemo<RealtimeSubscriptionConfig[]>(() => [{
    channelName: `rt-${table}`,
    table,
    event: options?.event || '*',
    filter: options?.filter,
    queryKeys,
    onPayload: options?.onPayload,
  }], [table, options?.event, options?.filter, queryKeys, options?.onPayload]);

  useRealtimeSubscription(configs);
}
