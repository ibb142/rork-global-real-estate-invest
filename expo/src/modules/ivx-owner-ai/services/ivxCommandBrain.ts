/**
 * IVX Command Brain — runs the owner control-room engines INLINE inside the
 * Owner AI chat as slash commands, so the owner gets a structured result card
 * in the conversation without opening a separate screen.
 *
 * Each entry maps a command to an owner-gated service call (the same live,
 * owner-authenticated readers the control-room screens use) and renders a
 * concise structured response (`Result:` / `Evidence:` rows) which the chat
 * renders as a Command Result card via `parseStructuredSystemMessage`.
 *
 * Honesty: nothing is fabricated. Every value comes from the live owner-gated
 * API; a failed/empty read returns an honest structured failure, never a made-up
 * number. These commands are read-only — they never mutate or send anything.
 */
import { getExecutiveLayer } from '@/src/modules/ivx-developer/executiveLayerService';
import {
  getCapitalCommandCenter,
  runBestInvestor,
} from '@/src/modules/ivx-developer/capitalCommandService';
import { getBusinessImpactDashboard } from '@/src/modules/ivx-developer/businessImpactService';
import { getBestOpportunity } from '@/src/modules/ivx-developer/opportunityService';

export type CommandBrainEntry = {
  command: string;
  description: string;
  /** Short usage hint shown by `/brain`. */
  usage: string;
  /** Pending message shown immediately while the live read runs. */
  pending: string;
  /** Linked owner control-room screen (for reference in the result). */
  surface: string;
  run: (args: string) => Promise<string>;
};

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'unknown';
  }
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function trimArg(args: string): string {
  return typeof args === 'string' ? args.trim() : '';
}

/**
 * Build an honest structured failure card from a thrown error. Includes the
 * `Result:` + `Evidence:` rows the chat needs to render a Command Result card.
 */
function buildFailureResponse(command: string, surface: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : 'Unknown error while running this command.';
  return [
    'Result: blocked',
    `Explanation: The ${command} command could not complete against the live owner backend.`,
    `Evidence: ${reason}`,
    `Affected dependencies: owner-gated ${surface} API`,
    `Operator action log: ${command}-inline-failed`,
    'Rollback: not required (read-only command)',
    `Linked surface: ${surface}`,
  ].join('\n');
}

async function runExecutiveBrief(): Promise<string> {
  const layer = await getExecutiveLayer();
  if (!layer) {
    return [
      'Result: empty',
      'Explanation: The executive layer returned no data yet.',
      'Evidence: No executive snapshot available from the live backend.',
      'Operator action log: executive-inline',
      'Rollback: not required (read-only command)',
      'Linked surface: /ivx/executive-layer',
    ].join('\n');
  }
  const cards = layer.scorecards;
  const briefing = layer.dailyBriefing;
  const topDecision = layer.decisionEngine.decisions[0] ?? null;
  return [
    `Result: ${cards.company.grade} (${cards.company.score}/100)`,
    `Explanation: ${layer.headline}`,
    `Evidence: company ${cards.company.grade} | AI ${cards.ai.grade} | engineering ${cards.engineering.grade} | capital ${cards.capital.grade}`,
    `Daily briefing: revenue ${briefing.revenue.value} | investor pipeline ${briefing.investorPipeline.value} | cash runway ${briefing.cashRunway.value}`,
    `Open risks: ${briefing.openRisks.count} — ${briefing.openRisks.items.slice(0, 2).join('; ') || 'none recorded'}`,
    `Top decision: ${topDecision ? `${topDecision.title} (${topDecision.estimatedImpact}, ${topDecision.riskLevel} risk)` : 'none ranked yet'}`,
    `Execution: ${layer.executionTracking.executed} executed / ${layer.executionTracking.planned} planned`,
    'Operator action log: executive-inline',
    'Linked surface: /ivx/executive-layer',
  ].join('\n');
}

async function runCommandCenter(): Promise<string> {
  const dashboard = await getCapitalCommandCenter();
  if (!dashboard) {
    return [
      'Result: empty',
      'Explanation: The capital command center returned no data yet.',
      'Evidence: No command-center snapshot available from the live backend.',
      'Operator action log: command-center-inline',
      'Rollback: not required (read-only command)',
      'Linked surface: /ivx/capital-command-center',
    ].join('\n');
  }
  const investor = dashboard.bestInvestorToday;
  const buyer = dashboard.bestBuyerToday;
  const opportunity = dashboard.bestOpportunityToday;
  const pipeline = dashboard.capitalPipeline;
  return [
    `Result: ${investor || buyer || opportunity ? 'available' : 'empty'}`,
    `Explanation: ${dashboard.headline}`,
    `Best investor today: ${investor ? `${investor.name} — ${investor.company} (match ${investor.matchScore}, deal ${investor.dealName})` : 'none yet'}`,
    `Best buyer today: ${buyer ? `${buyer.name} — ${buyer.company} (match ${buyer.matchScore})` : 'none yet'}`,
    `Best opportunity today: ${opportunity ? `${opportunity.name} (score ${opportunity.weightedScore}) — ${opportunity.recommendation}` : 'none yet'}`,
    `Evidence: total pipeline ${formatUsd(pipeline.totalPipeline)} | weighted ${formatUsd(pipeline.weightedPipeline)} | raised this month ${formatUsd(dashboard.capitalRaisedThisMonth)}`,
    `Attention: ${dashboard.meetingsNeeded.length} meetings | ${dashboard.followUpsNeeded.length} follow-ups | ${dashboard.dealsAtRisk.length} deals at risk`,
    'Operator action log: command-center-inline',
    'Linked surface: /ivx/capital-command-center',
  ].join('\n');
}

async function runBestInvestorWorkflow(args: string): Promise<string> {
  const dealQuery = trimArg(args);
  if (!dealQuery) {
    return [
      'Result: blocked',
      'Explanation: A deal name is required.',
      'Evidence: Usage — /best-investor <deal name> (e.g. /best-investor Casa Rosario)',
      'Operator action log: best-investor-inline-usage',
      'Rollback: not required (read-only command)',
      'Linked surface: /ivx/capital-command-center',
    ].join('\n');
  }
  const workflow = await runBestInvestor(dealQuery);
  if (!workflow) {
    return [
      'Result: empty',
      `Explanation: No best-investor result returned for "${dealQuery}".`,
      'Evidence: The workflow returned no data.',
      'Operator action log: best-investor-inline',
      'Rollback: not required (read-only command)',
      'Linked surface: /ivx/capital-command-center',
    ].join('\n');
  }
  const best = workflow.bestInvestor;
  const deal = workflow.deal;
  return [
    `Result: ${best ? 'available' : workflow.deal ? 'no-match' : 'deal-not-found'}`,
    `Explanation: ${workflow.note}`,
    `Deal: ${deal ? `${deal.dealName}${deal.location ? ` — ${deal.location}` : ''}` : `no deal matched "${dealQuery}"`}`,
    `Best investor: ${best ? `${best.name} — ${best.company} (match ${best.matchScore})` : 'none qualified from the CRM yet'}`,
    `Evidence: ${best ? best.evidence.slice(0, 2).join(' | ') || 'no evidence rows' : 'no candidate evidence'}`,
    `Candidates considered: ${workflow.candidatesConsidered}`,
    `Drafts (owner-approval gated): intro ${workflow.introEmail ? workflow.introEmail.status : 'none'} | follow-up ${workflow.followUpTask ? workflow.followUpTask.status : 'none'}`,
    'Operator action log: best-investor-inline',
    'Linked surface: /ivx/capital-command-center',
  ].join('\n');
}

async function runImpact(): Promise<string> {
  const dashboard = await getBusinessImpactDashboard();
  if (!dashboard) {
    return [
      'Result: empty',
      'Explanation: The business-impact dashboard returned no data yet.',
      'Evidence: No business-impact snapshot available from the live backend.',
      'Operator action log: impact-inline',
      'Rollback: not required (read-only command)',
      'Linked surface: /ivx/business-impact',
    ].join('\n');
  }
  const briefing = dashboard.ceoBriefing;
  const revenue = dashboard.revenuePotential;
  const topTask = dashboard.priorityTasks[0] ?? null;
  return [
    'Result: available',
    `Explanation: ${dashboard.headline}`,
    `Top opportunity: ${briefing.topOpportunity ? briefing.topOpportunity.title : 'none today'}`,
    `Top risk: ${briefing.topRisk ? briefing.topRisk.title : 'none today'}`,
    `Evidence: opportunities today ${dashboard.opportunitiesFound.today} | potential upside ${formatUsd(revenue.estimatedOpportunityValueUsd)} | deals in progress ${revenue.dealsInProgress}`,
    `Time saved: ${dashboard.timeSaved.hoursSaved}h | tasks automated ${dashboard.timeSaved.tasksAutomated}`,
    `Top priority task: ${topTask ? `P${topTask.priority} ${topTask.title}` : 'none'}`,
    'Operator action log: impact-inline',
    'Linked surface: /ivx/business-impact',
  ].join('\n');
}

async function runOpportunity(): Promise<string> {
  const { best, research } = await getBestOpportunity();
  if (!best) {
    return [
      'Result: empty',
      'Explanation: No opportunity could be selected from current signals.',
      `Evidence: research sources online: ${research.filter((source) => source.status === 'online').length}/${research.length}`,
      'Operator action log: opportunity-inline',
      'Rollback: not required (read-only command)',
      'Linked surface: /ivx/opportunity-engine',
    ].join('\n');
  }
  return [
    `Result: ${best.title}`,
    `Explanation: ${best.summary}`,
    `Evidence: overall ${best.overall}/100 | confidence ${best.confidence}/100 | category ${best.category} | ${best.evidence}`,
    `Economics: capital ${formatUsd(best.capitalRequiredUsd)} | upside ${formatUsd(best.upsideLowUsd)}–${formatUsd(best.upsideHighUsd)} | ${best.timeline}`,
    `Next actions: ${best.nextActions.slice(0, 2).join('; ') || 'none listed'}`,
    `Risk: ${best.riskWarnings.slice(0, 1).join('; ') || 'none flagged'}`,
    'Operator action log: opportunity-inline',
    'Linked surface: /ivx/opportunity-engine',
  ].join('\n');
}

/**
 * Registry of inline Command Brain commands. Keyed by the slash-command name
 * (without the leading `/`).
 */
export const IVX_COMMAND_BRAIN: Record<string, CommandBrainEntry> = {
  executive: {
    command: 'executive',
    description: 'Executive layer brief: scorecards, daily briefing, top decision',
    usage: '/executive',
    pending: 'Running the executive layer brief from live owner data…',
    surface: '/ivx/executive-layer',
    run: () => runExecutiveBrief(),
  },
  'command-center': {
    command: 'command-center',
    description: 'Capital command center: best investor/buyer/opportunity + pipeline',
    usage: '/command-center',
    pending: 'Loading the capital command center from live owner data…',
    surface: '/ivx/capital-command-center',
    run: () => runCommandCenter(),
  },
  'best-investor': {
    command: 'best-investor',
    description: 'Find the best investor for a deal (CRM-backed, owner-gated)',
    usage: '/best-investor <deal name>',
    pending: 'Running the best-investor workflow against the live CRM…',
    surface: '/ivx/capital-command-center',
    run: (args: string) => runBestInvestorWorkflow(args),
  },
  impact: {
    command: 'impact',
    description: 'Business impact: CEO briefing, opportunities, revenue potential',
    usage: '/impact',
    pending: 'Loading the business-impact command center from live owner data…',
    surface: '/ivx/business-impact',
    run: () => runImpact(),
  },
  opportunity: {
    command: 'opportunity',
    description: "Today's best opportunity, scored with evidence + next actions",
    usage: '/opportunity',
    pending: "Finding today's best opportunity from live signals…",
    surface: '/ivx/opportunity-engine',
    run: () => runOpportunity(),
  },
};

/** True when `command` is a registered Command Brain command. */
export function isCommandBrainCommand(command: string): boolean {
  return Object.prototype.hasOwnProperty.call(IVX_COMMAND_BRAIN, command.toLowerCase());
}

/** Human-readable list of all Command Brain commands (for `/brain`). */
export function listCommandBrainCommands(): string {
  const lines = Object.values(IVX_COMMAND_BRAIN).map(
    (entry) => `/${entry.command} — ${entry.description}`,
  );
  return [
    'IVX Command Brain — run these inline, results appear in the chat:',
    ...lines,
    '',
    'Each command reads live owner-gated data; nothing is sent or changed.',
  ].join('\n');
}

/** The immediate "running…" message for a Command Brain command, if any. */
export function getCommandBrainPending(command: string): string | null {
  const entry = IVX_COMMAND_BRAIN[command.toLowerCase()];
  return entry ? entry.pending : null;
}

/**
 * Run a Command Brain command and return its structured result string, or
 * `null` if the command is not a Command Brain command. Never throws — a
 * failed live read becomes an honest structured failure card.
 */
export async function runCommandBrain(command: string, args: string): Promise<string | null> {
  const entry = IVX_COMMAND_BRAIN[command.toLowerCase()];
  if (!entry) {
    return null;
  }
  try {
    console.log('[IVXCommandBrain] Running inline command:', entry.command, 'args:', args ? args.slice(0, 40) : '(none)');
    return await entry.run(args);
  } catch (error) {
    console.log('[IVXCommandBrain] Inline command failed:', entry.command, error instanceof Error ? error.message : 'unknown');
    return buildFailureResponse(entry.command, entry.surface, error);
  }
}
