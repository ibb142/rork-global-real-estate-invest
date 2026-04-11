import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, Radio, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { Composer } from '../components/Composer';
import { MessageBubble } from '../components/MessageBubble';
import { PresenceBar } from '../components/PresenceBar';
import { RoomConnectionBanner } from '../components/RoomConnectionBanner';
import { TypingIndicator } from '../components/TypingIndicator';
import { getChatMessagesQueryKey, useChatMessages } from '../hooks/useChatMessages';
import { useRoomPresence } from '../hooks/useRoomPresence';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import {
  createAssistantChatMessage,
  createCommandResponseMessage,
  parseOwnerCommand,
  requestAIReply,
} from '../services/aiReplyService';
import { chatService } from '../services/chatService';
import { resolveChatActorId } from '../services/chatRooms';
import { bootstrapRoomByFriendlySlug, ensureParticipant, markConversationAsRead } from '../services/ivxChat';
import { resolveRoomCapabilityState } from '../services/roomCapabilityResolver';
import {
  getChatStorageStatus,
  getCurrentChatRoomStatus,
  subscribeToChatRoomStatus,
  subscribeToChatStorageMode,
  type ChatStorageStatus,
} from '../services/supabaseChatProvider';
import {
  type RoomStateSnapshot,
  type RoomSyncPhase,
  generateSendCorrelationId,
  getRoomStateSnapshot,
  initRoomStateManager,
  requestRoomRedetection,
  subscribeToRoomState,
} from '../services/roomStateManager';
import type {
  CapabilityState,
  ChatFileType,
  ChatMessage,
  ChatRoomRuntimeSignals,
  ChatRoomStatus,
  SendMessageInput,
  UploadableFile,
} from '../types/chat';

type ChatAuditCard = {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  bullets: string[];
};

type ChatRoomMeta = {
  badgeText?: string;
  title?: string;
  subtitle?: string;
  capabilityPills?: string[];
  runtimeSignals?: ChatRoomRuntimeSignals;
  emptyTitle?: string;
  emptyText?: string;
  auditCards?: ChatAuditCard[];
};

type ChatScreenProps = {
  conversationId: string;
  currentUserId: string;
  roomMeta?: ChatRoomMeta;
  showHero?: boolean;
  onSendSuccess?: (payload: ComposerPayload) => Promise<void> | void;
};

type ComposerPayload = {
  text?: string;
  fileUrl?: string;
  fileType?: ChatFileType;
  upload?: UploadableFile;
};

function getRoomLabel(conversationId: string): string {
  return conversationId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

function getCapabilityStateColors(state: CapabilityState): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  switch (state) {
    case 'available':
      return {
        backgroundColor: 'rgba(255,215,0,0.12)',
        borderColor: 'rgba(255,215,0,0.34)',
        textColor: Colors.primary,
      };
    case 'degraded':
      return {
        backgroundColor: 'rgba(245,158,11,0.14)',
        borderColor: 'rgba(245,158,11,0.32)',
        textColor: Colors.warning,
      };
    case 'unavailable':
    default:
      return {
        backgroundColor: Colors.backgroundSecondary,
        borderColor: Colors.surfaceBorder,
        textColor: Colors.textTertiary,
      };
  }
}

function getCapabilityStateLabel(state: CapabilityState): string {
  switch (state) {
    case 'available':
      return 'Live';
    case 'degraded':
      return 'Limited';
    case 'unavailable':
    default:
      return 'Off';
  }
}

export function ChatScreen({
  conversationId,
  currentUserId,
  roomMeta,
  showHero = true,
  onSendSuccess,
}: ChatScreenProps) {
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const screenRef = useRef<View | null>(null);
  const screenFrameRef = useRef<{ y: number; height: number }>({ y: 0, height: 0 });
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState<number>(0);
  const [storageStatus, setStorageStatus] = useState<ChatStorageStatus>(() => getChatStorageStatus());
  const [roomStatus, setRoomStatus] = useState<ChatRoomStatus | null>(() => getCurrentChatRoomStatus());
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);
  const stableConversationId = useMemo(() => conversationId.trim(), [conversationId]);
  const stableCurrentUserId = useMemo(() => {
    return resolveChatActorId(currentUserId, 'preview');
  }, [currentUserId]);
  const heroTitle = useMemo(() => roomMeta?.title?.trim() || getRoomLabel(stableConversationId), [roomMeta?.title, stableConversationId]);
  const capabilityResolution = useMemo(() => {
    return resolveRoomCapabilityState(roomStatus, roomMeta?.runtimeSignals);
  }, [roomMeta?.runtimeSignals, roomStatus]);
  const heroSubtitle = useMemo(() => capabilityResolution.subtitle, [capabilityResolution.subtitle]);
  const heroBadgeText = useMemo(() => capabilityResolution.badgeText, [capabilityResolution.badgeText]);
  const roomCapabilities = useMemo(() => capabilityResolution.capabilities, [capabilityResolution.capabilities]);
  const selectedCapability = useMemo(() => {
    if (!selectedCapabilityId) {
      return null;
    }

    return roomCapabilities.find((capability) => capability.id === selectedCapabilityId) ?? null;
  }, [roomCapabilities, selectedCapabilityId]);
  const emptyStateTitle = useMemo(() => roomMeta?.emptyTitle?.trim() || 'No messages yet', [roomMeta?.emptyTitle]);
  const emptyStateText = useMemo(() => {
    return roomMeta?.emptyText?.trim() || capabilityResolution.emptyStateText;
  }, [capabilityResolution.emptyStateText, roomMeta?.emptyText]);
  const auditCards = useMemo<ChatAuditCard[]>(() => {
    return (roomMeta?.auditCards ?? [])
      .map((card) => {
        const title = card.title.trim();
        const description = card.description.trim();
        const bullets = card.bullets
          .map((bullet) => bullet.trim())
          .filter((bullet) => bullet.length > 0);

        if (!title || !description || bullets.length === 0) {
          return null;
        }

        return {
          ...card,
          eyebrow: card.eyebrow?.trim(),
          title,
          description,
          bullets,
        };
      })
      .filter((card): card is ChatAuditCard => !!card);
  }, [roomMeta?.auditCards]);
  const statusAccentColor = useMemo(() => {
    switch (storageStatus.mode) {
      case 'primary':
        return Colors.primary;
      case 'room':
      case 'fallback':
        return Colors.info;
      case 'local':
        return Colors.warning;
      case 'unknown':
      default:
        return Colors.textTertiary;
    }
  }, [storageStatus.mode]);
  const aiIndicatorColors = useMemo(() => {
    return getCapabilityStateColors(capabilityResolution.aiIndicator.state);
  }, [capabilityResolution.aiIndicator.state]);
  const selectedCapabilityColors = useMemo(() => {
    return selectedCapability ? getCapabilityStateColors(selectedCapability.state) : null;
  }, [selectedCapability]);
  const [roomPhase, setRoomPhase] = useState<RoomSyncPhase>(() => getRoomStateSnapshot().phase);
  const { messages, loading, error, refetch, isRefreshing, loadOlderMessages, isLoadingOlder, hasMoreOlder } = useChatMessages(stableConversationId);
  const { typingUsers, isAnyoneTyping, typingLabel, broadcastTyping, stopTyping } = useTypingIndicator({
    conversationId: stableConversationId,
    currentUserId: stableCurrentUserId,
  });
  const { members: presenceMembers, presenceLabel } = useRoomPresence({
    conversationId: stableConversationId,
    currentUserId: stableCurrentUserId,
  });
  const keyboardBehavior = Platform.select<'padding' | 'height' | undefined>({
    ios: 'padding',
    android: 'height',
    default: undefined,
  });
  const androidKeyboardInset = useMemo(() => {
    if (Platform.OS !== 'android') {
      return 0;
    }

    return Math.max(keyboardInset, 0);
  }, [keyboardInset]);
  const composerBottomInset = useMemo(() => {
    if (Platform.OS === 'android' && androidKeyboardInset > 0) {
      return 12;
    }

    return Math.max(insets.bottom, 12);
  }, [androidKeyboardInset, insets.bottom]);
  const listContentStyle = useMemo(() => [styles.listContent, { paddingBottom: 10 }], []);

  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const updateScreenFrame = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }

    screenRef.current?.measureInWindow((_x, y, _width, height) => {
      screenFrameRef.current = { y, height };
      console.log('[ChatScreen] Screen frame updated:', screenFrameRef.current);
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    console.log('[ChatScreen] Refresh requested');
    await refetch();
    scrollToBottom(false);
  }, [refetch, scrollToBottom]);

  const handleRetry = useCallback(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const generateOptimisticId = useCallback(() => {
    const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
    if (cryptoRef?.randomUUID) {
      return `optimistic-${cryptoRef.randomUUID()}`;
    }
    return `optimistic-${'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    })}`;
  }, []);

  const handleRetryMessage = useCallback((message: ChatMessage) => {
    if (!message.retryPayload) {
      console.log('[ChatScreen] No retry payload for message:', message.id);
      return;
    }

    const queryKey = getChatMessagesQueryKey(stableConversationId);
    queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => {
      return (prev ?? []).map((m) =>
        m.id === message.id ? { ...m, sendStatus: 'sending' as const, optimistic: true } : m
      );
    });

    const retryInput = message.retryPayload;
    void (async () => {
      try {
        console.log('[ChatScreen] Retrying message:', message.id);
        await chatService.sendMessage(retryInput);

        queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => {
          return (prev ?? []).filter((m) => m.id !== message.id);
        });

        await queryClient.invalidateQueries({ queryKey });
        scrollToBottom(true);
      } catch (retryError) {
        console.log('[ChatScreen] Retry failed:', (retryError as Error)?.message ?? 'Unknown');
        queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => {
          return (prev ?? []).map((m) =>
            m.id === message.id ? { ...m, sendStatus: 'failed' as const } : m
          );
        });
      }
    })();
  }, [stableConversationId, queryClient, scrollToBottom]);

  const handleDismissFailedMessage = useCallback((messageId: string) => {
    const queryKey = getChatMessagesQueryKey(stableConversationId);
    queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => {
      return (prev ?? []).filter((m) => m.id !== messageId);
    });
  }, [stableConversationId, queryClient]);

  const stuckSendingCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initRoomStateManager();
    const unsubscribe = subscribeToRoomState((snapshot) => {
      setRoomPhase(snapshot.phase);
    });
    return unsubscribe;
  }, []);

  const cleanupStuckSending = useCallback((optimisticId: string, sendCid: string) => {
    if (stuckSendingCleanupRef.current) {
      clearTimeout(stuckSendingCleanupRef.current);
    }
    stuckSendingCleanupRef.current = setTimeout(() => {
      const queryKey = getChatMessagesQueryKey(stableConversationId);
      const current = queryClient.getQueryData<ChatMessage[]>(queryKey) ?? [];
      const stuckMessage = current.find((m) => m.id === optimisticId && m.sendStatus === 'sending');
      if (stuckMessage) {
        console.log('[ChatScreen] Stuck-sending safety net triggered cid:', sendCid, 'forcing failed:', optimisticId);
        queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) =>
          (prev ?? []).map((m) =>
            m.id === optimisticId && m.sendStatus === 'sending'
              ? { ...m, sendStatus: 'failed' as const, optimistic: true }
              : m
          ),
        );
      }
      stuckSendingCleanupRef.current = null;
    }, 15000);
  }, [stableConversationId, queryClient]);

  const sendMessageMutation = useMutation<void, Error, ComposerPayload & { optimisticId: string; sendCid: string }>({ 
    mutationFn: async (payload) => {
      const snapshot = getRoomStateSnapshot();
      console.log('[ChatScreen] Send start cid:', payload.sendCid, '|', {
        conversationId: stableConversationId,
        currentUserId: stableCurrentUserId,
        hasText: !!payload.text,
        hasFile: !!payload.fileUrl,
        hasUpload: !!payload.upload,
        fileType: payload.fileType ?? null,
        roomPhase: snapshot.phase,
        roomMode: snapshot.status?.storageMode ?? 'unknown',
        roomDelivery: snapshot.status?.deliveryMethod ?? 'unknown',
      });

      await chatService.sendMessage({
        conversationId: stableConversationId,
        senderId: stableCurrentUserId,
        text: payload.text,
        fileUrl: payload.fileUrl,
        fileType: payload.fileType,
        upload: payload.upload,
      });

      console.log('[ChatScreen] Send success cid:', payload.sendCid);
    },
    onMutate: async (payload) => {
      const queryKey = getChatMessagesQueryKey(stableConversationId);
      await queryClient.cancelQueries({ queryKey });

      const previousMessages = queryClient.getQueryData<ChatMessage[]>(queryKey) ?? [];

      const retryPayload: SendMessageInput = {
        conversationId: stableConversationId,
        senderId: stableCurrentUserId,
        text: payload.text,
        fileUrl: payload.fileUrl,
        fileType: payload.fileType,
        upload: payload.upload,
      };

      const optimisticMessage: ChatMessage = {
        id: payload.optimisticId,
        conversationId: stableConversationId,
        senderId: stableCurrentUserId,
        text: payload.text ?? null,
        fileUrl: payload.fileUrl ?? null,
        fileType: payload.fileType ?? null,
        createdAt: new Date().toISOString(),
        sendStatus: 'sending',
        optimistic: true,
        retryPayload,
      };

      queryClient.setQueryData<ChatMessage[]>(queryKey, [...previousMessages, optimisticMessage]);
      scrollToBottom(true);
      cleanupStuckSending(payload.optimisticId, payload.sendCid);

      return { previousMessages, optimisticId: payload.optimisticId, sendCid: payload.sendCid };
    },
    onSuccess: async (_data, payload, context) => {
      if (stuckSendingCleanupRef.current) {
        clearTimeout(stuckSendingCleanupRef.current);
        stuckSendingCleanupRef.current = null;
      }

      console.log('[ChatScreen] Send resolved to SENT cid:', context?.sendCid);

      const queryKey = getChatMessagesQueryKey(stableConversationId);

      queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => {
        return (prev ?? []).filter((m) => m.id !== context?.optimisticId);
      });

      await queryClient.invalidateQueries({ queryKey });

      if (onSendSuccess) {
        try {
          await onSendSuccess(payload);
        } catch (callbackError) {
          console.log('[ChatScreen] Send success callback error:', (callbackError as Error)?.message ?? 'Unknown error');
        }
      }

      scrollToBottom(true);

      const messageText = (payload.text ?? '').trim();
      if (messageText) {
        const commandResult = parseOwnerCommand(messageText);
        if (commandResult) {
          console.log('[ChatScreen] Owner command handled:', commandResult.command);
          const cmdMsg = createCommandResponseMessage(stableConversationId, commandResult.response);
          queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => [
            ...(prev ?? []),
            cmdMsg,
          ]);
          scrollToBottom(true);
          if (commandResult.command === 'reconnect') {
            requestRoomRedetection();
          }
        } else if (roomMeta?.runtimeSignals?.aiBackendHealth === 'active' || roomMeta?.runtimeSignals?.aiBackendHealth === 'degraded') {
          console.log('[ChatScreen] Triggering AI reply for:', messageText.slice(0, 40));
          void (async () => {
            try {
              const aiResult = await requestAIReply(messageText, stableConversationId);
              const assistantMsg = createAssistantChatMessage(
                stableConversationId,
                aiResult.answer,
              );
              queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => [
                ...(prev ?? []),
                assistantMsg,
              ]);
              await queryClient.invalidateQueries({ queryKey });
              scrollToBottom(true);
              console.log('[ChatScreen] AI reply injected, length:', aiResult.answer.length);
            } catch (aiError) {
              console.log('[ChatScreen] AI reply failed (non-blocking):', (aiError as Error)?.message ?? 'Unknown');
            }
          })();
        }
      }
    },
    onError: (mutationError, _payload, context) => {
      if (stuckSendingCleanupRef.current) {
        clearTimeout(stuckSendingCleanupRef.current);
        stuckSendingCleanupRef.current = null;
      }

      console.log('[ChatScreen] Send resolved to FAILED cid:', context?.sendCid, 'error:', mutationError.message);

      const queryKey = getChatMessagesQueryKey(stableConversationId);
      queryClient.setQueryData<ChatMessage[]>(queryKey, (prev) => {
        return (prev ?? []).map((m) =>
          m.id === context?.optimisticId
            ? { ...m, sendStatus: 'failed' as const }
            : m
        );
      });
    },
  });

  const loadOlderBlock = useMemo(() => {
    if (!hasMoreOlder || messages.length === 0) return null;
    return (
      <Pressable
        style={({ pressed }) => [styles.loadOlderButton, pressed ? styles.pressed : null]}
        onPress={() => { void loadOlderMessages(); }}
        disabled={isLoadingOlder}
        testID="chat-room-load-older"
      >
        {isLoadingOlder ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <ChevronUp size={14} color={Colors.primary} />
        )}
        <Text style={styles.loadOlderText}>
          {isLoadingOlder ? 'Loading\u2026' : 'Load older messages'}
        </Text>
      </Pressable>
    );
  }, [hasMoreOlder, messages.length, isLoadingOlder, loadOlderMessages]);

  const listHeader = useMemo(() => {
    return (
      <>
        {showHero ? (
          <View style={styles.heroCard} testID="chat-room-hero">
            <View style={styles.heroLeft}>
              <View style={[styles.statusPill, { borderColor: statusAccentColor }]}>
                <Radio size={14} color={statusAccentColor} />
                <Text style={[styles.statusPillText, { color: statusAccentColor }]}>{heroBadgeText}</Text>
              </View>
              <Text style={styles.heroTitle}>{heroTitle || 'Message Room'}</Text>
              <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>

              <View style={styles.heroSignalRow}>
                <View
                  style={[
                    styles.aiIndicatorBadge,
                    {
                      backgroundColor: aiIndicatorColors.backgroundColor,
                      borderColor: aiIndicatorColors.borderColor,
                    },
                  ]}
                  testID={capabilityResolution.aiIndicator.testID}
                >
                  {capabilityResolution.aiIndicator.isLoading ? (
                    <ActivityIndicator size="small" color={aiIndicatorColors.textColor} />
                  ) : (
                    <View style={[styles.aiIndicatorDot, { backgroundColor: aiIndicatorColors.textColor }]} />
                  )}
                  <Text style={[styles.aiIndicatorText, { color: aiIndicatorColors.textColor }]}>
                    {capabilityResolution.aiIndicator.label}
                  </Text>
                </View>
                <Text style={styles.heroSummary}>{capabilityResolution.summary}</Text>
              </View>

              <View style={styles.capabilityRow}>
                {roomCapabilities.map((capability) => {
                  const colors = getCapabilityStateColors(capability.state);
                  const isSelected = selectedCapabilityId === capability.id;

                  return (
                    <Pressable
                      key={capability.id}
                      style={({ pressed }) => [
                        styles.capabilityPill,
                        {
                          backgroundColor: colors.backgroundColor,
                          borderColor: colors.borderColor,
                        },
                        isSelected ? styles.capabilityPillSelected : null,
                        pressed ? styles.pressed : null,
                      ]}
                      onPress={() => {
                        setSelectedCapabilityId((current) => current === capability.id ? null : capability.id);
                      }}
                      testID={capability.testID}
                    >
                      <Text style={[styles.capabilityText, { color: colors.textColor }]}>{capability.label}</Text>
                      <Text style={[styles.capabilityStateText, { color: colors.textColor }]}>
                        {getCapabilityStateLabel(capability.state)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedCapability && selectedCapabilityColors ? (
                <View
                  style={[
                    styles.capabilityDetailCard,
                    {
                      backgroundColor: selectedCapabilityColors.backgroundColor,
                      borderColor: selectedCapabilityColors.borderColor,
                    },
                  ]}
                  testID={`chat-room-capability-detail-${selectedCapability.id}`}
                >
                  <Text style={[styles.capabilityDetailTitle, { color: selectedCapabilityColors.textColor }]}> 
                    {selectedCapability.label} • {getCapabilityStateLabel(selectedCapability.state)}
                  </Text>
                  <Text style={[styles.capabilityDetailText, { color: selectedCapabilityColors.textColor }]}>
                    {selectedCapability.detail}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.statusCard} testID="chat-room-storage-status">
          <View style={styles.statusCardHeader}>
            <Text style={styles.statusCardEyebrow}>Room status</Text>
            <View style={[styles.statusBadge, { borderColor: statusAccentColor }]}>
              <View style={[styles.statusDot, { backgroundColor: statusAccentColor }]} />
              <Text style={[styles.statusBadgeText, { color: statusAccentColor }]}>{storageStatus.label}</Text>
            </View>
          </View>
          <Text style={styles.statusDetail}>{storageStatus.detail}</Text>
          <Text style={styles.statusSummary}>{capabilityResolution.summary}</Text>
          <View
            style={[
              styles.statusAIIndicator,
              {
                backgroundColor: aiIndicatorColors.backgroundColor,
                borderColor: aiIndicatorColors.borderColor,
              },
            ]}
            testID={capabilityResolution.aiIndicator.testID}
          >
            <View style={styles.statusAIHeader}>
              {capabilityResolution.aiIndicator.isLoading ? (
                <ActivityIndicator size="small" color={aiIndicatorColors.textColor} />
              ) : (
                <View style={[styles.aiIndicatorDot, { backgroundColor: aiIndicatorColors.textColor }]} />
              )}
              <Text style={[styles.statusAITitle, { color: aiIndicatorColors.textColor }]}>
                {capabilityResolution.aiIndicator.label}
              </Text>
            </View>
            <Text style={[styles.statusAIDetail, { color: aiIndicatorColors.textColor }]}>
              {capabilityResolution.aiIndicator.detail}
            </Text>
          </View>
          {storageStatus.warning ? <Text style={styles.statusWarning}>{storageStatus.warning}</Text> : null}
          <View style={styles.statusMetricRow}>
            <View style={styles.statusMetricCard} testID="chat-room-status-storage">
              <Text style={styles.statusMetricLabel}>Storage</Text>
              <Text style={styles.statusMetricValue}>{storageStatus.persistenceLabel}</Text>
            </View>
            <View style={styles.statusMetricCard} testID="chat-room-status-visibility">
              <Text style={styles.statusMetricLabel}>Visibility</Text>
              <Text style={styles.statusMetricValue}>{storageStatus.visibilityLabel}</Text>
            </View>
            <View style={styles.statusMetricCard} testID="chat-room-status-delivery">
              <Text style={styles.statusMetricLabel}>Delivery</Text>
              <Text style={styles.statusMetricValue}>{storageStatus.deliveryLabel}</Text>
            </View>
          </View>
        </View>

        {auditCards.length > 0 ? (
          <View style={styles.auditSection} testID="chat-room-audit">
            <Text style={styles.auditSectionTitle}>End-to-end audit</Text>
            <View style={styles.auditCardList}>
              {auditCards.map((card) => {
                return (
                  <View key={card.id} style={styles.auditCard} testID={`chat-room-audit-card-${card.id}`}>
                    {card.eyebrow ? <Text style={styles.auditEyebrow}>{card.eyebrow}</Text> : null}
                    <Text style={styles.auditTitle}>{card.title}</Text>
                    <Text style={styles.auditDescription}>{card.description}</Text>
                    <View style={styles.auditBulletList}>
                      {card.bullets.map((bullet, bulletIndex) => {
                        return (
                          <View key={`${card.id}-${bulletIndex}`} style={styles.auditBulletRow}>
                            <View style={styles.auditBulletDot} />
                            <Text style={styles.auditBulletText}>{bullet}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard} testID="chat-room-error">
            <Text style={styles.errorTitle}>Could not load this room</Text>
            <Text style={styles.errorText}>{error.message || 'Please try again.'}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
              onPress={handleRetry}
              testID="chat-room-retry"
            >
              <RefreshCw size={16} color={Colors.black} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {loadOlderBlock}
      </>
    );
  }, [
    aiIndicatorColors.backgroundColor,
    aiIndicatorColors.borderColor,
    aiIndicatorColors.textColor,
    auditCards,
    capabilityResolution.aiIndicator.detail,
    capabilityResolution.aiIndicator.isLoading,
    capabilityResolution.aiIndicator.label,
    capabilityResolution.aiIndicator.testID,
    capabilityResolution.summary,
    error,
    handleRetry,
    loadOlderBlock,
    heroBadgeText,
    heroSubtitle,
    heroTitle,
    roomCapabilities,
    selectedCapability,
    selectedCapabilityColors,
    selectedCapabilityId,
    showHero,
    statusAccentColor,
    storageStatus.detail,
    storageStatus.label,
    storageStatus.persistenceLabel,
    storageStatus.visibilityLabel,
    storageStatus.deliveryLabel,
    storageStatus.warning,
  ]);

  useEffect(() => {
    setStorageStatus(getChatStorageStatus());
    setRoomStatus(getCurrentChatRoomStatus());
    const unsubscribeStorage = subscribeToChatStorageMode((nextMode) => {
      setStorageStatus(getChatStorageStatus(nextMode));
    });
    const unsubscribeRoom = subscribeToChatRoomStatus((nextStatus) => {
      setRoomStatus(nextStatus);
    });

    return () => {
      unsubscribeStorage();
      unsubscribeRoom();
    };
  }, [stableConversationId]);

  useEffect(() => {
    setSelectedCapabilityId(null);
  }, [stableConversationId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const boot = await bootstrapRoomByFriendlySlug(stableConversationId);
        if (cancelled) {
          return;
        }

        await ensureParticipant(boot.conversation.id, {
          actorId: stableCurrentUserId,
        });
        await markConversationAsRead(boot.conversation.slug ?? boot.conversation.id, stableCurrentUserId);
      } catch (roomError) {
        console.log('[ChatScreen] Room bootstrap note:', (roomError as Error)?.message ?? 'Unknown error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stableConversationId, stableCurrentUserId]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollToBottom(true);
    }, 80);

    return () => clearTimeout(timeout);
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const queryKey = getChatMessagesQueryKey(stableConversationId);
    let lastBackground = 0;

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        lastBackground = Date.now();
        return;
      }

      if (nextState === 'active' && lastBackground > 0) {
        const elapsed = Date.now() - lastBackground;
        lastBackground = 0;
        console.log('[ChatScreen] App resumed after', elapsed, 'ms, refetching messages');

        void queryClient.invalidateQueries({ queryKey });

        setTimeout(() => {
          scrollToBottom(true);
        }, 300);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [stableConversationId, queryClient, scrollToBottom]);

  const handleKeyboardShow = useCallback((event: KeyboardEvent) => {
    console.log('[ChatScreen] Keyboard shown');

    if (Platform.OS === 'android') {
      const keyboardTop = event.endCoordinates.screenY;
      requestAnimationFrame(() => {
        updateScreenFrame();
        requestAnimationFrame(() => {
          const overlap = Math.max(
            screenFrameRef.current.y + screenFrameRef.current.height - keyboardTop,
            0,
          );
          console.log('[ChatScreen] Android keyboard overlap:', {
            keyboardTop,
            overlap,
            frame: screenFrameRef.current,
          });
          setKeyboardInset(overlap);
          setTimeout(() => {
            scrollToBottom(true);
          }, 60);
        });
      });
      return;
    }

    setTimeout(() => {
      scrollToBottom(true);
    }, 60);
  }, [scrollToBottom, updateScreenFrame]);

  const handleKeyboardHide = useCallback(() => {
    console.log('[ChatScreen] Keyboard hidden');
    setKeyboardInset(0);
    setTimeout(() => {
      scrollToBottom(false);
    }, 20);
  }, [scrollToBottom]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [handleKeyboardHide, handleKeyboardShow]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      return (
        <View style={styles.messageRow}>
          <MessageBubble
            message={item}
            isMine={item.senderId === stableCurrentUserId}
            onRetry={item.sendStatus === 'failed' ? handleRetryMessage : undefined}
            onDismiss={item.sendStatus === 'failed' ? handleDismissFailedMessage : undefined}
          />
        </View>
      );
    },
    [stableCurrentUserId, handleRetryMessage, handleDismissFailedMessage],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={keyboardBehavior}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      <View
        ref={screenRef}
        style={styles.screen}
        onLayout={() => {
          updateScreenFrame();
        }}
      >
        <View style={styles.body}>
          <RoomConnectionBanner
            phase={roomPhase}
            onReconnect={() => {
              console.log('[ChatScreen] Manual reconnect requested');
              requestRoomRedetection();
            }}
          />
          <PresenceBar
            members={presenceMembers}
            currentUserId={stableCurrentUserId}
            presenceLabel={presenceLabel}
          />
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            style={styles.list}
            contentContainerStyle={listContentStyle}
            ListHeaderComponent={listHeader}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.1}

            refreshControl={
              <RefreshControl
                refreshing={isRefreshing && !loading}
                onRefresh={() => {
                  void handleRefresh();
                }}
                tintColor={Colors.primary}
              />
            }
            onContentSizeChange={() => {
              if (!isLoadingOlder) {
                scrollToBottom(messages.length > 1);
              }
            }}
            onLayout={() => {
              if (!isLoadingOlder) {
                scrollToBottom(false);
              }
            }}
            ListEmptyComponent={
              loading ? (
                <View style={styles.centerState} testID="chat-room-loading">
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.centerTitle}>Loading messages…</Text>
                  <Text style={styles.centerText}>Checking room status, sync state, and live capabilities.</Text>
                </View>
              ) : (
                <View style={styles.centerState} testID="chat-room-empty">
                  <Text style={styles.centerTitle}>{emptyStateTitle}</Text>
                  <Text style={styles.centerText}>{emptyStateText}</Text>
                </View>
              )
            }
            testID="chat-room-list"
          />

          <TypingIndicator isVisible={isAnyoneTyping} label={typingLabel} />

          <Composer
            onSend={async (payload) => {
              stopTyping();
              const optimisticId = generateOptimisticId();
              const sendCid = generateSendCorrelationId();
              await sendMessageMutation.mutateAsync({ ...payload, optimisticId, sendCid });
            }}
            sending={sendMessageMutation.isPending}
            onFocus={() => {
              updateScreenFrame();
              scrollToBottom(true);
            }}
            onTyping={broadcastTyping}
            bottomInset={composerBottomInset}
            notes={capabilityResolution.composerNotes}
            statusIndicator={capabilityResolution.aiIndicator}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screen: {
    flex: 1,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
    borderRadius: 24,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  heroLeft: {
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800' as const,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  heroSignalRow: {
    gap: 10,
    marginTop: 2,
  },
  heroSummary: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  capabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  capabilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  capabilityPillSelected: {
    transform: [{ scale: 0.98 }],
  },
  capabilityText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  capabilityStateText: {
    fontSize: 10,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  capabilityDetailCard: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  capabilityDetailTitle: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  capabilityDetailText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    gap: 10,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusCardEyebrow: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  statusDetail: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  statusSummary: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  statusAIIndicator: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  statusAIHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusAITitle: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  statusAIDetail: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  aiIndicatorBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  aiIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  aiIndicatorText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  statusWarning: {
    color: Colors.warning,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  statusMetricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusMetricCard: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 6,
  },
  statusMetricLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
  },
  statusMetricValue: {
    color: Colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  auditSection: {
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  auditSectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  auditCardList: {
    gap: 10,
  },
  auditCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  auditEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  auditTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  auditDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  auditBulletList: {
    gap: 8,
  },
  auditBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  auditBulletDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  auditBulletText: {
    flex: 1,
    color: Colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  errorCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  errorText: {
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  retryText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingTop: 4,
    flexGrow: 1,
  },
  messageRow: {
    paddingHorizontal: 16,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
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
  loadOlderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  loadOlderText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  pressed: {
    opacity: 0.84,
  },
});
