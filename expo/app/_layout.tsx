// template
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { memo, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AnalyticsProvider } from "@/lib/analytics-context";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import { EarnProvider } from "@/lib/earn-context";
import { IPXProvider } from "@/lib/ipx-context";
import { WalletProvider } from "@/lib/wallet-context";
import { PublicChatSessionProvider } from "@/lib/public-chat-session-context";
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthGate from "@/components/AuthGate";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const ROOT_STACK_SCREEN_OPTIONS = { headerBackTitle: "Back" } as const;
const HIDDEN_HEADER_OPTIONS = { headerShown: false } as const;
const ROOT_OWNER_ROUTE_OPTIONS = { headerShown: false, animation: "fade" } as const;

const RootLayoutNav = memo(function RootLayoutNav() {
  return (
    <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="signup" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="owner-signup" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="login" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="owner-login" options={ROOT_OWNER_ROUTE_OPTIONS} />
      <Stack.Screen name="owner-access" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="landing" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="(tabs)" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="admin" options={HIDDEN_HEADER_OPTIONS} />
      <Stack.Screen name="ivx" options={HIDDEN_HEADER_OPTIONS} />
    </Stack>
  );
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PublicChatSessionProvider>
          <I18nProvider>
            <AuthProvider>
              <AnalyticsProvider>
                <IPXProvider>
                  <WalletProvider>
                    <EarnProvider>
                      <ErrorBoundary>
                        <AuthGate>
                          <RootLayoutNav />
                        </AuthGate>
                      </ErrorBoundary>
                    </EarnProvider>
                  </WalletProvider>
                </IPXProvider>
              </AnalyticsProvider>
            </AuthProvider>
          </I18nProvider>
        </PublicChatSessionProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
