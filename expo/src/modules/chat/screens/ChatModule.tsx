import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock3, Inbox, MessageSquareText, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import {
  buildRuntimeSignalsFromProbe,
  probeAIBackendHealth,
} from '../services/aiReplyService';
import {
  getChatConversationDisplayId,
  getChatConversationSubtitle,
  getChatConversationTitle,
  resolveChatActorId,
  resolveChatConversationId,
} from '../services/chatRooms';
import { loadInbox, markConversationAsRead, subscribeInbox } from '../services/ivxChat';
import { resolveRoomCapabilityState } from '../services/roomCapabilityResolver';
import { getCurrentChatRoomStatus, subscribeToChatRoomStatus } from '../services/supabaseChatProvider';
import { ChatScreen } from './ChatScreen';
import type { ChatConversation, ChatFileType, ChatRoomRuntimeSignals, ChatRoomStatus, InboxItem, UploadableFile } from '../types/chat';

type ChatModuleProps = {
  currentUserId: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  initialConversationId?: string;
  initialTitle?: string;
};

type InboxData = {
  conversations: ChatConversation[];
  status: ChatRoomStatus | null;
};

type MessagePayload = {
  text?: string;
  fileUrl?: string;
  fileType?: ChatFileType;
  upload?: UploadableFile;
};

const getChatInboxQueryKey = (currentUserId: string) => ['chat-inbox', currentUserId] as const;

function buildConversationLabel(conversationId: string): string {
  return conversationId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

function createFallbackConversation(conversationId: string, title?: string): ChatConversation {
  const normalizedConversationId = resolveChatConversationId(conversationId);
  const displayConversationId = getChatConversationDisplayId(conversationId) || normalizedConversationId;
  const resolvedTitle = getChatConversationTitle(normalizedConversationId, title);
  const resolvedSubtitle = getChatConversationSubtitle(normalizedConversationId, 'Supabase-backed room');

  return {
    id: normalizedConversationId,
    slug: displayConversationId,
    title: resolvedTitle || buildConversationLabel(displayConversationId) || IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: resolvedSubtitle,
    lastMessageText: null,
    lastMessageAt: null,
    unreadCount: 0,
  };
}

function mapInboxItemToConversation(item: InboxItem): ChatConversation {
  return {
    id: item.conversationId,
    slug: item.slug,
    title: item.title,
    subtitle: item.subtitle,
    lastMessageText: item.lastMessageText,
    lastMessageAt: item.lastMessageAt,
    unreadCount: item.unreadCount,
  };
}

function sortConversations(left: ChatConversation, right: ChatConversation): number {
  return new Date(right.lastMessageAt ?? 0).getTime() - new Date(left.lastMessageAt ?? 0).getTime();
}

function formatConversationTime(value?: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const isSameDay = now.toDateString() === date.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function getMessagePreview(text?: string, fileType?: ChatFileType): string {
  const trimmedText = text?.trim();
  if (trimmedText) {
    return trimmedText;
  }

  if (fileType === 'image') {
    return '[Image]';
  }

  if (fileType === 'video') {
    return '[Video]';
  }

  if (fileType === 'pdf') {
    return '[PDF]';
  }

  if (fileType === 'file') {
    return '[File]';
  }

  return 'Attachment';
}

function getStatusLabel(status: ChatRoomStatus | null): string {
  if (!status) {
    return 'Checking';
  }

  switch (status.storageMode) {
    case 'primary_supabase_tables':
      return 'Primary';
    case 'alternate_room_schema':
      return 'Shared fallback';
    case 'snapshot_storage':
      return 'Snapshot';
    case 'local_device_only':
      return 'Local';
    default:
      return 'Checking';
  }
}

function setInboxQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  updater: (current: InboxData | undefined) => InboxData,
): void {
  queryClient.setQueryData<InboxData>(getChatInboxQueryKey(userId), updater);
}

export function ChatModule({
  currentUserId,
  supabaseUrl,
  supabaseAnonKey,
  initialConversationId,
  initialTitle,
}: ChatModuleProps) {
  const queryClient = useQueryClient();
  const normalizedUserId = useMemo(() => {
    return resolveChatActorId(currentUserId, 'preview');
  }, [currentUserId]);
  const providedSupabaseUrl = useMemo(() => supabaseUrl?.trim() ?? '', [supabaseUrl]);
  const providedSupabaseAnonKey = useMemo(() => supabaseAnonKey?.trim() ?? '', [supabaseAnonKey]);
  const normalizedInitialConversationId = useMemo(() => {
    return resolveChatConversationId(initialConversationId?.trim() ?? '');
  }, [initialConversationId]);
  const initialConversation = useMemo(() => {
    if (!normalizedInitialConversationId) {
      return null;
    }

    return createFallbackConversation(normalizedInitialConversationId, initialTitle);
  }, [initialTitle, normalizedInitialConversationId]);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(initialConversation);
  const [selectedRoomStatus, setSelectedRoomStatus] = useState<ChatRoomStatus | null>(() => getCurrentChatRoomStatus());
  const [runtimeSignals, setRuntimeSignals] = useState<ChatRoomRuntimeSignals>({
    aiBackendHealth: 'inactive',
    knowledgeBackendHealth: 'inactive',
    ownerCommandAvailability: 'inactive',
    codeAwareServiceAvailability: 'inactive',
    aiResponseState: 'inactive',
  });
  const aiProbeRanRef = useRef(false);
  const selectedConversationId = selectedConversation?.id ?? '';

  useEffect(() => {
    if (!providedSupabaseUrl && !providedSupabaseAnonKey) {
      return;
    }

    console.log('[ChatModule] Explicit Supabase props received. Using shared app chat provider configuration.', {
      hasSupabaseUrl: providedSupabaseUrl.length > 0,
      hasSupabaseAnonKey: providedSupabaseAnonKey.length > 0,
    });
  }, [providedSupabaseAnonKey, providedSupabaseUrl]);

  const inboxQuery = useQuery<InboxData, Error>({
    queryKey: getChatInboxQueryKey(normalizedUserId),
    queryFn: async () => {
      console.log('[ChatModule] Loading inbox for user:', normalizedUserId);
      const inbox = await loadInbox(normalizedUserId);
      return {
        conversations: inbox.items.map(mapInboxItemToConversation).sort(sortConversations),
        status: inbox.status,
      };
    },
    enabled: normalizedUserId.length > 0,
  });

  const conversations = inboxQuery.data?.conversations ?? [];
  const inboxStatus = inboxQuery.data?.status ?? null;
  useEffect(() => {
    if (!aiProbeRanRef.current) {
      aiProbeRanRef.current = true;
      void (async () => {
        try {
          const health = await probeAIBackendHealth();
          setRuntimeSignals(buildRuntimeSignalsFromProbe(health));
          console.log('[ChatModule] AI probe result:', health);
        } catch (e) {
          console.log('[ChatModule] AI probe error:', (e as Error)?.message);
        }
      })();
    }
  }, []);

  const inboxCapabilityResolution = useMemo(() => {
    return resolveRoomCapabilityState(inboxStatus, runtimeSignals);
  }, [inboxStatus, runtimeSignals]);
  const roomCapabilityResolution = useMemo(() => {
    return resolveRoomCapabilityState(selectedRoomStatus, runtimeSignals);
  }, [selectedRoomStatus, runtimeSignals]);
  const totalUnread = useMemo(() => {
    return conversations.reduce((sum, conversation) => sum + (conversation.unreadCount ?? 0), 0);
  }, [conversations]);

  useEffect(() => {
    setSelectedRoomStatus(getCurrentChatRoomStatus());
    const unsubscribe = subscribeToChatRoomStatus((nextStatus) => {
      setSelectedRoomStatus(nextStatus);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!normalizedUserId) {
      return;
    }

    let disposed = false;
    let subscriptionCleanup = () => {};

    void (async () => {
      try {
        const subscription = await subscribeInbox(
          normalizedUserId,
          (items) => {
            if (disposed) {
              return;
            }

            setInboxQueryData(queryClient, normalizedUserId, (current) => ({
              conversations: items.map(mapInboxItemToConversation).sort(sortConversations),
              status: current?.status ?? null,
            }));
          },
          (status) => {
            if (disposed) {
              return;
            }

            setInboxQueryData(queryClient, normalizedUserId, (current) => ({
              conversations: current?.conversations ?? [],
              status,
            }));
          },
        );

        if (disposed) {
          subscription.unsubscribe();
          return;
        }

        subscriptionCleanup = subscription.unsubscribe;
      } catch (error) {
        console.log('[ChatModule] Inbox subscription note:', (error as Error)?.message ?? 'Unknown error');
      }
    })();

    return () => {
      disposed = true;
      subscriptionCleanup();
    };
  }, [normalizedUserId, queryClient]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const matchingConversation = conversations.find((conversation) => {
      return conversation.id === selectedConversationId || conversation.slug === selectedConversation?.slug;
    });

    if (!matchingConversation) {
      return;
    }

    setSelectedConversation((currentConversation) => {
      if (!currentConversation || currentConversation.id !== matchingConversation.id) {
        return currentConversation;
      }

      if (
        currentConversation.title === matchingConversation.title
        && currentConversation.subtitle === matchingConversation.subtitle
        && currentConversation.lastMessageText === matchingConversation.lastMessageText
        && currentConversation.lastMessageAt === matchingConversation.lastMessageAt
        && currentConversation.unreadCount === matchingConversation.unreadCount
        && currentConversation.slug === matchingConversation.slug
      ) {
        return currentConversation;
      }

      return matchingConversation;
    });
  }, [conversations, selectedConversation?.slug, selectedConversationId]);

  const markConversationRead = useCallback(async (conversation: ChatConversation) => {
    if (!normalizedUserId) {
      return;
    }

    setInboxQueryData(queryClient, normalizedUserId, (current) => ({
      conversations: (current?.conversations ?? []).map((item) => {
        if (item.id !== conversation.id) {
          return item;
        }

        return {
          ...item,
          unreadCount: 0,
        };
      }),
      status: current?.status ?? null,
    }));

    try {
      await markConversationAsRead(conversation.slug ?? conversation.id, normalizedUserId);
    } catch (error) {
      console.log('[ChatModule] markConversationRead note:', (error as Error)?.message ?? 'Unknown error');
    }
  }, [normalizedUserId, queryClient]);

  const openConversation = useCallback((conversation: ChatConversation) => {
    console.log('[ChatModule] Opening conversation:', conversation.id);
    setSelectedConversation(conversation);
    void markConversationRead(conversation);
  }, [markConversationRead]);

  const goBackToInbox = useCallback(() => {
    console.log('[ChatModule] Returning to inbox');
    setSelectedConversation(null);
    void queryClient.invalidateQueries({
      queryKey: getChatInboxQueryKey(normalizedUserId),
    });
  }, [normalizedUserId, queryClient]);

  const handleSendSuccess = useCallback(async (payload: MessagePayload) => {
    if (!selectedConversation || !normalizedUserId) {
      return;
    }

    const now = new Date().toISOString();
    const lastMessageText = getMessagePreview(payload.text, payload.fileType);

    setInboxQueryData(queryClient, normalizedUserId, (current) => {
      const currentConversations = current?.conversations ?? [];
      const nextConversation: ChatConversation = {
        ...(currentConversations.find((conversation) => conversation.id === selectedConversation.id) ?? selectedConversation),
        lastMessageText,
        lastMessageAt: now,
        unreadCount: 0,
      };

      return {
        conversations: [
          nextConversation,
          ...currentConversations.filter((conversation) => conversation.id !== selectedConversation.id),
        ].sort(sortConversations),
        status: current?.status ?? null,
      };
    });

    await markConversationRead({
      ...selectedConversation,
      unreadCount: 0,
      lastMessageAt: now,
      lastMessageText,
    });

    void queryClient.invalidateQueries({
      queryKey: getChatInboxQueryKey(normalizedUserId),
    });
  }, [markConversationRead, normalizedUserId, queryClient, selectedConversation]);

  const renderConversation = useCallback(({ item }: { item: ChatConversation }) => {
    const unreadCount = item.unreadCount ?? 0;

    return (
      <Pressable
        style={({ pressed }) => [styles.conversationCard, pressed ? styles.pressed : null]}
        onPress={() => {
          openConversation(item);
        }}
        testID={`chat-inbox-item-${item.id}`}
      >
        <View style={styles.avatarShell}>
          <MessageSquareText size={18} color={Colors.black} />
        </View>

        <View style={styles.conversationCopy}>
          <View style={styles.conversationTopRow}>
            <Text style={styles.conversationTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.conversationTime}>{formatConversationTime(item.lastMessageAt)}</Text>
          </View>

          <Text style={styles.conversationSubtitle} numberOfLines={1}>
            {item.subtitle?.trim() || IVX_OWNER_AI_PROFILE.sharedRoom.subtitle}
          </Text>

          <View style={styles.previewRow}>
            <Text style={styles.previewText} numberOfLines={1}>
              {item.lastMessageText?.trim() || 'Open this room to send the first message, image, video, or document.'}
            </Text>

            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }, [openConversation]);

  if (selectedConversation) {
    const roomKey = selectedConversation.slug ?? selectedConversation.id;

    return (
      <View style={styles.container} testID="chat-module-room">
        <View style={styles.roomHeaderCard}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            onPress={goBackToInbox}
            testID="chat-module-back"
          >
            <ChevronLeft size={18} color={Colors.text} />
          </Pressable>

          <View style={styles.roomHeaderCopy}>
            <View style={styles.roomBadge}>
              <Sparkles size={12} color={Colors.primary} />
              <Text style={styles.roomBadgeText}>{roomCapabilityResolution.badgeText}</Text>
            </View>
            <Text style={styles.roomTitle}>{selectedConversation.title}</Text>
            <Text style={styles.roomSubtitle}>{roomCapabilityResolution.subtitle}</Text>
            <Text style={styles.roomStatusSummary}>{roomCapabilityResolution.summary}</Text>
          </View>
        </View>

        <ChatScreen
          conversationId={roomKey}
          currentUserId={normalizedUserId}
          showHero
          onSendSuccess={handleSendSuccess}
          roomMeta={{
            title: selectedConversation.title,
            subtitle: roomCapabilityResolution.subtitle,
            badgeText: roomCapabilityResolution.badgeText,
            emptyTitle: IVX_OWNER_AI_PROFILE.sharedRoom.emptyTitle,
            emptyText: IVX_OWNER_AI_PROFILE.sharedRoom.emptyText,
            runtimeSignals,
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="chat-module-inbox">
      <View style={styles.heroCard}>
        <View style={styles.heroBadge}>
          <Inbox size={14} color={Colors.primary} />
          <Text style={styles.heroBadgeText}>Inbox</Text>
        </View>
        <Text style={styles.heroTitle}>{IVX_OWNER_AI_PROFILE.name} Inbox</Text>
        <Text style={styles.heroSubtitle}>{inboxCapabilityResolution.subtitle}</Text>
        <Text style={styles.heroSubtitle}>Backend: {getStatusLabel(inboxStatus)} · {inboxCapabilityResolution.summary}</Text>
        {inboxStatus?.warning ? <Text style={styles.heroWarning}>{inboxStatus.warning}</Text> : null}

        <View style={styles.heroStatRow}>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatValue}>{conversations.length}</Text>
            <Text style={styles.heroStatLabel}>Rooms</Text>
          </View>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatValue}>{totalUnread}</Text>
            <Text style={styles.heroStatLabel}>Unread</Text>
          </View>
          <View style={styles.heroStatCard}>
            <Clock3 size={16} color={Colors.primary} />
            <Text style={styles.heroStatLabel}>{inboxCapabilityResolution.badgeText}</Text>
          </View>
        </View>
      </View>

      {inboxQuery.isPending ? (
        <View style={styles.centerState} testID="chat-module-loading">
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.centerTitle}>Loading inbox…</Text>
          <Text style={styles.centerText}>Checking live room sync, shared availability, and current capability state.</Text>
        </View>
      ) : inboxQuery.error ? (
        <View style={styles.centerState} testID="chat-module-error">
          <Text style={styles.centerTitle}>Inbox unavailable</Text>
          <Text style={styles.centerText}>{inboxQuery.error.message || 'Please try again in a moment.'}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
            onPress={() => {
              void inboxQuery.refetch();
            }}
            testID="chat-module-retry"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.centerState} testID="chat-module-empty">
          <Text style={styles.centerTitle}>No conversations yet</Text>
          <Text style={styles.centerText}>
            When your owner room is ready, it will appear here automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={inboxQuery.isRefetching}
              onRefresh={() => {
                void inboxQuery.refetch();
              }}
              tintColor={Colors.primary}
            />
          }
          testID="chat-module-list"
        />
      )}
    </View>
  );
}

export default ChatModule;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
  },
  heroBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  heroTitle: {
    marginTop: 14,
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
  },
  heroSubtitle: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  heroWarning: {
    marginTop: 8,
    color: Colors.warning,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  heroStatRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  heroStatCard: {
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroStatValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800' as const,
  },
  heroStatLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  conversationCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  avatarShell: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationCopy: {
    flex: 1,
    gap: 6,
  },
  conversationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conversationTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  conversationTime: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  conversationSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  previewText: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  unreadText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  centerState: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  centerText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  retryButtonText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  roomHeaderCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  roomHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  roomBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
  },
  roomBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  roomTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
  },
  roomSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  roomStatusSummary: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  pressed: {
    opacity: 0.84,
  },
});
