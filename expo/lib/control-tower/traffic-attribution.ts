import type {
  TrafficSourceId,
  TrafficSessionRecord,
  UserIntent,
  JourneyStep,
  FrictionType,
} from './traffic-types';

const SESSION_TTL_MS = 1800_000;
const MAX_SESSIONS = 500;
const PRUNE_INTERVAL = 60_000;

const UTM_SOURCE_MAP: Record<string, TrafficSourceId> = {
  instagram: 'instagram',
  ig: 'instagram',
  google: 'google_organic',
  tiktok: 'tiktok',
  tt: 'tiktok',
  facebook: 'facebook',
  fb: 'facebook',
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  email: 'email_campaign',
  newsletter: 'email_campaign',
  mailchimp: 'email_campaign',
  sendgrid: 'email_campaign',
};

const UTM_MEDIUM_OVERRIDES: Record<string, TrafficSourceId> = {
  cpc: 'google_ads',
  ppc: 'google_ads',
  paid: 'google_ads',
  social: 'referral',
  influencer: 'influencer',
  ambassador: 'influencer',
  partner: 'influencer',
};

const REFERRER_PATTERNS: Array<{ pattern: RegExp; source: TrafficSourceId }> = [
  { pattern: /instagram\.com/i, source: 'instagram' },
  { pattern: /l\.instagram\.com/i, source: 'instagram' },
  { pattern: /google\.(com|co\.\w+|[a-z]{2,3})/i, source: 'google_organic' },
  { pattern: /googleads/i, source: 'google_ads' },
  { pattern: /tiktok\.com/i, source: 'tiktok' },
  { pattern: /facebook\.com/i, source: 'facebook' },
  { pattern: /fb\.com/i, source: 'facebook' },
  { pattern: /l\.facebook\.com/i, source: 'facebook' },
  { pattern: /whatsapp\.(com|net)/i, source: 'whatsapp' },
  { pattern: /wa\.me/i, source: 'whatsapp' },
  { pattern: /t\.co\//i, source: 'referral' },
  { pattern: /linkedin\.com/i, source: 'referral' },
  { pattern: /reddit\.com/i, source: 'referral' },
  { pattern: /youtube\.com/i, source: 'referral' },
];

const CAMPAIGN_PREFIX_MAP: Record<string, TrafficSourceId> = {
  ig_: 'instagram',
  tt_: 'tiktok',
  fb_: 'facebook',
  gad_: 'google_ads',
  em_: 'email_campaign',
  inf_: 'influencer',
  wa_: 'whatsapp',
  ref_: 'referral',
};

function detectDarkTraffic(
  referrer: string | undefined,
  userAgent: string | undefined,
): boolean {
  if (!referrer || referrer === '' || referrer === 'null') {
    const ua = (userAgent || '').toLowerCase();
    const isPrivate = ua.includes('private') || ua.includes('incognito');
    const isBot = ua.includes('bot') || ua.includes('crawler') || ua.includes('spider');
    if (isPrivate || isBot) return true;
    return true;
  }
  return false;
}

function classifyFromUTM(
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string,
): TrafficSourceId | null {
  if (utmMedium) {
    const mediumLower = utmMedium.toLowerCase().trim();
    const mediumOverride = UTM_MEDIUM_OVERRIDES[mediumLower];
    if (mediumOverride) return mediumOverride;
  }

  if (utmSource) {
    const srcLower = utmSource.toLowerCase().trim();
    const mapped = UTM_SOURCE_MAP[srcLower];
    if (mapped) return mapped;

    for (const [key, source] of Object.entries(UTM_SOURCE_MAP)) {
      if (srcLower.includes(key)) return source;
    }
  }

  if (utmCampaign) {
    const campLower = utmCampaign.toLowerCase().trim();
    for (const [prefix, source] of Object.entries(CAMPAIGN_PREFIX_MAP)) {
      if (campLower.startsWith(prefix)) return source;
    }
  }

  return null;
}

function classifyFromReferrer(referrer?: string): TrafficSourceId | null {
  if (!referrer) return null;
  for (const { pattern, source } of REFERRER_PATTERNS) {
    if (pattern.test(referrer)) return source;
  }
  if (referrer.startsWith('http')) return 'referral';
  return null;
}

function classifyFromCampaignId(campaignId?: string): TrafficSourceId | null {
  if (!campaignId) return null;
  const lower = campaignId.toLowerCase();
  for (const [prefix, source] of Object.entries(CAMPAIGN_PREFIX_MAP)) {
    if (lower.startsWith(prefix)) return source;
  }
  return null;
}

function classifyFromDeepLink(deepLinkSource?: string): TrafficSourceId | null {
  if (!deepLinkSource) return null;
  const lower = deepLinkSource.toLowerCase();
  const directMap: Record<string, TrafficSourceId> = {
    instagram: 'instagram',
    google: 'google_organic',
    tiktok: 'tiktok',
    facebook: 'facebook',
    whatsapp: 'whatsapp',
    email: 'email_campaign',
    influencer: 'influencer',
    partner: 'influencer',
  };
  for (const [key, source] of Object.entries(directMap)) {
    if (lower.includes(key)) return source;
  }
  return null;
}

export function attributeSource(params: {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  campaignId?: string;
  deepLinkSource?: string;
  userAgent?: string;
}): TrafficSourceId {
  const fromUTM = classifyFromUTM(params.utmSource, params.utmMedium, params.utmCampaign);
  if (fromUTM) return fromUTM;

  const fromCampaign = classifyFromCampaignId(params.campaignId);
  if (fromCampaign) return fromCampaign;

  const fromDeepLink = classifyFromDeepLink(params.deepLinkSource);
  if (fromDeepLink) return fromDeepLink;

  const fromReferrer = classifyFromReferrer(params.referrer);
  if (fromReferrer) return fromReferrer;

  const isDark = detectDarkTraffic(params.referrer, params.userAgent);
  if (isDark) {
    if (!params.referrer || params.referrer === '' || params.referrer === 'null') {
      const ua = (params.userAgent || '').toLowerCase();
      if (ua.includes('bot') || ua.includes('crawler')) return 'dark_traffic';
      if (!params.utmSource && !params.campaignId && !params.deepLinkSource) {
        return 'direct';
      }
    }
    return 'dark_traffic';
  }

  return 'unknown';
}

export function classifyIntent(
  sourceId: TrafficSourceId,
  stepsVisited: JourneyStep[],
  metadata?: Record<string, unknown>,
): UserIntent {
  const hasInvestStep = stepsVisited.includes('invest_flow');
  const hasDealBrowse = stepsVisited.includes('deal_browse') || stepsVisited.includes('deal_detail');
  const hasChat = stepsVisited.includes('chat_entry');
  const hasPortfolio = stepsVisited.includes('portfolio_view');
  const hasForm = stepsVisited.includes('form_started') || stepsVisited.includes('form_submitted');
  const hasAuth = stepsVisited.includes('auth_signup');
  const hasAppOpen = stepsVisited.includes('app_opened');

  if (metadata?.isAdmin === true || metadata?.role === 'admin') return 'admin_operator';

  if (hasInvestStep) return 'investing';
  if (hasPortfolio && hasAppOpen) return 'returning_portfolio';
  if (hasDealBrowse && hasAuth) return 'browsing_deals';
  if (hasChat) return 'chat_engagement';

  if (hasForm && !hasAppOpen) return 'joining_waitlist';
  if (hasDealBrowse) return 'browsing_deals';

  if (sourceId === 'email_campaign' && hasAppOpen) return 'returning_portfolio';
  if (sourceId === 'google_ads' || sourceId === 'google_organic') {
    if (hasDealBrowse || hasForm) return 'investing';
  }

  if (stepsVisited.length <= 2) return 'unknown';

  return 'browsing_deals';
}

class TrafficAttributionEngine {
  private sessions = new Map<string, TrafficSessionRecord>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.pruneTimer = setInterval(() => this.pruneStale(), PRUNE_INTERVAL);
  }

  trackSession(params: {
    sessionId: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrer?: string;
    campaignId?: string;
    deepLinkSource?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): TrafficSessionRecord {
    const existing = this.sessions.get(params.sessionId);
    if (existing) {
      existing.lastSeenAt = Date.now();
      return existing;
    }

    const sourceId = attributeSource(params);
    const now = Date.now();
    const record: TrafficSessionRecord = {
      sessionId: params.sessionId,
      sourceId,
      intent: 'unknown',
      currentStep: 'source_entry',
      enteredAt: now,
      lastSeenAt: now,
      stepsVisited: ['source_entry'],
      frictions: [],
      utmSource: params.utmSource,
      utmMedium: params.utmMedium,
      utmCampaign: params.utmCampaign,
      referrer: params.referrer,
      campaignId: params.campaignId,
      deepLinkSource: params.deepLinkSource,
    };

    this.sessions.set(params.sessionId, record);

    console.log(`[TrafficAttrib] New session ${params.sessionId.slice(0, 8)} → ${sourceId}`);
    return record;
  }

  updateStep(sessionId: string, step: JourneyStep, metadata?: Record<string, unknown>): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    record.currentStep = step;
    record.lastSeenAt = Date.now();

    if (!record.stepsVisited.includes(step)) {
      record.stepsVisited.push(step);
    }

    record.intent = classifyIntent(record.sourceId, record.stepsVisited, metadata);
  }

  recordFriction(sessionId: string, friction: FrictionType): void {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    if (!record.frictions.includes(friction)) {
      record.frictions.push(friction);
    }
    record.lastSeenAt = Date.now();
  }

  getSession(sessionId: string): TrafficSessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): TrafficSessionRecord[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(windowMs: number = SESSION_TTL_MS): TrafficSessionRecord[] {
    const cutoff = Date.now() - windowMs;
    return this.getAllSessions().filter(s => s.lastSeenAt >= cutoff);
  }

  getSessionsBySource(sourceId: TrafficSourceId, windowMs?: number): TrafficSessionRecord[] {
    const sessions = windowMs ? this.getActiveSessions(windowMs) : this.getAllSessions();
    return sessions.filter(s => s.sourceId === sourceId);
  }

  private pruneStale(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    let pruned = 0;
    for (const [id, record] of this.sessions) {
      if (record.lastSeenAt < cutoff) {
        this.sessions.delete(id);
        pruned++;
      }
    }

    if (this.sessions.size > MAX_SESSIONS) {
      const sorted = Array.from(this.sessions.entries()).sort(
        (a, b) => a[1].lastSeenAt - b[1].lastSeenAt,
      );
      const toRemove = sorted.slice(0, this.sessions.size - MAX_SESSIONS);
      for (const [id] of toRemove) {
        this.sessions.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      console.log(`[TrafficAttrib] Pruned ${pruned} stale sessions (${this.sessions.size} remaining)`);
    }
  }

  getStats(): { totalSessions: number; activeSessions: number; sourceBreakdown: Record<string, number> } {
    const active = this.getActiveSessions();
    const breakdown: Record<string, number> = {};
    for (const s of active) {
      breakdown[s.sourceId] = (breakdown[s.sourceId] || 0) + 1;
    }
    return {
      totalSessions: this.sessions.size,
      activeSessions: active.length,
      sourceBreakdown: breakdown,
    };
  }

  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.sessions.clear();
  }
}

export const trafficAttribution = new TrafficAttributionEngine();
