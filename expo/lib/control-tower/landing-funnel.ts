import { controlTowerEmitter } from './event-emitter';
import type { CTLandingFunnelSnapshot, CTFlowStep } from './types';

const WINDOW_5M = 300_000;
const WINDOW_1H = 3600_000;

const LANDING_STEPS: CTFlowStep[] = [
  'landing_visit',
  'landing_section_view',
  'landing_cta_clicked',
  'landing_form_started',
  'landing_form_submitted',
  'landing_api_started',
  'landing_api_succeeded',
  'landing_api_failed',
  'handoff_to_app_started',
  'handoff_to_app_succeeded',
];

const LANDING_EVENT_TYPES = [
  'landing_visit',
  'landing_cta_clicked',
  'landing_form_started',
  'landing_form_submitted',
  'landing_api_started',
  'landing_api_succeeded',
  'landing_api_failed',
  'handoff_to_app',
] as const;

function countStepEvents(step: CTFlowStep, windowMs: number): number {
  const events = controlTowerEmitter.getEventsByModule('landing');
  const now = Date.now();
  return events.filter(e => {
    const age = now - new Date(e.timestamp).getTime();
    return age <= windowMs && e.step === step;
  }).length;
}

function countEventType(type: string, windowMs: number): number {
  const events = controlTowerEmitter.getEventsByModule('landing');
  const now = Date.now();
  return events.filter(e => {
    const age = now - new Date(e.timestamp).getTime();
    return age <= windowMs && e.type === type;
  }).length;
}

function getActiveVisitors(): number {
  const sessions = controlTowerEmitter.getActiveSessionsByModule();
  return sessions.get('landing')?.size ?? 0;
}

function getUniqueSessionCount(windowMs: number): number {
  const events = controlTowerEmitter.getEventsByModule('landing');
  const now = Date.now();
  const sessions = new Set<string>();
  for (const e of events) {
    const age = now - new Date(e.timestamp).getTime();
    if (age <= windowMs && e.type !== 'exit_module') {
      sessions.add(e.sessionId);
    }
  }
  return sessions.size;
}

function getReferrerSources(): Array<{ source: string; count: number }> {
  const events = controlTowerEmitter.getEventsByModule('landing');
  const now = Date.now();
  const sourceMap = new Map<string, number>();

  for (const e of events) {
    const age = now - new Date(e.timestamp).getTime();
    if (age > WINDOW_1H) continue;
    if (e.type === 'landing_visit' && e.metadata?.referrer) {
      const src = String(e.metadata.referrer);
      sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
    }
  }

  return Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function getAvgLatency(): number {
  const events = controlTowerEmitter.getEventsByModule('landing');
  const now = Date.now();
  let totalLatency = 0;
  let count = 0;

  for (const e of events) {
    const age = now - new Date(e.timestamp).getTime();
    if (age > WINDOW_5M) continue;
    if ((e.type === 'landing_api_succeeded' || e.type === 'landing_api_failed') && e.metadata?.latencyMs) {
      totalLatency += Number(e.metadata.latencyMs);
      count++;
    }
  }

  return count > 0 ? Math.round(totalLatency / count) : 0;
}

function computeDropOff(): Array<{ step: string; count: number; rate: number }> {
  const funnelSteps: { step: CTFlowStep; label: string }[] = [
    { step: 'landing_visit', label: 'Visit' },
    { step: 'landing_cta_clicked', label: 'CTA Click' },
    { step: 'landing_form_started', label: 'Form Start' },
    { step: 'landing_form_submitted', label: 'Form Submit' },
    { step: 'landing_api_succeeded', label: 'API Success' },
    { step: 'handoff_to_app_succeeded', label: 'App Handoff' },
  ];

  const counts = funnelSteps.map(s => ({
    ...s,
    count: countStepEvents(s.step, WINDOW_1H),
  }));

  return counts.map((item, i) => {
    const prev = i > 0 ? counts[i - 1]!.count : item.count;
    const dropRate = prev > 0 ? Math.max(0, 1 - (item.count / prev)) : 0;
    return {
      step: item.label,
      count: item.count,
      rate: Math.round(dropRate * 100),
    };
  });
}

function computeStageAttribution(params: {
  visits: number;
  ctaClicks: number;
  formStarts: number;
  formSubmits: number;
  apiCalls: number;
  apiFailures: number;
  handoffsStarted: number;
  handoffsCompleted: number;
}): CTLandingFunnelSnapshot['stageAttribution'] {
  const stageAttribution: CTLandingFunnelSnapshot['stageAttribution'] = [];

  const landingLeak = Math.max(0, params.visits - params.ctaClicks);
  if (landingLeak > 0) {
    stageAttribution.push({
      id: 'landing-cta',
      stage: 'Landing → CTA',
      affectedUsers: landingLeak,
      leakRate: params.visits > 0 ? Math.round((landingLeak / params.visits) * 100) : 0,
      blockedBy: ['landing performance', 'cta relevance'],
      dependencyBasis: ['landing', 'traffic ingestion'],
      interventionSuggestion: 'Shift traffic to the strongest landing variant and verify CTA responsiveness.',
      proofSummary: 'Visitors are leaking before they commit to the primary CTA.',
    });
  }

  const formLeak = Math.max(0, params.formStarts - params.formSubmits);
  if (formLeak > 0) {
    stageAttribution.push({
      id: 'form-submit',
      stage: 'Form start → submit',
      affectedUsers: formLeak,
      leakRate: params.formStarts > 0 ? Math.round((formLeak / params.formStarts) * 100) : 0,
      blockedBy: ['lead capture form', 'validation path'],
      dependencyBasis: ['landing', 'database'],
      interventionSuggestion: 'Fail over to backup lead capture and inspect form validation errors.',
      proofSummary: 'Users start the lead flow but fail to complete submission.',
    });
  }

  if (params.apiFailures > 0) {
    stageAttribution.push({
      id: 'api-write',
      stage: 'Submit → API write',
      affectedUsers: params.apiFailures,
      leakRate: params.apiCalls > 0 ? Math.round((params.apiFailures / params.apiCalls) * 100) : 0,
      blockedBy: ['api provider', 'database write'],
      dependencyBasis: ['database', 'auth', 'app handoff'],
      interventionSuggestion: 'Retry the landing API path and route new leads to safe capture while degraded.',
      proofSummary: 'Backend/API failures are directly blocking conversion completion.',
    });
  }

  const handoffLeak = Math.max(0, params.handoffsStarted - params.handoffsCompleted);
  if (handoffLeak > 0) {
    stageAttribution.push({
      id: 'handoff',
      stage: 'Handoff → app open',
      affectedUsers: handoffLeak,
      leakRate: params.handoffsStarted > 0 ? Math.round((handoffLeak / params.handoffsStarted) * 100) : 0,
      blockedBy: ['auth', 'app open route'],
      dependencyBasis: ['auth', 'app', 'chat transport'],
      interventionSuggestion: 'Hold users on the safest handoff route while app/auth dependencies recover.',
      proofSummary: 'Users complete landing intent but fail to enter the app or target module.',
    });
  }

  return stageAttribution.sort((a, b) => b.affectedUsers - a.affectedUsers);
}

export function computeLandingFunnel(): CTLandingFunnelSnapshot {
  const activeVisitors = getActiveVisitors();
  const visitorsLast5m = getUniqueSessionCount(WINDOW_5M);
  const visitorsLast1h = getUniqueSessionCount(WINDOW_1H);

  const ctaClicks = countStepEvents('landing_cta_clicked', WINDOW_1H);
  const visits = countStepEvents('landing_visit', WINDOW_1H);
  const ctaClickRate = visits > 0 ? Math.round((ctaClicks / visits) * 100) : 0;

  const formStarts = countStepEvents('landing_form_started', WINDOW_1H);
  const formSubmits = countStepEvents('landing_form_submitted', WINDOW_1H);
  const formSubmitRate = formStarts > 0 ? Math.round((formSubmits / formStarts) * 100) : 0;

  const apiCalls = countStepEvents('landing_api_started', WINDOW_1H);
  const apiSuccesses = countStepEvents('landing_api_succeeded', WINDOW_1H);
  const apiFailures = countStepEvents('landing_api_failed', WINDOW_1H);
  const apiSuccessRate = apiCalls > 0 ? Math.round((apiSuccesses / apiCalls) * 100) : 0;

  const handoffsStarted = countStepEvents('handoff_to_app_started', WINDOW_1H);
  const handoffsCompleted = countStepEvents('handoff_to_app_succeeded', WINDOW_1H);

  const dropOffPoints = computeDropOff();
  const topReferrers = getReferrerSources();
  const avgLatencyMs = getAvgLatency();
  const stageAttribution = computeStageAttribution({
    visits,
    ctaClicks,
    formStarts,
    formSubmits,
    apiCalls,
    apiFailures,
    handoffsStarted,
    handoffsCompleted,
  });
  const ifFixedNowOpportunity = stageAttribution.reduce((sum, stage) => sum + stage.affectedUsers, 0);

  console.log(`[CT:LandingFunnel] visitors=${activeVisitors} cta=${ctaClicks}(${ctaClickRate}%) forms=${formStarts}->${formSubmits}(${formSubmitRate}%) api=${apiSuccesses}/${apiCalls}(${apiSuccessRate}%) stageAttribution=${stageAttribution.length}`);

  return {
    activeVisitors,
    visitorsLast5m,
    visitorsLast1h,
    ctaClicks,
    ctaClickRate,
    formStarts,
    formSubmits,
    formSubmitRate,
    apiCalls,
    apiSuccesses,
    apiFailures,
    apiSuccessRate,
    handoffsStarted,
    handoffsCompleted,
    dropOffPoints,
    topReferrers,
    avgLatencyMs,
    stageAttribution,
    ifFixedNowOpportunity,
  };
}
