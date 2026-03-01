import AsyncStorage from '@react-native-async-storage/async-storage';
import logger from './logger';
import { Platform } from 'react-native';

const ANALYTICS_STORAGE_KEY = '@ipx_analytics';
const SESSION_STORAGE_KEY = '@ipx_session';
const MAX_STORED_EVENTS = 1000;

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
  private performanceMetrics: PerformanceMetric[] = [];
  private isInitialized = false;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sessionId = this.generateId();
    this.sessionStartTime = Date.now();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.loadSession();
      this.startFlushInterval();
      this.isInitialized = true;
      logger.analytics.log('Initialized successfully');
    } catch (error) {
      console.error('[Analytics] Initialization error:', error);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      console.error('[Analytics] Load session error:', error);
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
      console.error('[Analytics] Save session error:', error);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 30000);
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
      console.error('[Analytics] Flush error:', error);
    }
  }

  async getStats(): Promise<AnalyticsStats> {
    try {
      const data = await AsyncStorage.getItem(ANALYTICS_STORAGE_KEY);
      const events: AnalyticsEvent[] = data ? JSON.parse(data) : [];

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
      console.error('[Analytics] Get stats error:', error);
      return { totalEvents: 0, totalSessions: 0, averageSessionDuration: 0, topEvents: [], errorRate: 0, conversionEvents: 0 };
    }
  }

  async clearData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([ANALYTICS_STORAGE_KEY, SESSION_STORAGE_KEY]);
      this.eventQueue = [];
      this.performanceMetrics = [];
      logger.analytics.log('Data cleared');
    } catch (error) {
      console.error('[Analytics] Clear data error:', error);
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
    this.flush();
  }
}

export const analytics = new AnalyticsService();
export default analytics;
