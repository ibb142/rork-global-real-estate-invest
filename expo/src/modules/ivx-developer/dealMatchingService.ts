/**
 * IVX Capital Deployment Platform — Opportunity-to-Investor Matching client (owner-only).
 *
 * BLOCK 25. Thin client over the owner-gated matching API. For every active IVX
 * deal, returns the best-fit CRM contacts per role with match score + evidence.
 * Relationships are never invented — scored only from real evidence.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type MatchRole = 'investor' | 'buyer' | 'lender' | 'partner';
export const MATCH_ROLES: MatchRole[] = ['investor', 'buyer', 'lender', 'partner'];

export type FitDimension = {
  available: boolean;
  score: number;
  note: string;
};

export type DealMatch = {
  contactId: string;
  name: string;
  company: string;
  role: MatchRole;
  matchScore: number;
  geographyFit: FitDimension;
  capitalFit: FitDimension;
  timelineFit: FitDimension;
  evidence: string[];
  riskNotes: string[];
};

export type DealMatchSet = {
  dealId: string;
  dealName: string;
  dealLocation: string | null;
  dealSummary: string;
  totalContacts: number;
  matches: DealMatch[];
  best: Record<MatchRole, DealMatch | null>;
};

export type DealMatchingSummary = {
  deals: number;
  contacts: number;
  strongMatches: number;
};

export type DealMatchingResult = {
  marker: string;
  generatedAt: string;
  deals: DealMatchSet[];
  summary: DealMatchingSummary;
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
    throw new Error(readError(payload, `IVX deal matching request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getDealMatching(): Promise<DealMatchingResult | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/deal-matching'));
  return (payload.result as DealMatchingResult | undefined) ?? null;
}
