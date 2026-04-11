import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PresenceMember = {
  userId: string;
  displayName?: string | null;
  joinedAt: number;
};

type UseRoomPresenceOptions = {
  conversationId: string;
  currentUserId: string;
  displayName?: string | null;
  enabled?: boolean;
};

type UseRoomPresenceResult = {
  members: PresenceMember[];
  onlineCount: number;
  presenceLabel: string;
};

export function useRoomPresence({
  conversationId,
  currentUserId,
  displayName,
  enabled = true,
}: UseRoomPresenceOptions): UseRoomPresenceResult {
  const [membersMap, setMembersMap] = useState<Map<string, PresenceMember>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stableConversationId = useMemo(() => conversationId.trim(), [conversationId]);
  const stableCurrentUserId = useMemo(() => currentUserId.trim(), [currentUserId]);

  useEffect(() => {
    if (!enabled || !stableConversationId || !stableCurrentUserId) {
      return;
    }

    const channelName = `presence:${stableConversationId}:${Date.now()}`;
    console.log('[useRoomPresence] Joining channel:', channelName);

    const channel = supabase.channel(channelName, {
      config: { presence: { key: stableCurrentUserId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ displayName?: string; joinedAt?: number }>();
        const now = Date.now();
        const nextMap = new Map<string, PresenceMember>();

        for (const [userId, presences] of Object.entries(state)) {
          const latestPresence = Array.isArray(presences) ? presences[presences.length - 1] : null;
          nextMap.set(userId, {
            userId,
            displayName: latestPresence?.displayName ?? null,
            joinedAt: latestPresence?.joinedAt ?? now,
          });
        }

        setMembersMap(nextMap);
      })
      .subscribe(async (status) => {
        console.log('[useRoomPresence] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          await channel.track({
            displayName: displayName ?? null,
            joinedAt: Date.now(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      console.log('[useRoomPresence] Leaving channel:', channelName);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setMembersMap(new Map());
    };
  }, [stableConversationId, stableCurrentUserId, displayName, enabled]);

  const members = useMemo(() => {
    return Array.from(membersMap.values());
  }, [membersMap]);

  const onlineCount = members.length;

  const presenceLabel = useMemo(() => {
    const otherCount = members.filter((m) => m.userId !== stableCurrentUserId).length;
    if (otherCount === 0) return 'Only you in this room';
    if (otherCount === 1) return '1 other online';
    return `${otherCount} others online`;
  }, [members, stableCurrentUserId]);

  return { members, onlineCount, presenceLabel };
}
