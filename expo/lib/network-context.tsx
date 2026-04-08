import createContextHook from '@nkzw/create-context-hook';
import { onlineManager } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import {
  type BackendStatus,
  subscribeHealth,
  startHealthMonitor,
  stopHealthMonitor,
  runFullHealthCheck,
} from './api-resilience';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  lastChecked: number;
  supabaseStatus: BackendStatus;
}

async function checkConnectivity(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });

    return response.ok || response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export const [NetworkProvider, useNetwork] = createContextHook(() => {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    lastChecked: Date.now(),
    supabaseStatus: 'unknown',
  });

  const inFlightCheckRef = useRef<Promise<boolean> | null>(null);
  const lastReachableRef = useRef<boolean>(true);
  const lastCheckRef = useRef<number>(0);
  const lastHealthKickRef = useRef<number>(0);

  const updateReachability = useCallback((reachable: boolean, reason: string) => {
    lastReachableRef.current = reachable;
    onlineManager.setOnline(reachable);

    setState((prev) => ({
      ...prev,
      isConnected: reachable,
      isInternetReachable: reachable,
      lastChecked: Date.now(),
    }));

    console.log('[Network] Connectivity update:', reason, reachable ? 'online' : 'offline');
  }, []);

  const maybeRunHealthCheck = useCallback((force: boolean) => {
    const now = Date.now();
    if (!force && now - lastHealthKickRef.current < 60_000) {
      return;
    }

    lastHealthKickRef.current = now;
    void runFullHealthCheck();
  }, []);

  const check = useCallback(async (force: boolean = false): Promise<boolean> => {
    const now = Date.now();

    if (!force && inFlightCheckRef.current) {
      return inFlightCheckRef.current;
    }

    if (!force && now - lastCheckRef.current < 30_000) {
      return lastReachableRef.current;
    }

    lastCheckRef.current = now;

    const request = (async () => {
      const reachable = await checkConnectivity();
      updateReachability(reachable, force ? 'forced' : 'scheduled');

      if (reachable) {
        maybeRunHealthCheck(force);
      }

      return reachable;
    })();

    inFlightCheckRef.current = request.finally(() => {
      inFlightCheckRef.current = null;
    });

    return inFlightCheckRef.current;
  }, [maybeRunHealthCheck, updateReachability]);

  useEffect(() => {
    startHealthMonitor();

    const unsub = subscribeHealth((health) => {
      setState((prev) => ({
        ...prev,
        supabaseStatus: health.supabaseStatus,
      }));
    });

    return () => {
      unsub();
      stopHealthMonitor();
    };
  }, []);

  useEffect(() => {
    void check(true);

    const interval = setInterval(() => {
      void check(false);
    }, 180000);

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void check(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => {
        updateReachability(true, 'browser-online');
        void check(true);
      };

      const onOffline = () => {
        updateReachability(false, 'browser-offline');
      };

      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      return () => {
        clearInterval(interval);
        sub.remove();
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [check, updateReachability]);

  const refresh = useCallback(() => check(true), [check]);

  return useMemo(() => ({
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    isOffline: !state.isConnected,
    lastChecked: state.lastChecked,
    supabaseStatus: state.supabaseStatus,
    isFullyOperational: state.supabaseStatus === 'online' && state.isConnected,
    refresh,
  }), [refresh, state]);
});
