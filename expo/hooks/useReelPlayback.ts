/**
 * useReelPlayback — manages the active reel index, screen focus, and
 * the playback condition for the Instagram-style player lifecycle.
 *
 * Playback condition:
 *   shouldPlay = isScreenFocused && isAppForeground && isItemActive
 *
 * Only ONE reel may play at a time. The previous and next reels are
 * mounted (poster-only) but never play. All others are unmounted.
 */
import { useCallback, useRef } from 'react';
import { useState } from 'react';
import type { ViewToken } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppForeground } from './useAppForeground';

export interface ReelPlaybackState {
  activeIndex: number;
  isScreenFocused: boolean;
  isAppForeground: boolean;
  setActiveIndex: (index: number) => void;
  handleViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: { itemVisiblePercentThreshold: number };
  shouldPlay: (index: number) => boolean;
  shouldMount: (index: number, totalItems: number) => boolean;
}

export function useReelPlayback(): ReelPlaybackState {
  const isAppForeground = useAppForeground();
  const [isScreenFocused, setIsScreenFocused] = useState<boolean>(true);
  const [activeIndex, setActiveIndexState] = useState<number>(0);
  const activeIndexRef = useRef<number>(0);

  // Track screen focus via useFocusEffect — true when this screen is
  // the active route, false when the user navigates away.
  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => {
        setIsScreenFocused(false);
      };
    }, []),
  );

  const updateActiveIndex = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndexState(index);
  }, []);

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[] }) => {
      const first = info.viewableItems.find((v) => v.isViewable);
      if (first && typeof first.index === 'number') {
        updateActiveIndex(first.index);
      }
    },
    [updateActiveIndex],
  );

  // 80% visibility threshold — stricter than the old 60% to prevent
  // overlap during fast scroll where two players briefly play at once.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const shouldPlay = useCallback(
    (index: number): boolean => {
      if (!isScreenFocused) return false;
      if (!isAppForeground) return false;
      return index === activeIndexRef.current;
    },
    [isScreenFocused, isAppForeground],
  );

  /**
   * Only mount the previous, active, and next items (max 3).
   * All other items display poster/thumbnail only and their
   * video players are unmounted to free native resources.
   */
  const shouldMount = useCallback(
    (index: number, totalItems: number): boolean => {
      if (totalItems <= 3) return true;
      const current = activeIndexRef.current;
      return Math.abs(index - current) <= 1;
    },
    [],
  );

  return {
    activeIndex,
    isScreenFocused,
    isAppForeground,
    setActiveIndex: updateActiveIndex,
    handleViewableItemsChanged,
    viewabilityConfig,
    shouldPlay,
    shouldMount,
  };
}
