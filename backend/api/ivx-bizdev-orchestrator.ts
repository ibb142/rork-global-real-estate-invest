/**
 * IVX Business Development Orchestrator API (owner-only).
 *
 * Runs the full supervised BD pipeline in one pass — buyer discovery, investor
 * discovery, deal review, technology discovery, opportunity scoring, and
 * outreach DRAFTING — and returns a single structured report.
 *
 *   GET  /api/ivx/bizdev/status   → marker + owner gate + stage catalog
 *   POST /api/ivx/bizdev/run      → run the orchestrator (JSON body)
 *
 * Owner-only. Never sends outreach/email/calls and never deploys: every result
 * is gated behind explicit owner approval (`ownerGate` block).
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  runBusinessDevelopmentOrchestrator,
  IVX_BIZDEV_ORCHESTRATOR_MARKER,
  type BizDevOrchestratorOptions,
} from '../services/ivx-bizdev-orchestrator';
import { BUYER_TYPES, type BuyerType } from '../services/ivx-buyer-discovery';

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
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function normalizeBuyerTypes(value: unknown): BuyerType[] {
  const raw: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? value.split(',').map((v) => v.trim())
      : [];
  return BUYER_TYPES.filter((t) => raw.includes(t));
}

function buildOptions(source: Record<string, unknown>): BizDevOrchestratorOptions {
  const options: BizDevOrchestratorOptions = {};
  if (typeof source.query === 'string' && source.query.trim()) options.query = source.query.trim();
  const limit = toPositiveNumber(source.limit);
  if (limit !== undefined) options.limit = limit;
  const buyerTypes = normalizeBuyerTypes(source.buyerTypes ?? source.types);
  if (buyerTypes.length > 0) options.buyerTypes = buyerTypes;
  if (source.includeOutreachDrafts === false) options.includeOutreachDrafts = false;
  if (typeof source.senderName === 'string' && source.senderName.trim()) options.senderName = source.senderName.trim();
  return options;
}

/** GET — orchestrator status, owner gate, and the stage catalog it runs. */
export async function handleBizDevStatusRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return ownerOnlyJson({
    ok: true,
    marker: IVX_BIZDEV_ORCHESTRATOR_MARKER,
    stages: [
      { id: 'buyerDiscovery', label: 'Buyer discovery', source: 'SEC EDGAR Form D (classified)' },
      { id: 'investorDiscovery', label: 'Investor / JV discovery', source: 'SEC EDGAR Form D' },
      { id: 'dealReview', label: 'Deal review', source: 'IVX opportunity engine' },
      { id: 'technologyDiscovery', label: 'Technology discovery', source: 'IVX technology discovery' },
      { id: 'opportunityScoring', label: 'Opportunity scoring', source: 'IVX opportunity engine' },
      { id: 'outreachDrafts', label: 'Outreach drafts (owner approval required)', source: 'IVX outreach drafter' },
    ],
    ownerGate: {
      requiresOwnerApproval: true,
      outreachSent: false,
      emailsSent: false,
      callsPlaced: false,
      deployed: false,
      note: 'This orchestrator only drafts and scores. No outreach, email, call, or deployment happens without owner approval.',
    },
  });
}

/** POST /run — execute the full owner-supervised BD pipeline. */
export async function handleBizDevRunRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  try {
    const result = await runBusinessDevelopmentOrchestrator(buildOptions(body));
    return ownerOnlyJson({ ok: result.ok, result: result as unknown as Record<string, unknown> });
  } catch (error) {
    return ownerOnlyJson(
      { ok: false, error: error instanceof Error ? error.message : 'Business development orchestrator failed.' },
      500,
    );
  }
}
