/**
 * IVX Innovation store — durable persistence for the Autonomous Innovation System.
 *
 * Three record families, each append-only + materialised state, mirroring the
 * proven `ivx-audit-item-store` durability pattern (survives process restarts):
 *
 *   ideas        — scored product/business/AI/platform/tech concepts from the engine
 *   hypotheses   — Research Lab hypotheses awaiting/under experimentation
 *   experiments  — tracked experiments (running/completed) tied to a hypothesis
 *
 * Layout (durable across restarts):
 *   logs/audit/innovation/ideas.jsonl        append-only event log
 *   logs/audit/innovation/ideas.json         materialised current state
 *   logs/audit/innovation/hypotheses.jsonl   append-only event log
 *   logs/audit/innovation/hypotheses.json    materialised current state
 *   logs/audit/innovation/experiments.jsonl  append-only event log
 *   logs/audit/innovation/experiments.json   materialised current state
 *
 * The JSONL log is the source of truth (append-only, never rewritten); the JSON
 * state file is a fast-read materialised view rewritten on each mutation.
 *
 * Runtime-light + deterministic: only filesystem I/O, no AI/network. Fully
 * unit-testable. All scores are clamped to 0–100 integers so the dashboard math
 * can never drift.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const IVX_INNOVATION_MARKER = 'ivx-innovation-system-2026-05-30';

/** The five idea categories the Innovation Engine generates. */
export type InnovationIdeaCategory =
  | 'product'
  | 'business_model'
  | 'ai_workflow'
  | 'platform_capability'
  | 'technology_concept';

/** Owner review lifecycle for any innovation artifact. */
export type InnovationReviewStatus = 'proposed' | 'approved' | 'rejected' | 'shipped';

export type ExperimentStatus = 'planned' | 'running' | 'completed' | 'abandoned';

export type HypothesisStatus = 'open' | 'testing' | 'validated' | 'invalidated';

/** The five signal sources the engine scans. */
export type InnovationSignalSource =
  | 'ivx_data'
  | 'user_behavior'
  | 'performance'
  | 'market'
  | 'competitor';

/** Per-idea multi-dimensional scoring (every value 0–100). */
export type InnovationScores = {
  confidence: number;
  impact: number;
  feasibility: number;
  revenue: number;
  /** Implementation complexity: higher = harder. */
  complexity: number;
};

export type InnovationIdea = {
  id: string;
  title: string;
  summary: string;
  category: InnovationIdeaCategory;
  signalSource: InnovationSignalSource;
  /** Concrete evidence the idea was derived from (file, metric, count, etc.). */
  evidence: string;
  scores: InnovationScores;
  /** Weighted overall priority (0–100), derived from the score vector. */
  priority: number;
  status: InnovationReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type ResearchHypothesis = {
  id: string;
  statement: string;
  rationale: string;
  /** Optional idea this hypothesis was spawned from. */
  ideaId: string | null;
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
};

export type ResearchExperiment = {
  id: string;
  title: string;
  /** Hypothesis under test, if any. */
  hypothesisId: string | null;
  method: string;
  metric: string;
  status: ExperimentStatus;
  result: string | null;
  createdAt: string;
  updatedAt: string;
};

const INNOVATION_ROOT = path.join(process.cwd(), 'logs', 'audit', 'innovation');

const VALID_CATEGORIES: ReadonlySet<InnovationIdeaCategory> = new Set([
  'product', 'business_model', 'ai_workflow', 'platform_capability', 'technology_concept',
]);
const VALID_SIGNALS: ReadonlySet<InnovationSignalSource> = new Set([
  'ivx_data', 'user_behavior', 'performance', 'market', 'competitor',
]);
const VALID_REVIEW: ReadonlySet<InnovationReviewStatus> = new Set([
  'proposed', 'approved', 'rejected', 'shipped',
]);
const VALID_HYPOTHESIS: ReadonlySet<HypothesisStatus> = new Set([
  'open', 'testing', 'validated', 'invalidated',
]);
const VALID_EXPERIMENT: ReadonlySet<ExperimentStatus> = new Set([
  'planned', 'running', 'completed', 'abandoned',
]);

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

function normalizeScores(input: Partial<InnovationScores> | undefined): InnovationScores {
  return {
    confidence: clampScore(input?.confidence),
    impact: clampScore(input?.impact),
    feasibility: clampScore(input?.feasibility),
    revenue: clampScore(input?.revenue),
    complexity: clampScore(input?.complexity),
  };
}

/**
 * Weighted priority from the score vector. Impact + revenue + feasibility +
 * confidence push the score up; complexity pulls it down. Result clamped 0–100.
 */
export function computeIdeaPriority(scores: InnovationScores): number {
  const positive =
    scores.impact * 0.32 +
    scores.revenue * 0.26 +
    scores.feasibility * 0.22 +
    scores.confidence * 0.2;
  // Complexity is a friction term: very complex ideas lose up to ~25 points.
  const friction = (scores.complexity / 100) * 25;
  return clampScore(positive - friction);
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(INNOVATION_ROOT, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendEvent(logFile: string, event: Record<string, unknown>): Promise<void> {
  await mkdir(INNOVATION_ROOT, { recursive: true });
  await appendFile(path.join(INNOVATION_ROOT, logFile), `${JSON.stringify(event)}\n`, 'utf8');
}

const IDEAS_STATE = path.join(INNOVATION_ROOT, 'ideas.json');
const HYPOTHESES_STATE = path.join(INNOVATION_ROOT, 'hypotheses.json');
const EXPERIMENTS_STATE = path.join(INNOVATION_ROOT, 'experiments.json');

// ── Ideas ──────────────────────────────────────────────────────────────────

export type CreateIdeaInput = {
  title: string;
  summary: string;
  category: InnovationIdeaCategory;
  signalSource: InnovationSignalSource;
  evidence: string;
  scores: Partial<InnovationScores>;
};

export async function listIdeas(): Promise<InnovationIdea[]> {
  const ideas = await readJsonFile<InnovationIdea[]>(IDEAS_STATE, []);
  return [...ideas].sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Insert ideas, de-duplicating by normalized title so repeated engine runs do
 * not create duplicate concepts (an existing idea is refreshed in place).
 */
export async function upsertIdeas(inputs: CreateIdeaInput[]): Promise<InnovationIdea[]> {
  const existing = await readJsonFile<InnovationIdea[]>(IDEAS_STATE, []);
  const byKey = new Map<string, InnovationIdea>(
    existing.map((idea) => [idea.title.trim().toLowerCase(), idea]),
  );

  for (const input of inputs) {
    const key = input.title.trim().toLowerCase();
    if (!key) continue;
    const prior = byKey.get(key);
    const scores = normalizeScores(input.scores);
    const idea: InnovationIdea = {
      id: prior?.id ?? createId('idea'),
      title: input.title.trim(),
      summary: input.summary.trim(),
      category: VALID_CATEGORIES.has(input.category) ? input.category : 'product',
      signalSource: VALID_SIGNALS.has(input.signalSource) ? input.signalSource : 'ivx_data',
      evidence: input.evidence.trim(),
      scores,
      priority: computeIdeaPriority(scores),
      // Never silently downgrade a reviewed idea back to proposed.
      status: prior?.status ?? 'proposed',
      createdAt: prior?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    byKey.set(key, idea);
    await appendEvent('ideas.jsonl', { type: 'upsert_idea', idea, at: idea.updatedAt });
  }

  const next = Array.from(byKey.values());
  await writeJsonFile(IDEAS_STATE, next);
  return [...next].sort((a, b) => b.priority - a.priority);
}

export async function setIdeaStatus(
  ideaId: string,
  status: InnovationReviewStatus,
): Promise<InnovationIdea | null> {
  if (!VALID_REVIEW.has(status)) return null;
  const ideas = await readJsonFile<InnovationIdea[]>(IDEAS_STATE, []);
  const index = ideas.findIndex((idea) => idea.id === ideaId);
  if (index === -1) return null;
  const updated: InnovationIdea = { ...ideas[index]!, status, updatedAt: nowIso() };
  ideas[index] = updated;
  await appendEvent('ideas.jsonl', { type: 'set_status', ideaId, status, at: updated.updatedAt });
  await writeJsonFile(IDEAS_STATE, ideas);
  return updated;
}

// ── Hypotheses ──────────────────────────────────────────────────────────────

export type CreateHypothesisInput = {
  statement: string;
  rationale: string;
  ideaId?: string | null;
};

export async function listHypotheses(): Promise<ResearchHypothesis[]> {
  const items = await readJsonFile<ResearchHypothesis[]>(HYPOTHESES_STATE, []);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createHypothesis(input: CreateHypothesisInput): Promise<ResearchHypothesis> {
  const items = await readJsonFile<ResearchHypothesis[]>(HYPOTHESES_STATE, []);
  const hypothesis: ResearchHypothesis = {
    id: createId('hyp'),
    statement: input.statement.trim(),
    rationale: input.rationale.trim(),
    ideaId: input.ideaId?.trim() || null,
    status: 'open',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  items.push(hypothesis);
  await appendEvent('hypotheses.jsonl', { type: 'create', hypothesis, at: hypothesis.createdAt });
  await writeJsonFile(HYPOTHESES_STATE, items);
  return hypothesis;
}

export async function setHypothesisStatus(
  hypothesisId: string,
  status: HypothesisStatus,
): Promise<ResearchHypothesis | null> {
  if (!VALID_HYPOTHESIS.has(status)) return null;
  const items = await readJsonFile<ResearchHypothesis[]>(HYPOTHESES_STATE, []);
  const index = items.findIndex((item) => item.id === hypothesisId);
  if (index === -1) return null;
  const updated: ResearchHypothesis = { ...items[index]!, status, updatedAt: nowIso() };
  items[index] = updated;
  await appendEvent('hypotheses.jsonl', { type: 'set_status', hypothesisId, status, at: updated.updatedAt });
  await writeJsonFile(HYPOTHESES_STATE, items);
  return updated;
}

// ── Experiments ─────────────────────────────────────────────────────────────

export type CreateExperimentInput = {
  title: string;
  method: string;
  metric: string;
  hypothesisId?: string | null;
};

export async function listExperiments(): Promise<ResearchExperiment[]> {
  const items = await readJsonFile<ResearchExperiment[]>(EXPERIMENTS_STATE, []);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createExperiment(input: CreateExperimentInput): Promise<ResearchExperiment> {
  const items = await readJsonFile<ResearchExperiment[]>(EXPERIMENTS_STATE, []);
  const experiment: ResearchExperiment = {
    id: createId('exp'),
    title: input.title.trim(),
    hypothesisId: input.hypothesisId?.trim() || null,
    method: input.method.trim(),
    metric: input.metric.trim(),
    status: 'planned',
    result: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  items.push(experiment);
  await appendEvent('experiments.jsonl', { type: 'create', experiment, at: experiment.createdAt });
  await writeJsonFile(EXPERIMENTS_STATE, items);
  return experiment;
}

export async function updateExperiment(
  experimentId: string,
  patch: { status?: ExperimentStatus; result?: string | null },
): Promise<ResearchExperiment | null> {
  const items = await readJsonFile<ResearchExperiment[]>(EXPERIMENTS_STATE, []);
  const index = items.findIndex((item) => item.id === experimentId);
  if (index === -1) return null;
  const current = items[index]!;
  const nextStatus = patch.status && VALID_EXPERIMENT.has(patch.status) ? patch.status : current.status;
  const updated: ResearchExperiment = {
    ...current,
    status: nextStatus,
    result: patch.result !== undefined ? patch.result : current.result,
    updatedAt: nowIso(),
  };
  items[index] = updated;
  await appendEvent('experiments.jsonl', { type: 'update', experimentId, patch, at: updated.updatedAt });
  await writeJsonFile(EXPERIMENTS_STATE, items);
  return updated;
}
