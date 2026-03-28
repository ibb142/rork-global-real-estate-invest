import { Platform } from 'react-native';

export type CachePolicy = 'memory-disk' | 'memory' | 'disk' | 'none';

export const IMAGE_CACHE_CONFIG = {
  defaultPolicy: 'memory-disk' as CachePolicy,
  maxMemoryCacheMB: 100,
  maxDiskCacheMB: 500,
  placeholderColor: '#1A1A1A',
  transitionDuration: 200,
};

export function getImageCachePolicy(priority: 'high' | 'medium' | 'low' = 'medium'): CachePolicy {
  if (Platform.OS === 'web') return 'none';
  switch (priority) {
    case 'high': return 'memory-disk';
    case 'medium': return 'disk';
    case 'low': return 'memory';
    default: return 'memory-disk';
  }
}

export function getOptimizedImageProps(uri: string, options?: { width?: number; height?: number; priority?: 'high' | 'medium' | 'low' }) {
  return {
    source: { uri },
    cachePolicy: getImageCachePolicy(options?.priority ?? 'medium'),
    contentFit: 'cover' as const,
    transition: IMAGE_CACHE_CONFIG.transitionDuration,
    placeholder: IMAGE_CACHE_CONFIG.placeholderColor,
    recyclingKey: uri,
    ...(options?.width ? { style: { width: options.width, height: options.height ?? options.width } } : {}),
  };
}

console.log('[ImageCache] Config loaded — maxMemory:', IMAGE_CACHE_CONFIG.maxMemoryCacheMB, 'MB');
