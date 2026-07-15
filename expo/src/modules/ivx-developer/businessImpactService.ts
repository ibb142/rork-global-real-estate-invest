/**
 * IVX Business Impact + Daily Operations client (owner-only).
 *
 * Thin client over the owner-gated Business Impact API — the Command Center /
 * CEO Briefing / owner tablet feed. Auth + base URL reuse the same owner-session
 * pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type WindowCounts = { today: number; week: number; month: number };

export type CapitalPipeline = {
  investorsDiscovered: number;
  partnersDiscovered: number;
  lendersDiscovered: number;
  buyersDiscovered: number;
  note: string;
};

export type RevenuePotential = {
  estimatedOpportunityValueUsd: number;
  capitalReachableUsd: number;
  dealsInProgress: number;
  note: string;
};

export type ImprovementOutcomes = {
  bugsFixed: number;
  deploymentsCompleted: number;
  productionIssuesPrevented: number;
};

export type TimeSaved = {
  hoursSaved: number;
  tasksAutomated: number;
  researchAutomated: number;
  note: string;
};

export type BriefingPick = {
  title: string;
  detail: string;
  refId: string | null;
} | null;

export type CeoBriefing = {
  date: string;
  topOpportunity: BriefingPick;
  topInvestor: BriefingPick;
  topBuyer: BriefingPick;
  topRisk: BriefingPick;
  topImprovement: BriefingPick;
  topRevenueOpportunity: BriefingPick;
  topPartnership: BriefingPick;
};

export type DailyScorecard = {
  date: string;
  discovered: string;
  improved: string;
  learned: string;
  recommends: string;
  expectedImpact: string;
};

export type BusinessGoals = {
  activeDeals: number;
  investorPipeline: number;
  buyerPipeline: number;
  opportunitiesDiscovered: number;
  improvementsDeployed: number;
  revenueOpportunities: number;
  conversionMetrics: string;
  growthMetrics: string;
};

export type PriorityTask = {
  priority: 1 | 2 | 3;
  title: string;
  rationale: string;
  source: string;
};

export type OwnerFeed = {
  yesterday: string;
  today: string;
  recommendsNext: string;
  workingOn: string;
  needsDecision: string;
};

export type BusinessImpactDashboard = {
  marker: string;
  generatedAt: string;
  headline: string;
  opportunitiesFound: WindowCounts;
  capitalPipeline: CapitalPipeline;
  revenuePotential: RevenuePotential;
  improvements: ImprovementOutcomes;
  timeSaved: TimeSaved;
  ceoBriefing: CeoBriefing;
  scorecard: DailyScorecard;
  businessGoals: BusinessGoals;
  priorityTasks: PriorityTask[];
  ownerFeed: OwnerFeed;
  disclaimer: string;
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
    throw new Error(readError(payload, `IVX business-impact request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getBusinessImpactDashboard(): Promise<BusinessImpactDashboard | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/business-impact/dashboard'));
  return (payload.dashboard as BusinessImpactDashboard | undefined) ?? null;
}
