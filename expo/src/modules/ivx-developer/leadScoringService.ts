/**
 * IVX Capital Deployment Platform — Lead Scoring client (owner-only).
 *
 * BLOCK 24. Thin client over the owner-gated lead-scoring API. Scores every CRM
 * lead Hot/Warm/Cold (0–100) from real evidence only — untracked signals are
 * reported as unavailable, never invented.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type LeadCategory = 'hot' | 'warm' | 'cold';

export type LeadSignal = {
  key: string;
  label: string;
  available: boolean;
  score: number;
  weight: number;
  detail: string;
};

export type LeadScore = {
  id: string;
  name: string;
  company: string;
  status: string;
  overall: number;
  category: LeadCategory;
  signals: LeadSignal[];
  evidenceCount: number;
  rationale: string;
};

export type LeadScoringSummary = {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  avgScore: number;
  scored: number;
};

export type LeadScoringResult = {
  marker: string;
  generatedAt: string;
  context: { ivxMarkets: string[]; ivxAssetClasses: string[]; marketsSource: string };
  leads: LeadScore[];
  summary: LeadScoringSummary;
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
    throw new Error(readError(payload, `IVX lead scoring request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getLeadScoring(): Promise<LeadScoringResult | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/lead-scoring'));
  return (payload.result as LeadScoringResult | undefined) ?? null;
}
