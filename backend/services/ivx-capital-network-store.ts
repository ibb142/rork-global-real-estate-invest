/**
 * IVX South Florida Luxury Capital Intelligence Network — durable store (owner-only).
 *
 * BLOCK 17 (revised). NOT a global-everything scanner. This stores the highest-
 * probability CAPITAL SOURCES for IVX's South Florida luxury real-estate offerings:
 * luxury buyers, real-estate investors, developers, and strategic partners — ranked
 * by how well they fit IVX's actual published deals.
 *
 * HARD HONESTY RULES (encoded throughout the engine that writes here):
 *   - NEVER fabricate named real individuals, companies, emails, phones, or social
 *     profiles. Records are high-probability PROSPECT PROFILES (segments / archetypes)
 *     derived from IVX's own deal data, plus the LEGITIMATE public sourcing channel
 *     where such prospects can actually be found + consented.
 *   - Optimize for QUALITY (highest-probability fit), not the largest number of names.
 *   - Unknown values stay null/empty — never invented.
 *   - Every profile carries an explicit compliance/privacy note.
 *
 * Durable layout (mirrors the proven ivx-opportunity-store pattern):
 *   logs/audit/capital-network/profiles.jsonl  append-only event log
 *   logs/audit/capital-network/profiles.json   materialised current state
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

export const IVX_CAPITAL_NETWORK_MARKER = 'ivx-capital-network-sfla-2026-05-30';

/** The four capital-source profile types the network targets. */
export type ProspectType = 'buyer' | 'investor' | 'developer' | 'partner';

/** Owner review lifecycle for a prospect profile. */
export type ProspectStatus = 'new' | 'researching' | 'contacted' | 'qualified' | 'matched' | 'dismissed';

/**
 * Three ranking dimensions (0–100, higher = better):
 *   confidence — how strongly IVX's data supports this being a real, reachable segment.
 *   relevance  — relevance to IVX's South Florida luxury focus.
 *   dealFit    — how well the segment fits IVX's actual published deal economics.
 */
export type ProspectScores = {
  confidence: number;
  relevance: number;
  dealFit: number;
};

export type ProspectProfile = {
  id: string;
  type: ProspectType;
  /** Segment / archetype name — NOT a fabricated individual. */
  segment: string;
  /** Organization archetype (e.g. "Family office", "Multifamily syndicator"). */
  companyType: string;
  /** Target market this segment is active in. */
  market: string;
  /** What this segment invests in / buys. */
  investmentFocus: string;
  /** Legitimate public channel where these prospects can actually be found. */
  publicSource: string;
  scores: ProspectScores;
  /** Blended 0–100 fit (higher = better). */
  overall: number;
  /** Why IVX selected this segment. */
  rationale: string;
  /** Plain-text evidence grounded in real IVX deal data. */
  evidence: string;
  /** Demand signal (buyers) / capital signal (investors/partners). */
  signal: string;
  risks: string[];
  /** The concrete next action the owner should take. */
  nextAction: string;
  /** IVX deals this profile is matched to (by name). */
  matchedDealNames: string[];
  /** Compliance / privacy note (always present). */
  complianceNote: string;
  status: ProspectStatus;
  createdAt: string;
  updatedAt: string;
};

const NETWORK_ROOT = auditDir('capital-network');
const PROFILES_STATE = path.join(NETWORK_ROOT, 'profiles.json');

const VALID_TYPES: ReadonlySet<ProspectType> = new Set(['buyer', 'investor', 'developer', 'partner']);
const VALID_STATUS: ReadonlySet<ProspectStatus> = new Set([
  'new', 'researching', 'contacted', 'qualified', 'matched', 'dismissed',
]);

export const DEFAULT_COMPLIANCE_NOTE =
  'High-probability prospect PROFILE (segment) derived from IVX deal data — not a fabricated individual or contact detail. ' +
  'Source named, consented contacts only through the listed public channels. Confirm Fair Housing, securities/accredited-investor, ' +
  'and privacy rules with licensed counsel before outreach. IVX never invents names, emails, or phone numbers.';

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

function normalizeScores(input: Partial<ProspectScores> | undefined): ProspectScores {
  return {
    confidence: clampScore(input?.confidence),
    relevance: clampScore(input?.relevance),
    dealFit: clampScore(input?.dealFit),
  };
}

/**
 * Blend the three ranking dimensions into one 0–100 fit score. Deal-fit and
 * relevance dominate (we optimize for the highest-probability capital source for
 * IVX's actual offerings); confidence tempers it. Deterministic + testable.
 */
export function computeProspectOverall(scores: ProspectScores): number {
  const blended = scores.dealFit * 0.42 + scores.relevance * 0.36 + scores.confidence * 0.22;
  return clampScore(blended);
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
  await mkdir(NETWORK_ROOT, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
  const eventFile = path.join(NETWORK_ROOT, 'profiles.jsonl');
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(eventFile, event);
    } catch {
      // Forensic log is best-effort; never break a write on log failure.
    }
    return;
  }
  await mkdir(NETWORK_ROOT, { recursive: true });
  await appendFile(eventFile, `${JSON.stringify(event)}\n`, 'utf8');
}

export type CreateProspectInput = {
  type: ProspectType;
  segment: string;
  companyType: string;
  market: string;
  investmentFocus: string;
  publicSource: string;
  scores: Partial<ProspectScores>;
  rationale: string;
  evidence: string;
  signal: string;
  risks?: string[];
  nextAction: string;
  matchedDealNames?: string[];
  complianceNote?: string;
};

export async function listProspects(): Promise<ProspectProfile[]> {
  const items = await readJsonFile<ProspectProfile[]>(PROFILES_STATE, []);
  return [...items].sort((a, b) => b.overall - a.overall || b.updatedAt.localeCompare(a.updatedAt));
}

/** Read a single prospect profile by id, or null if it does not exist. */
export async function getProspect(prospectId: string): Promise<ProspectProfile | null> {
  const items = await readJsonFile<ProspectProfile[]>(PROFILES_STATE, []);
  return items.find((item) => item.id === prospectId) ?? null;
}

/**
 * Insert/refresh prospect profiles, de-duplicating by (type + normalized segment)
 * so repeated scans refine in place. Returns the ranked list. A reviewed profile's
 * status is preserved; matched deal names accumulate.
 */
export async function upsertProspects(inputs: CreateProspectInput[]): Promise<ProspectProfile[]> {
  const existing = await readJsonFile<ProspectProfile[]>(PROFILES_STATE, []);
  const keyOf = (type: string, segment: string): string => `${type}::${segment.trim().toLowerCase()}`;
  const byKey = new Map<string, ProspectProfile>(existing.map((item) => [keyOf(item.type, item.segment), item]));

  for (const input of inputs) {
    const type: ProspectType = VALID_TYPES.has(input.type) ? input.type : 'investor';
    const segment = input.segment.trim();
    if (!segment) continue;
    const key = keyOf(type, segment);
    const prior = byKey.get(key);
    const scores = normalizeScores(input.scores);
    const mergedDeals = Array.from(
      new Set([...(prior?.matchedDealNames ?? []), ...(input.matchedDealNames ?? [])].map((d) => d.trim()).filter(Boolean)),
    );
    const profile: ProspectProfile = {
      id: prior?.id ?? createId('prospect'),
      type,
      segment,
      companyType: input.companyType.trim(),
      market: input.market.trim(),
      investmentFocus: input.investmentFocus.trim(),
      publicSource: input.publicSource.trim(),
      scores,
      overall: computeProspectOverall(scores),
      rationale: input.rationale.trim(),
      evidence: input.evidence.trim(),
      signal: input.signal.trim(),
      risks: (input.risks ?? []).map((r) => r.trim()).filter(Boolean),
      nextAction: input.nextAction.trim(),
      matchedDealNames: mergedDeals,
      complianceNote: (input.complianceNote ?? DEFAULT_COMPLIANCE_NOTE).trim(),
      status: prior?.status ?? 'new',
      createdAt: prior?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    byKey.set(key, profile);
    await appendEvent({ type: 'upsert', profile, at: profile.updatedAt });
  }

  const next = Array.from(byKey.values());
  await writeJsonFile(PROFILES_STATE, next);
  return [...next].sort((a, b) => b.overall - a.overall);
}

export async function setProspectStatus(
  prospectId: string,
  status: ProspectStatus,
): Promise<ProspectProfile | null> {
  if (!VALID_STATUS.has(status)) return null;
  const items = await readJsonFile<ProspectProfile[]>(PROFILES_STATE, []);
  const index = items.findIndex((item) => item.id === prospectId);
  if (index === -1) return null;
  const updated: ProspectProfile = { ...items[index]!, status, updatedAt: nowIso() };
  items[index] = updated;
  await appendEvent({ type: 'set_status', prospectId, status, at: updated.updatedAt });
  await writeJsonFile(PROFILES_STATE, items);
  return updated;
}
