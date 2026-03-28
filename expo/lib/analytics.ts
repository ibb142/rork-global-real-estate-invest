import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from './logger';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { scopedKey } from './project-storage';

const ANALYTICS_STORAGE_KEY = scopedKey('analytics');
const SESSION_STORAGE_KEY = scopedKey('session');
const MAX_STORED_EVENTS = 2000;
const SUPABASE_BATCH_SIZE = 50;
const MAX_PENDING_QUEUE = 500;

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
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private supabaseTableVerified = false;
  private supabaseTableMissing = false;
  private tableCheckAttempts = 0;
  private readonly MAX_TABLE_CHECK_ATTEMPTS = 3;
  private tableHasExtendedSchema: boolean | null = null;

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
    }, 3000);
  }

  private startSupabaseSyncInterval(): void {
    this.syncInterval = setInterval(() => {
      void this.syncToSupabase();
    }, 5000);
  }

  private async verifySupabaseTable(): Promise<boolean> {
    if (this.supabaseTableVerified) return true;
    if (this.supabaseTableMissing) return false;
    if (this.tableCheckAttempts >= this.MAX_TABLE_CHECK_ATTEMPTS) {
      this.supabaseTableMissing = true;
      console.log('[Analytics] analytics_events table not found after max attempts. Events will be stored locally only.');
      return false;
    }

    this.tableCheckAttempts++;
    try {
      const { data, error } = await supabase.from('analytics_events').select('*').limit(1);
      if (error) {
        if (error.message?.includes('does not exist') || error.code === '42P01' || error.message?.includes('relation')) {
          this.supabaseTableMissing = true;
          console.log('[Analytics] analytics_events table does not exist in Supabase. Events stored locally only.');
          return false;
        }
        console.log('[Analytics] Table check error (may be RLS):', error.message);
        this.supabaseTableVerified = true;
        return true;
      }
      this.supabaseTableVerified = true;
      if (data && data.length > 0) {
        const row = data[0] as Record<string, unknown>;
        this.tableHasExtendedSchema = 'name' in row || 'category' in row || 'platform' in row;
        console.log('[Analytics] Table schema detected:', this.tableHasExtendedSchema ? 'extended (name/category/platform)' : 'master (event/properties)');
      }
      return true;
    } catch {
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
      if (!userId) {
        await this.syncToSupabaseAnonymous();
      }
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
          console.log('[Analytics] Duplicate key — skipping batch');
          return;
        }
        if (!userId && (error.message?.includes('RLS') || error.code === '42501')) {
          console.log('[Analytics] RLS blocked anonymous insert, trying landing_analytics fallback...');
          await this.syncBatchToLandingAnalytics(batch);
          return;
        }
        this.supabasePendingQueue.unshift(...batch);
        console.log('[Analytics] Supabase sync failed, re-queued:', error.message);
      } else {
        console.log(`[Analytics] Synced ${batch.length} events to Supabase (${this.supabasePendingQueue.length} remaining)`);
      }
    } catch (error) {
      this.supabasePendingQueue.unshift(...batch);
      console.log('[Analytics] Supabase sync error:', error);
    }
  }

  private async syncToSupabaseAnonymous(): Promise<void> {
    if (this.supabasePendingQueue.length === 0) return;
    const batch = this.supabasePendingQueue.splice(0, SUPABASE_BATCH_SIZE);
    if (batch.length === 0) return;

    try {
      await this.syncBatchToLandingAnalytics(batch);
    } catch {
      this.supabasePendingQueue.unshift(...batch);
    }
  }

  private async syncBatchToLandingAnalytics(batch: AnalyticsEvent[]): Promise<void> {
    try {
      const rows = batch.map(event => ({
        event: event.name || event.category || 'unknown',
        session_id: event.sessionId,
        properties: JSON.stringify({
          ...(event.properties || {}),
          category: event.category,
          platform: event.platform,
          source: 'app',
        }),
        created_at: new Date(event.timestamp).toISOString(),
      }));

      const { error } = await supabase.from('landing_analytics').insert(rows);
      if (error) {
        console.log('[Analytics] landing_analytics fallback insert failed:', error.message);
        this.supabasePendingQueue.unshift(...batch);
      } else {
        console.log(`[Analytics] Synced ${batch.length} anonymous events via landing_analytics`);
      }
    } catch (err) {
      console.log('[Analytics] landing_analytics fallback error:', (err as Error)?.message);
      this.supabasePendingQueue.unshift(...batch);
    }
  }

  track(name: string, category: EventCategory = 'user_action', properties?: Record<string, unknown>): void {
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
    await this.flush();
    await this.syncToSupabase();
  }

  async getStats(): Promise<AnalyticsStats> {
    let userId: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id ?? null;
    } catch {}

    if (userId) {
      try {
        const { data, error } = await supabase
          .from('analytics_events')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(500);

        if (!error && data && data.length > 0) {
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

          return {
            totalEvents: data.length,
            totalSessions: sessions.size,
            averageSessionDuration: 0,
            topEvents,
            errorRate: data.length > 0 ? (errorCount / data.length) * 100 : 0,
            conversionEvents: conversionCount,
          };
        }
      } catch (error) {
        console.log('[Analytics] Supabase stats failed, using local:', error);
      }
    }

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

      return {
        totalEvents: events.length,
        totalSessions: sessions.size,
        averageSessionDuration: 0,
        topEvents,
        errorRate: events.length > 0 ? (errorCount / events.length) * 100 : 0,
        conversionEvents: conversionCount,
      };
    } catch (error) {
      console.log('[Analytics] Get stats error:', (error as Error)?.message);
      return { totalEvents: 0, totalSessions: 0, averageSessionDuration: 0, topEvents: [], errorRate: 0, conversionEvents: 0 };
    }
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
      clearInterval(this.syncInterval);
    }
    void this.flush();
    void this.syncToSupabase();
  }
}

export const analytics = new AnalyticsService();
export default analytics;
