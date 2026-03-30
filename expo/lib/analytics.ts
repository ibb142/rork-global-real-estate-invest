import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from './logger';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { scopedKey } from './project-storage';
import { isProduction, getEnvConfig } from './environment';

const ANALYTICS_STORAGE_KEY = scopedKey('analytics');
const SESSION_STORAGE_KEY = scopedKey('session');
const MAX_STORED_EVENTS = 300;
const SUPABASE_BATCH_SIZE = 500;
const MAX_PENDING_QUEUE = 2000;
const FLUSH_INTERVAL = 30_000;
const SYNC_INTERVAL = 45_000;
const MAX_EVENTS_PER_MINUTE = 60;
const EVENT_THROTTLE_WINDOW = 60_000;

export type EventCategory =
  | 'navigation'
  | 'user_action'
  | 'transaction'
  | 'error'
  | 'performance'
  | 'engagement'
  | 'conversion';

export interface AnalyticsEvent {
  id: string;
  name: string;
  category: EventCategory;
  properties?: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  platform: string;
}

export interface SessionData {
  id: string;
  startTime: number;
  lastActiveTime: number;
  screenViews: number;
  events: number;
}

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsStats {
  totalEvents: number;
  totalSessions: number;
  averageSessionDuration: number;
  topEvents: { name: string; count: number }[];
  errorRate: number;
  conversionEvents: number;
}

class AnalyticsService {
  private sessionId: string;
  private sessionStartTime: number;
  private eventQueue: AnalyticsEvent[] = [];
  private supabasePendingQueue: AnalyticsEvent[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private isInitialized = false;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private syncInterval: ReturnType<typeof setTimeout> | null = null;
  private supabaseTableVerified = false;
  private supabaseTableMissing = false;
  private tableCheckAttempts = 0;
  private readonly MAX_TABLE_CHECK_ATTEMPTS = 3;
  private tableHasExtendedSchema: boolean | null = null;
  private syncFailureCount = 0;
  private syncBackoffMs = SYNC_INTERVAL;
  private readonly MAX_BACKOFF_MS = 300_000;
  private rlsFailureCount = 0;
  private readonly MAX_RLS_FAILURES = 5;
  private lastSyncError: string | null = null;
  private totalSynced = 0;
  private totalDropped = 0;
  private duplicateCount = 0;
  private eventCountThisWindow = 0;
  private windowStart = Date.now();
  private throttledCount = 0;

  constructor() {
    this.sessionId = this.generateId();
    this.sessionStartTime = Date.now();
    setTimeout(() => { void this.initialize(); }, 500);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.loadSession();
      this.startFlushInterval();
      this.startSupabaseSyncInterval();
      this.isInitialized = true;
      logger.analytics.log('Initialized successfully');
    } catch (error) {
      console.log('[Analytics] Initialization error:', (error as Error)?.message);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private async loadSession(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const session: SessionData = JSON.parse(stored);
        const thirtyMinutes = 30 * 60 * 1000;
        if (Date.now() - session.lastActiveTime < thirtyMinutes) {
          this.sessionId = session.id;
          this.sessionStartTime = session.startTime;
        }
      }
    } catch (error) {
      console.log('[Analytics] Load session error:', (error as Error)?.message);
    }
  }

  private async saveSession(): Promise<void> {
    try {
      const session: SessionData = {
        id: this.sessionId,
        startTime: this.sessionStartTime,
        lastActiveTime: Date.now(),
        screenViews: this.eventQueue.filter(e => e.name === 'screen_view').length,
        events: this.eventQueue.length,
      };
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.log('[Analytics] Save session error:', (error as Error)?.message);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL);
  }

  private startSupabaseSyncInterval(): void {
    this.scheduleSyncWithBackoff();
  }

  private scheduleSyncWithBackoff(): void {
    if (this.syncInterval) clearTimeout(this.syncInterval);
    this.syncInterval = setTimeout(() => {
      void this.syncToSupabase().then(() => {
        this.scheduleSyncWithBackoff();
      });
    }, this.syncBackoffMs);
  }

  private increaseSyncBackoff(): void {
    this.syncBackoffMs = Math.min(this.syncBackoffMs * 2, this.MAX_BACKOFF_MS);
    console.log('[Analytics] Sync backoff increased to', this.syncBackoffMs, 'ms');
  }

  private resetSyncBackoff(): void {
    if (this.syncBackoffMs !== SYNC_INTERVAL) {
      this.syncBackoffMs = SYNC_INTERVAL;
      console.log('[Analytics] Sync backoff reset to', SYNC_INTERVAL, 'ms');
    }
  }

  private isThrottled(): boolean {
    const now = Date.now();
    if (now - this.windowStart > EVENT_THROTTLE_WINDOW) {
      if (this.throttledCount > 0) {
        console.warn(`[Analytics] Throttle window ended — ${this.throttledCount} events were dropped in the last ${EVENT_THROTTLE_WINDOW / 1000}s window`);
        this.totalDropped += this.throttledCount;
        this.throttledCount = 0;
      }
      this.windowStart = now;
      this.eventCountThisWindow = 0;
    }
    if (this.eventCountThisWindow >= MAX_EVENTS_PER_MINUTE) {
      this.throttledCount++;
      if (this.throttledCount === 1) {
        console.warn('[Analytics] Throttle limit reached (' + MAX_EVENTS_PER_MINUTE + ' events/min). Subsequent events will be dropped until window resets.');
      }
      return true;
    }
    this.eventCountThisWindow++;
    return false;
  }

  private async verifySupabaseTable(): Promise<boolean> {
    if (this.supabaseTableVerified) return true;
    if (this.supabaseTableMissing) {
      if (this.tableCheckAttempts < this.MAX_TABLE_CHECK_ATTEMPTS * 3) {
        this.tableCheckAttempts++;
        if (this.tableCheckAttempts % 5 === 0) {
          console.log('[Analytics] Re-checking table existence (attempt', this.tableCheckAttempts, ')');
          this.supabaseTableMissing = false;
        } else {
          return false;
        }
      } else {
        return false;
      }
    }

    if (!isSupabaseConfigured()) {
      console.error('[Analytics] Supabase not configured — events will not be persisted');
      this.supabaseTableMissing = true;
      this.lastSyncError = 'Supabase not configured';
      return false;
    }

    this.tableCheckAttempts++;
    try {
      const { data, error } = await supabase.from('analytics_events').select('id').limit(1);
      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42P01' || error.message?.includes('relation')) {
          this.supabaseTableMissing = true;
          console.warn('[Analytics] analytics_events table does not exist. Create it in Supabase.');
          this.lastSyncError = 'analytics_events table missing';
          return false;
        }
        console.log('[Analytics] Table check returned error (may be RLS — treating as exists):', error.message);
        this.supabaseTableVerified = true;
        return true;
      }
      this.supabaseTableVerified = true;
      this.supabaseTableMissing = false;
      if (data && data.length > 0) {
        const { data: schemaCheck, error: schemaErr } = await supabase.from('analytics_events').select('id,name,category,platform').limit(1);
        if (!schemaErr && schemaCheck && schemaCheck.length > 0) {
          const row = schemaCheck[0] as Record<string, unknown>;
          this.tableHasExtendedSchema = 'name' in row || 'category' in row || 'platform' in row;
        } else {
          this.tableHasExtendedSchema = false;
        }
        console.log('[Analytics] Table verified — schema:', this.tableHasExtendedSchema ? 'extended' : 'master');
      } else {
        console.log('[Analytics] Table exists but is empty — will try extended schema first');
      }
      return true;
    } catch (err) {
      console.log('[Analytics] Table verification error:', (err as Error)?.message);
      return false;
    }
  }

  private async getSupabaseUserId(): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;
    } catch {
      console.log('[Analytics] Could not get Supabase session user');
    }
    return null;
  }

  private async syncToSupabase(): Promise<void> {
    if (this.supabasePendingQueue.length === 0) return;

    if (this.supabasePendingQueue.length > MAX_PENDING_QUEUE) {
      this.supabasePendingQueue = this.supabasePendingQueue.slice(-MAX_PENDING_QUEUE);
    }

    const userId = await this.getSupabaseUserId();

    const tableExists = await this.verifySupabaseTable();
    if (!tableExists) {
      console.error('[Analytics] SYNC BLOCKED: analytics_events table missing. Pending:', this.supabasePendingQueue.length, 'events. These events are at risk of being lost.');
      this.syncFailureCount++;
      return;
    }

    const batch = this.supabasePendingQueue.splice(0, SUPABASE_BATCH_SIZE);
    if (batch.length === 0) return;

    try {
      const effectiveUserId = userId || 'anonymous';
      const useExtended = this.tableHasExtendedSchema !== false;
      const rows = batch.map(event => {
        if (useExtended) {
          return {
            id: event.id,
            user_id: effectiveUserId,
            name: event.name,
            category: event.category,
            properties: event.properties ? JSON.stringify(event.properties) : null,
            timestamp: new Date(event.timestamp).toISOString(),
            session_id: event.sessionId,
            platform: event.platform,
          };
        }
        return {
          event: event.name || event.category || 'unknown',
          user_id: effectiveUserId,
          properties: event.properties ? { ...event.properties, category: event.category, platform: event.platform } : { category: event.category, platform: event.platform },
          session_id: event.sessionId,
        };
      });

      let { error } = await supabase.from('analytics_events').insert(rows);

      if (error && useExtended && (error.message?.includes('column') || error.code === '42703')) {
        console.log('[Analytics] Extended schema failed, retrying with master schema...');
        this.tableHasExtendedSchema = false;
        const masterRows = batch.map(event => ({
          event: event.name || event.category || 'unknown',
          user_id: effectiveUserId,
          properties: { ...(event.properties || {}), category: event.category, platform: event.platform },
          session_id: event.sessionId,
        }));
        const retryResult = await supabase.from('analytics_events').insert(masterRows);
        error = retryResult.error;
      }

      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          this.supabaseTableMissing = true;
          console.log('[Analytics] analytics_events table missing.');
          return;
        }
        if (error.code === '23505') {
          this.duplicateCount += batch.length;
          console.log('[Analytics] Duplicate key — skipping batch. Total duplicates:', this.duplicateCount);
          return;
        }
        if (!userId && (error.message?.includes('RLS') || error.code === '42501')) {
          this.rlsFailureCount++;
          this.syncFailureCount++;
          this.lastSyncError = `RLS blocked: ${error.message}`;
          if (this.rlsFailureCount >= this.MAX_RLS_FAILURES) {
            this.totalDropped += batch.length;
            console.error('[Analytics] RLS blocked', this.rlsFailureCount, 'times — dropping', batch.length, 'events to prevent infinite queue cycling. Total dropped:', this.totalDropped);
          } else {
            this.supabasePendingQueue.unshift(...batch);
            console.log('[Analytics] RLS blocked (attempt', this.rlsFailureCount, '/', this.MAX_RLS_FAILURES, ') — events re-queued');
          }
          this.increaseSyncBackoff();
          return;
        }
        this.supabasePendingQueue.unshift(...batch);
        this.syncFailureCount++;
        this.lastSyncError = error.message;
        this.increaseSyncBackoff();
        console.log('[Analytics] Supabase sync FAILED (attempt', this.syncFailureCount, '):', error.message);
      } else {
        this.totalSynced += batch.length;
        this.syncFailureCount = 0;
        this.rlsFailureCount = 0;
        this.lastSyncError = null;
        this.resetSyncBackoff();
        console.log(`[Analytics] Synced ${batch.length} events to Supabase (${this.supabasePendingQueue.length} remaining, ${this.totalSynced} total synced)`);
      }
    } catch (error) {
      this.supabasePendingQueue.unshift(...batch);
      this.syncFailureCount++;
      this.lastSyncError = (error as Error)?.message ?? 'Unknown sync error';
      this.increaseSyncBackoff();
      console.log('[Analytics] Supabase sync error (attempt', this.syncFailureCount, '):', error);
    }
  }



  track(name: string, category: EventCategory = 'user_action', properties?: Record<string, unknown>): void {
    const config = getEnvConfig();
    if (!config.enableAnalytics && isProduction()) {
      return;
    }

    if (this.isThrottled()) {
      if (this.throttledCount % 50 === 1) {
        console.log('[Analytics] Throttled — dropped', this.throttledCount, 'events this window');
      }
      return;
    }

    const event: AnalyticsEvent = {
      id: this.generateId(),
      name,
      category,
      properties,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      platform: Platform.OS,
    };

    this.eventQueue.push(event);
    this.supabasePendingQueue.push(event);

    if (this.eventQueue.length > MAX_STORED_EVENTS) {
      this.eventQueue = this.eventQueue.slice(-MAX_STORED_EVENTS);
    }
  }

  trackScreenView(screenName: string, params?: Record<string, unknown>): void {
    this.track('screen_view', 'navigation', { screen: screenName, ...params });
  }

  trackUserAction(action: string, details?: Record<string, unknown>): void {
    this.track(action, 'user_action', details);
  }

  trackTransaction(
    type: 'buy' | 'sell' | 'deposit' | 'withdraw',
    amount: number,
    currency: string,
    details?: Record<string, unknown>
  ): void {
    this.track(`transaction_${type}`, 'transaction', { amount, currency, ...details });
  }

  trackError(errorName: string, errorMessage: string, stack?: string, context?: Record<string, unknown>): void {
    this.track('error', 'error', {
      errorName,
      errorMessage,
      stack: stack?.substring(0, 500),
      ...context,
    });
  }

  trackConversion(conversionType: string, value?: number, details?: Record<string, unknown>): void {
    this.track(`conversion_${conversionType}`, 'conversion', { value, ...details });
  }

  trackPerformance(name: string, duration: number, metadata?: Record<string, unknown>): void {
    this.performanceMetrics.push({ name, duration, timestamp: Date.now(), metadata });
    this.track('performance_metric', 'performance', { name, duration, ...metadata });

    if (duration > 3000) {
      console.warn(`[Analytics] Slow operation: ${name} took ${duration}ms`);
    }
  }

  startTimer(name: string): () => void {
    const startTime = Date.now();
    return () => {
      this.trackPerformance(name, Date.now() - startTime);
    };
  }

  resetTableCheck(): void {
    this.supabaseTableVerified = false;
    this.supabaseTableMissing = false;
    this.tableCheckAttempts = 0;
    console.log('[Analytics] Table check reset — will re-verify on next sync');
  }

  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;
    try {
      const existingData = await AsyncStorage.getItem(ANALYTICS_STORAGE_KEY);
      let allEvents: AnalyticsEvent[] = existingData ? JSON.parse(existingData) : [];
      allEvents = [...allEvents, ...this.eventQueue].slice(-MAX_STORED_EVENTS);
      await AsyncStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(allEvents));
      await this.saveSession();
      this.eventQueue = [];
    } catch (error) {
      console.log('[Analytics] Flush error:', (error as Error)?.message);
    }
  }

  async getAllLocalEvents(): Promise<AnalyticsEvent[]> {
    try {
      const localData = await AsyncStorage.getItem(ANALYTICS_STORAGE_KEY);
      return localData ? JSON.parse(localData) : [];
    } catch {
      return [];
    }
  }

  getPendingCount(): number {
    return this.supabasePendingQueue.length;
  }

  getQueuedCount(): number {
    return this.eventQueue.length;
  }

  async forceSyncNow(): Promise<void> {
    console.log('[Analytics] forceSyncNow() called — flushing and syncing immediately');
    await this.flush();
    await this.syncToSupabase();
  }

  getSyncHealth(): {
    pendingCount: number;
    queuedCount: number;
    totalSynced: number;
    totalDropped: number;
    duplicateCount: number;
    failureCount: number;
    lastError: string | null;
    tableMissing: boolean;
    tableVerified: boolean;
  } {
    return {
      pendingCount: this.supabasePendingQueue.length,
      queuedCount: this.eventQueue.length,
      totalSynced: this.totalSynced,
      totalDropped: this.totalDropped,
      duplicateCount: this.duplicateCount,
      failureCount: this.syncFailureCount,
      lastError: this.lastSyncError,
      tableMissing: this.supabaseTableMissing,
      tableVerified: this.supabaseTableVerified,
    };
  }

  async getStats(): Promise<AnalyticsStats> {
    if (!isSupabaseConfigured()) {
      if (isProduction()) {
        console.error('[Analytics] getStats() called but Supabase not configured in production. Returning empty stats.');
      }
      return { totalEvents: 0, totalSessions: 0, averageSessionDuration: 0, topEvents: [], errorRate: 0, conversionEvents: 0 };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      if (!userId) {
        console.warn('[Analytics] getStats() called without authenticated user. Stats require authentication.');
        return { totalEvents: 0, totalSessions: 0, averageSessionDuration: 0, topEvents: [], errorRate: 0, conversionEvents: 0 };
      }

      const { data, error } = await supabase
        .from('analytics_events')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);

      if (error) {
        console.error('[Analytics] getStats() Supabase query failed:', error.message);
        if (isProduction()) {
          return { totalEvents: 0, totalSessions: 0, averageSessionDuration: 0, topEvents: [], errorRate: 0, conversionEvents: 0 };
        }
      }

      if (data && data.length > 0) {
        console.log('[Analytics] Stats from Supabase:', data.length, 'events');
        const eventCounts: Record<string, number> = {};
        let errorCount = 0;
        let conversionCount = 0;
        const sessions = new Set<string>();

        for (const event of data) {
          eventCounts[event.name] = (eventCounts[event.name] || 0) + 1;
          sessions.add(event.session_id);
          if (event.category === 'error') errorCount++;
          if (event.category === 'conversion') conversionCount++;
        }

        const topEvents = Object.entries(eventCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const sessionTimestamps = new Map<string, number[]>();
        for (const event of data) {
          const sid = event.session_id || 'unknown';
          if (!sessionTimestamps.has(sid)) sessionTimestamps.set(sid, []);
          const ts = new Date(event.timestamp || event.created_at).getTime();
          if (!isNaN(ts)) sessionTimestamps.get(sid)!.push(ts);
        }
        let totalDur = 0;
        let durCount = 0;
        sessionTimestamps.forEach(timestamps => {
          if (timestamps.length > 1) {
            timestamps.sort((a, b) => a - b);
            totalDur += (timestamps[timestamps.length - 1]! - timestamps[0]!) / 1000;
            durCount++;
          }
        });
        const avgDuration = durCount > 0 ? Math.round(totalDur / durCount) : 0;

        return {
          totalEvents: data.length,
          totalSessions: sessions.size,
          averageSessionDuration: avgDuration,
          topEvents,
          errorRate: data.length > 0 ? (errorCount / data.length) * 100 : 0,
          conversionEvents: conversionCount,
        };
      }
    } catch (error) {
      console.error('[Analytics] getStats() exception:', error);
    }

    if (!isProduction()) {
      console.log('[Analytics] Falling back to local stats (dev/staging only)');
      try {
        const localData = await AsyncStorage.getItem(ANALYTICS_STORAGE_KEY);
        const events: AnalyticsEvent[] = localData ? JSON.parse(localData) : [];
        const eventCounts: Record<string, number> = {};
        let errorCount = 0;
        let conversionCount = 0;
        const sessions = new Set<string>();
        for (const event of events) {
          eventCounts[event.name] = (eventCounts[event.name] || 0) + 1;
          sessions.add(event.sessionId);
          if (event.category === 'error') errorCount++;
          if (event.category === 'conversion') conversionCount++;
        }
        const topEvents = Object.entries(eventCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        const localSessionTs = new Map<string, number[]>();
        for (const event of events) {
          if (!localSessionTs.has(event.sessionId)) localSessionTs.set(event.sessionId, []);
          localSessionTs.get(event.sessionId)!.push(event.timestamp);
        }
        let localTotalDur = 0;
        let localDurCount = 0;
        localSessionTs.forEach(timestamps => {
          if (timestamps.length > 1) {
            timestamps.sort((a, b) => a - b);
            localTotalDur += (timestamps[timestamps.length - 1]! - timestamps[0]!) / 1000;
            localDurCount++;
          }
        });
        const localAvgDuration = localDurCount > 0 ? Math.round(localTotalDur / localDurCount) : 0;
        return {
          totalEvents: events.length,
          totalSessions: sessions.size,
          averageSessionDuration: localAvgDuration,
          topEvents,
          errorRate: events.length > 0 ? (errorCount / events.length) * 100 : 0,
          conversionEvents: conversionCount,
        };
      } catch (error) {
        console.log('[Analytics] Local stats error:', (error as Error)?.message);
      }
    }

    return { totalEvents: 0, totalSessions: 0, averageSessionDuration: 0, topEvents: [], errorRate: 0, conversionEvents: 0 };
  }

  async clearData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([ANALYTICS_STORAGE_KEY, SESSION_STORAGE_KEY]);
      this.eventQueue = [];
      this.supabasePendingQueue = [];
      this.performanceMetrics = [];
      logger.analytics.log('Data cleared');
    } catch (error) {
      console.log('[Analytics] Clear data error:', (error as Error)?.message);
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSessionDuration(): number {
    return Date.now() - this.sessionStartTime;
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    if (this.syncInterval) {
      clearTimeout(this.syncInterval);
    }
    void this.flush();
    void this.syncToSupabase();
  }
}

export const analytics = new AnalyticsService();
export default analytics;
