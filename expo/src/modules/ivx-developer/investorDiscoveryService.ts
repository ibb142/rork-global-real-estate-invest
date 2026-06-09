/**
 * IVX Investor Discovery client (owner-only).
 *
 * Thin client over the owner-gated investor-discovery API — real, named
 * investors/buyers sourced from public SEC EDGAR Form D filings. Every record
 * carries a direct SEC filing link for verification. No private/personal data.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type InvestorDiscoveryClass = 'buyers' | 'jv_deals';

export type RelatedPerson = {
  firstName: string;
  lastName: string;
  fullName: string;
  relationships: string[];
  city: string | null;
  stateOrCountry: string | null;
};

export type DiscoveredInvestor = {
  cik: string;
  accessionNumber: string;
  entityName: string;
  entityType: string | null;
  jurisdiction: string | null;
  businessStreet: string | null;
  businessCity: string | null;
  businessState: string | null;
  businessZip: string | null;
  businessPhone: string | null;
  industryGroup: string | null;
  relatedPersons: RelatedPerson[];
  totalOfferingAmountUsd: number | null;
  totalAmountSoldUsd: number | null;
  minimumInvestmentUsd: number | null;
  investorsAlreadyInvested: number | null;
  filingDate: string | null;
  dateOfFirstSale: string | null;
  filingUrl: string;
};

export type InvestorDiscoveryResult = {
  ok: boolean;
  discoveryClass: InvestorDiscoveryClass;
  query: string;
  minOfferingUsd: number;
  source: string;
  fetchedAt: string;
  totalFilingsMatched: number;
  scannedFilings: number;
  investors: DiscoveredInvestor[];
  resultCount: number;
  error: string | null;
  complianceNote: string;
};

export type RunInvestorDiscoveryInput = {
  query?: string;
  discoveryClass?: InvestorDiscoveryClass;
  minOfferingUsd?: number;
  limit?: number;
};

/** Outcome of a real report-generation request (no fake links — honest status). */
export type InvestorReportResult = {
  ok: boolean;
  status: 'completed' | 'queued' | 'no_records' | 'discovery_failed' | 'generation_failed';
  message: string;
  discoveryClass: InvestorDiscoveryClass;
  query: string;
  rowCount: number;
  source: string;
  jobId: string | null;
  deliverable: {
    id: string;
    status: string;
    fileSize: number | null;
    signedUrl: string | null;
    signedUrlExpiresAt: string | null;
    downloadHttpStatus: number | null;
    error: string | null;
  } | null;
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

/**
 * Run a live SEC EDGAR Form D discovery scan. Owner-gated.
 * `buyers` filters to $10M+ raises by default; `jv_deals` returns every real investor entity.
 */
export async function runInvestorDiscovery(input: RunInvestorDiscoveryInput = {}): Promise<InvestorDiscoveryResult> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(`${backendBaseUrl()}/api/ivx/investor-discovery/scan`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `Investor discovery failed with HTTP ${response.status}.`));
  }
  const record = readRecord(payload);
  return record.discovery as unknown as InvestorDiscoveryResult;
}

/**
 * Ask IVX to GENERATE a real downloadable report from a live SEC discovery. The
 * server only returns a link after the file is uploaded and the download is
 * verified — there is no placeholder/fake link. `waitForCompletion` runs the
 * pipeline inline so the signed URL comes back in this call.
 */
export async function generateInvestorReport(
  input: RunInvestorDiscoveryInput & { waitForCompletion?: boolean } = {},
): Promise<InvestorReportResult> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(`${backendBaseUrl()}/api/ivx/investor-discovery/generate-report`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ waitForCompletion: true, ...input }),
  });
  const payload = await parseResponse(response);
  if (!response.ok && response.status !== 422) {
    throw new Error(readError(payload, `Report generation failed with HTTP ${response.status}.`));
  }
  const record = readRecord(payload);
  return record.report as unknown as InvestorReportResult;
}
