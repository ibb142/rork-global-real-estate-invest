import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";

import Colors from "../constants/colors";
import { queryClientConfig } from "../lib/query-config";
import logger from "../lib/logger";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { IPXProvider } from "../lib/ipx-context";
import { AuthProvider, useAuth } from "../lib/auth-context";
import { EarnProvider } from "../lib/earn-context";
import { LenderProvider } from "../lib/lender-context";
import { IntroProvider, useIntro } from "../lib/intro-context";
import { I18nProvider } from "../lib/i18n-context";
import { AnalyticsProvider } from "../lib/analytics-context";
import { EmailProvider } from "../lib/email-context";
import { ImageStorageProvider } from "../lib/image-context";
import OnboardingFlow from "../components/OnboardingFlow";
import AdminFAB from "../components/AdminFAB";
import {
  registerForPushNotificationsAsync,
  registerTokenWithBackend,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  setBadgeCount,
} from "../lib/push-notifications";
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient(queryClientConfig);

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
      <Stack.Screen name="landing" options={HIDDEN_HEADER} />
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
    </Stack>
  );
}

function PushNotificationHandler() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS === 'web') return;

    let isMounted = true;

    const setupPush = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token && isMounted) {
          pushTokenRef.current = token;
          await registerTokenWithBackend(token);
          logger.push.log('Setup complete');
        }
      } catch (error) {
        logger.push.error('Setup error:', error);
      }
    };

    void setupPush();

    return () => { isMounted = false; };
  }, [isAuthenticated]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const receivedSub = addNotificationReceivedListener((notification) => {
        logger.push.log('Received:', notification.request.content.title);
    });

    const responseSub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
        logger.push.log('User tapped notification, data:', data);

      if (data?.screen) {
        router.push(data.screen as any);
      } else {
        router.push('/notifications' as any);
      }

      void setBadgeCount(0);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);

  return null;
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { hasCompletedOnboarding, isLoading: introLoading, completeOnboarding } = useIntro();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const hasNavigated = useRef(false);

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (authLoading || introLoading) return;
    if (hasNavigated.current) return;

    if (!isAuthenticated) {
      hasNavigated.current = true;
      router.replace('/' as any);
      return;
    }

    if (!hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, [authLoading, introLoading, isAuthenticated, hasCompletedOnboarding, router]);

  const handleOnboardingDismiss = useCallback(() => {
    void completeOnboarding();
    setShowOnboarding(false);
  }, [completeOnboarding]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <PushNotificationHandler />
      <RootLayoutNav />
      <AdminFAB />
      {!introLoading && (
        <OnboardingFlow
          visible={showOnboarding}
          onClose={handleOnboardingDismiss}
          onComplete={handleOnboardingDismiss}
        />
      )}
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <AnalyticsProvider>
              <IntroProvider>
                <LenderProvider>
                  <IPXProvider>
                    <EarnProvider>
                      <EmailProvider>
                        <ImageStorageProvider>
                          <AppContent />
                        </ImageStorageProvider>
                      </EmailProvider>
                    </EarnProvider>
                  </IPXProvider>
                </LenderProvider>
              </IntroProvider>
            </AnalyticsProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
