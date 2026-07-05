import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { fetchPublicGeoData, fetchPublicIpAddress } from './public-geo';

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

    async function loadDeviceIP(): Promise<void> {
      try {
        console.log('[DeviceIP] Starting public geo lookup...');
        const geo = await fetchPublicGeoData();

        if (geo) {
          console.log('[DeviceIP] Geo data resolved:', geo.ip, geo.city, geo.country, geo.source);
          if (!cancelled) {
            setInfo({
              ip: geo.ip ?? '',
              city: geo.city ?? undefined,
              region: geo.region ?? undefined,
              country: geo.country ?? undefined,
              org: geo.org ?? undefined,
              timezone: geo.timezone ?? undefined,
              isLoading: false,
              error: null,
            });
          }
          return;
        }

        const fallbackIp = await fetchPublicIpAddress();
        console.log('[DeviceIP] Geo unavailable, IP fallback result:', fallbackIp ?? 'none');

        if (!cancelled) {
          if (fallbackIp) {
            setInfo({
              ip: fallbackIp,
              isLoading: false,
              error: null,
            });
          } else {
            setInfo({
              ip: Platform.OS === 'web' ? 'Web client' : 'Unavailable',
              isLoading: false,
              error: 'Failed to detect geo or IP information',
            });
          }
        }
      } catch (error) {
        const message = (error as Error)?.message ?? 'Failed to detect IP';
        console.log('[DeviceIP] Lookup failed:', message);
        if (!cancelled) {
          setInfo({
            ip: Platform.OS === 'web' ? 'Web client' : 'Unavailable',
            isLoading: false,
            error: message,
          });
        }
      }
    }

    void loadDeviceIP();

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
