import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, RefreshCw, Send, ShieldCheck, Sparkles, Users, Wifi, WifiOff } from 'lucide-react-native';
import ChatBubble from '@/components/ChatBubble';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import {
  createChatSocket,
  fetchChatHealth,
  fetchChatMessages,
  fetchChatRoomState,
  getChatApiBaseUrl,
  getDefaultChatRoomId,
  sendChatMessage,
  type ChatRoomAIProvider,
  type ChatRoomHealthResponse,
  type ChatRoomMessage,
  type ChatRoomSendResponse,
  type ChatSocket,
  type ChatSocketAcknowledgement,
} from '@/lib/chat-room-client';
import type { ChatMessage } from '@/types';

type ConnectionTone = 'live' | 'warn' | 'error';

type StatusChipProps = {
  label: string;
  tone: ConnectionTone;
  icon: 'wifi' | 'users' | 'shield' | 'lock';
};

const WELCOME_COPY = 'Welcome to the IVX live chat room. Pick a guest name, join the room, and send messages in real time.';
const MAX_RENDERED_MESSAGES = 120;
const GUEST_NAME = 'Guest';
const REFRESH_LIMIT = 80;

function createId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readTrimmed(value: string): string {
  return value.trim();
}

function sanitizeUsername(value: string): string {
  const normalized = readTrimmed(value).replace(/\s+/g, ' ').slice(0, 32);
  return normalized || GUEST_NAME;
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => {
    return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
  });
}

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  const sorted = sortMessages(messages);
  if (sorted.length <= MAX_RENDERED_MESSAGES) {
    return sorted;
  }

  return sorted.slice(sorted.length - MAX_RENDERED_MESSAGES);
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  current.forEach((message) => {
    map.set(message.id, message);
  });
  incoming.forEach((message) => {
    map.set(message.id, message);
  });
  return trimMessages(Array.from(map.values()));
}

function createSupportMessage(message: string): ChatMessage {
  return {
    id: createId('chat-support'),
    senderId: 'ivx-chat-system',
    senderName: 'IVX Room',
    senderAvatar: '',
    message,
    timestamp: new Date().toISOString(),
    isSupport: true,
    status: 'read',
  };
}

function mapRoomMessageToChatMessage(message: ChatRoomMessage): ChatMessage {
  return {
    id: message.id,
    senderId: `${message.source}-${message.username}`,
    senderName: message.username,
    senderAvatar: '',
    message: message.text,
    timestamp: message.createdAt,
    isSupport: message.source !== 'user',
    status: 'read',
  };
}

const StatusChip = React.memo(function StatusChip({ label, tone, icon }: StatusChipProps) {
  const backgroundColor = tone === 'live'
    ? 'rgba(34, 197, 94, 0.12)'
    : tone === 'warn'
      ? 'rgba(245, 158, 11, 0.14)'
      : 'rgba(239, 68, 68, 0.14)';
  const borderColor = tone === 'live'
    ? 'rgba(34, 197, 94, 0.24)'
    : tone === 'warn'
      ? 'rgba(245, 158, 11, 0.24)'
      : 'rgba(239, 68, 68, 0.24)';
  const color = tone === 'live'
    ? Colors.success
    : tone === 'warn'
      ? Colors.warning
      : Colors.error;

  const chipIcon = icon === 'users'
    ? <Users size={14} color={color} />
    : icon === 'shield'
      ? <ShieldCheck size={14} color={color} />
      : icon === 'lock'
        ? <Lock size={14} color={color} />
        : tone === 'live'
          ? <Wifi size={14} color={color} />
          : <WifiOff size={14} color={color} />;

  return (
    <View style={[styles.statusChip, { backgroundColor, borderColor }]} testID={`chat-room-status-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      {chipIcon}
      <Text style={[styles.statusChipText, { color }]}>{label}</Text>
    </View>
  );
});

export default function ChatHubScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 430;
  const roomId = useMemo<string>(() => getDefaultChatRoomId(), []);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const socketRef = useRef<ChatSocket | null>(null);
  const pulse = useRef(new Animated.Value(0.96)).current;
  const [usernameDraft, setUsernameDraft] = useState<string>(GUEST_NAME);
  const [activeUsername, setActiveUsername] = useState<string>(GUEST_NAME);
  const [composerValue, setComposerValue] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createSupportMessage(WELCOME_COPY)]);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);

  const healthQuery = useQuery<ChatRoomHealthResponse, Error>({
    queryKey: ['chat-room', 'health'],
    queryFn: fetchChatHealth,
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const messagesQuery = useQuery({
    queryKey: ['chat-room', 'messages', roomId],
    queryFn: async () => fetchChatMessages(roomId, REFRESH_LIMIT),
    staleTime: 10_000,
    retry: 1,
  });

  const roomStateQuery = useQuery({
    queryKey: ['chat-room', 'state', roomId],
    queryFn: async () => fetchChatRoomState(roomId),
    staleTime: 10_000,
    refetchInterval: 20_000,
    retry: 1,
  });

  const appendIncomingMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => mergeMessages(current, [message]));
  }, []);

  const syncMessagesFromApi = useCallback((incomingMessages: ChatRoomMessage[]) => {
    const nextMessages = incomingMessages.map(mapRoomMessageToChatMessage);
    setMessages((current) => mergeMessages(current, nextMessages));
  }, []);

  useEffect(() => {
    if (messagesQuery.data?.messages) {
      console.log('[ChatHub] Syncing messages from API query', {
        roomId,
        count: messagesQuery.data.messages.length,
      });
      syncMessagesFromApi(messagesQuery.data.messages);
    }
  }, [messagesQuery.data?.messages, roomId, syncMessagesFromApi]);

  useEffect(() => {
    if (typeof roomStateQuery.data?.room.onlineCount === 'number') {
      setOnlineCount(roomStateQuery.data.room.onlineCount);
    }
  }, [roomStateQuery.data?.room.onlineCount]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.96, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    console.log('[ChatHub] Creating realtime socket', {
      roomId,
      activeUsername,
      apiBaseUrl: getChatApiBaseUrl(),
    });

    const socket = createChatSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[ChatHub] Socket connected', { roomId, activeUsername, socketId: socket.id });
      setSocketConnected(true);
      setSocketError(null);
      socket.emit('room:join', { roomId, username: activeUsername });
    });

    socket.on('disconnect', (reason) => {
      console.log('[ChatHub] Socket disconnected', { reason });
      setSocketConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.log('[ChatHub] Socket connection error', error.message);
      setSocketConnected(false);
      setSocketError(error.message);
    });

    socket.on('chat:welcome', (payload) => {
      console.log('[ChatHub] Socket welcome payload', payload);
    });

    socket.on('room:joined', (payload) => {
      console.log('[ChatHub] Room joined', payload);
      setOnlineCount(payload.onlineCount);
    });

    socket.on('room:state', (payload) => {
      console.log('[ChatHub] Room state update', payload);
      if (payload.roomId === roomId) {
        setOnlineCount(payload.onlineCount);
      }
    });

    socket.on('chat:message', (payload) => {
      console.log('[ChatHub] Incoming realtime message', {
        messageId: payload.id,
        roomId: payload.roomId,
        username: payload.username,
      });
      appendIncomingMessage(mapRoomMessageToChatMessage(payload));
    });

    socket.on('chat:error', (payload) => {
      console.log('[ChatHub] Socket message error', payload);
      setSocketError(payload.error);
    });

    return () => {
      console.log('[ChatHub] Cleaning up realtime socket');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [activeUsername, appendIncomingMessage, roomId]);

  const sendMutation = useMutation<ChatRoomSendResponse, Error, { text: string }>({
    mutationKey: ['chat-room', 'send-message', roomId, activeUsername],
    mutationFn: async ({ text }) => {
      const payload = {
        roomId,
        username: activeUsername,
        text,
        source: 'user' as const,
      };
      const socket = socketRef.current;

      if (socket?.connected) {
        console.log('[ChatHub] Sending message through Socket.IO', {
          roomId,
          activeUsername,
          preview: text.slice(0, 120),
        });

        return await new Promise<ChatRoomSendResponse>((resolve, reject) => {
          let settled = false;
          const timeoutHandle = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            reject(new Error('Realtime send timed out. Falling back to HTTP is recommended.'));
          }, 6_000);

          socket.emit('chat:send', payload, (acknowledgement?: ChatSocketAcknowledgement) => {
            if (settled) {
              return;
            }

            settled = true;
            clearTimeout(timeoutHandle);

            if (acknowledgement?.ok && acknowledgement.message) {
              resolve({
                ok: true,
                message: acknowledgement.message,
                deploymentMarker: 'socket-ack',
              });
              return;
            }

            reject(new Error(acknowledgement?.error ?? 'Realtime send failed.'));
          });
        });
      }

      console.log('[ChatHub] Socket unavailable, using HTTP message send fallback', {
        roomId,
        activeUsername,
      });
      const response = await sendChatMessage(payload);
      return response;
    },
    onSuccess: async (response) => {
      setComposerValue('');
      setSocketError(null);
      appendIncomingMessage(mapRoomMessageToChatMessage(response.message));
      if (response.assistantMessage) {
        appendIncomingMessage(mapRoomMessageToChatMessage(response.assistantMessage));
      }
      await Haptics.selectionAsync();
    },
    onError: async (error) => {
      console.log('[ChatHub] Send mutation failed', error.message);
      setSocketError(error.message);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
  });

  const canSend = useMemo<boolean>(() => {
    return readTrimmed(composerValue).length > 0 && !sendMutation.isPending;
  }, [composerValue, sendMutation.isPending]);

  const isRefreshing = healthQuery.isRefetching || messagesQuery.isRefetching || roomStateQuery.isRefetching;
  const deploymentMarker = healthQuery.data?.deploymentMarker ?? messagesQuery.data?.deploymentMarker ?? roomStateQuery.data?.deploymentMarker ?? null;
  const aiProvider = (healthQuery.data?.aiProvider ?? (healthQuery.data?.aiEnabled ? 'chatgpt' : 'fallback')) as ChatRoomAIProvider;
  const apiHealthLabel = healthQuery.data?.ok ? 'API healthy' : healthQuery.error ? 'API issue' : 'Checking API';
  const socketLabel = socketConnected ? 'Realtime live' : socketError ? 'Realtime retrying' : 'Connecting room';
  const securityLabel = aiProvider === 'chatgpt' && healthQuery.data?.aiEnabled ? 'ChatGPT connected' : 'Fallback mode';
  const roomLabel = `Room ${roomId}`;

  const handleApplyUsername = useCallback(async () => {
    const nextUsername = sanitizeUsername(usernameDraft);
    console.log('[ChatHub] Applying username', { nextUsername });
    setActiveUsername(nextUsername);
    await Haptics.selectionAsync();
  }, [usernameDraft]);

  const handleRefresh = useCallback(() => {
    console.log('[ChatHub] Manual refresh requested');
    void Promise.all([
      healthQuery.refetch(),
      messagesQuery.refetch(),
      roomStateQuery.refetch(),
    ]);
  }, [healthQuery, messagesQuery, roomStateQuery]);

  const handleSend = useCallback(async () => {
    const nextText = readTrimmed(composerValue);
    if (!nextText || sendMutation.isPending) {
      return;
    }

    await sendMutation.mutateAsync({ text: nextText });
  }, [composerValue, sendMutation]);

  const heroSubtitle = useMemo<string>(() => {
    if (socketConnected && healthQuery.data?.ok) {
      return 'Your shared room is live on the API, backed by SQLite, and ready for realtime chat.';
    }

    if (socketError) {
      return socketError;
    }

    if (healthQuery.error) {
      return healthQuery.error.message;
    }

    return 'Connecting the room, checking health, and preparing the realtime channel.';
  }, [healthQuery.data?.ok, healthQuery.error, socketConnected, socketError]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    return <ChatBubble message={item} />;
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <ErrorBoundary fallbackTitle="IVX live chat room unavailable">
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient
          colors={['#040404', '#0C1116', '#040404']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.keyboardView}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.headerShell}>
              <Animated.View style={[styles.heroCard, { transform: [{ scale: pulse }] }]} testID="chat-room-hero-card">
                <LinearGradient
                  colors={['rgba(255, 215, 0, 0.18)', 'rgba(255, 215, 0, 0.04)', 'rgba(17, 17, 17, 0.96)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroGradient}
                />
                <View style={styles.heroContent}>
                  <View style={styles.heroTopRow}>
                    <View style={styles.heroTextWrap}>
                      <Text style={styles.eyebrow}>CHAT.IVXHOLDING.COM</Text>
                      <Text style={styles.heroTitle}>Live chat room</Text>
                      <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
                    </View>
                    <Pressable
                      onPress={handleRefresh}
                      style={({ pressed }) => [styles.refreshButton, pressed && styles.refreshButtonPressed]}
                      testID="chat-room-refresh-button"
                    >
                      <RefreshCw size={16} color={Colors.text} />
                    </Pressable>
                  </View>

                  <View style={styles.chipRow}>
                    <StatusChip label={apiHealthLabel} tone={healthQuery.data?.ok ? 'live' : healthQuery.error ? 'error' : 'warn'} icon="wifi" />
                    <StatusChip label={socketLabel} tone={socketConnected ? 'live' : socketError ? 'error' : 'warn'} icon="wifi" />
                  </View>
                  <View style={styles.chipRow}>
                    <StatusChip label={`${onlineCount} online`} tone="live" icon="users" />
                    <StatusChip label={securityLabel} tone={healthQuery.data?.aiEnabled ? 'live' : 'warn'} icon="shield" />
                  </View>
                </View>
              </Animated.View>

              <View style={styles.setupCard} testID="chat-room-setup-card">
                <View style={styles.setupHeaderRow}>
                  <Text style={styles.setupTitle}>Room setup</Text>
                  <Text style={styles.setupMeta}>{roomLabel}</Text>
                </View>
                <View style={[styles.identityRow, isCompact && styles.identityRowCompact]}>
                  <View style={styles.identityInputWrap}>
                    <Text style={styles.fieldLabel}>Guest name</Text>
                    <TextInput
                      value={usernameDraft}
                      onChangeText={setUsernameDraft}
                      onSubmitEditing={() => {
                        void handleApplyUsername();
                      }}
                      autoCapitalize="words"
                      autoCorrect={false}
                      placeholder="Guest"
                      placeholderTextColor={Colors.textTertiary}
                      style={styles.identityInput}
                      maxLength={32}
                      testID="chat-room-username-input"
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      void handleApplyUsername();
                    }}
                    style={({ pressed }) => [styles.joinButton, pressed && styles.joinButtonPressed]}
                    testID="chat-room-apply-username"
                  >
                    <Text style={styles.joinButtonText}>Join room</Text>
                  </Pressable>
                </View>
                <View style={styles.setupFooterRow}>
                  <Text style={styles.setupFooterText}>Posting as {activeUsername}</Text>
                  <Text style={styles.setupFooterText}>API {getChatApiBaseUrl()}</Text>
                </View>
              </View>
            </View>

            <View style={styles.feedCard} testID="chat-room-feed-card">
              <View style={styles.feedHeaderRow}>
                <Text style={styles.feedTitle}>Messages</Text>
                <Text style={styles.feedMetaText}>{roomStateQuery.data?.room.messageCount ?? messages.length} total</Text>
              </View>

              {socketError ? (
                <View style={styles.errorBanner} testID="chat-room-error-banner">
                  <WifiOff size={14} color={Colors.warning} />
                  <Text style={styles.errorBannerText}>{socketError}</Text>
                </View>
              ) : null}

              <FlatList
                ref={listRef}
                data={messages}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
                ListFooterComponent={sendMutation.isPending ? (
                  <View style={styles.typingRow} testID="chat-room-sending-state">
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.typingText}>Sending your message…</Text>
                  </View>
                ) : <View style={styles.listFooterSpacing} />}
                testID="chat-room-message-list"
              />
            </View>

            <View style={styles.composerShell}>
              <View style={styles.composerCard} testID="chat-room-composer-card">
                <View style={styles.composerInputWrap}>
                  <Text style={styles.fieldLabel}>Message</Text>
                  <TextInput
                    value={composerValue}
                    onChangeText={setComposerValue}
                    placeholder="Type a message to the room"
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                    maxLength={1200}
                    editable={!sendMutation.isPending}
                    style={styles.composerInput}
                    testID="chat-room-message-input"
                  />
                </View>
                <Pressable
                  onPress={() => {
                    void handleSend();
                  }}
                  disabled={!canSend}
                  style={({ pressed }) => [styles.sendButton, !canSend && styles.sendButtonDisabled, pressed && canSend && styles.sendButtonPressed]}
                  testID="chat-room-send-button"
                >
                  <Send size={18} color={canSend ? Colors.black : Colors.textTertiary} />
                </Pressable>
              </View>
              <View style={styles.bottomMetaRow}>
                <Text style={styles.bottomMetaText}>{deploymentMarker ? `Deploy ${deploymentMarker}` : 'Deployment marker pending'}</Text>
                <Text style={styles.bottomMetaText}>{`${healthQuery.data?.openAIModel ?? 'openai/gpt-4o-mini'} • ${aiProvider}`}</Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#040404',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  headerShell: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  heroCard: {
    position: 'relative',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.14)',
    backgroundColor: '#101010',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroContent: {
    padding: 20,
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTextWrap: {
    flex: 1,
  },
  eyebrow: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: '800' as const,
    marginTop: 4,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(17, 17, 17, 0.92)',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  setupCard: {
    backgroundColor: 'rgba(14, 14, 14, 0.94)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 18,
    gap: 14,
  },
  setupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  setupTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800' as const,
  },
  setupMeta: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  identityRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  identityInputWrap: {
    flex: 1,
    gap: 8,
  },
  fieldLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  identityInput: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: '#101010',
    paddingHorizontal: 16,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  joinButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  joinButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  setupFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  setupFooterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  feedCard: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 28,
    backgroundColor: 'rgba(10, 10, 10, 0.96)',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  feedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 12,
  },
  feedTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800' as const,
  },
  feedMetaText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.24)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 14,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  listFooterSpacing: {
    height: 8,
  },
  composerShell: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(12, 12, 12, 0.98)',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  composerInputWrap: {
    flex: 1,
    gap: 8,
  },
  composerInput: {
    minHeight: 30,
    maxHeight: 120,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 21,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  sendButtonDisabled: {
    backgroundColor: Colors.backgroundSecondary,
  },
  bottomMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  bottomMetaText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
