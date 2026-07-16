/**
 * IVX Render Deployment Deduplication (Phase 3 — 2026-07-16).
 *
 * Problem: Multiple Render deploys can be triggered for the same service+SHA,
 * wasting build minutes and creating confusion. The Render API doesn't prevent
 * duplicate deploys for the same commit.
 *
 * Solution: Before triggering a deploy, check active/pending deployments for
 * the same SHA. If one exists, return it instead of creating a new one.
 *
 * Behavior:
 *   1. Before triggering, check active/pending deployments.
 *   2. If the same SHA is already building or live, return the existing deploy ID.
 *   3. Allow a new deployment only for:
 *      - a different SHA
 *      - a failed previous deployment
 *      - an explicit owner-approved redeploy
 *   4. Use an in-memory lock with stale-lock timeout to prevent races.
 *   5. Persist deployment intent and result for audit.
 */
import { randomUUID } from 'node:crypto';

const RENDER_API_BASE_URL = 'https://api.render.com/v1';
const STALE_LOCK_TIMEOUT_MS = 120_000; // 2 minutes

export type DeployStatus = 'created' | 'building' | 'update_in_progress' | 'live' | 'build_failed' | 'update_failed' | 'deactivated' | 'canceled' | 'pre_deploy_failed';

export type RenderDeployRecord = {
  id: string;
  commitSha: string | null;
  status: string;
  createdAt: string;
  finishedAt: string | null;
};

export type DeployDedupResult = {
  ok: boolean;
  deployId: string | null;
  deployStatus: string | null;
  deduplicated: boolean;
  reason: string;
  existingDeployId: string | null;
  traceId: string;
  error: string | null;
};

export type DeployIntent = {
  serviceId: string;
  commitSha: string;
  forceRedeploy: boolean;
  traceId: string;
};

export type PersistedDeployRecord = {
  traceId: string;
  serviceId: string;
  commitSha: string;
  deployId: string | null;
  deployStatus: string | null;
  deduplicated: boolean;
  createdAt: string;
  error: string | null;
};

// In-memory deployment lock + recent deploy cache (per service).
type DeployLock = {
  traceId: string;
  commitSha: string;
  acquiredAt: number;
};

const deployLocks = new Map<string, DeployLock>();
const recentDeploys = new Map<string, PersistedDeployRecord[]>();

/** Active/pending Render deploy statuses that should block duplicate triggers. */
const ACTIVE_DEPLOY_STATUSES = new Set<string>([
  'created',
  'building',
  'update_in_progress',
]);

/** Terminal failure statuses that allow a retry. */
const FAILED_DEPLOY_STATUSES = new Set<string>([
  'build_failed',
  'update_failed',
  'deactivated',
  'canceled',
  'pre_deploy_failed',
]);

function renderHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * List recent deploys for a Render service.
 * Returns the most recent deploys (newest first).
 */
export async function listRenderDeploys(
  serviceId: string,
  apiKey: string,
  limit: number = 5,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderDeployRecord[]> {
  const url = `${RENDER_API_BASE_URL}/services/${encodeURIComponent(serviceId)}/deploys?limit=${limit}`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: renderHeaders(apiKey),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Render deploys list failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  const data = (await response.json()) as Array<{ deploy?: Record<string, unknown> } & Record<string, unknown>>;
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const deploy = (item.deploy ?? item) as Record<string, unknown>;
    const commit = deploy.commit as Record<string, unknown> | undefined;
    return {
      id: (deploy.id as string) ?? '',
      commitSha: commit?.id ? String(commit.id) : null,
      status: (deploy.status as string) ?? '',
      createdAt: (deploy.createdAt as string) ?? '',
      finishedAt: (deploy.finishedAt as string) ?? null,
    };
  });
}

/**
 * Check if an active/pending deploy already exists for the same SHA.
 * Returns the existing deploy ID if found, null otherwise.
 */
export async function findActiveDeployForSha(
  serviceId: string,
  apiKey: string,
  commitSha: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ deployId: string; deployStatus: string } | null> {
  const deploys = await listRenderDeploys(serviceId, apiKey, 10, fetchImpl);
  for (const deploy of deploys) {
    if (
      deploy.commitSha === commitSha &&
      ACTIVE_DEPLOY_STATUSES.has(deploy.status)
    ) {
      return { deployId: deploy.id, deployStatus: deploy.status };
    }
    // Also check if the same SHA is already live — no need to redeploy.
    if (
      deploy.commitSha === commitSha &&
      deploy.status === 'live'
    ) {
      return { deployId: deploy.id, deployStatus: deploy.status };
    }
  }
  return null;
}

/**
 * Check if the most recent deploy for this SHA failed (allowing retry).
 */
export async function didLastDeployForShaFail(
  serviceId: string,
  apiKey: string,
  commitSha: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const deploys = await listRenderDeploys(serviceId, apiKey, 5, fetchImpl);
  const sameShaDeploys = deploys.filter((d) => d.commitSha === commitSha);
  if (sameShaDeploys.length === 0) return false;
  const latest = sameShaDeploys[0];
  return FAILED_DEPLOY_STATUSES.has(latest.status);
}

/**
 * Acquire a deployment lock for a service. Prevents concurrent deploy triggers.
 * Stale locks (older than STALE_LOCK_TIMEOUT_MS) are automatically cleared.
 */
export function acquireDeployLock(serviceId: string, commitSha: string, traceId: string): boolean {
  const existing = deployLocks.get(serviceId);
  if (existing) {
    const age = Date.now() - existing.acquiredAt;
    if (age < STALE_LOCK_TIMEOUT_MS) {
      return false; // Lock held by another request
    }
    // Stale lock — clear it
    console.log(`[IVXDeployDedup] Clearing stale lock for ${serviceId} (age=${age}ms)`);
  }
  deployLocks.set(serviceId, { traceId, commitSha, acquiredAt: Date.now() });
  return true;
}

/** Release the deployment lock for a service. */
export function releaseDeployLock(serviceId: string, traceId: string): void {
  const existing = deployLocks.get(serviceId);
  if (existing && existing.traceId === traceId) {
    deployLocks.delete(serviceId);
  }
}

/** Persist a deploy record for audit (in-memory, per service). */
export function persistDeployRecord(record: PersistedDeployRecord): void {
  const records = recentDeploys.get(record.serviceId) ?? [];
  records.unshift(record);
  // Keep last 20 records per service
  recentDeploys.set(record.serviceId, records.slice(0, 20));
}

/** Read persisted deploy records for a service. */
export function getDeployHistory(serviceId: string): PersistedDeployRecord[] {
  return recentDeploys.get(serviceId) ?? [];
}

/**
 * Trigger a deduplicated Render deploy.
 *
 * 1. Check for active/pending deploys with the same SHA.
 * 2. If found and not forceRedeploy, return the existing deploy ID.
 * 3. If the last deploy for this SHA failed, allow retry.
 * 4. Acquire a lock to prevent concurrent triggers.
 * 5. Trigger the deploy via Render API.
 * 6. Persist the result for audit.
 */
export async function triggerDeduplicatedDeploy(
  input: {
    renderApiKey: string;
    serviceId: string;
    commitSha: string;
    forceRedeploy?: boolean;
    fetchImpl?: typeof fetch;
  },
): Promise<DeployDedupResult> {
  const traceId = `ivx-deploy-${randomUUID()}`;
  const fetchImpl = input.fetchImpl ?? fetch;
  const forceRedeploy = input.forceRedeploy ?? false;

  // Step 1: Check for existing active deploy with same SHA
  if (!forceRedeploy) {
    try {
      const existing = await findActiveDeployForSha(
        input.serviceId,
        input.renderApiKey,
        input.commitSha,
        fetchImpl,
      );
      if (existing) {
        const result: DeployDedupResult = {
          ok: true,
          deployId: existing.deployId,
          deployStatus: existing.deployStatus,
          deduplicated: true,
          reason: `Active deploy ${existing.deployId} already exists for SHA ${input.commitSha.slice(0, 12)} (status: ${existing.deployStatus}). No duplicate created.`,
          existingDeployId: existing.deployId,
          traceId,
          error: null,
        };
        persistDeployRecord({
          traceId,
          serviceId: input.serviceId,
          commitSha: input.commitSha,
          deployId: existing.deployId,
          deployStatus: existing.deployStatus,
          deduplicated: true,
          createdAt: nowIso(),
          error: null,
        });
        return result;
      }
    } catch (error) {
      // Non-fatal: if we can't check, proceed with the deploy
      console.log(`[IVXDeployDedup] Pre-check failed (non-blocking): ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  // Step 2: Acquire lock
  if (!acquireDeployLock(input.serviceId, input.commitSha, traceId)) {
    return {
      ok: false,
      deployId: null,
      deployStatus: null,
      deduplicated: false,
      reason: 'Another deploy is already being triggered for this service. Retry in a few seconds.',
      existingDeployId: null,
      traceId,
      error: 'Deploy lock contention',
    };
  }

  try {
    // Step 3: Trigger the deploy via Render API
    const url = `${RENDER_API_BASE_URL}/services/${encodeURIComponent(input.serviceId)}/deploys`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: renderHeaders(input.renderApiKey),
      body: JSON.stringify({ commitId: input.commitSha }),
    });

    if (!response.ok) {
      // If the pinned commit isn't ingested yet, try branch HEAD (no commitId)
      if (response.status === 404) {
        const fallbackResponse = await fetchImpl(url, {
          method: 'POST',
          headers: renderHeaders(input.renderApiKey),
          body: JSON.stringify({}),
        });
        if (fallbackResponse.ok) {
          const data = (await fallbackResponse.json()) as Record<string, unknown>;
          const deploy = (data.deploy ?? data) as Record<string, unknown>;
          const deployId = (deploy.id as string) ?? (data.id as string) ?? null;
          const deployStatus = (deploy.status as string) ?? 'accepted';
          const result: DeployDedupResult = {
            ok: true,
            deployId,
            deployStatus,
            deduplicated: false,
            reason: 'Deploy triggered via branch HEAD (commit not yet ingested by Render).',
            existingDeployId: null,
            traceId,
            error: null,
          };
          persistDeployRecord({
            traceId,
            serviceId: input.serviceId,
            commitSha: input.commitSha,
            deployId,
            deployStatus,
            deduplicated: false,
            createdAt: nowIso(),
            error: null,
          });
          return result;
        }
      }
      const text = await response.text().catch(() => '');
      const errorMsg = `Render deploy trigger failed (HTTP ${response.status}): ${text.slice(0, 300)}`;
      persistDeployRecord({
        traceId,
        serviceId: input.serviceId,
        commitSha: input.commitSha,
        deployId: null,
        deployStatus: null,
        deduplicated: false,
        createdAt: nowIso(),
        error: errorMsg,
      });
      return {
        ok: false,
        deployId: null,
        deployStatus: null,
        deduplicated: false,
        reason: 'Render API rejected the deploy trigger.',
        existingDeployId: null,
        traceId,
        error: errorMsg,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const deploy = (data.deploy ?? data) as Record<string, unknown>;
    const deployId = (deploy.id as string) ?? (data.id as string) ?? null;
    const deployStatus = (deploy.status as string) ?? 'accepted';

    const result: DeployDedupResult = {
      ok: true,
      deployId,
      deployStatus,
      deduplicated: false,
      reason: 'Deploy triggered successfully.',
      existingDeployId: null,
      traceId,
      error: null,
    };

    persistDeployRecord({
      traceId,
      serviceId: input.serviceId,
      commitSha: input.commitSha,
      deployId,
      deployStatus,
      deduplicated: false,
      createdAt: nowIso(),
      error: null,
    });

    return result;
  } finally {
    releaseDeployLock(input.serviceId, traceId);
  }
}

/** Clear all locks and history (for testing). */
export function _resetDeployDedupForTests(): void {
  deployLocks.clear();
  recentDeploys.clear();
}
