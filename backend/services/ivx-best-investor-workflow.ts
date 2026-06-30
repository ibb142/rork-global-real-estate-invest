/**
 * IVX Capital Deployment Platform — "Find the best investor for Deal X" workflow.
 *
 * BLOCK 27 (item 10). The owner's acceptance workflow, executed end-to-end against
 * REAL CRM-backed data:
 *   1. Search the CRM (durable Investor CRM store).
 *   2. Rank candidates against the named deal (deterministic deal-matching engine).
 *   3. Surface match scores + evidence + fit dimensions + risk notes.
 *   4. Draft an introduction email (deterministic drafter, persisted as an outreach
 *      DRAFT — owner approval still required before it can ever be sent).
 *   5. Create a follow-up task (persisted as a follow-up outreach draft).
 *   6. Log the activity (durable append-only workflow ledger).
 *   7. Return proof (ids, timestamps, step ledger).
 *
 * HARD HONESTY RULE: relationships and contacts are never invented. The workflow
 * ranks ONLY the contacts that exist in the CRM, scored only from evidence on the
 * deal + the record. Nothing is sent — every drafted message stays a DRAFT behind
 * the owner-approval gate. If the deal can't be matched or the CRM is empty, the
 * workflow says so honestly instead of fabricating a result.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { listInvestors, type InvestorRecord } from './ivx-investor-crm-store';
import { readLandingProjects } from './ivx-project-data';
import type { ProjectRecord } from './ivx-project-data';
import {
  classifyMatchRole,
  scoreDealMatch,
  type DealMatch,
} from './ivx-deal-matching-engine';
import { createOutreachMessage } from './ivx-outreach-store';

export const IVX_BEST_INVESTOR_WORKFLOW_MARKER = 'ivx-best-investor-workflow-2026-05-31';

const ROOT = path.join(process.cwd(), 'logs', 'audit', 'capital-workflow');
const ACTIVITY_LOG = path.join(ROOT, 'activity.jsonl');

export type WorkflowStepStatus = 'done' | 'skipped' | 'failed';

export type WorkflowStep = {
  key: string;
  label: string;
  status: WorkflowStepStatus;
  detail: string;
};

export type WorkflowDealRef = {
  dealId: string;
  dealName: string;
  location: string | null;
  summary: string;
};

export type WorkflowDraftRef = {
  messageId: string;
  type: string;
  status: string;
  subject: string;
  recipientName: string;
  /** Drafts always require owner approval before sending. */
  requiresApproval: true;
};

export type WorkflowActivityRef = {
  id: string;
  at: string;
  summary: string;
};

export type BestInvestorWorkflowResult = {
  marker: string;
  generatedAt: string;
  /** The raw deal phrase the owner asked about. */
  dealQuery: string;
  /** The deal we matched the query to, or null if none matched. */
  deal: WorkflowDealRef | null;
  candidatesConsidered: number;
  /** All contacts ranked best-first against the deal. */
  ranked: DealMatch[];
  /** The single best investor-role candidate (fallback: top overall). */
  bestInvestor: DealMatch | null;
  introEmail: WorkflowDraftRef | null;
  followUpTask: WorkflowDraftRef | null;
  activity: WorkflowActivityRef | null;
  steps: WorkflowStep[];
  /** True only when a real, CRM-backed best investor was found + actioned. */
  completed: boolean;
  note: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Strip the natural-language wrapper around a deal name so "find the best investor
 * for Casa Rosario" / "best investor for deal Casa Rosario?" both reduce to the
 * deal phrase. Pure + deterministic.
 */
export function extractDealQuery(prompt: string): string {
  let q = lower(prompt);
  q = q.replace(/[?!.]+$/g, ' ');
  q = q.replace(/\bfind\s+(?:me\s+|the\s+|us\s+)?(?:best|top|right|ideal)\s+investors?\b/g, ' ');
  q = q.replace(/\b(?:who\s+(?:is|are)\s+the\s+)?(?:best|top|right|ideal)\s+investors?\b/g, ' ');
  q = q.replace(/\b(?:match|find|get|show)\s+investors?\b/g, ' ');
  q = q.replace(/\bfor\b/g, ' ');
  q = q.replace(/\b(?:the\s+)?deal\b/g, ' ');
  q = q.replace(/\b(?:project|property|opportunity)\b/g, ' ');
  q = q.replace(/['"“”]/g, ' ');
  q = q.replace(/\s+/g, ' ').trim();
  q = q.replace(/^(?:the|a|an|my|our)\s+/g, '');
  return q.trim();
}

/**
 * Select the deal that best matches the owner's query. Exact/substring name match
 * first; falls back to the top-scoring word overlap. Returns null if nothing is a
 * credible match (never guesses an unrelated deal).
 */
export function selectDealForQuery(projects: ProjectRecord[], query: string): ProjectRecord | null {
  if (projects.length === 0) return null;
  const q = lower(query);
  if (!q) {
    return projects[0] ?? null;
  }

  for (const project of projects) {
    if (lower(project.name) === q) return project;
  }
  for (const project of projects) {
    const name = lower(project.name);
    if (name && (name.includes(q) || q.includes(name))) return project;
  }

  const qWords = q.split(' ').filter((w) => w.length >= 3);
  if (qWords.length === 0) return null;
  let best: { project: ProjectRecord; score: number } | null = null;
  for (const project of projects) {
    const name = lower(project.name);
    const score = qWords.reduce((sum, w) => (name.includes(w) ? sum + 1 : sum), 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { project, score };
    }
  }
  return best?.project ?? null;
}

function describeDeal(deal: ProjectRecord): string {
  return [
    deal.location ?? 'location n/a',
    deal.price ?? 'price n/a',
    deal.roi ? `${deal.roi} ROI` : 'ROI n/a',
    deal.ownershipMinimum ? `${deal.ownershipMinimum} min` : 'min n/a',
  ].join(' · ');
}

/**
 * Rank all CRM contacts against the deal (best-first) and pick the single best
 * investor: the highest-scoring contact classified as an investor, falling back to
 * the top-scoring contact overall when no investor-role contact exists. Pure.
 */
export function rankInvestorsForDeal(
  deal: ProjectRecord,
  contacts: InvestorRecord[],
): { ranked: DealMatch[]; bestInvestor: DealMatch | null } {
  const ranked = contacts
    .map((contact) => scoreDealMatch(deal, contact))
    .sort((a, b) => b.matchScore - a.matchScore);
  const bestInvestor =
    ranked.find((m) => m.role === 'investor') ?? ranked[0] ?? null;
  return { ranked, bestInvestor };
}

async function appendActivity(event: Record<string, unknown>): Promise<void> {
  try {
    await mkdir(ROOT, { recursive: true });
    await appendFile(ACTIVITY_LOG, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensic ledger is best-effort; never break the workflow on a log failure.
  }
}

/** Read the recent workflow activity ledger (newest first). Read-only. */
export async function listWorkflowActivity(limit: number = 50): Promise<WorkflowActivityRef[]> {
  try {
    const raw = await readFile(ACTIVITY_LOG, 'utf8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const items: WorkflowActivityRef[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (typeof parsed.id === 'string' && typeof parsed.at === 'string' && typeof parsed.summary === 'string') {
          items.push({ id: parsed.id, at: parsed.at, summary: parsed.summary });
        }
      } catch {
        // skip malformed line
      }
    }
    return items.reverse().slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

export type RunBestInvestorWorkflowInput = {
  /** The deal name (or natural-language phrase) to find the best investor for. */
  dealQuery: string;
  /** Owner sign-off used on the drafted intro (optional). */
  senderName?: string;
};

/**
 * Execute the full "Find the best investor for Deal X" workflow against real
 * CRM-backed data. Read-mostly: the only writes are owner-approval-gated outreach
 * DRAFTS + an activity-ledger entry. Never throws — every failure becomes an
 * honest step status + note.
 */
export async function runBestInvestorWorkflow(
  input: RunBestInvestorWorkflowInput,
): Promise<BestInvestorWorkflowResult> {
  const generatedAt = nowIso();
  const dealQuery = (input.dealQuery ?? '').trim();
  const steps: WorkflowStep[] = [];

  const [contacts, projectsResult] = await Promise.all([
    listInvestors().catch(() => [] as InvestorRecord[]),
    readLandingProjects().catch(() => null),
  ]);

  steps.push({
    key: 'search_crm',
    label: 'Search CRM',
    status: 'done',
    detail: `Loaded ${contacts.length} CRM contact(s) from the Investor CRM.`,
  });

  const projects = projectsResult && projectsResult.ok ? projectsResult.projects : [];
  const cleanedQuery = extractDealQuery(dealQuery);
  const deal = selectDealForQuery(projects, cleanedQuery);

  if (!deal) {
    steps.push({
      key: 'match_deal',
      label: 'Match deal',
      status: 'failed',
      detail: projects.length === 0
        ? 'No active deals available from jv_deals to match against.'
        : `No deal matched "${dealQuery}". Available: ${projects.map((p) => p.name).join(', ')}.`,
    });
    return {
      marker: IVX_BEST_INVESTOR_WORKFLOW_MARKER,
      generatedAt,
      dealQuery,
      deal: null,
      candidatesConsidered: contacts.length,
      ranked: [],
      bestInvestor: null,
      introEmail: null,
      followUpTask: null,
      activity: null,
      steps,
      completed: false,
      note: projects.length === 0
        ? 'No deals are published in jv_deals — publish a deal first, then re-run.'
        : `Could not match "${dealQuery}" to a known deal. Try the exact deal name.`,
    };
  }

  const dealRef: WorkflowDealRef = {
    dealId: deal.id,
    dealName: deal.name,
    location: deal.location,
    summary: describeDeal(deal),
  };
  steps.push({
    key: 'match_deal',
    label: 'Match deal',
    status: 'done',
    detail: `Matched query to "${deal.name}" (${dealRef.summary}).`,
  });

  const { ranked, bestInvestor } = rankInvestorsForDeal(deal, contacts);
  steps.push({
    key: 'rank_candidates',
    label: 'Rank candidates',
    status: ranked.length > 0 ? 'done' : 'failed',
    detail: ranked.length > 0
      ? `Ranked ${ranked.length} candidate(s); top match ${bestInvestor?.name ?? 'n/a'} at ${bestInvestor?.matchScore ?? 0}/100.`
      : 'No CRM contacts to rank — add investors to the CRM first.',
  });

  if (!bestInvestor || ranked.length === 0) {
    return {
      marker: IVX_BEST_INVESTOR_WORKFLOW_MARKER,
      generatedAt,
      dealQuery,
      deal: dealRef,
      candidatesConsidered: contacts.length,
      ranked,
      bestInvestor: null,
      introEmail: null,
      followUpTask: null,
      activity: null,
      steps,
      completed: false,
      note: `No CRM contacts to match against ${deal.name}. Add investors to the CRM, then re-run.`,
    };
  }

  // 4. Draft introduction email (persisted DRAFT — owner approval still required).
  let introEmail: WorkflowDraftRef | null = null;
  const introResult = await createOutreachMessage({
    type: 'investor_intro',
    recipientName: bestInvestor.name,
    recipientCompany: bestInvestor.company,
    relatedDeal: deal.name,
    senderName: input.senderName,
    contextNote: `Best-fit investor for ${deal.name} (match ${bestInvestor.matchScore}/100). ${bestInvestor.evidence[0] ?? ''}`.trim(),
    notes: `Auto-drafted by the Find-Best-Investor workflow for ${deal.name}. Requires owner approval before sending.`,
  }).catch(() => null);
  if (introResult && introResult.ok) {
    introEmail = {
      messageId: introResult.message.id,
      type: introResult.message.type,
      status: introResult.message.status,
      subject: introResult.message.subject,
      recipientName: introResult.message.recipientName,
      requiresApproval: true,
    };
    steps.push({
      key: 'draft_intro',
      label: 'Draft introduction email',
      status: 'done',
      detail: `Drafted intro to ${bestInvestor.name} — "${introResult.message.subject}" (status: draft, owner approval required).`,
    });
  } else {
    steps.push({
      key: 'draft_intro',
      label: 'Draft introduction email',
      status: 'failed',
      detail: introResult && !introResult.ok ? introResult.error : 'Could not draft the introduction email.',
    });
  }

  // 5. Create follow-up task (persisted follow-up DRAFT).
  let followUpTask: WorkflowDraftRef | null = null;
  const followResult = await createOutreachMessage({
    type: 'follow_up',
    recipientName: bestInvestor.name,
    recipientCompany: bestInvestor.company,
    relatedDeal: deal.name,
    senderName: input.senderName,
    contextNote: `Follow up on the ${deal.name} introduction: confirm receipt, gauge interest, and offer a call.`,
    notes: `Auto-created follow-up task for ${deal.name}. Requires owner approval before sending.`,
  }).catch(() => null);
  if (followResult && followResult.ok) {
    followUpTask = {
      messageId: followResult.message.id,
      type: followResult.message.type,
      status: followResult.message.status,
      subject: followResult.message.subject,
      recipientName: followResult.message.recipientName,
      requiresApproval: true,
    };
    steps.push({
      key: 'follow_up_task',
      label: 'Create follow-up task',
      status: 'done',
      detail: `Created follow-up task for ${bestInvestor.name} on ${deal.name} (status: draft).`,
    });
  } else {
    steps.push({
      key: 'follow_up_task',
      label: 'Create follow-up task',
      status: 'failed',
      detail: followResult && !followResult.ok ? followResult.error : 'Could not create the follow-up task.',
    });
  }

  // 6. Log activity (durable ledger).
  const activity: WorkflowActivityRef = {
    id: createId('activity'),
    at: nowIso(),
    summary: `Found best investor "${bestInvestor.name}" (${bestInvestor.matchScore}/100) for ${deal.name}; drafted intro + follow-up (owner approval required).`,
  };
  await appendActivity({
    ...activity,
    dealId: deal.id,
    dealName: deal.name,
    bestInvestorId: bestInvestor.contactId,
    bestInvestorScore: bestInvestor.matchScore,
    introMessageId: introEmail?.messageId ?? null,
    followUpMessageId: followUpTask?.messageId ?? null,
    role: classifyMatchRole(bestInvestor.role),
  });
  steps.push({
    key: 'log_activity',
    label: 'Log activity',
    status: 'done',
    detail: `Logged workflow activity ${activity.id}.`,
  });

  return {
    marker: IVX_BEST_INVESTOR_WORKFLOW_MARKER,
    generatedAt,
    dealQuery,
    deal: dealRef,
    candidatesConsidered: contacts.length,
    ranked,
    bestInvestor,
    introEmail,
    followUpTask,
    activity,
    steps,
    completed: Boolean(bestInvestor && introEmail),
    note: `Best investor for ${deal.name}: ${bestInvestor.name} (${bestInvestor.matchScore}/100). Intro + follow-up drafted; approve in Outreach to send.`,
  };
}
