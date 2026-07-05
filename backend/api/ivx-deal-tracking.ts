/**
 * IVX Capital Deployment Platform — Real Deal Tracking API (owner-only).
 *
 * BLOCK 26. Full lifecycle tracking over owner-managed deals + computed outcome
 * metrics (conversion rate, capital raised, average deal size, time to close,
 * investor response rate):
 *   GET    /api/ivx/deal-tracking                  → list deals (newest first) + metrics
 *   POST   /api/ivx/deal-tracking                  → create a deal (name + real source required)
 *   GET    /api/ivx/deal-tracking/:id              → read one deal
 *   POST   /api/ivx/deal-tracking/:id              → update a deal (partial)
 *   POST   /api/ivx/deal-tracking/:id/milestone    → increment a lifecycle milestone
 *   POST   /api/ivx/deal-tracking/:id/status       → move lifecycle status
 *   POST   /api/ivx/deal-tracking/:id/delete       → delete a deal
 *
 * Owner-only. IVX never fabricates deal data; metrics are COMPUTED from the
 * recorded milestones, never invented.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  createDeal,
  deleteDeal,
  getDeal,
  incrementDealMilestone,
  listDeals,
  setDealStatus,
  summarizeDeals,
  updateDeal,
  DEAL_MILESTONE_FIELDS,
  type CreateDealInput,
  type DealMilestoneField,
  type DealSource,
  type DealStatus,
  type UpdateDealInput,
} from '../services/ivx-deal-tracking-store';

export const OPTIONS = (): Response => ownerOnlyOptions();

const VALID_SOURCES: ReadonlySet<string> = new Set([
  'owner_entered', 'submitted_form', 'crm_import', 'public_source', 'verified_deal',
]);
const VALID_STATUS: ReadonlySet<string> = new Set([
  'open', 'in_progress', 'closed_won', 'closed_lost',
]);
const VALID_MILESTONES: ReadonlySet<string> = new Set(DEAL_MILESTONE_FIELDS);

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
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

function bodyToUpdateInput(body: Record<string, unknown>): UpdateDealInput {
  const patch: UpdateDealInput = {};
  if (body.dealName !== undefined) patch.dealName = asString(body.dealName);
  if (body.counterparty !== undefined) patch.counterparty = asString(body.counterparty);
  if (body.status !== undefined && VALID_STATUS.has(asString(body.status))) patch.status = asString(body.status) as DealStatus;
  for (const field of DEAL_MILESTONE_FIELDS) {
    const value = asOptionalNumber(body[field]);
    if (value !== undefined) patch[field] = value;
  }
  if (body.capitalTarget !== undefined) patch.capitalTarget = body.capitalTarget === null ? null : asOptionalNumber(body.capitalTarget) ?? null;
  if (body.capitalCommitted !== undefined) patch.capitalCommitted = body.capitalCommitted === null ? null : asOptionalNumber(body.capitalCommitted) ?? null;
  if (body.closedAt !== undefined) patch.closedAt = body.closedAt === null ? null : asString(body.closedAt);
  if (body.notes !== undefined) patch.notes = asString(body.notes);
  if (body.source !== undefined && VALID_SOURCES.has(asString(body.source))) patch.source = asString(body.source) as DealSource;
  if (body.sourceDetail !== undefined) patch.sourceDetail = asString(body.sourceDetail);
  return patch;
}

export async function handleDealTrackingListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const [deals, metrics] = await Promise.all([listDeals(), summarizeDeals()]);
  return ownerOnlyJson({ ok: true, deals, metrics });
}

export async function handleDealTrackingCreateRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const input: CreateDealInput = {
    dealName: asString(body.dealName),
    source: asString(body.source) as DealSource,
    sourceDetail: asString(body.sourceDetail),
    counterparty: asString(body.counterparty),
    status: VALID_STATUS.has(asString(body.status)) ? (asString(body.status) as DealStatus) : undefined,
    investorsContacted: asOptionalNumber(body.investorsContacted),
    investorsResponded: asOptionalNumber(body.investorsResponded),
    buyersContacted: asOptionalNumber(body.buyersContacted),
    meetingsScheduled: asOptionalNumber(body.meetingsScheduled),
    documentsShared: asOptionalNumber(body.documentsShared),
    offersReceived: asOptionalNumber(body.offersReceived),
    capitalTarget: body.capitalTarget === null ? null : asOptionalNumber(body.capitalTarget) ?? null,
    capitalCommitted: body.capitalCommitted === null ? null : asOptionalNumber(body.capitalCommitted) ?? null,
    closedAt: body.closedAt === null ? null : asString(body.closedAt) || null,
    notes: asString(body.notes),
  };
  const result = await createDeal(input);
  if (!result.ok) {
    return ownerOnlyJson({ ok: false, error: result.error }, 400);
  }
  return ownerOnlyJson({ ok: true, deal: result.deal }, 201);
}

export async function handleDealTrackingGetRequest(request: Request, dealId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const deal = await getDeal(dealId);
  if (!deal) return ownerOnlyJson({ ok: false, error: 'Deal not found.' }, 404);
  return ownerOnlyJson({ ok: true, deal });
}

export async function handleDealTrackingUpdateRequest(request: Request, dealId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const updated = await updateDeal(dealId, bodyToUpdateInput(body));
  if (!updated) return ownerOnlyJson({ ok: false, error: 'Deal not found.' }, 404);
  return ownerOnlyJson({ ok: true, deal: updated });
}

export async function handleDealTrackingMilestoneRequest(request: Request, dealId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const field = asString(body.field);
  if (!VALID_MILESTONES.has(field)) {
    return ownerOnlyJson({ ok: false, error: `Invalid milestone. Use one of: ${DEAL_MILESTONE_FIELDS.join(', ')}.` }, 400);
  }
  const by = asOptionalNumber(body.by) ?? 1;
  const updated = await incrementDealMilestone(dealId, field as DealMilestoneField, by);
  if (!updated) return ownerOnlyJson({ ok: false, error: 'Deal not found.' }, 404);
  return ownerOnlyJson({ ok: true, deal: updated });
}

export async function handleDealTrackingStatusRequest(request: Request, dealId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const status = asString(body.status) as DealStatus;
  if (!VALID_STATUS.has(status)) {
    return ownerOnlyJson({ ok: false, error: 'Invalid status. Use open | in_progress | closed_won | closed_lost.' }, 400);
  }
  const updated = await setDealStatus(dealId, status);
  if (!updated) return ownerOnlyJson({ ok: false, error: 'Deal not found.' }, 404);
  return ownerOnlyJson({ ok: true, deal: updated });
}

export async function handleDealTrackingDeleteRequest(request: Request, dealId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const removed = await deleteDeal(dealId);
  if (!removed) return ownerOnlyJson({ ok: false, error: 'Deal not found.' }, 404);
  return ownerOnlyJson({ ok: true, deleted: true, id: dealId });
}
