import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatService } from '../services/chatService';
import type { ChatMessage } from '../types/chat';

export const getChatMessagesQueryKey = (conversationId: string) => ['chat-messages', conversationId] as const;

const MESSAGES_PAGE_SIZE = 50;

function deduplicateMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Map<string, ChatMessage>();

  for (const message of messages) {
    const existing = seen.get(message.id);
    if (!existing) {
      seen.set(message.id, message);
      continue;
    }

    if (existing.optimistic && !message.optimistic) {
      seen.set(message.id, message);
      continue;
    }

    if (existing.sendStatus === 'sending' && message.sendStatus !== 'sending') {
      seen.set(message.id, message);
    }
  }

  return Array.from(seen.values()).sort((left, right) => {
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

export const useChatMessages = (conversationId: string) => {
  const queryClient = useQueryClient();
  const normalizedConversationId = useMemo(() => (typeof conversationId === 'string' ? conversationId.trim() : ''), [conversationId]);
  const queryKey = useMemo(() => getChatMessagesQueryKey(normalizedConversationId), [normalizedConversationId]);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [isLoadingOlder, setIsLoadingOlder] = useState<boolean>(false);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean>(true);
  const oldestTimestampRef = useRef<string | null>(null);

  const messagesQuery = useQuery<ChatMessage[], Error>({
    queryKey,
    queryFn: async () => {
      console.log('[useChatMessages] Fetching messages for:', normalizedConversationId);
      const fetched = await chatService.listMessages(normalizedConversationId);

      if (fetched.length > 0) {
        const sorted = [...fetched].sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        oldestTimestampRef.current = sorted[0]?.createdAt ?? null;
      }

      const current = queryClient.getQueryData<ChatMessage[]>(queryKey) ?? [];
      const optimisticMessages = current.filter((m) => m.optimistic);
      if (optimisticMessages.length === 0) {
        return fetched;
      }

      return deduplicateMessages([...fetched, ...optimisticMessages]);
    },
    enabled: normalizedConversationId.length > 0,
  });

  useEffect(() => {
    setOlderMessages([]);
    setHasMoreOlder(true);
    oldestTimestampRef.current = null;
  }, [normalizedConversationId]);

  useEffect(() => {
    if (!normalizedConversationId) {
      return;
    }

    let isActive = true;

    console.log('[useChatMessages] Subscribing to conversation:', normalizedConversationId);
    const unsubscribe = chatService.subscribeToMessages(normalizedConversationId, (message) => {
      if (!isActive || !message.id) {
        return;
      }

      queryClient.setQueryData<ChatMessage[]>(queryKey, (currentMessages) => {
        const existingMessages = currentMessages ?? [];
        if (existingMessages.some((item) => item.id === message.id && !item.optimistic)) {
          return existingMessages;
        }

        const withoutOptimisticDupe = existingMessages.filter(
          (item) => !(item.optimistic && item.text === message.text && item.senderId === message.senderId),
        );

        return deduplicateMessages([...withoutOptimisticDupe, message]);
      });
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [normalizedConversationId, queryClient, queryKey]);

  const loadingOlderGuardRef = useRef<boolean>(false);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderGuardRef.current || isLoadingOlder || !hasMoreOlder || !normalizedConversationId) return;

    loadingOlderGuardRef.current = true;
    setIsLoadingOlder(true);
    console.log('[useChatMessages] Loading older messages before:', oldestTimestampRef.current);

    try {
      const allMessages = await chatService.listMessages(normalizedConversationId);
      const currentOldest = oldestTimestampRef.current;

      if (!currentOldest) {
        setHasMoreOlder(false);
        return;
      }

      const olderBatch = allMessages.filter(
        (m) => new Date(m.createdAt).getTime() < new Date(currentOldest).getTime(),
      );

      if (olderBatch.length === 0) {
        console.log('[useChatMessages] No older messages found');
        setHasMoreOlder(false);
      } else {
        const sorted = [...olderBatch].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        oldestTimestampRef.current = sorted[0]?.createdAt ?? currentOldest;

        setOlderMessages((prev) => {
          const combined = [...sorted, ...prev];
          return deduplicateMessages(combined);
        });

        if (olderBatch.length < MESSAGES_PAGE_SIZE) {
          setHasMoreOlder(false);
        }
      }
    } catch (error) {
      console.log('[useChatMessages] Load older failed:', (error as Error)?.message ?? 'Unknown');
    } finally {
      setIsLoadingOlder(false);
      loadingOlderGuardRef.current = false;
    }
  }, [isLoadingOlder, hasMoreOlder, normalizedConversationId]);

  const clearFailedMessages = useCallback(() => {
    queryClient.setQueryData<ChatMessage[]>(queryKey, (current) => {
      return (current ?? []).filter((m) => m.sendStatus !== 'failed');
    });
  }, [queryClient, queryKey]);

  const dedupedMessages = useMemo(() => {
    const base = messagesQuery.data ?? [];
    if (olderMessages.length === 0) {
      return deduplicateMessages(base);
    }
    return deduplicateMessages([...olderMessages, ...base]);
  }, [messagesQuery.data, olderMessages]);

  return {
    messages: dedupedMessages,
    loading: messagesQuery.isPending,
    error: messagesQuery.error,
    refetch: messagesQuery.refetch,
    isRefreshing: messagesQuery.isRefetching,
    clearFailedMessages,
    loadOlderMessages,
    isLoadingOlder,
    hasMoreOlder,
  };
};
