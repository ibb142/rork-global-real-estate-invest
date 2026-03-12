import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import createContextHook from '@nkzw/create-context-hook';
import { analytics, AnalyticsStats, EventCategory } from './analytics';

const SYNC_INTERVAL_MS = 30000;

export const [AnalyticsProvider, useAnalytics] = createContextHook(() => {
  const [isReady, setIsReady] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const init = async () => {
      await analytics.initialize();
      setIsReady(true);
      analytics.track('app_launch', 'engagement');
    };
    void init();

    syncTimer.current = setInterval(() => {
      console.log('[Analytics] Periodic Supabase sync cycle');
    }, SYNC_INTERVAL_MS);

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        analytics.track('app_foreground', 'engagement');
      } else if (state === 'background') {
        analytics.track('app_background', 'engagement');
        void analytics.flush();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (syncTimer.current) clearInterval(syncTimer.current);
      analytics.destroy();
    };
  }, []);

  const trackEvent = useCallback((name: string, category: EventCategory = 'user_action', properties?: Record<string, unknown>) => {
    analytics.track(name, category, properties);
  }, []);

  const trackScreen = useCallback((screenName: string, params?: Record<string, unknown>) => {
    analytics.trackScreenView(screenName, params);
  }, []);

  const trackAction = useCallback((action: string, details?: Record<string, unknown>) => {
    analytics.trackUserAction(action, details);
  }, []);

  const trackTransaction = useCallback((type: 'buy' | 'sell' | 'deposit' | 'withdraw', amount: number, currency: string, details?: Record<string, unknown>) => {
    analytics.trackTransaction(type, amount, currency, details);
  }, []);

  const trackError = useCallback((errorName: string, errorMessage: string, stack?: string, context?: Record<string, unknown>) => {
    analytics.trackError(errorName, errorMessage, stack, context);
  }, []);

  const trackConversion = useCallback((conversionType: string, value?: number, details?: Record<string, unknown>) => {
    analytics.trackConversion(conversionType, value, details);
  }, []);

  const startTimer = useCallback((name: string) => {
    return analytics.startTimer(name);
  }, []);

  const refreshStats = useCallback(async () => {
    const newStats = await analytics.getStats();
    setStats(newStats);
    return newStats;
  }, []);

  const getPerformanceSummary = useCallback(() => {
    return { avgApiTime: 0, apiSuccessRate: 100, slowInteractions: 0, memoryWarnings: 0 };
  }, []);

  const clearAnalyticsData = useCallback(async () => {
    await analytics.clearData();
    setStats(null);
  }, []);

  const sessionId = analytics.getSessionId();
  const sessionDuration = useCallback(() => analytics.getSessionDuration(), []);

  return useMemo(() => ({
    isReady,
    stats,
    trackEvent,
    trackScreen,
    trackAction,
    trackTransaction,
    trackError,
    trackConversion,
    startTimer,
    refreshStats,
    getPerformanceSummary,
    clearAnalyticsData,
    sessionId,
    sessionDuration,
  }), [isReady, stats, trackEvent, trackScreen, trackAction, trackTransaction, trackError, trackConversion, startTimer, refreshStats, getPerformanceSummary, clearAnalyticsData, sessionId, sessionDuration]);
});

export default AnalyticsProvider;
