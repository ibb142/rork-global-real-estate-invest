/**
 * useNetworkState — tracks device network connectivity without external deps.
 *
 * Uses a lightweight fetch-based heartbeat to the API base URL every 15s.
 * This avoids requiring expo-netinfo (not available in this SDK version)
 * while still detecting offline states for playback pause/retry UI.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: NetworkType;
}

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');
const HEARTBEAT_MS = 15_000;

export function useNetworkState(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (cancelled) return;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(`${API_BASE}/api/ivx/video-platform/feed?limit=1`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);
        if (cancelled) return;
        const reachable = res.ok;
        setStatus((prev) => {
          // Only update if changed to avoid unnecessary re-renders
          if (prev.isInternetReachable === reachable && prev.isConnected) return prev;
          return {
            isConnected: true,
            isInternetReachable: reachable,
            type: reachable ? prev.type : 'none',
          };
        });
      } catch {
        if (cancelled) return;
        setStatus((prev) => {
          if (!prev.isInternetReachable && !prev.isConnected) return prev;
          return { isConnected: false, isInternetReachable: false, type: 'none' };
        });
      }
      if (!cancelled) {
        timer = setTimeout(check, HEARTBEAT_MS);
      }
    };

    void check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return status;
}
