/**
 * ReelErrorBoundary — per-reel crash isolation.
 *
 * Wraps each ReelVideoPlayer so a native crash in one video player
 * (bad codec, corrupt segment, OOM) does not bring down the entire
 * feed. The boundary catches render errors and shows a retry button
 * with a poster thumbnail so the user can continue scrolling.
 */
import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RefreshCw, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface Props {
  children: ReactNode;
  posterUri?: string | null;
  videoId: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

const MAX_RETRIES = 3;

export default class ReelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorCount: 0 };

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true, errorCount: 0 };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) {
      console.warn('[ReelErrorBoundary] caught error for reel:', this.props.videoId, error.message);
    }
    this.setState((prev) => ({ errorCount: prev.errorCount + 1 }));
  }

  handleRetry = () => {
    if (this.state.errorCount >= MAX_RETRIES) {
      return;
    }
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const exhausted = this.state.errorCount >= MAX_RETRIES;
      return (
        <View style={styles.container}>
          {this.props.posterUri ? (
            <View style={StyleSheet.absoluteFill}>
              <View style={[styles.posterFallback, { backgroundColor: '#111' }]} />
            </View>
          ) : null}
          <View style={styles.content}>
            <AlertCircle size={40} color={Colors.textSecondary} />
            <Text style={styles.title}>
              {exhausted ? 'Video unavailable' : 'Playback error'}
            </Text>
            <Text style={styles.subtitle}>
              {exhausted
                ? 'This video could not be played after multiple attempts.'
                : 'Tap to retry or scroll to the next video.'}
            </Text>
            {!exhausted && (
              <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry} activeOpacity={0.8}>
                <RefreshCw size={16} color="#000" />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            )}
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  posterFallback: {
    flex: 1,
    opacity: 0.3,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 10,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 14,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    marginTop: 18,
  },
  retryText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700' as const,
  },
});
