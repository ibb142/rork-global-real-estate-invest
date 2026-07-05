export type {
  CTModuleId,
  CTFlowStep,
  CTEventType,
  CTHealthState,
  CTOperatorAction,
  CTEvent,
  CTModulePresence,
  CTModuleHealth,
  CTChatRoomSnapshot,
  CTIncident,
  CTDashboardSnapshot,
  CTLandingFunnelSnapshot,
  CTPredictiveScore,
  CTPredictiveFactor,
  CTDecisionAnalysis,
  CTAutoRemediationLog,
  CTProofStatus,
  CTSystemNodeKind,
  CTSystemEdgeRelationship,
  CTSystemNode,
  CTSystemEdge,
  CTEvidenceRecord,
  CTRiskAssessment,
  CTOperatorActionRun,
} from './types';

export {
  CT_MODULE_LABELS,
  CT_MODULE_ICONS,
  CT_STEP_LABELS,
} from './types';

export { controlTowerEmitter } from './event-emitter';
export { controlTowerAggregator } from './aggregator';

export {
  executeOperatorAction,
  getActionLabel,
  isActionSafe,
} from './operator-actions';

export {
  computePredictiveScore,
  computeAllPredictions,
  computeSystemRiskScore,
  getHighRiskModules,
  getRisingRisks,
} from './predictive-engine';

export { computeLandingFunnel } from './landing-funnel';

export {
  isAutoSafe,
  requiresApproval,
  getRemediationLog,
  autoRemediateIncident,
  autoRemediateFromHealth,
  getRemediationStats,
} from './auto-remediation';

export {
  analyzeIncident,
  analyzeAllIncidents,
  generateDecisionSummary,
} from './decision-engine';

export { buildProofGraphSnapshot } from './proof-graph';

export { computeTrafficIntelSnapshot, ingestLandingEvent } from './traffic-aggregator';
export { computeAllSourcePredictions, shouldRunPredictions, getSourceRisks, getRisingSourceRisks } from './traffic-predictive';
export { trafficAttribution, attributeSource, classifyIntent } from './traffic-attribution';

export type {
  TrafficSourceId,
  TrafficSourceSnapshot,
  TrafficIntelSnapshot,
  TrafficPrediction,
  TrafficNodeConnection,
  UserIntent,
  JourneyStep,
  FrictionType,
  TrafficOutcome,
  TrafficFriction,
  TrafficEventType,
  TrafficEvent,
} from './traffic-types';

export {
  TRAFFIC_SOURCE_META,
  ALL_TRAFFIC_SOURCES,
  JOURNEY_STEP_LABELS,
  INTENT_LABELS,
  INTENT_COLORS,
  FRICTION_LABELS,
} from './traffic-types';
