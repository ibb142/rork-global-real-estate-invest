/**
 * IVX Private Lender Network — durable store (owner-only).
 *
 * Module 3 of the IVX Autonomous Business Execution Engine. Tracks the
 * structured lender database the owner asked for:
 *   - hard money lenders
 *   - private lenders
 *   - bridge lenders
 *   - construction lenders
 *   - commercial lenders
 *
 * Each lender record carries the structured fields the owner specified:
 *   - loan types
 *   - LTV (loan-to-value)
 *   - interest range
 *   - markets served
 *   - contact information (publicly sourced only)
 *   - approval requirements
 *
 * HARD HONESTY RULES (same as the capital-network store):
 *   - NEVER fabricate named individuals/companies/contact details. Records are
 *     high-probability LENDER PROFILES (segments / archetypes) grounded in IVX's
 *     real deal data and the LEGITIMATE public sourcing channel where such
 *     lenders can actually be found + consented.
 *   - Optimize for QUALITY (highest-probability fit), not the largest number of names.
 *   - Unknown values stay null/empty — never invented.
 *   - Every profile carries an explicit compliance/privacy note.
 *
 * Durable layout (mirrors the proven capital-network-store pattern):
 *   logs/audit/lender-network/lenders.jsonl  append-only event log
 *   logs/audit/lender-network/lenders.json   materialised current state
 *
 * Runtime-light + deterministic: only filesystem/Supabase I/O, no AI/network.
 * Fully testable.
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

export const IVX_LENDER_NETWORK_MARKER = 'ivx-lender-network-2026-07-04';

/** The five lender categories the owner asked the engine to track. */
export type LenderCategory =
  | 'hard_money'
  | 'private'
  | 'bridge'
  | 'construction'
  | 'commercial';

export const LENDER_CATEGORIES: readonly LenderCategory[] = [
  'hard_money',
  'private',
  'bridge',
  'construction',
  'commercial',
];

export const LENDER_CATEGORY_LABEL: Record<LenderCategory, string> = {
  hard_money: 'Hard money lender',
  private: 'Private lender',
  bridge: 'Bridge lender',
  construction: 'Construction lender',
  commercial: 'Commercial lender',
};

/** Owner review lifecycle for a lender profile. */
export type LenderStatus = 'new' | 'researching' | 'contacted' | 'qualified' | 'matched' | 'dismissed';

/**
 * Structured lender record — the fields the owner explicitly asked for.
 * No fabricated names/contacts: `name` is the segment/archetype label, and
 * `publicSource` names the legitimate channel where such lenders can be found.
 */
export type LenderProfile = {
  id: string;
  category: LenderCategory;
  categoryLabel: string;
  /** Segment / archetype name — NOT a fabricated individual company. */
  name: string;
  companyType: string;
  /** Loan types this lender category offers (e.g. acquisition, refinance, cash-out). */
  loanTypes: string[];
  /** Maximum loan-to-value ratio this lender category typically supports (0–100). */
  maxLtvPercent: number | null;
  /** Typical interest rate range for this lender category (APR, low–high). */
  interestRateRangeLowPct: number | null;
  interestRateRangeHighPct: number | null;
  /** Geographic markets this lender category serves. */
  marketsServed: string[];
  /** Typical loan size range (USD, low–high). */
  loanSizeMinUsd: number | null;
  loanSizeMaxUsd: number | null;
  /** What this lender category needs to approve a loan. */
  approvalRequirements: string[];
  /** Legitimate public channel where these lenders can actually be found. */
  publicSource: string;
  /** Legitimate public contact channel (NMLS registry, public website form) — never a scraped private phone/email. */
  contactChannel: string;
  /** Fit score 0–100 (higher = better fit for IVX's South Florida luxury deals). */
  fitScore: number;
  /** Why IVX selected this lender segment. */
  rationale: string;
  /** The concrete next action the owner should take. */
  nextAction: string;
  /** IVX deals this lender profile is matched to (by name). */
  matchedDealNames: string[];
  /** Compliance / privacy note (always present). */
  complianceNote: string;
  status: LenderStatus;
  createdAt: string;
  updatedAt: string;
};

const LENDER_ROOT = auditDir('lender-network');
const LENDERS_STATE = path.join(LENDER_ROOT, 'lenders.json');

const VALID_CATEGORIES: ReadonlySet<LenderCategory> = new Set(LENDER_CATEGORIES);
const VALID_STATUS: ReadonlySet<LenderStatus> = new Set([
  'new', 'researching', 'contacted', 'qualified', 'matched', 'dismissed',
]);

export const DEFAULT_LENDER_COMPLIANCE_NOTE =
  'High-probability LENDER PROFILE (segment) derived from IVX deal data — not a fabricated individual company or contact detail. ' +
  'Source named, consented contacts only through the listed public channels (NMLS registry, public website intake forms). ' +
  'Confirm licensing, usury, and state lender rules with licensed counsel before drawing debt. IVX never invents names, emails, or phone numbers.';

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Clamp any input to a 0–100 integer score. */
export function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
}

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? n : null;
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
  await mkdir(LENDER_ROOT, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
  const eventFile = path.join(LENDER_ROOT, 'lenders.jsonl');
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(eventFile, event);
    } catch {
      // Forensic log is best-effort; never break a write on log failure.
    }
    return;
  }
  await mkdir(LENDER_ROOT, { recursive: true });
  await appendFile(eventFile, `${JSON.stringify(event)}\n`, 'utf8');
}

export type CreateLenderInput = {
  category: LenderCategory;
  name: string;
  companyType: string;
  loanTypes?: string[];
  maxLtvPercent?: number | null;
  interestRateRangeLowPct?: number | null;
  interestRateRangeHighPct?: number | null;
  marketsServed?: string[];
  loanSizeMinUsd?: number | null;
  loanSizeMaxUsd?: number | null;
  approvalRequirements?: string[];
  publicSource: string;
  contactChannel: string;
  fitScore?: number;
  rationale: string;
  nextAction: string;
  matchedDealNames?: string[];
  complianceNote?: string;
};

/** List lender profiles, ranked by fit score (then recency). */
export async function listLenders(): Promise<LenderProfile[]> {
  const items = await readJsonFile<LenderProfile[]>(LENDERS_STATE, []);
  return [...items].sort((a, b) => b.fitScore - a.fitScore || b.updatedAt.localeCompare(a.updatedAt));
}

/** Read a single lender profile by id, or null if it does not exist. */
export async function getLender(lenderId: string): Promise<LenderProfile | null> {
  const items = await readJsonFile<LenderProfile[]>(LENDERS_STATE, []);
  return items.find((item) => item.id === lenderId) ?? null;
}

/**
 * Insert/refresh lender profiles, de-duplicating by (category + normalized name)
 * so repeated scans refine in place. Returns the ranked list. A reviewed profile's
 * status is preserved; matched deal names accumulate.
 */
export async function upsertLenders(inputs: CreateLenderInput[]): Promise<LenderProfile[]> {
  const existing = await readJsonFile<LenderProfile[]>(LENDERS_STATE, []);
  const keyOf = (category: string, name: string): string => `${category}::${name.trim().toLowerCase()}`;
  const byKey = new Map<string, LenderProfile>(existing.map((item) => [keyOf(item.category, item.name), item]));

  for (const input of inputs) {
    const category: LenderCategory = VALID_CATEGORIES.has(input.category) ? input.category : 'private';
    const name = input.name.trim();
    if (!name) continue;
    const key = keyOf(category, name);
    const prior = byKey.get(key);
    const mergedDeals = Array.from(
      new Set([...(prior?.matchedDealNames ?? []), ...(input.matchedDealNames ?? [])].map((d) => d.trim()).filter(Boolean)),
    );
    const profile: LenderProfile = {
      id: prior?.id ?? createId('lender'),
      category,
      categoryLabel: LENDER_CATEGORY_LABEL[category],
      name,
      companyType: input.companyType.trim(),
      loanTypes: normalizeStringArray(input.loanTypes),
      maxLtvPercent: normalizeNumber(input.maxLtvPercent),
      interestRateRangeLowPct: normalizeNumber(input.interestRateRangeLowPct),
      interestRateRangeHighPct: normalizeNumber(input.interestRateRangeHighPct),
      marketsServed: normalizeStringArray(input.marketsServed),
      loanSizeMinUsd: normalizeNumber(input.loanSizeMinUsd),
      loanSizeMaxUsd: normalizeNumber(input.loanSizeMaxUsd),
      approvalRequirements: normalizeStringArray(input.approvalRequirements),
      publicSource: input.publicSource.trim(),
      contactChannel: input.contactChannel.trim(),
      fitScore: clampScore(input.fitScore ?? prior?.fitScore ?? 0),
      rationale: input.rationale.trim(),
      nextAction: input.nextAction.trim(),
      matchedDealNames: mergedDeals,
      complianceNote: (input.complianceNote ?? DEFAULT_LENDER_COMPLIANCE_NOTE).trim(),
      status: prior?.status ?? 'new',
      createdAt: prior?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    byKey.set(key, profile);
    await appendEvent({ type: 'upsert', profile, at: profile.updatedAt });
  }

  const next = Array.from(byKey.values());
  await writeJsonFile(LENDERS_STATE, next);
  return [...next].sort((a, b) => b.fitScore - a.fitScore);
}

export async function setLenderStatus(
  lenderId: string,
  status: LenderStatus,
): Promise<LenderProfile | null> {
  if (!VALID_STATUS.has(status)) return null;
  const items = await readJsonFile<LenderProfile[]>(LENDERS_STATE, []);
  const index = items.findIndex((item) => item.id === lenderId);
  if (index === -1) return null;
  const updated: LenderProfile = { ...items[index]!, status, updatedAt: nowIso() };
  items[index] = updated;
  await appendEvent({ type: 'set_status', lenderId, status, at: updated.updatedAt });
  await writeJsonFile(LENDERS_STATE, items);
  return updated;
}

/** Counts by category — used by the dashboard. */
export async function lenderCountsByCategory(): Promise<Record<LenderCategory, number>> {
  const items = await readJsonFile<LenderProfile[]>(LENDERS_STATE, []);
  const counts: Record<LenderCategory, number> = {
    hard_money: 0,
    private: 0,
    bridge: 0,
    construction: 0,
    commercial: 0,
  };
  for (const item of items) {
    counts[item.category] += 1;
  }
  return counts;
}
