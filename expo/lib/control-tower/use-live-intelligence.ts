import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const channel = supabase
      .channel('nerve-center-live-intelligence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nerve_center_events' }, () => {
        void queryClient.invalidateQueries({ queryKey: LIVE_INTELLIGENCE_QUERY_KEY });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nerve_center_sessions' }, () => {
        void queryClient.invalidateQueries({ queryKey: LIVE_INTELLIGENCE_QUERY_KEY });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nerve_center_user_profiles' }, () => {
        void queryClient.invalidateQueries({ queryKey: LIVE_INTELLIGENCE_QUERY_KEY });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nerve_center_module_metrics' }, () => {
        void queryClient.invalidateQueries({ queryKey: LIVE_INTELLIGENCE_QUERY_KEY });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nerve_center_funnel_snapshots' }, () => {
        void queryClient.invalidateQueries({ queryKey: LIVE_INTELLIGENCE_QUERY_KEY });
      })
      .subscribe((status) => {
        console.log('[LiveIntelHook] Realtime status:', status);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useMemo(() => {
    return mergeLiveIntelligenceSnapshots(localSnapshot, remoteSnapshotQuery.data ?? null);
  }, [localSnapshot, remoteSnapshotQuery.data]);
}
