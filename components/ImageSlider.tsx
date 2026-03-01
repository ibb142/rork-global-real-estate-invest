/**
 * =============================================================================
 * IMAGE SLIDER COMPONENT - components/ImageSlider.tsx
 * =============================================================================
 * 
 * Horizontal swipeable image gallery with pagination indicators.
 * Used for property photos, carousels, and any multi-image displays.
 * 
 * FEATURES:
 * ---------
 * - Horizontal swipe navigation with paging
 * - Dot pagination indicators (bottom)
 * - Image counter badge (top-right: "1/5")
 * - Configurable height
 * - Touch callback for image press
 * - Smooth scroll animations
 * 
 * PROPS:
 * ------
 * - images: string[] - Array of image URLs to display
 * - height?: number - Height of slider (default: 280)
 * - showPagination?: boolean - Show dot indicators (default: true)
 * - onImagePress?: (index: number) => void - Callback when image is tapped
 * 
 * PERFORMANCE:
 * ------------
 * - Uses React.memo() to prevent unnecessary re-renders
 * - useCallback() for event handlers
 * - Throttled scroll events (16ms)
 * 
 * USAGE:
 * ------
 * import ImageSlider from '@/components/ImageSlider';
 * 
 * <ImageSlider 
 *   images={property.images} 
 *   height={240}
 *   onImagePress={(index) => openFullscreen(index)}
 * />
 * =============================================================================
 */

import React, { useState, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import Colors from '@/constants/colors';

interface ImageSliderProps {
  images: string[];
  height?: number;
  showPagination?: boolean;
  onImagePress?: (index: number) => void;
}

const ImageSlider = memo(function ImageSlider({
  images: imagesProp,
  height = 280,
  showPagination = true,
  onImagePress,
}: ImageSliderProps) {
  const images = Array.isArray(imagesProp) && imagesProp.length > 0 ? imagesProp : ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'];
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(contentOffsetX / screenWidth);
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < images.length) {
      setActiveIndex(newIndex);
    }
  }, [activeIndex, images.length, screenWidth]);

  const handleImagePress = useCallback((index: number) => {
    if (onImagePress) {
      onImagePress(index);
    }
  }, [onImagePress]);

  return (
    <View style={[styles.container, { height }]}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
      >
        {images.map((image, index) => (
          <TouchableOpacity
            key={index}
            activeOpacity={0.95}
            onPress={() => handleImagePress(index)}
            style={[styles.imageContainer, { width: screenWidth, height }]}
          >
            <Image
              source={{ uri: image }}
              style={styles.image}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {showPagination && images.length > 1 && (
        <View style={styles.pagination}>
          {images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.paginationDot,
                index === activeIndex && styles.paginationDotActive,
              ]}
            />
          ))}
        </View>
      )}

      {images.length > 1 && (
        <View style={styles.counter}>
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>
              {activeIndex + 1}/{images.length}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

export default ImageSlider;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: Colors.backgroundSecondary,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  paginationDotActive: {
    width: 20,
    backgroundColor: Colors.primary,
  },
  counter: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  counterBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600' as const,
  },
});
