/**
 * IVX 10-Day Buyer / JV / Investor Campaign — report client (owner-only).
 *
 * Thin client over the owner-gated campaign report API. Reads real captured
 * leads only — visitor analytics are intentionally not reported (never invented).
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type CampaignLeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'follow_up'
  | 'closed'
  | 'rejected';

export type CampaignAudience = 'investor' | 'buyer' | 'jv' | 'other';

export type CampaignLeadView = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  audience: CampaignAudience;
  budgetRange: string;
  interest: string;
  leadScore: number;
  temperature: 'cold' | 'warm' | 'hot' | 'qualified';
  status: CampaignLeadStatus;
  source: string;
  notes: string;
  nextAction: string;
  followUpDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignDailyReport = {
  date: string;
  dayNumber: number;
  isToday: boolean;
  totalLeads: number;
  buyerLeads: number;
  jvLeads: number;
  investorLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  followUpRequired: number;
  conversionRatePct: number;
  topSource: string | null;
  recommendedNextActions: string[];
};

export type CampaignCandidate = {
  id: string;
  name: string;
  leadScore: number;
  temperature: 'cold' | 'warm' | 'hot' | 'qualified';
  contact: string;
  interest: string;
} | null;

export type CampaignReportTotals = {
  totalLeads: number;
  buyerLeads: number;
  jvLeads: number;
  investorLeads: number;
  otherLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  followUpRequired: number;
  closedLeads: number;
  rejectedLeads: number;
  conversionRatePct: number;
  topSource: string | null;
};

export type CampaignFinalSummary = {
  totalLeads: number;
  bestSource: string | null;
  bestInvestor: CampaignCandidate;
  bestBuyer: CampaignCandidate;
  bestJv: CampaignCandidate;
  recommendedDeals: string[];
  next30DayActionPlan: string[];
};

export type CampaignReport = {
  marker: string;
  title: string;
  generatedAt: string;
  windowDays: number;
  campaignStartDate: string;
  campaignEndDate: string;
  visitorsTracked: boolean;
  visitorsNote: string;
  totals: CampaignReportTotals;
  dailyReports: CampaignDailyReport[];
  leads: CampaignLeadView[];
  finalSummary: CampaignFinalSummary;
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

/** Fetch the owner-gated 10-day campaign report. Throws with a clear message on failure. */
export async function getCampaignReport(windowDays: number = 10): Promise<CampaignReport | null> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(
    `${backendBaseUrl()}/api/ivx/campaign/report?windowDays=${encodeURIComponent(String(windowDays))}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `IVX campaign report failed with HTTP ${response.status}.`));
  }
  const record = readRecord(payload);
  return (record.report as CampaignReport | undefined) ?? null;
}
