import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { WalletProvider } from '@/lib/wallet-context';
import { IPXProvider } from '@/lib/ipx-context';
import { I18nProvider } from '@/lib/i18n-context';
import { AnalyticsProvider } from '@/lib/analytics-context';
import { NetworkProvider } from '@/lib/network-context';
import { IntroProvider } from '@/lib/intro-context';
import { LenderProvider } from '@/lib/lender-context';
import { EarnProvider } from '@/lib/earn-context';
import { EmailProvider } from '@/lib/email-context';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { queryClientConfig } from '@/lib/query-config';
import { configureReactQueryLifecycle } from '@/lib/react-query-runtime';
import { isOpenAccessModeEnabled } from '@/lib/open-access';
import { setChatProvider } from '@/src/modules/chat/services/chatProvider';
import { configureChatUploads } from '@/src/modules/chat/services/chatUploadConfig';
import { supabaseChatProvider } from '@/src/modules/chat/services/supabaseChatProvider';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.log('[RootLayout] Splash preventAutoHideAsync note:', error instanceof Error ? error.message : 'unknown');
});
if (Platform.OS !== 'web' && typeof SplashScreen.setOptions === 'function') {
  SplashScreen.setOptions({ duration: 180, fade: true });
}

const queryClient = new QueryClient(queryClientConfig);

let hasConfiguredBootstrapServices = false;
let hasHiddenSplashScreen = false;

function configureBootstrapServices(): void {
  if (hasConfiguredBootstrapServices) {
    return;
  }

  configureChatUploads({ bucketName: 'chat-uploads' });
  setChatProvider(supabaseChatProvider);
  hasConfiguredBootstrapServices = true;
  console.log('[RootLayout] Bootstrap services configured');
}

async function hideSplashScreen(reason: string): Promise<void> {
  if (hasHiddenSplashScreen) {
    return;
  }

  hasHiddenSplashScreen = true;

  try {
    console.log('[RootLayout] Hiding splash screen. Reason:', reason);
    await SplashScreen.hideAsync();
  } catch (error) {
    console.log('[RootLayout] Splash hide note:', error instanceof Error ? error.message : 'unknown');
  }
}

const screenDefaults = {
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.text,
  headerTitleStyle: { fontWeight: '600' as const },
  contentStyle: { backgroundColor: Colors.background },
  headerShadowVisible: false,
};

const PROTECTED_ROUTES = [
  'buy-shares',
  'sell-shares',
  'jv-invest',
  'wallet',
  'portfolio',
  'resale-marketplace',
  'gift-shares',
  'auto-reinvest',
  'copy-investing',
  'statements',
  'tax-documents',
  'tax-info',
  'personal-info',
  'security-settings',
  'notification-settings',
  'notifications',
  'chat-room',
  'kyc-verification',
  'contract-generator',
];

const PUBLIC_ROUTES = [
  'landing',
  'login',
  'signup',
  'owner-access',
  'reset-password',
  'waitlist',
  'legal',
  'company-info',
  'trust-center',
  'investor-pitch',
  'investor-prospectus',
  'app-guide',
  'app-demo',
];

const EMAIL_ROUTES = [
  'email',
  'email-compose',
  'email-detail',
  'send-test-email',
];

const ADMIN_EMAIL_ROUTES = [
  'email-management',
  'email-inbox',
  'email-engine',
  'email-accounts',
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasStableAuthIdentity(userId: string | null | undefined): boolean {
  const trimmedUserId = userId?.trim() ?? '';
  return UUID_PATTERN.test(trimmedUserId);
}

function RouteAwareFeatureProviders({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, userId, isOwnerIPAccess } = useAuth();
  const segments = useSegments();
  const currentRoute = segments[0];
  const nestedRoute = segments[1] ?? '';
  const [featureProvidersReady, setFeatureProvidersReady] = useState<boolean>(false);
  const hasReleasedFeatureProvidersRef = useRef(false);
  const openAccessMode = isOpenAccessModeEnabled();

  const isPublicRoute = currentRoute ? PUBLIC_ROUTES.includes(currentRoute) : false;
  const hasStableAuthSession = isAuthenticated && hasStableAuthIdentity(userId);
  const shouldPrepareFeatureProviders = openAccessMode || isAuthenticated;
  const shouldMountAppDataProviders = openAccessMode || hasStableAuthSession;
  const shouldMountEmailProvider = shouldMountAppDataProviders && !!currentRoute && (
    EMAIL_ROUTES.includes(currentRoute)
      || (currentRoute === 'admin' && ADMIN_EMAIL_ROUTES.includes(nestedRoute))
  );

  useEffect(() => {
    if (!shouldPrepareFeatureProviders) {
      hasReleasedFeatureProvidersRef.current = false;
      setFeatureProvidersReady(false);
      return;
    }

    if (hasReleasedFeatureProvidersRef.current) {
      setFeatureProvidersReady(true);
      return;
    }

    let cancelled = false;
    const releaseFeatureProviders = () => {
      if (cancelled || hasReleasedFeatureProvidersRef.current) {
        return;
      }

      hasReleasedFeatureProvidersRef.current = true;
      setFeatureProvidersReady(true);
      console.log('[RootLayout] Heavy feature providers released after auth stabilization');
    };

    const interactionTask = InteractionManager.runAfterInteractions(releaseFeatureProviders);
    const fallbackTimeout = setTimeout(releaseFeatureProviders, 320);

    return () => {
      cancelled = true;
      interactionTask.cancel();
      clearTimeout(fallbackTimeout);
    };
  }, [shouldPrepareFeatureProviders]);

  useEffect(() => {
    console.log('[RootLayout] Provider strategy:', {
      currentRoute,
      nestedRoute,
      isAuthenticated,
      userId,
      isOwnerIPAccess,
      openAccessMode,
      hasStableAuthSession,
      isPublicRoute,
      shouldMountAppDataProviders,
      shouldMountEmailProvider,
      featureProvidersReady,
    });
  }, [currentRoute, nestedRoute, isAuthenticated, userId, isOwnerIPAccess, openAccessMode, hasStableAuthSession, isPublicRoute, shouldMountAppDataProviders, shouldMountEmailProvider, featureProvidersReady]);

  if (!shouldMountAppDataProviders) {
    if (isAuthenticated && !hasStableAuthSession) {
      console.log('[RootLayout] Rendering lightweight provider tree because authenticated identity is not yet stable:', userId);
    } else {
      console.log('[RootLayout] Rendering lightweight provider tree for public startup');
    }
    return <>{children}</>;
  }

  if (!featureProvidersReady) {
    console.log('[RootLayout] Holding authenticated provider hydration until interactions settle');
    return <StartupGateScreen message="Loading your workspace…" />;
  }

  const content = (
    <IPXProvider>
      <WalletProvider>
        <EarnProvider>
          <LenderProvider>
            <IntroProvider>
              {children}
            </IntroProvider>
          </LenderProvider>
        </EarnProvider>
      </WalletProvider>
    </IPXProvider>
  );

  if (shouldMountEmailProvider) {
    console.log('[RootLayout] Email provider enabled for route:', currentRoute, nestedRoute);
    return <EmailProvider>{content}</EmailProvider>;
  }

  return content;
}

type AuthGateState = {
  shouldBlockRender: boolean;
  message: string;
};

function StartupGateScreen({ message }: { message: string }) {
  return (
    <View style={styles.startupGate} testID="expo-go-startup-gate">
      <View style={styles.startupCard}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.startupTitle}>Preparing IVX Holdings</Text>
        <Text style={styles.startupMessage}>{message}</Text>
      </View>
    </View>
  );
}

function useAuthGate(): AuthGateState {
  const { isAuthenticated, isLoading, userId } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const openAccessMode = isOpenAccessModeEnabled();
  const isNavigationReady = Boolean(navigationState?.key);
  const currentRoute = segments[0] ?? '';
  const inLanding = currentRoute === 'landing';
  const inLogin = currentRoute === 'login';
  const inSignup = currentRoute === 'signup';
  const inOwnerAccess = currentRoute === 'owner-access';
  const inResetPassword = currentRoute === 'reset-password';
  const isPublicRoute = PUBLIC_ROUTES.includes(currentRoute);
  const isProtectedRoute = PROTECTED_ROUTES.includes(currentRoute);
  const hasStableAuthSession = isAuthenticated && hasStableAuthIdentity(userId);
  const shouldRedirectToHome = isNavigationReady && (
    openAccessMode
      ? (inLanding || inLogin || inSignup || inOwnerAccess || inResetPassword)
      : !isLoading && hasStableAuthSession && (inLanding || inLogin || inSignup)
  );
  const shouldRedirectToLogin = !openAccessMode && isNavigationReady && !isLoading && !hasStableAuthSession && isProtectedRoute;
  const shouldRedirectToLanding = !openAccessMode && isNavigationReady && !isLoading && !hasStableAuthSession && !isPublicRoute && currentRoute !== '' && currentRoute !== 'admin' && currentRoute !== 'property';
  const shouldBlockWhileLoading = !isNavigationReady || (!openAccessMode && isLoading);

  useEffect(() => {
    console.log('[AuthGate] State:', {
      currentRoute,
      isLoading,
      isAuthenticated,
      userId,
      hasStableAuthSession,
      openAccessMode,
      isNavigationReady,
      shouldRedirectToHome,
      shouldRedirectToLogin,
      shouldRedirectToLanding,
    });

    if (!isNavigationReady) {
      return;
    }

    if (shouldRedirectToHome) {
      console.log('[AuthGate] Direct-access route detected, redirecting to home workspace');
      router.replace('/(tabs)' as any);
      return;
    }

    if (shouldRedirectToLogin) {
      console.log('[AuthGate] Unauthenticated user on protected route:', currentRoute, '— redirecting to login');
      router.replace('/login' as any);
      return;
    }

    if (shouldRedirectToLanding) {
      console.log('[AuthGate] Unauthenticated user on non-public route:', currentRoute, '— redirecting to landing');
      router.replace('/landing' as any);
    }
  }, [currentRoute, hasStableAuthSession, isAuthenticated, isLoading, isNavigationReady, openAccessMode, router, shouldRedirectToHome, shouldRedirectToLanding, shouldRedirectToLogin, userId]);

  if (shouldRedirectToHome) {
    return {
      shouldBlockRender: true,
      message: openAccessMode ? 'Opening your workspace…' : 'Opening your dashboard…',
    };
  }

  if (shouldRedirectToLogin) {
    return {
      shouldBlockRender: true,
      message: 'Checking your access…',
    };
  }

  if (shouldRedirectToLanding) {
    return {
      shouldBlockRender: true,
      message: 'Redirecting to the investor landing page…',
    };
  }

  if (!isNavigationReady) {
    return {
      shouldBlockRender: true,
      message: 'Preparing secure startup…',
    };
  }

  if (shouldBlockWhileLoading) {
    return {
      shouldBlockRender: true,
      message: 'Restoring your session…',
    };
  }

  return {
    shouldBlockRender: false,
    message: '',
  };
}

function SplashScreenController({ bootstrapReady }: { bootstrapReady: boolean }) {
  const { isLoading } = useAuth();
  const navigationState = useRootNavigationState();
  const hasRequestedHideRef = useRef(false);
  const openAccessMode = isOpenAccessModeEnabled();
  const isNavigationReady = Boolean(navigationState?.key);

  useEffect(() => {
    console.log('[RootLayout] Splash controller state:', {
      bootstrapReady,
      isLoading,
      openAccessMode,
      isNavigationReady,
      hasRequestedHide: hasRequestedHideRef.current,
    });

    if (!bootstrapReady || (!openAccessMode && isLoading) || !isNavigationReady || hasRequestedHideRef.current) {
      return;
    }

    hasRequestedHideRef.current = true;
    void hideSplashScreen('bootstrap-complete');
  }, [bootstrapReady, isLoading, openAccessMode, isNavigationReady]);

  return null;
}

function RootLayoutNav() {
  const authGate = useAuthGate();

  if (authGate.shouldBlockRender) {
    return <StartupGateScreen message={authGate.message} />;
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', ...screenDefaults }}>
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="signup" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="owner-access" options={{ title: 'Owner Access' }} />
      <Stack.Screen name="reset-password" options={{ title: 'Reset Password' }} />
      <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Stack.Screen name="buy-shares" options={{ title: 'Buy Shares' }} />
      <Stack.Screen name="sell-shares" options={{ title: 'Sell Shares' }} />
      <Stack.Screen name="jv-invest" options={{ title: 'JV Investment' }} />
      <Stack.Screen name="jv-agreement" options={{ title: 'JV Agreement' }} />
      <Stack.Screen name="jv-architecture" options={{ title: 'JV Architecture' }} />
      <Stack.Screen name="resale-marketplace" options={{ title: 'Resale Marketplace' }} />
      <Stack.Screen name="kyc-verification" options={{ title: 'KYC Verification' }} />
      <Stack.Screen name="personal-info" options={{ title: 'Personal Info' }} />
      <Stack.Screen name="security-settings" options={{ title: 'Security Settings' }} />
      <Stack.Screen name="notification-settings" options={{ title: 'Notification Settings' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="chat-room" options={{ title: 'Message Room' }} />
      <Stack.Screen name="statements" options={{ title: 'Statements' }} />
      <Stack.Screen name="tax-documents" options={{ title: 'Tax Documents' }} />
      <Stack.Screen name="tax-info" options={{ title: 'Tax Info' }} />
      <Stack.Screen name="legal" options={{ title: 'Legal' }} />
      <Stack.Screen name="language" options={{ title: 'Language' }} />
      <Stack.Screen name="company-info" options={{ title: 'Company Info' }} />
      <Stack.Screen name="referrals" options={{ title: 'Referrals' }} />
      <Stack.Screen name="trust-center" options={{ title: 'Trust Center' }} />
      <Stack.Screen name="vip-tiers" options={{ title: 'VIP Tiers' }} />
      <Stack.Screen name="ipx-earn" options={{ title: 'IPX Earn' }} />
      <Stack.Screen name="smart-investing" options={{ title: 'Smart Investing' }} />
      <Stack.Screen name="auto-reinvest" options={{ title: 'Auto Reinvest' }} />
      <Stack.Screen name="copy-investing" options={{ title: 'Copy Investing' }} />
      <Stack.Screen name="compare-investments" options={{ title: 'Compare Investments' }} />
      <Stack.Screen name="gift-shares" options={{ title: 'Gift Shares' }} />
      <Stack.Screen name="property-documents" options={{ title: 'Property Documents' }} />
      <Stack.Screen name="title-review" options={{ title: 'Title Review' }} />
      <Stack.Screen name="investor-pitch" options={{ title: 'Investor Pitch' }} />
      <Stack.Screen name="investor-prospectus" options={{ title: 'Investor Prospectus' }} />
      <Stack.Screen name="contract-generator" options={{ title: 'Contract Generator' }} />
      <Stack.Screen name="developer-breakdown" options={{ title: 'Developer Breakdown' }} />
      <Stack.Screen name="analytics-report" options={{ title: 'Analytics Report' }} />
      <Stack.Screen name="search" options={{ title: 'Search', presentation: 'modal' }} />
      <Stack.Screen name="share-content" options={{ title: 'Share', presentation: 'modal' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      <Stack.Screen name="agent-apply" options={{ title: 'Agent Application' }} />
      <Stack.Screen name="broker-apply" options={{ title: 'Broker Application' }} />
      <Stack.Screen name="influencer-apply" options={{ title: 'Influencer Application' }} />
      <Stack.Screen name="activation-center" options={{ title: 'Activation Center' }} />
      <Stack.Screen name="authenticator" options={{ title: 'Authenticator' }} />
      <Stack.Screen name="app-guide" options={{ title: 'App Guide' }} />
      <Stack.Screen name="app-demo" options={{ title: 'App Demo' }} />
      <Stack.Screen name="app-report" options={{ title: 'App Report' }} />
      <Stack.Screen name="system-health" options={{ title: 'System Health' }} />
      <Stack.Screen name="system-blueprint" options={{ title: 'System Blueprint' }} />
      <Stack.Screen name="backend-audit" options={{ title: 'Backend Audit' }} />
      <Stack.Screen name="auto-repair" options={{ title: 'Auto Repair' }} />
      <Stack.Screen name="ai-automation-report" options={{ title: 'AI Automation Report' }} />
      <Stack.Screen name="ai-gallery" options={{ title: 'AI Gallery' }} />
      <Stack.Screen name="global-intelligence" options={{ title: 'Global Intelligence' }} />
      <Stack.Screen name="api-list" options={{ title: 'API List' }} />
      <Stack.Screen name="supabase-export" options={{ title: 'Supabase Export' }} />
      <Stack.Screen name="video-presentation" options={{ title: 'Video Presentation' }} />
      <Stack.Screen name="viral-growth" options={{ title: 'Viral Growth' }} />
      <Stack.Screen name="waitlist" options={{ title: 'Investor Waitlist', headerShown: false }} />
      <Stack.Screen name="email" options={{ title: 'Email' }} />
      <Stack.Screen name="email-compose" options={{ title: 'Compose Email' }} />
      <Stack.Screen name="email-detail" options={{ title: 'Email Detail' }} />
      <Stack.Screen name="send-test-email" options={{ title: 'Test Email' }} />
      <Stack.Screen name="send-test-sms" options={{ title: 'Test SMS' }} />
      <Stack.Screen name="sms-compose" options={{ title: 'Compose SMS' }} />
      <Stack.Screen name="sms-dashboard" options={{ title: 'SMS Dashboard' }} />
      <Stack.Screen name="sms-history" options={{ title: 'SMS History' }} />
      <Stack.Screen name="sms-reports" options={{ title: 'SMS Reports' }} />
      <Stack.Screen name="property/[id]" options={{ title: 'Property Details' }} />
      <Stack.Screen name="registration-audit" options={{ title: 'Registration Audit' }} />
      <Stack.Screen name="business-card" options={{ title: 'Business Card' }} />
      <Stack.Screen name="qr-code" options={{ title: 'QR Code' }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [bootstrapReady, setBootstrapReady] = useState<boolean>(false);

  useEffect(() => {
    let cleanupReactQueryLifecycle: (() => void) | undefined;

    try {
      configureBootstrapServices();
    } catch (error) {
      console.log('[RootLayout] Bootstrap service configuration note:', error instanceof Error ? error.message : 'unknown');
    }

    try {
      cleanupReactQueryLifecycle = configureReactQueryLifecycle();
    } catch (error) {
      console.log('[RootLayout] React Query lifecycle configuration note:', error instanceof Error ? error.message : 'unknown');
    }

    setBootstrapReady(true);
    console.log('[RootLayout] Bootstrap preparation complete');

    return () => {
      cleanupReactQueryLifecycle?.();
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
            <SplashScreenController bootstrapReady={bootstrapReady} />
            <NetworkProvider>
              <I18nProvider>
                <AnalyticsProvider>
                  <RouteAwareFeatureProviders>
                    <RootLayoutNav />
                  </RouteAwareFeatureProviders>
                </AnalyticsProvider>
              </I18nProvider>
            </NetworkProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  startupGate: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  startupCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  startupTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    textAlign: 'center',
  },
  startupMessage: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
