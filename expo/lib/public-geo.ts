import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PublicGeoData {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  org?: string;
  source?: string;
}

interface PublicGeoSource {
  name: string;
  url: string;
  parse: (payload: unknown) => PublicGeoData | null;
}

interface PublicIpSource {
  name: string;
  url: string;
  parse: (payload: unknown) => string | null;
}

interface NetworkLookupOptions {
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
}

interface CachedGeoLookupOptions extends NetworkLookupOptions {
  cacheKey?: string;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
}

interface GeoCacheEntry {
  data: PublicGeoData;
  timestamp: number;
}

const DEFAULT_GEO_CACHE_KEY = '@ivx_public_geo';
const DEFAULT_GEO_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 3500;
const DEFAULT_TOTAL_TIMEOUT_MS = 9000;

function getRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function readNestedString(record: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const nested = getRecord(record[key]);
  if (!nested) {
    return undefined;
  }

  return readString(nested, nestedKey);
}

function normalizeCountryCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function parseLocCoordinates(value: string | undefined): { lat?: number; lng?: number } {
  if (!value) {
    return {};
  }

  const parts = value.split(',');
  if (parts.length !== 2) {
    return {};
  }

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  return {
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
  };
}

function isErrorPayload(record: Record<string, unknown>): boolean {
  const status = readString(record, 'status');
  const success = record.success;
  const error = record.error;

  if (status === 'fail') {
    return true;
  }

  if (typeof success === 'boolean' && !success) {
    return true;
  }

  if (typeof error === 'boolean' && error) {
    return true;
  }

  return false;
}

function normalizeGeoData(data: PublicGeoData | null, source: string): PublicGeoData | null {
  if (!data) {
    return null;
  }

  const normalized: PublicGeoData = {
    ip: data.ip?.trim() || undefined,
    city: data.city?.trim() || undefined,
    region: data.region?.trim() || undefined,
    country: data.country?.trim() || undefined,
    countryCode: normalizeCountryCode(data.countryCode),
    lat: typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : undefined,
    lng: typeof data.lng === 'number' && Number.isFinite(data.lng) ? data.lng : undefined,
    timezone: data.timezone?.trim() || undefined,
    org: data.org?.trim() || undefined,
    source,
  };

  if (!normalized.ip && !normalized.country && !normalized.city && !normalized.region) {
    return null;
  }

  return normalized;
}

const GEO_SOURCES: PublicGeoSource[] = [
  {
    name: 'ipapi',
    url: 'https://ipapi.co/json/',
    parse: (payload: unknown): PublicGeoData | null => {
      const record = getRecord(payload);
      if (!record) {
        return null;
      }

      return {
        ip: readString(record, 'ip'),
        city: readString(record, 'city'),
        region: readString(record, 'region'),
        country: readString(record, 'country_name') ?? readString(record, 'country'),
        countryCode: readString(record, 'country_code'),
        lat: readNumber(record, 'latitude'),
        lng: readNumber(record, 'longitude'),
        timezone: readString(record, 'timezone'),
        org: readString(record, 'org') ?? readString(record, 'asn'),
      };
    },
  },
  {
    name: 'ipwho',
    url: 'https://ipwho.is/',
    parse: (payload: unknown): PublicGeoData | null => {
      const record = getRecord(payload);
      if (!record) {
        return null;
      }

      const connection = getRecord(record.connection);

      return {
        ip: readString(record, 'ip'),
        city: readString(record, 'city'),
        region: readString(record, 'region'),
        country: readString(record, 'country'),
        countryCode: readString(record, 'country_code'),
        lat: readNumber(record, 'latitude'),
        lng: readNumber(record, 'longitude'),
        timezone: readNestedString(record, 'timezone', 'id') ?? readString(record, 'timezone'),
        org: connection ? readString(connection, 'org') ?? readString(connection, 'isp') : undefined,
      };
    },
  },
  {
    name: 'ipinfo',
    url: 'https://ipinfo.io/json',
    parse: (payload: unknown): PublicGeoData | null => {
      const record = getRecord(payload);
      if (!record) {
        return null;
      }

      const coords = parseLocCoordinates(readString(record, 'loc'));
      const countryCode = normalizeCountryCode(readString(record, 'country'));

      return {
        ip: readString(record, 'ip'),
        city: readString(record, 'city'),
        region: readString(record, 'region'),
        country: countryCode,
        countryCode,
        lat: coords.lat,
        lng: coords.lng,
        timezone: readString(record, 'timezone'),
        org: readString(record, 'org'),
      };
    },
  },
];

const IP_SOURCES: PublicIpSource[] = [
  {
    name: 'ipify',
    url: 'https://api.ipify.org?format=json',
    parse: (payload: unknown): string | null => {
      const record = getRecord(payload);
      return record ? readString(record, 'ip') ?? null : null;
    },
  },
  {
    name: 'ipify64',
    url: 'https://api64.ipify.org?format=json',
    parse: (payload: unknown): string | null => {
      const record = getRecord(payload);
      return record ? readString(record, 'ip') ?? null : null;
    },
  },
  {
    name: 'ipwho',
    url: 'https://ipwho.is/',
    parse: (payload: unknown): string | null => {
      const record = getRecord(payload);
      return record ? readString(record, 'ip') ?? null : null;
    },
  },
  {
    name: 'ipapi',
    url: 'https://ipapi.co/json/',
    parse: (payload: unknown): string | null => {
      const record = getRecord(payload);
      return record ? readString(record, 'ip') ?? null : null;
    },
  },
];

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.log('[Geo] Source returned non-OK status:', url, response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.log('[Geo] Source request failed:', url, (error as Error)?.message ?? 'Unknown error');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPublicGeoData(options: NetworkLookupOptions = {}): Promise<PublicGeoData | null> {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const startedAt = Date.now();

  for (const source of GEO_SOURCES) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      console.log('[Geo] Geo lookup timed out before source:', source.name);
      break;
    }

    const timeoutMs = Math.max(1000, Math.min(requestTimeoutMs, remainingMs));
    const payload = await fetchJson(source.url, timeoutMs);
    const record = getRecord(payload);

    if (!record) {
      continue;
    }

    if (isErrorPayload(record)) {
      console.log('[Geo] Source returned error payload:', source.name, readString(record, 'message') ?? readString(record, 'reason') ?? 'Unknown error');
      continue;
    }

    const geo = normalizeGeoData(source.parse(record), source.name);
    if (geo?.country || geo?.city || geo?.region) {
      console.log('[Geo] Geo resolved:', geo.ip ?? 'no-ip', geo.city ?? 'no-city', geo.country ?? 'no-country', '| source:', source.name);
      return geo;
    }

    console.log('[Geo] Source returned partial geo without usable location:', source.name);
  }

  console.log('[Geo] Geo lookup failed across all sources');
  return null;
}

export async function fetchPublicIpAddress(options: NetworkLookupOptions = {}): Promise<string | null> {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const startedAt = Date.now();

  for (const source of IP_SOURCES) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      console.log('[Geo] IP lookup timed out before source:', source.name);
      break;
    }

    const timeoutMs = Math.max(1000, Math.min(requestTimeoutMs, remainingMs));
    const payload = await fetchJson(source.url, timeoutMs);
    const record = getRecord(payload);

    if (!record) {
      continue;
    }

    if (isErrorPayload(record)) {
      console.log('[Geo] IP source returned error payload:', source.name, readString(record, 'message') ?? readString(record, 'reason') ?? 'Unknown error');
      continue;
    }

    const ip = source.parse(record);
    if (ip) {
      console.log('[Geo] IP resolved:', ip, '| source:', source.name);
      return ip;
    }
  }

  console.log('[Geo] IP lookup failed across all sources');
  return null;
}

export async function getCachedPublicGeoData(options: CachedGeoLookupOptions = {}): Promise<PublicGeoData | null> {
  const cacheKey = options.cacheKey ?? DEFAULT_GEO_CACHE_KEY;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_GEO_CACHE_TTL_MS;

  if (!options.forceRefresh) {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as GeoCacheEntry;
        if (parsed?.data && typeof parsed.timestamp === 'number' && Date.now() - parsed.timestamp < cacheTtlMs) {
          const cachedGeo = normalizeGeoData(parsed.data, parsed.data.source ?? 'cache');
          if (cachedGeo) {
            console.log('[Geo] Using cached geo:', cachedGeo.city ?? 'no-city', cachedGeo.country ?? 'no-country');
            return cachedGeo;
          }
        }
      }
    } catch (error) {
      console.log('[Geo] Failed to read cached geo:', (error as Error)?.message ?? 'Unknown error');
    }
  }

  const freshGeo = await fetchPublicGeoData(options);
  if (freshGeo) {
    try {
      const cacheEntry: GeoCacheEntry = {
        data: freshGeo,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      console.log('[Geo] Failed to cache geo:', (error as Error)?.message ?? 'Unknown error');
    }
  }

  return freshGeo;
}

export async function clearCachedPublicGeoData(cacheKey: string = DEFAULT_GEO_CACHE_KEY): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey);
  } catch (error) {
    console.log('[Geo] Failed to clear cached geo:', (error as Error)?.message ?? 'Unknown error');
  }
}
