/**
 * IVX Private Lender Network API (owner-only).
 *
 * Module 3 of the IVX Autonomous Business Execution Engine — the structured
 * lender database backend:
 *   GET  /api/ivx/lender-network/dashboard     → lender counts by category + top profiles
 *   POST /api/ivx/lender-network/scan          → derive lender profiles from live jv_deals
 *   GET  /api/ivx/lender-network/lenders       → list scored lender profiles (ranked)
 *   POST /api/ivx/lender-network/:id/status    → set lender status
 *
 * Owner-only. Records are high-probability LENDER PROFILES (segments) grounded
 * in IVX's real deals and legitimate public sourcing channels — never fabricated
 * individuals or contact details.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { runLenderNetworkScan, buildLenderNetworkDashboard } from '../services/ivx-lender-network-engine';
import { getLender, listLenders, setLenderStatus, type LenderStatus } from '../services/ivx-lender-network-store';

export const OPTIONS = (): Response => ownerOnlyOptions();

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleLenderNetworkDashboardRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const dashboard = await buildLenderNetworkDashboard();
  return ownerOnlyJson({ ok: true, dashboard: dashboard as unknown as Record<string, unknown> });
}

export async function handleLenderNetworkScanRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const result = await runLenderNetworkScan();
  return ownerOnlyJson({ ok: true, scan: result as unknown as Record<string, unknown> });
}

export async function handleLenderNetworkListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const lenders = await listLenders();
  return ownerOnlyJson({ ok: true, lenders });
}

export async function handleLenderNetworkStatusRequest(request: Request, lenderId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const status = asString(body.status) as LenderStatus;
  const updated = await setLenderStatus(lenderId, status);
  if (!updated) {
    return ownerOnlyJson({ ok: false, error: 'Lender not found or invalid status.' }, 404);
  }
  return ownerOnlyJson({ ok: true, lender: updated });
}

export async function handleLenderNetworkGetRequest(request: Request, lenderId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const lender = await getLender(lenderId);
  if (!lender) {
    return ownerOnlyJson({ ok: false, error: 'Lender not found.' }, 404);
  }
  return ownerOnlyJson({ ok: true, lender });
}
