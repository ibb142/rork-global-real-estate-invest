export type HealthState = 'stable' | 'warning' | 'critical';
export type CommandMode = 'auto' | 'manual' | 'approval';
export type AlertDisposition = 'observe_only' | 'recommend_action' | 'auto_remediate' | 'require_approval' | 'escalate_to_owner';
export type ModuleStatus = 'online' | 'degraded' | 'offline' | 'recovering';
export type TrafficHealth = 'healthy' | 'degraded' | 'suspicious';
export type RoomStatus = 'active' | 'degraded' | 'idle' | 'critical';
export type NodeLayer = 'client' | 'routing_cache' | 'authentication' | 'data' | 'realtime_services' | 'admin_ops';

export interface RiskFactors {
  errorRate: number;
  latencyDrift: number;
  failedRetries: number;
  dependencyInstability: number;
  authFailures: number;
  realtimeDisconnects: number;
  storageSyncFailures: number;
}

export interface ModuleRecord {
  id: string;
  name: string;
  layer: NodeLayer;
  status: ModuleStatus;
  health: HealthState;
  occupancy: number;
  latencyMs: number;
  errorRate: number;
  failedRetries: number;
  dependencyInstability: number;
  authFailures: number;
  realtimeDisconnects: number;
  storageSyncFailures: number;
  recentChange: string;
  recentIncidents: string[];
  downstreamModules: string[];
  explanation: string;
}

export interface IncidentRecord {
  id: string;
  moduleId: string;
  title: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  blastRadius: number;
  downstreamModules: string[];
  actionability: AlertDisposition;
  status: 'open' | 'monitoring' | 'mitigating';
}

export interface RecommendationRecord {
  id: string;
  targetModuleId: string;
  reason: string;
  confidence: number;
  blastRadius: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  commandType: CommandMode;
  command: string;
  disposition: AlertDisposition;
}

export interface ApprovalRecord {
  id: string;
  moduleId: string;
  title: string;
  reason: string;
  command: string;
  approver: string;
}

export interface TrafficSourceRecord {
  id: string;
  name: string;
  health: TrafficHealth;
  detectedIntent: string;
  qualityScore: number;
  count: number;
  authSessions: number;
  anonSessions: number;
  routePath: string[];
  anomalyFlag: string | null;
  entryPoint: string;
  destinationModules: string[];
}

export interface FunnelStageRecord {
  id: string;
  name: string;
  count: number;
  delta5m: number;
  delta1h: number;
  conversionRate: number;
  dropOffRate: number;
  failureReason: string | null;
  impactedModules: string[];
}

export interface DropOffAnalysis {
  largestDropOffPoint: string;
  probableCause: string;
  impactedApis: string[];
  impactedModules: string[];
  recommendedDebugCommand: string;
  logicAnomaly: string | null;
}

export interface RiskModuleRecord {
  moduleId: string;
  riskScore: number;
  status: HealthState;
  primaryRiskDriver: string;
  confidence: number;
  recentIncidentHistory: string[];
  dependencySensitivity: string;
  suggestedIntervention: string;
  whyStableOrAtRisk: string;
  recentChange: string;
  factors: RiskFactors;
}

export interface ChatRoomRecord {
  id: string;
  name: string;
  roomStatus: RoomStatus;
  activeUsers: number;
  typingUsers: number;
  stuckConversations: number;
  failedMessages: number;
  lastWrite: string;
  realtimeTransportStatus: 'connected' | 'degraded' | 'disconnected';
  messageDeliveryHealth: 'healthy' | 'warning' | 'critical';
  incidentWithoutOperator: boolean;
  escalationGap: boolean;
  proof: string;
}

export interface ArchitectureNodeRecord {
  id: string;
  name: string;
  layer: NodeLayer;
  healthState: HealthState;
  latencyMs: number;
  dependencyLinks: string[];
  criticalPathStatus: 'clear' | 'degraded' | 'blocked';
  liveIssues: string[];
  affectedDownstreamSystems: string[];
  rootIssue: string;
  recommendedRecoveryCommand: string;
}

export interface DependencyRecord {
  id: string;
  from: string;
  to: string;
  type: 'auth_validation' | 'fetch_query' | 'cache_subscribe' | 'realtime_events' | 'push_notifications' | 'policy_checks';
  degraded: boolean;
}

export interface CommandRecord {
  id: string;
  moduleId: string;
  incidentId: string | null;
  title: string;
  command: string;
  mode: CommandMode;
  reason: string;
}

export interface NerveCenterSnapshot {
  asOf: string;
  globalStatus: HealthState;
  activeIncidentsCount: number;
  onlineModulesCount: number;
  authSessions: number;
  anonSessions: number;
  alertsInProgress: number;
  healActionsAttempted: number;
  modules: ModuleRecord[];
  incidents: IncidentRecord[];
  recommendations: RecommendationRecord[];
  approvals: ApprovalRecord[];
  trafficSources: TrafficSourceRecord[];
  funnel: FunnelStageRecord[];
  dropOffAnalysis: DropOffAnalysis;
  riskModules: RiskModuleRecord[];
  chatRooms: ChatRoomRecord[];
  architectureNodes: ArchitectureNodeRecord[];
  dependencies: DependencyRecord[];
  commands: CommandRecord[];
}

const MODULES: ModuleRecord[] = [
  {
    id: 'edge_router',
    name: 'Edge Router',
    layer: 'routing_cache',
    status: 'degraded',
    health: 'warning',
    occupancy: 148,
    latencyMs: 162,
    errorRate: 1.8,
    failedRetries: 3,
    dependencyInstability: 26,
    authFailures: 0,
    realtimeDisconnects: 0,
    storageSyncFailures: 0,
    recentChange: 'routing rule update deployed 18m ago',
    recentIncidents: ['route cache desync'],
    downstreamModules: ['auth_gateway', 'lead_api'],
    explanation: 'Routing edge is absorbing elevated cold-start latency and sending fallback traffic to degraded lead paths.',
  },
  {
    id: 'auth_gateway',
    name: 'Auth Gateway',
    layer: 'authentication',
    status: 'degraded',
    health: 'warning',
    occupancy: 72,
    latencyMs: 214,
    errorRate: 3.4,
    failedRetries: 8,
    dependencyInstability: 31,
    authFailures: 27,
    realtimeDisconnects: 0,
    storageSyncFailures: 0,
    recentChange: 'token verifier switched to stricter policy',
    recentIncidents: ['anon-to-auth handoff rejects'],
    downstreamModules: ['lead_api', 'owner_room'],
    explanation: 'Anonymous sessions are failing promotion into authenticated state because policy verification is slower and rejection volume is rising.',
  },
  {
    id: 'lead_api',
    name: 'Lead Capture API',
    layer: 'data',
    status: 'offline',
    health: 'critical',
    occupancy: 51,
    latencyMs: 941,
    errorRate: 12.9,
    failedRetries: 18,
    dependencyInstability: 43,
    authFailures: 4,
    realtimeDisconnects: 0,
    storageSyncFailures: 9,
    recentChange: 'upstream schema migration 42m ago',
    recentIncidents: ['submit timeout spike', 'storage acknowledgement mismatch'],
    downstreamModules: ['funnel_handoff', 'ops_console'],
    explanation: 'Submission writes are timing out after a schema migration and retries are now compounding queue pressure downstream.',
  },
  {
    id: 'funnel_handoff',
    name: 'Funnel Handoff',
    layer: 'routing_cache',
    status: 'degraded',
    health: 'warning',
    occupancy: 39,
    latencyMs: 336,
    errorRate: 5.3,
    failedRetries: 7,
    dependencyInstability: 55,
    authFailures: 11,
    realtimeDisconnects: 0,
    storageSyncFailures: 2,
    recentChange: 'handoff callback retried with stale token',
    recentIncidents: ['logic mismatch between submission and handoff'],
    downstreamModules: ['owner_room', 'portfolio_service'],
    explanation: 'Handoffs are being emitted even when upstream submission proofs are missing, indicating instrumentation drift or stale replay.',
  },
  {
    id: 'owner_room',
    name: 'Owner Room Runtime',
    layer: 'realtime_services',
    status: 'degraded',
    health: 'warning',
    occupancy: 12,
    latencyMs: 418,
    errorRate: 4.1,
    failedRetries: 5,
    dependencyInstability: 34,
    authFailures: 0,
    realtimeDisconnects: 14,
    storageSyncFailures: 1,
    recentChange: 'transport fallback enabled 9m ago',
    recentIncidents: ['stream lag', 'operator response delay'],
    downstreamModules: ['ops_console'],
    explanation: 'Realtime transport has intermittent disconnects and queue buildup, but fallback keeps the room partially live.',
  },
  {
    id: 'portfolio_service',
    name: 'Portfolio Service',
    layer: 'data',
    status: 'online',
    health: 'stable',
    occupancy: 64,
    latencyMs: 124,
    errorRate: 0.8,
    failedRetries: 1,
    dependencyInstability: 12,
    authFailures: 2,
    realtimeDisconnects: 0,
    storageSyncFailures: 0,
    recentChange: 'read replica warm and current',
    recentIncidents: ['none in last 6h'],
    downstreamModules: ['ops_console'],
    explanation: 'Stable because replica lag is normal, retry pressure is low, and dependent query paths are proving healthy.',
  },
  {
    id: 'knowledge_index',
    name: 'Knowledge Index',
    layer: 'data',
    status: 'recovering',
    health: 'warning',
    occupancy: 18,
    latencyMs: 287,
    errorRate: 2.2,
    failedRetries: 4,
    dependencyInstability: 21,
    authFailures: 0,
    realtimeDisconnects: 0,
    storageSyncFailures: 7,
    recentChange: 'partial reindex started 13m ago',
    recentIncidents: ['retrieval drift'],
    downstreamModules: ['owner_room'],
    explanation: 'Index is recovering from stale embeddings; retrieval quality is acceptable but not yet back to baseline.',
  },
  {
    id: 'ops_console',
    name: 'Ops Console',
    layer: 'admin_ops',
    status: 'online',
    health: 'stable',
    occupancy: 7,
    latencyMs: 98,
    errorRate: 0.4,
    failedRetries: 0,
    dependencyInstability: 9,
    authFailures: 0,
    realtimeDisconnects: 0,
    storageSyncFailures: 0,
    recentChange: 'operator approvals cache refreshed',
    recentIncidents: ['none in last 24h'],
    downstreamModules: [],
    explanation: 'Admin surface is stable and rendering current state from live evidence without queue backlog.',
  },
];

const TRAFFIC_SOURCES: TrafficSourceRecord[] = [
  {
    id: 'organic_search',
    name: 'Organic Search',
    health: 'healthy',
    detectedIntent: 'audit software health',
    qualityScore: 88,
    count: 148,
    authSessions: 22,
    anonSessions: 126,
    routePath: ['landing', 'auth', 'owner_room'],
    anomalyFlag: null,
    entryPoint: 'landing',
    destinationModules: ['auth_gateway', 'owner_room'],
  },
  {
    id: 'partner_referral',
    name: 'Partner Referral',
    health: 'degraded',
    detectedIntent: 'submit lead / request review',
    qualityScore: 71,
    count: 64,
    authSessions: 17,
    anonSessions: 47,
    routePath: ['landing', 'lead_api', 'funnel_handoff'],
    anomalyFlag: 'drop after submission',
    entryPoint: 'landing',
    destinationModules: ['lead_api', 'funnel_handoff'],
  },
  {
    id: 'campaign_paid_social',
    name: 'Paid Social',
    health: 'suspicious',
    detectedIntent: 'broad low-intent acquisition',
    qualityScore: 41,
    count: 96,
    authSessions: 6,
    anonSessions: 90,
    routePath: ['landing', 'cta', 'lead_api'],
    anomalyFlag: 'quality decay + bounce cluster',
    entryPoint: 'landing',
    destinationModules: ['edge_router', 'lead_api'],
  },
  {
    id: 'direct_owner_link',
    name: 'Direct Owner Link',
    health: 'healthy',
    detectedIntent: 'operator escalation',
    qualityScore: 94,
    count: 13,
    authSessions: 12,
    anonSessions: 1,
    routePath: ['owner_room', 'ops_console'],
    anomalyFlag: null,
    entryPoint: 'owner_room',
    destinationModules: ['owner_room', 'ops_console'],
  },
];

const FUNNEL_COUNTS = {
  visitors: 428,
  ctaClicks: 134,
  formStarts: 79,
  submissions: 28,
  apiOk: 7,
  handoffs: 18,
};

const CHAT_ROOMS: ChatRoomRecord[] = [
  {
    id: 'room_owner_primary',
    name: 'Owner Primary',
    roomStatus: 'degraded',
    activeUsers: 2,
    typingUsers: 1,
    stuckConversations: 2,
    failedMessages: 3,
    lastWrite: '14s ago',
    realtimeTransportStatus: 'degraded',
    messageDeliveryHealth: 'warning',
    incidentWithoutOperator: false,
    escalationGap: false,
    proof: 'Fallback transport is active, last assistant turn verified, queue remains above baseline.',
  },
  {
    id: 'room_ops_escalation',
    name: 'Ops Escalation',
    roomStatus: 'idle',
    activeUsers: 0,
    typingUsers: 0,
    stuckConversations: 0,
    failedMessages: 0,
    lastWrite: '11m ago',
    realtimeTransportStatus: 'connected',
    messageDeliveryHealth: 'healthy',
    incidentWithoutOperator: true,
    escalationGap: true,
    proof: 'Incident severity is above threshold, but no operator presence is detected in the escalation room.',
  },
];

const DEPENDENCIES: DependencyRecord[] = [
  { id: 'dep_1', from: 'edge_router', to: 'auth_gateway', type: 'policy_checks', degraded: true },
  { id: 'dep_2', from: 'edge_router', to: 'lead_api', type: 'fetch_query', degraded: true },
  { id: 'dep_3', from: 'auth_gateway', to: 'owner_room', type: 'auth_validation', degraded: true },
  { id: 'dep_4', from: 'lead_api', to: 'funnel_handoff', type: 'fetch_query', degraded: true },
  { id: 'dep_5', from: 'knowledge_index', to: 'owner_room', type: 'cache_subscribe', degraded: false },
  { id: 'dep_6', from: 'owner_room', to: 'ops_console', type: 'realtime_events', degraded: true },
  { id: 'dep_7', from: 'portfolio_service', to: 'ops_console', type: 'fetch_query', degraded: false },
  { id: 'dep_8', from: 'auth_gateway', to: 'lead_api', type: 'auth_validation', degraded: true },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeRiskScore(module: ModuleRecord): number {
  const score =
    module.errorRate * 3.1 +
    (module.latencyMs / 12) * 0.6 +
    module.failedRetries * 1.8 +
    module.dependencyInstability * 0.45 +
    module.authFailures * 0.75 +
    module.realtimeDisconnects * 1.2 +
    module.storageSyncFailures * 1.6;

  return Math.round(clamp(score, 4, 100));
}

function computeConfidence(module: ModuleRecord): number {
  const basis = module.recentIncidents.length > 0 ? 0.72 : 0.58;
  const weighted = basis + Math.min(0.22, module.dependencyInstability / 200) + Math.min(0.1, module.failedRetries / 100);
  return Number(clamp(weighted, 0.55, 0.96).toFixed(2));
}

function getPrimaryRiskDriver(module: ModuleRecord): string {
  const drivers = [
    { label: 'error rate surge', value: module.errorRate * 2.2 },
    { label: 'latency drift', value: module.latencyMs / 40 },
    { label: 'retry exhaustion', value: module.failedRetries * 1.6 },
    { label: 'dependency instability', value: module.dependencyInstability },
    { label: 'auth failure cluster', value: module.authFailures * 3.1 },
    { label: 'realtime disconnects', value: module.realtimeDisconnects * 2.4 },
    { label: 'storage sync failure', value: module.storageSyncFailures * 2.8 },
  ];

  drivers.sort((a, b) => b.value - a.value);
  return drivers[0]?.label ?? 'baseline variation';
}

function createIncident(module: ModuleRecord, riskScore: number): IncidentRecord | null {
  if (riskScore < 55 && module.health === 'stable') return null;

  const severity: IncidentRecord['severity'] = riskScore >= 85 || module.health === 'critical'
    ? 'critical'
    : riskScore >= 70
      ? 'high'
      : 'medium';

  const reason = module.health === 'critical'
    ? `${module.name} is failing under live traffic and affecting ${module.downstreamModules.length} downstream modules.`
    : `${module.name} is degrading with elevated ${getPrimaryRiskDriver(module)}.`;

  const actionability: AlertDisposition = severity === 'critical'
    ? 'require_approval'
    : riskScore >= 65
      ? 'recommend_action'
      : 'observe_only';

  return {
    id: `inc_${module.id}`,
    moduleId: module.id,
    title: `${module.name} ${module.health === 'critical' ? 'failure' : 'drift detected'}`,
    reason,
    severity,
    blastRadius: clamp(module.downstreamModules.length + Math.round(module.occupancy / 20), 1, 10),
    downstreamModules: module.downstreamModules,
    actionability,
    status: severity === 'critical' ? 'mitigating' : 'monitoring',
  };
}

function buildRecommendations(modules: ModuleRecord[], incidents: IncidentRecord[]): RecommendationRecord[] {
  const recs: RecommendationRecord[] = [];

  for (const incident of incidents) {
    const module = modules.find((item) => item.id === incident.moduleId);
    if (!module) continue;

    const confidence = computeConfidence(module);
    const severity = incident.severity;
    const commandType: CommandMode = severity === 'critical' ? 'approval' : module.health === 'warning' ? 'manual' : 'auto';
    const command =
      module.id === 'lead_api'
        ? 'retry_api(lead_api, /v1/submit-lead)'
        : module.id === 'funnel_handoff'
          ? 'replay_funnel_session(session_handoff_cluster_7)'
          : module.id === 'owner_room'
            ? 'validate_realtime_channel(owner_primary_room)'
            : module.id === 'auth_gateway'
              ? 'inspect_auth_failures(auth_gateway)'
              : `rerun_health_probe(${module.id})`;

    recs.push({
      id: `rec_${module.id}`,
      targetModuleId: module.id,
      reason: incident.reason,
      confidence,
      blastRadius: incident.blastRadius,
      severity,
      commandType,
      command,
      disposition: commandType === 'approval' ? 'require_approval' : 'recommend_action',
    });
  }

  recs.push({
    id: 'rec_trace_paid_social',
    targetModuleId: 'edge_router',
    reason: 'Paid social traffic quality is low and downstream submit failures are inflating wasted acquisition cost.',
    confidence: 0.81,
    blastRadius: 7,
    severity: 'high',
    commandType: 'manual',
    command: 'trace_request_flow(campaign_paid_social, lead_api)',
    disposition: 'recommend_action',
  });

  return recs.sort((a, b) => b.blastRadius - a.blastRadius || b.confidence - a.confidence);
}

function buildApprovals(recommendations: RecommendationRecord[]): ApprovalRecord[] {
  return recommendations
    .filter((item) => item.commandType === 'approval')
    .map((item) => ({
      id: `approval_${item.id}`,
      moduleId: item.targetModuleId,
      title: `Approval required for ${item.targetModuleId}`,
      reason: item.reason,
      command: item.command,
      approver: 'owner_admin',
    }));
}

function buildFunnelStages(): FunnelStageRecord[] {
  const { visitors, ctaClicks, formStarts, submissions, apiOk, handoffs } = FUNNEL_COUNTS;
  const stages = [
    {
      id: 'visitors',
      name: 'Visitors',
      count: visitors,
      delta5m: 42,
      delta1h: 188,
      conversionRate: 100,
      dropOffRate: 0,
      failureReason: null,
      impactedModules: ['edge_router'],
    },
    {
      id: 'cta_clicks',
      name: 'CTA Clicks',
      count: ctaClicks,
      delta5m: 13,
      delta1h: 61,
      conversionRate: Math.round((ctaClicks / visitors) * 100),
      dropOffRate: Math.round(((visitors - ctaClicks) / visitors) * 100),
      failureReason: 'low-intent paid social cohort diluting CTA conversion',
      impactedModules: ['edge_router'],
    },
    {
      id: 'form_starts',
      name: 'Form Starts',
      count: formStarts,
      delta5m: 7,
      delta1h: 32,
      conversionRate: Math.round((formStarts / ctaClicks) * 100),
      dropOffRate: Math.round(((ctaClicks - formStarts) / ctaClicks) * 100),
      failureReason: 'auth preflight prompt adds friction for anon users',
      impactedModules: ['auth_gateway'],
    },
    {
      id: 'submissions',
      name: 'Submissions',
      count: submissions,
      delta5m: -3,
      delta1h: 11,
      conversionRate: Math.round((submissions / formStarts) * 100),
      dropOffRate: Math.round(((formStarts - submissions) / formStarts) * 100),
      failureReason: 'submit endpoint latency spike',
      impactedModules: ['lead_api'],
    },
    {
      id: 'api_ok',
      name: 'API OK',
      count: apiOk,
      delta5m: -4,
      delta1h: 5,
      conversionRate: Math.round((apiOk / Math.max(submissions, 1)) * 100),
      dropOffRate: Math.round(((submissions - apiOk) / Math.max(submissions, 1)) * 100),
      failureReason: 'write acknowledgement mismatch after migration',
      impactedModules: ['lead_api', 'knowledge_index'],
    },
    {
      id: 'handoffs',
      name: 'Handoffs',
      count: handoffs,
      delta5m: 5,
      delta1h: 12,
      conversionRate: Math.round((handoffs / Math.max(apiOk, 1)) * 100),
      dropOffRate: 0,
      failureReason: 'logic anomaly: handoff emitter exceeds upstream proof count',
      impactedModules: ['funnel_handoff', 'auth_gateway'],
    },
  ];

  return stages;
}

function buildDropOffAnalysis(funnel: FunnelStageRecord[]): DropOffAnalysis {
  const worstStage = [...funnel].sort((a, b) => b.dropOffRate - a.dropOffRate)[0];
  const logicAnomaly = funnel.find((stage) => stage.id === 'handoffs')?.count && funnel.find((stage) => stage.id === 'api_ok')?.count === 0
    ? 'handoffs observed while API OK is zero'
    : FUNNEL_COUNTS.handoffs > FUNNEL_COUNTS.apiOk
      ? 'handoffs exceed upstream API success proofs; likely instrumentation mismatch or stale replay emitter'
      : null;

  return {
    largestDropOffPoint: worstStage?.name ?? 'Unknown',
    probableCause: worstStage?.id === 'api_ok'
      ? 'Lead Capture API failures are collapsing submit acknowledgements before handoff proof is written.'
      : 'Auth friction and low-quality traffic are creating upstream abandonment.',
    impactedApis: ['POST /v1/submit-lead', 'POST /v1/handoff-session'],
    impactedModules: Array.from(new Set((worstStage?.impactedModules ?? []).concat(['funnel_handoff']))),
    recommendedDebugCommand: worstStage?.id === 'api_ok'
      ? 'diff_latency_baseline(lead_api, 1h)'
      : 'trace_request_flow(partner_referral, funnel_handoff)',
    logicAnomaly,
  };
}

function buildRiskModules(modules: ModuleRecord[]): RiskModuleRecord[] {
  return modules.map((module) => {
    const riskScore = computeRiskScore(module);
    const confidence = computeConfidence(module);
    const primaryRiskDriver = getPrimaryRiskDriver(module);

    return {
      moduleId: module.id,
      riskScore,
      status: module.health,
      primaryRiskDriver,
      confidence,
      recentIncidentHistory: module.recentIncidents,
      dependencySensitivity: module.downstreamModules.length >= 2 ? 'high' : module.downstreamModules.length === 1 ? 'medium' : 'low',
      suggestedIntervention:
        module.id === 'lead_api'
          ? 'audit_storage_sync(lead_api)'
          : module.id === 'owner_room'
            ? 'validate_realtime_channel(owner_primary_room)'
            : module.id === 'auth_gateway'
              ? 'inspect_auth_failures(auth_gateway)'
              : `rerun_health_probe(${module.id})`,
      whyStableOrAtRisk: module.health === 'stable'
        ? `Stable because ${module.explanation.toLowerCase()}`
        : `At risk because ${module.explanation.toLowerCase()}`,
      recentChange: module.recentChange,
      factors: {
        errorRate: module.errorRate,
        latencyDrift: module.latencyMs,
        failedRetries: module.failedRetries,
        dependencyInstability: module.dependencyInstability,
        authFailures: module.authFailures,
        realtimeDisconnects: module.realtimeDisconnects,
        storageSyncFailures: module.storageSyncFailures,
      },
    };
  }).sort((a, b) => b.riskScore - a.riskScore);
}

function buildArchitectureNodes(modules: ModuleRecord[]): ArchitectureNodeRecord[] {
  return modules.map((module) => ({
    id: module.id,
    name: module.name,
    layer: module.layer,
    healthState: module.health,
    latencyMs: module.latencyMs,
    dependencyLinks: module.downstreamModules,
    criticalPathStatus: module.health === 'critical' ? 'blocked' : module.health === 'warning' ? 'degraded' : 'clear',
    liveIssues: module.recentIncidents[0] === 'none in last 24h' || module.recentIncidents[0] === 'none in last 6h' ? [] : module.recentIncidents,
    affectedDownstreamSystems: module.downstreamModules,
    rootIssue: getPrimaryRiskDriver(module),
    recommendedRecoveryCommand:
      module.id === 'lead_api'
        ? 'retry_api(lead_api, /v1/submit-lead)'
        : module.id === 'funnel_handoff'
          ? 'replay_funnel_session(session_handoff_cluster_7)'
          : `isolate_dependency(${module.id})`,
  }));
}

function buildCommands(recommendations: RecommendationRecord[], incidents: IncidentRecord[]): CommandRecord[] {
  return recommendations.map((item) => ({
    id: `cmd_${item.id}`,
    moduleId: item.targetModuleId,
    incidentId: incidents.find((incident) => incident.moduleId === item.targetModuleId)?.id ?? null,
    title: `${item.targetModuleId} intervention`,
    command: item.command,
    mode: item.commandType,
    reason: item.reason,
  }));
}

export function buildNerveCenterSnapshot(): NerveCenterSnapshot {
  const modules = MODULES;
  const riskModules = buildRiskModules(modules);
  const incidents = modules
    .map((module) => createIncident(module, computeRiskScore(module)))
    .filter((item): item is IncidentRecord => item !== null)
    .sort((a, b) => b.blastRadius - a.blastRadius);
  const recommendations = buildRecommendations(modules, incidents);
  const approvals = buildApprovals(recommendations);
  const funnel = buildFunnelStages();
  const dropOffAnalysis = buildDropOffAnalysis(funnel);
  const architectureNodes = buildArchitectureNodes(modules);
  const commands = buildCommands(recommendations, incidents);

  const authSessions = TRAFFIC_SOURCES.reduce((sum, source) => sum + source.authSessions, 0);
  const anonSessions = TRAFFIC_SOURCES.reduce((sum, source) => sum + source.anonSessions, 0);
  const onlineModulesCount = modules.filter((module) => module.status === 'online' || module.status === 'recovering' || module.status === 'degraded').length;
  const globalStatus: HealthState = incidents.some((incident) => incident.severity === 'critical')
    ? 'critical'
    : incidents.length > 2
      ? 'warning'
      : 'stable';

  return {
    asOf: new Date().toISOString(),
    globalStatus,
    activeIncidentsCount: incidents.length,
    onlineModulesCount,
    authSessions,
    anonSessions,
    alertsInProgress: incidents.filter((incident) => incident.status !== 'open').length,
    healActionsAttempted: 6,
    modules,
    incidents,
    recommendations,
    approvals,
    trafficSources: TRAFFIC_SOURCES,
    funnel,
    dropOffAnalysis,
    riskModules,
    chatRooms: CHAT_ROOMS,
    architectureNodes,
    dependencies: DEPENDENCIES,
    commands,
  };
}
