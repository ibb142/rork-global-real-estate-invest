import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bot, Sparkles, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { RoomCapabilityResolution, RoomAIAvailabilityIndicator } from '../services/roomCapabilityResolver';
import { CapabilityPillRow } from './CapabilityPill';

type RoomHeaderProps = {
  title: string;
  resolution: RoomCapabilityResolution;
};

function AIIndicatorBadge({ indicator }: { indicator: RoomAIAvailabilityIndicator }) {
  if (indicator.state === 'available') {
    return (
      <View style={[styles.aiBadge, styles.aiBadgeReady]} testID={indicator.testID}>
        <Sparkles size={12} color={Colors.success} />
        <Text style={[styles.aiBadgeText, { color: Colors.success }]}>{indicator.label}</Text>
      </View>
    );
  }

  if (indicator.state === 'degraded') {
    return (
      <View style={[styles.aiBadge, styles.aiBadgeDegraded]} testID={indicator.testID}>
        <AlertTriangle size={12} color={Colors.warning} />
        <Text style={[styles.aiBadgeText, { color: Colors.warning }]}>{indicator.label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.aiBadge, styles.aiBadgeOff]} testID={indicator.testID}>
      <Bot size={12} color={Colors.textTertiary} />
      <Text style={[styles.aiBadgeText, { color: Colors.textTertiary }]}>{indicator.label}</Text>
    </View>
  );
}

function RoomHeaderInner({ title, resolution }: RoomHeaderProps) {
  return (
    <View style={styles.headerCard} testID="ivx-owner-chat-header">
      <View style={styles.topRow}>
        <View style={styles.roomBadge}>
          <Bot size={12} color={Colors.black} />
          <Text style={styles.roomBadgeText}>{resolution.badgeText}</Text>
        </View>
        <AIIndicatorBadge indicator={resolution.aiIndicator} />
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      </View>

      <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">{resolution.subtitle}</Text>
      <CapabilityPillRow capabilities={resolution.capabilities.slice(0, 3)} />
    </View>
  );

}

export const RoomHeader = React.memo(RoomHeaderInner);

const styles = StyleSheet.create({
  headerCard: {
    marginHorizontal: 10,
    marginTop: 0,
    marginBottom: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  roomBadgeText: {
    color: Colors.black,
    fontSize: 6,
    fontWeight: '700' as const,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
  },
  aiBadgeReady: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.2)',
  },
  aiBadgeDegraded: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.2)',
  },
  aiBadgeOff: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aiBadgeText: {
    fontSize: 6,
    fontWeight: '600' as const,
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  headerSubtitle: {
    color: '#E0E5EC',
    fontSize: 9,
    lineHeight: 12,
  },
});
