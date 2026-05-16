import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyToggle,
  loadConversationReactions,
  summarizeReactions,
  toggleReactionPersisted,
  type ConversationReactionsMap,
  type MessageReactionSummary,
} from '../services/messageReactions';

export type UseMessageReactionsResult = {
  toggleReaction: (messageId: string, emoji: string) => void;
  getReactionsFor: (messageId: string) => MessageReactionSummary[];
  reactionsMap: ConversationReactionsMap;
};

export function useMessageReactions(
  conversationId: string,
  currentUserId: string,
): UseMessageReactionsResult {
  const [reactionsMap, setReactionsMap] = useState<ConversationReactionsMap>({});
  const trimmedConversationId = conversationId.trim();
  const trimmedUserId = currentUserId.trim();
  const persistedQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    if (!trimmedConversationId) {
      setReactionsMap({});
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const loaded = await loadConversationReactions(trimmedConversationId);
      if (!cancelled) {
        setReactionsMap(loaded);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trimmedConversationId]);

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      if (!trimmedConversationId || !trimmedUserId || !messageId || !emoji) {
        return;
      }

      setReactionsMap((current) => applyToggle(current, messageId, emoji, trimmedUserId));

      persistedQueue.current = persistedQueue.current
        .catch(() => undefined)
        .then(() => toggleReactionPersisted(trimmedConversationId, messageId, emoji, trimmedUserId))
        .then((nextMap) => {
          setReactionsMap(nextMap);
        })
        .catch((error) => {
          console.log('[useMessageReactions] Persist failed:', error instanceof Error ? error.message : 'unknown');
        });
    },
    [trimmedConversationId, trimmedUserId],
  );

  const getReactionsFor = useCallback(
    (messageId: string) => summarizeReactions(reactionsMap[messageId], trimmedUserId),
    [reactionsMap, trimmedUserId],
  );

  return { toggleReaction, getReactionsFor, reactionsMap };
}
