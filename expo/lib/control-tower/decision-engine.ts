import type {
  CTModuleId,
  CTIncident,
  CTModuleHealth,
  CTOperatorAction,
  CTDecisionAnalysis,
  CTPredictiveScore,
  CTDashboardSnapshot,
} from './types';
import { CT_MODULE_LABELS } from './types';
import { isAutoSafe } from './auto-remediation';

const MODULE_DEPENDENCY_MAP: Partial<Record<CTModuleId, CTModuleId[]>> = {
  chat: ['realtime_sync', 'storage_isolation'],
  invest: ['admin_publish_deal', 'storage_isolation'],
  user_invest_flow: ['invest', 'storage_isolation', 'profile'],
  analytics: ['admin_dashboard'],
  landing: ['admin_dashboard', 'email'],
  photo_protection: ['storage_isolation'],
  trash_recovery: ['storage_isolation'],
  admin_publish_deal: ['storage_isolation'],
  ai_ops: ['chat', 'realtime_sync'],
};

const BUSINESS_IMPACT_MAP: Partial<Record<CTModuleId, string>> = {
  landing: 'Investor acquisition funnel blocked — new leads cannot submit',
  invest: 'Investment flow interrupted — users cannot commit capital',
  user_invest_flow: 'Active investment transactions may stall or fail',
  chat: 'Real-time communication degraded — user engagement drops',
  admin_publish_deal: 'Deal publishing blocked — no new inventory',
  analytics: 'Operational visibility lost — cannot monitor performance',
  realtime_sync: 'Live data propagation degraded across all modules',
  storage_isolation: 'File storage compromised — uploads and media affected',
  photo_protection: 'Protected media at risk — investor trust impact',
  profile: 'User identity and settings unavailable',
};

function getInvolvedModules(module: CTModuleId): CTModuleId[] {
  const deps = MODULE_DEPENDENCY_MAP[module] || [];
  const involved = new Set<CTModuleId>([module, ...deps]);

  for (const dep of deps) {
    const subDeps = MODULE_DEPENDENCY_MAP[dep] || [];
    for (const sd of subDeps) {
      involved.add(sd);
    }
  }

  return Array.from(involved);
}

function inferCause(
  module: CTModuleId,
  health: CTModuleHealth | undefined,
  prediction: CTPredictiveScore | undefined,
): string {
  if (!health) return `${CT_MODULE_LABELS[module]} health data unavailable — cannot determine root cause`;

  const causes: string[] = [];

  if (health.latencyMs > 2000) {
    causes.push(`high latency (${health.latencyMs}ms)`);
  }
  if (health.errorRate > 0.1) {
    causes.push(`elevated error rate (${(health.errorRate * 100).toFixed(0)}%)`);
  }
  if (health.fallbackCount > 0) {
    causes.push(`${health.fallbackCount} fallback activation(s)`);
  }
  if (health.criticalCount > 0) {
    causes.push(`${health.criticalCount} critical check(s) failing`);
  }
  if (prediction && prediction.trend === 'rising' && prediction.score > 0.5) {
    const topFactor = prediction.factors.find(f => f.status === 'critical') || prediction.factors.find(f => f.status === 'elevated');
    if (topFactor) {
      causes.push(`predictive signal: ${topFactor.name} trending critical`);
    }
  }

  if (causes.length === 0) {
    return `${CT_MODULE_LABELS[module]} degraded — intermittent connectivity or transient backend issue`;
  }

  return `${CT_MODULE_LABELS[module]} degraded due to ${causes.join(', ')}`;
}

function estimateSeverity(
  health: CTModuleHealth | undefined,
  affectedUsers: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (!health) return 'medium';

  if (health.state === 'critical' && affectedUsers > 5) return 'critical';
  if (health.state === 'critical') return 'high';
  if (health.state === 'degraded' && affectedUsers > 10) return 'high';
  if (health.state === 'degraded') return 'medium';
  if (affectedUsers > 20) return 'medium';
  return 'low';
}

function determineSafeActions(module: CTModuleId, health: CTModuleHealth | undefined): CTOperatorAction[] {
  const actions: CTOperatorAction[] = ['rerun_health_probe'];

  if (module === 'realtime_sync' || module === 'chat') {
    actions.push('reconnect_realtime', 'reopen_subscriptions');
  }
  if (module === 'chat') {
    actions.push('transition_stuck_sends');
  }
  if (module === 'analytics') {
    actions.push('retry_safe_rpc');
  }
  if (module === 'landing') {
    actions.push('retry_landing_api');
  }

  actions.push('clear_stale_cache', 'invalidate_query_cache');

  return actions.filter(a => isAutoSafe(a));
}

function determineApprovalActions(module: CTModuleId, severity: string): string[] {
  const actions: string[] = [];

  if (severity === 'critical' || severity === 'high') {
    actions.push('Notify admin/owner via escalation channel');
  }
  if (module === 'landing') {
    actions.push('Enable fallback lead capture form');
    actions.push('Switch landing API to backup endpoint');
  }
  if (module === 'chat') {
    actions.push('Force all rooms to local fallback mode');
  }
  if (module === 'invest' || module === 'user_invest_flow') {
    actions.push('Pause new investment submissions');
    actions.push('Alert compliance team');
  }
  if (module === 'storage_isolation') {
    actions.push('Enable read-only storage mode');
  }

  return actions;
}

export function analyzeIncident(
  incident: CTIncident,
  healthMap: Map<CTModuleId, CTModuleHealth>,
  predictions: CTPredictiveScore[],
): CTDecisionAnalysis {
  const health = healthMap.get(incident.module);
  const prediction = predictions.find(p => p.moduleId === incident.module);
  const involvedModules = getInvolvedModules(incident.module);

  const likelyCause = inferCause(incident.module, health, prediction);
  const severity = estimateSeverity(health, incident.affectedUsers);
  const businessImpact = BUSINESS_IMPACT_MAP[incident.module] || `${CT_MODULE_LABELS[incident.module]} service degraded`;
  const safeActions = determineSafeActions(incident.module, health);
  const approvalActions = determineApprovalActions(incident.module, severity);

  const logs: string[] = [
    `Module: ${CT_MODULE_LABELS[incident.module]}`,
    `Health state: ${health?.state ?? 'unknown'}`,
    `Latency: ${health?.latencyMs ?? 0}ms`,
    `Error rate: ${health ? (health.errorRate * 100).toFixed(1) + '%' : 'unknown'}`,
    `Risk score: ${prediction?.score?.toFixed(2) ?? 'n/a'}`,
    `Risk trend: ${prediction?.trend ?? 'unknown'}`,
    `Affected users: ${incident.affectedUsers}`,
    `Severity: ${incident.severity}`,
    `Timestamp: ${incident.timestamp}`,
  ];

  const analysis: CTDecisionAnalysis = {
    likelyCause,
    involvedModules,
    affectedUsers: incident.affectedUsers,
    estimatedSeverity: severity,
    businessImpact,
    safeActions,
    approvalActions,
    correlationIds: incident.correlationId ? [incident.correlationId] : [],
    logs,
  };

  console.log(`[CT:Decision] ${incident.module}: cause="${likelyCause}" severity=${severity} safe=${safeActions.length} approval=${approvalActions.length}`);

  return analysis;
}

export function analyzeAllIncidents(
  incidents: CTIncident[],
  healthMap: Map<CTModuleId, CTModuleHealth>,
  predictions: CTPredictiveScore[],
): CTIncident[] {
  return incidents.map(inc => ({
    ...inc,
    decisionAnalysis: analyzeIncident(inc, healthMap, predictions),
  }));
}

export function generateDecisionSummary(snapshot: CTDashboardSnapshot): {
  overallAssessment: string;
  topRisks: string[];
  immediateActions: string[];
  approvalNeeded: string[];
} {
  const criticalModules = snapshot.health.filter(h => h.state === 'critical');
  const degradedModules = snapshot.health.filter(h => h.state === 'degraded');
  const risingRisks = snapshot.predictions.filter(p => p.trend === 'rising' && p.score > 0.3);
  const activeIncidents = snapshot.incidents.filter(i => !i.resolved);

  let overallAssessment: string;
  if (criticalModules.length > 0) {
    overallAssessment = `${criticalModules.length} module(s) critical — immediate operator attention required`;
  } else if (degradedModules.length > 2) {
    overallAssessment = `${degradedModules.length} module(s) degraded — system stability at risk`;
  } else if (risingRisks.length > 0) {
    overallAssessment = `${risingRisks.length} rising risk signal(s) — preventive action recommended`;
  } else if (activeIncidents.length > 0) {
    overallAssessment = `${activeIncidents.length} active incident(s) — monitoring`;
  } else {
    overallAssessment = 'All systems nominal — no operator action required';
  }

  const topRisks = risingRisks.slice(0, 5).map(r => r.prediction);

  const immediateActions: string[] = [];
  for (const inc of activeIncidents) {
    if (inc.decisionAnalysis) {
      for (const action of inc.decisionAnalysis.safeActions.slice(0, 2)) {
        immediateActions.push(`${action} → ${CT_MODULE_LABELS[inc.module]}`);
      }
    }
  }

  const approvalNeeded: string[] = [];
  for (const inc of activeIncidents) {
    if (inc.decisionAnalysis) {
      for (const action of inc.decisionAnalysis.approvalActions.slice(0, 1)) {
        approvalNeeded.push(`${action} → ${CT_MODULE_LABELS[inc.module]}`);
      }
    }
  }

  return {
    overallAssessment,
    topRisks: topRisks.slice(0, 5),
    immediateActions: immediateActions.slice(0, 5),
    approvalNeeded: approvalNeeded.slice(0, 5),
  };
}
