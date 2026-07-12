import type {
  CTAutoRemediationLog,
  CTChatRoomSnapshot,
  CTHealthState,
  CTIncident,
  CTLandingFunnelSnapshot,
  CTModuleHealth,
  CTModuleId,
  CTOperatorAction,
  CTOperatorActionRun,
  CTEvidenceRecord,
  CTPredictiveScore,
  CTProofStatus,
  CTRiskAssessment,
  CTSystemEdge,
  CTSystemNode,
} from './types';
import { CT_MODULE_LABELS } from './types';
import type { TrafficIntelSnapshot } from './traffic-types';
import { TRAFFIC_SOURCE_META } from './traffic-types';
import { getActionLabel, getOperatorActionRuns } from './operator-actions';

const PROOF_TTL_MS = 2 * 60_000;

const CORE_NODE_CONFIG: Array<{
  id: string;
  kind: CTSystemNode['kind'];
  name: string;
  criticality: CTSystemNode['criticality'];
  owner: string;
  sla: string;
  dependencies: string[];
}> = [
  {
    id: 'service:auth',
    kind: 'service',
    name: 'Auth',
    criticality: 'critical',
    owner: 'Identity',
    sla: '99.95%',
    dependencies: [],
  },
  {
    id: 'service:database',
    kind: 'service',
    name: 'Database',
    criticality: 'critical',
    owner: 'Platform',
    sla: '99.99%',
    dependencies: [],
  },
  {
    id: 'service:realtime',
    kind: 'service',
    name: 'Realtime Sync',
    criticality: 'critical',
    owner: 'Platform',
    sla: '99.9%',
    dependencies: ['service:database'],
  },
  {
    id: 'service:chat_transport',
    kind: 'service',
    name: 'Chat Transport',
    criticality: 'critical',
    owner: 'Messaging',
    sla: '99.9%',
    dependencies: ['service:realtime', 'service:database', 'service:auth'],
  },
  {
    id: 'service:ai_runtime',
    kind: 'service',
    name: 'AI Runtime',
    criticality: 'critical',
    owner: 'AI Ops',
    sla: '99.5%',
    dependencies: ['service:chat_transport'],
  },
  {
    id: 'service:knowledge_index',
    kind: 'service',
    name: 'Knowledge Index',
    criticality: 'high',
    owner: 'AI Ops',
    sla: '99.5%',
    dependencies: ['service:database', 'service:ai_runtime'],
  },
  {
    id: 'service:upload_pipeline',
    kind: 'pipeline',
    name: 'Upload Pipeline',
    criticality: 'high',
    owner: 'Storage',
    sla: '99.5%',
    dependencies: ['service:database', 'service:auth'],
  },
  {
    id: 'service:shared_room',
    kind: 'room',
    name: 'Shared Room Sync',
    criticality: 'critical',
    owner: 'Messaging',
    sla: '99.9%',
    dependencies: ['service:chat_transport', 'service:realtime'],
  },
  {
    id: 'service:inbox_sync',
    kind: 'service',
    name: 'Inbox Sync',
    criticality: 'high',
    owner: 'Messaging',
    sla: '99.9%',
    dependencies: ['service:shared_room', 'service:database'],
  },
  {
    id: 'service:traffic_ingestion',
    kind: 'pipeline',
    name: 'Traffic Ingestion',
    criticality: 'medium',
    owner: 'Growth',
    sla: '99.5%',
    dependencies: ['service:database'],
  },
  {
    id: 'service:funnel_handoff',
    kind: 'funnel_step',
    name: 'Funnel Handoff',
    criticality: 'high',
    owner: 'Growth',
    sla: '99.5%',
    dependencies: ['service:traffic_ingestion', 'service:auth', 'service:chat_transport'],
  },
];

const MODULE_DEPENDENCIES: Record<CTModuleId, string[]> = {
  home: ['service:auth'],
  invest: ['service:database', 'service:auth'],
  market: ['service:database'],
  portfolio: ['service:database', 'service:auth'],
  chat: ['service:chat_transport', 'service:ai_runtime', 'service:shared_room'],
  profile: ['service:auth', 'service:database'],
  analytics: ['service:database', 'service:traffic_ingestion'],
  admin_dashboard: ['service:database', 'service:realtime'],
  admin_publish_deal: ['service:database', 'service:auth'],
  user_invest_flow: ['service:database', 'service:auth', 'service:funnel_handoff'],
  realtime_sync: ['service:realtime', 'service:database'],
  photo_protection: ['service:upload_pipeline'],
  trash_recovery: ['service:database'],
  storage_isolation: ['service:upload_pipeline', 'service:database'],
  landing: ['service:traffic_ingestion', 'service:funnel_handoff'],
  settings: ['service:auth'],
  email: ['service:database'],
  ai_ops: ['service:ai_runtime', 'service:knowledge_index'],
};

function addTtl(iso: string): string {
  return new Date(new Date(iso).getTime() + PROOF_TTL_MS).toISOString();
}

function getProofStatusFromHealth(state: CTHealthState): CTProofStatus {
  if (state === 'critical') return 'blocked';
  if (state === 'degraded') return 'warning';
  if (state === 'healthy') return 'verified';
  return 'pending';
}

function enforceGreenPolicy(nodes: CTSystemNode[], evidenceBySubject: Map<string, CTEvidenceRecord[]>): CTSystemNode[] {
  return nodes.map((node) => {
    const proofs = evidenceBySubject.get(node.id) ?? [];
    const latestProof = proofs.sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())[0] ?? null;
    const freshnessMs = latestProof ? Date.now() - new Date(latestProof.observedAt).getTime() : Number.POSITIVE_INFINITY;
    const dependencyHealthy = node.dependencies.every((dependencyId) => {
      const dependencyNode = nodes.find((candidate) => candidate.id === dependencyId);
      return dependencyNode?.proofStatus === 'verified';
    });
    const contradictoryEvidence = proofs.some((proof) => proof.status === 'warning' || proof.status === 'blocked');

    if (node.status === 'healthy' && (!latestProof || freshnessMs > PROOF_TTL_MS || !dependencyHealthy || contradictoryEvidence || latestProof.confidence < 0.8)) {
      return {
        ...node,
        proofStatus: contradictoryEvidence ? 'warning' : 'pending',
      };
    }

    return node;
  });
}

function ensureIso(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return new Date().toISOString();
  }

  return new Date(timestamp).toISOString();
}

function inferServiceHealth(params: {
  id: string;
  healthByModule: Map<CTModuleId, CTModuleHealth>;
  chatRooms: CTChatRoomSnapshot[];
  trafficIntel: TrafficIntelSnapshot | null;
  landingFunnel: CTLandingFunnelSnapshot;
}): CTHealthState {
  const { id, healthByModule, chatRooms, trafficIntel, landingFunnel } = params;

  if (id === 'service:auth') return healthByModule.get('profile')?.state ?? 'unknown';
  if (id === 'service:database') return healthByModule.get('admin_dashboard')?.state ?? 'unknown';
  if (id === 'service:realtime') return healthByModule.get('realtime_sync')?.state ?? 'unknown';
  if (id === 'service:chat_transport') return healthByModule.get('chat')?.state ?? 'unknown';
  if (id === 'service:ai_runtime') return healthByModule.get('ai_ops')?.state ?? healthByModule.get('chat')?.state ?? 'unknown';
  if (id === 'service:knowledge_index') return healthByModule.get('ai_ops')?.state ?? 'unknown';
  if (id === 'service:upload_pipeline') return healthByModule.get('storage_isolation')?.state ?? healthByModule.get('photo_protection')?.state ?? 'unknown';
  if (id === 'service:shared_room') {
    const room = chatRooms[0] ?? null;
    if (!room) return 'unknown';
    if (room.mode === 'shared_live') return 'healthy';
    if (room.mode === 'unknown' || room.mode === 'local_fallback') return 'degraded';
    return 'healthy';
  }
  if (id === 'service:inbox_sync') return healthByModule.get('chat')?.state ?? 'unknown';
  if (id === 'service:traffic_ingestion') {
    if (!trafficIntel) return 'unknown';
    if (trafficIntel.overallQualityScore >= 75) return 'healthy';
    if (trafficIntel.overallQualityScore >= 45) return 'degraded';
    return 'critical';
  }
  if (id === 'service:funnel_handoff') {
    if (landingFunnel.apiFailures > 0 && landingFunnel.apiSuccessRate < 50) return 'critical';
    if (landingFunnel.apiFailures > 0 || landingFunnel.formSubmitRate < 35) return 'degraded';
    return 'healthy';
  }

  return 'unknown';
}

function buildEvidenceRecord(params: {
  subjectType: CTEvidenceRecord['subjectType'];
  subjectId: string;
  claim: string;
  status: CTProofStatus;
  sourceSignalId: string;
  sourceType: string;
  confidence: number;
  observedAt: string;
  dependencyBasis: string[];
  linkedEventIds?: string[];
  linkedLogRefs?: string[];
  userImpactLevel: CTEvidenceRecord['userImpactLevel'];
  proofSummary: string;
}): CTEvidenceRecord {
  return {
    id: `proof:${params.subjectId}:${params.sourceSignalId}`,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    claim: params.claim,
    status: params.status,
    sourceSignalId: params.sourceSignalId,
    sourceType: params.sourceType,
    confidence: params.confidence,
    observedAt: params.observedAt,
    expiresAt: addTtl(params.observedAt),
    dependencyBasis: params.dependencyBasis,
    linkedEventIds: params.linkedEventIds ?? [],
    linkedLogRefs: params.linkedLogRefs ?? [],
    userImpactLevel: params.userImpactLevel,
    proofSummary: params.proofSummary,
    environmentScope: 'prod',
  };
}

export function buildProofGraphSnapshot(params: {
  health: CTModuleHealth[];
  chatRooms: CTChatRoomSnapshot[];
  incidents: CTIncident[];
  predictions: CTPredictiveScore[];
  autoRemediations: CTAutoRemediationLog[];
  landingFunnel: CTLandingFunnelSnapshot;
  trafficIntel: TrafficIntelSnapshot | null;
  lastUpdated: string;
}): {
  systemNodes: CTSystemNode[];
  systemEdges: CTSystemEdge[];
  evidence: CTEvidenceRecord[];
  riskAssessments: CTRiskAssessment[];
  actionRuns: CTOperatorActionRun[];
  incidentCandidates: CTIncident[];
} {
  const healthByModule = new Map<CTModuleId, CTModuleHealth>();
  for (const item of params.health) {
    healthByModule.set(item.moduleId, item);
  }

  const evidence: CTEvidenceRecord[] = [];
  const systemNodes: CTSystemNode[] = [];
  const systemEdges: CTSystemEdge[] = [];

  for (const config of CORE_NODE_CONFIG) {
    const observedAt = ensureIso(params.lastUpdated);
    const status = inferServiceHealth({
      id: config.id,
      healthByModule,
      chatRooms: params.chatRooms,
      trafficIntel: params.trafficIntel,
      landingFunnel: params.landingFunnel,
    });
    const proof = buildEvidenceRecord({
      subjectType: config.kind,
      subjectId: config.id,
      claim: `${config.name} is ${status}`,
      status: getProofStatusFromHealth(status),
      sourceSignalId: `${config.id}:health`,
      sourceType: 'signal.probe.result',
      confidence: status === 'unknown' ? 0.35 : 0.9,
      observedAt,
      dependencyBasis: config.dependencies,
      linkedLogRefs: [`${config.id}:${status}`],
      userImpactLevel: config.criticality === 'critical' ? 'high' : config.criticality === 'high' ? 'medium' : 'low',
      proofSummary: `${config.name} resolved ${status} from current dependency signals.`,
    });
    evidence.push(proof);
    systemNodes.push({
      id: config.id,
      kind: config.kind,
      name: config.name,
      environment: 'prod',
      criticality: config.criticality,
      owner: config.owner,
      dependencies: config.dependencies,
      dependents: [],
      sla: config.sla,
      status,
      proofStatus: proof.status,
      proofIds: [proof.id],
    });
  }

  for (const moduleId of Object.keys(CT_MODULE_LABELS) as CTModuleId[]) {
    const moduleHealth = healthByModule.get(moduleId);
    const observedAt = ensureIso(moduleHealth?.lastChecked ?? params.lastUpdated);
    const proof = buildEvidenceRecord({
      subjectType: 'module',
      subjectId: `module:${moduleId}`,
      claim: `${CT_MODULE_LABELS[moduleId]} is ${moduleHealth?.state ?? 'unknown'}`,
      status: getProofStatusFromHealth(moduleHealth?.state ?? 'unknown'),
      sourceSignalId: `module:${moduleId}:health`,
      sourceType: 'signal.probe.result',
      confidence: moduleHealth?.state === 'unknown' || !moduleHealth ? 0.3 : 0.92,
      observedAt,
      dependencyBasis: MODULE_DEPENDENCIES[moduleId] ?? [],
      linkedLogRefs: [`module:${moduleId}:latency:${moduleHealth?.latencyMs ?? 0}`],
      userImpactLevel: moduleHealth?.affectedUsers && moduleHealth.affectedUsers > 10 ? 'high' : 'low',
      proofSummary: `${CT_MODULE_LABELS[moduleId]} health claim is backed by live health and prediction probes.`,
    });
    evidence.push(proof);
    systemNodes.push({
      id: `module:${moduleId}`,
      kind: 'module',
      name: CT_MODULE_LABELS[moduleId],
      environment: 'prod',
      criticality: moduleId === 'chat' || moduleId === 'user_invest_flow' ? 'critical' : 'medium',
      owner: 'Product',
      dependencies: MODULE_DEPENDENCIES[moduleId] ?? [],
      dependents: [],
      sla: moduleId === 'chat' ? '99.9%' : '99.5%',
      status: moduleHealth?.state ?? 'unknown',
      proofStatus: proof.status,
      proofIds: [proof.id],
    });
  }

  for (const node of systemNodes) {
    for (const dependencyId of node.dependencies) {
      const dependency = systemNodes.find((candidate) => candidate.id === dependencyId);
      if (dependency && !dependency.dependents.includes(node.id)) {
        dependency.dependents.push(node.id);
      }
      systemEdges.push({
        id: `edge:${node.id}:${dependencyId}`,
        fromNodeId: node.id,
        toNodeId: dependencyId,
        relationshipType: 'depends_on',
        weight: node.criticality === 'critical' ? 1 : 0.72,
        proofIds: [...node.proofIds],
      });
    }
  }

  for (const incident of params.incidents) {
    const observedAt = ensureIso(incident.timestamp);
    evidence.push(buildEvidenceRecord({
      subjectType: 'incident',
      subjectId: incident.id,
      claim: incident.title,
      status: incident.severity === 'critical' ? 'blocked' : 'warning',
      sourceSignalId: incident.correlationId ?? incident.id,
      sourceType: 'signal.incident.opened',
      confidence: incident.severity === 'critical' ? 0.94 : 0.82,
      observedAt,
      dependencyBasis: incident.decisionAnalysis?.involvedModules.map((moduleId) => `module:${moduleId}`) ?? [`module:${incident.module}`],
      linkedEventIds: incident.decisionAnalysis?.correlationIds ?? [],
      linkedLogRefs: incident.decisionAnalysis?.logs ?? [],
      userImpactLevel: incident.affectedUsers > 25 ? 'high' : incident.affectedUsers > 0 ? 'medium' : 'low',
      proofSummary: incident.description,
    }));
  }

  if (params.trafficIntel) {
    for (const source of params.trafficIntel.sources.slice(0, 6)) {
      const status: CTHealthState = source.healthState === 'blocked'
        ? 'critical'
        : source.healthState === 'degraded' || source.healthState === 'friction'
          ? 'degraded'
          : 'healthy';
      const sourceLabel = TRAFFIC_SOURCE_META[source.sourceId]?.label ?? source.sourceId;
      const observedAt = ensureIso(params.lastUpdated);
      const proof = buildEvidenceRecord({
        subjectType: 'traffic_source',
        subjectId: `traffic:${source.sourceId}`,
        claim: `${sourceLabel} traffic quality is ${status}`,
        status: getProofStatusFromHealth(status),
        sourceSignalId: `traffic:${source.sourceId}:path`,
        sourceType: 'signal.traffic.path_observed',
        confidence: 0.81,
        observedAt,
        dependencyBasis: ['service:traffic_ingestion', 'service:funnel_handoff'],
        linkedLogRefs: [`traffic:${source.sourceId}:active:${source.activeNow}`],
        userImpactLevel: source.activeNow > 100 ? 'high' : source.activeNow > 0 ? 'medium' : 'low',
        proofSummary: `${sourceLabel} traffic is mapped into the causal acquisition graph.`,
      });
      evidence.push(proof);
      systemNodes.push({
        id: `traffic:${source.sourceId}`,
        kind: 'traffic_source',
        name: sourceLabel,
        environment: 'prod',
        criticality: 'medium',
        owner: 'Growth',
        dependencies: ['service:traffic_ingestion', 'service:funnel_handoff'],
        dependents: ['module:landing'],
        sla: 'n/a',
        status,
        proofStatus: proof.status,
        proofIds: [proof.id],
      });
      systemEdges.push({
        id: `edge:traffic:${source.sourceId}:landing`,
        fromNodeId: `traffic:${source.sourceId}`,
        toNodeId: 'module:landing',
        relationshipType: status === 'critical' ? 'degrades' : 'feeds',
        weight: 0.68,
        proofIds: [proof.id],
      });
    }
  }

  const evidenceBySubject = new Map<string, CTEvidenceRecord[]>();
  for (const item of evidence) {
    const current = evidenceBySubject.get(item.subjectId) ?? [];
    current.push(item);
    evidenceBySubject.set(item.subjectId, current);
  }

  const riskAssessments: CTRiskAssessment[] = params.predictions.map((prediction) => {
    const subjectId = `module:${prediction.moduleId}`;
    const moduleHealth = healthByModule.get(prediction.moduleId);
    const node = systemNodes.find((candidate) => candidate.id === subjectId) ?? null;
    const subjectEvidence = evidenceBySubject.get(subjectId) ?? [];
    const contradictoryEvidenceCount = subjectEvidence.filter((item) => item.status === 'warning' || item.status === 'blocked').length;
    const freshestProofTime = subjectEvidence.reduce<number>((latest, item) => {
      const nextTime = new Date(item.observedAt).getTime();
      return Number.isFinite(nextTime) && nextTime > latest ? nextTime : latest;
    }, 0);
    const proofFreshnessMinutes = freshestProofTime > 0
      ? Math.max(0, Math.round((Date.now() - freshestProofTime) / 60_000))
      : 999;
    const downstreamImpact = (node?.dependents.length ?? 0) * 12;
    const frictionImpact = contradictoryEvidenceCount * 8;
    const healthImpact = moduleHealth?.affectedUsers ?? 0;
    const predictionImpact = Math.round(prediction.score * 100);
    const blastRadius = Math.max(1, healthImpact, predictionImpact + downstreamImpact + frictionImpact);

    return {
      id: `risk:${prediction.moduleId}`,
      subjectId,
      currentRiskScore: prediction.score,
      failureProbability: prediction.score,
      blastRadius,
      trendDirection: prediction.trend,
      anomalyReason: prediction.prediction,
      causeChain: [
        subjectId,
        ...(MODULE_DEPENDENCIES[prediction.moduleId] ?? []),
        ...(node?.dependents.slice(0, 2) ?? []),
      ],
      confidenceBasis: prediction.factors.map((factor) => `${factor.name}:${factor.status}`).join(', ') || 'base telemetry',
      recommendedAction: prediction.score >= 0.7 ? 'rerun_health_probe' : prediction.score >= 0.45 ? 'reconnect_realtime' : 'invalidate_query_cache',
      autoHealAvailable: prediction.score < 0.85 && contradictoryEvidenceCount <= 2,
      proofFreshnessMinutes,
      contradictoryEvidenceCount,
      computedAt: ensureIso(params.lastUpdated),
    };
  });

  const enforcedNodes = enforceGreenPolicy(systemNodes, evidenceBySubject);

  const proofIdsByModule = new Map<string, string[]>();
  for (const item of evidence) {
    const currentProofIds = proofIdsByModule.get(item.subjectId) ?? [];
    currentProofIds.push(item.id);
    proofIdsByModule.set(item.subjectId, currentProofIds);
  }

  const resolveApprovalMode = (action: CTOperatorAction): CTOperatorActionRun['approvalMode'] => {
    if (action === 'notify_admin') {
      return 'operator-approve';
    }
    if (action === 'switch_fallback') {
      return 'owner-only';
    }
    return 'auto-execute';
  };

  const resolvePolicyReason = (action: CTOperatorAction, blastRadius: number): string => {
    if (action === 'notify_admin') {
      return 'Escalation-only action when autonomous remediation confidence is not enough.';
    }
    if (blastRadius > 80) {
      return 'High blast radius restricts this action to a reviewed path.';
    }
    return 'Low blast radius and safe classification allow autonomous execution.';
  };

  const actionRunsFromPolicies: CTOperatorActionRun[] = params.autoRemediations.map((log) => {
    const targetId = `module:${log.module}`;
    const subjectProofIds = proofIdsByModule.get(targetId) ?? [];
    const linkedRisk = riskAssessments.find((item) => item.subjectId === targetId) ?? null;
    const approvalMode = resolveApprovalMode(log.action);
    return {
      id: `action:${log.id}`,
      actionType: log.action,
      targetId,
      initiatedBy: 'policy',
      approvalMode,
      input: log.message,
      startedAt: ensureIso(log.triggeredAt),
      completedAt: ensureIso(log.triggeredAt),
      result: log.result,
      beforeProofIds: subjectProofIds.slice(0, 1),
      afterProofIds: subjectProofIds.slice(1, 3),
      rollbackAvailable: log.action !== 'notify_admin',
      policyReason: resolvePolicyReason(log.action, linkedRisk?.blastRadius ?? 0),
    };
  });

  const manualRuns: CTOperatorActionRun[] = getOperatorActionRuns(30).map((run) => {
    const subjectProofIds = proofIdsByModule.get(run.targetId) ?? [];
    return {
      ...run,
      beforeProofIds: subjectProofIds.slice(0, 1),
      afterProofIds: subjectProofIds.slice(1, 3),
    };
  });

  const actionRuns = [...actionRunsFromPolicies, ...manualRuns]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 40);

  const incidentCandidates: CTIncident[] = riskAssessments
    .filter((risk) => risk.currentRiskScore >= 0.58 || risk.blastRadius >= 70 || risk.contradictoryEvidenceCount >= 2)
    .map((risk) => {
      const moduleId = risk.subjectId.replace('module:', '') as CTModuleId;
      const evidenceIds = proofIdsByModule.get(risk.subjectId) ?? [];
      const severity: CTIncident['severity'] = risk.currentRiskScore >= 0.75 || risk.blastRadius >= 90 ? 'critical' : 'warning';
      return {
        id: `incident:${moduleId}:${risk.computedAt}`,
        module: moduleId,
        severity,
        title: `${CT_MODULE_LABELS[moduleId]} risk threshold exceeded`,
        description: `${risk.anomalyReason} Blast radius ${risk.blastRadius} with ${risk.contradictoryEvidenceCount} contradictory proof(s).`,
        affectedUsers: risk.blastRadius,
        suggestedAction: risk.recommendedAction,
        timestamp: risk.computedAt,
        resolved: false,
        subjectId: risk.subjectId,
        state: 'open',
        openedBy: 'policy',
        triggerReason: 'Auto-incident threshold met from live predictive evidence.',
        rootCauseHypothesis: risk.causeChain.join(' → '),
        evidenceIds,
        timelineEventIds: evidenceIds,
        recommendedActions: [getActionLabel(risk.recommendedAction)],
        executedActions: actionRuns.filter((action) => action.targetId === risk.subjectId).map((action) => getActionLabel(action.actionType)),
      };
    });

  return {
    systemNodes: enforcedNodes,
    systemEdges,
    evidence,
    riskAssessments,
    actionRuns,
    incidentCandidates,
  };
}
