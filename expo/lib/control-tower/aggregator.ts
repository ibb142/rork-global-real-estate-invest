import { controlTowerEmitter } from './event-emitter';
import { presenceManager, type LivePresenceState } from '@/lib/realtime-presence';
import { getDashboardSnapshot as getQCSnapshot } from '@/lib/qc/monitor-daemon';
import { runFullHealthCheck } from '@/lib/system-health-checker';
import { computeAllPredictions, computeSystemRiskScore } from './predictive-engine';
import { computeLandingFunnel } from './landing-funnel';
import { getRemediationLog, autoRemediateFromHealth } from './auto-remediation';
import { analyzeAllIncidents, generateDecisionSummary } from './decision-engine';
import { computeTrafficIntelSnapshot } from './traffic-aggregator';
import { computeAllSourcePredictions, shouldRunPredictions } from './traffic-predictive';
import type { TrafficIntelSnapshot } from './traffic-types';
import type {
  CTModuleId,
  CTModulePresence,
  CTModuleHealth,
  CTChatRoomSnapshot,
  CTIncident,
  CTDashboardSnapshot,
  CTHealthState,
  CTOperatorAction,
  CTLandingFunnelSnapshot,
  CTPredictiveScore,
  CTAutoRemediationLog,
  CTTrafficIntelRef,
} from './types';
import { CT_MODULE_LABELS } from './types';

const ACTIVE_WINDOW_5M = 300_000;
const ACTIVE_WINDOW_1H = 3600_000;
const AGGREGATION_INTERVAL = 10_000;
const HEALTH_REFRESH_INTERVAL = 120_000;
const PREDICTION_INTERVAL = 30_000;
const AUTO_REMEDIATION_INTERVAL = 60_000;

type AggregatorListener = (snapshot: CTDashboardSnapshot) => void;

let incidentIdCounter = 0;

function nextIncidentId(): string {
  incidentIdCounter++;
  return `inc_${Date.now()}_${incidentIdCounter}`;
}

const ALL_MODULE_IDS: CTModuleId[] = [
  'home', 'invest', 'market', 'portfolio', 'chat', 'profile',
  'analytics', 'admin_dashboard', 'admin_publish_deal', 'user_invest_flow',
  'realtime_sync', 'photo_protection', 'trash_recovery', 'storage_isolation',
  'landing', 'settings', 'email', 'ai_ops',
];

const EMPTY_LANDING_FUNNEL: CTLandingFunnelSnapshot = {
  activeVisitors: 0, visitorsLast5m: 0, visitorsLast1h: 0,
  ctaClicks: 0, ctaClickRate: 0, formStarts: 0, formSubmits: 0, formSubmitRate: 0,
  apiCalls: 0, apiSuccesses: 0, apiFailures: 0, apiSuccessRate: 0,
  handoffsStarted: 0, handoffsCompleted: 0,
  dropOffPoints: [], topReferrers: [], avgLatencyMs: 0,
};

class ControlTowerAggregator {
  private listeners = new Set<AggregatorListener>();
  private aggregateTimer: ReturnType<typeof setInterval> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private predictionTimer: ReturnType<typeof setInterval> | null = null;
  private autoRemTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: CTDashboardSnapshot | null = null;
  private incidents: CTIncident[] = [];
  private cachedHealth: CTModuleHealth[] = [];
  private cachedPredictions: CTPredictiveScore[] = [];
  private lastHealthRefresh = 0;
  private cachedTrafficIntel: TrafficIntelSnapshot | null = null;

  start(): void {
    if (this.aggregateTimer) return;
    console.log('[ControlTower:Aggregator] Starting aggregation loop (v2 — predictive + landing + remediation)');

    this.aggregate();
    this.aggregateTimer = setInterval(() => this.aggregate(), AGGREGATION_INTERVAL);
    this.healthTimer = setInterval(() => this.refreshHealth(), HEALTH_REFRESH_INTERVAL);
    this.predictionTimer = setInterval(() => this.runPredictions(), PREDICTION_INTERVAL);
    this.autoRemTimer = setInterval(() => this.runAutoRemediation(), AUTO_REMEDIATION_INTERVAL);
  }

  stop(): void {
    if (this.aggregateTimer) { clearInterval(this.aggregateTimer); this.aggregateTimer = null; }
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
    if (this.predictionTimer) { clearInterval(this.predictionTimer); this.predictionTimer = null; }
    if (this.autoRemTimer) { clearInterval(this.autoRemTimer); this.autoRemTimer = null; }
    console.log('[ControlTower:Aggregator] Stopped');
  }

  subscribe(listener: AggregatorListener): () => void {
    this.listeners.add(listener);
    if (this.lastSnapshot) listener(this.lastSnapshot);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(): CTDashboardSnapshot | null {
    return this.lastSnapshot;
  }

  reportIncident(
    module: CTModuleId,
    severity: 'warning' | 'critical',
    title: string,
    description: string,
    affectedUsers: number,
    suggestedAction: CTOperatorAction,
  ): CTIncident {
    const incident: CTIncident = {
      id: nextIncidentId(),
      module,
      severity,
      title,
      description,
      affectedUsers,
      suggestedAction,
      timestamp: new Date().toISOString(),
      resolved: false,
      correlationId: `cor_${Date.now()}`,
    };
    this.incidents.push(incident);
    if (this.incidents.length > 50) {
      this.incidents = this.incidents.slice(-50);
    }
    console.log(`[ControlTower:Aggregator] Incident: ${severity} | ${title} | ${module} | ${affectedUsers} users`);
    this.aggregate();
    return incident;
  }

  resolveIncident(incidentId: string): void {
    const incident = this.incidents.find((i) => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      this.aggregate();
    }
  }

  private aggregate(): void {
    const now = Date.now();
    const events = controlTowerEmitter.getRecentEvents();
    const presence = presenceManager.getState();

    const modules: CTModulePresence[] = ALL_MODULE_IDS.map((moduleId) => {
      const moduleEvents = events.filter((e) => e.module === moduleId);
      const active5m = new Set<string>();
      const active1h = new Set<string>();
      const activeNow = new Set<string>();
      const authenticated = new Set<string>();
      const anonymous = new Set<string>();
      const stepCounts: Record<string, number> = {};
      const exitedSessions = new Set<string>();

      for (const e of moduleEvents) {
        const age = now - new Date(e.timestamp).getTime();
        if (e.type === 'exit_module') { exitedSessions.add(e.sessionId); continue; }
        if (age <= ACTIVE_WINDOW_1H) active1h.add(e.sessionId);
        if (age <= ACTIVE_WINDOW_5M) {
          active5m.add(e.sessionId);
          if (!exitedSessions.has(e.sessionId)) activeNow.add(e.sessionId);
        }
        if (e.userId) authenticated.add(e.sessionId);
        else anonymous.add(e.sessionId);
        if (e.step) stepCounts[e.step] = (stepCounts[e.step] || 0) + 1;
      }

      const health = this.cachedHealth.find(h => h.moduleId === moduleId);
      const degradedAffected = health?.state === 'degraded' ? activeNow.size : 0;
      const criticalAffected = health?.state === 'critical' ? activeNow.size : 0;

      return {
        moduleId,
        activeNow: activeNow.size,
        last5m: active5m.size,
        last1h: active1h.size,
        authenticated: authenticated.size,
        anonymous: anonymous.size,
        degradedAffected,
        criticalAffected,
        byStep: stepCounts,
      };
    });

    const presenceModules = this.mapPresenceToModules(presence);
    for (const pm of presenceModules) {
      const existing = modules.find((m) => m.moduleId === pm.moduleId);
      if (existing) {
        existing.activeNow = Math.max(existing.activeNow, pm.activeNow);
        existing.last5m = Math.max(existing.last5m, pm.last5m);
        existing.authenticated = Math.max(existing.authenticated, pm.authenticated);
        existing.anonymous = Math.max(existing.anonymous, pm.anonymous);
      }
    }

    const chatRooms = this.buildChatRoomSnapshots();
    const activeIncidents = this.incidents.filter((i) => !i.resolved);
    const health = this.cachedHealth.length > 0 ? this.cachedHealth : this.buildDefaultHealth();
    const landingFunnel = computeLandingFunnel();
    const predictions = this.cachedPredictions;
    const autoRemediations = getRemediationLog(20);

    this.refreshTrafficIntel();

    const healthMap = new Map<CTModuleId, CTModuleHealth>();
    for (const h of health) healthMap.set(h.moduleId, h);

    const enrichedIncidents = analyzeAllIncidents(activeIncidents, healthMap, predictions);

    let systemHealth: CTHealthState = 'healthy';
    const critCount = enrichedIncidents.filter((i) => i.severity === 'critical').length;
    const warnCount = enrichedIncidents.filter((i) => i.severity === 'warning').length;
    if (critCount > 0) systemHealth = 'critical';
    else if (warnCount > 2) systemHealth = 'degraded';

    const systemRiskScore = computeSystemRiskScore(predictions);

    const totalActive = modules.reduce((sum, m) => sum + m.activeNow, 0);
    const totalAuth = modules.reduce((sum, m) => sum + m.authenticated, 0);
    const totalAnon = modules.reduce((sum, m) => sum + m.anonymous, 0);

    const snapshot: CTDashboardSnapshot = {
      modules,
      health,
      chatRooms,
      incidents: enrichedIncidents,
      landingFunnel,
      predictions,
      autoRemediations,
      trafficIntel: this.cachedTrafficIntel ? { available: true } : null,
      totalActiveUsers: Math.max(totalActive, presence.totalOnline),
      totalAuthenticated: Math.max(totalAuth, presence.appOnline),
      totalAnonymous: Math.max(totalAnon, presence.landingOnline),
      systemHealth,
      systemRiskScore,
      lastUpdated: new Date().toISOString(),
    };

    this.lastSnapshot = snapshot;
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch {}
    }
  }

  private runPredictions(): void {
    const healthMap = new Map<CTModuleId, CTModuleHealth>();
    for (const h of this.cachedHealth) healthMap.set(h.moduleId, h);
    this.cachedPredictions = computeAllPredictions(ALL_MODULE_IDS, healthMap);

    for (const pred of this.cachedPredictions) {
      if (pred.score >= 0.7 && pred.trend === 'rising') {
        const exists = this.incidents.some(
          i => !i.resolved && i.module === pred.moduleId && i.title.includes('predicted'),
        );
        if (!exists) {
          this.reportIncident(
            pred.moduleId,
            'warning',
            `${CT_MODULE_LABELS[pred.moduleId]} failure predicted`,
            pred.prediction,
            0,
            'rerun_health_probe',
          );
        }
      }
    }
  }

  private async runAutoRemediation(): Promise<void> {
    for (const h of this.cachedHealth) {
      if (h.state === 'critical' || h.state === 'degraded') {
        try {
          await autoRemediateFromHealth(h.moduleId, h.state);
        } catch (err) {
          console.log(`[ControlTower:Aggregator] Auto-remediation error for ${h.moduleId}:`, (err as Error)?.message);
        }
      }
    }
  }

  private mapPresenceToModules(presence: LivePresenceState): CTModulePresence[] {
    const pageToModule: Record<string, CTModuleId> = {
      'Home': 'home', 'Invest': 'invest', 'Market': 'market', 'Portfolio': 'portfolio',
      'Chat': 'chat', 'Profile': 'profile', 'Analytics': 'analytics',
      'Admin': 'admin_dashboard', 'Landing Page': 'landing', 'App': 'home',
    };

    const moduleMap = new Map<CTModuleId, { active: number; auth: number; anon: number }>();
    for (const user of presence.users) {
      const moduleId = pageToModule[user.page || 'App'] || 'home';
      const current = moduleMap.get(moduleId) || { active: 0, auth: 0, anon: 0 };
      current.active++;
      if (user.source === 'app') current.auth++;
      else current.anon++;
      moduleMap.set(moduleId, current);
    }

    return Array.from(moduleMap.entries()).map(([moduleId, data]) => ({
      moduleId,
      activeNow: data.active,
      last5m: data.active,
      last1h: data.active,
      authenticated: data.auth,
      anonymous: data.anon,
      degradedAffected: 0,
      criticalAffected: 0,
      byStep: {},
    }));
  }

  private buildChatRoomSnapshots(): CTChatRoomSnapshot[] {
    const now = new Date().toISOString();
    return [{
      roomId: 'ivx-owner-room',
      roomName: 'IVX Owner Room',
      activeUsers: 0,
      typingUsers: 0,
      mode: 'unknown',
      stuckSends: 0,
      failedSends: 0,
      uploadsInProgress: 0,
      isDegraded: false,
      lastActivity: now,
      lastSharedWrite: now,
      lastRealtimeEvent: now,
    }];
  }

  private buildDefaultHealth(): CTModuleHealth[] {
    return ALL_MODULE_IDS.map((moduleId) => ({
      moduleId,
      state: 'unknown' as const,
      latencyMs: 0,
      errorRate: 0,
      retryRate: 0,
      degradedCount: 0,
      criticalCount: 0,
      fallbackCount: 0,
      affectedUsers: 0,
      lastChecked: new Date().toISOString(),
      riskScore: 0,
      riskTrend: 'stable' as const,
      riskFactors: [],
    }));
  }

  async refreshHealth(): Promise<void> {
    const now = Date.now();
    if (now - this.lastHealthRefresh < 60_000) return;
    this.lastHealthRefresh = now;

    console.log('[ControlTower:Aggregator] Refreshing health data (v2)');

    try {
      const systemSnapshot = await runFullHealthCheck();
      const qcSnapshot = getQCSnapshot();
      const healthMap = new Map<CTModuleId, CTModuleHealth>();

      for (const check of systemSnapshot.checks) {
        const moduleId = this.healthCheckToModule(check.id);
        if (!moduleId) continue;
        healthMap.set(moduleId, {
          moduleId,
          state: check.status === 'green' ? 'healthy' : check.status === 'yellow' ? 'degraded' : 'critical',
          latencyMs: check.latency,
          errorRate: check.status === 'red' ? 1 : 0,
          retryRate: 0,
          degradedCount: check.status === 'yellow' ? 1 : 0,
          criticalCount: check.status === 'red' ? 1 : 0,
          fallbackCount: 0,
          affectedUsers: 0,
          lastChecked: new Date().toISOString(),
          riskScore: 0,
          riskTrend: 'stable' as const,
          riskFactors: [],
        });
      }

      if (qcSnapshot.lastCycleResult) {
        for (const probe of qcSnapshot.lastCycleResult.probeResults) {
          const moduleId = this.qcModuleToCtModule(probe.module);
          if (!moduleId) continue;
          const existing = healthMap.get(moduleId);
          if (existing) {
            existing.latencyMs = Math.max(existing.latencyMs, probe.latencyMs);
            if (probe.status === 'fail') { existing.state = 'critical'; existing.criticalCount++; }
            else if (probe.status === 'warn' && existing.state !== 'critical') { existing.state = 'degraded'; existing.degradedCount++; }
          }
        }
      }

      const predMap = new Map<CTModuleId, CTPredictiveScore>();
      for (const p of this.cachedPredictions) predMap.set(p.moduleId, p);

      for (const [id, h] of healthMap) {
        const pred = predMap.get(id);
        if (pred) {
          h.riskScore = pred.score;
          h.riskTrend = pred.trend;
          h.riskFactors = pred.factors.filter(f => f.status !== 'normal').map(f => f.name);
        }
      }

      this.cachedHealth = Array.from(healthMap.values());
      this.deriveIncidentsFromHealth();
      this.aggregate();
    } catch (err) {
      console.log('[ControlTower:Aggregator] Health refresh error:', (err as Error)?.message);
    }
  }

  private deriveIncidentsFromHealth(): void {
    for (const h of this.cachedHealth) {
      if (h.state === 'critical') {
        const exists = this.incidents.some(
          (i) => !i.resolved && i.module === h.moduleId && i.severity === 'critical',
        );
        if (!exists) {
          this.reportIncident(
            h.moduleId, 'critical',
            `${CT_MODULE_LABELS[h.moduleId]} is critical`,
            `Latency: ${h.latencyMs}ms, errors detected. Risk score: ${h.riskScore.toFixed(2)}`,
            h.affectedUsers, 'rerun_health_probe',
          );
        }
      }
    }
  }

  private healthCheckToModule(checkId: string): CTModuleId | null {
    const map: Record<string, CTModuleId> = {
      'supabase-rest': 'admin_dashboard', 'supabase-auth': 'profile',
      'supabase-realtime': 'realtime_sync', 'supabase-storage': 'storage_isolation',
      'landing-page': 'landing', 'react-query': 'home',
      'auth-session': 'profile', 'chat-engine': 'chat', 'analytics-rpc': 'analytics',
    };
    return map[checkId] || null;
  }

  private qcModuleToCtModule(qcModule: string): CTModuleId | null {
    const map: Record<string, CTModuleId> = {
      supabase_db: 'admin_dashboard', supabase_auth: 'profile',
      supabase_realtime: 'realtime_sync', supabase_storage: 'storage_isolation',
      chat_engine: 'chat', analytics_engine: 'analytics',
      auth_engine: 'profile', upload_engine: 'storage_isolation',
      deal_engine: 'invest', photo_engine: 'photo_protection',
    };
    return map[qcModule] || null;
  }

  private refreshTrafficIntel(): void {
    try {
      const intel = computeTrafficIntelSnapshot();
      if (shouldRunPredictions(intel.totalVisitors)) {
        intel.predictions = computeAllSourcePredictions(intel.sources);
      } else if (this.cachedTrafficIntel) {
        intel.predictions = this.cachedTrafficIntel.predictions;
      }
      this.cachedTrafficIntel = intel;
    } catch (err) {
      console.log('[ControlTower:Aggregator] Traffic intel error:', (err as Error)?.message);
    }
  }

  getTrafficIntel(): TrafficIntelSnapshot | null {
    return this.cachedTrafficIntel;
  }
}

export const controlTowerAggregator = new ControlTowerAggregator();
