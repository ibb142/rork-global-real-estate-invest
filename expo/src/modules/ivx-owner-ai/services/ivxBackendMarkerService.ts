import { getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';

/**
 * Live backend build identity, fetched from the deployed `GET /health` endpoint.
 *
 * The IVX backend surfaces its `deploymentMarker`, git `commit`/`commitShort`,
 * and `bootTime` on `/health` (see `backend/hono.ts`). The Production
 * Diagnostics screen fetches this live so the owner can confirm — from the
 * device — exactly which backend build is serving `api.ivxholding.com` and
 * whether it matches the frontend bundle the device is running.
 */
export type IVXBackendMarker = {
  /** True when /health returned HTTP 2xx. */
  reachable: boolean;
  /** Exact HTTP status code from /health, or null if the request never completed. */
  httpStatus: number | null;
  /** The absolute /health URL that was probed. */
  url: string | null;
  /** Backend deployment marker string (e.g. ivx-owner-ai-hono-2026-06-07...). */
  deploymentMarker: string | null;
  /** Full deployed git commit SHA, when Render injects RENDER_GIT_COMMIT. */
  commit: string | null;
  /** Short (8-char) deployed git commit, or null/'unknown' for local runs. */
  commitShort: string | null;
  /** ISO timestamp the backend process booted (proves a fresh deploy). */
  bootTime: string | null;
  /** ISO timestamp the backend reported when answering (server clock). */
  serverTimestamp: string | null;
  /** Reason the probe failed, when `reachable` is false. */
  error: string | null;
  /** ISO timestamp this probe was captured on the device. */
  fetchedAt: string;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Resolve the live `/health` URL from the same routing audit the app uses for sends. */
export function resolveBackendHealthUrl(): string | null {
  const audit = getIVXOwnerAIConfigAudit();
  if (audit.healthCheckUrl) {
    return audit.healthCheckUrl;
  }
  const base = audit.activeBaseUrl;
  if (!base) {
    return null;
  }
  return `${base.replace(/\/+$/, '')}/health`;
}

const HEALTH_TIMEOUT_MS = 12000;

/**
 * Fetches the live backend build marker from `GET /health`. Never throws — it
 * always resolves to a fully-populated record so the diagnostics UI can render
 * an honest reachable/unreachable state.
 */
export async function fetchBackendMarker(): Promise<IVXBackendMarker> {
  const fetchedAt = new Date().toISOString();
  const url = resolveBackendHealthUrl();

  if (!url) {
    return {
      reachable: false,
      httpStatus: null,
      url: null,
      deploymentMarker: null,
      commit: null,
      commitShort: null,
      bootTime: null,
      serverTimestamp: null,
      error: 'No backend base URL is configured (Owner AI routing is blocked).',
      fetchedAt,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: Record<string, unknown> | null = null;
    try {
      const parsed = text ? (JSON.parse(text) as unknown) : null;
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      body = null;
    }

    return {
      reachable: response.ok,
      httpStatus: response.status,
      url,
      deploymentMarker: readString(body?.deploymentMarker),
      commit: readString(body?.commit),
      commitShort: readString(body?.commitShort),
      bootTime: readString(body?.bootTime),
      serverTimestamp: readString(body?.timestamp),
      error: response.ok ? null : `Backend /health returned HTTP ${response.status}.`,
      fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    return {
      reachable: false,
      httpStatus: null,
      url,
      deploymentMarker: null,
      commit: null,
      commitShort: null,
      bootTime: null,
      serverTimestamp: null,
      error: /abort/i.test(message) ? 'Backend /health timed out.' : message,
      fetchedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}
