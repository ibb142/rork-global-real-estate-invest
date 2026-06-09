/**
 * IVX Owner AI Executive Layer client (owner-only).
 *
 * Thin client over the owner-gated Executive Layer API — daily business
 * briefing, strategic plan, opportunity engine, decision engine, execution
 * tracking, and the four-quadrant executive scorecard. Auth + base URL reuse
 * the same owner-session pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type ExecutiveMetric = {
  label: string;
  value: string;
  note: string;
};

export type DailyBriefing = {
  date: string;
  revenue: ExecutiveMetric;
  crmPipeline: ExecutiveMetric;
  investorPipeline: ExecutiveMetric;
  cashRunway: ExecutiveMetric;
  productHealth: ExecutiveMetric;
  openRisks: { count: number; items: string[]; note: string };
};

export type StrategicGoal = {
  title: string;
  metric: string;
  rationale: string;
};

export type StrategicPlan = {
  thirtyDay: StrategicGoal[];
  ninetyDay: StrategicGoal[];
  yearly: StrategicGoal[];
  note: string;
};

export type DetectedOpportunity = {
  rank: number;
  kind: 'lead' | 'investor' | 'customer' | 'opportunity';
  title: string;
  detail: string;
  score: number | null;
};

export type OpportunityEngineView = {
  leads: number;
  investors: number;
  customers: number;
  ranked: DetectedOpportunity[];
  note: string;
};

export type RiskLevel = 'low' | 'medium' | 'high';

export type ExecutiveDecision = {
  rank: number;
  title: string;
  action: string;
  rationale: string;
  estimatedImpact: string;
  estimatedImpactUsd: number | null;
  riskLevel: RiskLevel;
};

export type DecisionEngineView = {
  decisions: ExecutiveDecision[];
  note: string;
};

export type ExecutionTracking = {
  planned: number;
  executed: number;
  remaining: number;
  inProgress: number;
  blocked: number;
  recent: { title: string; status: string; progress: string }[];
  note: string;
};

export type ScorecardGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ScorecardLevel = 'high' | 'medium' | 'low';

export type ExecutiveScorecard = {
  title: string;
  score: number;
  grade: ScorecardGrade;
  level: ScorecardLevel;
  signals: string[];
};

export type ExecutiveScorecards = {
  company: ExecutiveScorecard;
  ai: ExecutiveScorecard;
  engineering: ExecutiveScorecard;
  capital: ExecutiveScorecard;
};

export type InvestorPriority = {
  rank: number;
  name: string;
  detail: string;
  matchScore: number | null;
  nextAction: string;
};

export type InvestorPrioritiesView = {
  bestInvestor: InvestorPriority | null;
  meetingsNeeded: number;
  followUpsNeeded: number;
  priorities: InvestorPriority[];
  note: string;
};

export type DealPipelineRisk = { name: string; reason: string };

export type DealPipelineView = {
  totalPipeline: string;
  weightedPipeline: string;
  committed: string;
  raisedThisMonth: string;
  activeInvestors: number;
  activeBuyers: number;
  dealsInProgress: number;
  dealsAtRisk: DealPipelineRisk[];
  note: string;
};

export type AutonomousActionItem = {
  kind: string;
  label: string;
  status: string;
  lastRunAt: string | null;
  runCount: number;
  summary: string;
};

export type AutonomousActionsView = {
  schedulerEnabled: boolean;
  totalRuns: number;
  loopsRun: number;
  outcomesRecorded: number;
  actions: AutonomousActionItem[];
  note: string;
};

export type LearningCategorySummary = {
  category: string;
  successRate: number | null;
  withOutcome: number;
  improvedRecommendation: string;
};

export type LearningSummaryView = {
  totalLoops: number;
  outcomesRecorded: number;
  overallSuccessRate: number | null;
  categories: LearningCategorySummary[];
  note: string;
};

export type ExecutiveLayer = {
  marker: string;
  generatedAt: string;
  headline: string;
  dailyBriefing: DailyBriefing;
  strategicPlan: StrategicPlan;
  opportunityEngine: OpportunityEngineView;
  decisionEngine: DecisionEngineView;
  executionTracking: ExecutionTracking;
  investorPriorities: InvestorPrioritiesView;
  dealPipeline: DealPipelineView;
  autonomousActions: AutonomousActionsView;
  learningSummary: LearningSummaryView;
  scorecards: ExecutiveScorecards;
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
    throw new Error(readError(payload, `IVX executive-layer request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getExecutiveLayer(): Promise<ExecutiveLayer | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/executive-layer'));
  return (payload.executive as ExecutiveLayer | undefined) ?? null;
}
