import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, Component, type ReactNode } from "react";
import { StyleSheet, View, Text, Platform, ActivityIndicator, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Diagnostic error boundary — shows the FULL crash on screen
import { DiagnosticErrorBoundary } from "@/components/DiagnosticErrorBoundary";
import { injectWebKeyboardCSS } from "@/hooks/useWebKeyboard";
import { checkForUpdates } from "@/lib/app-update-checker";

// Static imports — all providers with per-provider error boundaries
import { I18nProvider } from "@/lib/i18n-context";
import { AuthProvider } from "@/lib/auth-context";
import { AnalyticsProvider } from "@/lib/analytics-context";
import { IPXProvider } from "@/lib/ipx-context";
import { EmailProvider } from "@/lib/email-context";

const queryClient = new QueryClient();

// Prevent native splash from auto-hiding before React renders.
// Without this, Android dismisses the native splash before the JS bundle
// has loaded and rendered the first screen, producing a black screen.
SplashScreen.preventAutoHideAsync().catch((err: unknown) => {
  console.warn("[IVX] SplashScreen.preventAutoHideAsync failed:", err);
});

// Maximum time to wait for startup before showing a fallback error screen.
const STARTUP_TIMEOUT_MS = 5000;

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
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupTimedOut, setStartupTimedOut] = useState(false);

  useEffect(() => {
    // Inject Samsung keyboard CSS on web — ensures inputs are focusable
    // and editable on Samsung Internet / Android Chrome.
    try {
      injectWebKeyboardCSS();
    } catch (err) {
      console.warn("[IVX] injectWebKeyboardCSS failed:", err);
    }

    // Hide the native splash screen as soon as React has rendered.
    // This coordinates splash dismissal with first paint to prevent black screens.
    SplashScreen.hideAsync().catch((err: unknown) => {
      console.warn("[IVX] SplashScreen.hideAsync failed:", err);
    });

    // Non-fatal OTA update check — runs in background, NEVER crashes the app.
    // If the update server is unreachable, the app continues with the
    // embedded or cached bundle. See lib/ota-error-handler.ts for details.
    checkForUpdates().catch((err) => {
      console.warn("[IVX] OTA update check failed (non-fatal):", err);
    });

    // Startup safety timeout: if the app hasn't fully rendered within 5 seconds,
    // show a visible error screen instead of leaving the user on a black screen.
    const startupTimeout = setTimeout(() => {
      console.warn("[IVX] Startup timeout reached after", STARTUP_TIMEOUT_MS, "ms");
      setStartupTimedOut(true);
    }, STARTUP_TIMEOUT_MS);

    // Defer all startup instrumentation to after first paint.
    // These modules (incident capture, owner AI watchdog) are owner-only
    // and should not block the initial bundle download or app boot.
    const deferredTimer = setTimeout(() => {
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
      // Owner AI watchdog bridge — only needed when owner chat is active.
      // Load lazily so it doesn't block startup for non-owner users.
      try {
        const { installIVXWatchdogIncidentBridge } = require("@/lib/ivx-incident-client");
        const { ivxAIWatchdog } = require("@/src/modules/ivx-owner-ai/services/ivxAIWatchdog");
        installIVXWatchdogIncidentBridge((listener: unknown) =>
          ivxAIWatchdog.subscribe(listener),
        );
      } catch (err) {
        console.warn("[IVX] installIVXWatchdogIncidentBridge failed", err);
      }
    }, 3000);

    return () => {
      clearTimeout(startupTimeout);
      clearTimeout(deferredTimer);
    };
  }, []);

  // Startup timeout fallback — show a visible error screen instead of hanging.
  if (startupTimedOut) {
    return (
      <View style={styles.startupTimeoutContainer}>
        <Text style={styles.startupTimeoutTitle}>IVX is taking longer than expected</Text>
        <Text style={styles.startupTimeoutBody}>
          The app could not initialize within 5 seconds. This may be due to a slow network or device.
        </Text>
        <TouchableOpacity
          style={styles.startupRetryButton}
          onPress={() => {
            setStartupTimedOut(false);
            setStartupError(null);
          }}
        >
          <Text style={styles.startupRetryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (startupError) {
    return (
      <View style={styles.startupTimeoutContainer}>
        <Text style={styles.startupTimeoutTitle}>IVX failed to start</Text>
        <Text style={styles.startupTimeoutBody}>{startupError}</Text>
        <TouchableOpacity
          style={styles.startupRetryButton}
          onPress={() => setStartupError(null)}
        >
          <Text style={styles.startupRetryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <DiagnosticErrorBoundary>
      <GestureHandlerRootView
        style={styles.root}
        {...(Platform.OS === 'web' ? { touchAction: 'auto' as const } : {})}
      >
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
  startupTimeoutContainer: {
    flex: 1,
    backgroundColor: "#0A0A0F",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  startupTimeoutTitle: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "700" as const,
    marginBottom: 12,
    textAlign: "center" as const,
  },
  startupTimeoutBody: {
    color: "#888",
    fontSize: 14,
    textAlign: "center" as const,
    marginBottom: 24,
    lineHeight: 20,
  },
  startupRetryButton: {
    backgroundColor: "#FFD700",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  startupRetryText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700" as const,
  },
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
