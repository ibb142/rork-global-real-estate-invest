/**
 * IVX Self-Upgrade Tool System API (owner-only).
 *
 *   GET  /api/ivx/tool-system/dashboard      → available / active / failed / missing-creds / risk
 *   GET  /api/ivx/tool-system/tools          → full registry
 *   GET  /api/ivx/tool-system/catalog        → approved-source catalog
 *   POST /api/ivx/tool-system/install        → install a catalog tool (scan → test → enable)  {name, ownerApproved?}
 *   POST /api/ivx/tool-system/self-upgrade   → propose → build → test → activate → use → proof {name?}
 *   POST /api/ivx/tool-system/use            → run an enabled, verified tool                  {name, input}
 *
 * Every mutating route is owner-gated; reads use the same owner guard.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { buildToolSystemDashboard } from '../services/ivx-tool-system-dashboard';
import { listTools } from '../services/ivx-tool-registry-store';
import { listCatalog } from '../services/ivx-tool-catalog';
import { installToolByName } from '../services/ivx-tool-installer';
import { runSelfUpgrade, useTool } from '../services/ivx-tool-self-upgrade';

export const OPTIONS = (): Response => ownerOnlyOptions();

async function requireOwner(request: Request): Promise<Response | null> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401);
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication failed.';
    const status = /missing bearer/i.test(message) || /invalid or expired/i.test(message) ? 401 : 403;
    return ownerOnlyJson({ ok: false, error: message }, status);
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export async function handleToolSystemDashboardRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const dashboard = await buildToolSystemDashboard();
  return ownerOnlyJson({ ok: true, dashboard: dashboard as unknown as Record<string, unknown> });
}

export async function handleToolSystemToolsRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const tools = await listTools();
  return ownerOnlyJson({ ok: true, tools: tools as unknown as Record<string, unknown>[] });
}

export async function handleToolSystemCatalogRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return ownerOnlyJson({ ok: true, catalog: listCatalog() as unknown as Record<string, unknown>[] });
}

export async function handleToolSystemInstallRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const name = typeof body.name === 'string' ? body.name : '';
  if (!name.trim()) {
    return ownerOnlyJson({ ok: false, error: 'A catalog tool "name" is required.' }, 400);
  }
  const ownerApproved = body.ownerApproved === true;
  const result = await installToolByName(name, { ownerApproved });
  return ownerOnlyJson(
    { ok: result.ok, result: result as unknown as Record<string, unknown> },
    result.ok ? 200 : 422,
  );
}

export async function handleToolSystemSelfUpgradeRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined;
  const proof = await runSelfUpgrade(name);
  return ownerOnlyJson(
    { ok: proof.ok, proof: proof as unknown as Record<string, unknown> },
    proof.ok ? 200 : 422,
  );
}

export async function handleToolSystemUseRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const name = typeof body.name === 'string' ? body.name : '';
  if (!name.trim()) {
    return ownerOnlyJson({ ok: false, error: 'A tool "name" is required.' }, 400);
  }
  const input = body.input && typeof body.input === 'object' ? (body.input as Record<string, unknown>) : {};
  const usage = await useTool(name, input);
  return ownerOnlyJson(
    { ok: usage.used, usage: usage as unknown as Record<string, unknown> },
    usage.used ? 200 : 422,
  );
}
