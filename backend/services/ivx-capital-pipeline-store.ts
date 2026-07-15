/**
 * IVX Capital Deployment Platform — Capital Pipeline durable store (owner-only).
 *
 * BLOCK 22. The second pillar of the Capital Deployment Platform: a real,
 * owner-managed capital pipeline. Each entry tracks a capital relationship
 * (an investor or a buyer) moving through nine stages toward a closed deal,
 * with the money math (requested / committed / remaining gap), a close
 * probability, and an expected close date.
 *
 * HARD HONESTY RULE (platform-wide, enforced here):
 *   - IVX NEVER fabricates investors, buyers, companies, or deal data. Every
 *     entry originates from a real, attributable source:
 *       owner_entered | submitted_form | crm_import | public_source | verified_deal
 *     `name` + a real `source` are required on create; public_source / crm_import
 *     also require `sourceDetail` attribution.
 *   - Unknown money values stay null — never invented. Remaining gap is COMPUTED
 *     from requested − committed, never guessed.
 *   - Close probability is an owner-supplied judgement (0–100), default 0.
 *
 * Durable layout (mirrors the proven ivx-investor-crm-store pattern):
 *   logs/audit/capital-pipeline/entries.jsonl  append-only event log
 *   logs/audit/capital-pipeline/entries.json   materialised current state
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

export const IVX_CAPITAL_PIPELINE_MARKER = 'ivx-capital-pipeline-2026-05-31';

/** Where a pipeline entry came from — required, for honest attribution. */
export type PipelineSource =
  | 'owner_entered'
  | 'submitted_form'
  | 'crm_import'
  | 'public_source'
  | 'verified_deal';

/** Whether this capital relationship is an investor or a buyer. */
export type PipelinePartyType = 'investor' | 'buyer';

/** The nine ordered pipeline stages. */
export type PipelineStage =
  | 'lead'
  | 'qualified'
  | 'contacted'
  | 'meeting'
  | 'interested'
  | 'due_diligence'
  | 'soft_commit'
  | 'hard_commit'
  | 'closed';

/** Ordered list of stages — used for "advance to next" and dashboard math. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'lead', 'qualified', 'contacted', 'meeting', 'interested',
  'due_diligence', 'soft_commit', 'hard_commit', 'closed',
];

export type PipelineEntry = {
  id: string;
  name: string;
  company: string;
  partyType: PipelinePartyType;
  /** Linked deal/project name (e.g. "Casa Rosario"), or empty if unassigned. */
  dealName: string;
  stage: PipelineStage;
  /** Capital the party could deploy, in whole USD, or null if unknown. */
  capitalRequested: number | null;
  /** Capital actually committed so far, in whole USD, or null if unknown. */
  capitalCommitted: number | null;
  /** COMPUTED: max(requested − committed, 0), or null when requested unknown. */
  remainingGap: number | null;
  /** Owner-supplied close probability, 0–100. */
  closeProbability: number;
  /** ISO date the deal is expected to close, or null. */
  expectedCloseDate: string | null;
  notes: string;
  source: PipelineSource;
  /** Attribution detail for the source. */
  sourceDetail: string;
  createdAt: string;
  updatedAt: string;
};

const ROOT = auditDir('capital-pipeline');
const STATE = path.join(ROOT, 'entries.json');

const VALID_SOURCES: ReadonlySet<PipelineSource> = new Set([
  'owner_entered', 'submitted_form', 'crm_import', 'public_source', 'verified_deal',
]);
const VALID_PARTY: ReadonlySet<PipelinePartyType> = new Set(['investor', 'buyer']);
const VALID_STAGE: ReadonlySet<PipelineStage> = new Set(PIPELINE_STAGES);

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

/** Clamp any input to a 0–100 integer score. */
export function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
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

/** Compute the remaining capital gap from requested + committed. */
export function computeRemainingGap(requested: number | null, committed: number | null): number | null {
  if (requested === null) return null;
  const gap = requested - (committed ?? 0);
  return Math.max(0, Math.round(gap));
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
  const eventFile = path.join(ROOT, 'entries.jsonl');
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(eventFile, event);
    } catch {
      // Forensic log is best-effort; never break a pipeline write on log failure.
    }
    return;
  }
  try {
    await mkdir(ROOT, { recursive: true });
    await appendFile(eventFile, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensic log is best-effort; never break a pipeline write on log failure.
  }
}

export type CreatePipelineInput = {
  name: string;
  source: PipelineSource;
  sourceDetail?: string;
  company?: string;
  partyType?: PipelinePartyType;
  dealName?: string;
  stage?: PipelineStage;
  capitalRequested?: number | null;
  capitalCommitted?: number | null;
  closeProbability?: number;
  expectedCloseDate?: string | null;
  notes?: string;
};

export type UpdatePipelineInput = Partial<Omit<CreatePipelineInput, 'source'>> & {
  source?: PipelineSource;
};

export type PipelineValidation = { ok: true } | { ok: false; error: string };

/**
 * Validate a create input. Enforces the honesty rule: name + a real attributable
 * source are required; public/CRM sources also require attribution.
 */
export function validateCreatePipeline(input: CreatePipelineInput): PipelineValidation {
  if (!asTrimmedString(input.name)) {
    return { ok: false, error: 'Entry name is required — IVX never fabricates a capital record.' };
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

function buildEntry(input: CreatePipelineInput, prior?: PipelineEntry): PipelineEntry {
  const stage: PipelineStage = input.stage && VALID_STAGE.has(input.stage)
    ? input.stage
    : prior?.stage ?? 'lead';
  const partyType: PipelinePartyType = input.partyType && VALID_PARTY.has(input.partyType)
    ? input.partyType
    : prior?.partyType ?? 'investor';
  const capitalRequested = input.capitalRequested !== undefined
    ? normalizeAmount(input.capitalRequested)
    : prior?.capitalRequested ?? null;
  const capitalCommitted = input.capitalCommitted !== undefined
    ? normalizeAmount(input.capitalCommitted)
    : prior?.capitalCommitted ?? null;
  return {
    id: prior?.id ?? createId('pipeline'),
    name: asTrimmedString(input.name) || prior?.name || '',
    company: input.company !== undefined ? asTrimmedString(input.company) : prior?.company ?? '',
    partyType,
    dealName: input.dealName !== undefined ? asTrimmedString(input.dealName) : prior?.dealName ?? '',
    stage,
    capitalRequested,
    capitalCommitted,
    remainingGap: computeRemainingGap(capitalRequested, capitalCommitted),
    closeProbability: input.closeProbability !== undefined ? clampScore(input.closeProbability) : prior?.closeProbability ?? 0,
    expectedCloseDate: input.expectedCloseDate !== undefined ? normalizeDate(input.expectedCloseDate) : prior?.expectedCloseDate ?? null,
    notes: input.notes !== undefined ? asTrimmedString(input.notes) : prior?.notes ?? '',
    source: input.source && VALID_SOURCES.has(input.source) ? input.source : prior?.source ?? 'owner_entered',
    sourceDetail: input.sourceDetail !== undefined ? asTrimmedString(input.sourceDetail) : prior?.sourceDetail ?? '',
    createdAt: prior?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

export async function listPipelineEntries(): Promise<PipelineEntry[]> {
  const items = await readJsonFile<PipelineEntry[]>(STATE, []);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPipelineEntry(id: string): Promise<PipelineEntry | null> {
  const items = await readJsonFile<PipelineEntry[]>(STATE, []);
  return items.find((item) => item.id === id) ?? null;
}

/** Create a new pipeline entry. Returns the validation error on failure. */
export async function createPipelineEntry(
  input: CreatePipelineInput,
): Promise<{ ok: true; entry: PipelineEntry } | { ok: false; error: string }> {
  const validation = validateCreatePipeline(input);
  if (!validation.ok) return validation;
  const items = await readJsonFile<PipelineEntry[]>(STATE, []);
  const record = buildEntry(input);
  items.push(record);
  await writeJsonFile(STATE, items);
  await appendEvent({ type: 'create', entry: record, at: record.createdAt });
  return { ok: true, entry: record };
}

/** Update an existing pipeline entry. Returns null if not found. */
export async function updatePipelineEntry(id: string, patch: UpdatePipelineInput): Promise<PipelineEntry | null> {
  const items = await readJsonFile<PipelineEntry[]>(STATE, []);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const prior = items[index]!;
  const merged = buildEntry({ ...prior, ...patch, source: patch.source ?? prior.source, name: patch.name ?? prior.name }, prior);
  items[index] = merged;
  await writeJsonFile(STATE, items);
  await appendEvent({ type: 'update', entryId: id, entry: merged, at: merged.updatedAt });
  return merged;
}

/** Move just the stage. Returns null if not found / invalid. */
export async function setPipelineStage(id: string, stage: PipelineStage): Promise<PipelineEntry | null> {
  if (!VALID_STAGE.has(stage)) return null;
  return updatePipelineEntry(id, { stage });
}

/** Delete a pipeline entry. Returns true if a record was removed. */
export async function deletePipelineEntry(id: string): Promise<boolean> {
  const items = await readJsonFile<PipelineEntry[]>(STATE, []);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeJsonFile(STATE, next);
  await appendEvent({ type: 'delete', entryId: id, at: nowIso() });
  return true;
}

export type PipelineSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byStage: Record<PipelineStage, number>;
  /** Sum of capitalRequested across all open (non-closed) entries. */
  totalPipeline: number;
  /** Sum of capitalCommitted across all entries. */
  capitalCommitted: number;
  /** Sum of capitalCommitted on closed entries (capital actually raised). */
  capitalRaised: number;
  /** Probability-weighted committed/requested across open entries. */
  weightedPipeline: number;
  activeInvestors: number;
  activeBuyers: number;
  /** Entries not yet closed. */
  dealsInProgress: number;
  closed: number;
};

/** Read-only roll-up over the pipeline for the dashboard header. */
export async function summarizePipeline(): Promise<PipelineSummary> {
  const items = await readJsonFile<PipelineEntry[]>(STATE, []);
  const byStage: Record<PipelineStage, number> = {
    lead: 0, qualified: 0, contacted: 0, meeting: 0, interested: 0,
    due_diligence: 0, soft_commit: 0, hard_commit: 0, closed: 0,
  };
  let totalPipeline = 0;
  let capitalCommitted = 0;
  let capitalRaised = 0;
  let weightedPipeline = 0;
  let activeInvestors = 0;
  let activeBuyers = 0;
  let dealsInProgress = 0;
  let closed = 0;

  for (const item of items) {
    byStage[item.stage] = (byStage[item.stage] ?? 0) + 1;
    const isClosed = item.stage === 'closed';
    capitalCommitted += item.capitalCommitted ?? 0;
    if (isClosed) {
      capitalRaised += item.capitalCommitted ?? 0;
      closed += 1;
    } else {
      dealsInProgress += 1;
      totalPipeline += item.capitalRequested ?? 0;
      const base = item.capitalCommitted ?? item.capitalRequested ?? 0;
      weightedPipeline += Math.round((base * item.closeProbability) / 100);
      if (item.partyType === 'investor') activeInvestors += 1;
      else activeBuyers += 1;
    }
  }

  return {
    marker: IVX_CAPITAL_PIPELINE_MARKER,
    generatedAt: nowIso(),
    total: items.length,
    byStage,
    totalPipeline,
    capitalCommitted,
    capitalRaised,
    weightedPipeline,
    activeInvestors,
    activeBuyers,
    dealsInProgress,
    closed,
  };
}
