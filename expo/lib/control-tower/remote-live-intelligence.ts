import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  FunnelLiveMetric,
  LiveIntelligenceSnapshot,
  ModuleLiveMetric,
  OperatorLiveMetric,
  SourceLiveMetric,
  UserBehaviorProfile,
} from './live-intelligence';

interface RemoteSessionRow {
  session_id: string;
  user_id: string | null;
  anon_id: string | null;
  first_source: string | null;
  last_source: string | null;
  current_module: string | null;
  last_seen_at: string | null;
}

interface RemoteModuleMetricRow {
  module_name: string;
  active_users: number | null;
  sessions_in_progress: number | null;
  entry_source_counts: Record<string, number> | null;
  clicks: number | null;
  activity_depth: number | null;
  cta_actions: number | null;
  conversions_started: number | null;
  conversions_completed: number | null;
  drop_offs: number | null;
  last_event_at: string | null;
  health_status: 'healthy' | 'degraded' | 'critical' | null;
  confidence_score: number | null;
  observed_at: string | null;
}

interface RemoteFunnelRow {
  funnel_step: string;
  count: number | null;
  conversion_rate: number | null;
  drop_rate: number | null;
  source_breakdown: Record<string, number> | null;
  affected_cohorts: string[] | null;
  reason: string | null;
  impacted_modules: string[] | null;
  last_significant_change: string | null;
  observed_at: string | null;
}

interface RemoteProfileRow {
  profile_key: string;
  user_id: string | null;
  anon_id: string | null;
  first_source: string | null;
  last_source: string | null;
  modules_visited: string[] | null;
  time_spent_per_module: Record<string, number> | null;
  clicks: number | null;
  actions: number | null;
  deals_viewed: string[] | null;
  investments_started: number | null;
  investments_completed: number | null;
  avg_time_to_invest_ms: number | null;
  recency_score: number | null;
  frequency_score: number | null;
  intent_score: number | null;
  predicted_conversion_score: number | null;
  investor_interest_category: string | null;
  preferred_ticket_size: string | null;
  likely_risk_appetite: string | null;
  chat_questions: string[] | null;
  roi_signals: string[] | null;
  last_seen_at: string | null;
}

interface RemoteChatRow {
  event_name: string | null;
  occurred_at: string | null;
}

function buildEmptyOperator(): OperatorLiveMetric {
  return {
    waitingUsers: 0,
    stuckUsers: 0,
    failedConversations: 0,
    fallbackTransportState: 'healthy',
    ownerHandoffHealth: 'healthy',
  };
}

function mapProfile(row: RemoteProfileRow): UserBehaviorProfile {
  return {
    id: row.profile_key,
    userId: row.user_id,
    anonId: row.anon_id ?? row.profile_key,
    sessionHistory: [],
    sourceHistory: [row.first_source ?? 'direct', row.last_source ?? 'direct'].filter((value, index, items) => !!value && items.indexOf(value) === index),
    modulesVisited: row.modules_visited ?? [],
    timeSpentPerModule: row.time_spent_per_module ?? {},
    clicks: row.clicks ?? 0,
    actions: row.actions ?? 0,
    dealsViewed: row.deals_viewed ?? [],
    investmentsStarted: row.investments_started ?? 0,
    investmentsCompleted: row.investments_completed ?? 0,
    avgTimeToInvestMs: row.avg_time_to_invest_ms,
    recencyScore: row.recency_score ?? 0,
    frequencyScore: row.frequency_score ?? 0,
    intentScore: row.intent_score ?? 0,
    predictedConversionScore: row.predicted_conversion_score ?? 0,
    predictedInvestorInterestCategory: row.investor_interest_category ?? 'discovery',
    preferredTicketSize: row.preferred_ticket_size ?? '$5k-$25k',
    likelyRiskAppetite: row.likely_risk_appetite ?? 'moderate',
    chatQuestions: row.chat_questions ?? [],
    roiSignals: row.roi_signals ?? [],
    firstSource: row.first_source ?? 'direct',
    lastSource: row.last_source ?? 'direct',
    lastSeenAt: row.last_seen_at ?? new Date().toISOString(),
  };
}

export async function fetchRemoteLiveIntelligenceSnapshot(): Promise<LiveIntelligenceSnapshot | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [sessionsResult, modulesResult, funnelResult, profilesResult, chatResult] = await Promise.all([
    supabase
      .from('nerve_center_sessions')
      .select('session_id,user_id,anon_id,first_source,last_source,current_module,last_seen_at')
      .gte('last_seen_at', sinceIso)
      .order('last_seen_at', { ascending: false })
      .limit(250),
    supabase
      .from('nerve_center_module_metrics')
      .select('module_name,active_users,sessions_in_progress,entry_source_counts,clicks,activity_depth,cta_actions,conversions_started,conversions_completed,drop_offs,last_event_at,health_status,confidence_score,observed_at')
      .gte('observed_at', sinceIso)
      .order('observed_at', { ascending: false })
      .limit(250),
    supabase
      .from('nerve_center_funnel_snapshots')
      .select('funnel_step,count,conversion_rate,drop_rate,source_breakdown,affected_cohorts,reason,impacted_modules,last_significant_change,observed_at')
      .gte('observed_at', sinceIso)
      .order('observed_at', { ascending: false })
      .limit(64),
    supabase
      .from('nerve_center_user_profiles')
      .select('profile_key,user_id,anon_id,first_source,last_source,modules_visited,time_spent_per_module,clicks,actions,deals_viewed,investments_started,investments_completed,avg_time_to_invest_ms,recency_score,frequency_score,intent_score,predicted_conversion_score,investor_interest_category,preferred_ticket_size,likely_risk_appetite,chat_questions,roi_signals,last_seen_at')
      .gte('last_seen_at', sinceIso)
      .order('intent_score', { ascending: false })
      .limit(40),
    supabase
      .from('nerve_center_chat_intelligence_events')
      .select('event_name,occurred_at')
      .gte('occurred_at', sinceIso)
      .order('occurred_at', { ascending: false })
      .limit(200),
  ]);

  if (sessionsResult.error || modulesResult.error || funnelResult.error || profilesResult.error || chatResult.error) {
    console.log('[RemoteLiveIntel] Query fallback:', {
      sessions: sessionsResult.error?.message ?? null,
      modules: modulesResult.error?.message ?? null,
      funnel: funnelResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
      chat: chatResult.error?.message ?? null,
    });
    return null;
  }

  const sessions = (sessionsResult.data ?? []) as RemoteSessionRow[];
  const profiles = (profilesResult.data ?? []).map((row) => mapProfile(row as RemoteProfileRow));
  const chatRows = (chatResult.data ?? []) as RemoteChatRow[];

  const moduleMap = new Map<string, ModuleLiveMetric>();
  for (const row of (modulesResult.data ?? []) as RemoteModuleMetricRow[]) {
    if (moduleMap.has(row.module_name)) {
      continue;
    }
    moduleMap.set(row.module_name, {
      moduleId: row.module_name,
      activeUsers: row.active_users ?? 0,
      sessionsInProgress: row.sessions_in_progress ?? 0,
      entrySourceCounts: row.entry_source_counts ?? {},
      clicks: row.clicks ?? 0,
      activityDepth: row.activity_depth ?? 0,
      ctaActions: row.cta_actions ?? 0,
      conversionsStarted: row.conversions_started ?? 0,
      conversionsCompleted: row.conversions_completed ?? 0,
      dropOffs: row.drop_offs ?? 0,
      lastEventTimestamp: row.last_event_at,
      healthStatus: row.health_status ?? 'healthy',
      confidenceScore: row.confidence_score ?? 0.72,
    });
  }

  const funnelMap = new Map<string, FunnelLiveMetric>();
  for (const row of (funnelResult.data ?? []) as RemoteFunnelRow[]) {
    if (funnelMap.has(row.funnel_step)) {
      continue;
    }
    funnelMap.set(row.funnel_step, {
      step: row.funnel_step,
      count: row.count ?? 0,
      conversionRate: Math.round(row.conversion_rate ?? 0),
      dropRate: Math.round(row.drop_rate ?? 0),
      sourceBreakdown: row.source_breakdown ?? {},
      affectedCohorts: row.affected_cohorts ?? [],
      reason: row.reason,
      impactedModules: row.impacted_modules ?? [],
      lastSignificantChange: row.last_significant_change ?? row.observed_at,
    });
  }

  const profilesBySource = new Map<string, UserBehaviorProfile[]>();
  for (const profile of profiles) {
    const source = profile.lastSource || 'direct';
    profilesBySource.set(source, [...(profilesBySource.get(source) ?? []), profile]);
  }

  const sourceMap = new Map<string, SourceLiveMetric>();
  for (const session of sessions) {
    const source = session.last_source ?? session.first_source ?? 'direct';
    const metric = sourceMap.get(source) ?? {
      source,
      activeUsers: 0,
      totalSessions: 0,
      conversions: 0,
      qualityScore: 0,
      dropOffRate: 0,
      investorQualityScore: 0,
      lowIntentRate: 0,
    };
    metric.activeUsers += 1;
    metric.totalSessions += 1;
    sourceMap.set(source, metric);
  }

  for (const [source, metric] of sourceMap.entries()) {
    const sourceProfiles = profilesBySource.get(source) ?? [];
    const conversions = sourceProfiles.filter((profile) => profile.investmentsCompleted > 0).length;
    const lowIntent = sourceProfiles.filter((profile) => profile.intentScore < 35).length;
    metric.conversions = conversions;
    metric.investorQualityScore = Math.round(sourceProfiles.filter((profile) => profile.investmentsStarted > 0 || profile.investmentsCompleted > 0).reduce((sum, profile) => sum + profile.predictedConversionScore, 0) / Math.max(1, sourceProfiles.filter((profile) => profile.investmentsStarted > 0 || profile.investmentsCompleted > 0).length || 1));
    metric.qualityScore = Math.round(Math.min(100, (metric.totalSessions > 0 ? (conversions / metric.totalSessions) * 100 : 0) + (sourceProfiles.reduce((sum, profile) => sum + profile.intentScore, 0) / Math.max(1, sourceProfiles.length)) * 0.45));
    metric.dropOffRate = Math.max(0, 100 - Math.round((conversions / Math.max(1, metric.totalSessions)) * 100));
    metric.lowIntentRate = Math.round((lowIntent / Math.max(1, sourceProfiles.length)) * 100);
    sourceMap.set(source, metric);
  }

  const waitingUsers = profiles.filter((profile) => profile.modulesVisited.includes('chat') && profile.chatQuestions.length === 0).length;
  const stuckUsers = profiles.filter((profile) => profile.investmentsStarted > profile.investmentsCompleted || profile.intentScore >= 60).length;
  const failedConversations = chatRows.filter((row) => row.event_name === 'fallback_used' || row.event_name === 'error_seen').length;
  const operator: OperatorLiveMetric = {
    waitingUsers,
    stuckUsers,
    failedConversations,
    fallbackTransportState: chatRows.some((row) => row.event_name === 'fallback_used') ? 'degraded' : 'healthy',
    ownerHandoffHealth: chatRows.some((row) => row.event_name === 'error_seen') ? 'degraded' : 'healthy',
  };

  const snapshot: LiveIntelligenceSnapshot = {
    asOf: new Date().toISOString(),
    totalLiveUsers: sessions.length,
    moduleMetrics: Array.from(moduleMap.values()).sort((a, b) => b.activeUsers - a.activeUsers),
    sourceMetrics: Array.from(sourceMap.values()).sort((a, b) => b.qualityScore - a.qualityScore),
    funnelMetrics: Array.from(funnelMap.values()),
    topProfiles: profiles.sort((a, b) => b.intentScore - a.intentScore).slice(0, 8),
    stalledProfiles: profiles.filter((profile) => profile.investmentsStarted > profile.investmentsCompleted || profile.intentScore >= 60).sort((a, b) => b.intentScore - a.intentScore).slice(0, 5),
    likelyToInvestProfiles: profiles.filter((profile) => profile.predictedConversionScore >= 65).sort((a, b) => b.predictedConversionScore - a.predictedConversionScore).slice(0, 5),
    operator,
  };

  return snapshot;
}

function mergeTypedByKey<T>(localItems: T[], remoteItems: T[], getKey: (item: T) => string): T[] {
  const merged = new Map<string, T>();

  for (const item of remoteItems) {
    merged.set(getKey(item), item);
  }

  for (const item of localItems) {
    const key = getKey(item);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

export function mergeLiveIntelligenceSnapshots(localSnapshot: LiveIntelligenceSnapshot, remoteSnapshot: LiveIntelligenceSnapshot | null): LiveIntelligenceSnapshot {
  if (!remoteSnapshot) {
    return localSnapshot;
  }

  return {
    asOf: new Date(Math.max(new Date(localSnapshot.asOf).getTime(), new Date(remoteSnapshot.asOf).getTime())).toISOString(),
    totalLiveUsers: Math.max(localSnapshot.totalLiveUsers, remoteSnapshot.totalLiveUsers),
    moduleMetrics: mergeTypedByKey(localSnapshot.moduleMetrics, remoteSnapshot.moduleMetrics, (item) => item.moduleId),
    sourceMetrics: mergeTypedByKey(localSnapshot.sourceMetrics, remoteSnapshot.sourceMetrics, (item) => item.source),
    funnelMetrics: mergeTypedByKey(localSnapshot.funnelMetrics, remoteSnapshot.funnelMetrics, (item) => item.step),
    topProfiles: mergeTypedByKey(localSnapshot.topProfiles, remoteSnapshot.topProfiles, (item) => item.id).sort((a, b) => b.intentScore - a.intentScore).slice(0, 8),
    stalledProfiles: mergeTypedByKey(localSnapshot.stalledProfiles, remoteSnapshot.stalledProfiles, (item) => item.id).sort((a, b) => b.intentScore - a.intentScore).slice(0, 5),
    likelyToInvestProfiles: mergeTypedByKey(localSnapshot.likelyToInvestProfiles, remoteSnapshot.likelyToInvestProfiles, (item) => item.id).sort((a, b) => b.predictedConversionScore - a.predictedConversionScore).slice(0, 5),
    operator: {
      waitingUsers: Math.max(localSnapshot.operator.waitingUsers, remoteSnapshot.operator.waitingUsers),
      stuckUsers: Math.max(localSnapshot.operator.stuckUsers, remoteSnapshot.operator.stuckUsers),
      failedConversations: Math.max(localSnapshot.operator.failedConversations, remoteSnapshot.operator.failedConversations),
      fallbackTransportState: remoteSnapshot.operator.fallbackTransportState === 'critical' || localSnapshot.operator.fallbackTransportState === 'critical'
        ? 'critical'
        : remoteSnapshot.operator.fallbackTransportState === 'degraded' || localSnapshot.operator.fallbackTransportState === 'degraded'
          ? 'degraded'
          : 'healthy',
      ownerHandoffHealth: remoteSnapshot.operator.ownerHandoffHealth === 'critical' || localSnapshot.operator.ownerHandoffHealth === 'critical'
        ? 'critical'
        : remoteSnapshot.operator.ownerHandoffHealth === 'degraded' || localSnapshot.operator.ownerHandoffHealth === 'degraded'
          ? 'degraded'
          : 'healthy',
    },
  };
}

export function getEmptyRemoteOperator(): OperatorLiveMetric {
  return buildEmptyOperator();
}
