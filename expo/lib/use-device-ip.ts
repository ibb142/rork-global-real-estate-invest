import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

interface DeviceIPInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  timezone?: string;
  isLoading: boolean;
  error: string | null;
}

export function useDeviceIP(): DeviceIPInfo {
  const [info, setInfo] = useState<DeviceIPInfo>({
    ip: '',
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchIP() {
      try {
        console.log('[DeviceIP] Fetching IP address...');
        const res = await fetch('https://ipapi.co/json/', {
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log('[DeviceIP] IP data received:', data.ip, data.city, data.country_name);

        if (!cancelled) {
          setInfo({
            ip: data.ip ?? '',
            city: data.city ?? undefined,
            region: data.region ?? undefined,
            country: data.country_name ?? undefined,
            org: data.org ?? undefined,
            timezone: data.timezone ?? undefined,
            isLoading: false,
            error: null,
          });
        }
      } catch (err: any) {
        console.log('[DeviceIP] Primary fetch failed, trying fallback...', err?.message);
        try {
          const fallbackRes = await fetch('https://api.ipify.org?format=json');
          const fallbackData = await fallbackRes.json();
          if (!cancelled) {
            setInfo({
              ip: fallbackData.ip ?? '',
              isLoading: false,
              error: null,
            });
          }
        } catch (fallbackErr: any) {
          console.error('[DeviceIP] All IP fetches failed:', fallbackErr?.message);
          if (!cancelled) {
            setInfo({
              ip: Platform.OS === 'web' ? 'Web client' : 'Unavailable',
              isLoading: false,
              error: fallbackErr?.message ?? 'Failed to detect IP',
            });
          }
        }
      }
    }

    void fetchIP();
    return () => { cancelled = true; };
  }, []);

  return info;
}
