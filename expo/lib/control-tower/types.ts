export type CTModuleId =
  | 'home'
  | 'invest'
  | 'market'
  | 'portfolio'
  | 'chat'
  | 'profile'
  | 'analytics'
  | 'admin_dashboard'
  | 'admin_publish_deal'
  | 'user_invest_flow'
  | 'realtime_sync'
  | 'photo_protection'
  | 'trash_recovery'
  | 'storage_isolation'
  | 'landing'
  | 'settings'
  | 'email'
  | 'ai_ops';

export type CTFlowStep =
  | 'browsing'
  | 'detail_view'
  | 'amount_entered'
  | 'document_upload'
  | 'payment_step'
  | 'confirmation'
  | 'chat_room_open'
  | 'message_sending'
  | 'upload_in_progress'
  | 'fallback_entered'
  | 'recovery_completed'
  | 'idle'
  | 'landing_visit'
  | 'landing_section_view'
  | 'landing_cta_clicked'
  | 'landing_form_started'
  | 'landing_form_submitted'
  | 'landing_api_started'
  | 'landing_api_succeeded'
  | 'landing_api_failed'
  | 'handoff_to_app_started'
  | 'handoff_to_app_succeeded';

export type CTEventType =
  | 'enter_module'
  | 'exit_module'
  | 'step_change'
  | 'action_start'
  | 'action_success'
  | 'action_fail'
  | 'fallback_entered'
  | 'retry_triggered'
  | 'recovered'
  | 'degraded_detected'
  | 'critical_detected'
  | 'autoheal_triggered'
  | 'operator_action_taken'
  | 'prediction_raised'
  | 'landing_visit'
  | 'landing_cta_clicked'
  | 'landing_form_started'
  | 'landing_form_submitted'
  | 'landing_api_started'
  | 'landing_api_succeeded'
  | 'landing_api_failed'
  | 'handoff_to_app';

export type CTHealthState = 'healthy' | 'degraded' | 'critical' | 'unknown';

export type CTOperatorAction =
  | 'rerun_health_probe'
  | 'reconnect_realtime'
  | 'clear_stale_cache'
  | 'retry_safe_rpc'
  | 'switch_fallback'
  | 'reopen_subscriptions'
  | 'notify_admin'
  | 'transition_stuck_sends'
  | 'retry_landing_api'
  | 'failover_lead_capture'
  | 'invalidate_query_cache';

export interface CTEvent {
  id: string;
  type: CTEventType;
  module: CTModuleId;
  step?: CTFlowStep;
  sessionId: string;
  userId?: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface CTModulePresence {
  moduleId: CTModuleId;
  activeNow: number;
  last5m: number;
  last1h: number;
  authenticated: number;
  anonymous: number;
  degradedAffected: number;
  criticalAffected: number;
  byStep: Record<string, number>;
}

export interface CTModuleHealth {
  moduleId: CTModuleId;
  state: CTHealthState;
  latencyMs: number;
  errorRate: number;
  retryRate: number;
  degradedCount: number;
  criticalCount: number;
  fallbackCount: number;
  affectedUsers: number;
  lastChecked: string;
  riskScore: number;
  riskTrend: 'rising' | 'stable' | 'falling';
  riskFactors: string[];
}

export interface CTChatRoomSnapshot {
  roomId: string;
  roomName: string;
  activeUsers: number;
  typingUsers: number;
  mode: 'shared_live' | 'shared_polling' | 'shared_alternate' | 'shared_snapshot' | 'local_fallback' | 'unknown';
  stuckSends: number;
  failedSends: number;
  uploadsInProgress: number;
  isDegraded: boolean;
  lastActivity: string;
  lastSharedWrite: string;
  lastRealtimeEvent: string;
}

export interface CTIncident {
  id: string;
  module: CTModuleId;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  affectedUsers: number;
  suggestedAction: CTOperatorAction;
  timestamp: string;
  resolved: boolean;
  correlationId?: string;
  decisionAnalysis?: CTDecisionAnalysis;
}

export interface CTLandingFunnelSnapshot {
  activeVisitors: number;
  visitorsLast5m: number;
  visitorsLast1h: number;
  ctaClicks: number;
  ctaClickRate: number;
  formStarts: number;
  formSubmits: number;
  formSubmitRate: number;
  apiCalls: number;
  apiSuccesses: number;
  apiFailures: number;
  apiSuccessRate: number;
  handoffsStarted: number;
  handoffsCompleted: number;
  dropOffPoints: Array<{ step: string; count: number; rate: number }>;
  topReferrers: Array<{ source: string; count: number }>;
  avgLatencyMs: number;
}

export interface CTPredictiveScore {
  moduleId: CTModuleId;
  score: number;
  trend: 'rising' | 'stable' | 'falling';
  factors: CTPredictiveFactor[];
  prediction: string;
  confidence: number;
  estimatedTimeToIncident: number | null;
}

export interface CTPredictiveFactor {
  name: string;
  weight: number;
  value: number;
  threshold: number;
  status: 'normal' | 'elevated' | 'critical';
}

export interface CTDecisionAnalysis {
  likelyCause: string;
  involvedModules: CTModuleId[];
  affectedUsers: number;
  estimatedSeverity: 'low' | 'medium' | 'high' | 'critical';
  businessImpact: string;
  safeActions: CTOperatorAction[];
  approvalActions: string[];
  correlationIds: string[];
  logs: string[];
}

export interface CTAutoRemediationLog {
  id: string;
  action: CTOperatorAction;
  module: CTModuleId;
  triggeredAt: string;
  result: 'success' | 'failed' | 'skipped';
  message: string;
  durationMs: number;
  incidentId?: string;
}

export interface CTDashboardSnapshot {
  modules: CTModulePresence[];
  health: CTModuleHealth[];
  chatRooms: CTChatRoomSnapshot[];
  incidents: CTIncident[];
  landingFunnel: CTLandingFunnelSnapshot;
  predictions: CTPredictiveScore[];
  autoRemediations: CTAutoRemediationLog[];
  trafficIntel: CTTrafficIntelRef | null;
  totalActiveUsers: number;
  totalAuthenticated: number;
  totalAnonymous: number;
  systemHealth: CTHealthState;
  systemRiskScore: number;
  lastUpdated: string;
}

export interface CTTrafficIntelRef {
  available: true;
}

export const CT_MODULE_LABELS: Record<CTModuleId, string> = {
  home: 'Home',
  invest: 'Invest',
  market: 'Market',
  portfolio: 'Portfolio',
  chat: 'Chat',
  profile: 'Profile',
  analytics: 'Analytics',
  admin_dashboard: 'Admin Dashboard',
  admin_publish_deal: 'Publish Deal',
  user_invest_flow: 'Invest Flow',
  realtime_sync: 'Realtime Sync',
  photo_protection: 'Photo Protection',
  trash_recovery: 'Trash & Recovery',
  storage_isolation: 'Storage Isolation',
  landing: 'Landing Page',
  settings: 'Settings',
  email: 'Email',
  ai_ops: 'AI Ops',
};

export const CT_MODULE_ICONS: Record<CTModuleId, string> = {
  home: 'Home',
  invest: 'TrendingUp',
  market: 'BarChart3',
  portfolio: 'PieChart',
  chat: 'MessageSquare',
  profile: 'User',
  analytics: 'Activity',
  admin_dashboard: 'LayoutDashboard',
  admin_publish_deal: 'FileText',
  user_invest_flow: 'DollarSign',
  realtime_sync: 'Radio',
  photo_protection: 'Shield',
  trash_recovery: 'Trash2',
  storage_isolation: 'Lock',
  landing: 'Globe',
  settings: 'Settings',
  email: 'Mail',
  ai_ops: 'Cpu',
};

export const CT_STEP_LABELS: Record<CTFlowStep, string> = {
  browsing: 'Browsing',
  detail_view: 'Detail View',
  amount_entered: 'Amount Entered',
  document_upload: 'Doc Upload',
  payment_step: 'Payment',
  confirmation: 'Confirmation',
  chat_room_open: 'Room Open',
  message_sending: 'Sending Msg',
  upload_in_progress: 'Uploading',
  fallback_entered: 'Fallback',
  recovery_completed: 'Recovered',
  idle: 'Idle',
  landing_visit: 'Visit',
  landing_section_view: 'Section View',
  landing_cta_clicked: 'CTA Click',
  landing_form_started: 'Form Start',
  landing_form_submitted: 'Form Submit',
  landing_api_started: 'API Call',
  landing_api_succeeded: 'API OK',
  landing_api_failed: 'API Fail',
  handoff_to_app_started: 'Handoff Start',
  handoff_to_app_succeeded: 'Handoff OK',
};
