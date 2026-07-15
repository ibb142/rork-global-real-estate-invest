/**
 * IVX Opportunity Intelligence API (owner-only) — Opportunity Engine backend.
 *
 *   GET  /api/ivx/opportunity/dashboard          → ranked opportunities + alerts + research layer
 *   POST /api/ivx/opportunity/scan               → run the engine: generate scored opportunities
 *   GET  /api/ivx/opportunity/opportunities      → list scored opportunities (ranked)
 *   GET  /api/ivx/opportunity/best               → single best opportunity today (acceptance test)
 *   POST /api/ivx/opportunity/:id/status         → set opportunity status (watching/pursuing/dismissed…)
 *   GET  /api/ivx/opportunity/alerts             → list owner alerts
 *   POST /api/ivx/opportunity/alerts/:id/ack     → acknowledge an alert
 *   GET  /api/ivx/opportunity/research           → multi-AI research layer status
 *
 * Owner-only. Never promises guaranteed profit; the engine encodes the legal +
 * risk warnings on every payload.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { runOpportunityScan, buildResearchLayer } from '../services/ivx-opportunity-engine';
import { buildOpportunityDashboard, selectBestOpportunity } from '../services/ivx-opportunity-dashboard';
import {
  acknowledgeAlert,
  listAlerts,
  listOpportunities,
  setOpportunityStatus,
  type OpportunityStatus,
} from '../services/ivx-opportunity-store';

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

export async function handleOpportunityDashboardRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const dashboard = await buildOpportunityDashboard();
  return ownerOnlyJson({ ok: true, dashboard: dashboard as unknown as Record<string, unknown> });
}

export async function handleOpportunityScanRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const result = await runOpportunityScan();
  return ownerOnlyJson({ ok: true, scan: result as unknown as Record<string, unknown> });
}

export async function handleOpportunityListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const opportunities = await listOpportunities();
  return ownerOnlyJson({ ok: true, opportunities });
}

export async function handleOpportunityBestRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  let opportunities = await listOpportunities();
  // If nothing has been scanned yet, run a scan so "best opportunity" is always answerable.
  if (opportunities.length === 0) {
    const scan = await runOpportunityScan();
    opportunities = scan.opportunities;
  }
  const best = selectBestOpportunity(opportunities);
  return ownerOnlyJson({ ok: true, best, research: buildResearchLayer() });
}

export async function handleOpportunityStatusRequest(request: Request, opportunityId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const status = asString(body.status) as OpportunityStatus;
  const updated = await setOpportunityStatus(opportunityId, status);
  if (!updated) {
    return ownerOnlyJson({ ok: false, error: 'Opportunity not found or invalid status.' }, 404);
  }
  return ownerOnlyJson({ ok: true, opportunity: updated });
}

export async function handleOpportunityAlertsRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const alerts = await listAlerts(100);
  return ownerOnlyJson({ ok: true, alerts });
}

export async function handleOpportunityAlertAckRequest(request: Request, alertId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const updated = await acknowledgeAlert(alertId);
  if (!updated) {
    return ownerOnlyJson({ ok: false, error: 'Alert not found.' }, 404);
  }
  return ownerOnlyJson({ ok: true, alert: updated });
}

export async function handleOpportunityResearchRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return ownerOnlyJson({ ok: true, research: buildResearchLayer() });
}
