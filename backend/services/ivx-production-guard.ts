/**
 * IVX Production Guard — self-healing rollback trigger.
 *
 * Observes the rolling failure rate from the incident store. If it crosses
 * the configured threshold over the configured window, triggers a Render
 * rollback to the previous deploy via the Render API, then records a
 * critical incident describing exactly what happened.
 *
 * Behavior is idempotent: a rollback in flight will not be retriggered until
 * the cooldown elapses.
 */

import { getRollingFailureRate, recordIncident } from './ivx-incident-store';

const FAILURE_RATE_THRESHOLD = 0.5;
const WINDOW_SIZE = 50;
const COOLDOWN_MS = 5 * 60 * 1000;

let lastRollbackAt = 0;
let rollbackInFlight = false;

export type ProductionHealth = {
  failureRate: number;
  total: number;
  failures: number;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
  thresholdExceeded: boolean;
  rollbackInFlight: boolean;
  lastRollbackAt: string | null;
  renderConfigured: boolean;
  cooldownMs: number;
};

export function getProductionHealth(): ProductionHealth {
  const rolling = getRollingFailureRate(WINDOW_SIZE);
  return {
    failureRate: rolling.rate,
    total: rolling.total,
    failures: rolling.failures,
    windowStartedAt: rolling.windowStartedAt,
    windowEndedAt: rolling.windowEndedAt,
    thresholdExceeded: rolling.total >= 10 && rolling.rate >= FAILURE_RATE_THRESHOLD,
    rollbackInFlight,
    lastRollbackAt: lastRollbackAt > 0 ? new Date(lastRollbackAt).toISOString() : null,
    renderConfigured: Boolean(process.env.RENDER_API_KEY && process.env.RENDER_SERVICE_ID),
    cooldownMs: COOLDOWN_MS,
  };
}

type RenderDeploy = {
  id: string;
  status?: string;
  createdAt?: string;
  finishedAt?: string | null;
};

async function fetchRenderDeploys(): Promise<RenderDeploy[]> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const serviceId = process.env.RENDER_SERVICE_ID?.trim();
  if (!apiKey || !serviceId) throw new Error('Render API not configured (RENDER_API_KEY / RENDER_SERVICE_ID).');
  const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys?limit=10`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Render list deploys failed: ${response.status} ${body.slice(0, 200)}`);
  }
  const data = await response.json() as Array<{ deploy?: RenderDeploy }> | { deploys?: RenderDeploy[] };
  const arr = Array.isArray(data) ? data.map((d) => d.deploy).filter((d): d is RenderDeploy => Boolean(d)) : (data.deploys ?? []);
  return arr;
}

async function triggerRenderRollbackTo(deployId: string): Promise<{ ok: boolean; newDeployId: string | null; error?: string }> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const serviceId = process.env.RENDER_SERVICE_ID?.trim();
  if (!apiKey || !serviceId) return { ok: false, newDeployId: null, error: 'Render API not configured.' };
  try {
    const response = await fetch(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/rollback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ deployId }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, newDeployId: null, error: `Render rollback failed: ${response.status} ${body.slice(0, 200)}` };
    }
    const data = await response.json().catch(() => ({})) as { id?: string };
    return { ok: true, newDeployId: data.id ?? null };
  } catch (error) {
    return { ok: false, newDeployId: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export type RollbackResult = {
  ok: boolean;
  triggered: boolean;
  reason: string;
  targetDeployId: string | null;
  newDeployId: string | null;
  incidentId: string | null;
};

/**
 * Trigger a rollback to the most recent successful previous deploy.
 * `force=true` bypasses the threshold check (used by the manual endpoint).
 */
export async function triggerProductionRollback(input: { force?: boolean; reason?: string } = {}): Promise<RollbackResult> {
  const force = input.force === true;
  const reasonInput = (input.reason ?? '').trim() || 'Automated production guard rollback.';

  if (rollbackInFlight) {
    return { ok: false, triggered: false, reason: 'Rollback already in flight.', targetDeployId: null, newDeployId: null, incidentId: null };
  }
  const now = Date.now();
  if (!force && now - lastRollbackAt < COOLDOWN_MS) {
    return { ok: false, triggered: false, reason: 'Rollback cooldown active.', targetDeployId: null, newDeployId: null, incidentId: null };
  }

  if (!force) {
    const health = getProductionHealth();
    if (!health.thresholdExceeded) {
      return { ok: false, triggered: false, reason: `Failure rate ${health.failureRate.toFixed(2)} below threshold.`, targetDeployId: null, newDeployId: null, incidentId: null };
    }
  }

  rollbackInFlight = true;
  try {
    let deploys: RenderDeploy[];
    try {
      deploys = await fetchRenderDeploys();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const incident = recordIncident({
        source: 'rollback',
        severity: 'critical',
        message: `Production guard could not list deploys: ${message}`,
        suggestedFix: 'Verify RENDER_API_KEY and RENDER_SERVICE_ID are set on the backend.',
      });
      return { ok: false, triggered: false, reason: message, targetDeployId: null, newDeployId: null, incidentId: incident.id };
    }
    const successful = deploys.filter((d) => (d.status ?? '').toLowerCase().includes('live') || (d.status ?? '').toLowerCase().includes('success'));
    const previous = successful[1] ?? successful[0] ?? null;
    if (!previous) {
      const incident = recordIncident({
        source: 'rollback',
        severity: 'critical',
        message: 'Production guard found no previous successful deploy to roll back to.',
        suggestedFix: 'Manually investigate Render dashboard.',
      });
      return { ok: false, triggered: false, reason: 'No previous deploy available.', targetDeployId: null, newDeployId: null, incidentId: incident.id };
    }

    const result = await triggerRenderRollbackTo(previous.id);
    lastRollbackAt = Date.now();
    const incident = recordIncident({
      source: 'rollback',
      severity: 'critical',
      message: result.ok
        ? `Production guard rolled back to deploy ${previous.id}: ${reasonInput}`
        : `Production guard rollback FAILED for deploy ${previous.id}: ${result.error ?? 'unknown error'}`,
      suggestedFix: result.ok ? null : 'Investigate Render API logs and manually trigger rollback.',
    });
    return {
      ok: result.ok,
      triggered: result.ok,
      reason: result.ok ? reasonInput : (result.error ?? 'rollback failed'),
      targetDeployId: previous.id,
      newDeployId: result.newDeployId,
      incidentId: incident.id,
    };
  } finally {
    rollbackInFlight = false;
  }
}

/**
 * Hook called after recording an incident. Evaluates health and auto-triggers
 * rollback when threshold is exceeded. Best-effort, never throws.
 */
export async function evaluateAndMaybeRollback(): Promise<void> {
  try {
    const health = getProductionHealth();
    if (!health.thresholdExceeded) return;
    if (!health.renderConfigured) return;
    if (rollbackInFlight) return;
    if (Date.now() - lastRollbackAt < COOLDOWN_MS) return;
    await triggerProductionRollback({ reason: `Auto-trigger: failure rate ${health.failureRate.toFixed(2)} over last ${health.total} events.` });
  } catch {
    // best-effort
  }
}
