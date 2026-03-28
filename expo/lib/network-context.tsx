import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  lastChecked: number;
}

async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export const [NetworkProvider, useNetwork] = createContextHook(() => {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    lastChecked: Date.now(),
  });

  const check = useCallback(async () => {
    const reachable = await checkConnectivity();
    setState({
      isConnected: reachable,
      isInternetReachable: reachable,
      lastChecked: Date.now(),
    });
    console.log('[Network] Connectivity check:', reachable ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    void check();

    const interval = setInterval(() => {
      void check();
    }, 30000);

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void check();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => setState(prev => ({ ...prev, isConnected: true, isInternetReachable: true }));
      const onOffline = () => setState(prev => ({ ...prev, isConnected: false, isInternetReachable: false }));
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
  }, [check]);

  return useMemo(() => ({
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    isOffline: !state.isConnected,
    lastChecked: state.lastChecked,
    refresh: check,
  }), [state, check]);
});
