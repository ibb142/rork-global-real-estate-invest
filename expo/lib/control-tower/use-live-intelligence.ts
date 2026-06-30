import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { liveIntelligenceService, type LiveIntelligenceSnapshot } from './live-intelligence';
import { fetchRemoteLiveIntelligenceSnapshot, mergeLiveIntelligenceSnapshots } from './remote-live-intelligence';

const LIVE_INTELLIGENCE_QUERY_KEY = ['nerve-center-live-intelligence'];

export function useLiveIntelligenceSnapshot(): LiveIntelligenceSnapshot {
  const queryClient = useQueryClient();
  const [localSnapshot, setLocalSnapshot] = useState<LiveIntelligenceSnapshot>(() => liveIntelligenceService.getSnapshot());

  const remoteSnapshotQuery = useQuery({
    queryKey: LIVE_INTELLIGENCE_QUERY_KEY,
    queryFn: fetchRemoteLiveIntelligenceSnapshot,
    enabled: isSupabaseConfigured(),
    refetchInterval: 15000,
    staleTime: 5000,
  });

  useEffect(() => {
    liveIntelligenceService.start();
    const unsubscribe = liveIntelligenceService.subscribe((nextSnapshot) => {
      setLocalSnapshot(nextSnapshot);
    });
    return unsubscribe;
  }, []);

  const channelIdRef = useRef<string>(`nerve-center-live-intelligence-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: LIVE_INTELLIGENCE_QUERY_KEY });
    };

    const watchedTables = [
      'nerve_center_events',
      'nerve_center_sessions',
      'nerve_center_user_profiles',
      'nerve_center_module_metrics',
      'nerve_center_funnel_snapshots',
    ] as const;

    // Use a per-instance unique channel name so we never reuse an already-subscribed
    // channel. Reusing a static topic can return a channel that has already called
    // `subscribe()`, and chaining `.on('postgres_changes', ...)` on it throws
    // "cannot add postgres_changes callbacks ... after subscribe()", crashing the screen.
    let channel = supabase.channel(channelIdRef.current);
    for (const table of watchedTables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        invalidate,
      );
    }

    try {
      channel.subscribe((status) => {
        console.log('[LiveIntelHook] Realtime status:', status);
      });
    } catch (error) {
      console.log('[LiveIntelHook] Realtime subscribe skipped:', (error as Error)?.message);
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useMemo(() => {
    return mergeLiveIntelligenceSnapshots(localSnapshot, remoteSnapshotQuery.data ?? null);
  }, [localSnapshot, remoteSnapshotQuery.data]);
}
