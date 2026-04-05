import { supabase } from '@/lib/supabase';

export type EventSource = 'landing' | 'app' | 'unknown';

export interface RawEvent {
  id?: string;
  event: string;
  session_id: string;
  properties?: Record<string, unknown>;
  geo?: { city?: string; region?: string; country?: string; countryCode?: string; lat?: number; lng?: number; timezone?: string };
  created_at: string;
  _source?: EventSource;
  _environment?: string;
}

export interface EventValidationResult {
  valid: boolean;
  reason?: string;
}

function validateRawEvent(event: RawEvent): EventValidationResult {
  if (!event.event || typeof event.event !== 'string') {
    return { valid: false, reason: 'missing event name' };
  }
  if (!event.session_id || typeof event.session_id !== 'string') {
    return { valid: false, reason: 'missing session_id' };
  }
  if (!event.created_at || typeof event.created_at !== 'string') {
    return { valid: false, reason: 'missing created_at' };
  }
  const ts = new Date(event.created_at).getTime();
  if (isNaN(ts)) {
    return { valid: false, reason: 'invalid created_at timestamp' };
  }
  return { valid: true };
}

export interface TrendDelta {
  value: number;
  pct: number;
  direction: 'up' | 'down' | 'flat';
}

export interface AcquisitionChannel {
  channel: string;
  sessions: number;
  leads: number;
  conversionRate: number;
  pct: number;
  color: string;
}

export interface SessionQuality {
  avgPagesPerSession: number;
  avgSessionDuration: number;
  engagedSessionsPct: number;
  newVsReturning: { new: number; returning: number; newPct: number; returningPct: number };
}

export interface ComputedAnalytics {
  period: string;
  totalLeads: number;
  registeredUsers: number;
  waitlistLeads: number;
  totalEvents: number;
  pageViews: number;
  uniqueSessions: number;
  funnel: {
    pageViews: number;
    scroll25: number;
    scroll50: number;
    scroll75: number;
    scroll100: number;
    formFocuses: number;
    formSubmits: number;
  };
  cta: {
    getStarted: number;
    signIn: number;
    jvInquire: number;
    websiteClick: number;
  };
  conversionRate: number;
  scrollEngagement: number;
  byEvent: Array<{ event: string; count: number }>;
  byPlatform: Array<{ platform: string; count: number }>;
  byReferrer: Array<{ referrer: string; count: number }>;
  dailyViews: Array<{ date: string; views: number; sessions: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
  geoZones: {
    byCountry: Array<{ country: string; count: number; pct: number }>;
    byCity: Array<{ city: string; count: number; country: string; lat?: number; lng?: number; pct: number }>;
    byRegion: Array<{ region: string; count: number; pct: number }>;
    byTimezone: Array<{ timezone: string; count: number }>;
    totalWithGeo: number;
  };
  smartInsights: {
    avgTimeOnPage: number;
    bounceRate: number;
    engagementScore: number;
    topInterests: Array<{ interest: string; count: number; pct: number }>;
    sectionEngagement: Array<{ section: string; count: number; pct: number }>;
    deviceBreakdown: Array<{ device: string; count: number; pct: number }>;
    peakHour: number;
    contentInteraction: {
      scrolledPast50Pct: number;
      scrolledPast75Pct: number;
      interactedWithForm: number;
      submittedForm: number;
      clickedAnyCta: number;
    };
    visitorIntent: {
      highIntent: number;
      mediumIntent: number;
      lowIntent: number;
      highIntentPct: number;
      mediumIntentPct: number;
      lowIntentPct: number;
    };
  };
  liveData: {
    active: number;
    recent: number;
    sessions: Array<{
      sessionId: string;
      ip: string;
      device: string;
      os: string;
      browser: string;
      geo?: { city?: string; country?: string; region?: string };
      currentStep: number;
      sessionDuration: number;
      activeTime: number;
      lastSeen: string;
      startedAt: string;
      isActive: boolean;
    }>;
    breakdown: {
      byCountry: Array<{ country: string; count: number }>;
      byDevice: Array<{ device: string; count: number }>;
      byStep: Array<{ step: string; count: number }>;
    };
    timestamp: string;
  };
  trends: {
    pageViews: TrendDelta;
    sessions: TrendDelta;
    leads: TrendDelta;
    conversionRate: TrendDelta;
    bounceRate: TrendDelta;
    avgDuration: TrendDelta;
  };
  acquisition: AcquisitionChannel[];
  sessionQuality: SessionQuality;
  linkClicks: Array<{ label: string; destination: string; count: number; location: string; lastClicked: string }>;
  sectionViews: Array<{ section: string; count: number; pct: number }>;
}

export interface VisitorIntelData {
  summary: {
    totalSessions: number;
    hotLeads: number;
    warmLeads: number;
    avgEngagement: number;
    conversionRate: number;
    totalEvents: number;
    engagedVisitors: number;
    bouncedVisitors: number;
  };
  liveNow: {
    activeVisitors: number;
  };
  aiInsights: string[];
  topSources: Array<{ source: string; visits: number; conversions: number; conversionRate: number }>;
  topCountries: Array<{ country: string; visits: number; conversions: number; avgEngagement: number }>;
  highIntentVisitors: Array<{
    intent: string;
    engagementScore: number;
    geo?: { city?: string; country?: string };
    device: string;
    duration: number;
    eventCount: number;
    hasFormSubmit: boolean;
    hasCta: boolean;
    hasScroll75: boolean;
  }>;
  recentVisitors: Array<{
    intent: string;
    engagementScore: number;
    geo?: { city?: string; country?: string };
    device: string;
    duration: number;
    eventCount: number;
  }>;
  patterns: {
    hourlyHeatmap: Array<{ hour: number; count: number }>;
    peakHour: number;
    peakDay: string;
    dayOfWeek: Array<{ day: string; count: number }>;
  };
  insights: string[];
  trafficSources: Array<{ source: string; count: number }>;
  geoData: { byCountry: Array<{ country: string; count: number }>; byCity: Array<{ city: string; count: number }> };
  hourlyActivity: Array<{ hour: number; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
  deviceBreakdown: Array<{ device: string; count: number }>;
}

function getPeriodCutoff(period: string): Date {
  const now = new Date();
  switch (period) {
    case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default: return new Date(0);
  }
}

function detectDevice(props: Record<string, unknown> | undefined): string {
  if (!props) return 'Unknown';
  const platform = (typeof props.platform === 'string' ? props.platform : typeof props.userAgent === 'string' ? props.userAgent : '').toLowerCase();
  if (platform.includes('mobile') || platform.includes('android') || platform.includes('iphone')) return 'Mobile';
  if (platform.includes('tablet') || platform.includes('ipad')) return 'Tablet';
  if (platform.includes('web') || platform.includes('mozilla') || platform.includes('chrome')) return 'Desktop';
  if (platform === 'ios') return 'Mobile';
  return 'Desktop';
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const exp = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      if (exp && now >= exp - 60) {
        console.log('[Analytics] Token near expiry, refreshing session...');
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
          console.log('[Analytics] Session refreshed successfully');
          return refreshed.session.access_token;
        }
      }
      return session.access_token;
    }
    console.log('[Analytics] No Supabase session — using anon key (Owner IP mode)');
    return null;
  } catch (err) {
    console.log('[Analytics] getAuthToken error:', (err as Error)?.message);
    return null;
  }
}

async function fetchViaRestApi(table: string, columns: string, cutoff: Date | null, limit: number = 5000): Promise<Record<string, unknown>[] | null> {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    let token = await getAuthToken();
    let url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(columns)}&order=created_at.desc&limit=${limit}`;
    if (cutoff) {
      url += `&created_at=gte.${cutoff.toISOString()}`;
    }

    if (!token) {
      console.log(`[Analytics] REST API: No auth token for ${table} — using anon key (Owner IP mode)`);
    }

    const headers: Record<string, string> = {
      'apikey': supabaseKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'Authorization': `Bearer ${token || supabaseKey}`,
    };

    console.log(`[Analytics] REST API fetch: ${table} (auth: ${token ? 'jwt' : 'anon'})`);
    const resp = await fetch(url, { method: 'GET', headers });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[Analytics] REST API ${table} error ${resp.status}:`, body);
      if (resp.status === 404 || body.includes('does not exist')) {
        console.warn(`[Analytics] Table ${table} does not exist`);
        return null;
      }
      if (resp.status === 401 || resp.status === 403) {
        console.log(`[Analytics] RLS/Auth blocking ${table} SELECT (${resp.status}). Using anon key — data may be limited.`);
        return null;
      }
      return null;
    }

    const data = await resp.json();
    console.log(`[Analytics] REST API ${table}: ${Array.isArray(data) ? data.length : 0} rows`);
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.error(`[Analytics] REST API ${table} exception:`, (err as Error)?.message);
    return null;
  }
}

function mapLandingRow(row: Record<string, unknown>): RawEvent {
  const id = typeof row.id === 'number' ? String(row.id) : (typeof row.id === 'string' ? row.id : '');
  const event = typeof row.event === 'string' ? row.event : 'unknown';
  const sessionId = typeof row.session_id === 'string' ? row.session_id : 'unknown';
  const createdAt = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();

  let parsedProps: Record<string, unknown> = {};
  if (typeof row.properties === 'string') {
    try { parsedProps = JSON.parse(row.properties); } catch { parsedProps = {}; }
  } else if (row.properties && typeof row.properties === 'object') {
    parsedProps = row.properties as Record<string, unknown>;
  }

  let parsedGeo: RawEvent['geo'] = undefined;
  if (typeof row.geo === 'string') {
    try { parsedGeo = JSON.parse(row.geo); } catch { parsedGeo = undefined; }
  } else if (row.geo && typeof row.geo === 'object') {
    parsedGeo = row.geo as RawEvent['geo'];
  }

  parsedProps.platform = parsedProps.platform || 'web';
  parsedProps.source = 'landing';

  return {
    id,
    event,
    session_id: sessionId,
    properties: parsedProps,
    geo: parsedGeo,
    created_at: createdAt,
    _source: 'landing',
  };
}

async function fetchViaRpc(fnName: string, cutoff: Date | null, limit: number = 50000): Promise<Record<string, unknown>[] | null> {
  try {
    console.log(`[Analytics] RPC fallback: calling ${fnName}...`);
    const params: Record<string, unknown> = { p_limit: limit };
    if (cutoff) {
      params.p_cutoff = cutoff.toISOString();
    }
    const { data, error } = await supabase.rpc(fnName, params);
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42883') {
        console.log(`[Analytics] RPC function ${fnName} not found — deploy it via Supabase Scripts`);
        return null;
      }
      console.error(`[Analytics] RPC ${fnName} error:`, error.code, error.message);
      return null;
    }
    if (Array.isArray(data)) {
      console.log(`[Analytics] RPC ${fnName} success: ${data.length} rows`);
      return data as Record<string, unknown>[];
    }
    return null;
  } catch (err) {
    console.error(`[Analytics] RPC ${fnName} exception:`, (err as Error)?.message);
    return null;
  }
}

async function fetchLandingEvents(cutoff: Date, period: string): Promise<RawEvent[]> {
  const columns = 'id,event,session_id,properties,geo,created_at';
  try {
    console.log('[Analytics] Fetching landing_analytics — period:', period, 'cutoff:', period !== 'all' ? cutoff.toISOString() : 'none');
    let query = supabase
      .from('landing_analytics')
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(50000);

    if (period !== 'all') {
      query = query.gte('created_at', cutoff.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Analytics] landing_analytics table does not exist');
        return [];
      }
      console.error('[Analytics] landing_analytics query error:', error.code, error.message);
      console.log('[Analytics] Trying RPC fallback for landing_analytics...');
      const rpcData = await fetchViaRpc('get_landing_analytics', period !== 'all' ? cutoff : null, 50000);
      if (rpcData && rpcData.length > 0) {
        console.log('[Analytics] RPC fallback success: landing_analytics:', rpcData.length, 'events');
        return rpcData.map(mapLandingRow);
      }
      console.log('[Analytics] Trying REST API fallback for landing_analytics...');
      const restData = await fetchViaRestApi('landing_analytics', columns, period !== 'all' ? cutoff : null, 50000);
      if (restData && restData.length > 0) {
        console.log('[Analytics] REST API fallback success: landing_analytics:', restData.length, 'events');
        return restData.map(mapLandingRow);
      }
      return [];
    }

    const landingCount = data?.length ?? 0;
    console.log('[Analytics] landing_analytics (client):', landingCount, 'events');

    if (landingCount === 0) {
      console.log('[Analytics] Supabase client returned 0 landing events — trying RPC bypass...');

      const rpcData = await fetchViaRpc('get_landing_analytics', period !== 'all' ? cutoff : null, 50000);
      if (rpcData && rpcData.length > 0) {
        console.log('[Analytics] RPC bypass success: landing_analytics:', rpcData.length, 'events (RLS was blocking)');
        return rpcData.map(mapLandingRow);
      }

      const { count: rowCount, error: countErr } = await supabase
        .from('landing_analytics')
        .select('*', { count: 'exact', head: true });
      if (!countErr && rowCount !== null) {
        console.log('[Analytics] landing_analytics total row count (via count):', rowCount);
        if (rowCount > 0) {
          console.error('[Analytics] CONFIRMED: landing_analytics has', rowCount, 'rows but query returned 0. RLS SELECT policy is blocking. Trying REST API...');
          const restData = await fetchViaRestApi('landing_analytics', columns, period !== 'all' ? cutoff : null, 50000);
          if (restData && restData.length > 0) {
            console.log('[Analytics] REST API fallback success: landing_analytics:', restData.length, 'events');
            return restData.map(mapLandingRow);
          }
          console.error('[Analytics] All fallbacks failed. Deploy get_landing_analytics RPC function via Supabase Scripts.');
        } else {
          console.log('[Analytics] landing_analytics table is genuinely empty (0 rows).');
        }
      } else if (countErr) {
        console.log('[Analytics] landing_analytics count check error:', countErr.message);
        const restData = await fetchViaRestApi('landing_analytics', columns, period !== 'all' ? cutoff : null, 50000);
        if (restData && restData.length > 0) {
          console.log('[Analytics] REST API fallback success: landing_analytics:', restData.length, 'events');
          return restData.map(mapLandingRow);
        }
      }

      return [];
    }

    if (landingCount >= 50000) {
      console.warn('[Analytics] landing_analytics hit 50000 limit for period:', period);
    }

    return (data ?? []).map(mapLandingRow);
  } catch (err) {
    console.log('[Analytics] landing_analytics fetch failed:', (err as Error)?.message);
    console.log('[Analytics] Trying RPC fallback...');
    const rpcData = await fetchViaRpc('get_landing_analytics', period !== 'all' ? cutoff : null);
    if (rpcData && rpcData.length > 0) {
      return rpcData.map(mapLandingRow);
    }
    console.log('[Analytics] Trying REST API fallback...');
    const restData = await fetchViaRestApi('landing_analytics', columns, period !== 'all' ? cutoff : null);
    if (restData && restData.length > 0) {
      return restData.map(mapLandingRow);
    }
    return [];
  }
}

function mapAppRow(row: Record<string, unknown>): RawEvent {
  const id = typeof row.id === 'string' ? row.id : typeof row.id === 'number' ? String(row.id) : '';
  const eventName = typeof row.name === 'string' ? row.name
    : typeof row.event === 'string' ? row.event
    : 'unknown';
  const sessionId = typeof row.session_id === 'string' ? row.session_id : 'unknown';
  const createdAt = typeof row.created_at === 'string' ? row.created_at
    : typeof row.timestamp === 'string' ? row.timestamp
    : new Date().toISOString();
  let parsedProps: Record<string, unknown> = {};
  if (typeof row.properties === 'string') {
    try { parsedProps = JSON.parse(row.properties); } catch { parsedProps = {}; }
  } else if (row.properties && typeof row.properties === 'object') {
    parsedProps = row.properties as Record<string, unknown>;
  }
  const platform = typeof row.platform === 'string' ? row.platform
    : typeof parsedProps.platform === 'string' ? parsedProps.platform
    : 'unknown';
  const category = typeof row.category === 'string' ? row.category : undefined;
  if (category) {
    parsedProps.category = category;
  }
  return {
    id,
    event: eventName,
    session_id: sessionId,
    properties: { ...parsedProps, platform, source: 'app' },
    created_at: createdAt,
    _source: 'app',
  };
}

async function fetchAppEvents(cutoff: Date, period: string): Promise<RawEvent[]> {
  const extendedColumns = 'id,name,category,session_id,user_id,properties,platform,timestamp,created_at';
  const masterColumns = 'id,event,session_id,user_id,properties,created_at';
  try {
    console.log('[Analytics] Fetching analytics_events — period:', period, 'cutoff:', period !== 'all' ? cutoff.toISOString() : 'none');
    let query = supabase
      .from('analytics_events')
      .select(extendedColumns)
      .order('created_at', { ascending: false })
      .limit(50000);

    if (period !== 'all') {
      query = query.gte('created_at', cutoff.toISOString());
    }

    let result = await query;
    let data: Record<string, unknown>[] | null = result.data as Record<string, unknown>[] | null;
    let error = result.error;

    if (error && (error.message?.includes('column') || error.code === '42703')) {
      console.log('[Analytics] Extended schema failed, retrying with master columns...');
      let masterQuery = supabase
        .from('analytics_events')
        .select(masterColumns)
        .order('created_at', { ascending: false })
        .limit(50000);
      if (period !== 'all') {
        masterQuery = masterQuery.gte('created_at', cutoff.toISOString());
      }
      const masterResult = await masterQuery;
      data = masterResult.data as Record<string, unknown>[] | null;
      error = masterResult.error;
    }

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
        console.warn('[Analytics] analytics_events table does not exist');
        return [];
      }
      console.error('[Analytics] analytics_events query error:', error.code, error.message);
      console.log('[Analytics] Trying RPC fallback for analytics_events...');
      const rpcData = await fetchViaRpc('get_analytics_events', period !== 'all' ? cutoff : null, 50000);
      if (rpcData && rpcData.length > 0) {
        console.log('[Analytics] RPC fallback success: analytics_events:', rpcData.length, 'events');
        return rpcData.map(mapAppRow);
      }
      console.log('[Analytics] Trying REST API fallback for analytics_events...');
      let restData = await fetchViaRestApi('analytics_events', extendedColumns, period !== 'all' ? cutoff : null, 50000);
      if (!restData || restData.length === 0) {
        restData = await fetchViaRestApi('analytics_events', masterColumns, period !== 'all' ? cutoff : null, 50000);
      }
      if (restData && restData.length > 0) {
        console.log('[Analytics] REST API fallback success: analytics_events:', restData.length, 'events');
        return restData.map(mapAppRow);
      }
      return [];
    }

    const appCount = data?.length ?? 0;
    console.log('[Analytics] analytics_events (client):', appCount, 'events');

    if (appCount === 0) {
      console.log('[Analytics] Supabase client returned 0 app events — trying RPC bypass...');

      const rpcData = await fetchViaRpc('get_analytics_events', period !== 'all' ? cutoff : null, 50000);
      if (rpcData && rpcData.length > 0) {
        console.log('[Analytics] RPC bypass success: analytics_events:', rpcData.length, 'events (RLS was blocking)');
        return rpcData.map(mapAppRow);
      }

      const { count: rowCount, error: countErr } = await supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true });
      if (!countErr && rowCount !== null) {
        console.log('[Analytics] analytics_events total row count:', rowCount);
        if (rowCount > 0) {
          console.error('[Analytics] CONFIRMED: analytics_events has', rowCount, 'rows but query returned 0. RLS is blocking. Trying REST API...');
          let restData = await fetchViaRestApi('analytics_events', extendedColumns, period !== 'all' ? cutoff : null, 50000);
          if (!restData || restData.length === 0) {
            restData = await fetchViaRestApi('analytics_events', masterColumns, period !== 'all' ? cutoff : null, 50000);
          }
          if (restData && restData.length > 0) {
            console.log('[Analytics] REST API fallback success: analytics_events:', restData.length, 'events');
            return restData.map(mapAppRow);
          }
          console.error('[Analytics] All fallbacks failed. Deploy get_analytics_events RPC function via Supabase Scripts.');
        } else {
          console.log('[Analytics] analytics_events table is genuinely empty (0 rows).');
        }
      } else if (countErr) {
        console.log('[Analytics] analytics_events count check error:', countErr.message);
        let restData = await fetchViaRestApi('analytics_events', extendedColumns, period !== 'all' ? cutoff : null, 50000);
        if (!restData || restData.length === 0) {
          restData = await fetchViaRestApi('analytics_events', masterColumns, period !== 'all' ? cutoff : null, 50000);
        }
        if (restData && restData.length > 0) {
          console.log('[Analytics] REST API fallback success: analytics_events:', restData.length, 'events');
          return restData.map(mapAppRow);
        }
      }

      return [];
    }

    if (appCount >= 50000) {
      console.warn('[Analytics] analytics_events hit 50000 limit for period:', period);
    }

    return (data ?? []).map(mapAppRow);
  } catch (err) {
    console.log('[Analytics] analytics_events fetch failed:', (err as Error)?.message);
    console.log('[Analytics] Trying RPC fallback...');
    const rpcData = await fetchViaRpc('get_analytics_events', period !== 'all' ? cutoff : null);
    if (rpcData && rpcData.length > 0) {
      return rpcData.map(mapAppRow);
    }
    console.log('[Analytics] Trying REST API fallback...');
    let restData = await fetchViaRestApi('analytics_events', extendedColumns, period !== 'all' ? cutoff : null, 50000);
    if (!restData || restData.length === 0) {
      restData = await fetchViaRestApi('analytics_events', masterColumns, period !== 'all' ? cutoff : null, 50000);
    }
    if (restData && restData.length > 0) {
      return restData.map(mapAppRow);
    }
    return [];
  }
}



async function fetchWaitlistCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log('[Analytics] waitlist count error:', error.message);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function fetchRegisteredUserCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log('[Analytics] profiles count error:', error.message);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

export interface ExtraCounts {
  waitlistCount: number;
  registeredUserCount: number;
}

export async function fetchExtraCounts(): Promise<ExtraCounts> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { waitlistCount: 0, registeredUserCount: 0 };
  const [waitlistCount, registeredUserCount] = await Promise.all([
    fetchWaitlistCount(),
    fetchRegisteredUserCount(),
  ]);
  console.log('[Analytics] Extra counts — waitlist:', waitlistCount, ', registered:', registeredUserCount);
  return { waitlistCount, registeredUserCount };
}

export interface FetchMetrics {
  landingCount: number;
  appCount: number;
  totalCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  invalidReasons: string[];
}

export type AnalyticsSource = 'all' | 'landing' | 'app';

export async function fetchRawEvents(period: string, source: AnalyticsSource = 'all'): Promise<RawEvent[]> {
  const startTime = Date.now();
  const cutoff = getPeriodCutoff(period);
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  console.log('[Analytics] === fetchRawEvents START === period:', period, 'source:', source, 'time:', new Date().toISOString());

  if (!supabaseUrl) {
    console.error('[Analytics] BLOCKER: No EXPO_PUBLIC_SUPABASE_URL configured. Dashboard will show 0.');
    return [];
  }

  if (!supabaseKey) {
    console.error('[Analytics] BLOCKER: No EXPO_PUBLIC_SUPABASE_ANON_KEY configured. Dashboard will show 0.');
    return [];
  }

  let token = await getAuthToken();
  if (!token) {
    console.log('[Analytics] No auth token — using anon key (Owner IP mode). Data access depends on RLS policy.');
  }
  console.log('[Analytics] fetchRawEvents — period:', period, 'source:', source, 'auth:', token ? 'jwt' : 'anon', 'supabaseUrl:', supabaseUrl?.substring(0, 40));

  let landingEvents: RawEvent[] = [];
  let appEvents: RawEvent[] = [];

  if (source === 'all') {
    [landingEvents, appEvents] = await Promise.all([
      fetchLandingEvents(cutoff, period),
      fetchAppEvents(cutoff, period),
    ]);
  } else if (source === 'landing') {
    landingEvents = await fetchLandingEvents(cutoff, period);
  } else if (source === 'app') {
    appEvents = await fetchAppEvents(cutoff, period);
  }

  const merged = [...landingEvents, ...appEvents];

  const dedupMap = new Map<string, RawEvent>();
  let duplicateCount = 0;
  let invalidCount = 0;
  const invalidReasons: string[] = [];

  for (const e of merged) {
    const validation = validateRawEvent(e);
    if (!validation.valid) {
      invalidCount++;
      if (invalidReasons.length < 10) {
        invalidReasons.push(`${e.event || 'unknown'}: ${validation.reason}`);
      }
      continue;
    }

    const dedupKey = e.id || `${e.session_id}|${e.event}|${e.created_at?.substring(0, 19)}`;
    if (dedupMap.has(dedupKey)) {
      duplicateCount++;
      continue;
    }
    dedupMap.set(dedupKey, e);
  }

  const deduped = Array.from(dedupMap.values());
  deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const metrics: FetchMetrics = {
    landingCount: landingEvents.length,
    appCount: appEvents.length,
    totalCount: merged.length,
    validCount: deduped.length,
    invalidCount,
    duplicateCount,
    invalidReasons,
  };

  if (metrics.totalCount > 0 || !token) {
    console.log('[Analytics] Fetch metrics:', JSON.stringify(metrics));
  }

  if (invalidCount > 0) {
    console.warn('[Analytics] Dropped', invalidCount, 'invalid events:', invalidReasons.slice(0, 5).join('; '));
  }
  if (duplicateCount > 0) {
    console.log('[Analytics] Deduped', duplicateCount, 'duplicate events');
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Analytics] === fetchRawEvents DONE === ${deduped.length} events in ${elapsed}ms (landing: ${metrics.landingCount}, app: ${metrics.appCount})`);

  return deduped;
}

function sumEventCounts(eventCounts: Map<string, number>, names: string[]): number {
  let total = 0;
  const counted = new Set<string>();
  for (const name of names) {
    const count = eventCounts.get(name);
    if (count && !counted.has(name)) {
      total += count;
      counted.add(name);
    }
  }
  return total;
}

function classifyCtaClicks(events: RawEvent[]): { getStarted: number; signIn: number; jvInquire: number; website: number } {
  const result = { getStarted: 0, signIn: 0, jvInquire: 0, website: 0 };
  for (const e of events) {
    if (e.event !== 'cta_click') continue;
    const props = e.properties as Record<string, unknown> | undefined;
    const label = (typeof props?.label === 'string' ? props.label : '').toLowerCase();
    if (label.includes('get started') || label.includes('start investing') || label.includes('invest now') || label.includes('create') || label.includes('join')) {
      result.getStarted++;
    } else if (label.includes('sign in') || label.includes('login') || label.includes('log in')) {
      result.signIn++;
    } else if (label.includes('jv') || label.includes('joint venture') || label.includes('inquire') || label.includes('invest')) {
      result.jvInquire++;
    } else if (label.includes('website') || label.includes('visit') || label.includes('learn more') || label.includes('explore')) {
      result.website++;
    } else {
      result.getStarted++;
    }
  }
  return result;
}

function computeTrend(current: number, previous: number): TrendDelta {
  if (previous === 0 && current === 0) return { value: 0, pct: 0, direction: 'flat' as const };
  if (previous === 0) return { value: current, pct: 100, direction: 'up' as const };
  const diff = current - previous;
  const pct = parseFloat(((diff / previous) * 100).toFixed(1));
  return { value: diff, pct: Math.abs(pct), direction: diff > 0 ? 'up' as const : diff < 0 ? 'down' as const : 'flat' as const };
}

function splitEventsByHalf(events: RawEvent[]): { current: RawEvent[]; previous: RawEvent[] } {
  if (events.length === 0) return { current: [], previous: [] };
  const sorted = [...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return { current: [], previous: [] };
  const midTime = new Date(first.created_at).getTime() + (new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / 2;
  const current = sorted.filter(e => new Date(e.created_at).getTime() >= midTime);
  const previous = sorted.filter(e => new Date(e.created_at).getTime() < midTime);
  return { current, previous };
}

function computeBounceRate(events: RawEvent[]): number {
  if (events.length === 0) return 0;
  const sm = new Map<string, number>();
  events.forEach(e => {
    const sid = e.session_id || 'u';
    sm.set(sid, (sm.get(sid) || 0) + 1);
  });
  let bounced = 0;
  sm.forEach(c => { if (c === 1) bounced++; });
  return sm.size > 0 ? (bounced / sm.size) * 100 : 0;
}

function classifyAcquisitionChannel(referrer: string): string {
  if (!referrer || referrer === 'direct' || referrer === '(direct)') return 'Direct';
  const r = referrer.toLowerCase();
  if (r.includes('google') || r.includes('bing') || r.includes('yahoo') || r.includes('duckduckgo') || r.includes('baidu')) return 'Organic Search';
  if (r.includes('facebook') || r.includes('instagram') || r.includes('twitter') || r.includes('linkedin') || r.includes('tiktok') || r.includes('youtube') || r.includes('reddit') || r.includes('t.co')) return 'Social';
  if (r.includes('mail') || r.includes('outlook') || r.includes('gmail')) return 'Email';
  if (r.includes('ads') || r.includes('gclid') || r.includes('fbclid') || r.includes('utm_medium=cpc') || r.includes('utm_medium=paid')) return 'Paid';
  return 'Referral';
}

const CHANNEL_COLORS: Record<string, string> = {
  'Direct': '#4A90D9',
  'Organic Search': '#22C55E',
  'Social': '#E91E63',
  'Email': '#F57C00',
  'Paid': '#7B61FF',
  'Referral': '#0097A7',
};

export function computeAnalytics(events: RawEvent[], period: string): ComputedAnalytics {
  const sessionGeoMap = new Map<string, RawEvent['geo']>();

  for (const e of events) {
    const sid = e.session_id || 'unknown';
    const geo = e.geo as RawEvent['geo'];
    if (geo?.country) {
      if (e.event === 'geo_backfill') {
        sessionGeoMap.set(sid, geo);
      } else if (!sessionGeoMap.has(sid)) {
        sessionGeoMap.set(sid, geo);
      }
    }
    const props = e.properties as Record<string, unknown> | undefined;
    if (!geo?.country && props && !sessionGeoMap.has(sid)) {
      const geoCountry = typeof props.geoCountry === 'string' ? props.geoCountry : undefined;
      const geoCity = typeof props.geoCity === 'string' ? props.geoCity : undefined;
      const geoRegion = typeof props.geoRegion === 'string' ? props.geoRegion : undefined;
      const geoTimezone = typeof props.geoTimezone === 'string' ? props.geoTimezone : undefined;
      const geoLat = typeof props.geoLat === 'number' ? props.geoLat : undefined;
      const geoLng = typeof props.geoLng === 'number' ? props.geoLng : undefined;
      const geoCountryCode = typeof props.geoCountryCode === 'string' ? props.geoCountryCode : undefined;
      if (geoCountry) {
        const extractedGeo: RawEvent['geo'] = {
          country: geoCountry,
          city: geoCity,
          region: geoRegion,
          countryCode: geoCountryCode,
          timezone: geoTimezone,
          lat: geoLat,
          lng: geoLng,
        };
        sessionGeoMap.set(sid, extractedGeo);
        e.geo = extractedGeo;
      }
    }
  }

  for (const e of events) {
    const sid = e.session_id || 'unknown';
    const currentGeo = e.geo as RawEvent['geo'];
    if (!currentGeo?.country && sessionGeoMap.has(sid)) {
      e.geo = sessionGeoMap.get(sid);
    }
  }

  const totalSessions = new Set(events.map(e => e.session_id)).size;
  console.log('[Analytics] Geo propagation: sessions with geo:', sessionGeoMap.size, 'of', totalSessions, '(' + (totalSessions > 0 ? Math.round((sessionGeoMap.size / totalSessions) * 100) : 0) + '%)');

  const sessionMap = new Map<string, RawEvent[]>();
  events.forEach(e => {
    const sid = e.session_id || 'unknown';
    if (!sessionMap.has(sid)) sessionMap.set(sid, []);
    sessionMap.get(sid)!.push(e);
  });

  const uniqueSessions = sessionMap.size;
  const totalEvents = events.length;

  const eventCounts = new Map<string, number>();
  events.forEach(e => {
    const name = e.event || 'unknown';
    eventCounts.set(name, (eventCounts.get(name) || 0) + 1);
  });

  const pageViews = sumEventCounts(eventCounts, ['page_view', 'pageview', 'landing_page_view', 'landing_view', 'screen_view']) || uniqueSessions;
  const scroll25 = sumEventCounts(eventCounts, ['scroll_25', 'scroll25']);
  const scroll50 = sumEventCounts(eventCounts, ['scroll_50', 'scroll50']);
  const scroll75 = sumEventCounts(eventCounts, ['scroll_75', 'scroll75']);
  const scroll100 = sumEventCounts(eventCounts, ['scroll_100', 'scroll100']);
  const formFocuses = sumEventCounts(eventCounts, ['form_focus', 'form_start', 'waitlist_attempt', 'funnel_open']);
  const formSubmits = sumEventCounts(eventCounts, ['form_submit', 'form_submitted', 'waitlist_join', 'waitlist_success', 'funnel_form_submit', 'funnel_success']);

  const ctaClicks = classifyCtaClicks(events);
  const ctaGetStarted = sumEventCounts(eventCounts, ['cta_get_started', 'cta_getstarted']) + ctaClicks.getStarted;
  const ctaSignIn = sumEventCounts(eventCounts, ['cta_sign_in', 'cta_signin']) + ctaClicks.signIn;
  const ctaJvInquire = sumEventCounts(eventCounts, ['cta_jv_inquire', 'cta_jv']) + ctaClicks.jvInquire;
  const ctaWebsite = sumEventCounts(eventCounts, ['cta_website', 'cta_website_click']) + ctaClicks.website;

  const waitlistJoins = sumEventCounts(eventCounts, ['waitlist_join', 'waitlist_signup', 'waitlist_success', 'funnel_success']);
  const waitlistCount = Math.max(waitlistJoins - formSubmits, 0);

  const linkClickEvents = events.filter(e => e.event === 'link_click' || e.event === 'cta_click');
  const linkClickMap = new Map<string, { label: string; destination: string; count: number; location: string; lastClicked: string }>();
  for (const e of linkClickEvents) {
    const props = e.properties as Record<string, unknown> | undefined;
    const label = typeof props?.label === 'string' ? props.label : e.event;
    const destination = typeof props?.destination === 'string' ? props.destination : '';
    const location = typeof props?.location === 'string' ? props.location : 'unknown';
    const key = `${label}|${destination}`;
    const existing = linkClickMap.get(key);
    if (existing) {
      existing.count++;
      if (e.created_at > existing.lastClicked) existing.lastClicked = e.created_at;
    } else {
      linkClickMap.set(key, { label, destination, count: 1, location, lastClicked: e.created_at });
    }
  }
  const linkClicks = Array.from(linkClickMap.values()).sort((a, b) => b.count - a.count);

  const sectionViewEvents = events.filter(e => e.event === 'section_view');
  const sectionViewMap = new Map<string, number>();
  for (const e of sectionViewEvents) {
    const props = e.properties as Record<string, unknown> | undefined;
    const section = typeof props?.section === 'string' ? props.section : 'unknown';
    sectionViewMap.set(section, (sectionViewMap.get(section) || 0) + 1);
  }
  const sectionViews = Array.from(sectionViewMap.entries())
    .map(([section, count]) => ({ section, count, pct: uniqueSessions > 0 ? parseFloat(((count / uniqueSessions) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);

  const conversionRate = pageViews > 0 ? parseFloat(((formSubmits / pageViews) * 100).toFixed(1)) : 0;
  const scrollEngagement = pageViews > 0 ? parseFloat(((scroll50 / pageViews) * 100).toFixed(1)) : 0;

  const byEvent = Array.from(eventCounts.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);

  const platformMap = new Map<string, number>();
  const referrerMap = new Map<string, number>();
  events.forEach(e => {
    const props = e.properties as Record<string, unknown> | undefined;
    const platform = typeof props?.platform === 'string' ? props.platform : 'unknown';
    platformMap.set(platform, (platformMap.get(platform) || 0) + 1);
    const referrer = typeof props?.referrer === 'string' ? props.referrer : 'direct';
    referrerMap.set(referrer, (referrerMap.get(referrer) || 0) + 1);
  });

  const byPlatform = Array.from(platformMap.entries()).map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
  const byReferrer = Array.from(referrerMap.entries()).map(([referrer, count]) => ({ referrer, count })).sort((a, b) => b.count - a.count);

  const dailyMap = new Map<string, { views: number; sessions: Set<string> }>();
  events.forEach(e => {
    const date = e.created_at?.split('T')[0] || 'unknown';
    if (!dailyMap.has(date)) dailyMap.set(date, { views: 0, sessions: new Set() });
    const d = dailyMap.get(date)!;
    d.views++;
    d.sessions.add(e.session_id || 'unknown');
  });
  const dailyViews = Array.from(dailyMap.entries())
    .map(([date, d]) => ({ date, views: d.views, sessions: d.sessions.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hourlyMap = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourlyMap.set(h, 0);
  events.forEach(e => {
    const hour = new Date(e.created_at).getHours();
    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
  });
  const hourlyActivity = Array.from(hourlyMap.entries()).map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour - b.hour);

  const countryMap = new Map<string, number>();
  const cityMap = new Map<string, { count: number; country: string; lat?: number; lng?: number }>();
  const regionMap = new Map<string, number>();
  const tzMap = new Map<string, number>();
  let totalWithGeo = 0;

  events.forEach(e => {
    const geo = e.geo as { city?: string; country?: string; region?: string; lat?: number; lng?: number; timezone?: string } | undefined;
    if (geo?.country) {
      totalWithGeo++;
      countryMap.set(geo.country, (countryMap.get(geo.country) || 0) + 1);
      if (geo.city) {
        const key = `${geo.city}_${geo.country}`;
        if (!cityMap.has(key)) cityMap.set(key, { count: 0, country: geo.country, lat: geo.lat, lng: geo.lng });
        cityMap.get(key)!.count++;
      }
      if (geo.region) regionMap.set(geo.region, (regionMap.get(geo.region) || 0) + 1);
      if (geo.timezone) tzMap.set(geo.timezone, (tzMap.get(geo.timezone) || 0) + 1);
    }
  });

  const byCountry = Array.from(countryMap.entries())
    .map(([country, count]) => ({ country, count, pct: totalWithGeo > 0 ? parseFloat(((count / totalWithGeo) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);

  const byCity = Array.from(cityMap.entries())
    .map(([key, d]) => ({ city: key.split('_')[0] ?? key, count: d.count, country: d.country, lat: d.lat, lng: d.lng, pct: totalWithGeo > 0 ? parseFloat(((d.count / totalWithGeo) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);

  const byRegion = Array.from(regionMap.entries())
    .map(([region, count]) => ({ region, count, pct: totalWithGeo > 0 ? parseFloat(((count / totalWithGeo) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);

  const byTimezone = Array.from(tzMap.entries())
    .map(([timezone, count]) => ({ timezone, count }))
    .sort((a, b) => b.count - a.count);

  const deviceMap = new Map<string, number>();
  events.forEach(e => {
    const device = detectDevice(e.properties as Record<string, unknown> | undefined);
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
  });
  const deviceBreakdown = Array.from(deviceMap.entries())
    .map(([device, count]) => ({ device, count, pct: totalEvents > 0 ? parseFloat(((count / totalEvents) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);

  const peakHour = hourlyActivity.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 }).hour;

  let sessionsWithForm = 0;
  let sessionsWithCta = 0;
  let sessionsWithScroll75 = 0;
  let totalSessionDuration = 0;
  let bounceSessions = 0;

  sessionMap.forEach((sessionEvents) => {
    const hasForm = sessionEvents.some(e => e.event?.includes('form_submit') || e.event?.includes('waitlist'));
    const hasCta = sessionEvents.some(e => e.event?.includes('cta_'));
    const hasScroll = sessionEvents.some(e => e.event?.includes('scroll_75') || e.event?.includes('scroll75'));
    if (hasForm) sessionsWithForm++;
    if (hasCta) sessionsWithCta++;
    if (hasScroll) sessionsWithScroll75++;
    if (sessionEvents.length === 1) bounceSessions++;
    if (sessionEvents.length > 1) {
      const times = sessionEvents.map(e => new Date(e.created_at).getTime()).sort((a, b) => a - b);
      const firstT = times[0];
      const lastT = times[times.length - 1];
      if (firstT !== undefined && lastT !== undefined) {
        totalSessionDuration += (lastT - firstT) / 1000;
      }
    }
  });

  const avgTimeOnPage = uniqueSessions > 0 ? Math.round(totalSessionDuration / uniqueSessions) : 0;
  const bounceRate = uniqueSessions > 0 ? parseFloat(((bounceSessions / uniqueSessions) * 100).toFixed(1)) : 0;

  const highIntent = sessionsWithForm;
  const mediumIntent = sessionsWithCta - sessionsWithForm;
  const lowIntent = Math.max(uniqueSessions - sessionsWithCta, 0);
  const totalIntent = Math.max(uniqueSessions, 1);
  const engagementScore = Math.min(Math.round(
    (sessionsWithScroll75 / Math.max(uniqueSessions, 1)) * 30 +
    (sessionsWithCta / Math.max(uniqueSessions, 1)) * 30 +
    (sessionsWithForm / Math.max(uniqueSessions, 1)) * 40
  ), 100);

  const interestMap = new Map<string, number>();
  events.forEach(e => {
    const props = e.properties as Record<string, unknown> | undefined;
    const section = typeof props?.section === 'string' ? props.section : (typeof props?.interest === 'string' ? props.interest : '');
    if (section && section !== 'undefined') {
      interestMap.set(section, (interestMap.get(section) || 0) + 1);
    }
  });
  const topInterests = Array.from(interestMap.entries())
    .map(([interest, count]) => ({ interest, count, pct: totalEvents > 0 ? parseFloat(((count / totalEvents) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const recentSessions: ComputedAnalytics['liveData']['sessions'] = [];
  let activeCount = 0;
  let recentCount = 0;

  sessionMap.forEach((sessionEvents, sid) => {
    const lastEvent = sessionEvents.reduce((latest, e) => {
      const t = new Date(e.created_at).getTime();
      return t > latest ? t : latest;
    }, 0);
    const firstEvent = sessionEvents.reduce((earliest, e) => {
      const t = new Date(e.created_at).getTime();
      return t < earliest ? t : earliest;
    }, Infinity);
    const isActive = lastEvent > fiveMinAgo;
    if (isActive) {
      activeCount++;
      recentCount++;
    }

    const props = sessionEvents[0]?.properties as Record<string, unknown> | undefined;
    const geo = sessionEvents[0]?.geo as { city?: string; country?: string; region?: string } | undefined;
    const step = sessionEvents.reduce((maxStep, e) => {
      const p = e.properties as Record<string, unknown> | undefined;
      const s = Number(p?.step) || 0;
      return s > maxStep ? s : maxStep;
    }, 0);

    recentSessions.push({
      sessionId: sid,
      ip: '',
      device: detectDevice(props),
      os: typeof props?.platform === 'string' ? props.platform : 'unknown',
      browser: 'Unknown',
      geo,
      currentStep: step,
      sessionDuration: Math.round((lastEvent - firstEvent) / 1000),
      activeTime: Math.round((lastEvent - firstEvent) / 1000),
      lastSeen: new Date(lastEvent).toISOString(),
      startedAt: new Date(firstEvent).toISOString(),
      isActive,
    });
  });

  recentSessions.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  const liveByCountry = new Map<string, number>();
  const liveByDevice = new Map<string, number>();
  const liveByStep = new Map<string, number>();
  recentSessions.filter((s: ComputedAnalytics['liveData']['sessions'][number]) => s.isActive).forEach((s: ComputedAnalytics['liveData']['sessions'][number]) => {
    if (s.geo?.country) liveByCountry.set(s.geo.country, (liveByCountry.get(s.geo.country) || 0) + 1);
    liveByDevice.set(s.device, (liveByDevice.get(s.device) || 0) + 1);
    const stepLabel = `Step ${s.currentStep}`;
    liveByStep.set(stepLabel, (liveByStep.get(stepLabel) || 0) + 1);
  });

  const { current: currentHalf, previous: previousHalf } = splitEventsByHalf(events);
  const prevSessions = new Set(previousHalf.map(e => e.session_id || 'unknown')).size;
  const currSessions = new Set(currentHalf.map(e => e.session_id || 'unknown')).size;
  const prevViews = previousHalf.filter(e => e.event?.includes('view') || e.event?.includes('page')).length || new Set(previousHalf.map(e => e.session_id)).size;
  const currViews = currentHalf.filter(e => e.event?.includes('view') || e.event?.includes('page')).length || new Set(currentHalf.map(e => e.session_id)).size;
  const prevSubmits = previousHalf.filter(e => e.event?.includes('form_submit') || e.event?.includes('waitlist')).length;
  const currSubmits = currentHalf.filter(e => e.event?.includes('form_submit') || e.event?.includes('waitlist')).length;
  const prevConv = prevViews > 0 ? (prevSubmits / prevViews) * 100 : 0;
  const currConv = currViews > 0 ? (currSubmits / currViews) * 100 : 0;
  const prevBounce = computeBounceRate(previousHalf);
  const currBounce = computeBounceRate(currentHalf);

  const channelMap = new Map<string, { sessions: Set<string>; leads: number }>();
  events.forEach(e => {
    const props = e.properties as Record<string, unknown> | undefined;
    const referrer = typeof props?.referrer === 'string' ? props.referrer : 'direct';
    const channel = classifyAcquisitionChannel(referrer);
    if (!channelMap.has(channel)) channelMap.set(channel, { sessions: new Set(), leads: 0 });
    const ch = channelMap.get(channel)!;
    ch.sessions.add(e.session_id || 'unknown');
    if (e.event?.includes('form_submit') || e.event?.includes('waitlist')) ch.leads++;
  });
  const totalChannelSessions = Array.from(channelMap.values()).reduce((s, c) => s + c.sessions.size, 0) || 1;
  const acquisition: AcquisitionChannel[] = Array.from(channelMap.entries())
    .map(([channel, d]) => ({
      channel,
      sessions: d.sessions.size,
      leads: d.leads,
      conversionRate: d.sessions.size > 0 ? parseFloat(((d.leads / d.sessions.size) * 100).toFixed(1)) : 0,
      pct: parseFloat(((d.sessions.size / totalChannelSessions) * 100).toFixed(1)),
      color: CHANNEL_COLORS[channel] || '#6A6A6A',
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const sessionEventCounts: number[] = [];
  const allSessionIds = new Set<string>();
  const returningFingerprints = new Map<string, Set<string>>();
  const sessionDays = new Map<string, Set<string>>();
  sessionMap.forEach((sessionEvents, sid) => {
    sessionEventCounts.push(sessionEvents.length);
    allSessionIds.add(sid);
    const props = sessionEvents[0]?.properties as Record<string, unknown> | undefined;
    const ip = typeof props?.ip === 'string' ? props.ip : '';
    const ua = typeof props?.userAgent === 'string' ? props.userAgent : '';
    const platform = typeof props?.platform === 'string' ? props.platform : '';
    const geo = sessionEvents[0]?.geo as { country?: string; city?: string } | undefined;
    const geoStr = geo?.country ? `${geo.country}_${geo.city || ''}` : '';
    const userId = typeof props?.userId === 'string' ? props.userId : '';
    const email = typeof props?.email === 'string' ? props.email : '';
    const fingerprint = userId || email || ip || (ua && geoStr ? `${ua}_${geoStr}` : '') || (platform && geoStr ? `${platform}_${geoStr}` : '');
    if (fingerprint) {
      if (!returningFingerprints.has(fingerprint)) returningFingerprints.set(fingerprint, new Set());
      returningFingerprints.get(fingerprint)!.add(sid);
    }
    const _day = sessionEvents[0]?.created_at?.split('T')[0] || 'unknown';
    if (!sessionDays.has(sid)) sessionDays.set(sid, new Set());
    sessionEvents.forEach(e => {
      const d = e.created_at?.split('T')[0] || 'unknown';
      sessionDays.get(sid)!.add(d);
    });
  });
  const avgPagesPerSession = sessionEventCounts.length > 0 ? parseFloat((sessionEventCounts.reduce((s, c) => s + c, 0) / sessionEventCounts.length).toFixed(1)) : 0;
  const engagedSessionsCount = sessionEventCounts.filter(c => c >= 3).length;
  const engagedSessionsPct = uniqueSessions > 0 ? parseFloat(((engagedSessionsCount / uniqueSessions) * 100).toFixed(1)) : 0;
  let returningCount = 0;
  const fingerprintDays = new Map<string, Set<string>>();
  returningFingerprints.forEach((sessions, fp) => {
    if (!fingerprintDays.has(fp)) fingerprintDays.set(fp, new Set());
    sessions.forEach(sid => {
      const days = sessionDays.get(sid);
      if (days) days.forEach(d => fingerprintDays.get(fp)!.add(d));
    });
    if (sessions.size > 1) {
      returningCount += sessions.size - 1;
    } else if (fingerprintDays.get(fp)!.size > 1) {
      returningCount += 1;
    }
  });
  console.log('[Analytics] Return visitor detection: fingerprints:', returningFingerprints.size, 'returning sessions:', returningCount, 'of', uniqueSessions, '| multi-day fingerprints:', Array.from(fingerprintDays.values()).filter(d => d.size > 1).length);
  const newCount = Math.max(uniqueSessions - returningCount, 0);
  const totalForNR = Math.max(uniqueSessions, 1);

  return {
    period,
    totalLeads: formSubmits + waitlistCount,
    registeredUsers: formSubmits,
    waitlistLeads: waitlistCount,
    totalEvents,
    pageViews,
    uniqueSessions,
    funnel: { pageViews, scroll25, scroll50, scroll75, scroll100, formFocuses, formSubmits },
    cta: { getStarted: ctaGetStarted, signIn: ctaSignIn, jvInquire: ctaJvInquire, websiteClick: ctaWebsite },
    conversionRate,
    scrollEngagement,
    byEvent,
    byPlatform,
    byReferrer,
    dailyViews,
    hourlyActivity,
    geoZones: { byCountry, byCity, byRegion, byTimezone, totalWithGeo },
    smartInsights: {
      avgTimeOnPage,
      bounceRate,
      engagementScore,
      topInterests,
      sectionEngagement: topInterests.map(i => ({ section: i.interest, count: i.count, pct: i.pct })),
      deviceBreakdown,
      peakHour,
      contentInteraction: {
        scrolledPast50Pct: scroll50,
        scrolledPast75Pct: scroll75,
        interactedWithForm: formFocuses,
        submittedForm: formSubmits,
        clickedAnyCta: ctaGetStarted + ctaSignIn + ctaJvInquire + ctaWebsite,
      },
      visitorIntent: {
        highIntent,
        mediumIntent: Math.max(mediumIntent, 0),
        lowIntent,
        highIntentPct: parseFloat(((highIntent / totalIntent) * 100).toFixed(1)),
        mediumIntentPct: parseFloat(((Math.max(mediumIntent, 0) / totalIntent) * 100).toFixed(1)),
        lowIntentPct: parseFloat(((lowIntent / totalIntent) * 100).toFixed(1)),
      },
    },
    liveData: {
      active: activeCount,
      recent: recentCount,
      sessions: recentSessions.slice(0, 30),
      breakdown: {
        byCountry: Array.from(liveByCountry.entries()).map(([country, count]) => ({ country, count })),
        byDevice: Array.from(liveByDevice.entries()).map(([device, count]) => ({ device, count })),
        byStep: Array.from(liveByStep.entries()).map(([step, count]) => ({ step, count })),
      },
      timestamp: new Date().toISOString(),
    },
    trends: {
      pageViews: computeTrend(currViews, prevViews),
      sessions: computeTrend(currSessions, prevSessions),
      leads: computeTrend(currSubmits, prevSubmits),
      conversionRate: computeTrend(currConv, prevConv),
      bounceRate: computeTrend(currBounce, prevBounce),
      avgDuration: (() => {
        const prevDur = previousHalf.length > 0 ? (() => {
          const prevSM = new Map<string, number[]>();
          previousHalf.forEach(e => {
            const sid = e.session_id || 'u';
            if (!prevSM.has(sid)) prevSM.set(sid, []);
            prevSM.get(sid)!.push(new Date(e.created_at).getTime());
          });
          let totalDur = 0;
          let count = 0;
          prevSM.forEach(times => {
            if (times.length > 1) {
              times.sort((a, b) => a - b);
              const first = times[0]!;
              const last = times[times.length - 1]!;
              totalDur += (last - first) / 1000;
              count++;
            }
          });
          return count > 0 ? Math.round(totalDur / count) : 0;
        })() : 0;
        return computeTrend(avgTimeOnPage, prevDur);
      })(),
    },
    acquisition,
    sessionQuality: {
      avgPagesPerSession,
      avgSessionDuration: avgTimeOnPage,
      engagedSessionsPct,
      newVsReturning: {
        new: newCount,
        returning: returningCount,
        newPct: parseFloat(((newCount / totalForNR) * 100).toFixed(1)),
        returningPct: parseFloat(((returningCount / totalForNR) * 100).toFixed(1)),
      },
    },
    linkClicks,
    sectionViews,
  };
}

export function computeVisitorIntelligence(events: RawEvent[], period: string): VisitorIntelData {
  const analytics = computeAnalytics(events, period);
  const sessionMap = new Map<string, RawEvent[]>();
  events.forEach(e => {
    const sid = e.session_id || 'unknown';
    if (!sessionMap.has(sid)) sessionMap.set(sid, []);
    sessionMap.get(sid)!.push(e);
  });

  const highIntentVisitors: VisitorIntelData['highIntentVisitors'] = [];
  const recentVisitors: VisitorIntelData['recentVisitors'] = [];
  let hotLeads = 0;
  let warmLeads = 0;
  let engagedCount = 0;
  let bouncedCount = 0;

  sessionMap.forEach((sessionEvents, _sid) => {
    const hasForm = sessionEvents.some(e => e.event?.includes('form_submit') || e.event?.includes('waitlist'));
    const hasCta = sessionEvents.some(e => e.event?.includes('cta_'));
    const hasScroll75 = sessionEvents.some(e => e.event?.includes('scroll_75') || e.event?.includes('scroll75'));
    const eventCount = sessionEvents.length;

    const geo = sessionEvents[0]?.geo as { city?: string; country?: string } | undefined;
    const props = sessionEvents[0]?.properties as Record<string, unknown> | undefined;
    const device = detectDevice(props);

    const times = sessionEvents.map(e => new Date(e.created_at).getTime()).sort((a, b) => a - b);
    const tFirst = times[0];
    const tLast = times[times.length - 1];
    const duration = times.length > 1 && tFirst !== undefined && tLast !== undefined ? Math.round((tLast - tFirst) / 1000) : 0;

    let intent = 'browsing';
    let score = 10;
    if (hasForm) { intent = 'hot_lead'; score = 90; hotLeads++; }
    else if (hasCta && hasScroll75) { intent = 'warm'; score = 65; warmLeads++; }
    else if (hasCta || hasScroll75) { intent = 'interested'; score = 40; }

    if (eventCount > 2) engagedCount++;
    else bouncedCount++;

    const visitor = { intent, engagementScore: score, geo, device, duration, eventCount, hasFormSubmit: hasForm, hasCta, hasScroll75 };

    if (intent === 'hot_lead' || intent === 'warm') {
      highIntentVisitors.push(visitor);
    }
    recentVisitors.push(visitor);
  });

  highIntentVisitors.sort((a, b) => b.engagementScore - a.engagementScore);
  recentVisitors.sort((a, b) => b.eventCount - a.eventCount);

  const totalSessions = analytics.uniqueSessions;
  const avgEngagement = analytics.smartInsights.engagementScore;

  const dayMap = new Map<string, number>();
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  DAYS.forEach(d => dayMap.set(d, 0));
  events.forEach(e => {
    const dayIdx = new Date(e.created_at).getDay();
    const day = DAYS[dayIdx] ?? 'Unknown';
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  });
  const dayOfWeek = DAYS.map(day => ({ day, count: dayMap.get(day) || 0 }));
  const peakDay = dayOfWeek.reduce((max, d) => d.count > max.count ? d : max, { day: 'Monday', count: 0 }).day;

  const aiInsights: string[] = [];
  if (totalSessions > 0) {
    if (hotLeads > 0) aiInsights.push(`${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} detected — visitors who submitted forms showing strong purchase intent.`);
    if (warmLeads > 0) aiInsights.push(`${warmLeads} warm lead${warmLeads > 1 ? 's' : ''} engaged with CTAs and scrolled deep into the page.`);
    if (analytics.smartInsights.peakHour >= 0) aiInsights.push(`Peak traffic at ${analytics.smartInsights.peakHour}:00 — consider scheduling campaigns around this time.`);
    if (analytics.smartInsights.bounceRate > 50) aiInsights.push(`Bounce rate is ${analytics.smartInsights.bounceRate}% — consider improving above-the-fold content.`);
    const topCountry = analytics.geoZones.byCountry[0];
    if (topCountry) aiInsights.push(`Top market: ${topCountry.country} with ${topCountry.count} visits.`);
  }
  if (aiInsights.length === 0) {
    aiInsights.push('No visitor data collected yet. Analytics will populate as visitors land on your page.');
  }

  const topSources = analytics.byReferrer.map(r => ({
    source: r.referrer,
    visits: r.count,
    conversions: 0,
    conversionRate: 0,
  }));

  const topCountries = analytics.geoZones.byCountry.map(c => ({
    country: c.country,
    visits: c.count,
    conversions: 0,
    avgEngagement: Math.round(avgEngagement * (c.pct / 100)),
  }));

  return {
    summary: {
      totalSessions,
      hotLeads,
      warmLeads,
      avgEngagement,
      conversionRate: analytics.conversionRate,
      totalEvents: analytics.totalEvents,
      engagedVisitors: engagedCount,
      bouncedVisitors: bouncedCount,
    },
    liveNow: { activeVisitors: analytics.liveData.active },
    aiInsights,
    topSources,
    topCountries,
    highIntentVisitors: highIntentVisitors.slice(0, 20),
    recentVisitors: recentVisitors.slice(0, 30),
    patterns: {
      hourlyHeatmap: analytics.hourlyActivity,
      peakHour: analytics.smartInsights.peakHour,
      peakDay,
      dayOfWeek,
    },
    insights: aiInsights,
    trafficSources: topSources.map(s => ({ source: s.source, count: s.visits })),
    geoData: {
      byCountry: analytics.geoZones.byCountry.map(c => ({ country: c.country, count: c.count })),
      byCity: analytics.geoZones.byCity.map(c => ({ city: c.city, count: c.count })),
    },
    hourlyActivity: analytics.hourlyActivity,
    dailyTrend: analytics.dailyViews.map(d => ({ date: d.date, count: d.views })),
    deviceBreakdown: analytics.smartInsights.deviceBreakdown.map(d => ({ device: d.device, count: d.count })),
  };
}
