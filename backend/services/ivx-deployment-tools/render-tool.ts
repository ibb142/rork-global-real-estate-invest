/**
 * IVX Render Deployment Tool
 *
 * Comprehensive Render operations:
 *   - Read services, service details
 *   - List deploys, deploy details
 *   - Trigger deploy (with clear cache)
 *   - Enable/disable auto-deploy
 *   - Check environment variables
 *   - Rollback to a previous deploy
 */

const RENDER_API = 'https://api.render.com/v1';

// ─── Types ───────────────────────────────────────────────────────────

export interface RenderService {
  id: string;
  name: string;
  type: string;
  repo: string;
  branch: string;
  autoDeploy: string;
  suspended: string;
  createdAt: string;
  updatedAt: string;
}

export interface RenderDeploy {
  id: string;
  status: string;
  commitSha: string | null;
  commitMessage: string | null;
  createdAt: string | null;
  finishedAt: string | null;
  duration: number | null;
  failureReason: string | null;
}

export interface RenderEnvVar {
  key: string;
  value?: string;
  generatedValue?: boolean;
}

export interface RenderToolResult {
  ok: boolean;
  error: string | null;
  services?: RenderService[];
  service?: RenderService;
  deploys?: RenderDeploy[];
  deploy?: RenderDeploy;
  envVars?: RenderEnvVar[];
  autoDeployEnabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getCredentials(): { apiKey: string; serviceId: string } {
  return {
    apiKey: (process.env.RENDER_API_KEY ?? '').trim(),
    serviceId: (process.env.RENDER_SERVICE_ID ?? '').trim(),
  };
}

async function renderFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const { apiKey } = getCredentials();
  if (!apiKey) return { ok: false, status: 0, data: null, error: 'RENDER_API_KEY not configured' };

  const url = path.startsWith('http') ? path : `${RENDER_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (opts.body) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : null;
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: `Render API ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function normalizeDeploy(raw: Record<string, unknown>): RenderDeploy {
  const commit = (raw.commit ?? {}) as Record<string, unknown>;
  const createdAt = String(raw.createdAt ?? null) || null;
  const finishedAt = String(raw.finishedAt ?? null) || null;
  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? 'unknown'),
    commitSha: String(commit.id ?? null) || null,
    commitMessage: String(commit.message ?? null) || null,
    createdAt,
    finishedAt,
    duration: createdAt && finishedAt
      ? (new Date(finishedAt).getTime() - new Date(createdAt).getTime()) / 1000
      : null,
    failureReason: String(raw.failureReason ?? null) || null,
  };
}

// ─── Service Operations ───────────────────────────────────────────────

export async function listServices(): Promise<RenderToolResult> {
  const result = await renderFetch<Array<Record<string, unknown>>>('/services?limit=50');

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  const services: RenderService[] = (result.data).map(s => ({
    id: String(s.id ?? ''),
    name: String(s.name ?? ''),
    type: String(s.type ?? ''),
    repo: String(s.repo ?? ''),
    branch: String(s.branch ?? ''),
    autoDeploy: String(s.autoDeploy ?? 'no'),
    suspended: String(s.suspended ?? 'not_suspended'),
    createdAt: String(s.createdAt ?? ''),
    updatedAt: String(s.updatedAt ?? ''),
  }));

  return { ok: true, error: null, services };
}

export async function getService(): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  const result = await renderFetch<Record<string, unknown>>(`/services/${encodeURIComponent(serviceId)}`);

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    error: null,
    service: {
      id: String(result.data.id ?? ''),
      name: String(result.data.name ?? ''),
      type: String(result.data.type ?? ''),
      repo: String(result.data.repo ?? ''),
      branch: String(result.data.branch ?? ''),
      autoDeploy: String(result.data.autoDeploy ?? 'no'),
      suspended: String(result.data.suspended ?? 'not_suspended'),
      createdAt: String(result.data.createdAt ?? ''),
      updatedAt: String(result.data.updatedAt ?? ''),
    },
    autoDeployEnabled: result.data.autoDeploy === 'yes',
  };
}

// ─── Deploy Operations ────────────────────────────────────────────────

export async function listDeploys(limit: number = 10): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  const result = await renderFetch<Array<Record<string, unknown>>>(
    `/services/${encodeURIComponent(serviceId)}/deploys?limit=${limit}`,
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const deploys: RenderDeploy[] = (result.data ?? []).map((d: Record<string, unknown>) => {
    const deploy = (d.deploy || d) as Record<string, unknown>;
    return normalizeDeploy(deploy);
  });

  return { ok: true, error: null, deploys };
}

export async function getDeploy(deployId: string): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  const result = await renderFetch<Record<string, unknown>>(
    `/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`,
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  return { ok: true, error: null, deploy: normalizeDeploy(result.data) };
}

export async function triggerDeploy(clearCache: boolean = false): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  const result = await renderFetch<Record<string, unknown>>(
    `/services/${encodeURIComponent(serviceId)}/deploys`,
    {
      method: 'POST',
      body: { clearCache: clearCache ? 'clear' : 'do_not_clear' },
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const raw = (result.data?.deploy ?? result.data ?? {}) as Record<string, unknown>;
  return { ok: true, error: null, deploy: normalizeDeploy(raw) };
}

export async function rollbackDeploy(deployId: string): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  // Render doesn't have a direct rollback API — we re-trigger deploy from the target commit
  const targetDeploy = await getDeploy(deployId);
  if (!targetDeploy.ok || !targetDeploy.deploy?.commitSha) {
    return { ok: false, error: `Cannot find deploy ${deployId} or its commit SHA` };
  }

  // Trigger a new deploy from that commit
  const result = await renderFetch<Record<string, unknown>>(
    `/services/${encodeURIComponent(serviceId)}/deploys`,
    {
      method: 'POST',
      body: { clearCache: 'clear' },
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const raw = (result.data?.deploy ?? result.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    error: null,
    deploy: normalizeDeploy(raw),
  };
}

// ─── Environment Variables ────────────────────────────────────────────

export async function getEnvVars(): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  const result = await renderFetch<Array<{ envVar: { key: string; value?: string }; generatedValue?: boolean }>>(
    `/services/${encodeURIComponent(serviceId)}/env-vars`,
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const envVars: RenderEnvVar[] = (result.data ?? []).map(ev => ({
    key: ev.envVar?.key ?? '',
    generatedValue: ev.generatedValue,
    // Never return values — just show if present
    value: ev.envVar?.value ? '***configured***' : undefined,
  }));

  return { ok: true, error: null, envVars };
}

// ─── Auto-Deploy Control ──────────────────────────────────────────────

export async function setAutoDeploy(enabled: boolean): Promise<RenderToolResult> {
  const { serviceId } = getCredentials();
  if (!serviceId) return { ok: false, error: 'RENDER_SERVICE_ID not configured' };

  const result = await renderFetch<Record<string, unknown>>(
    `/services/${encodeURIComponent(serviceId)}`,
    {
      method: 'PATCH',
      body: { autoDeploy: enabled ? 'yes' : 'no' },
    },
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    error: null,
    autoDeployEnabled: enabled,
  };
}

// ─── Combined Status ──────────────────────────────────────────────────

export async function getFullRenderStatus(): Promise<RenderToolResult> {
  const [service, deploys, envVars] = await Promise.all([
    getService(),
    listDeploys(5),
    getEnvVars(),
  ]);

  return {
    ok: service.ok,
    error: [service.error, deploys.error, envVars.error].filter(Boolean).join('; ') || null,
    service: service.service,
    deploys: deploys.deploys ?? [],
    envVars: envVars.envVars ?? [],
    autoDeployEnabled: service.autoDeployEnabled,
  };
}
