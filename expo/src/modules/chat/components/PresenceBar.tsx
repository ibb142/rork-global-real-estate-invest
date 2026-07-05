import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { PresenceMember } from '../hooks/useRoomPresence';

type PresenceBarProps = {
  members: PresenceMember[];
  currentUserId: string;
  presenceLabel: string;
};

function PresenceBarInner({ members, currentUserId, presenceLabel }: PresenceBarProps) {
  const otherMembers = members.filter((m) => m.userId !== currentUserId);
  if (otherMembers.length === 0) return null;

  return (
    <View style={styles.container} testID="chat-presence-bar">
      <Users size={13} color={Colors.success} />
      <View style={styles.dotRow}>
        {otherMembers.slice(0, 5).map((member) => (
          <View key={member.userId} style={styles.dot} />
        ))}
        {otherMembers.length > 5 ? (
          <Text style={styles.overflow}>+{otherMembers.length - 5}</Text>
        ) : null}
      </View>
      <Text style={styles.label} numberOfLines={1}>{presenceLabel}</Text>
    </View>
  );
}

export const PresenceBar = memo(PresenceBarInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(34,197,94,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,197,94,0.1)',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  overflow: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '700' as const,
    marginLeft: 2,
  },
  label: {
    flex: 1,
    color: Colors.success,
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
