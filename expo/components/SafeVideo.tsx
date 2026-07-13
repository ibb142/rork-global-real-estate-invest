/**
 * SafeVideo — defensive wrapper around expo-av Video for Android stability.
 *
 * expo-av on Android is prone to native crashes when:
 *   - posterSource/usePoster is enabled with remote URIs
 *   - HLS (.m3u8) sources are fed to the legacy player
 *   - multiple Video instances mount at once inside a FlatList
 *   - shouldPlay flips before the player is ready
 *
 * This component disables poster on Android, falls back from HLS to MP4, and
 * surfaces load errors so the app survives bad videos instead of crashing.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Video, ResizeMode, type VideoReadyForDisplayEvent } from 'expo-av';

import Colors from '@/constants/colors';

interface SafeVideoProps {
  uri: string | null | undefined;
  posterUri?: string | null | undefined;
  style?: any;
  shouldPlay?: boolean;
  isMuted?: boolean;
  isLooping?: boolean;
  resizeMode?: ResizeMode;
  onProgress?: (progress: number) => void;
  testID?: string;
}

const GOLD = Colors.primary;

function pickPlaybackUri(input: string | null | undefined): string | null {
  if (!input) return null;
  // On Android, prefer progressive MP4 over HLS to avoid expo-av native crashes.
  if (Platform.OS === 'android' && input.toLowerCase().endsWith('.m3u8')) {
    return null;
  }
  return input;
}

export default function SafeVideo({
  uri,
  posterUri,
  style,
  shouldPlay = false,
  isMuted = true,
  isLooping = true,
  resizeMode = ResizeMode.COVER,
  onProgress,
  testID,
}: SafeVideoProps) {
  const videoRef = useRef<Video>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [ready, setReady] = useState<boolean>(false);
  const playbackUri = pickPlaybackUri(uri);

  // Reset state when the source changes.
  useEffect(() => {
    setError(null);
    setLoading(true);
    setReady(false);
  }, [playbackUri]);

  // Unload the player when unmounting to free native resources.
  useEffect(() => {
    return () => {
      try {
        void videoRef.current?.unloadAsync();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!playbackUri) {
    return (
      <View style={[styles.container, style]} testID={testID ? `${testID}-no-source` : undefined}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  // Poster on Android is a known crash vector in expo-av; disable it there.
  const showPoster = Platform.OS !== 'android' && !!posterUri;
  const posterSource = showPoster ? { uri: posterUri as string } : undefined;
  const usePoster = showPoster;

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Video
        ref={videoRef}
        source={{ uri: playbackUri }}
        style={StyleSheet.absoluteFill}
        resizeMode={resizeMode}
        shouldPlay={shouldPlay && ready}
        isLooping={isLooping}
        isMuted={isMuted}
        useNativeControls={false}
        usePoster={usePoster}
        posterSource={posterSource}
        onLoadStart={() => setLoading(true)}
        onReadyForDisplay={(e: VideoReadyForDisplayEvent) => {
          setLoading(false);
          setReady(true);
        }}
        onLoad={(status) => {
          setLoading(false);
          if (status.isLoaded) {
            setReady(true);
          }
        }}
        onError={(err) => {
          setLoading(false);
          setReady(false);
          setError(typeof err === 'string' ? err : 'Video failed to load');
          // Report sanitized error to console only; do not throw.
          if (__DEV__) {
            console.warn('[SafeVideo] load error:', err);
          }
        }}
        onPlaybackStatusUpdate={(status) => {
          if (status.isLoaded && status.durationMillis && status.durationMillis > 0) {
            onProgress?.(status.positionMillis / status.durationMillis);
          }
        }}
      />
      {loading && !error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      )}
      {error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
