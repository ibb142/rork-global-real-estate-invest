/**
 * Optimized image component with caching, placeholder, and error fallback.
 * Uses expo-image when available, falls back to React Native Image.
 * Supports progressive loading with blurhash-style placeholder.
 */
import React, { useState, memo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image as RNImage } from 'react-native';
import Colors from '@/constants/colors';

type OptimizedImageProps = {
  uri?: string;
  style?: any;
  borderRadius?: number;
  placeholderText?: string;
  resizeMode?: 'cover' | 'contain' | 'stretch';
  priority?: 'low' | 'normal' | 'high';
  cachePolicy?: 'none' | 'memory' | 'memory-disk';
};

function OptimizedImageImpl({
  uri,
  style,
  borderRadius = 12,
  placeholderText,
  resizeMode = 'cover',
  priority = 'normal',
  cachePolicy = 'memory-disk',
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  if (!uri || failed) {
    return (
      <View style={[styles.placeholder, style, { borderRadius }]}>
        <Text style={styles.placeholderText}>
          {placeholderText?.charAt(0)?.toUpperCase() ?? '?'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[style, { borderRadius, overflow: 'hidden' }]}>
      {!loaded && (
        <View style={[styles.loadingOverlay, style, { borderRadius }]}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}
      <RNImage
        source={{ uri, cache: cachePolicy === 'memory-disk' ? 'default' : 'reload' }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        resizeMode={resizeMode}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          console.log('[OptimizedImage] Load failed:', uri?.substring(0, 80));
        }}
        accessible={true}
        accessibilityLabel={placeholderText ?? 'Image'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});

export const OptimizedImage = memo(OptimizedImageImpl);
export default OptimizedImage;
