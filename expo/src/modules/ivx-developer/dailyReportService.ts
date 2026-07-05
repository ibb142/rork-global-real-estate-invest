/**
 * IVX Daily Executive Report client (owner-only).
 *
 * Thin client over the owner-gated daily-report API — the unified 24-hour
 * briefing composed from every IVX engine. Reuses the same owner-session auth +
 * base-URL pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type ReportTrigger = 'scheduler' | 'owner' | 'manual';

export type ReportFinding = {
  title: string;
  detail: string;
  weight?: string;
};

export type ReportSection = {
  key: string;
  title: string;
  count: number;
  findings: ReportFinding[];
  note: string;
};

export type DailyExecutiveReport = {
  marker: string;
  reportId: string;
  generatedAt: string;
  reportDate: string;
  trigger: ReportTrigger;
  headline: string;
  sourcesScanned: string[];
  sections: {
    bugsFound: ReportSection;
    fixesProposed: ReportSection;
    fixesCompleted: ReportSection;
    productImprovements: ReportSection;
    technologyIdeas: ReportSection;
    investorAcquisitionIdeas: ReportSection;
    realtorJvIdeas: ReportSection;
    landingRecommendations: ReportSection;
    competitorObservations: ReportSection;
    revenueOpportunities: ReportSection;
    nextBestActions: ReportSection;
  };
  disclaimer: string;
};

export type ReportHistoryEntry = {
  reportId: string;
  reportDate: string;
  generatedAt: string;
  trigger: ReportTrigger;
  headline: string;
};

/** Section display order matching the owner's requested structure. */
export const REPORT_SECTION_ORDER: (keyof DailyExecutiveReport['sections'])[] = [
  'bugsFound',
  'fixesProposed',
  'fixesCompleted',
  'productImprovements',
  'technologyIdeas',
  'investorAcquisitionIdeas',
  'realtorJvIdeas',
  'landingRecommendations',
  'competitorObservations',
  'revenueOpportunities',
  'nextBestActions',
];

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
    throw new Error(readError(payload, `IVX daily-report request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getDailyReport(): Promise<DailyExecutiveReport | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/daily-report'));
  return (payload.report as DailyExecutiveReport | undefined) ?? null;
}

export async function generateDailyReport(): Promise<DailyExecutiveReport | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/daily-report', { method: 'POST' }));
  return (payload.report as DailyExecutiveReport | undefined) ?? null;
}

export async function getDailyReportHistory(): Promise<ReportHistoryEntry[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/daily-report/history'));
  const history = payload.history;
  return Array.isArray(history) ? (history as ReportHistoryEntry[]) : [];
}
