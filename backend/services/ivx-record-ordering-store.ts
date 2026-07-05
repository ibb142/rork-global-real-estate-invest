/**
 * IVX Owner Investor Ordering + Block Review system.
 *
 * Gives the owner a single, ordered, reviewable view over every capital-relationship
 * record (buyers, investors, JV partners, tokenized buyers) and every opportunity:
 *
 *   1. NUMERIC ORDER — every record gets a stable, sequential order number starting
 *      at 1 (scales to 1,000,000+). The number + its created timestamp form a
 *      sortableKey so the board sorts deterministically regardless of record source.
 *   2. TRANSACTION STATUS — active / pending / no_transaction / expired / blocked /
 *      owner_review. Derived honestly from the record's lifecycle stage + activity,
 *      with persistent owner overrides.
 *   3. AUTO-MOVE — records with no transaction past the review window move to the
 *      owner_review list with a concrete reason. NEVER auto-deleted.
 *   4. VIP TIER — VIP 1..4 computed from capital signal (lead/relationship score +
 *      transaction state), plus a Blocked / Delete-Review bucket.
 *   5. OWNER ACTIONS — approve, archive, block, queue-delete, delete (explicit),
 *      return-to-active, set transaction status, move to review.
 *
 * HONESTY RULE (inherited platform-wide): nothing here fabricates records. It only
 * ORDERS, CLASSIFIES, and lets the owner ACT on records that already exist in the
 * durable CRM / opportunity stores. Owner decisions are persisted in an overlay so
 * they survive restarts and never mutate the source records destructively.
 *
 * Durable layout (mirrors the proven ivx-investor-crm-store pattern):
 *   logs/audit/record-ordering/overlay.json   materialised owner overlay (orders + actions)
 *   logs/audit/record-ordering/overlay.jsonl  append-only owner-action event log
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditDir } from './ivx-data-root';
import {
  isDurableStoreConfigured,
  readDurableJson,
  writeDurableJson,
  appendDurableEvent,
} from './ivx-durable-store';
import { listInvestors, type InvestorRecord } from './ivx-investor-crm-store';
import { listOpportunities, type Opportunity } from './ivx-opportunity-store';

export const IVX_RECORD_ORDERING_MARKER = 'ivx-record-ordering-2026-06-14';

/** How long a record can sit with no transaction/activity before auto-moving to owner_review. */
export const REVIEW_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Transaction lifecycle the owner cares about. */
export type TransactionStatus =
  | 'active_transaction'
  | 'pending_transaction'
  | 'no_transaction'
  | 'expired'
  | 'blocked'
  | 'owner_review';

export const TRANSACTION_STATUSES: readonly TransactionStatus[] = [
  'active_transaction',
  'pending_transaction',
  'no_transaction',
  'expired',
  'blocked',
  'owner_review',
];

/** VIP priority tiers + the blocked/delete review bucket. */
export type VipTier = 'vip1' | 'vip2' | 'vip3' | 'vip4' | 'blocked_review';

/** Why a record was moved to the owner_review / blocked list. */
export type ReviewReason =
  | 'no_transaction'
  | 'no_response'
  | 'low_score'
  | 'duplicate'
  | 'invalid_contact'
  | 'blocked_source';

export const REVIEW_REASONS: readonly ReviewReason[] = [
  'no_transaction',
  'no_response',
  'low_score',
  'duplicate',
  'invalid_contact',
  'blocked_source',
];

/** Where a record sits in the owner workflow. `active` = normal pipeline. */
export type ReviewState = 'active' | 'owner_review' | 'archived' | 'blocked' | 'delete_queue';

/** The record kind the owner sees in the type column. */
export type RecordType = 'buyer' | 'investor' | 'jv' | 'tokenized_buyer' | 'opportunity' | 'other';

/** Owner action verbs the board accepts. */
export type OwnerActionType =
  | 'approve'
  | 'archive'
  | 'block'
  | 'queue_delete'
  | 'delete'
  | 'return_to_active'
  | 'move_to_review'
  | 'set_transaction_status';

export const OWNER_ACTION_TYPES: readonly OwnerActionType[] = [
  'approve',
  'archive',
  'block',
  'queue_delete',
  'delete',
  'return_to_active',
  'move_to_review',
  'set_transaction_status',
];

/** Per-record owner override persisted in the overlay. */
type RecordOverride = {
  /** Owner-set transaction status; takes priority over the derived one. */
  transactionStatus?: TransactionStatus;
  /** Owner-pinned VIP tier; takes priority over the computed one. */
  vipTierOverride?: VipTier;
  /** Workflow placement set by the owner (or the auto-move rule). */
  reviewState?: ReviewState;
  /** Why it sits in review/blocked. */
  reason?: ReviewReason;
  /** Whether the auto-move rule (vs the owner) placed it in review. */
  autoMoved?: boolean;
  movedAt?: string;
  updatedAt?: string;
};

type Overlay = {
  marker: string;
  /** Monotonic counter for the next order number to assign. Starts at 1. */
  counter: number;
  /** recordId -> { orderNumber, createdAt } assignment (stable for the record's life). */
  orders: Record<string, { orderNumber: number; createdAt: string }>;
  /** recordId -> owner override. */
  overrides: Record<string, RecordOverride>;
  /** recordIds the owner explicitly deleted (hidden from the board). */
  deleted: string[];
  updatedAt: string;
};

/** A fully-computed board row the owner dashboard renders. */
export type OrderedRecord = {
  recordId: string;
  orderNumber: number;
  orderNumberFormatted: string;
  createdAt: string;
  sortableKey: string;
  name: string;
  company: string;
  type: RecordType;
  vipTier: VipTier;
  score: number;
  leadScore: number;
  relationshipScore: number;
  transactionStatus: TransactionStatus;
  reviewState: ReviewState;
  reason: ReviewReason | null;
  autoMoved: boolean;
  lastContactAt: string | null;
  lastActivityAt: string;
  source: string;
  sourceDetail: string;
  availableActions: OwnerActionType[];
};

const ROOT = auditDir('record-ordering');
const OVERLAY_STATE = path.join(ROOT, 'overlay.json');
const OVERLAY_LOG = path.join(ROOT, 'overlay.jsonl');

function nowIso(): string {
  return new Date().toISOString();
}

function emptyOverlay(): Overlay {
  return {
    marker: IVX_RECORD_ORDERING_MARKER,
    counter: 1,
    orders: {},
    overrides: {},
    deleted: [],
    updatedAt: nowIso(),
  };
}

async function readOverlay(): Promise<Overlay> {
  const fallback = emptyOverlay();
  let raw: Overlay;
  if (isDurableStoreConfigured()) {
    raw = await readDurableJson<Overlay>(OVERLAY_STATE, fallback);
  } else {
    try {
      raw = JSON.parse(await readFile(OVERLAY_STATE, 'utf8')) as Overlay;
    } catch {
      raw = fallback;
    }
  }
  return {
    marker: IVX_RECORD_ORDERING_MARKER,
    counter: Number.isFinite(raw?.counter) && raw.counter >= 1 ? Math.floor(raw.counter) : 1,
    orders: raw?.orders && typeof raw.orders === 'object' ? raw.orders : {},
    overrides: raw?.overrides && typeof raw.overrides === 'object' ? raw.overrides : {},
    deleted: Array.isArray(raw?.deleted) ? raw.deleted : [],
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  };
}

async function writeOverlay(overlay: Overlay): Promise<void> {
  overlay.updatedAt = nowIso();
  if (isDurableStoreConfigured()) {
    await writeDurableJson(OVERLAY_STATE, overlay);
    return;
  }
  await mkdir(ROOT, { recursive: true });
  await writeFile(OVERLAY_STATE, JSON.stringify(overlay, null, 2), 'utf8');
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(OVERLAY_LOG, event);
    } catch {
      // Forensic log is best-effort; never break an owner action on log failure.
    }
    return;
  }
  try {
    await mkdir(ROOT, { recursive: true });
    await appendFile(OVERLAY_LOG, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Best-effort.
  }
}

// ── Pure classification helpers (unit-testable, no I/O) ──────────────────────

/** Format an order number to a zero-padded, owner-readable string (min 6 digits). */
export function formatOrderNumber(orderNumber: number): string {
  return String(Math.max(1, Math.floor(orderNumber))).padStart(6, '0');
}

/** Build the deterministic sort key: created timestamp + zero-padded order number. */
export function buildSortableKey(createdAt: string, orderNumber: number): string {
  return `${createdAt}#${String(Math.max(0, Math.floor(orderNumber))).padStart(12, '0')}`;
}

/** A normalized capital signal score (0–100) used for VIP tiering. */
export function combinedScore(leadScore: number, relationshipScore: number): number {
  const lead = Number.isFinite(leadScore) ? leadScore : 0;
  const rel = Number.isFinite(relationshipScore) ? relationshipScore : 0;
  return Math.max(0, Math.min(100, Math.round(lead * 0.6 + rel * 0.4)));
}

/** True when the record's activity is older than the review window. */
function isStale(lastActivityAt: string, now: number): boolean {
  const t = Date.parse(lastActivityAt);
  if (!Number.isFinite(t)) return false;
  return now - t > REVIEW_WINDOW_DAYS * DAY_MS;
}

/**
 * Derive the default transaction status from an investor's lifecycle stage + activity.
 * Honest: an owner override always wins over this.
 */
export function deriveTransactionStatus(
  investorStatus: InvestorRecord['status'],
  lastActivityAt: string,
  now: number = Date.now(),
): TransactionStatus {
  if (investorStatus === 'invested') return 'active_transaction';
  if (investorStatus === 'meeting_scheduled' || investorStatus === 'active') return 'pending_transaction';
  if (investorStatus === 'contacted') {
    return isStale(lastActivityAt, now) ? 'expired' : 'pending_transaction';
  }
  // prospect
  return isStale(lastActivityAt, now) ? 'expired' : 'no_transaction';
}

/** Compute the VIP tier from transaction state + capital signal score. */
export function computeVipTier(
  transactionStatus: TransactionStatus,
  score: number,
  reviewState: ReviewState,
): VipTier {
  if (reviewState === 'blocked' || reviewState === 'delete_queue') return 'blocked_review';
  if (transactionStatus === 'blocked') return 'blocked_review';
  if (transactionStatus === 'active_transaction' || score >= 80) return 'vip1';
  if (score >= 60) return 'vip2';
  if (score >= 35) return 'vip3';
  return 'vip4';
}

/** Map an investor record to the owner-facing record type. */
function investorType(rec: InvestorRecord): RecordType {
  if (rec.partyType === 'buyer') {
    return rec.investmentType.toLowerCase().includes('token') ? 'tokenized_buyer' : 'buyer';
  }
  if (rec.partyType === 'investor') return 'investor';
  if (rec.partyType === 'partner') return 'jv';
  return 'other';
}

/** Which actions make sense from a given review state. */
function actionsFor(reviewState: ReviewState): OwnerActionType[] {
  const base: OwnerActionType[] = ['set_transaction_status'];
  switch (reviewState) {
    case 'active':
      return [...base, 'move_to_review', 'archive', 'block'];
    case 'owner_review':
      return [...base, 'approve', 'return_to_active', 'archive', 'block', 'queue_delete'];
    case 'archived':
      return [...base, 'return_to_active', 'queue_delete'];
    case 'blocked':
      return [...base, 'return_to_active', 'queue_delete'];
    case 'delete_queue':
      return ['return_to_active', 'delete'];
    default:
      return base;
  }
}

// ── Board assembly ───────────────────────────────────────────────────────────

type RawRecord = {
  recordId: string;
  name: string;
  company: string;
  type: RecordType;
  leadScore: number;
  relationshipScore: number;
  investorStatus: InvestorRecord['status'] | null;
  lastContactAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  source: string;
  sourceDetail: string;
};

/** Pull every source record (investors + opportunities) into one normalized list. */
async function collectRawRecords(): Promise<RawRecord[]> {
  const [investors, opportunities] = await Promise.all([
    listInvestors().catch(() => [] as InvestorRecord[]),
    listOpportunities().catch(() => [] as Opportunity[]),
  ]);

  const rows: RawRecord[] = [];

  for (const inv of investors) {
    rows.push({
      recordId: `inv:${inv.id}`,
      name: inv.name,
      company: inv.company,
      type: investorType(inv),
      leadScore: inv.leadScore,
      relationshipScore: inv.relationshipScore,
      investorStatus: inv.status,
      lastContactAt: inv.lastContactDate,
      lastActivityAt: inv.updatedAt || inv.createdAt,
      createdAt: inv.createdAt,
      source: inv.source,
      sourceDetail: inv.sourceDetail,
    });
  }

  for (const opp of opportunities) {
    const overall = typeof opp.overall === 'number' ? opp.overall : 0;
    rows.push({
      recordId: `opp:${opp.id}`,
      name: opp.title ?? 'Opportunity',
      company: opp.category ?? '',
      type: 'opportunity',
      leadScore: overall,
      relationshipScore: overall,
      investorStatus: null,
      lastContactAt: null,
      lastActivityAt: opp.updatedAt ?? opp.createdAt ?? nowIso(),
      createdAt: opp.createdAt ?? nowIso(),
      source: 'opportunity_engine',
      sourceDetail: opp.evidence ?? '',
    });
  }

  return rows;
}

/**
 * Build the full ordered board. This is the single source of truth the API serves.
 * It assigns order numbers to any new records, applies the auto-move rule, and
 * persists both back to the overlay so the assignment is stable across calls.
 */
export async function buildOrderingBoard(now: number = Date.now()): Promise<OrderedRecord[]> {
  const overlay = await readOverlay();
  const raw = await collectRawRecords();
  const deleted = new Set(overlay.deleted);

  // Stable order assignment: assign new records by created date, then by id, so the
  // numbering is deterministic and append-only (existing numbers never change).
  const unassigned = raw
    .filter((r) => !deleted.has(r.recordId) && !overlay.orders[r.recordId])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.recordId.localeCompare(b.recordId));

  let dirty = false;
  for (const r of unassigned) {
    overlay.orders[r.recordId] = { orderNumber: overlay.counter, createdAt: r.createdAt };
    overlay.counter += 1;
    dirty = true;
  }

  const board: OrderedRecord[] = [];
  for (const r of raw) {
    if (deleted.has(r.recordId)) continue;
    const assigned = overlay.orders[r.recordId];
    if (!assigned) continue; // Should not happen — every non-deleted record was assigned above.

    const override = overlay.overrides[r.recordId] ?? {};
    let reviewState: ReviewState = override.reviewState ?? 'active';
    let reason: ReviewReason | null = override.reason ?? null;
    let autoMoved = override.autoMoved ?? false;

    const score = combinedScore(r.leadScore, r.relationshipScore);
    const derived = r.investorStatus
      ? deriveTransactionStatus(r.investorStatus, r.lastActivityAt, now)
      : score >= 60
        ? 'pending_transaction'
        : 'no_transaction';
    const transactionStatus: TransactionStatus = override.transactionStatus ?? derived;

    // AUTO-MOVE RULE: a record still in the active pipeline with no transaction past
    // the review window is moved to owner_review automatically (never deleted).
    if (
      reviewState === 'active' &&
      transactionStatus !== 'active_transaction' &&
      isStale(r.lastActivityAt, now)
    ) {
      reviewState = 'owner_review';
      reason = score < 35 ? 'low_score' : r.investorStatus === 'contacted' ? 'no_response' : 'no_transaction';
      autoMoved = true;
      overlay.overrides[r.recordId] = {
        ...override,
        reviewState,
        reason,
        autoMoved: true,
        movedAt: override.movedAt ?? nowIso(),
        updatedAt: nowIso(),
      };
      dirty = true;
    }

    const effectiveTx: TransactionStatus =
      reviewState === 'owner_review'
        ? 'owner_review'
        : reviewState === 'blocked'
          ? 'blocked'
          : transactionStatus;

    const vipTier = override.vipTierOverride ?? computeVipTier(effectiveTx, score, reviewState);

    board.push({
      recordId: r.recordId,
      orderNumber: assigned.orderNumber,
      orderNumberFormatted: formatOrderNumber(assigned.orderNumber),
      createdAt: assigned.createdAt,
      sortableKey: buildSortableKey(assigned.createdAt, assigned.orderNumber),
      name: r.name,
      company: r.company,
      type: r.type,
      vipTier,
      score,
      leadScore: r.leadScore,
      relationshipScore: r.relationshipScore,
      transactionStatus: effectiveTx,
      reviewState,
      reason,
      autoMoved,
      lastContactAt: r.lastContactAt,
      lastActivityAt: r.lastActivityAt,
      source: r.source,
      sourceDetail: r.sourceDetail,
      availableActions: actionsFor(reviewState),
    });
  }

  if (dirty) await writeOverlay(overlay);

  board.sort((a, b) => a.orderNumber - b.orderNumber);
  return board;
}

// ── Owner actions ────────────────────────────────────────────────────────────

const REVIEW_STATE_FOR_ACTION: Partial<Record<OwnerActionType, ReviewState>> = {
  approve: 'active',
  return_to_active: 'active',
  archive: 'archived',
  block: 'blocked',
  queue_delete: 'delete_queue',
  move_to_review: 'owner_review',
};

export type OwnerActionInput = {
  recordId: string;
  action: OwnerActionType;
  reason?: ReviewReason;
  transactionStatus?: TransactionStatus;
};

export type OwnerActionResult =
  | { ok: true; recordId: string; action: OwnerActionType }
  | { ok: false; error: string };

/**
 * Apply an owner decision to a record. Persists into the overlay (source records are
 * never mutated). `delete` only fully removes a record that the owner already moved
 * to the delete queue — nothing is ever deleted automatically.
 */
export async function applyOwnerAction(input: OwnerActionInput): Promise<OwnerActionResult> {
  if (!input.recordId || typeof input.recordId !== 'string') {
    return { ok: false, error: 'recordId is required.' };
  }
  if (!OWNER_ACTION_TYPES.includes(input.action)) {
    return { ok: false, error: `Unknown action '${input.action}'.` };
  }

  const overlay = await readOverlay();

  // The record must exist on the current board (or already have an assignment).
  if (!overlay.orders[input.recordId] && !overlay.deleted.includes(input.recordId)) {
    // Lazily ensure ordering is built so a fresh record can be acted on.
    await buildOrderingBoard();
    const refreshed = await readOverlay();
    overlay.orders = refreshed.orders;
    overlay.counter = refreshed.counter;
    overlay.overrides = refreshed.overrides;
    overlay.deleted = refreshed.deleted;
  }
  if (!overlay.orders[input.recordId]) {
    return { ok: false, error: `Record '${input.recordId}' not found on the board.` };
  }

  const prior = overlay.overrides[input.recordId] ?? {};

  if (input.action === 'set_transaction_status') {
    if (!input.transactionStatus || !TRANSACTION_STATUSES.includes(input.transactionStatus)) {
      return { ok: false, error: 'A valid transactionStatus is required for set_transaction_status.' };
    }
    overlay.overrides[input.recordId] = {
      ...prior,
      transactionStatus: input.transactionStatus,
      updatedAt: nowIso(),
    };
  } else if (input.action === 'delete') {
    if (prior.reviewState !== 'delete_queue') {
      return { ok: false, error: 'A record must be in the delete queue before it can be deleted. Use queue_delete first.' };
    }
    if (!overlay.deleted.includes(input.recordId)) overlay.deleted.push(input.recordId);
    delete overlay.overrides[input.recordId];
  } else {
    const nextState = REVIEW_STATE_FOR_ACTION[input.action];
    if (!nextState) return { ok: false, error: `Action '${input.action}' is not applicable.` };
    const clearsReview = nextState === 'active';
    overlay.overrides[input.recordId] = {
      ...prior,
      reviewState: nextState,
      reason: clearsReview ? undefined : input.reason ?? prior.reason,
      autoMoved: false,
      movedAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  await writeOverlay(overlay);
  await appendEvent({
    type: 'owner_action',
    recordId: input.recordId,
    action: input.action,
    reason: input.reason ?? null,
    transactionStatus: input.transactionStatus ?? null,
    at: nowIso(),
  });

  return { ok: true, recordId: input.recordId, action: input.action };
}

// ── Roll-up / daily report ─────────────────────────────────────────────────

export type OrderingSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  highestOrderNumber: number;
  byVipTier: Record<VipTier, number>;
  byTransactionStatus: Record<TransactionStatus, number>;
  byReviewState: Record<ReviewState, number>;
  byType: Record<RecordType, number>;
  ownerReview: number;
  blocked: number;
  deleteQueue: number;
  activeTransactions: number;
  noTransaction: number;
  movedToReviewAuto: number;
};

function zeroVip(): Record<VipTier, number> {
  return { vip1: 0, vip2: 0, vip3: 0, vip4: 0, blocked_review: 0 };
}
function zeroTx(): Record<TransactionStatus, number> {
  return {
    active_transaction: 0, pending_transaction: 0, no_transaction: 0, expired: 0, blocked: 0, owner_review: 0,
  };
}
function zeroReview(): Record<ReviewState, number> {
  return { active: 0, owner_review: 0, archived: 0, blocked: 0, delete_queue: 0 };
}
function zeroType(): Record<RecordType, number> {
  return { buyer: 0, investor: 0, jv: 0, tokenized_buyer: 0, opportunity: 0, other: 0 };
}

/** Read-only roll-up over the ordered board (powers the dashboard header + daily report). */
export async function summarizeOrdering(now: number = Date.now()): Promise<OrderingSummary> {
  const board = await buildOrderingBoard(now);
  const byVipTier = zeroVip();
  const byTransactionStatus = zeroTx();
  const byReviewState = zeroReview();
  const byType = zeroType();
  let highest = 0;
  let movedAuto = 0;

  for (const row of board) {
    byVipTier[row.vipTier] += 1;
    byTransactionStatus[row.transactionStatus] += 1;
    byReviewState[row.reviewState] += 1;
    byType[row.type] += 1;
    if (row.orderNumber > highest) highest = row.orderNumber;
    if (row.autoMoved) movedAuto += 1;
  }

  return {
    marker: IVX_RECORD_ORDERING_MARKER,
    generatedAt: nowIso(),
    total: board.length,
    highestOrderNumber: highest,
    byVipTier,
    byTransactionStatus,
    byReviewState,
    byType,
    ownerReview: byReviewState.owner_review,
    blocked: byReviewState.blocked,
    deleteQueue: byReviewState.delete_queue,
    activeTransactions: byTransactionStatus.active_transaction,
    noTransaction: byTransactionStatus.no_transaction,
    movedToReviewAuto: movedAuto,
  };
}
