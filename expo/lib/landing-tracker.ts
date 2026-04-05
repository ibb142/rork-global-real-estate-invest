import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { awsAnalyticsBackup, type AWSAnalyticsEvent } from './aws-analytics-backup';
import * as SecureStore from 'expo-secure-store';

const OWNER_IP_ENABLED_KEY = 'ivx_owner_ip_enabled';

async function isOwnerIPMode(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(OWNER_IP_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

const SESSION_KEY = '@ivx_landing_session';
const QUEUE_KEY = '@ivx_landing_queue';
const GEO_CACHE_KEY = '@ivx_geo_cache';
const BATCH_SIZE = 50;
const FLUSH_INTERVAL = 15_000;
const GEO_CACHE_TTL = 30 * 60 * 1000;

interface GeoData {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  ip?: string;
  org?: string;
}

interface LandingEvent {
  event: string;
  session_id: string;
  properties: Record<string, unknown>;
  geo?: Record<string, unknown>;
  created_at: string;
}

const LANDING_TRACKER_DEBUG = process.env.EXPO_PUBLIC_LANDING_TRACKER_DEBUG === 'true';

function trackerLog(...args: unknown[]): void {
  if (__DEV__ && LANDING_TRACKER_DEBUG) {
    console.log(...args);
  }
}

async function fetchRealGeoData(): Promise<GeoData | null> {
  const GEO_APIS = [
    {
      url: 'https://ipapi.co/json/',
      parse: (d: Record<string, unknown>): GeoData => ({
        city: d.city as string || undefined,
        region: d.region as string || undefined,
        country: d.country_name as string || undefined,
        countryCode: d.country_code as string || undefined,
        lat: typeof d.latitude === 'number' ? d.latitude : undefined,
        lng: typeof d.longitude === 'number' ? d.longitude : undefined,
        timezone: d.timezone as string || undefined,
        ip: d.ip as string || undefined,
        org: d.org as string || undefined,
      }),
    },
    {
      url: 'https://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,query',
      parse: (d: Record<string, unknown>): GeoData => ({
        city: d.city as string || undefined,
        region: d.regionName as string || undefined,
        country: d.country as string || undefined,
        countryCode: d.countryCode as string || undefined,
        lat: typeof d.lat === 'number' ? d.lat : undefined,
        lng: typeof d.lon === 'number' ? d.lon : undefined,
        timezone: d.timezone as string || undefined,
        ip: d.query as string || undefined,
        org: d.org as string || d.isp as string || undefined,
      }),
    },
    {
      url: 'https://ipwho.is/',
      parse: (d: Record<string, unknown>): GeoData => ({
        city: d.city as string || undefined,
        region: d.region as string || undefined,
        country: d.country as string || undefined,
        countryCode: d.country_code as string || undefined,
        lat: typeof d.latitude === 'number' ? d.latitude : undefined,
        lng: typeof d.longitude === 'number' ? d.longitude : undefined,
        timezone: typeof d.timezone === 'object' && d.timezone ? (d.timezone as Record<string, unknown>).id as string : undefined,
        ip: d.ip as string || undefined,
      }),
    },
  ];

  for (const api of GEO_APIS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(api.url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!resp.ok) {
        trackerLog('[GeoLookup] API failed:', api.url, resp.status);
        continue;
      }

      const data = await resp.json();
      if (data.error || data.status === 'fail') {
        trackerLog('[GeoLookup] API returned error:', api.url, data.message || data.error);
        continue;
      }

      const geo = api.parse(data);
      if (geo.country) {
        trackerLog('[GeoLookup] Real geo resolved:', geo.city, geo.region, geo.country, '| IP:', geo.ip, '| via', api.url);
        return geo;
      }
    } catch (err) {
      trackerLog('[GeoLookup] API exception:', api.url, (err as Error)?.message);
    }
  }

  console.warn('[GeoLookup] All geo APIs failed — no location data available');
  return null;
}

async function getCachedOrFetchGeo(): Promise<GeoData | null> {
  try {
    const cached = await AsyncStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.data && parsed.timestamp && Date.now() - parsed.timestamp < GEO_CACHE_TTL) {
        trackerLog('[GeoLookup] Using cached geo:', parsed.data.city, parsed.data.country);
        return parsed.data as GeoData;
      }
    }
  } catch {}

  const geo = await fetchRealGeoData();
  if (geo) {
    try {
      await AsyncStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ data: geo, timestamp: Date.now() }));
    } catch {}
  }
  return geo;
}

class LandingTracker {
  private sessionId: string;
  private sessionStart: number;
  private queue: LandingEvent[] = [];
  private flushing = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private totalSent = 0;
  private totalFailed = 0;
  private consecutiveFlushFailures = 0;
  private remoteDisabled = false;
  private geoData: GeoData | null = null;
  private geoFetching = false;
  private geoReady = false;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStart = Date.now();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const ownerIP = await isOwnerIPMode();
    if (ownerIP) {
      trackerLog('[LandingTracker] Owner IP mode — remote sync disabled. Local tracking only.');
      this.remoteDisabled = true;
      this.queue = [];
      this.initialized = true;
      return;
    }

    if (!isSupabaseConfigured()) {
      trackerLog('[LandingTracker] Supabase not configured — remote sync disabled');
      this.remoteDisabled = true;
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const thirtyMin = 30 * 60 * 1000;
        if (parsed.id && parsed.lastActive && Date.now() - parsed.lastActive < thirtyMin) {
          this.sessionId = parsed.id;
          this.sessionStart = parsed.start || Date.now();
          trackerLog('[LandingTracker] Resumed session:', this.sessionId.substring(0, 12));
        }
      }
    } catch {}

    try {
      const queued = await AsyncStorage.getItem(QUEUE_KEY);
      if (queued) {
        const parsed = JSON.parse(queued);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.queue = parsed;
          trackerLog('[LandingTracker] Loaded', parsed.length, 'queued events from storage');
        }
      }
    } catch {}

    void this.resolveGeo();

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL);

    trackerLog('[LandingTracker] Initialized — session:', this.sessionId.substring(0, 12), '| remote: true');
  }

  private async resolveGeo(): Promise<void> {
    if (this.geoFetching || this.geoReady) return;
    this.geoFetching = true;

    try {
      const geo = await getCachedOrFetchGeo();
      if (geo && geo.country) {
        this.geoData = geo;
        this.geoReady = true;
        trackerLog('[LandingTracker] Geo resolved:', geo.city, geo.region, geo.country, '| IP:', geo.ip);

        this.backfillGeoOnQueue();

        this.sendGeoBackfillEvent(geo);
      } else {
        trackerLog('[LandingTracker] Geo lookup returned no data');
      }
    } catch (err) {
      trackerLog('[LandingTracker] Geo resolve error:', (err as Error)?.message);
    } finally {
      this.geoFetching = false;
    }
  }

  private backfillGeoOnQueue(): void {
    if (!this.geoData) return;
    let backfilled = 0;
    for (const event of this.queue) {
      if (!event.geo || !event.geo.country) {
        event.geo = { ...this.geoData };
        backfilled++;
      }
    }
    if (backfilled > 0) {
      trackerLog('[LandingTracker] Backfilled geo on', backfilled, 'queued events');
      void this.saveQueue();
    }
  }

  private sendGeoBackfillEvent(geo: GeoData): void {
    const event: LandingEvent = {
      event: 'geo_backfill',
      session_id: this.sessionId,
      properties: {
        platform: Platform.OS,
        source: 'landing_app',
        geoCity: geo.city || '',
        geoRegion: geo.region || '',
        geoCountry: geo.country || '',
        geoCountryCode: geo.countryCode || '',
        geoTimezone: geo.timezone || '',
        geoIp: geo.ip || '',
        geoOrg: geo.org || '',
        geoLat: geo.lat,
        geoLng: geo.lng,
      },
      geo: { ...geo },
      created_at: new Date().toISOString(),
    };

    this.queue.push(event);
    trackerLog('[LandingTracker] Queued geo_backfill event for session:', this.sessionId.substring(0, 12));
    void this.saveQueue();
  }

  private generateSessionId(): string {
    return `ls_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private async saveSession(): Promise<void> {
    try {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
        id: this.sessionId,
        start: this.sessionStart,
        lastActive: Date.now(),
      }));
    } catch {}
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue.slice(-200)));
    } catch {}
  }

  track(eventName: string, properties: Record<string, unknown> = {}): void {
    if (this.remoteDisabled) {
      return;
    }

    const event: LandingEvent = {
      event: eventName,
      session_id: this.sessionId,
      properties: {
        ...properties,
        platform: Platform.OS,
        source: 'landing_app',
        sessionDuration: Math.round((Date.now() - this.sessionStart) / 1000),
        userAgent: Platform.OS === 'web' ? (typeof navigator !== 'undefined' ? navigator.userAgent : '') : Platform.OS,
      },
      geo: this.geoData ? { ...this.geoData } : undefined,
      created_at: new Date().toISOString(),
    };

    this.queue.push(event);
    trackerLog('[LandingTracker] Tracked:', eventName, '| queue:', this.queue.length);

    this.sendToAWSBackup(event);

    void this.saveSession();
    void this.saveQueue();

    if (this.queue.length >= BATCH_SIZE) {
      void this.flush();
    }
  }

  trackPageView(): void {
    this.track('page_view', { page: 'landing' });
  }

  trackScroll(percent: number): void {
    this.track(`scroll_${percent}`, { scrollPercent: percent });
  }

  trackCtaClick(label: string, location?: string): void {
    this.track('cta_click', { label, location: location || 'unknown' });
  }

  trackFormFocus(): void {
    this.track('form_focus', { form: 'waitlist' });
  }

  trackFormSubmit(investmentRange?: string): void {
    this.track('form_submit', { form: 'waitlist', investmentRange });
  }

  trackSectionView(section: string): void {
    this.track('section_view', { section });
  }

  trackLinkClick(label: string, destination: string, context?: Record<string, unknown>): void {
    this.track('link_click', { label, destination, location: context?.location || 'unknown', ...context });
    trackerLog('[LandingTracker] Link click:', label, '->', destination);
  }

  trackFeatureView(feature: string): void {
    this.track('feature_view', { feature });
  }

  trackInvestmentRangeSelect(range: string): void {
    this.track('investment_range_select', { range });
  }

  trackElementInteraction(element: string, action: string, details?: Record<string, unknown>): void {
    this.track('element_interaction', { element, action, ...details });
  }

  trackSessionEnd(): void {
    const duration = Math.round((Date.now() - this.sessionStart) / 1000);
    this.track('session_end', { duration });
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.flushing) return;

    if (this.remoteDisabled) {
      this.queue = [];
      void this.saveQueue();
      return;
    }

    if (!isSupabaseConfigured()) {
      trackerLog('[LandingTracker] Supabase not configured — disabling remote sync');
      this.disableRemote('Supabase not configured');
      return;
    }

    this.flushing = true;
    const batch = this.queue.splice(0, BATCH_SIZE);

    try {
      const rows = batch.map(e => ({
        event: e.event,
        session_id: e.session_id,
        properties: e.properties,
        geo: e.geo && typeof e.geo === 'object' && Object.keys(e.geo).length > 0 ? e.geo : null,
        created_at: e.created_at,
      }));

      const geoCount = rows.filter(r => r.geo !== null).length;
      trackerLog(`[LandingTracker] Flushing ${rows.length} events to landing_analytics (${geoCount} with geo)`);

      const { error } = await supabase.from('landing_analytics').insert(rows);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('schema cache') || error.message?.includes('could not find')) {
          trackerLog('[LandingTracker] landing_analytics table does not exist — disabling remote sync (events tracked locally only).');
          this.disableRemote('Table does not exist');
          this.flushing = false;
          return;
        }

        if (error.code === '42501' || error.message?.includes('RLS') || error.message?.includes('violates') || error.message?.includes('permission denied')) {
          trackerLog('[LandingTracker] RLS or permission blocked — disabling remote sync');
          this.disableRemote('RLS blocked — tracking locally only');
          this.flushing = false;
          return;
        }

        this.consecutiveFlushFailures++;
        trackerLog('[LandingTracker] Insert error:', error.message, '| failure #' + this.consecutiveFlushFailures);
        this.disableRemote('Insert failure: ' + error.message);
      } else {
        this.totalSent += batch.length;
        this.consecutiveFlushFailures = 0;
        trackerLog(`[LandingTracker] Flushed ${batch.length} events (total sent: ${this.totalSent})`);
      }
    } catch (err) {
      this.consecutiveFlushFailures++;
      trackerLog('[LandingTracker] Flush exception:', (err as Error)?.message);
      this.disableRemote('Flush exception: ' + (err as Error)?.message);
    }

    this.flushing = false;
    await this.saveQueue();
  }

  private async flushViaRest(rows: Record<string, unknown>[]): Promise<boolean> {
    const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!supabaseUrl || !supabaseKey) return false;

    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/landing_analytics`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(rows),
      });

      if (!resp.ok) {
        const body = await resp.text();
        trackerLog('[LandingTracker] REST flush failed:', resp.status, body.substring(0, 200));
        return false;
      }

      return true;
    } catch (err) {
      trackerLog('[LandingTracker] REST flush exception:', (err as Error)?.message);
      return false;
    }
  }

  private disableRemote(reason: string): void {
    this.remoteDisabled = true;
    this.queue = [];
    void this.saveQueue();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    trackerLog('[LandingTracker] Remote sync DISABLED:', reason, '— events tracked locally only.');
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getGeoData(): GeoData | null {
    return this.geoData;
  }

  getStats(): { queued: number; totalSent: number; totalFailed: number; hasGeo: boolean; geoCountry: string | null } {
    return {
      queued: this.queue.length,
      totalSent: this.totalSent,
      totalFailed: this.totalFailed,
      hasGeo: this.geoReady,
      geoCountry: this.geoData?.country || null,
    };
  }

  private sendToAWSBackup(event: LandingEvent): void {
    if (!awsAnalyticsBackup.isConfigured()) return;
    const awsEvent: AWSAnalyticsEvent = {
      id: `lt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      event: event.event,
      session_id: event.session_id,
      properties: event.properties,
      geo: event.geo,
      ip_address: this.geoData?.ip || undefined,
      platform: Platform.OS,
      source: 'landing',
      timestamp: event.created_at,
      created_at: event.created_at,
    };
    awsAnalyticsBackup.enqueue(awsEvent);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }
}

export const landingTracker = new LandingTracker();
export default landingTracker;
