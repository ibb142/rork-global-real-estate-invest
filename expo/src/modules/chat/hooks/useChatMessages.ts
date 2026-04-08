import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatService } from '../services/chatService';
import type { ChatMessage } from '../types/chat';

export const getChatMessagesQueryKey = (conversationId: string) => ['chat-messages', conversationId] as const;

export const useChatMessages = (conversationId: string) => {
  const queryClient = useQueryClient();
  const normalizedConversationId = useMemo(() => conversationId.trim(), [conversationId]);
  const queryKey = useMemo(() => getChatMessagesQueryKey(normalizedConversationId), [normalizedConversationId]);

  const messagesQuery = useQuery<ChatMessage[], Error>({
    queryKey,
    queryFn: async () => {
      console.log('[useChatMessages] Fetching messages for:', normalizedConversationId);
      return chatService.listMessages(normalizedConversationId);
    },
    enabled: normalizedConversationId.length > 0,
  });

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
        if (existingMessages.some((item) => item.id === message.id)) {
          return existingMessages;
        }

        return [...existingMessages, message].sort((left, right) => {
          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        });
      });
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [normalizedConversationId, queryClient, queryKey]);

  return {
    messages: messagesQuery.data ?? [],
    loading: messagesQuery.isPending,
    error: messagesQuery.error,
    refetch: messagesQuery.refetch,
    isRefreshing: messagesQuery.isRefetching,
  };
};
