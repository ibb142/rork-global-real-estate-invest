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
          <Bot size={14} color={Colors.black} />
          <Text style={styles.roomBadgeText}>{resolution.badgeText}</Text>
        </View>
        <AIIndicatorBadge indicator={resolution.aiIndicator} />
      </View>

      <Text style={styles.headerTitle}>{title}</Text>

      {isLoading ? (
        <View style={styles.subtitleLoading}>
          <ActivityIndicator size="small" color={Colors.textTertiary} />
          <Text style={styles.subtitleLoadingText}>Checking room backend…</Text>
        </View>
      ) : (
        <Text style={styles.headerSubtitle}>{resolution.subtitle}</Text>
      )}

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>{resolution.summary}</Text>
      </View>

      <CapabilityPillRow capabilities={resolution.capabilities} />
    </View>
  );
}

export const RoomHeader = React.memo(RoomHeaderInner);

const styles = StyleSheet.create({
  headerCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    padding: 18,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
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
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roomBadgeText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
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
    fontSize: 11,
    fontWeight: '600' as const,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800' as const,
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  subtitleLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitleLoadingText: {
    color: Colors.textTertiary,
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
