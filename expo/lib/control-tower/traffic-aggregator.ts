import { trafficAttribution } from './traffic-attribution';
import type {
  TrafficSourceId,
  TrafficSourceSnapshot,
  TrafficOutcome,
  TrafficFriction,
  TrafficNodeConnection,
  TrafficIntelSnapshot,
  UserIntent,
  JourneyStep,
  FrictionType,
} from './traffic-types';
import { ALL_TRAFFIC_SOURCES, TRAFFIC_SOURCE_META } from './traffic-types';

const WINDOW_5M = 300_000;
const WINDOW_1H = 3600_000;
const WINDOW_24H = 86400_000;

function countSessionsByWindow(sourceId: TrafficSourceId, windowMs: number): number {
  return trafficAttribution.getSessionsBySource(sourceId, windowMs).length;
}

function computeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function computeJourneySteps(sourceId: TrafficSourceId): Partial<Record<JourneyStep, number>> {
  const sessions = trafficAttribution.getSessionsBySource(sourceId, WINDOW_1H);
  const steps: Partial<Record<JourneyStep, number>> = {};
  for (const s of sessions) {
    for (const step of s.stepsVisited) {
      steps[step] = (steps[step] || 0) + 1;
    }
  }
  return steps;
}

function computeIntentDistribution(sourceId: TrafficSourceId): Partial<Record<UserIntent, number>> {
  const sessions = trafficAttribution.getSessionsBySource(sourceId, WINDOW_1H);
  const intents: Partial<Record<UserIntent, number>> = {};
  for (const s of sessions) {
    intents[s.intent] = (intents[s.intent] || 0) + 1;
  }
  return intents;
}

function getTopIntent(intents: Partial<Record<UserIntent, number>>): UserIntent {
  let top: UserIntent = 'unknown';
  let max = 0;
  for (const [intent, count] of Object.entries(intents)) {
    if ((count ?? 0) > max) {
      max = count ?? 0;
      top = intent as UserIntent;
    }
  }
  return top;
}

function computeOutcomes(sourceId: TrafficSourceId): TrafficOutcome {
  const sessions = trafficAttribution.getSessionsBySource(sourceId, WINDOW_1H);
  const total = sessions.length;
  if (total === 0) {
    return {
      bounceRate: 0, leadConversion: 0, signupConversion: 0,
      appHandoffSuccess: 0, firstMeaningfulAction: 0, chatOpenRate: 0,
      dealViewRate: 0, investInitRate: 0, returnRate: 0,
    };
  }

  let bounce = 0;
  let lead = 0;
  let signup = 0;
  let handoff = 0;
  let meaningful = 0;
  let chat = 0;
  let dealView = 0;
  let invest = 0;
  let returning = 0;

  for (const s of sessions) {
    const v = s.stepsVisited;
    if (v.length <= 1) bounce++;
    if (v.includes('form_submitted')) lead++;
    if (v.includes('auth_signup')) signup++;
    if (v.includes('app_opened')) handoff++;
    if (v.length >= 3) meaningful++;
    if (v.includes('chat_entry')) chat++;
    if (v.includes('deal_browse') || v.includes('deal_detail')) dealView++;
    if (v.includes('invest_flow')) invest++;
    if (v.includes('portfolio_view') || v.includes('retained')) returning++;
  }

  return {
    bounceRate: computeRate(bounce, total),
    leadConversion: computeRate(lead, total),
    signupConversion: computeRate(signup, total),
    appHandoffSuccess: computeRate(handoff, total),
    firstMeaningfulAction: computeRate(meaningful, total),
    chatOpenRate: computeRate(chat, total),
    dealViewRate: computeRate(dealView, total),
    investInitRate: computeRate(invest, total),
    returnRate: computeRate(returning, total),
  };
}

function computeFrictions(sourceId: TrafficSourceId): TrafficFriction[] {
  const sessions = trafficAttribution.getSessionsBySource(sourceId, WINDOW_1H);
  const frictionCounts = new Map<FrictionType, number>();

  for (const s of sessions) {
    for (const f of s.frictions) {
      frictionCounts.set(f, (frictionCounts.get(f) || 0) + 1);
    }
  }

  const total = sessions.length;
  const frictions: TrafficFriction[] = [];
  for (const [type, count] of frictionCounts) {
    const rate = total > 0 ? count / total : 0;
    let severity: TrafficFriction['severity'] = 'low';
    if (rate > 0.5) severity = 'critical';
    else if (rate > 0.25) severity = 'high';
    else if (rate > 0.1) severity = 'medium';

    frictions.push({ type, count, severity, affectedUsers: count });
  }

  return frictions.sort((a, b) => b.count - a.count);
}

function computeHealthState(
  outcomes: TrafficOutcome,
  frictions: TrafficFriction[],
  activeNow: number,
): TrafficSourceSnapshot['healthState'] {
  const hasCritical = frictions.some(f => f.severity === 'critical');
  const hasHigh = frictions.some(f => f.severity === 'high');

  if (hasCritical && activeNow > 0) return 'blocked';
  if (hasHigh) return 'degraded';
  if (frictions.length > 0) return 'friction';
  if (outcomes.bounceRate > 80) return 'friction';
  return 'healthy';
}

function computeQualityScore(outcomes: TrafficOutcome, activeNow: number): number {
  if (activeNow === 0) return 0;

  const weights = {
    leadConversion: 0.15,
    signupConversion: 0.2,
    appHandoffSuccess: 0.15,
    firstMeaningfulAction: 0.1,
    dealViewRate: 0.15,
    investInitRate: 0.15,
    returnRate: 0.1,
  };

  let score = 0;
  score += Math.min(100, outcomes.leadConversion) * weights.leadConversion;
  score += Math.min(100, outcomes.signupConversion) * weights.signupConversion;
  score += Math.min(100, outcomes.appHandoffSuccess) * weights.appHandoffSuccess;
  score += Math.min(100, outcomes.firstMeaningfulAction) * weights.firstMeaningfulAction;
  score += Math.min(100, outcomes.dealViewRate) * weights.dealViewRate;
  score += Math.min(100, outcomes.investInitRate) * weights.investInitRate;
  score += Math.min(100, outcomes.returnRate) * weights.returnRate;

  const bounceP = Math.max(0, 1 - outcomes.bounceRate / 100);
  score *= bounceP;

  return Math.round(Math.min(100, Math.max(0, score)));
}

function computeBusinessOutcomeScore(outcomes: TrafficOutcome, qualityScore: number): number {
  const investWeight = outcomes.investInitRate * 3;
  const dealWeight = outcomes.dealViewRate * 1.5;
  const signupWeight = outcomes.signupConversion * 2;
  const raw = (investWeight + dealWeight + signupWeight + qualityScore) / 4;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

function buildConnections(sources: TrafficSourceSnapshot[]): TrafficNodeConnection[] {
  const connections: TrafficNodeConnection[] = [];

  for (const source of sources) {
    if (source.activeNow === 0 && source.last1h === 0) continue;

    const volume = source.last1h;
    const meta = TRAFFIC_SOURCE_META[source.sourceId];
    const healthColor = source.healthState === 'healthy' ? '#00E676'
      : source.healthState === 'friction' ? '#FFB300'
      : source.healthState === 'degraded' ? '#FF6D00'
      : '#FF1744';

    connections.push({
      fromSourceId: source.sourceId,
      toModuleId: 'landing',
      volume,
      healthColor,
    });

    const steps = source.journeySteps;
    if ((steps.auth_signup ?? 0) > 0) {
      connections.push({
        fromSourceId: source.sourceId,
        toModuleId: 'auth',
        volume: steps.auth_signup ?? 0,
        healthColor,
      });
    }
    if ((steps.app_opened ?? 0) > 0) {
      connections.push({
        fromSourceId: source.sourceId,
        toModuleId: 'app',
        volume: steps.app_opened ?? 0,
        healthColor,
      });
    }
    if ((steps.invest_flow ?? 0) > 0) {
      connections.push({
        fromSourceId: source.sourceId,
        toModuleId: 'invest',
        volume: steps.invest_flow ?? 0,
        healthColor,
      });
    }
    if ((steps.chat_entry ?? 0) > 0) {
      connections.push({
        fromSourceId: source.sourceId,
        toModuleId: 'chat',
        volume: steps.chat_entry ?? 0,
        healthColor,
      });
    }
    if ((steps.portfolio_view ?? 0) > 0) {
      connections.push({
        fromSourceId: source.sourceId,
        toModuleId: 'portfolio',
        volume: steps.portfolio_view ?? 0,
        healthColor,
      });
    }
  }

  return connections;
}

export function computeTrafficIntelSnapshot(): TrafficIntelSnapshot {
  const sources: TrafficSourceSnapshot[] = ALL_TRAFFIC_SOURCES.map(sourceId => {
    const activeNow = countSessionsByWindow(sourceId, WINDOW_5M);
    const last5m = activeNow;
    const last1h = countSessionsByWindow(sourceId, WINDOW_1H);
    const last24h = countSessionsByWindow(sourceId, WINDOW_24H);

    const journeySteps = computeJourneySteps(sourceId);
    const intents = computeIntentDistribution(sourceId);
    const topIntent = getTopIntent(intents);
    const outcomes = computeOutcomes(sourceId);
    const frictions = computeFrictions(sourceId);
    const healthState = computeHealthState(outcomes, frictions, activeNow);
    const qualityScore = computeQualityScore(outcomes, last1h);
    const businessOutcomeScore = computeBusinessOutcomeScore(outcomes, qualityScore);

    const totalVisits = last1h || 1;
    const ctaClicks = journeySteps.cta_clicked ?? 0;
    const signups = journeySteps.auth_signup ?? 0;
    const appOpens = journeySteps.app_opened ?? 0;

    return {
      sourceId,
      activeNow,
      last5m,
      last1h,
      last24h,
      ctaClickRate: computeRate(ctaClicks, totalVisits),
      signupRate: computeRate(signups, totalVisits),
      appOpenRate: computeRate(appOpens, totalVisits),
      qualityScore,
      affectedByIncident: 0,
      journeySteps,
      intents,
      topIntent,
      outcomes,
      frictions,
      healthState,
      businessOutcomeScore,
    };
  });

  const connections = buildConnections(sources);

  const totalVisitors = sources.reduce((s, src) => s + src.activeNow, 0);
  const totalAuth = sources.reduce((s, src) => {
    const authSessions = trafficAttribution.getSessionsBySource(src.sourceId, WINDOW_5M)
      .filter(sess => sess.stepsVisited.includes('auth_signup'));
    return s + authSessions.length;
  }, 0);

  const activeSources = sources.filter(s => s.last1h > 0);
  const topSource = activeSources.length > 0
    ? activeSources.sort((a, b) => b.last1h - a.last1h)[0]!.sourceId
    : 'direct' as TrafficSourceId;

  const allIntents: Partial<Record<UserIntent, number>> = {};
  for (const src of sources) {
    for (const [intent, count] of Object.entries(src.intents)) {
      allIntents[intent as UserIntent] = (allIntents[intent as UserIntent] || 0) + (count ?? 0);
    }
  }
  const topIntent = getTopIntent(allIntents);

  const overallQuality = activeSources.length > 0
    ? Math.round(activeSources.reduce((s, src) => s + src.qualityScore, 0) / activeSources.length)
    : 0;

  return {
    sources,
    connections,
    predictions: [],
    totalVisitors,
    totalAuthenticated: totalAuth,
    totalAnonymous: Math.max(0, totalVisitors - totalAuth),
    topSource,
    topIntent,
    overallQualityScore: overallQuality,
    lastUpdated: new Date().toISOString(),
  };
}

export function ingestLandingEvent(
  sessionId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): void {
  const referrer = metadata?.referrer as string | undefined;
  const utmSource = metadata?.utm_source as string | undefined
    ?? metadata?.utmSource as string | undefined;
  const utmMedium = metadata?.utm_medium as string | undefined
    ?? metadata?.utmMedium as string | undefined;
  const utmCampaign = metadata?.utm_campaign as string | undefined
    ?? metadata?.utmCampaign as string | undefined;
  const campaignId = metadata?.campaign_id as string | undefined
    ?? metadata?.campaignId as string | undefined;
  const deepLinkSource = metadata?.deep_link_source as string | undefined
    ?? metadata?.deepLinkSource as string | undefined;
  const userAgent = metadata?.userAgent as string | undefined;

  trafficAttribution.trackSession({
    sessionId,
    utmSource,
    utmMedium,
    utmCampaign,
    referrer,
    campaignId,
    deepLinkSource,
    userAgent,
    metadata,
  });

  const stepMap: Record<string, JourneyStep> = {
    page_view: 'landing_visit',
    landing_visit: 'landing_visit',
    section_view: 'section_viewed',
    cta_click: 'cta_clicked',
    form_focus: 'form_started',
    form_submit: 'form_submitted',
    api_call: 'api_call',
    supabase_write: 'supabase_write',
    signup: 'auth_signup',
    auth_signup: 'auth_signup',
    app_open: 'app_opened',
    enter_module: 'first_module',
    deal_view: 'deal_browse',
    deal_detail: 'deal_detail',
    chat_open: 'chat_entry',
    invest_start: 'invest_flow',
    portfolio_view: 'portfolio_view',
  };

  const step = stepMap[eventType];
  if (step) {
    trafficAttribution.updateStep(sessionId, step, metadata);
  }

  const frictionMap: Record<string, FrictionType> = {
    slow_response: 'slow_landing',
    cta_error: 'broken_cta',
    form_error: 'failed_form',
    auth_error: 'auth_failure',
    handoff_error: 'handoff_failure',
    api_error: 'api_failure',
    chat_error: 'chat_degradation',
    upload_error: 'upload_failure',
    invest_error: 'invest_stall',
  };

  const frictionType = frictionMap[eventType];
  if (frictionType) {
    trafficAttribution.recordFriction(sessionId, frictionType);
  }
}
