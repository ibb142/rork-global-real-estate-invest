/**
 * IVX Capital Deployment Platform — Real Deal Tracking client (owner-only).
 *
 * BLOCK 26. Thin client over the owner-gated deal-tracking API — full lifecycle
 * tracking + computed outcome metrics. IVX never fabricates deal data; metrics
 * are computed from recorded milestones, never invented.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type DealSource =
  | 'owner_entered'
  | 'submitted_form'
  | 'crm_import'
  | 'public_source'
  | 'verified_deal';

export type DealStatus = 'open' | 'in_progress' | 'closed_won' | 'closed_lost';

export type DealMilestoneField =
  | 'investorsContacted'
  | 'investorsResponded'
  | 'buyersContacted'
  | 'meetingsScheduled'
  | 'documentsShared'
  | 'offersReceived';

export const DEAL_MILESTONE_FIELDS: DealMilestoneField[] = [
  'investorsContacted', 'investorsResponded', 'buyersContacted',
  'meetingsScheduled', 'documentsShared', 'offersReceived',
];

export type DealTrackingRecord = {
  id: string;
  dealName: string;
  counterparty: string;
  status: DealStatus;
  investorsContacted: number;
  investorsResponded: number;
  buyersContacted: number;
  meetingsScheduled: number;
  documentsShared: number;
  offersReceived: number;
  capitalTarget: number | null;
  capitalCommitted: number | null;
  closedAt: string | null;
  notes: string;
  source: DealSource;
  sourceDetail: string;
  createdAt: string;
  updatedAt: string;
};

export type DealTrackingMetrics = {
  marker: string;
  generatedAt: string;
  total: number;
  byStatus: Record<DealStatus, number>;
  conversionRate: number;
  capitalRaised: number;
  averageDealSize: number;
  avgTimeToCloseDays: number | null;
  investorResponseRate: number | null;
  totalMeetings: number;
  totalOffers: number;
};

export type DealInput = {
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
    throw new Error(readError(payload, `IVX deal tracking request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export type DealTrackingListResult = {
  deals: DealTrackingRecord[];
  metrics: DealTrackingMetrics | null;
};

export async function listDeals(): Promise<DealTrackingListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/deal-tracking'));
  return {
    deals: Array.isArray(payload.deals) ? (payload.deals as DealTrackingRecord[]) : [],
    metrics: (payload.metrics as DealTrackingMetrics | undefined) ?? null,
  };
}

export async function createDeal(input: DealInput): Promise<DealTrackingRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/deal-tracking', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.deal as DealTrackingRecord | undefined) ?? null;
}

export async function updateDeal(id: string, patch: Partial<DealInput>): Promise<DealTrackingRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/deal-tracking/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) }),
  );
  return (payload.deal as DealTrackingRecord | undefined) ?? null;
}

export async function incrementMilestone(id: string, field: DealMilestoneField, by: number = 1): Promise<DealTrackingRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/deal-tracking/${encodeURIComponent(id)}/milestone`, {
      method: 'POST',
      body: JSON.stringify({ field, by }),
    }),
  );
  return (payload.deal as DealTrackingRecord | undefined) ?? null;
}

export async function setDealStatus(id: string, status: DealStatus): Promise<DealTrackingRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/deal-tracking/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  );
  return (payload.deal as DealTrackingRecord | undefined) ?? null;
}

export async function deleteDeal(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/deal-tracking/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}
