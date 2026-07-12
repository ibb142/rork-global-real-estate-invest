/**
 * IVX Opportunity Intelligence client (owner-only).
 *
 * Thin client over the owner-gated Opportunity API (Opportunity Engine +
 * Dashboard + Alerts + multi-AI research layer). Auth + base URL reuse the same
 * owner-session pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type OpportunityCategory =
  | 'real_estate'
  | 'distressed_asset'
  | 'financing'
  | 'investor'
  | 'arbitrage'
  | 'partnership'
  | 'technology_business';

export type OpportunityStatus = 'new' | 'watching' | 'pursuing' | 'dismissed' | 'closed';
export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high';
export type Probability = 'high' | 'medium' | 'low' | 'speculative';

export type OpportunityAlertType =
  | 'high_upside'
  | 'investor_match'
  | 'undervalued_deal'
  | 'urgent_deadline'
  | 'financing_path'
  | 'market_movement'
  | 'acquisition_target';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type OpportunityScores = {
  evidence: number;
  risk: number;
  speed: number;
  capital: number;
  upside: number;
};

export type ProfitLadderStep = {
  tier: string;
  fromUsd: number;
  toUsd: number;
  strategy: string;
  requiredCapitalUsd: number | null;
  timeline: string;
  riskLevel: RiskLevel;
  proof: string;
  probability: Probability;
  blockers: string[];
  legalWarning: string;
};

export type OpportunityExecutionPlan = {
  actionPlan: string[];
  contacts: string[];
  documentsNeeded: string[];
  fundingPath: string;
  expectedUpside: string;
  worstCaseRisk: string;
  nextThreeActions: string[];
};

export type Opportunity = {
  id: string;
  title: string;
  summary: string;
  category: OpportunityCategory;
  capitalRequiredUsd: number | null;
  upsideLowUsd: number | null;
  upsideHighUsd: number | null;
  timeline: string;
  scores: OpportunityScores;
  overall: number;
  confidence: number;
  evidence: string;
  evidenceLinks: string[];
  riskWarnings: string[];
  legalWarning: string;
  nextActions: string[];
  profitLadder: ProfitLadderStep[];
  executionPlan: OpportunityExecutionPlan;
  status: OpportunityStatus;
  createdAt: string;
  updatedAt: string;
};

export type OpportunityAlert = {
  id: string;
  opportunityId: string | null;
  type: OpportunityAlertType;
  severity: AlertSeverity;
  message: string;
  acknowledged: boolean;
  createdAt: string;
};

export type ResearchSource = {
  id: string;
  label: string;
  kind: 'internal_ai' | 'external_ai' | 'market_news' | 'document_analysis' | 'financial_model';
  status: 'online' | 'unavailable';
  detail: string;
};

export type OpportunityDashboard = {
  marker: string;
  generatedAt: string;
  totals: { total: number; new: number; watching: number; pursuing: number; dismissed: number; closed: number };
  byCategory: Record<string, number>;
  topToday: Opportunity[];
  highestUpside: Opportunity | null;
  fastestExecution: Opportunity | null;
  lowestRisk: Opportunity | null;
  alerts: OpportunityAlert[];
  unacknowledgedAlerts: number;
  research: ResearchSource[];
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
    throw new Error(readError(payload, `IVX opportunity request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getOpportunityDashboard(): Promise<OpportunityDashboard | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/opportunity/dashboard'));
  return (payload.dashboard as OpportunityDashboard | undefined) ?? null;
}

/** Run the Opportunity Engine: scan live signals → generate scored opportunities. */
export async function runOpportunityScan(): Promise<{ generatedCount: number; alertsRaised: number; opportunities: Opportunity[] }> {
  const payload = readRecord(await ownerFetch('/api/ivx/opportunity/scan', { method: 'POST', body: '{}' }));
  const scan = readRecord(payload.scan);
  return {
    generatedCount: typeof scan.generatedCount === 'number' ? scan.generatedCount : 0,
    alertsRaised: typeof scan.alertsRaised === 'number' ? scan.alertsRaised : 0,
    opportunities: Array.isArray(scan.opportunities) ? (scan.opportunities as Opportunity[]) : [],
  };
}

export async function listOpportunities(): Promise<Opportunity[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/opportunity/opportunities'));
  return Array.isArray(payload.opportunities) ? (payload.opportunities as Opportunity[]) : [];
}

/** "Find today's best opportunity." Runs a scan automatically if none exist yet. */
export async function getBestOpportunity(): Promise<{ best: Opportunity | null; research: ResearchSource[] }> {
  const payload = readRecord(await ownerFetch('/api/ivx/opportunity/best'));
  return {
    best: (payload.best as Opportunity | undefined) ?? null,
    research: Array.isArray(payload.research) ? (payload.research as ResearchSource[]) : [],
  };
}

export async function setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<Opportunity | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/opportunity/${encodeURIComponent(opportunityId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  );
  return (payload.opportunity as Opportunity | undefined) ?? null;
}

export async function listOpportunityAlerts(): Promise<OpportunityAlert[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/opportunity/alerts'));
  return Array.isArray(payload.alerts) ? (payload.alerts as OpportunityAlert[]) : [];
}

export async function acknowledgeOpportunityAlert(alertId: string): Promise<OpportunityAlert | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/opportunity/alerts/${encodeURIComponent(alertId)}/ack`, { method: 'POST', body: '{}' }),
  );
  return (payload.alert as OpportunityAlert | undefined) ?? null;
}
