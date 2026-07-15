/**
 * IVX Capital Deployment Platform — Capital Pipeline client (owner-only).
 *
 * BLOCK 22. Thin client over the owner-gated capital-pipeline API — full CRUD
 * over owner-managed pipeline entries. Auth + base URL reuse the same
 * owner-session pattern as the rest of the IVX developer module. IVX never
 * fabricates records; every create requires a name + a real attributable source.
 * Remaining gap is computed server-side.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { assertOwnerSessionAccessToken } from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type PipelineSource =
  | 'owner_entered'
  | 'submitted_form'
  | 'crm_import'
  | 'public_source'
  | 'verified_deal';

export type PipelinePartyType = 'investor' | 'buyer';

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

export const PIPELINE_STAGES: PipelineStage[] = [
  'lead', 'qualified', 'contacted', 'meeting', 'interested',
  'due_diligence', 'soft_commit', 'hard_commit', 'closed',
];

export type PipelineEntry = {
  id: string;
  name: string;
  company: string;
  partyType: PipelinePartyType;
  dealName: string;
  stage: PipelineStage;
  capitalRequested: number | null;
  capitalCommitted: number | null;
  remainingGap: number | null;
  closeProbability: number;
  expectedCloseDate: string | null;
  notes: string;
  source: PipelineSource;
  sourceDetail: string;
  createdAt: string;
  updatedAt: string;
};

export type PipelineSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byStage: Record<PipelineStage, number>;
  totalPipeline: number;
  capitalCommitted: number;
  capitalRaised: number;
  weightedPipeline: number;
  activeInvestors: number;
  activeBuyers: number;
  dealsInProgress: number;
  closed: number;
};

export type PipelineInput = {
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
  const accessToken = await assertOwnerSessionAccessToken();
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
    throw new Error(readError(payload, `IVX capital pipeline request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export type PipelineListResult = {
  entries: PipelineEntry[];
  summary: PipelineSummary | null;
};

export async function listPipelineEntries(): Promise<PipelineListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-pipeline'));
  return {
    entries: Array.isArray(payload.entries) ? (payload.entries as PipelineEntry[]) : [],
    summary: (payload.summary as PipelineSummary | undefined) ?? null,
  };
}

export async function createPipelineEntry(input: PipelineInput): Promise<PipelineEntry | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/capital-pipeline', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.entry as PipelineEntry | undefined) ?? null;
}

export async function updatePipelineEntry(id: string, patch: Partial<PipelineInput>): Promise<PipelineEntry | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-pipeline/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) }),
  );
  return (payload.entry as PipelineEntry | undefined) ?? null;
}

export async function setPipelineStage(id: string, stage: PipelineStage): Promise<PipelineEntry | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-pipeline/${encodeURIComponent(id)}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stage }),
    }),
  );
  return (payload.entry as PipelineEntry | undefined) ?? null;
}

export async function deletePipelineEntry(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-pipeline/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}
