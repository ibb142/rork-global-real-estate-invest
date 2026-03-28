import React, { useState, useEffect, useCallback } from "react";
import { Platform, LogBox, View, Text, StyleSheet } from "react-native";

LogBox.ignoreLogs([
  '[Landing] Analytics',
  '[Analytics]',
  'Detected multiple renderers',
]);

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

let SplashScreen: typeof import('expo-splash-screen') | null = null;
try {
  SplashScreen = require('expo-splash-screen');
} catch {
  console.log('[App] expo-splash-screen not available');
}

import Colors from "../constants/colors";
import { queryClientConfig } from "../lib/query-config";
import { ErrorBoundary } from "../components/ErrorBoundary";

let trpcModule: typeof import('../lib/trpc') | null = null;
try {
  trpcModule = require('../lib/trpc');
} catch (e) {
  console.log('[App] tRPC module not available:', (e as Error)?.message);
}
import { NetworkProvider } from "../lib/network-context";
import { I18nProvider } from "../lib/i18n-context";
import { AuthProvider, useAuth as useAuthImported } from "../lib/auth-context";
import { IntroProvider, useIntro as useIntroImported } from "../lib/intro-context";
import { AnalyticsProvider } from "../lib/analytics-context";
import { LenderProvider } from "../lib/lender-context";
import { IPXProvider } from "../lib/ipx-context";
import { EarnProvider } from "../lib/earn-context";
import { EmailProvider } from "../lib/email-context";
import { ImageStorageProvider } from "../lib/image-context";
import OnboardingFlowImported from "../components/OnboardingFlow";


const useAuth = useAuthImported ?? null;
const useIntro = useIntroImported ?? null;
const OnboardingFlow = OnboardingFlowImported ?? null;


console.log('[App] All module imports completed — build v6.3.0');

try {
  if (SplashScreen) void SplashScreen.preventAutoHideAsync();
} catch (e) {
  console.warn('[App] SplashScreen.preventAutoHideAsync failed:', (e as Error)?.message);
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  try {
    const style = document.createElement('style');
    style.textContent = `
      ::-webkit-scrollbar { display: none !important; width: 0 !important; }
      * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
    `;
    document.head.appendChild(style);
  } catch {}
}

const HIDDEN_HEADER = { headerShown: false } as const;

const headerWithTitle = (title: string) => ({
  title,
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.text,
} as const);

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={HIDDEN_HEADER} />
      <Stack.Screen name="property/[id]" options={{ ...HIDDEN_HEADER, presentation: "card" }} />
      <Stack.Screen name="admin" options={HIDDEN_HEADER} />
      <Stack.Screen name="signup" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="login" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="kyc-verification" options={HIDDEN_HEADER} />
      <Stack.Screen name="personal-info" options={HIDDEN_HEADER} />
      <Stack.Screen name="trust-center" options={HIDDEN_HEADER} />
      <Stack.Screen name="compare-investments" options={HIDDEN_HEADER} />
      <Stack.Screen name="smart-investing" options={HIDDEN_HEADER} />
      <Stack.Screen name="app-report" options={HIDDEN_HEADER} />
      <Stack.Screen name="app-guide" options={HIDDEN_HEADER} />
      <Stack.Screen name="app-demo" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="ipx-earn" options={HIDDEN_HEADER} />
      <Stack.Screen name="investor-prospectus" options={HIDDEN_HEADER} />
      <Stack.Screen name="company-info" options={HIDDEN_HEADER} />
      <Stack.Screen name="vip-tiers" options={HIDDEN_HEADER} />
      <Stack.Screen name="gift-shares" options={HIDDEN_HEADER} />
      <Stack.Screen name="auto-reinvest" options={HIDDEN_HEADER} />
      <Stack.Screen name="copy-investing" options={HIDDEN_HEADER} />
      <Stack.Screen name="modal" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ ...headerWithTitle("Notifications"), headerShadowVisible: false }} />
      <Stack.Screen name="wallet" options={headerWithTitle("Wallet")} />
      <Stack.Screen name="influencer-apply" options={headerWithTitle("Become an Influencer")} />
      <Stack.Screen name="agent-apply" options={headerWithTitle("Join Our Agent Team")} />
      <Stack.Screen name="broker-apply" options={headerWithTitle("Investor Broker Program")} />
      <Stack.Screen name="referrals" options={headerWithTitle("Referrals & Earnings")} />
      <Stack.Screen name="property-documents" options={headerWithTitle("Document Portal")} />
      <Stack.Screen name="title-review" options={headerWithTitle("Title Review")} />
      <Stack.Screen name="tax-info" options={headerWithTitle("Tax Information")} />
      <Stack.Screen name="statements" options={headerWithTitle("Statements")} />
      <Stack.Screen name="tax-documents" options={headerWithTitle("Tax Documents")} />
      <Stack.Screen name="notification-settings" options={headerWithTitle("Notifications")} />
      <Stack.Screen name="security-settings" options={headerWithTitle("Security")} />
      <Stack.Screen name="legal" options={headerWithTitle("Legal")} />
      <Stack.Screen name="language" options={HIDDEN_HEADER} />
      <Stack.Screen name="contract-generator" options={HIDDEN_HEADER} />
      <Stack.Screen name="video-presentation" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="investor-pitch" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="ai-gallery" options={HIDDEN_HEADER} />
      <Stack.Screen name="share-content" options={HIDDEN_HEADER} />
      <Stack.Screen name="developer-breakdown" options={HIDDEN_HEADER} />
      <Stack.Screen name="global-intelligence" options={HIDDEN_HEADER} />
      <Stack.Screen name="email" options={HIDDEN_HEADER} />
      <Stack.Screen name="email-detail" options={HIDDEN_HEADER} />
      <Stack.Screen name="email-compose" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="ai-automation-report" options={HIDDEN_HEADER} />
      <Stack.Screen name="api-list" options={HIDDEN_HEADER} />
      <Stack.Screen name="authenticator" options={HIDDEN_HEADER} />
      <Stack.Screen name="auto-repair" options={HIDDEN_HEADER} />
      <Stack.Screen name="viral-growth" options={HIDDEN_HEADER} />
      <Stack.Screen name="sms-reports" options={HIDDEN_HEADER} />
      <Stack.Screen name="activation-center" options={HIDDEN_HEADER} />
      <Stack.Screen name="client-intelligence" options={HIDDEN_HEADER} />
      <Stack.Screen name="analytics-report" options={HIDDEN_HEADER} />
      <Stack.Screen name="jv-agreement" options={HIDDEN_HEADER} />
      <Stack.Screen name="buy-shares" options={HIDDEN_HEADER} />
      <Stack.Screen name="jv-invest" options={HIDDEN_HEADER} />
      <Stack.Screen name="system-health" options={HIDDEN_HEADER} />
      <Stack.Screen name="jv-architecture" options={HIDDEN_HEADER} />
      <Stack.Screen name="system-blueprint" options={HIDDEN_HEADER} />
      <Stack.Screen name="send-test-email" options={HIDDEN_HEADER} />
      <Stack.Screen name="send-test-sms" options={HIDDEN_HEADER} />
      <Stack.Screen name="sms-history" options={HIDDEN_HEADER} />
      <Stack.Screen name="sms-dashboard" options={HIDDEN_HEADER} />
      <Stack.Screen name="sms-compose" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
      <Stack.Screen name="backend-audit" options={HIDDEN_HEADER} />
      <Stack.Screen name="supabase-export" options={HIDDEN_HEADER} />
      <Stack.Screen name="search" options={{ ...HIDDEN_HEADER, presentation: "modal" }} />
    </Stack>
  );
}

function PushNotificationSetup() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isMounted = true;

    const setup = async () => {
      try {
        const pushMod = await import("../lib/push-notifications");
        const token = await pushMod.registerForPushNotificationsAsync();
        if (token && isMounted) {
          await pushMod.registerTokenWithBackend(token);
          console.log('[App] Push notification setup complete');
        }
      } catch (error) {
        console.warn('[App] Push setup error (non-critical):', (error as Error)?.message);
      }
    };

    const timer = setTimeout(() => { void setup(); }, 2000);
    return () => { isMounted = false; clearTimeout(timer); };
  }, []);

  return null;
}

function useIntroSafe() {
  if (useIntro) return useIntro();
  return { hasCompletedOnboarding: true, isLoading: false, completeOnboarding: async () => {} };
}

function useAuthSafe() {
  if (useAuth) return useAuth();
  return { isAuthenticated: false, isLoading: false };
}

function OnboardingHandler() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const introCtx = useIntroSafe();
  const authCtx = useAuthSafe();
  const { hasCompletedOnboarding, isLoading: introLoading, completeOnboarding } = introCtx;
  const { isAuthenticated, isLoading: authLoading } = authCtx;

  useEffect(() => {
    if (authLoading || introLoading) return;
    if (isAuthenticated && !hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, [authLoading, introLoading, isAuthenticated, hasCompletedOnboarding]);

  const handleDismiss = useCallback(() => {
    void completeOnboarding();
    setShowOnboarding(false);
  }, [completeOnboarding]);

  const isVisible = showOnboarding && !introLoading;

  if (!isVisible) return null;

  if (!OnboardingFlow) return null;
  const Flow = OnboardingFlow;
  return (
    <Flow
      visible={true}
      onClose={handleDismiss}
      onComplete={handleDismiss}
    />
  );
}

function DeferredOverlays() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[App] DeferredOverlays ready');
      setReady(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <View style={deferredStyles.overlay} pointerEvents="box-none">

      <ErrorBoundary fallback={<View />}>
        <PushNotificationSetup />
      </ErrorBoundary>
      <ErrorBoundary fallback={<View />}>
        <OnboardingHandler />
      </ErrorBoundary>
      <ErrorBoundary fallback={<View />}>
        <SessionTimeoutHandler />
      </ErrorBoundary>
      <ErrorBoundary fallback={<View />}>
        <AppPresenceBroadcaster />
      </ErrorBoundary>
    </View>
  );
}

const deferredStyles = StyleSheet.create({
  overlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

function AppPresenceBroadcaster() {
  const [sessionId] = useState<string>(() => 'app-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36));

  useEffect(() => {
    let stopped = false;
    const setup = async () => {
      try {
        const { presenceManager } = await import("../lib/realtime-presence");
        const { isSupabaseConfigured } = await import("../lib/supabase");
        if (!isSupabaseConfigured() || stopped) return;

        await presenceManager.startBroadcasting({
          sessionId,
          source: 'app',
          device: Platform.OS === 'web' ? 'Desktop' : Platform.OS === 'ios' ? 'Mobile' : 'Mobile',
          os: Platform.OS,
          browser: Platform.OS === 'web' ? 'Browser' : 'App',
          page: 'App',
        });
        console.log('[Presence] App presence broadcasting via PresenceManager');
      } catch (err) {
        console.log('[Presence] App broadcast setup error:', (err as Error)?.message);
      }
    };

    const timer = setTimeout(() => { void setup(); }, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      import("../lib/realtime-presence").then(mod => {
        mod.presenceManager.stopBroadcasting();
      }).catch(() => {});
    };
  }, [sessionId]);

  return null;
}

function SessionTimeoutHandler() {
  const authCtx = useAuthSafe();

  useEffect(() => {
    if (!authCtx.isAuthenticated) return;

    let cleanup: (() => void) | null = null;
    const setup = async () => {
      try {
        const { startSessionMonitor } = await import("../lib/session-timeout");
        cleanup = startSessionMonitor(() => {
          console.log('[App] Session timed out — logging out');
          console.log('[App] Session timeout triggered');
        });
      } catch {}
    };
    void setup();
    return () => { if (cleanup) cleanup(); };
  }, [authCtx.isAuthenticated]);

  return null;
}

type ProviderComponent = React.ComponentType<{ children: React.ReactNode }> | null;

const providerList: ProviderComponent[] = [
  NetworkProvider,
  I18nProvider,
  AuthProvider,
  IntroProvider,
  AnalyticsProvider,
  LenderProvider,
  IPXProvider,
  EarnProvider,
  EmailProvider,
  ImageStorageProvider,
];

const activeProviders = providerList.filter(
  (p): p is React.ComponentType<{ children: React.ReactNode }> => p !== null
);

function AllProviders({ children }: { children: React.ReactNode }) {
  let result: React.ReactNode = children;
  for (let i = activeProviders.length - 1; i >= 0; i--) {
    const Prov = activeProviders[i] as React.ComponentType<{ children: React.ReactNode }>;
    result = React.createElement(Prov, null, result);
  }
  return <>{result}</>;
}

const _startupState = { persistenceCleanup: null as (() => void) | null };

async function runStartupTasks() {
  try {
    console.log('[App] Starting background tasks...');

    try {
      const { logEnvValidation } = await import("../lib/env-validation");
      logEnvValidation();
    } catch (err) {
      console.log('[App] Env validation error:', (err as Error)?.message);
    }

    try {
      const { logMockDataWarning } = await import("../lib/mock-data-warning");
      logMockDataWarning();
    } catch {}
    const jvModule = await import("../lib/jv-storage").catch(() => null);

    if (jvModule) {
      try {
        const r = await jvModule.syncLocalDealsToSupabase();
        if (r.synced > 0) console.log('[App] Synced', r.synced, 'deals to Supabase');
      } catch (err) {
        console.log('[App] Sync skipped:', (err as Error)?.message);
      }
    }

    try {
      const persistenceModule = await import("../lib/jv-persistence").catch(() => null);
      if (persistenceModule) {
        if (_startupState.persistenceCleanup) {
          _startupState.persistenceCleanup();
          _startupState.persistenceCleanup = null;
        }
        _startupState.persistenceCleanup = persistenceModule.startPersistenceEngine();
        console.log('[App] Persistence engine started (WAL + WriteQueue + Watchdog)');
      }
    } catch (err) {
      console.log('[App] Persistence engine start error (non-critical):', (err as Error)?.message);
    }

    const storageModule = await import("../lib/project-storage").catch(() => null);
    if (storageModule) {
      try {
        const integrity = await storageModule.runStorageIntegrityCheck();
        if (!integrity.passed) console.warn('[App] Storage issues:', integrity.issues);
        const audit = await storageModule.auditStorageKeys();
        if (audit.foreignKeys.length > 0) {
          const cleaned = await storageModule.cleanForeignKeys();
          console.log('[App] Cleaned', cleaned, 'foreign keys');
        }
      } catch (err) {
        console.log('[App] Storage check error:', (err as Error)?.message);
      }
    }

    try {
      const { errorTracker } = await import("../lib/error-tracking");
      await errorTracker.init();
      console.log('[App] Error tracker initialized');
    } catch (err) {
      console.log('[App] Error tracker init error:', (err as Error)?.message);
    }

    try {
      const { checkForUpdates } = await import("../lib/app-update-checker");
      await checkForUpdates();
    } catch (err) {
      console.log('[App] Update check error:', (err as Error)?.message);
    }

    try {
      const { logProductionReadiness } = await import("../lib/production-readiness");
      logProductionReadiness();
    } catch (err) {
      console.log('[App] Production readiness check error:', (err as Error)?.message);
    }

    try {
      const { runStartupImageProtection } = await import("../lib/image-backup");
      await runStartupImageProtection();
      console.log('[App] Image backup protection active');
    } catch (err) {
      console.log('[App] Image backup protection error (non-critical):', (err as Error)?.message);
    }

    try {
      const { autoDeployOnVersionChange } = await import("../lib/supabase-auto-setup");
      const deployResult = await autoDeployOnVersionChange();
      if (deployResult) {
        console.log(`[App] SQL auto-deploy: ${deployResult.deployed} deployed, ${deployResult.failed} failed (${deployResult.version})`);
      }
    } catch (err) {
      console.log('[App] SQL auto-deploy error (non-critical):', (err as Error)?.message);
    }

    console.log('[App] All startup tasks completed');
  } catch (err) {
    console.log('[App] Startup tasks error (non-critical):', (err as Error)?.message);
  }
}

function SplashHider() {
  useEffect(() => {
    const timer = setTimeout(() => {
      try { if (SplashScreen) void SplashScreen.hideAsync(); } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

import { GestureHandlerRootView } from "react-native-gesture-handler";
const GestureWrapper = Platform.OS !== 'web' ? GestureHandlerRootView : null;

const hasTrpc = !!(trpcModule?.trpc && trpcModule?.trpcClient);

function TrpcWrapper({ children, queryClient: qc }: { children: React.ReactNode; queryClient: QueryClient }) {
  if (!hasTrpc) {
    return <>{children}</>;
  }
  const TrpcProvider = trpcModule!.trpc.Provider;
  return (
    <TrpcProvider client={trpcModule!.trpcClient} queryClient={qc}>
      {children}
    </TrpcProvider>
  );
}

export default function RootLayout() {

  const [queryClient] = useState<QueryClient>(() => {
    try {
      return new QueryClient(queryClientConfig);
    } catch (e) {
      console.error('[App] QueryClient creation failed:', (e as Error)?.message);
      return new QueryClient();
    }
  });

  useEffect(() => {
    console.log('[App] RootLayout mounted — platform:', Platform.OS);
    const splashTimer = setTimeout(() => {
      console.log('[App] Hiding splash screen');
      try { if (SplashScreen) void SplashScreen.hideAsync(); } catch {}
    }, 1500);

    const startupTimer = setTimeout(() => {
      void runStartupTasks();
    }, 4000);

    return () => {
      clearTimeout(splashTimer);
      clearTimeout(startupTimer);
    };
  }, []);

  const content = (
    <ErrorBoundary fallback={
      <View style={layoutStyles.fallback}>
        <SplashHider />
        <View style={layoutStyles.fallbackInner}>
          <Text style={layoutStyles.fallbackTitle}>IVX Holdings</Text>
          <Text style={layoutStyles.fallbackText}>Something went wrong. Please restart the app.</Text>
        </View>
      </View>
    }>
      <StatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <TrpcWrapper queryClient={queryClient}>
          <AllProviders>
            <RootLayoutNav />
            <DeferredOverlays />
          </AllProviders>
        </TrpcWrapper>
      </QueryClientProvider>
    </ErrorBoundary>
  );

  if (Platform.OS === 'web' || !GestureWrapper) {
    return <View style={layoutStyles.root}>{content}</View>;
  }

  return <GestureWrapper style={layoutStyles.root}>{content}</GestureWrapper>;
}

const layoutStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fallbackInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  fallbackTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  fallbackText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center' as const,
  },
});
