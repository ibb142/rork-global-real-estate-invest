import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
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
import Colors from '@/constants/colors';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
  'kyc-verification',
  'contract-generator',
];

const PUBLIC_ROUTES = [
  'landing',
  'login',
  'signup',
  'waitlist',
  'legal',
  'company-info',
  'trust-center',
  'investor-pitch',
  'investor-prospectus',
  'app-guide',
  'app-demo',
];

function useAuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentRoute = segments[0] ?? '';
    const inLanding = currentRoute === 'landing';
    const inLogin = currentRoute === 'login';
    const inSignup = currentRoute === 'signup';
    const isPublicRoute = PUBLIC_ROUTES.includes(currentRoute);
    const isProtectedRoute = PROTECTED_ROUTES.includes(currentRoute);

    if (inLanding && isAuthenticated) {
      console.log('[AuthGate] Authenticated user on landing, redirecting to home');
      router.replace('/(tabs)' as any);
      return;
    }

    if ((inLogin || inSignup) && isAuthenticated) {
      console.log('[AuthGate] Authenticated user on auth screen, redirecting to home');
      router.replace('/(tabs)' as any);
      return;
    }

    if (!isAuthenticated && isProtectedRoute) {
      console.log('[AuthGate] Unauthenticated user on protected route:', currentRoute, '— redirecting to login');
      router.replace('/login' as any);
      return;
    }

    const routeStr = String(currentRoute);
    if (!isAuthenticated && !isPublicRoute && routeStr !== '(tabs)' && routeStr !== '' && routeStr !== 'admin' && routeStr !== 'property') {
      console.log('[AuthGate] Unauthenticated user on non-public route:', currentRoute, '— redirecting to landing');
      router.replace('/landing' as any);
      return;
    }
  }, [isAuthenticated, isLoading, segments, router]);
}

function RootLayoutNav() {
  useAuthGate();

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', ...screenDefaults }}>
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="signup" options={{ headerShown: false, presentation: 'modal' }} />
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
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <NetworkProvider>
            <I18nProvider>
              <AnalyticsProvider>
                <IPXProvider>
                  <WalletProvider>
                    <EarnProvider>
                      <LenderProvider>
                        <IntroProvider>
                          <EmailProvider>
                            <RootLayoutNav />
                          </EmailProvider>
                        </IntroProvider>
                      </LenderProvider>
                    </EarnProvider>
                  </WalletProvider>
                </IPXProvider>
              </AnalyticsProvider>
            </I18nProvider>
          </NetworkProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
