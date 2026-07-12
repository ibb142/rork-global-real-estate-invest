/**
 * IVX Owner Investor Ordering + Block Review — owner-gated API.
 *
 *   GET  /api/ivx/ordering/board    — full ordered board + per-view buckets + summary
 *   POST /api/ivx/ordering/action   — apply an owner decision to one record
 *   GET  /api/ivx/ordering/report   — daily ordering report (VIP counts, review, blocked)
 *
 * Read endpoints are owner-authenticated (same guard as the autonomous status reads).
 * Every count is computed live from the durable CRM + opportunity stores — nothing is
 * estimated or fabricated.
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  applyOwnerAction,
  buildOrderingBoard,
  summarizeOrdering,
  OWNER_ACTION_TYPES,
  type OrderedRecord,
  type OwnerActionType,
  type ReviewReason,
  type TransactionStatus,
  type VipTier,
} from '../services/ivx-record-ordering-store';

export const orderingOptions = (): Response => ownerOnlyOptions();

async function requireOwner(request: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return { ok: false, response: ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401) };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication required.';
    const status = message.toLowerCase().includes('missing bearer') ? 401 : 403;
    return { ok: false, response: ownerOnlyJson({ ok: false, error: message }, status) };
  }
}

/** Group the board into the owner-facing views (VIP tiers, review, blocked, transactions). */
function bucketBoard(board: OrderedRecord[]): Record<string, OrderedRecord[]> {
  return {
    all: board,
    vip1: board.filter((r) => r.vipTier === 'vip1'),
    vip2: board.filter((r) => r.vipTier === 'vip2'),
    vip3: board.filter((r) => r.vipTier === 'vip3'),
    vip4: board.filter((r) => r.vipTier === 'vip4'),
    owner_review: board.filter((r) => r.reviewState === 'owner_review'),
    blocked: board.filter((r) => r.reviewState === 'blocked'),
    delete_queue: board.filter((r) => r.reviewState === 'delete_queue'),
    archived: board.filter((r) => r.reviewState === 'archived'),
    active_transactions: board.filter((r) => r.transactionStatus === 'active_transaction'),
    no_transaction: board.filter((r) => r.transactionStatus === 'no_transaction'),
  };
}

/** GET /api/ivx/ordering/board — owner-only ordered board + buckets + summary. */
export async function handleOrderingBoardRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    const board = await buildOrderingBoard();
    const summary = await summarizeOrdering();
    return ownerOnlyJson({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary,
      views: bucketBoard(board),
    });
  } catch (error) {
    return ownerOnlyJson(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to build ordering board.' },
      500,
    );
  }
}

/** GET /api/ivx/ordering/report — owner-only daily ordering report. */
export async function handleOrderingReportRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    const summary = await summarizeOrdering();
    return ownerOnlyJson({
      ok: true,
      report: {
        generatedAt: summary.generatedAt,
        totalRecords: summary.total,
        highestOrderNumber: summary.highestOrderNumber,
        vip1: summary.byVipTier.vip1,
        vip2: summary.byVipTier.vip2,
        vip3: summary.byVipTier.vip3,
        vip4: summary.byVipTier.vip4,
        blockedReview: summary.byVipTier.blocked_review,
        movedToOwnerReview: summary.ownerReview,
        movedToOwnerReviewAuto: summary.movedToReviewAuto,
        blocked: summary.blocked,
        deleteQueue: summary.deleteQueue,
        activeTransactions: summary.activeTransactions,
        noTransaction: summary.noTransaction,
        byType: summary.byType,
        byTransactionStatus: summary.byTransactionStatus,
      },
    });
  } catch (error) {
    return ownerOnlyJson(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to build ordering report.' },
      500,
    );
  }
}

/** POST /api/ivx/ordering/action — owner-only decision on one record. */
export async function handleOrderingActionRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  let body: {
    recordId?: string;
    action?: string;
    reason?: string;
    transactionStatus?: string;
  } | null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return ownerOnlyJson({ ok: false, error: 'A JSON body is required.' }, 400);
  }

  if (!body || typeof body.recordId !== 'string' || typeof body.action !== 'string') {
    return ownerOnlyJson({ ok: false, error: 'recordId and action are required.', validActions: OWNER_ACTION_TYPES }, 400);
  }
  if (!OWNER_ACTION_TYPES.includes(body.action as OwnerActionType)) {
    return ownerOnlyJson({ ok: false, error: `Unknown action '${body.action}'.`, validActions: OWNER_ACTION_TYPES }, 400);
  }

  try {
    const result = await applyOwnerAction({
      recordId: body.recordId,
      action: body.action as OwnerActionType,
      reason: body.reason as ReviewReason | undefined,
      transactionStatus: body.transactionStatus as TransactionStatus | undefined,
    });
    if (!result.ok) {
      return ownerOnlyJson({ ok: false, error: result.error }, 400);
    }
    // Return the fresh summary so the caller can prove the move landed.
    const summary = await summarizeOrdering();
    return ownerOnlyJson({ ok: true, applied: result, summary });
  } catch (error) {
    return ownerOnlyJson(
      { ok: false, error: error instanceof Error ? error.message : 'Owner action failed.' },
      500,
    );
  }
}

export type { VipTier };
