import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  installIVXIncidentCapture,
  installIVXWatchdogIncidentBridge,
} from "@/lib/ivx-incident-client";
import { ivxAIWatchdog } from "@/src/modules/ivx-owner-ai/services/ivxAIWatchdog";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n-context";
import { AnalyticsProvider } from "@/lib/analytics-context";
import { IPXProvider } from "@/lib/ipx-context";
import { EmailProvider } from "@/lib/email-context";
import { installTextNodeGuard } from "@/lib/text-node-guard";
import AppErrorBoundary from "@/components/ErrorBoundary";

// Install before any UI renders: makes the "Unexpected text node: ... A text
// node cannot be a child of a <View>" crash structurally impossible and logs
// the exact offending text + source trace if one ever leaks.
//
// Guarded so a failure in the guard installer itself can NEVER prevent the JS
// bundle from registering the root component (which would leave Expo Go stuck
// on the white "downloading update" screen with no surfaced error).
try {
  installTextNodeGuard();
} catch (err) {
  console.warn("[IVX] installTextNodeGuard failed at module load", err);
}

// Re-export an expo-router ErrorBoundary so a render/route-level throw surfaces
// a real error screen instead of a blank white screen.
export { ErrorBoundary } from "expo-router";

const queryClient = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    try {
      installIVXIncidentCapture();
    } catch (err) {
      console.warn("[IVX] installIVXIncidentCapture failed", err);
    }
    try {
      installIVXWatchdogIncidentBridge((listener) =>
        ivxAIWatchdog.subscribe(listener),
      );
    } catch (err) {
      console.warn("[IVX] installIVXWatchdogIncidentBridge failed", err);
    }
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <AppErrorBoundary fallbackTitle="IVX failed to start">
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <AuthProvider>
              <AnalyticsProvider>
                <IPXProvider>
                  <EmailProvider>
                    <Stack />
                  </EmailProvider>
                </IPXProvider>
              </AnalyticsProvider>
            </AuthProvider>
          </I18nProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

