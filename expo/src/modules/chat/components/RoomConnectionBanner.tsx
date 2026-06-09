import React, { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import type { RoomSyncPhase } from '../services/roomStateManager';

type RoomConnectionBannerProps = {
  phase: RoomSyncPhase;
  onReconnect?: () => void;
};

type BannerConfig = {
  visible: boolean;
  label: string;
  accent: string;
  background: string;
  icon: 'wifi' | 'wifi-off';
};

function getBannerConfig(phase: RoomSyncPhase, showSuccess: boolean): BannerConfig {
  if (showSuccess && (phase === 'shared_live' || phase === 'shared_alternate' || phase === 'shared_snapshot')) {
    return {
      visible: true,
      label: 'Connected — shared sync active',
      accent: Colors.success,
      background: 'rgba(34,197,94,0.08)',
      icon: 'wifi',
    };
  }

  switch (phase) {
    case 'initializing':
    case 'detecting':
      return {
        visible: true,
        label: 'Connecting to room…',
        accent: Colors.warning,
        background: 'rgba(245,158,11,0.08)',
        icon: 'wifi',
      };
    case 'error':
      return {
        visible: true,
        label: 'Room connection failed',
        accent: '#ef4444',
        background: 'rgba(239,68,68,0.08)',
        icon: 'wifi-off',
      };
    case 'local_fallback':
      return {
        visible: true,
        label: 'Local only — shared sync unavailable',
        accent: Colors.warning,
        background: 'rgba(245,158,11,0.06)',
        icon: 'wifi-off',
      };
    case 'shared_polling':
      return {
        visible: true,
        label: 'Shared sync (polling)',
        accent: Colors.info,
        background: 'rgba(59,130,246,0.06)',
        icon: 'wifi',
      };
    case 'shared_live':
    case 'shared_alternate':
    case 'shared_snapshot':
    default:
      return {
        visible: false,
        label: '',
        accent: Colors.success,
        background: 'transparent',
        icon: 'wifi',
      };
  }
}

function isSharedLivePhase(p: RoomSyncPhase): boolean {
  return p === 'shared_live' || p === 'shared_alternate' || p === 'shared_snapshot';
}

function RoomConnectionBannerInner({ phase, onReconnect }: RoomConnectionBannerProps) {
  const [showSuccess, setShowSuccess] = React.useState(false);
  const prevPhaseRef = useRef(phase);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wasNonShared = !isSharedLivePhase(prevPhaseRef.current);
    const isNowShared = isSharedLivePhase(phase);
    prevPhaseRef.current = phase;

    if (wasNonShared && isNowShared) {
      setShowSuccess(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
        successTimerRef.current = null;
      }, 2500);
    }

    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, [phase]);

  const config = getBannerConfig(phase, showSuccess);
  const slideAnim = useRef(new Animated.Value(config.visible ? 1 : 0)).current;
  const prevVisibleRef = useRef(config.visible);

  useEffect(() => {
    if (config.visible !== prevVisibleRef.current) {
      prevVisibleRef.current = config.visible;
      Animated.timing(slideAnim, {
        toValue: config.visible ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [config.visible, slideAnim]);

  if (!config.visible) return null;

  const handleReconnect = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReconnect?.();
  };

  const IconComponent = config.icon === 'wifi-off' ? WifiOff : Wifi;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: config.background, opacity: slideAnim },
      ]}
      testID="chat-room-connection-banner"
    >
      <View style={[styles.dot, { backgroundColor: config.accent }]} />
      <IconComponent size={14} color={config.accent} />
      <Text style={[styles.label, { color: config.accent }]} numberOfLines={1}>
        {config.label}
      </Text>
      {(phase === 'error' || phase === 'local_fallback') && onReconnect ? (
        <Pressable
          style={({ pressed }) => [styles.reconnectButton, pressed ? styles.pressed : null]}
          onPress={handleReconnect}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="chat-room-connection-reconnect"
        >
          <RefreshCw size={12} color={config.accent} />
          <Text style={[styles.reconnectText, { color: config.accent }]}>Retry</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export const RoomConnectionBanner = memo(RoomConnectionBannerInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  reconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  reconnectText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  pressed: {
    opacity: 0.7,
  },
});
