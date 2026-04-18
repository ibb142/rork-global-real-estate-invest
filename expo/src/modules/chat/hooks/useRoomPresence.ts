import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const activePresenceTeardowns = new Set<string>();

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
  const cleanupStartedRef = useRef<boolean>(false);
  const channelClosedRef = useRef<boolean>(false);
  const displayNameRef = useRef<string | null | undefined>(displayName);
  const stableConversationId = useMemo(() => (typeof conversationId === 'string' ? conversationId.trim() : ''), [conversationId]);
  const stableCurrentUserId = useMemo(() => (typeof currentUserId === 'string' ? currentUserId.trim() : ''), [currentUserId]);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  useEffect(() => {
    if (!enabled || !stableConversationId || !stableCurrentUserId) {
      return;
    }

    cleanupStartedRef.current = false;
    channelClosedRef.current = false;

    const channelName = `presence:${stableConversationId}:${stableCurrentUserId}`;
    console.log('[useRoomPresence] Joining channel:', channelName);

    const channel = supabase.channel(channelName, {
      config: { presence: { key: stableCurrentUserId } },
    });

    const safeCleanup = (): void => {
      if (cleanupStartedRef.current) {
        return;
      }

      cleanupStartedRef.current = true;
      const activeChannel = channelRef.current;
      channelRef.current = null;
      channelClosedRef.current = true;
      setMembersMap(new Map());

      if (!activeChannel) {
        return;
      }

      console.log('[useRoomPresence] Closing channel:', channelName);
      if (activePresenceTeardowns.has(channelName)) {
        console.log('[useRoomPresence] Presence teardown already in progress:', channelName);
        return;
      }

      activePresenceTeardowns.add(channelName);
      setTimeout(() => {
        void (async () => {
          try {
            await supabase.removeChannel(activeChannel as never);
          } catch (error) {
            console.log('[useRoomPresence] Presence teardown note:', error instanceof Error ? error.message : 'unknown');
          } finally {
            activePresenceTeardowns.delete(channelName);
          }
        })();
      }, 0);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        if (channelClosedRef.current) {
          return;
        }

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
        if (status === 'CLOSED') {
          channelClosedRef.current = true;
          return;
        }

        if (status === 'SUBSCRIBED' && !channelClosedRef.current) {
          await channel.track({
            displayName: displayNameRef.current ?? null,
            joinedAt: Date.now(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      console.log('[useRoomPresence] Leaving channel:', channelName);
      safeCleanup();
    };
  }, [stableConversationId, stableCurrentUserId, enabled]);

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
