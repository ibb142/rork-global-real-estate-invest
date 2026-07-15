/**
 * IVX Autonomous Innovation System client (owner-only).
 *
 * Thin client over the owner-gated Innovation API (Innovation Engine + Research
 * Lab + Innovation Dashboard). Auth + base URL reuse the same owner-session
 * pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type InnovationIdeaCategory =
  | 'product'
  | 'business_model'
  | 'ai_workflow'
  | 'platform_capability'
  | 'technology_concept';

export type InnovationReviewStatus = 'proposed' | 'approved' | 'rejected' | 'shipped';
export type HypothesisStatus = 'open' | 'testing' | 'validated' | 'invalidated';
export type ExperimentStatus = 'planned' | 'running' | 'completed' | 'abandoned';

export type InnovationSignalSource =
  | 'ivx_data'
  | 'user_behavior'
  | 'performance'
  | 'market'
  | 'competitor';

export type InnovationScores = {
  confidence: number;
  impact: number;
  feasibility: number;
  revenue: number;
  complexity: number;
};

export type InnovationIdea = {
  id: string;
  title: string;
  summary: string;
  category: InnovationIdeaCategory;
  signalSource: InnovationSignalSource;
  evidence: string;
  scores: InnovationScores;
  priority: number;
  status: InnovationReviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type ResearchHypothesis = {
  id: string;
  statement: string;
  rationale: string;
  ideaId: string | null;
  status: HypothesisStatus;
  createdAt: string;
  updatedAt: string;
};

export type ResearchExperiment = {
  id: string;
  title: string;
  hypothesisId: string | null;
  method: string;
  metric: string;
  status: ExperimentStatus;
  result: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InnovationDashboard = {
  marker: string;
  generatedAt: string;
  inventions: { proposed: number; approved: number; rejected: number; shipped: number; total: number };
  experiments: { planned: number; running: number; completed: number; abandoned: number; total: number };
  hypotheses: { open: number; testing: number; validated: number; invalidated: number; total: number };
  estimatedBusinessValueUsd: number;
  topIdeas: InnovationIdea[];
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
    throw new Error(readError(payload, `IVX innovation request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getInnovationDashboard(): Promise<InnovationDashboard | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/innovation/dashboard'));
  return (payload.dashboard as InnovationDashboard | undefined) ?? null;
}

/** Run the Innovation Engine: scan live signals → generate scored ideas. */
export async function runInnovationScan(): Promise<{ generatedCount: number; ideas: InnovationIdea[] }> {
  const payload = readRecord(await ownerFetch('/api/ivx/innovation/scan', { method: 'POST', body: '{}' }));
  const scan = readRecord(payload.scan);
  return {
    generatedCount: typeof scan.generatedCount === 'number' ? scan.generatedCount : 0,
    ideas: Array.isArray(scan.ideas) ? (scan.ideas as InnovationIdea[]) : [],
  };
}

export async function listInnovationIdeas(): Promise<InnovationIdea[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/innovation/ideas'));
  return Array.isArray(payload.ideas) ? (payload.ideas as InnovationIdea[]) : [];
}

export async function setInnovationIdeaStatus(
  ideaId: string,
  status: InnovationReviewStatus,
): Promise<InnovationIdea | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/innovation/ideas/${encodeURIComponent(ideaId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  );
  return (payload.idea as InnovationIdea | undefined) ?? null;
}

export async function listHypotheses(): Promise<ResearchHypothesis[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/innovation/hypotheses'));
  return Array.isArray(payload.hypotheses) ? (payload.hypotheses as ResearchHypothesis[]) : [];
}

export async function createHypothesis(input: { statement: string; rationale: string; ideaId?: string | null }): Promise<ResearchHypothesis | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/innovation/hypotheses', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.hypothesis as ResearchHypothesis | undefined) ?? null;
}

export async function setHypothesisStatus(hypothesisId: string, status: HypothesisStatus): Promise<ResearchHypothesis | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/innovation/hypotheses/${encodeURIComponent(hypothesisId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  );
  return (payload.hypothesis as ResearchHypothesis | undefined) ?? null;
}

export async function listExperiments(): Promise<ResearchExperiment[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/innovation/experiments'));
  return Array.isArray(payload.experiments) ? (payload.experiments as ResearchExperiment[]) : [];
}

export async function createExperiment(input: { title: string; method: string; metric: string; hypothesisId?: string | null }): Promise<ResearchExperiment | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/innovation/experiments', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.experiment as ResearchExperiment | undefined) ?? null;
}

export async function updateExperiment(
  experimentId: string,
  patch: { status?: ExperimentStatus; result?: string | null },
): Promise<ResearchExperiment | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/innovation/experiments/${encodeURIComponent(experimentId)}`, {
      method: 'POST',
      body: JSON.stringify(patch),
    }),
  );
  return (payload.experiment as ResearchExperiment | undefined) ?? null;
}
