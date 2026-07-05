/**
 * IVX operational metrics service (owner-only).
 *
 * Thin client over the owner-gated metrics API so the in-app Diagnostics screen
 * can show real 24-hour + lifetime metrics: crash counter, API latency, Supabase
 * query latency, OpenAI request latency, owner-route success rate, and
 * deliverable generation success rate.
 *
 * Auth + base URL reuse the same owner-session pattern as the rest of the IVX
 * developer module (`getDirectApiBaseUrl` + `getIVXAccessToken`).
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type LatencyStats = {
  count: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  minMs: number | null;
};

export type SuccessStats = {
  total: number;
  success: number;
  failure: number;
  successRate: number | null;
};

export type CountStats = {
  count: number;
};

export type Windowed<T> = {
  last24h: T;
  lifetime: T;
};

export type MetricsSnapshot = {
  marker: string;
  storeMarker: string;
  generatedAt: string;
  coverageStart: string | null;
  totalSamples: number;
  crashCounter: Windowed<CountStats>;
  apiLatency: Windowed<LatencyStats>;
  supabaseQueryLatency: Windowed<LatencyStats>;
  openaiRequestLatency: Windowed<LatencyStats>;
  ownerRouteSuccessRate: Windowed<SuccessStats>;
  deliverableSuccessRate: Windowed<SuccessStats>;
};

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function readError(payload: unknown, fallback: string): string {
  const record = readRecord(payload);
  return typeof record.error === 'string' && record.error.trim() ? record.error.trim() : fallback;
}

/**
 * Fetch the full metrics snapshot (24h + lifetime). Throws a readable error when
 * the owner session is unavailable or the route rejects.
 */
export async function getMetricsSnapshot(): Promise<MetricsSnapshot> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(`${backendBaseUrl()}/api/ivx/metrics`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `IVX metrics request failed with HTTP ${response.status}.`));
  }
  const record = readRecord(payload);
  return record.metrics as MetricsSnapshot;
}
