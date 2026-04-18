import { useEffect, useRef, useCallback, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { analytics } from './analytics';
import { usePathname } from 'expo-router';
import type { EventCategory } from './analytics';
import createContextHook from '@nkzw/create-context-hook';
import { usePresenceBroadcast, presenceManager } from './realtime-presence';

export interface AnalyticsHook {
  trackScreen: (screenName: string, params?: Record<string, unknown>) => void;
  trackAction: (action: string, details?: Record<string, unknown>) => void;
  trackTransaction: (type: 'buy' | 'sell' | 'deposit' | 'withdraw', amount: number, currency: string, details?: Record<string, unknown>) => void;
  trackConversion: (conversionType: string, value?: number, details?: Record<string, unknown>) => void;
  trackError: (errorName: string, errorMessage: string, stack?: string, context?: Record<string, unknown>) => void;
  track: (name: string, category?: EventCategory, properties?: Record<string, unknown>) => void;
}

export const [AnalyticsProvider, useAnalytics] = createContextHook<AnalyticsHook>(() => {
  const pathname = usePathname();
  const lastPathnameRef = useRef<string>('');

  usePresenceBroadcast({
    sessionId: analytics.getSessionId(),
    source: 'app',
    page: pathname ?? 'App',
  });

  useEffect(() => {
    if (pathname) {
      presenceManager.updatePage(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    let booted = false;

    const bootstrapAnalytics = () => {
      if (cancelled || booted) {
        return;
      }

      booted = true;
      analytics.revive();
      void analytics.initialize();
      console.log('[Analytics] Provider mounted — service boot deferred until after first interactions');
      analytics.track('app_open', 'navigation', { timestamp: Date.now() });
    };

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      bootstrapAnalytics();
    });
    const fallbackTimeout = setTimeout(() => {
      bootstrapAnalytics();
    }, 900);

    return () => {
      cancelled = true;
      interactionTask.cancel();
      clearTimeout(fallbackTimeout);
      analytics.track('session_end', 'navigation', {
        sessionDuration: analytics.getSessionDuration(),
        timestamp: Date.now(),
      });
      void analytics.flush();
    };
  }, []);

  useEffect(() => {
    if (pathname && pathname !== lastPathnameRef.current) {
      lastPathnameRef.current = pathname;
      const screenName = pathname === '/' ? 'home' : pathname.replace(/^\//, '').replace(/\//g, '_');
      analytics.trackScreenView(screenName, { path: pathname });
      console.log('[Analytics] Screen view tracked:', screenName);
    }
  }, [pathname]);

  const trackScreen = useCallback((screenName: string, params?: Record<string, unknown>) => {
    analytics.trackScreenView(screenName, params);
  }, []);

  const trackAction = useCallback((action: string, details?: Record<string, unknown>) => {
    analytics.trackUserAction(action, details);
  }, []);

  const trackTransaction = useCallback((type: 'buy' | 'sell' | 'deposit' | 'withdraw', amount: number, currency: string, details?: Record<string, unknown>) => {
    analytics.trackTransaction(type, amount, currency, details);
  }, []);

  const trackConversion = useCallback((conversionType: string, value?: number, details?: Record<string, unknown>) => {
    analytics.trackConversion(conversionType, value, details);
  }, []);

  const trackError = useCallback((errorName: string, errorMessage: string, stack?: string, context?: Record<string, unknown>) => {
    analytics.trackError(errorName, errorMessage, stack, context);
  }, []);

  const track = useCallback((name: string, category?: EventCategory, properties?: Record<string, unknown>) => {
    analytics.track(name, category, properties);
  }, []);

  return useMemo<AnalyticsHook>(() => ({
    trackScreen,
    trackAction,
    trackTransaction,
    trackConversion,
    trackError,
    track,
  }), [trackScreen, trackAction, trackTransaction, trackConversion, trackError, track]);
});

export default AnalyticsProvider;
