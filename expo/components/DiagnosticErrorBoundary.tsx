// IVX Diagnostic ErrorBoundary
// Shows the FULL error message + stack trace on the phone screen
// so we can see exactly what crashes without needing logs.
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class DiagnosticErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[IVX CRASH]', error.message, error.stack, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    const { error, errorInfo } = this.state;
    const platformInfo = `${Platform.OS} ${Platform.Version}`;

    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.title}>IVX Crash Report</Text>
          <Text style={styles.subtitle}>Send a screenshot of this to fix the app</Text>

          <View style={styles.section}>
            <Text style={styles.label}>Platform</Text>
            <Text style={styles.value}>{platformInfo}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Error Message</Text>
            <Text style={styles.errorText}>{error.message}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Error Name</Text>
            <Text style={styles.value}>{error.name}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Stack Trace</Text>
            <Text style={styles.stackText}>{error.stack || '(no stack)'}</Text>
          </View>

          {errorInfo && errorInfo.componentStack ? (
            <View style={styles.section}>
              <Text style={styles.label}>Component Stack</Text>
              <Text style={styles.stackText}>{errorInfo.componentStack}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a0000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 60,
  },
  title: {
    color: '#FF4444',
    fontSize: 24,
    fontWeight: 'bold' as const,
    marginBottom: 4,
  },
  subtitle: {
    color: '#FF8888',
    fontSize: 14,
    marginBottom: 24,
  },
  section: {
    marginBottom: 16,
    backgroundColor: '#2a0000',
    borderRadius: 8,
    padding: 12,
  },
  label: {
    color: '#FF8888',
    fontSize: 12,
    fontWeight: 'bold' as const,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  },
  value: {
    color: '#FFAAAA',
    fontSize: 14,
    fontFamily: 'monospace' as const,
  },
  errorText: {
    color: '#FFCCCC',
    fontSize: 15,
    fontFamily: 'monospace' as const,
  },
  stackText: {
    color: '#DDAAAA',
    fontSize: 11,
    fontFamily: 'monospace' as const,
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#FF4444',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center' as const,
    marginTop: 8,
    marginBottom: 40,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
});
