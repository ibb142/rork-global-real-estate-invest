/**
 * IVX Unified Executive Memory + Executive Action Loop client (owner-only) — BLOCK 39.
 *
 * Thin client over the owner-gated unified-memory + action-loop APIs — the single
 * memory shared by Owner AI, CRM AI, Autonomous Mode, and the Executive Layer, plus
 * the recommendation → execution → outcome → learning loop. Auth + base URL reuse the
 * same owner-session pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type MemoryKind =
  | 'goal'
  | 'project'
  | 'investor'
  | 'crm_entity'
  | 'owner_preference'
  | 'decision'
  | 'execution_history'
  | 'technical_debt'
  | 'architecture_decision'
  | 'outcome';

export type MemorySource =
  | 'owner_ai'
  | 'crm_ai'
  | 'autonomous_mode'
  | 'executive_layer'
  | 'owner'
  | 'system';

export type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  tags: string[];
  source: MemorySource;
  status: string;
  relatedIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemorySummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byKind: Record<MemoryKind, number>;
  bySource: Record<MemorySource, number>;
  lastUpdatedAt: string | null;
};

export type RiskLevel = 'low' | 'medium' | 'high';
export type OutcomeResult = 'success' | 'failure' | 'partial' | 'unknown';
export type ExecutionStatus = 'pending' | 'executed' | 'skipped' | 'failed';
export type ActionLoopStage = 'recommended' | 'executing' | 'executed' | 'outcome_recorded';

export type ActionLoopRecord = {
  id: string;
  stage: ActionLoopStage;
  recommendation: {
    title: string;
    action: string;
    rationale: string;
    category: string;
    estimatedImpact: string;
    estimatedImpactUsd: number | null;
    riskLevel: RiskLevel;
  };
  execution: { status: ExecutionStatus; detail: string; executedAt: string | null } | null;
  outcome: {
    result: OutcomeResult;
    kpi: string;
    kpiBefore: number | null;
    kpiAfter: number | null;
    kpiImpact: number | null;
    lessonsLearned: string[];
    recordedAt: string;
  } | null;
  source: MemorySource;
  decisionMemoryId: string | null;
  executionMemoryId: string | null;
  outcomeMemoryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActionLoopSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byStage: Record<ActionLoopStage, number>;
  withOutcome: number;
  successes: number;
  failures: number;
  successRate: number | null;
};

export type CategoryLearning = {
  category: string;
  totalLoops: number;
  withOutcome: number;
  successes: number;
  failures: number;
  partials: number;
  successRate: number | null;
  avgKpiImpact: number | null;
  lessonsLearned: string[];
  improvedRecommendation: string;
};

export type LearningReport = {
  marker: string;
  generatedAt: string;
  totalLoops: number;
  categories: CategoryLearning[];
  note: string;
};

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readError(payload: unknown, fallback: string): string {
  const record = readRecord(payload);
  return typeof record.error === 'string' && record.error.trim() ? record.error.trim() : fallback;
}

async function ownerFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `IVX executive-memory request failed with HTTP ${response.status}.`));
  }
  return payload;
}

// ── Unified memory ───────────────────────────────────────────────────────────

export type RecallQuery = {
  kind?: MemoryKind;
  tag?: string;
  source?: MemorySource;
  status?: string;
  search?: string;
  limit?: number;
};

export async function recallMemory(query: RecallQuery = {}): Promise<{ records: MemoryRecord[]; summary: MemorySummary | null }> {
  const params = new URLSearchParams();
  if (query.kind) params.set('kind', query.kind);
  if (query.tag) params.set('tag', query.tag);
  if (query.source) params.set('source', query.source);
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  if (query.limit) params.set('limit', String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const payload = readRecord(await ownerFetch(`/api/ivx/memory${suffix}`));
  return {
    records: (payload.records as MemoryRecord[] | undefined) ?? [],
    summary: (payload.summary as MemorySummary | undefined) ?? null,
  };
}

export type RememberMemoryInput = {
  kind: MemoryKind;
  title: string;
  summary?: string;
  data?: Record<string, unknown>;
  tags?: string[];
  source?: MemorySource;
  status?: string;
  relatedIds?: string[];
};

export async function rememberMemory(input: RememberMemoryInput): Promise<MemoryRecord | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/memory', { method: 'POST', body: JSON.stringify(input) }));
  return (payload.record as MemoryRecord | undefined) ?? null;
}

export async function getMemorySummary(): Promise<MemorySummary | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/memory/summary'));
  return (payload.summary as MemorySummary | undefined) ?? null;
}

export async function forgetMemory(id: string): Promise<boolean> {
  const payload = readRecord(await ownerFetch(`/api/ivx/memory/${encodeURIComponent(id)}/forget`, { method: 'POST' }));
  return payload.ok === true;
}

// ── Executive action loop ──────────────────────────────────────────────────────

export async function listActionLoops(limit: number = 100): Promise<{ loops: ActionLoopRecord[]; summary: ActionLoopSummary | null }> {
  const payload = readRecord(await ownerFetch(`/api/ivx/action-loop?limit=${limit}`));
  return {
    loops: (payload.loops as ActionLoopRecord[] | undefined) ?? [],
    summary: (payload.summary as ActionLoopSummary | undefined) ?? null,
  };
}

export type RecordRecommendationInput = {
  title: string;
  action: string;
  rationale?: string;
  category?: string;
  estimatedImpact?: string;
  estimatedImpactUsd?: number | null;
  riskLevel?: RiskLevel;
  source?: MemorySource;
};

export async function recordRecommendation(input: RecordRecommendationInput): Promise<ActionLoopRecord | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/action-loop', { method: 'POST', body: JSON.stringify(input) }));
  return (payload.loop as ActionLoopRecord | undefined) ?? null;
}

export async function recordExecution(
  loopId: string,
  input: { status: ExecutionStatus; detail?: string },
): Promise<ActionLoopRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/action-loop/${encodeURIComponent(loopId)}/execution`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
  return (payload.loop as ActionLoopRecord | undefined) ?? null;
}

export async function recordOutcome(
  loopId: string,
  input: {
    result: OutcomeResult;
    kpi?: string;
    kpiBefore?: number | null;
    kpiAfter?: number | null;
    lessonsLearned?: string[];
  },
): Promise<ActionLoopRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/action-loop/${encodeURIComponent(loopId)}/outcome`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
  return (payload.loop as ActionLoopRecord | undefined) ?? null;
}

export async function getLearningReport(): Promise<LearningReport | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/action-loop/learning'));
  return (payload.learning as LearningReport | undefined) ?? null;
}
