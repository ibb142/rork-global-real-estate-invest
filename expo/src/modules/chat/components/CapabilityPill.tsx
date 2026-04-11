import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { CapabilityState } from '../types/chat';
import type { RoomCapabilityDescriptor } from '../services/roomCapabilityResolver';

type CapabilityPillProps = {
  capability: RoomCapabilityDescriptor;
};

const STATE_CONFIG: Record<CapabilityState, {
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}> = {
  available: {
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.3)',
    text: Colors.success,
    iconColor: Colors.success,
  },
  degraded: {
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
    text: Colors.warning,
    iconColor: Colors.warning,
  },
  unavailable: {
    bg: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
    text: Colors.textTertiary,
    iconColor: Colors.textTertiary,
  },
};

function StateIcon({ state, color }: { state: CapabilityState; color: string }) {
  if (state === 'available') {
    return <CheckCircle size={12} color={color} />;
  }
  if (state === 'degraded') {
    return <AlertTriangle size={12} color={color} />;
  }
  return <XCircle size={12} color={color} />;
}

function CapabilityPillInner({ capability }: CapabilityPillProps) {
  const config = STATE_CONFIG[capability.state];
  const [showDetail, setShowDetail] = useState<boolean>(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handlePress = useCallback(() => {
    if (showDetail) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setShowDetail(false));
    } else {
      setShowDetail(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showDetail, fadeAnim]);

  return (
    <View testID={capability.testID}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.pill,
          {
            backgroundColor: config.bg,
            borderColor: config.border,
          },
        ]}
      >
        <StateIcon state={capability.state} color={config.iconColor} />
        <Text style={[styles.pillLabel, { color: config.text }]}>{capability.label}</Text>
      </Pressable>
      {showDetail ? (
        <Animated.View style={[styles.tooltip, { opacity: fadeAnim }]}>
          <Text style={styles.tooltipText}>{capability.detail}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export const CapabilityPill = React.memo(CapabilityPillInner);

type CapabilityPillRowProps = {
  capabilities: RoomCapabilityDescriptor[];
};

function CapabilityPillRowInner({ capabilities }: CapabilityPillRowProps) {
  return (
    <View style={styles.row} testID="chat-room-capability-pills">
      {capabilities.map((cap) => (
        <CapabilityPill key={cap.id} capability={cap} />
      ))}
    </View>
  );
}

export const CapabilityPillRow = React.memo(CapabilityPillRowInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  tooltip: {
    position: 'absolute',
    top: 30,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 10,
    padding: 10,
    minWidth: 180,
  },
  tooltipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
