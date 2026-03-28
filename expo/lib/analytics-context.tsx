import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { analytics } from './analytics';
import { usePathname } from 'expo-router';
import type { EventCategory } from './analytics';

interface AnalyticsHook {
  trackScreen: (screenName: string, params?: Record<string, unknown>) => void;
  trackAction: (action: string, details?: Record<string, unknown>) => void;
  trackTransaction: (type: 'buy' | 'sell' | 'deposit' | 'withdraw', amount: number, currency: string, details?: Record<string, unknown>) => void;
  trackConversion: (conversionType: string, value?: number, details?: Record<string, unknown>) => void;
  trackError: (errorName: string, errorMessage: string, stack?: string, context?: Record<string, unknown>) => void;
  track: (name: string, category?: EventCategory, properties?: Record<string, unknown>) => void;
}

const AnalyticsContext = React.createContext<AnalyticsHook | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const initializedRef = useRef(false);
  const lastPathnameRef = useRef<string>('');

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      void analytics.initialize();
      console.log('[Analytics] Provider mounted — service initialized');
      analytics.track('app_open', 'navigation', { timestamp: Date.now() });
    }

    return () => {
      analytics.destroy();
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

  const value = useMemo<AnalyticsHook>(() => ({
    trackScreen,
    trackAction,
    trackTransaction,
    trackConversion,
    trackError,
    track,
  }), [trackScreen, trackAction, trackTransaction, trackConversion, trackError, track]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsHook {
  const ctx = React.useContext(AnalyticsContext);
  if (!ctx) {
    return {
      trackScreen: (screenName: string, params?: Record<string, unknown>) => {
        analytics.trackScreenView(screenName, params);
      },
      trackAction: (action: string, details?: Record<string, unknown>) => {
        analytics.trackUserAction(action, details);
      },
      trackTransaction: (type: 'buy' | 'sell' | 'deposit' | 'withdraw', amount: number, currency: string, details?: Record<string, unknown>) => {
        analytics.trackTransaction(type, amount, currency, details);
      },
      trackConversion: (conversionType: string, value?: number, details?: Record<string, unknown>) => {
        analytics.trackConversion(conversionType, value, details);
      },
      trackError: (errorName: string, errorMessage: string, stack?: string, context?: Record<string, unknown>) => {
        analytics.trackError(errorName, errorMessage, stack, context);
      },
      track: (name: string, category?: EventCategory, properties?: Record<string, unknown>) => {
        analytics.track(name, category, properties);
      },
    };
  }
  return ctx;
}

export default AnalyticsProvider;
