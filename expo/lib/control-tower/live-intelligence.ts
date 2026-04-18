import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { presenceManager } from '@/lib/realtime-presence';
import type { CTModuleId } from './types';

export type IntelligenceEventName =
  | 'page_view'
  | 'module_view'
  | 'tab_switch'
  | 'session_start'
  | 'session_end'
  | 'cta_click'
  | 'deal_view'
  | 'invest_click'
  | 'invest_start'
  | 'invest_complete'
  | 'form_start'
  | 'form_submit'
  | 'chat_open'
  | 'chat_message'
  | 'referral_open'
  | 'source_capture'
  | 'error_seen'
  | 'fallback_used'
  | 'routing_selected'
  | 'auth_state_change'
  | 'investor_profile_update';

export interface AttributionPayload {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  deepLinkSource?: string;
  referralCode?: string;
  landingPage?: string;
  firstTouchSource?: string;
  lastTouchSource?: string;
  campaignId?: string;
}

export interface IntelligenceEvent {
  id: string;
  eventName: IntelligenceEventName;
  timestamp: string;
  userId: string | null;
  anonId: string;
  sessionId: string;
  module: CTModuleId | 'landing' | 'unknown';
  screen: string;
  platform: string;
  country: string | null;
  region: string | null;
  environment: 'dev' | 'prod';
  attribution: AttributionPayload;
  metadata: Record<string, unknown>;
}

export interface UserBehaviorProfile {
  id: string;
  userId: string | null;
  anonId: string;
  sessionHistory: string[];
  sourceHistory: string[];
  modulesVisited: string[];
  timeSpentPerModule: Record<string, number>;
  clicks: number;
  actions: number;
  dealsViewed: string[];
  investmentsStarted: number;
  investmentsCompleted: number;
  avgTimeToInvestMs: number | null;
  recencyScore: number;
  frequencyScore: number;
  intentScore: number;
  predictedConversionScore: number;
  predictedInvestorInterestCategory: string;
  preferredTicketSize: string;
  likelyRiskAppetite: string;
  chatQuestions: string[];
  roiSignals: string[];
  firstSource: string;
  lastSource: string;
  lastSeenAt: string;
}

export interface ModuleLiveMetric {
  moduleId: string;
  activeUsers: number;
  sessionsInProgress: number;
  entrySourceCounts: Record<string, number>;
  clicks: number;
  activityDepth: number;
  ctaActions: number;
  conversionsStarted: number;
  conversionsCompleted: number;
  dropOffs: number;
  lastEventTimestamp: string | null;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  confidenceScore: number;
}

export interface SourceLiveMetric {
  source: string;
  activeUsers: number;
  totalSessions: number;
  conversions: number;
  qualityScore: number;
  dropOffRate: number;
  investorQualityScore: number;
  lowIntentRate: number;
}

export interface FunnelLiveMetric {
  step: string;
  count: number;
  conversionRate: number;
  dropRate: number;
  sourceBreakdown: Record<string, number>;
  affectedCohorts: string[];
  reason: string | null;
  impactedModules: string[];
  lastSignificantChange: string | null;
}

export interface OperatorLiveMetric {
  waitingUsers: number;
  stuckUsers: number;
  failedConversations: number;
  fallbackTransportState: 'healthy' | 'degraded' | 'critical';
  ownerHandoffHealth: 'healthy' | 'degraded' | 'critical';
}

export interface LiveIntelligenceSnapshot {
  asOf: string;
  totalLiveUsers: number;
  moduleMetrics: ModuleLiveMetric[];
  sourceMetrics: SourceLiveMetric[];
  funnelMetrics: FunnelLiveMetric[];
  topProfiles: UserBehaviorProfile[];
  stalledProfiles: UserBehaviorProfile[];
  likelyToInvestProfiles: UserBehaviorProfile[];
  operator: OperatorLiveMetric;
}

type Listener = (snapshot: LiveIntelligenceSnapshot) => void;

interface SessionRecord {
  sessionId: string;
  userId: string | null;
  anonId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSource: string;
  lastSource: string;
  currentModule: string;
  landingPage: string;
  attribution: AttributionPayload;
  events: IntelligenceEvent[];
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS = 3000;
const FLUSH_INTERVAL_MS = 15000;
const MAX_REMOTE_BATCH = 50;

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getEnv(): 'dev' | 'prod' {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'dev' : 'prod';
}

function normalizeSource(attribution: AttributionPayload): string {
  return attribution.lastTouchSource ?? attribution.firstTouchSource ?? attribution.utmSource ?? attribution.deepLinkSource ?? attribution.referrer ?? 'direct';
}

function inferModule(screen: string, metadata: Record<string, unknown>): CTModuleId | 'landing' | 'unknown' {
  const value = `${screen} ${String(metadata.module ?? '')}`.toLowerCase();
  if (value.includes('landing')) return 'landing';
  if (value.includes('invest flow')) return 'user_invest_flow';
  if (value.includes('publish')) return 'admin_publish_deal';
  if (value.includes('admin')) return 'admin_dashboard';
  if (value.includes('analytics')) return 'analytics';
  if (value.includes('portfolio')) return 'portfolio';
  if (value.includes('market')) return 'market';
  if (value.includes('chat')) return 'chat';
  if (value.includes('setting')) return 'settings';
  if (value.includes('email')) return 'email';
  if (value.includes('home') || value.includes('index')) return 'home';
  if (value.includes('deal') || value.includes('invest')) return 'invest';
  return 'unknown';
}

function scoreIntent(profile: UserBehaviorProfile): number {
  const base = Math.min(100, profile.clicks * 2 + profile.actions * 3 + profile.dealsViewed.length * 8 + profile.investmentsStarted * 18 + profile.investmentsCompleted * 24 + profile.chatQuestions.length * 4);
  return Math.max(base, profile.investmentsCompleted > 0 ? 92 : base);
}

function scoreConversion(profile: UserBehaviorProfile): number {
  const score = profile.intentScore * 0.45
    + Math.min(100, profile.recencyScore * 0.2 + profile.frequencyScore * 0.2)
    + profile.investmentsStarted * 6
    + profile.investmentsCompleted * 12;
  return Math.round(Math.min(100, score));
}

function inferInterest(profile: UserBehaviorProfile): string {
  if (profile.dealsViewed.length >= 4 || profile.investmentsStarted > 0) return 'deal_evaluation';
  if (profile.chatQuestions.some((item) => item.toLowerCase().includes('return') || item.toLowerCase().includes('roi'))) return 'yield_focused';
  if (profile.modulesVisited.includes('portfolio')) return 'portfolio_management';
  return 'discovery';
}

function inferTicket(profile: UserBehaviorProfile): string {
  const ranges = profile.roiSignals.join(' ').toLowerCase();
  if (ranges.includes('100k') || ranges.includes('250k')) return '$100k+';
  if (ranges.includes('50k')) return '$50k-$100k';
  if (profile.investmentsCompleted > 0 || profile.investmentsStarted > 1) return '$25k-$100k';
  return '$5k-$25k';
}

function inferRisk(profile: UserBehaviorProfile): string {
  if (profile.chatQuestions.some((item) => item.toLowerCase().includes('downside') || item.toLowerCase().includes('risk'))) return 'conservative';
  if (profile.investmentsStarted > 1 || profile.modulesVisited.includes('market')) return 'balanced';
  return 'moderate';
}

async function tryInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!isSupabaseConfigured() || rows.length === 0) {
    return;
  }

  try {
    const result = await supabase.from(table).insert(rows);
    if (result.error) {
      console.log('[LiveIntel] Insert skipped for table:', table, '|', result.error.message);
    }
  } catch (error) {
    console.log('[LiveIntel] Insert exception for table:', table, '|', (error as Error)?.message);
  }
}

async function tryUpsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  if (!isSupabaseConfigured() || rows.length === 0) {
    return;
  }

  try {
    const result = await supabase.from(table).upsert(rows, { onConflict });
    if (result.error) {
      console.log('[LiveIntel] Upsert skipped for table:', table, '|', result.error.message);
    }
  } catch (error) {
    console.log('[LiveIntel] Upsert exception for table:', table, '|', (error as Error)?.message);
  }
}

function buildSourceCaptureEvent(session: SessionRecord, event: IntelligenceEvent): IntelligenceEvent | null {
  const source = normalizeSource(event.attribution);
  const hasAttribution = !!(
    event.attribution.utmSource
    || event.attribution.utmCampaign
    || event.attribution.referrer
    || event.attribution.deepLinkSource
    || event.attribution.referralCode
    || source !== 'direct'
  );

  if (!hasAttribution) {
    return null;
  }

  return {
    ...event,
    id: generateId('evt'),
    eventName: 'source_capture',
    metadata: {
      ...event.metadata,
      capturedSource: source,
      landingPage: session.landingPage,
    },
  };
}

class LiveIntelligenceService {
  private listeners = new Set<Listener>();
  private events: IntelligenceEvent[] = [];
  private sessions = new Map<string, SessionRecord>();
  private profiles = new Map<string, UserBehaviorProfile>();
  private pendingEvents: IntelligenceEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: LiveIntelligenceSnapshot | null = null;

  start(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    console.log('[LiveIntel] Started live intelligence service');
  }

  subscribe(listener: Listener): () => void {
    this.start();
    this.listeners.add(listener);
    if (this.lastSnapshot) {
      listener(this.lastSnapshot);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  captureEvent(input: {
    eventName: IntelligenceEventName;
    screen: string;
    module?: CTModuleId | 'landing' | 'unknown';
    userId?: string | null;
    sessionId?: string;
    anonId?: string;
    attribution?: AttributionPayload;
    country?: string | null;
    region?: string | null;
    metadata?: Record<string, unknown>;
  }): IntelligenceEvent {
    this.start();
    const metadata = input.metadata ?? {};
    const sessionId = input.sessionId ?? generateId('session');
    const anonId = input.anonId ?? sessionId;
    const mergedAttribution: AttributionPayload = {
      ...this.sessions.get(sessionId)?.attribution,
      ...input.attribution,
    };
    const module = input.module ?? inferModule(input.screen, metadata);
    const event: IntelligenceEvent = {
      id: generateId('evt'),
      eventName: input.eventName,
      timestamp: nowIso(),
      userId: input.userId ?? null,
      anonId,
      sessionId,
      module,
      screen: input.screen,
      platform: Platform.OS,
      country: input.country ?? null,
      region: input.region ?? null,
      environment: getEnv(),
      attribution: mergedAttribution,
      metadata,
    };

    this.events.push(event);
    this.pendingEvents.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    const existingSession = this.sessions.get(sessionId);
    const currentSource = normalizeSource(mergedAttribution);
    const session: SessionRecord = existingSession ?? {
      sessionId,
      userId: input.userId ?? null,
      anonId,
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
      firstSource: currentSource,
      lastSource: currentSource,
      currentModule: module,
      landingPage: mergedAttribution.landingPage ?? input.screen,
      attribution: mergedAttribution,
      events: [],
    };
    session.userId = input.userId ?? session.userId;
    session.lastSeenAt = event.timestamp;
    session.currentModule = module;
    session.lastSource = currentSource;
    session.attribution = mergedAttribution;
    session.events.push(event);
    this.sessions.set(sessionId, session);

    if (input.eventName === 'page_view' || input.eventName === 'session_start') {
      const sourceCaptureEvent = buildSourceCaptureEvent(session, event);
      if (sourceCaptureEvent) {
        this.events.push(sourceCaptureEvent);
        this.pendingEvents.push(sourceCaptureEvent);
        if (this.events.length > MAX_EVENTS) {
          this.events = this.events.slice(-MAX_EVENTS);
        }
      }
    }

    const profileKey = session.userId ?? anonId;
    const existingProfile = this.profiles.get(profileKey);
    const profile: UserBehaviorProfile = existingProfile ?? {
      id: profileKey,
      userId: session.userId,
      anonId,
      sessionHistory: [],
      sourceHistory: [],
      modulesVisited: [],
      timeSpentPerModule: {},
      clicks: 0,
      actions: 0,
      dealsViewed: [],
      investmentsStarted: 0,
      investmentsCompleted: 0,
      avgTimeToInvestMs: null,
      recencyScore: 0,
      frequencyScore: 0,
      intentScore: 0,
      predictedConversionScore: 0,
      predictedInvestorInterestCategory: 'discovery',
      preferredTicketSize: '$5k-$25k',
      likelyRiskAppetite: 'moderate',
      chatQuestions: [],
      roiSignals: [],
      firstSource: session.firstSource,
      lastSource: session.lastSource,
      lastSeenAt: event.timestamp,
    };

    if (!profile.sessionHistory.includes(sessionId)) {
      profile.sessionHistory.push(sessionId);
    }
    if (!profile.sourceHistory.includes(currentSource)) {
      profile.sourceHistory.push(currentSource);
    }
    if (!profile.modulesVisited.includes(module)) {
      profile.modulesVisited.push(module);
    }
    profile.timeSpentPerModule[module] = (profile.timeSpentPerModule[module] ?? 0) + 8;
    profile.lastSeenAt = event.timestamp;
    profile.lastSource = currentSource;
    if (input.eventName.includes('click')) {
      profile.clicks += 1;
    }
    if (input.eventName !== 'page_view' && input.eventName !== 'module_view') {
      profile.actions += 1;
    }
    const dealId = typeof metadata.dealId === 'string' ? metadata.dealId : null;
    if (dealId && !profile.dealsViewed.includes(dealId)) {
      profile.dealsViewed.push(dealId);
    }
    if (input.eventName === 'invest_start') {
      profile.investmentsStarted += 1;
    }
    if (input.eventName === 'invest_complete') {
      profile.investmentsCompleted += 1;
      const firstInvestStart = session.events.find((item) => item.eventName === 'invest_start');
      if (firstInvestStart) {
        const diff = new Date(event.timestamp).getTime() - new Date(firstInvestStart.timestamp).getTime();
        profile.avgTimeToInvestMs = profile.avgTimeToInvestMs === null ? diff : Math.round((profile.avgTimeToInvestMs + diff) / 2);
      }
    }
    if (input.eventName === 'chat_message' && typeof metadata.message === 'string') {
      profile.chatQuestions = [...profile.chatQuestions, metadata.message].slice(-8);
      if (/roi|return|yield|cash flow|upside/i.test(metadata.message)) {
        profile.roiSignals = [...profile.roiSignals, metadata.message].slice(-8);
      }
    }
    profile.recencyScore = Math.max(1, 100 - Math.floor((Date.now() - new Date(profile.lastSeenAt).getTime()) / 60000) * 5);
    profile.frequencyScore = Math.min(100, profile.sessionHistory.length * 18 + profile.modulesVisited.length * 7);
    profile.intentScore = scoreIntent(profile);
    profile.predictedConversionScore = scoreConversion(profile);
    profile.predictedInvestorInterestCategory = inferInterest(profile);
    profile.preferredTicketSize = inferTicket(profile);
    profile.likelyRiskAppetite = inferRisk(profile);
    this.profiles.set(profileKey, profile);

    this.publish();
    return event;
  }

  getSnapshot(): LiveIntelligenceSnapshot {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter((session) => now - new Date(session.lastSeenAt).getTime() <= ACTIVE_WINDOW_MS);
    const activeSessionIds = new Set(activeSessions.map((item) => item.sessionId));
    const activeEvents = this.events.filter((item) => activeSessionIds.has(item.sessionId));
    const activeProfiles = Array.from(this.profiles.values()).filter((item) => now - new Date(item.lastSeenAt).getTime() <= ACTIVE_WINDOW_MS);
    const moduleMap = new Map<string, ModuleLiveMetric>();
    const sourceMap = new Map<string, SourceLiveMetric>();

    for (const event of activeEvents) {
      const source = normalizeSource(event.attribution);
      const moduleMetric = moduleMap.get(event.module) ?? {
        moduleId: event.module,
        activeUsers: 0,
        sessionsInProgress: 0,
        entrySourceCounts: {},
        clicks: 0,
        activityDepth: 0,
        ctaActions: 0,
        conversionsStarted: 0,
        conversionsCompleted: 0,
        dropOffs: 0,
        lastEventTimestamp: null,
        healthStatus: 'healthy',
        confidenceScore: 0.92,
      };
      moduleMetric.entrySourceCounts[source] = (moduleMetric.entrySourceCounts[source] ?? 0) + 1;
      moduleMetric.activityDepth += 1;
      moduleMetric.lastEventTimestamp = event.timestamp;
      if (event.eventName.includes('click')) {
        moduleMetric.clicks += 1;
      }
      if (event.eventName === 'cta_click') {
        moduleMetric.ctaActions += 1;
      }
      if (event.eventName === 'invest_start' || event.eventName === 'form_start') {
        moduleMetric.conversionsStarted += 1;
      }
      if (event.eventName === 'invest_complete' || event.eventName === 'form_submit') {
        moduleMetric.conversionsCompleted += 1;
      }
      if (event.eventName === 'error_seen' || event.eventName === 'fallback_used') {
        moduleMetric.dropOffs += 1;
      }
      moduleMap.set(event.module, moduleMetric);

      const sourceMetric = sourceMap.get(source) ?? {
        source,
        activeUsers: 0,
        totalSessions: 0,
        conversions: 0,
        qualityScore: 0,
        dropOffRate: 0,
        investorQualityScore: 0,
        lowIntentRate: 0,
      };
      if (event.eventName === 'invest_complete' || event.eventName === 'form_submit') {
        sourceMetric.conversions += 1;
      }
      sourceMap.set(source, sourceMetric);
    }

    for (const session of activeSessions) {
      const moduleMetric = moduleMap.get(session.currentModule) ?? {
        moduleId: session.currentModule,
        activeUsers: 0,
        sessionsInProgress: 0,
        entrySourceCounts: {},
        clicks: 0,
        activityDepth: 0,
        ctaActions: 0,
        conversionsStarted: 0,
        conversionsCompleted: 0,
        dropOffs: 0,
        lastEventTimestamp: session.lastSeenAt,
        healthStatus: 'healthy',
        confidenceScore: 0.78,
      };
      moduleMetric.activeUsers += 1;
      moduleMetric.sessionsInProgress += 1;
      moduleMap.set(session.currentModule, moduleMetric);

      const sourceMetric = sourceMap.get(session.lastSource) ?? {
        source: session.lastSource,
        activeUsers: 0,
        totalSessions: 0,
        conversions: 0,
        qualityScore: 0,
        dropOffRate: 0,
        investorQualityScore: 0,
        lowIntentRate: 0,
      };
      sourceMetric.activeUsers += 1;
      sourceMetric.totalSessions += 1;
      sourceMap.set(session.lastSource, sourceMetric);
    }

    for (const metric of moduleMap.values()) {
      const totalEntries = Object.values(metric.entrySourceCounts).reduce((sum, value) => sum + value, 0);
      const completionRate = totalEntries > 0 ? metric.conversionsCompleted / totalEntries : 1;
      metric.healthStatus = completionRate < 0.08 || metric.dropOffs > metric.conversionsCompleted ? 'critical' : completionRate < 0.18 ? 'degraded' : 'healthy';
      metric.confidenceScore = Math.max(0.52, Math.min(0.98, 0.65 + totalEntries / 200));
    }

    const sourceProfiles = new Map<string, UserBehaviorProfile[]>();
    for (const profile of activeProfiles) {
      const source = profile.lastSource || 'direct';
      sourceProfiles.set(source, [...(sourceProfiles.get(source) ?? []), profile]);
    }
    for (const [source, metric] of sourceMap.entries()) {
      const profiles = sourceProfiles.get(source) ?? [];
      const investors = profiles.filter((item) => item.investmentsStarted > 0 || item.investmentsCompleted > 0);
      const conversions = metric.totalSessions > 0 ? metric.conversions / metric.totalSessions : 0;
      const lowIntent = profiles.filter((item) => item.intentScore < 35).length;
      metric.qualityScore = Math.round(Math.min(100, conversions * 100 + investors.length * 8 + profiles.reduce((sum, item) => sum + item.predictedConversionScore, 0) / Math.max(1, profiles.length) * 0.35));
      metric.investorQualityScore = Math.round(Math.min(100, investors.reduce((sum, item) => sum + item.predictedConversionScore, 0) / Math.max(1, investors.length || 1)));
      metric.dropOffRate = Math.round(Math.max(0, 100 - conversions * 100));
      metric.lowIntentRate = Math.round((lowIntent / Math.max(1, profiles.length)) * 100);
      sourceMap.set(source, metric);
    }

    const funnelMetrics: FunnelLiveMetric[] = [
      { step: 'Source', count: activeSessions.length, conversionRate: 100, dropRate: 0, sourceBreakdown: Object.fromEntries(Array.from(sourceMap.values()).map((item) => [item.source, item.totalSessions])), affectedCohorts: ['all'], reason: null, impactedModules: ['landing'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'Landing Page', count: activeEvents.filter((item) => item.eventName === 'page_view').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'page_view').length / Math.max(1, activeSessions.length)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['new_visitors'], reason: null, impactedModules: ['landing'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'CTA', count: activeEvents.filter((item) => item.eventName === 'cta_click').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'cta_click').length / Math.max(1, activeEvents.filter((item) => item.eventName === 'page_view').length)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['engaged'], reason: null, impactedModules: ['landing', 'home'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'Form Start', count: activeEvents.filter((item) => item.eventName === 'form_start').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'form_start').length / Math.max(1, activeEvents.filter((item) => item.eventName === 'cta_click').length)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['qualified'], reason: null, impactedModules: ['landing', 'profile'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'Qualification', count: activeEvents.filter((item) => item.eventName === 'form_submit').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'form_submit').length / Math.max(1, activeEvents.filter((item) => item.eventName === 'form_start').length)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['qualified'], reason: null, impactedModules: ['profile', 'invest'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'Deal View', count: activeEvents.filter((item) => item.eventName === 'deal_view').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'deal_view').length / Math.max(1, activeEvents.filter((item) => item.eventName === 'form_submit').length || 1)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['deal_intent'], reason: null, impactedModules: ['market', 'invest'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'Investment Start', count: activeEvents.filter((item) => item.eventName === 'invest_start').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'invest_start').length / Math.max(1, activeEvents.filter((item) => item.eventName === 'deal_view').length || 1)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['invest_intent'], reason: null, impactedModules: ['invest', 'user_invest_flow'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
      { step: 'Investment Complete', count: activeEvents.filter((item) => item.eventName === 'invest_complete').length, conversionRate: Math.round((activeEvents.filter((item) => item.eventName === 'invest_complete').length / Math.max(1, activeEvents.filter((item) => item.eventName === 'invest_start').length || 1)) * 100), dropRate: 0, sourceBreakdown: {}, affectedCohorts: ['completed'], reason: null, impactedModules: ['invest', 'portfolio'], lastSignificantChange: activeEvents.at(-1)?.timestamp ?? null },
    ].map((item, index, all) => {
      if (index === 0) {
        return item;
      }
      const prev = all[index - 1]?.count ?? item.count;
      return {
        ...item,
        dropRate: prev > 0 ? Math.max(0, Math.round(((prev - item.count) / prev) * 100)) : 0,
        reason: prev > item.count && item.count === 0 ? 'No live movement observed at this step yet.' : prev > item.count && item.step.includes('Investment') ? 'Invest flow friction or qualification gap detected.' : null,
      };
    });

    const stalledProfiles = activeProfiles.filter((item) => item.investmentsStarted > item.investmentsCompleted || item.intentScore >= 60).sort((a, b) => b.intentScore - a.intentScore).slice(0, 5);
    const likelyToInvestProfiles = activeProfiles.filter((item) => item.predictedConversionScore >= 65).sort((a, b) => b.predictedConversionScore - a.predictedConversionScore).slice(0, 5);
    const presence = presenceManager.getState();
    const snapshot: LiveIntelligenceSnapshot = {
      asOf: nowIso(),
      totalLiveUsers: Math.max(activeSessions.length, presence.totalOnline),
      moduleMetrics: Array.from(moduleMap.values()).sort((a, b) => b.activeUsers - a.activeUsers),
      sourceMetrics: Array.from(sourceMap.values()).sort((a, b) => b.qualityScore - a.qualityScore),
      funnelMetrics,
      topProfiles: activeProfiles.sort((a, b) => b.intentScore - a.intentScore).slice(0, 8),
      stalledProfiles,
      likelyToInvestProfiles,
      operator: {
        waitingUsers: activeProfiles.filter((item) => item.modulesVisited.includes('chat') && item.chatQuestions.length === 0).length,
        stuckUsers: stalledProfiles.length,
        failedConversations: activeEvents.filter((item) => item.eventName === 'fallback_used' || item.eventName === 'error_seen').length,
        fallbackTransportState: activeEvents.some((item) => item.eventName === 'fallback_used') ? 'degraded' : 'healthy',
        ownerHandoffHealth: activeEvents.some((item) => item.eventName === 'error_seen') ? 'degraded' : 'healthy',
      },
    };

    return snapshot;
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    this.lastSnapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private async flush(): Promise<void> {
    if (this.pendingEvents.length === 0) {
      return;
    }

    const batch = this.pendingEvents.splice(0, MAX_REMOTE_BATCH);
    const sessionRows = batch.map((event) => ({
      session_id: event.sessionId,
      user_id: event.userId,
      anon_id: event.anonId,
      first_source: event.attribution.firstTouchSource ?? normalizeSource(event.attribution),
      last_source: event.attribution.lastTouchSource ?? normalizeSource(event.attribution),
      landing_page: event.attribution.landingPage ?? event.screen,
      current_module: event.module,
      platform: event.platform,
      country: event.country,
      region: event.region,
      last_seen_at: event.timestamp,
      metadata: event.metadata,
    }));
    const eventRows = batch.map((event) => ({
      event_name: event.eventName,
      occurred_at: event.timestamp,
      user_id: event.userId,
      anon_id: event.anonId,
      session_id: event.sessionId,
      module_name: event.module,
      screen_name: event.screen,
      platform: event.platform,
      country: event.country,
      region: event.region,
      environment: event.environment,
      attribution: event.attribution,
      metadata: event.metadata,
    }));
    const touchRows = batch.filter((event) => event.eventName === 'source_capture' || event.eventName === 'page_view').map((event) => ({
      session_id: event.sessionId,
      user_id: event.userId,
      anon_id: event.anonId,
      touch_type: event.eventName === 'source_capture' ? 'capture' : 'view',
      source_name: normalizeSource(event.attribution),
      utm_source: event.attribution.utmSource,
      utm_medium: event.attribution.utmMedium,
      utm_campaign: event.attribution.utmCampaign,
      utm_content: event.attribution.utmContent,
      utm_term: event.attribution.utmTerm,
      referrer: event.attribution.referrer,
      deep_link_source: event.attribution.deepLinkSource,
      referral_code: event.attribution.referralCode,
      landing_page: event.attribution.landingPage,
      is_first_touch: event.attribution.firstTouchSource === normalizeSource(event.attribution),
      is_last_touch: true,
      touched_at: event.timestamp,
    }));
    const snapshot = this.getSnapshot();
    const profileRows = snapshot.topProfiles.map((profile) => ({
      profile_key: profile.id,
      user_id: profile.userId,
      anon_id: profile.anonId,
      first_source: profile.firstSource,
      last_source: profile.lastSource,
      modules_visited: profile.modulesVisited,
      time_spent_per_module: profile.timeSpentPerModule,
      clicks: profile.clicks,
      actions: profile.actions,
      deals_viewed: profile.dealsViewed,
      investments_started: profile.investmentsStarted,
      investments_completed: profile.investmentsCompleted,
      avg_time_to_invest_ms: profile.avgTimeToInvestMs,
      recency_score: profile.recencyScore,
      frequency_score: profile.frequencyScore,
      intent_score: profile.intentScore,
      predicted_conversion_score: profile.predictedConversionScore,
      investor_interest_category: profile.predictedInvestorInterestCategory,
      preferred_ticket_size: profile.preferredTicketSize,
      likely_risk_appetite: profile.likelyRiskAppetite,
      chat_questions: profile.chatQuestions,
      roi_signals: profile.roiSignals,
      last_seen_at: profile.lastSeenAt,
    }));
    const investorRows = snapshot.topProfiles.filter((profile) => profile.investmentsStarted > 0 || profile.investmentsCompleted > 0 || profile.intentScore >= 60).map((profile) => ({
      profile_key: profile.id,
      user_id: profile.userId,
      anon_id: profile.anonId,
      intent_score: profile.intentScore,
      readiness_score: profile.predictedConversionScore,
      interest_category: profile.predictedInvestorInterestCategory,
      preferred_ticket_size: profile.preferredTicketSize,
      likely_risk_appetite: profile.likelyRiskAppetite,
      avg_time_to_invest_ms: profile.avgTimeToInvestMs,
      investments_started: profile.investmentsStarted,
      investments_completed: profile.investmentsCompleted,
      last_seen_at: profile.lastSeenAt,
    }));
    const moduleRows = snapshot.moduleMetrics.map((metric) => ({
      module_name: metric.moduleId,
      active_users: metric.activeUsers,
      sessions_in_progress: metric.sessionsInProgress,
      entry_source_counts: metric.entrySourceCounts,
      clicks: metric.clicks,
      activity_depth: metric.activityDepth,
      cta_actions: metric.ctaActions,
      conversions_started: metric.conversionsStarted,
      conversions_completed: metric.conversionsCompleted,
      drop_offs: metric.dropOffs,
      last_event_at: metric.lastEventTimestamp,
      health_status: metric.healthStatus,
      confidence_score: metric.confidenceScore,
      observed_at: snapshot.asOf,
    }));
    const healthRows = snapshot.moduleMetrics.map((metric) => ({
      module_name: metric.moduleId,
      health_status: metric.healthStatus,
      active_users: metric.activeUsers,
      drop_offs: metric.dropOffs,
      confidence_score: metric.confidenceScore,
      observed_at: snapshot.asOf,
      metadata: {
        sessionsInProgress: metric.sessionsInProgress,
        clicks: metric.clicks,
      },
    }));
    const funnelRows = snapshot.funnelMetrics.map((metric) => ({
      funnel_step: metric.step,
      count: metric.count,
      conversion_rate: metric.conversionRate,
      drop_rate: metric.dropRate,
      source_breakdown: metric.sourceBreakdown,
      affected_cohorts: metric.affectedCohorts,
      reason: metric.reason,
      impacted_modules: metric.impactedModules,
      last_significant_change: metric.lastSignificantChange,
      observed_at: snapshot.asOf,
    }));
    const dealRows = batch.filter((event) => event.eventName === 'deal_view').map((event) => ({
      session_id: event.sessionId,
      user_id: event.userId,
      anon_id: event.anonId,
      deal_id: typeof event.metadata.dealId === 'string' ? event.metadata.dealId : null,
      source_name: normalizeSource(event.attribution),
      event_name: event.eventName,
      metadata: event.metadata,
      occurred_at: event.timestamp,
    }));
    const chatRows = batch.filter((event) => event.eventName === 'chat_open' || event.eventName === 'chat_message').map((event) => ({
      session_id: event.sessionId,
      user_id: event.userId,
      anon_id: event.anonId,
      event_name: event.eventName,
      source_name: normalizeSource(event.attribution),
      message_text: typeof event.metadata.message === 'string' ? event.metadata.message : null,
      metadata: event.metadata,
      occurred_at: event.timestamp,
    }));

    await Promise.all([
      tryInsert('nerve_center_events', eventRows),
      tryUpsert('nerve_center_sessions', sessionRows, 'session_id'),
      tryUpsert('nerve_center_user_profiles', profileRows, 'profile_key'),
      tryUpsert('nerve_center_investor_profiles', investorRows, 'profile_key'),
      tryInsert('nerve_center_attribution_touches', touchRows),
      tryInsert('nerve_center_funnel_snapshots', funnelRows),
      tryInsert('nerve_center_module_health', healthRows),
      tryInsert('nerve_center_module_metrics', moduleRows),
      tryInsert('nerve_center_deal_interest_events', dealRows),
      tryInsert('nerve_center_chat_intelligence_events', chatRows),
    ]);
  }
}

export const liveIntelligenceService = new LiveIntelligenceService();
