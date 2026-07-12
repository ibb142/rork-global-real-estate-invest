import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, ScrollView } from "react-native";
import Colors from "@/constants/colors";
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

// IVX brand chrome for the ENTIRE root stack. Without these options every
// route pushed at the root level (including the "(tabs)" group) rendered the
// react-navigation DEFAULT white header + white content background — the
// white banner seen at the top of each module. Groups with their own layouts
// hide the root header entirely; everything else inherits black/gold.
const ROOT_STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.primary,
  headerTitleStyle: { color: Colors.text, fontWeight: "700" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

const HEADERLESS_GROUP_OPTIONS = { headerShown: false } as const;

function StartupDiagnostic({ error }: { error: Error }) {
  return (
    <View style={styles.diagnosticContainer}>
      <Text style={styles.diagnosticTitle}>IVX Startup Diagnostic</Text>
      <Text style={styles.diagnosticMessage}>{error.message}</Text>
      <ScrollView style={styles.diagnosticScroll}>
        <Text style={styles.diagnosticStack}>
          {error.stack || "No stack trace available"}
        </Text>
      </ScrollView>
    </View>
  );
}

export default function RootLayout() {
  const [startupError, setStartupError] = useState<Error | null>(null);

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

  if (startupError) {
    return <StartupDiagnostic error={startupError} />;
  }

  try {
    return (
      <GestureHandlerRootView style={styles.root}>
        <AppErrorBoundary fallbackTitle="IVX failed to start">
          <QueryClientProvider client={queryClient}>
            <I18nProvider>
              <AuthProvider>
                <AnalyticsProvider>
                  <IPXProvider>
                    <EmailProvider>
                      <StatusBar style="light" />
                      <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
                        <Stack.Screen name="(tabs)" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="admin" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="ivx" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="property" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="landing" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="login" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="signup" options={HEADERLESS_GROUP_OPTIONS} />
                        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
                      </Stack>
                    </EmailProvider>
                  </IPXProvider>
                </AnalyticsProvider>
              </AuthProvider>
            </I18nProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </GestureHandlerRootView>
    );
  } catch (err) {
    console.error("[IVX] RootLayout render crash:", err);
    const error = err instanceof Error ? err : new Error(String(err));
    return <StartupDiagnostic error={error} />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  diagnosticContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    paddingTop: 60,
  },
  diagnosticTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "700" as const,
    marginBottom: 12,
  },
  diagnosticMessage: {
    color: Colors.primary,
    fontSize: 14,
    marginBottom: 16,
  },
  diagnosticScroll: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
  },
  diagnosticStack: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: "monospace",
  },
});

