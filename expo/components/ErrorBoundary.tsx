/**
 * =============================================================================
 * ERROR BOUNDARY COMPONENT - components/ErrorBoundary.tsx
 * =============================================================================
 * 
 * React Error Boundary for catching and handling JavaScript errors in the
 * component tree. Prevents the entire app from crashing on errors.
 * 
 * FEATURES:
 * ---------
 * - Catches errors in child component tree
 * - Shows user-friendly error message
 * - Displays error details in development mode (__DEV__)
 * - Provides "Try Again" button to reset and retry
 * - Supports custom fallback UI via props
 * 
 * PROPS:
 * ------
 * - children: ReactNode - Components to wrap
 * - fallback?: ReactNode - Custom UI to show on error (optional)
 * 
 * USAGE:
 * ------
 * // Wrap your app or sections of the app
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * 
 * // With custom fallback
 * <ErrorBoundary fallback={<CustomErrorScreen />}>
 *   <YourComponent />
 * </ErrorBoundary>
 * 
 * LOGGING:
 * --------
 * Errors are logged to console with '[ErrorBoundary]' prefix:
 * - Error message
 * - Component stack trace (for debugging)
 * 
 * @see app/_layout.tsx - Used at root level
 * =============================================================================
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error.message);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <AlertTriangle size={48} color={Colors.error} />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              We are sorry, but something unexpected happened. Please try again.
            </Text>
            
            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorDetails} showsVerticalScrollIndicator={false}>
                <Text style={styles.errorText}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.stackText}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
              <RefreshCw size={20} color={Colors.black} />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorDetails: {
    maxHeight: 150,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    fontFamily: 'monospace',
  },
  stackText: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontFamily: 'monospace',
    marginTop: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    gap: 8,
  },
  retryText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.black,
  },
});

export default ErrorBoundary;
