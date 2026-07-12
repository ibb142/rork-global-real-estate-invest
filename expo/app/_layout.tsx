import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, Suspense, lazy, Component, type ReactNode } from "react";
import { StyleSheet, View, Text, ScrollView, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Lazy-load all providers so a module-scope crash in any import chain
// doesn't prevent the entire JS bundle from registering the root component.
// Each provider is loaded on first render via React.lazy + dynamic import.
const I18nProvider = lazy(() =>
  import("@/lib/i18n-context").then((m) => ({ default: m.I18nProvider })),
);
const AuthProvider = lazy(() =>
  import("@/lib/auth-context").then((m) => ({ default: m.AuthProvider })),
);
const AnalyticsProvider = lazy(() =>
  import("@/lib/analytics-context").then((m) => ({ default: m.AnalyticsProvider })),
);
const IPXProvider = lazy(() =>
  import("@/lib/ipx-context").then((m) => ({ default: m.IPXProvider })),
);
const EmailProvider = lazy(() =>
  import("@/lib/email-context").then((m) => ({ default: m.EmailProvider })),
);

// Re-export expo-router's ErrorBoundary so route-level throws surface
// a real error screen instead of a blank white screen.
export { ErrorBoundary } from "expo-router";

const queryClient = new QueryClient();

const ROOT_STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: Colors.background },
  headerTintColor: Colors.primary,
  headerTitleStyle: { color: Colors.text, fontWeight: "700" as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: Colors.background },
} as const;

const HEADERLESS_GROUP_OPTIONS = { headerShown: false } as const;

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
          <Text style={styles.providerErrorMsg}>{this.state.error?.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// --- Loading fallback for lazy providers
function ProviderLoading({ name }: { name: string }) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.loadingText}>Loading {name}…</Text>
    </View>
  );
}

export default function RootLayout() {
  // Side-effect installs happen in useEffect, AFTER the component mounts.
  // This prevents a crash in any installer from breaking the render.
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
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<ProviderLoading name="core" />}>
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
                          </ProviderBoundary>
                        </IPXProvider>
                      </ProviderBoundary>
                    </AnalyticsProvider>
                  </ProviderBoundary>
                </AuthProvider>
              </ProviderBoundary>
            </I18nProvider>
          </ProviderBoundary>
        </Suspense>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  providerError: {
    padding: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    margin: 8,
  },
  providerErrorName: {
    color: "#FF6B6B",
    fontSize: 13,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  providerErrorMsg: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontFamily: "monospace",
  },
});
