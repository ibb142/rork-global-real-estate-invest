import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Bot, Loader, Sparkles, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { RoomCapabilityResolution, RoomAIAvailabilityIndicator } from '../services/roomCapabilityResolver';
import { CapabilityPillRow } from './CapabilityPill';

type RoomHeaderProps = {
  title: string;
  resolution: RoomCapabilityResolution;
  isLoading: boolean;
};

function AIIndicatorBadge({ indicator }: { indicator: RoomAIAvailabilityIndicator }) {
  if (indicator.state === 'available' && indicator.isLoading) {
    return (
      <View style={[styles.aiBadge, styles.aiBadgeActive]} testID={indicator.testID}>
        <ActivityIndicator size="small" color={Colors.success} />
        <Text style={[styles.aiBadgeText, { color: Colors.success }]}>{indicator.label}</Text>
      </View>
    );
  }

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
      <Loader size={12} color={Colors.textTertiary} />
      <Text style={[styles.aiBadgeText, { color: Colors.textTertiary }]}>{indicator.label}</Text>
    </View>
  );
}

function RoomHeaderInner({ title, resolution, isLoading }: RoomHeaderProps) {
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
        {isLoading ? (
          <View style={styles.subtitleLoading}>
            <ActivityIndicator size="small" color={Colors.textTertiary} />
            <Text style={styles.subtitleLoadingText} numberOfLines={1}>Connecting…</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.headerSubtitle} numberOfLines={2} ellipsizeMode="tail">{resolution.subtitle}</Text>
      <CapabilityPillRow capabilities={resolution.capabilities.slice(0, 3)} />
    </View>
  );

}

export const RoomHeader = React.memo(RoomHeaderInner);

const styles = StyleSheet.create({
  headerCard: {
    marginHorizontal: 12,
    marginTop: 2,
    marginBottom: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 2,
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
  aiBadgeActive: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.25)',
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
    fontSize: 14,
    fontWeight: '800' as const,
  },
  headerSubtitle: {
    color: '#E0E5EC',
    fontSize: 10,
    lineHeight: 13,
  },
  subtitleLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleLoadingText: {
    color: Colors.textTertiary,
    fontSize: 9,
  },
  summaryText: {
    color: '#B2B8C2',
    fontSize: 8,
    fontWeight: '600' as const,
  },
});
