import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, Animated, Platform, AppState } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/constants/colors';

const STORAGE_KEY = 'admin_feature_control_v1';
const MODULE_ID = 'floating_analytics';
const FEATURE_VISIBLE = 'fab-visible';
const FEATURE_PULSE = 'fab-pulse';
const FEATURE_NAVIGATE = 'fab-navigate';

export default function FloatingAnalyticsButton() {
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const [isVisible, setIsVisible] = useState(true);
  const [pulseEnabled, setPulseEnabled] = useState(true);
  const [navigateEnabled, setNavigateEnabled] = useState(true);

  const checkVisibility = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { state: Record<string, { enabled: boolean; features: Record<string, boolean> }> };
        const moduleState = parsed.state?.[MODULE_ID];
        if (moduleState) {
          const visible = moduleState.enabled && (moduleState.features?.[FEATURE_VISIBLE] ?? true);
          const pulse = moduleState.features?.[FEATURE_PULSE] ?? true;
          const navigate = moduleState.features?.[FEATURE_NAVIGATE] ?? true;
          setIsVisible(visible);
          setPulseEnabled(pulse);
          setNavigateEnabled(navigate);
          console.log('[FloatingAnalytics] Visible:', visible, 'Pulse:', pulse, 'Navigate:', navigate);
        }
      }
    } catch (err) {
      console.log('[FloatingAnalytics] Error reading feature state:', err);
    }
  }, []);

  useEffect(() => {
    void checkVisibility();

    const interval = setInterval(() => {
      void checkVisibility();
    }, 3000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkVisibility();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkVisibility]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.8,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, [pulseAnim, glowAnim]);

  const handlePress = () => {
    if (navigateEnabled) {
      console.log('[FloatingAnalytics] Navigating to analytics-report');
      router.push('/analytics-report');
    } else {
      console.log('[FloatingAnalytics] Navigation disabled by admin');
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: pulseEnabled ? pulseAnim : 1 }] },
      ]}
    >
      {pulseEnabled && <Animated.View style={[styles.glowRing, { opacity: glowAnim }]} />}
      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.8}
        testID="floating-analytics-button"
      >
        <BarChart3 size={22} color={Colors.black} strokeWidth={2.5} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 80 : 100,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});
