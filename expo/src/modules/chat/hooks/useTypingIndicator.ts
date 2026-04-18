import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const activeTypingTeardowns = new Set<string>();

type TypingUser = {
  userId: string;
  displayName?: string | null;
  lastTypedAt: number;
};

type UseTypingIndicatorOptions = {
  conversationId: string;
  currentUserId: string;
  enabled?: boolean;
  debounceMs?: number;
  expiryMs?: number;
};

type UseTypingIndicatorResult = {
  typingUsers: TypingUser[];
  isAnyoneTyping: boolean;
  typingLabel: string;
  broadcastTyping: () => void;
  stopTyping: () => void;
};

const TYPING_DEBOUNCE_MS = 1200;
const TYPING_EXPIRY_MS = 4000;
const TYPING_CLEANUP_INTERVAL_MS = 2000;

export function useTypingIndicator({
  conversationId,
  currentUserId,
  enabled = true,
  debounceMs = TYPING_DEBOUNCE_MS,
  expiryMs = TYPING_EXPIRY_MS,
}: UseTypingIndicatorOptions): UseTypingIndicatorResult {
  const [remoteTypingMap, setRemoteTypingMap] = useState<Map<string, TypingUser>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcastRef = useRef<number>(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupStartedRef = useRef<boolean>(false);
  const channelClosedRef = useRef<boolean>(false);
  const stableConversationId = useMemo(() => (typeof conversationId === 'string' ? conversationId.trim() : ''), [conversationId]);
  const stableCurrentUserId = useMemo(() => (typeof currentUserId === 'string' ? currentUserId.trim() : ''), [currentUserId]);

  useEffect(() => {
    if (!enabled || !stableConversationId || !stableCurrentUserId) {
      return;
    }

    cleanupStartedRef.current = false;
    channelClosedRef.current = false;

    const channelName = `typing:${stableConversationId}:${stableCurrentUserId}`;
    console.log('[useTypingIndicator] Joining channel:', channelName);

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

      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
        cleanupIntervalRef.current = null;
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setRemoteTypingMap(new Map());

      if (!activeChannel) {
        return;
      }

      console.log('[useTypingIndicator] Closing channel:', channelName);
      if (activeTypingTeardowns.has(channelName)) {
        console.log('[useTypingIndicator] Typing teardown already in progress:', channelName);
        return;
      }

      activeTypingTeardowns.add(channelName);
      setTimeout(() => {
        void (async () => {
          try {
            await supabase.removeChannel(activeChannel as never);
          } catch (error) {
            console.log('[useTypingIndicator] Typing teardown note:', error instanceof Error ? error.message : 'unknown');
          } finally {
            activeTypingTeardowns.delete(channelName);
          }
        })();
      }, 0);
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        if (channelClosedRef.current) {
          return;
        }

        const state = channel.presenceState<{ typing: boolean; displayName?: string }>();
        const now = Date.now();
        const nextMap = new Map<string, TypingUser>();

        for (const [userId, presences] of Object.entries(state)) {
          if (userId === stableCurrentUserId) continue;
          const latestPresence = Array.isArray(presences) ? presences[presences.length - 1] : null;
          if (latestPresence && latestPresence.typing) {
            nextMap.set(userId, {
              userId,
              displayName: latestPresence.displayName ?? null,
              lastTypedAt: now,
            });
          }
        }

        setRemoteTypingMap(nextMap);
      })
      .subscribe((status) => {
        console.log('[useTypingIndicator] Channel status:', status);
        if (status === 'CLOSED') {
          channelClosedRef.current = true;
        }
      });

    channelRef.current = channel;

    cleanupIntervalRef.current = setInterval(() => {
      const now = Date.now();
      setRemoteTypingMap((prev) => {
        let changed = false;
        const next = new Map<string, TypingUser>();
        for (const [key, user] of prev.entries()) {
          if (now - user.lastTypedAt < expiryMs) {
            next.set(key, user);
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, TYPING_CLEANUP_INTERVAL_MS);

    return () => {
      console.log('[useTypingIndicator] Leaving channel:', channelName);
      safeCleanup();
    };
  }, [stableConversationId, stableCurrentUserId, enabled, expiryMs]);

  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastBroadcastRef.current < debounceMs) return;
    lastBroadcastRef.current = now;

    const channel = channelRef.current;
    if (!channel || channelClosedRef.current) return;

    void channel.track({ typing: true });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      if (channelClosedRef.current) {
        return;
      }
      void channel.track({ typing: false });
    }, expiryMs);
  }, [debounceMs, expiryMs]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastBroadcastRef.current = 0;

    const channel = channelRef.current;
    if (!channel || channelClosedRef.current) return;
    void channel.track({ typing: false });
  }, []);

  const typingUsers = useMemo(() => {
    return Array.from(remoteTypingMap.values());
  }, [remoteTypingMap]);

  const isAnyoneTyping = typingUsers.length > 0;

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return '';
    if (typingUsers.length === 1) {
      const name = typingUsers[0]?.displayName ?? 'Someone';
      return `${name} is typing…`;
    }
    if (typingUsers.length === 2) {
      const a = typingUsers[0]?.displayName ?? 'Someone';
      const b = typingUsers[1]?.displayName ?? 'someone';
      return `${a} and ${b} are typing…`;
    }
    return `${typingUsers.length} people are typing…`;
  }, [typingUsers]);

  return {
    typingUsers,
    isAnyoneTyping,
    typingLabel,
    broadcastTyping,
    stopTyping,
  };
}
