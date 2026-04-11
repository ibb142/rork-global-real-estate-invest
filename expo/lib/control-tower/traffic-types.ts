export type TrafficSourceId =
  | 'instagram'
  | 'google_organic'
  | 'google_ads'
  | 'tiktok'
  | 'facebook'
  | 'whatsapp'
  | 'email_campaign'
  | 'direct'
  | 'referral'
  | 'influencer'
  | 'unknown'
  | 'dark_traffic';

export type UserIntent =
  | 'browsing_deals'
  | 'investing'
  | 'joining_waitlist'
  | 'support_help'
  | 'chat_engagement'
  | 'returning_portfolio'
  | 'admin_operator'
  | 'unknown';

export type JourneyStep =
  | 'source_entry'
  | 'landing_visit'
  | 'section_viewed'
  | 'cta_clicked'
  | 'form_started'
  | 'form_submitted'
  | 'api_call'
  | 'supabase_write'
  | 'auth_signup'
  | 'app_opened'
  | 'first_module'
  | 'deal_browse'
  | 'deal_detail'
  | 'chat_entry'
  | 'invest_flow'
  | 'portfolio_view'
  | 'retained';

export type FrictionType =
  | 'slow_landing'
  | 'broken_cta'
  | 'failed_form'
  | 'auth_failure'
  | 'handoff_failure'
  | 'api_failure'
  | 'chat_degradation'
  | 'upload_failure'
  | 'invest_stall';

export type TrafficEventType =
  | 'source_detected'
  | 'source_journey_step'
  | 'source_intent_inferred'
  | 'source_friction_detected'
  | 'source_outcome_recorded'
  | 'source_prediction_raised';

export interface TrafficEvent {
  type: TrafficEventType;
  sessionId: string;
  sourceId: TrafficSourceId;
  timestamp: string;
  step?: JourneyStep;
  intent?: UserIntent;
  frictionType?: FrictionType;
  metadata?: Record<string, string | number | boolean>;
}

export interface TrafficSourceMeta {
  id: TrafficSourceId;
  label: string;
  color: string;
  icon: string;
}

export const TRAFFIC_SOURCE_META: Record<TrafficSourceId, TrafficSourceMeta> = {
  instagram: { id: 'instagram', label: 'Instagram', color: '#E1306C', icon: 'Instagram' },
  google_organic: { id: 'google_organic', label: 'Google', color: '#4285F4', icon: 'Search' },
  google_ads: { id: 'google_ads', label: 'Google Ads', color: '#34A853', icon: 'Megaphone' },
  tiktok: { id: 'tiktok', label: 'TikTok', color: '#00F2EA', icon: 'Music' },
  facebook: { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: 'Facebook' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: 'MessageCircle' },
  email_campaign: { id: 'email_campaign', label: 'Email', color: '#FF6F00', icon: 'Mail' },
  direct: { id: 'direct', label: 'Direct', color: '#78909C', icon: 'Globe' },
  referral: { id: 'referral', label: 'Referral', color: '#AB47BC', icon: 'Link2' },
  influencer: { id: 'influencer', label: 'Influencer', color: '#FF4081', icon: 'Star' },
  unknown: { id: 'unknown', label: 'Unknown', color: '#546E7A', icon: 'HelpCircle' },
  dark_traffic: { id: 'dark_traffic', label: 'Dark Traffic', color: '#263238', icon: 'EyeOff' },
};

export const ALL_TRAFFIC_SOURCES: TrafficSourceId[] = [
  'instagram', 'google_organic', 'google_ads', 'tiktok', 'facebook',
  'whatsapp', 'email_campaign', 'direct', 'referral', 'influencer',
  'unknown', 'dark_traffic',
];

export const JOURNEY_STEP_LABELS: Record<JourneyStep, string> = {
  source_entry: 'Source Entry',
  landing_visit: 'Landing Visit',
  section_viewed: 'Section View',
  cta_clicked: 'CTA Click',
  form_started: 'Form Start',
  form_submitted: 'Form Submit',
  api_call: 'API Call',
  supabase_write: 'DB Write',
  auth_signup: 'Auth/Signup',
  app_opened: 'App Open',
  first_module: 'First Module',
  deal_browse: 'Deal Browse',
  deal_detail: 'Deal Detail',
  chat_entry: 'Chat Entry',
  invest_flow: 'Invest Flow',
  portfolio_view: 'Portfolio',
  retained: 'Retained',
};

export const INTENT_LABELS: Record<UserIntent, string> = {
  browsing_deals: 'Browsing Deals',
  investing: 'Investing',
  joining_waitlist: 'Joining Waitlist',
  support_help: 'Support/Help',
  chat_engagement: 'Chat Engagement',
  returning_portfolio: 'Returning User',
  admin_operator: 'Admin/Operator',
  unknown: 'Unknown',
};

export const INTENT_COLORS: Record<UserIntent, string> = {
  browsing_deals: '#448AFF',
  investing: '#00E676',
  joining_waitlist: '#FFB300',
  support_help: '#FF6D00',
  chat_engagement: '#E040FB',
  returning_portfolio: '#00BCD4',
  admin_operator: '#9C27B0',
  unknown: '#546E7A',
};

export const FRICTION_LABELS: Record<FrictionType, string> = {
  slow_landing: 'Slow Landing',
  broken_cta: 'Broken CTA',
  failed_form: 'Failed Form',
  auth_failure: 'Auth Failure',
  handoff_failure: 'Handoff Fail',
  api_failure: 'API Failure',
  chat_degradation: 'Chat Issue',
  upload_failure: 'Upload Fail',
  invest_stall: 'Invest Stall',
};

export interface TrafficSourceSnapshot {
  sourceId: TrafficSourceId;
  activeNow: number;
  last5m: number;
  last1h: number;
  last24h: number;
  ctaClickRate: number;
  signupRate: number;
  appOpenRate: number;
  qualityScore: number;
  affectedByIncident: number;
  journeySteps: Partial<Record<JourneyStep, number>>;
  intents: Partial<Record<UserIntent, number>>;
  topIntent: UserIntent;
  outcomes: TrafficOutcome;
  frictions: TrafficFriction[];
  healthState: 'healthy' | 'friction' | 'degraded' | 'blocked';
  businessOutcomeScore: number;
}

export interface TrafficOutcome {
  bounceRate: number;
  leadConversion: number;
  signupConversion: number;
  appHandoffSuccess: number;
  firstMeaningfulAction: number;
  chatOpenRate: number;
  dealViewRate: number;
  investInitRate: number;
  returnRate: number;
}

export interface TrafficFriction {
  type: FrictionType;
  count: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedUsers: number;
}

export interface TrafficPrediction {
  sourceId: TrafficSourceId;
  score: number;
  trend: 'rising' | 'stable' | 'falling';
  prediction: string;
  confidence: number;
  factors: TrafficPredictiveFactor[];
}

export interface TrafficPredictiveFactor {
  name: string;
  value: number;
  status: 'normal' | 'elevated' | 'critical';
}

export interface TrafficNodeConnection {
  fromSourceId: TrafficSourceId;
  toModuleId: string;
  volume: number;
  healthColor: string;
}

export interface TrafficIntelSnapshot {
  sources: TrafficSourceSnapshot[];
  connections: TrafficNodeConnection[];
  predictions: TrafficPrediction[];
  totalVisitors: number;
  totalAuthenticated: number;
  totalAnonymous: number;
  topSource: TrafficSourceId;
  topIntent: UserIntent;
  overallQualityScore: number;
  lastUpdated: string;
}

export interface TrafficSessionRecord {
  sessionId: string;
  sourceId: TrafficSourceId;
  intent: UserIntent;
  currentStep: JourneyStep;
  enteredAt: number;
  lastSeenAt: number;
  stepsVisited: JourneyStep[];
  frictions: FrictionType[];
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  campaignId?: string;
  deepLinkSource?: string;
  fingerprint?: string;
}
