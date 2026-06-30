/**
 * IVX Capital Deployment Platform — Real Deal Tracking store (owner-only).
 *
 * BLOCK 26. The fourth pillar: track every real deal end-to-end through its
 * lifecycle milestones (created → investor/buyer contacted → meetings → docs →
 * offers → capital committed → closed) and roll the portfolio up into the
 * outcome metrics that matter: Conversion Rate, Capital Raised, Average Deal
 * Size, Time to Close, and Investor Response Rate.
 *
 * HARD HONESTY RULE (platform-wide, enforced here):
 *   - IVX NEVER fabricates deal data. `dealName` + a real `source`
 *     (owner_entered | submitted_form | crm_import | public_source | verified_deal)
 *     are required on create; public_source / crm_import also require attribution.
 *   - Milestone counters start at 0 and only move when the owner records real
 *     activity. Capital values stay null until known. Metrics are COMPUTED from
 *     these counters, never invented.
 *
 * Durable layout (mirrors the proven ivx-investor-crm-store pattern):
 *   logs/audit/deal-tracking/deals.jsonl  append-only event log
 *   logs/audit/deal-tracking/deals.json   materialised current state
 *
 * Runtime-light + deterministic: only filesystem I/O, no AI/network. Fully testable.
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

export const IVX_DEAL_TRACKING_MARKER = 'ivx-deal-tracking-2026-05-31';

export type DealSource =
  | 'owner_entered'
  | 'submitted_form'
  | 'crm_import'
  | 'public_source'
  | 'verified_deal';

/** Deal lifecycle status. */
export type DealStatus = 'open' | 'in_progress' | 'closed_won' | 'closed_lost';

/** The countable lifecycle milestones (all start at 0). */
export type DealMilestoneField =
  | 'investorsContacted'
  | 'investorsResponded'
  | 'buyersContacted'
  | 'meetingsScheduled'
  | 'documentsShared'
  | 'offersReceived';

export const DEAL_MILESTONE_FIELDS: readonly DealMilestoneField[] = [
  'investorsContacted', 'investorsResponded', 'buyersContacted',
  'meetingsScheduled', 'documentsShared', 'offersReceived',
];

export type DealTrackingRecord = {
  id: string;
  dealName: string;
  /** Developer / seller / counterparty name, or empty if unknown. */
  counterparty: string;
  status: DealStatus;
  investorsContacted: number;
  investorsResponded: number;
  buyersContacted: number;
  meetingsScheduled: number;
  documentsShared: number;
  offersReceived: number;
  /** Capital target in whole USD, or null if unknown. */
  capitalTarget: number | null;
  /** Capital committed so far in whole USD, or null if unknown. */
  capitalCommitted: number | null;
  /** ISO date the deal closed (won or lost), or null if still open. */
  closedAt: string | null;
  notes: string;
  source: DealSource;
  sourceDetail: string;
  createdAt: string;
  updatedAt: string;
};

const ROOT = auditDir('deal-tracking');
const STATE = path.join(ROOT, 'deals.json');

const VALID_SOURCES: ReadonlySet<DealSource> = new Set([
  'owner_entered', 'submitted_form', 'crm_import', 'public_source', 'verified_deal',
]);
const VALID_STATUS: ReadonlySet<DealStatus> = new Set([
  'open', 'in_progress', 'closed_won', 'closed_lost',
]);
const VALID_MILESTONES: ReadonlySet<string> = new Set(DEAL_MILESTONE_FIELDS);

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Parse a non-negative whole count, or 0. */
export function normalizeCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/** Parse a non-negative whole-USD amount, or null if absent/invalid. */
export function normalizeAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Normalize an ISO-ish date string to an ISO string, or null if absent/invalid. */
export function normalizeDate(value: unknown): string | null {
  const v = asTrimmedString(value);
  if (!v) return null;
  const time = Date.parse(v);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function isClosed(status: DealStatus): boolean {
  return status === 'closed_won' || status === 'closed_lost';
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  if (isDurableStoreConfigured()) {
    return readDurableJson<T>(file, fallback);
  }
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  if (isDurableStoreConfigured()) {
    await writeDurableJson(file, value);
    return;
  }
  await mkdir(ROOT, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
  const eventFile = path.join(ROOT, 'deals.jsonl');
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(eventFile, event);
    } catch {
      // Forensic log is best-effort; never break a write on log failure.
    }
    return;
  }
  try {
    await mkdir(ROOT, { recursive: true });
    await appendFile(eventFile, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensic log is best-effort; never break a write on log failure.
  }
}

export type CreateDealInput = {
  dealName: string;
  source: DealSource;
  sourceDetail?: string;
  counterparty?: string;
  status?: DealStatus;
  investorsContacted?: number;
  investorsResponded?: number;
  buyersContacted?: number;
  meetingsScheduled?: number;
  documentsShared?: number;
  offersReceived?: number;
  capitalTarget?: number | null;
  capitalCommitted?: number | null;
  closedAt?: string | null;
  notes?: string;
};

export type UpdateDealInput = Partial<Omit<CreateDealInput, 'source'>> & {
  source?: DealSource;
};

export type DealValidation = { ok: true } | { ok: false; error: string };

/** Validate a create input. Enforces the honesty rule: name + real source required. */
export function validateCreateDeal(input: CreateDealInput): DealValidation {
  if (!asTrimmedString(input.dealName)) {
    return { ok: false, error: 'Deal name is required — IVX never fabricates a deal record.' };
  }
  if (!VALID_SOURCES.has(input.source)) {
    return {
      ok: false,
      error: 'A real source is required (owner_entered | submitted_form | crm_import | public_source | verified_deal).',
    };
  }
  if ((input.source === 'public_source' || input.source === 'crm_import') && !asTrimmedString(input.sourceDetail)) {
    return {
      ok: false,
      error: 'Source attribution (sourceDetail) is required for public_source and crm_import records.',
    };
  }
  return { ok: true };
}

function buildRecord(input: CreateDealInput, prior?: DealTrackingRecord): DealTrackingRecord {
  const status: DealStatus = input.status && VALID_STATUS.has(input.status)
    ? input.status
    : prior?.status ?? 'open';
  // Auto-stamp closedAt when transitioning into a closed status without an explicit date.
  let closedAt = input.closedAt !== undefined ? normalizeDate(input.closedAt) : prior?.closedAt ?? null;
  if (isClosed(status) && closedAt === null) closedAt = nowIso();
  if (!isClosed(status)) closedAt = input.closedAt !== undefined ? normalizeDate(input.closedAt) : prior?.closedAt ?? null;

  const num = (key: DealMilestoneField): number =>
    input[key] !== undefined ? normalizeCount(input[key]) : prior?.[key] ?? 0;

  return {
    id: prior?.id ?? createId('deal'),
    dealName: asTrimmedString(input.dealName) || prior?.dealName || '',
    counterparty: input.counterparty !== undefined ? asTrimmedString(input.counterparty) : prior?.counterparty ?? '',
    status,
    investorsContacted: num('investorsContacted'),
    investorsResponded: num('investorsResponded'),
    buyersContacted: num('buyersContacted'),
    meetingsScheduled: num('meetingsScheduled'),
    documentsShared: num('documentsShared'),
    offersReceived: num('offersReceived'),
    capitalTarget: input.capitalTarget !== undefined ? normalizeAmount(input.capitalTarget) : prior?.capitalTarget ?? null,
    capitalCommitted: input.capitalCommitted !== undefined ? normalizeAmount(input.capitalCommitted) : prior?.capitalCommitted ?? null,
    closedAt,
    notes: input.notes !== undefined ? asTrimmedString(input.notes) : prior?.notes ?? '',
    source: input.source && VALID_SOURCES.has(input.source) ? input.source : prior?.source ?? 'owner_entered',
    sourceDetail: input.sourceDetail !== undefined ? asTrimmedString(input.sourceDetail) : prior?.sourceDetail ?? '',
    createdAt: prior?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export async function listDeals(): Promise<DealTrackingRecord[]> {
  const items = await readJsonFile<DealTrackingRecord[]>(STATE, []);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeal(id: string): Promise<DealTrackingRecord | null> {
  const items = await readJsonFile<DealTrackingRecord[]>(STATE, []);
  return items.find((item) => item.id === id) ?? null;
}

/** Create a new tracked deal. Returns the validation error on failure. */
export async function createDeal(
  input: CreateDealInput,
): Promise<{ ok: true; deal: DealTrackingRecord } | { ok: false; error: string }> {
  const validation = validateCreateDeal(input);
  if (!validation.ok) return validation;
  const items = await readJsonFile<DealTrackingRecord[]>(STATE, []);
  const record = buildRecord(input);
  items.push(record);
  await writeJsonFile(STATE, items);
  await appendEvent({ type: 'create', deal: record, at: record.createdAt });
  return { ok: true, deal: record };
}

/** Update a tracked deal. Returns null if not found. */
export async function updateDeal(id: string, patch: UpdateDealInput): Promise<DealTrackingRecord | null> {
  const items = await readJsonFile<DealTrackingRecord[]>(STATE, []);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const prior = items[index]!;
  const merged = buildRecord({ ...prior, ...patch, source: patch.source ?? prior.source, dealName: patch.dealName ?? prior.dealName }, prior);
  items[index] = merged;
  await writeJsonFile(STATE, items);
  await appendEvent({ type: 'update', dealId: id, deal: merged, at: merged.updatedAt });
  return merged;
}

/** Increment a milestone counter by `by` (default 1). Returns null if not found / invalid. */
export async function incrementDealMilestone(
  id: string,
  field: DealMilestoneField,
  by: number = 1,
): Promise<DealTrackingRecord | null> {
  if (!VALID_MILESTONES.has(field)) return null;
  const current = await getDeal(id);
  if (!current) return null;
  const next = Math.max(0, current[field] + Math.floor(by));
  return updateDeal(id, { [field]: next } as UpdateDealInput);
}

/** Move just the status. Returns null if not found / invalid. */
export async function setDealStatus(id: string, status: DealStatus): Promise<DealTrackingRecord | null> {
  if (!VALID_STATUS.has(status)) return null;
  return updateDeal(id, { status });
}

/** Delete a tracked deal. Returns true if a record was removed. */
export async function deleteDeal(id: string): Promise<boolean> {
  const items = await readJsonFile<DealTrackingRecord[]>(STATE, []);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeJsonFile(STATE, next);
  await appendEvent({ type: 'delete', dealId: id, at: nowIso() });
  return true;
}

export type DealTrackingMetrics = {
  marker: string;
  generatedAt: string;
  total: number;
  byStatus: Record<DealStatus, number>;
  /** closed_won / total, 0–100. */
  conversionRate: number;
  /** Sum of capitalCommitted on closed_won deals. */
  capitalRaised: number;
  /** capitalRaised / count of closed_won deals with a committed amount. */
  averageDealSize: number;
  /** Avg days from createdAt → closedAt over closed_won deals (null if none). */
  avgTimeToCloseDays: number | null;
  /** investorsResponded / investorsContacted across all deals, 0–100 (null if none contacted). */
  investorResponseRate: number | null;
  totalMeetings: number;
  totalOffers: number;
};

/** Read-only roll-up of the real outcome metrics across all tracked deals. */
export async function summarizeDeals(): Promise<DealTrackingMetrics> {
  const items = await readJsonFile<DealTrackingRecord[]>(STATE, []);
  const byStatus: Record<DealStatus, number> = {
    open: 0, in_progress: 0, closed_won: 0, closed_lost: 0,
  };
  let capitalRaised = 0;
  let wonWithAmount = 0;
  let closeDaysSum = 0;
  let closeDaysCount = 0;
  let investorsContacted = 0;
  let investorsResponded = 0;
  let totalMeetings = 0;
  let totalOffers = 0;

  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    investorsContacted += item.investorsContacted;
    investorsResponded += item.investorsResponded;
    totalMeetings += item.meetingsScheduled;
    totalOffers += item.offersReceived;
    if (item.status === 'closed_won') {
      if (item.capitalCommitted !== null) {
        capitalRaised += item.capitalCommitted;
        wonWithAmount += 1;
      }
      if (item.closedAt) {
        const days = (Date.parse(item.closedAt) - Date.parse(item.createdAt)) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(days) && days >= 0) {
          closeDaysSum += days;
          closeDaysCount += 1;
        }
      }
    }
  }

  const total = items.length;
  return {
    marker: IVX_DEAL_TRACKING_MARKER,
    generatedAt: nowIso(),
    total,
    byStatus,
    conversionRate: total > 0 ? Math.round((byStatus.closed_won / total) * 100) : 0,
    capitalRaised,
    averageDealSize: wonWithAmount > 0 ? Math.round(capitalRaised / wonWithAmount) : 0,
    avgTimeToCloseDays: closeDaysCount > 0 ? Math.round(closeDaysSum / closeDaysCount) : null,
    investorResponseRate: investorsContacted > 0 ? Math.round((investorsResponded / investorsContacted) * 100) : null,
    totalMeetings,
    totalOffers,
  };
}
