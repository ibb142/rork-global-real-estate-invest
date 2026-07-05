/**
 * IVX Capital Deployment Platform — Investor CRM client (owner-only).
 *
 * BLOCK 20. Thin client over the owner-gated investor CRM API — full CRUD over
 * owner-managed investor records. Auth + base URL reuse the same owner-session
 * pattern as the rest of the IVX developer module. IVX never fabricates records;
 * every create requires a name + a real attributable source.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { assertOwnerSessionAccessToken } from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type InvestorSource =
  | 'owner_entered'
  | 'submitted_form'
  | 'crm_import'
  | 'public_source'
  | 'verified_deal';

export type InvestorStatus =
  | 'prospect'
  | 'contacted'
  | 'meeting_scheduled'
  | 'active'
  | 'invested';

export type AccreditedStatus = 'accredited' | 'non_accredited' | 'unknown';

export type InvestorRecord = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  investmentType: string;
  accreditedStatus: AccreditedStatus;
  preferredMarkets: string[];
  preferredAssetClasses: string[];
  typicalCheckSize: string;
  investmentTimeline: string;
  notes: string;
  lastContactDate: string | null;
  leadScore: number;
  relationshipScore: number;
  status: InvestorStatus;
  source: InvestorSource;
  sourceDetail: string;
  createdAt: string;
  updatedAt: string;
};

export type PartyType = 'investor' | 'buyer' | 'broker' | 'developer' | 'lender' | 'partner';

export type InvestorCrmSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byStatus: Record<InvestorStatus, number>;
  bySource: Record<InvestorSource, number>;
  byPartyType: Record<PartyType, number>;
  accredited: number;
  avgLeadScore: number;
  avgRelationshipScore: number;
};

/** Owner-facing import receipt returned after every CRM import. */
export type ImportReceipt = {
  partyType: PartyType;
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  totalContacts: number;
  recognizedColumns: string[];
  duplicateRows: { row: number; reason: string }[];
  invalidRows: { row: number; reason: string }[];
  summary: InvestorCrmSummary | null;
};

export type ImportContactsInput = {
  partyType: PartyType;
  sourceDetail: string;
  csv?: string;
  rows?: Record<string, string>[];
};

export type InvestorInput = {
  name: string;
  source: InvestorSource;
  sourceDetail?: string;
  company?: string;
  email?: string;
  phone?: string;
  location?: string;
  investmentType?: string;
  accreditedStatus?: AccreditedStatus;
  preferredMarkets?: string[];
  preferredAssetClasses?: string[];
  typicalCheckSize?: string;
  investmentTimeline?: string;
  notes?: string;
  lastContactDate?: string | null;
  leadScore?: number;
  relationshipScore?: number;
  status?: InvestorStatus;
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
    throw new Error(readError(payload, `IVX investor CRM request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export type InvestorListResult = {
  investors: InvestorRecord[];
  summary: InvestorCrmSummary | null;
};

export async function listInvestors(): Promise<InvestorListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/investors'));
  return {
    investors: Array.isArray(payload.investors) ? (payload.investors as InvestorRecord[]) : [],
    summary: (payload.summary as InvestorCrmSummary | undefined) ?? null,
  };
}

export async function createInvestor(input: InvestorInput): Promise<InvestorRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/investors', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.investor as InvestorRecord | undefined) ?? null;
}

export async function updateInvestor(id: string, patch: Partial<InvestorInput>): Promise<InvestorRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/investors/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) }),
  );
  return (payload.investor as InvestorRecord | undefined) ?? null;
}

export async function setInvestorStatus(id: string, status: InvestorStatus): Promise<InvestorRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/investors/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  );
  return (payload.investor as InvestorRecord | undefined) ?? null;
}

/**
 * Owner-approved bulk import of contacts for any party type. Accepts pasted CSV
 * (the format Excel exports natively) or structured manual rows. Returns the
 * exact import receipt — total / imported / duplicates / invalid + per-type counts.
 */
export async function importContacts(input: ImportContactsInput): Promise<ImportReceipt> {
  const body: Record<string, unknown> = {
    partyType: input.partyType,
    sourceDetail: input.sourceDetail,
  };
  if (input.csv && input.csv.trim()) body.csv = input.csv;
  if (input.rows && input.rows.length > 0) body.rows = input.rows;
  const payload = readRecord(
    await ownerFetch('/api/ivx/investors/import', { method: 'POST', body: JSON.stringify(body) }),
  );
  return {
    partyType: (payload.partyType as PartyType | undefined) ?? input.partyType,
    total: typeof payload.total === 'number' ? payload.total : 0,
    imported: typeof payload.imported === 'number' ? payload.imported : 0,
    duplicates: typeof payload.duplicates === 'number' ? payload.duplicates : 0,
    invalid: typeof payload.invalid === 'number' ? payload.invalid : 0,
    totalContacts: typeof payload.totalContacts === 'number' ? payload.totalContacts : 0,
    recognizedColumns: Array.isArray(payload.recognizedColumns) ? (payload.recognizedColumns as string[]) : [],
    duplicateRows: Array.isArray(payload.duplicateRows) ? (payload.duplicateRows as { row: number; reason: string }[]) : [],
    invalidRows: Array.isArray(payload.invalidRows) ? (payload.invalidRows as { row: number; reason: string }[]) : [],
    summary: (payload.summary as InvestorCrmSummary | undefined) ?? null,
  };
}

export async function deleteInvestor(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/investors/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}
