/**
 * IVX Capital Deployment Platform — Capital Command Center + Best-Investor workflow client (owner-only).
 *
 * BLOCK 27. Thin client over the owner-gated command-center + workflow API:
 *   - getCapitalCommandCenter()  → owner tablet dashboard snapshot
 *   - getCommandActivity()       → recent best-investor workflow activity
 *   - runBestInvestor(dealQuery) → runs the "Find the best investor for Deal X" workflow
 *
 * Nothing is sent automatically — the workflow only drafts owner-approval-gated
 * outreach. No relationship or contact is ever fabricated.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { assertOwnerSessionAccessToken } from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type AttentionItem = {
  id: string;
  name: string;
  company: string;
  reason: string;
  dealName: string;
};

export type CommandBestInvestor = {
  contactId: string;
  name: string;
  company: string;
  matchScore: number;
  dealName: string;
  evidence: string[];
} | null;

export type CommandBestOpportunity = {
  id: string;
  name: string;
  weightedScore: number;
  recommendation: string;
  rationale: string;
} | null;

export type CommandPipeline = {
  totalPipeline: number;
  capitalCommitted: number;
  capitalRaised: number;
  weightedPipeline: number;
  activeInvestors: number;
  activeBuyers: number;
  dealsInProgress: number;
};

export type CapitalCommandCenter = {
  marker: string;
  generatedAt: string;
  bestInvestorToday: CommandBestInvestor;
  bestBuyerToday: CommandBestInvestor;
  bestOpportunityToday: CommandBestOpportunity;
  capitalPipeline: CommandPipeline;
  meetingsNeeded: AttentionItem[];
  followUpsNeeded: AttentionItem[];
  dealsAtRisk: AttentionItem[];
  capitalRaisedThisMonth: number;
  headline: string;
  note: string;
};

export type WorkflowStepStatus = 'done' | 'skipped' | 'failed';

export type WorkflowStep = {
  key: string;
  label: string;
  status: WorkflowStepStatus;
  detail: string;
};

export type FitDimension = { available: boolean; score: number; note: string };

export type RankedCandidate = {
  contactId: string;
  name: string;
  company: string;
  role: 'investor' | 'buyer' | 'lender' | 'partner';
  matchScore: number;
  geographyFit: FitDimension;
  capitalFit: FitDimension;
  timelineFit: FitDimension;
  evidence: string[];
  riskNotes: string[];
};

export type WorkflowDraftRef = {
  messageId: string;
  type: string;
  status: string;
  subject: string;
  recipientName: string;
  requiresApproval: true;
};

export type BestInvestorWorkflowResult = {
  marker: string;
  generatedAt: string;
  dealQuery: string;
  deal: { dealId: string; dealName: string; location: string | null; summary: string } | null;
  candidatesConsidered: number;
  ranked: RankedCandidate[];
  bestInvestor: RankedCandidate | null;
  introEmail: WorkflowDraftRef | null;
  followUpTask: WorkflowDraftRef | null;
  activity: { id: string; at: string; summary: string } | null;
  steps: WorkflowStep[];
  completed: boolean;
  note: string;
};

export type WorkflowActivity = { id: string; at: string; summary: string };

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
    throw new Error(readError(payload, `IVX command center request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export async function getCapitalCommandCenter(): Promise<CapitalCommandCenter | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-command-center'));
  return (payload.dashboard as CapitalCommandCenter | undefined) ?? null;
}

export async function getCommandActivity(): Promise<WorkflowActivity[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-command-center/activity'));
  return Array.isArray(payload.activity) ? (payload.activity as WorkflowActivity[]) : [];
}

export async function runBestInvestor(dealQuery: string): Promise<BestInvestorWorkflowResult | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/capital-command-center/best-investor', {
      method: 'POST',
      body: JSON.stringify({ dealQuery }),
    }),
  );
  return (payload.result as BestInvestorWorkflowResult | undefined) ?? null;
}
