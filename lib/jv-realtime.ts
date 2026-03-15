import { useEffect, useRef, useCallback, useState } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { syncToLandingPage } from '@/lib/landing-sync';
import { resetSupabaseCheck, clearLocalDealCache } from '@/lib/jv-storage';

export type RealtimeStatus = 'live' | 'polling' | 'offline';

const JV_QUERY_KEY_PREFIX = 'jv-deals';
const PUBLISHED_QUERY_KEY = 'published-jv-deals';
const AGREEMENTS_QUERY_KEY = 'jv-agreements';
const BROADCAST_CHANNEL_NAME = 'jv-deals-cross-tab';

let _landingSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _lastLandingSyncTimestamp = 0;
const LANDING_SYNC_DEBOUNCE = 3000;

function triggerLandingSync() {
  const now = Date.now();
  if (now - _lastLandingSyncTimestamp < LANDING_SYNC_DEBOUNCE) {
    return;
  }
  if (_landingSyncTimeout) clearTimeout(_landingSyncTimeout);
  _landingSyncTimeout = setTimeout(async () => {
    _lastLandingSyncTimestamp = Date.now();
    try {
      const result = await syncToLandingPage();
      if (result.syncedDeals > 0) {
        console.log('[JV-Realtime] Landing sync complete:', result.syncedDeals, 'deals synced');
      }
    } catch (err) {
      console.log('[JV-Realtime] Landing sync failed:', (err as Error)?.message);
    }
  }, 1000);
}

let _broadcastChannel: BroadcastChannel | null = null;
let _broadcastListenerCount = 0;
let _tableVerified = false;
let _tableVerifyTimestamp = 0;
const TABLE_VERIFY_TTL = 30000;

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

async function verifyTableExists(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.log('[JV-Realtime] Supabase not configured — skipping table verify');
    return false;
  }
  const now = Date.now();
  if (_tableVerified && (now - _tableVerifyTimestamp) < TABLE_VERIFY_TTL) return true;
  try {
    const { error } = await supabase.from('jv_deals').select('id').limit(1);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find the table') || msg.includes('schema cache') || msg.includes('not_configured')) {
        console.log('[JV-Realtime] jv_deals table NOT found — run supabase-full-setup.sql');
        _tableVerified = false;
        _tableVerifyTimestamp = now;
        return false;
      }
    }
    _tableVerified = true;
    _tableVerifyTimestamp = now;
    console.log('[JV-Realtime] jv_deals table verified in Supabase');
    return true;
  } catch (e) {
    console.log('[JV-Realtime] Table verify failed:', (e as Error)?.message);
    _tableVerifyTimestamp = now;
    return false;
  }
}

export function resetTableVerification(): void {
  _tableVerified = false;
  _tableVerifyTimestamp = 0;
}

function getBroadcastChannel(): BroadcastChannel | null {
  if (Platform.OS !== 'web') return null;
  try {
    if (!_broadcastChannel || _broadcastChannel.onmessage === undefined) {
      _broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      _broadcastListenerCount = 0;
      console.log('[JV-CrossTab] BroadcastChannel created for cross-tab sync');
    }
    return _broadcastChannel;
  } catch (e) {
    console.log('[JV-CrossTab] BroadcastChannel not supported:', (e as Error)?.message);
    return null;
  }
}

function notifyCrossTabs(action: string) {
  const bc = getBroadcastChannel();
  if (bc) {
    try {
      bc.postMessage({ type: 'jv-invalidate', action, timestamp: Date.now() });
      console.log(`[JV-CrossTab] 📡 Broadcast sent: ${action}`);
    } catch (e) {
      console.log('[JV-CrossTab] Broadcast send failed:', (e as Error)?.message);
      _broadcastChannel = null;
    }
  }
}

export function invalidateAllJVQueries(queryClient: ReturnType<typeof useQueryClient>, broadcastToOtherTabs: boolean = true) {
  console.log('[JV-Realtime] 🔄 Invalidating ALL JV query keys + clearing local cache + forcing refetch');

  resetSupabaseCheck();

  void clearLocalDealCache().then(() => {
    console.log('[JV-Realtime] Local deal cache cleared before refetch');
  }).catch(() => {});

  void queryClient.invalidateQueries({ queryKey: ['jvAgreements.list'] });
  void queryClient.invalidateQueries({ queryKey: [JV_QUERY_KEY_PREFIX] });
  void queryClient.invalidateQueries({ queryKey: [PUBLISHED_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: [AGREEMENTS_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: ['jv-deals', 'published-list'] });
  void queryClient.invalidateQueries({ queryKey: ['jv-deal'] });
  void queryClient.invalidateQueries({ queryKey: ['properties'] });
  void queryClient.invalidateQueries({ queryKey: ['properties', 'home'] });
  void queryClient.invalidateQueries({ queryKey: ['properties', 'market'] });
  void queryClient.invalidateQueries({ queryKey: ['entity-images'] });
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key)) return false;
      const first = String(key[0] ?? '');
      return first.includes('jv') || first.includes('published-jv') || first.includes('propert');
    },
  });

  void queryClient.refetchQueries({ queryKey: ['jvAgreements.list'] });
  void queryClient.refetchQueries({ queryKey: [PUBLISHED_QUERY_KEY] });
  void queryClient.refetchQueries({ queryKey: [JV_QUERY_KEY_PREFIX] });
  void queryClient.refetchQueries({ queryKey: ['jv-deals', 'published-list'] });
  void queryClient.refetchQueries({ queryKey: ['properties', 'home'] });

  if (broadcastToOtherTabs) {
    notifyCrossTabs('invalidateAll');
  }
}

export function useJVRealtime(channelName: string = 'jv-deals-sync', enableFallbackPolling: boolean = true): { status: RealtimeStatus; lastEventAt: number } {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef<number>(0);
  const realtimeConnectedRef = useRef<boolean>(false);
  const destroyedRef = useRef<boolean>(false);
  const tableCheckDoneRef = useRef<boolean>(false);
  const maxRetries = 12;
  const [status, setStatus] = useState<RealtimeStatus>('offline');
  const [lastEventAt, setLastEventAt] = useState<number>(0);
  const FALLBACK_POLL_INTERVAL = 3000;
  const CONNECTED_POLL_INTERVAL = 3000;
  const _pollSyncRef = useRef<number>(0);

  useEffect(() => {
    destroyedRef.current = false;
    tableCheckDoneRef.current = false;

    async function connectChannel() {
      if (destroyedRef.current) return;

      if (!tableCheckDoneRef.current) {
        const exists = await verifyTableExists();
        tableCheckDoneRef.current = true;
        if (!exists) {
          console.log(`[JV-Realtime:${channelName}] ⚠️ Table not found — will rely on fallback polling and re-check periodically`);
          resetFallbackPolling(FALLBACK_POLL_INTERVAL);
          setTimeout(() => {
            if (!destroyedRef.current) {
              tableCheckDoneRef.current = false;
              void connectChannel();
            }
          }, 30000);
          return;
        }
      }

      try {
        if (channelRef.current) {
          try { void supabase.removeChannel(channelRef.current); } catch {}
          channelRef.current = null;
        }

        if (!isSupabaseConfigured()) {
          console.log(`[JV-Realtime:${channelName}] Supabase not configured — using fallback polling only`);
          resetFallbackPolling(FALLBACK_POLL_INTERVAL);
          return;
        }

        const channel = supabase
          .channel(channelName)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'jv_deals' }, (payload) => {
            const newRecord = payload.new as Record<string, unknown> | undefined;
            const oldRecord = payload.old as Record<string, unknown> | undefined;
            console.log(`[JV-Realtime:${channelName}] ⚡ Change detected:`, payload.eventType, '| new:', newRecord?.id, '| old:', oldRecord?.id);
            retryCountRef.current = 0;
            setLastEventAt(Date.now());
            resetSupabaseCheck();
            invalidateAllJVQueries(queryClient);

            if (newRecord?.published === true || oldRecord?.published === true) {
              console.log(`[JV-Realtime:${channelName}] 🌐 Published deal changed — triggering landing sync`);
              triggerLandingSync();
            }
          })
          .subscribe((status) => {
            if (destroyedRef.current) return;
            console.log(`[JV-Realtime:${channelName}] Status:`, status);
            if (status === 'SUBSCRIBED') {
              realtimeConnectedRef.current = true;
              retryCountRef.current = 0;
              setStatus('live');
              console.log(`[JV-Realtime:${channelName}] ✅ Realtime connected — events will fire on jv_deals changes`);
              resetFallbackPolling(CONNECTED_POLL_INTERVAL);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              realtimeConnectedRef.current = false;
              setStatus('polling');
              console.log(`[JV-Realtime:${channelName}] ❌ Realtime failed (${status}), retry ${retryCountRef.current}/${maxRetries}`);
              resetFallbackPolling(FALLBACK_POLL_INTERVAL);
              if (retryCountRef.current < maxRetries) {
                retryCountRef.current++;
                const delay = Math.min(1500 * Math.pow(1.4, retryCountRef.current), 3000);
                console.log(`[JV-Realtime:${channelName}] Will retry realtime in ${Math.round(delay)}ms`);
                setTimeout(() => { if (!destroyedRef.current) void connectChannel(); }, delay);
              } else {
                console.log(`[JV-Realtime:${channelName}] Max retries reached — relying on fallback polling only`);
              }
            } else if (status === 'CLOSED') {
              realtimeConnectedRef.current = false;
              setStatus('polling');
              console.log(`[JV-Realtime:${channelName}] Channel closed — restarting fallback polling`);
              resetFallbackPolling(FALLBACK_POLL_INTERVAL);
              if (retryCountRef.current < maxRetries) {
                retryCountRef.current++;
                setTimeout(() => { if (!destroyedRef.current) void connectChannel(); }, 3000);
              }
            }
          });

        channelRef.current = channel;
      } catch (e) {
        console.log(`[JV-Realtime:${channelName}] Setup failed:`, (e as Error)?.message);
        resetFallbackPolling(FALLBACK_POLL_INTERVAL);
      }
    }

    function resetFallbackPolling(interval: number) {
      if (destroyedRef.current) return;
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      if (!enableFallbackPolling) return;
      fallbackIntervalRef.current = setInterval(() => {
        if (!destroyedRef.current) {
          invalidateAllJVQueries(queryClient, false);
          _pollSyncRef.current++;
          if (_pollSyncRef.current % 5 === 0) {
            triggerLandingSync();
          }
        }
      }, interval);
    }

    void connectChannel();

    if (enableFallbackPolling) {
      resetFallbackPolling(FALLBACK_POLL_INTERVAL);
    }

    const bc = getBroadcastChannel();
    const crossTabHandler = (event: MessageEvent) => {
      if (destroyedRef.current) return;
      if (event.data?.type === 'jv-invalidate') {
        console.log(`[JV-CrossTab:${channelName}] 📡 Received cross-tab invalidation: ${event.data.action}`);
        invalidateAllJVQueries(queryClient, false);
      }
    };
    if (bc) {
      bc.addEventListener('message', crossTabHandler);
      _broadcastListenerCount++;
      console.log(`[JV-CrossTab:${channelName}] Listening for cross-tab messages (listeners: ${_broadcastListenerCount})`);
    }

    let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
    let visibilityHandler: (() => void) | null = null;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (!document.hidden && !destroyedRef.current) {
          console.log(`[JV-Realtime:${channelName}] 👁️ Tab visible — force refetch + reconnect`);
          resetSupabaseCheck();
          invalidateAllJVQueries(queryClient, false);
          if (!realtimeConnectedRef.current && retryCountRef.current < maxRetries) {
            retryCountRef.current = 0;
            tableCheckDoneRef.current = false;
            void connectChannel();
          }
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    } else {
      appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active' && !destroyedRef.current) {
          console.log(`[JV-Realtime:${channelName}] 📱 App active — force refetch + reconnect`);
          resetSupabaseCheck();
          invalidateAllJVQueries(queryClient, false);
          if (!realtimeConnectedRef.current && retryCountRef.current < maxRetries) {
            retryCountRef.current = 0;
            tableCheckDoneRef.current = false;
            void connectChannel();
          }
        }
      });
    }

    return () => {
      destroyedRef.current = true;
      if (bc) {
        bc.removeEventListener('message', crossTabHandler);
        _broadcastListenerCount--;
        if (_broadcastListenerCount <= 0) {
          try { bc.close(); } catch {}
          _broadcastChannel = null;
          _broadcastListenerCount = 0;
        }
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
      if (appStateSubscription) {
        appStateSubscription.remove();
      }
    };
  }, [queryClient, channelName, enableFallbackPolling]);

  return { status, lastEventAt };
}

export function useForceJVRefresh() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    console.log('[JV-Realtime] 🔥 FORCE REFRESH — invalidating + refetching all JV queries');
    resetTableVerification();
    invalidateAllJVQueries(queryClient);
  }, [queryClient]);
}
