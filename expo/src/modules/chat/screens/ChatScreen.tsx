import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Radio, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { Composer } from '../components/Composer';
import { MessageBubble } from '../components/MessageBubble';
import { getChatMessagesQueryKey, useChatMessages } from '../hooks/useChatMessages';
import { chatService } from '../services/chatService';
import type { ChatFileType, ChatMessage } from '../types/chat';

type ChatScreenProps = {
  conversationId: string;
  currentUserId: string;
};

type ComposerPayload = {
  text?: string;
  fileUrl?: string;
  fileType?: ChatFileType;
};

function getRoomLabel(conversationId: string): string {
  return conversationId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(' ');
}

export function ChatScreen({ conversationId, currentUserId }: ChatScreenProps) {
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const screenRef = useRef<View | null>(null);
  const screenFrameRef = useRef<{ y: number; height: number }>({ y: 0, height: 0 });
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState<number>(0);
  const stableConversationId = useMemo(() => conversationId.trim(), [conversationId]);
  const roomLabel = useMemo(() => getRoomLabel(stableConversationId), [stableConversationId]);
  const { messages, loading, error, refetch, isRefreshing } = useChatMessages(stableConversationId);
  const keyboardBehavior = Platform.select<'padding' | undefined>({
    ios: 'padding',
    android: undefined,
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
  const listContentStyle = useMemo(
    () => [
      messages.length === 0 ? styles.emptyContent : styles.listContent,
      { paddingBottom: 10 },
    ],
    [messages.length],
  );

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

  const sendMessageMutation = useMutation<void, Error, ComposerPayload>({
    mutationFn: async (payload) => {
      console.log('[ChatScreen] Sending payload:', {
        conversationId: stableConversationId,
        currentUserId,
        hasText: !!payload.text,
        hasFile: !!payload.fileUrl,
        fileType: payload.fileType ?? null,
      });

      await chatService.sendMessage({
        conversationId: stableConversationId,
        senderId: currentUserId,
        text: payload.text,
        fileUrl: payload.fileUrl,
        fileType: payload.fileType,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: getChatMessagesQueryKey(stableConversationId),
      });
      scrollToBottom(true);
    },
    onError: (mutationError) => {
      console.log('[ChatScreen] Send error:', mutationError.message);
      Alert.alert('Message not sent', mutationError.message || 'Please try again in a moment.');
    },
  });

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollToBottom(true);
    }, 80);

    return () => clearTimeout(timeout);
  }, [messages.length, scrollToBottom]);

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

  const handleRefresh = useCallback(async () => {
    console.log('[ChatScreen] Refresh requested');
    await refetch();
    scrollToBottom(false);
  }, [refetch, scrollToBottom]);

  const handleRetry = useCallback(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      return <MessageBubble message={item} isMine={item.senderId === currentUserId} />;
    },
    [currentUserId],
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
        <View style={styles.heroCard} testID="chat-room-hero">
          <View style={styles.heroLeft}>
            <View style={styles.statusPill}>
              <Radio size={14} color={Colors.primary} />
              <Text style={styles.statusPillText}>Realtime room</Text>
            </View>
            <Text style={styles.heroTitle}>{roomLabel || 'Message Room'}</Text>
            <Text style={styles.heroSubtitle}>Conversation ID: {stableConversationId}</Text>
          </View>
        </View>

        <View style={[styles.body, androidKeyboardInset > 0 ? { paddingBottom: androidKeyboardInset } : null]}>
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

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          style={styles.list}
          contentContainerStyle={listContentStyle}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
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
            scrollToBottom(messages.length > 1);
          }}
          onLayout={() => {
            scrollToBottom(false);
          }}
          ListEmptyComponent={
            loading ? (
              <View style={styles.centerState} testID="chat-room-loading">
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.centerTitle}>Loading messages…</Text>
                <Text style={styles.centerText}>Connecting to the IVX message stream.</Text>
              </View>
            ) : (
              <View style={styles.centerState} testID="chat-room-empty">
                <Text style={styles.centerTitle}>No messages yet</Text>
                <Text style={styles.centerText}>Start the room with a note, image, video, or PDF.</Text>
              </View>
            )
          }
          testID="chat-room-list"
        />

        <Composer
          onSend={async (payload) => {
            await sendMessageMutation.mutateAsync(payload);
          }}
          sending={sendMessageMutation.isPending}
          onFocus={() => {
            updateScreenFrame();
            scrollToBottom(true);
          }}
          bottomInset={composerBottomInset}
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
  },
  statusPillText: {
    color: Colors.primary,
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
  body: {
    flex: 1,
    minHeight: 0,
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
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  emptyContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    justifyContent: 'center',
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
  pressed: {
    opacity: 0.84,
  },
});
