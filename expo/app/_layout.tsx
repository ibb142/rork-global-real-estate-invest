import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, Component, type ReactNode } from "react";
import { StyleSheet, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Diagnostic error boundary — shows the FULL crash on screen
import { DiagnosticErrorBoundary } from "@/components/DiagnosticErrorBoundary";

// Static imports — all providers with per-provider error boundaries
import { I18nProvider } from "@/lib/i18n-context";
import { AuthProvider } from "@/lib/auth-context";
import { AnalyticsProvider } from "@/lib/analytics-context";
import { IPXProvider } from "@/lib/ipx-context";
import { EmailProvider } from "@/lib/email-context";

const queryClient = new QueryClient();

// Re-export expo-router's ErrorBoundary for route-level catches
export { ErrorBoundary } from "expo-router";

// --- Per-provider error boundary: isolates which provider crashed
interface ProviderBoundaryProps {
  name: string;
  children: ReactNode;
}
interface ProviderBoundaryState {
  hasError: boolean;
  error: Error | null;
}
class ProviderBoundary extends Component<ProviderBoundaryProps, ProviderBoundaryState> {
  constructor(props: ProviderBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): Partial<ProviderBoundaryState> {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    console.warn(`[IVX] Provider "${this.props.name}" crashed:`, error.message, error.stack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.providerError}>
          <Text style={styles.providerErrorName}>{this.props.name} unavailable</Text>
          <Text style={styles.providerErrorMsg}>
            {this.state.error?.message || "Unknown error"}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  useEffect(() => {
    try {
      const { installTextNodeGuard } = require("@/lib/text-node-guard");
      installTextNodeGuard();
    } catch (err) {
      console.warn("[IVX] installTextNodeGuard failed", err);
    }
    try {
      const { installIVXIncidentCapture } = require("@/lib/ivx-incident-client");
      installIVXIncidentCapture();
    } catch (err) {
      console.warn("[IVX] installIVXIncidentCapture failed", err);
    }
    try {
      const { installIVXWatchdogIncidentBridge } = require("@/lib/ivx-incident-client");
      const { ivxAIWatchdog } = require("@/src/modules/ivx-owner-ai/services/ivxAIWatchdog");
      installIVXWatchdogIncidentBridge((listener: unknown) =>
        ivxAIWatchdog.subscribe(listener),
      );
    } catch (err) {
      console.warn("[IVX] installIVXWatchdogIncidentBridge failed", err);
    }
  }, []);

  return (
    <DiagnosticErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <QueryClientProvider client={queryClient}>
          <ProviderBoundary name="I18n">
            <I18nProvider>
              <ProviderBoundary name="Auth">
                <AuthProvider>
                  <ProviderBoundary name="Analytics">
                    <AnalyticsProvider>
                      <ProviderBoundary name="IPX">
                        <IPXProvider>
                          <ProviderBoundary name="Email">
                            <EmailProvider>
                              <StatusBar style="light" />
                              <Stack
                                screenOptions={{
                                  headerShown: false,
                                  contentStyle: { backgroundColor: "#0A0A0F" },
                                }}
                              >
                                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                                <Stack.Screen name="admin" options={{ headerShown: false }} />
                                <Stack.Screen name="ivx" options={{ headerShown: false }} />
                                <Stack.Screen name="property" options={{ headerShown: false }} />
                                <Stack.Screen name="landing" options={{ headerShown: false }} />
                                <Stack.Screen name="login" options={{ headerShown: false }} />
                                <Stack.Screen name="signup" options={{ headerShown: false }} />
                                <Stack.Screen name="modal" options={{ presentation: "modal" }} />
                              </Stack>
                            </EmailProvider>
                          </ProviderBoundary>
                        </IPXProvider>
                      </ProviderBoundary>
                    </AnalyticsProvider>
                  </ProviderBoundary>
                </AuthProvider>
              </ProviderBoundary>
            </I18nProvider>
          </ProviderBoundary>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </DiagnosticErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0F" },
  providerError: {
    flex: 1,
    backgroundColor: "#0A0A0F",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  providerErrorName: {
    color: "#FF6B6B",
    fontSize: 16,
    fontWeight: "700" as const,
    marginBottom: 8,
  },
  providerErrorMsg: {
    color: "#888",
    fontSize: 12,
    fontFamily: "monospace" as const,
    textAlign: "center" as const,
  },
});
