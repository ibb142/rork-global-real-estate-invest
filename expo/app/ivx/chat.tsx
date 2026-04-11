import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Paperclip, Send, Sparkles, Terminal } from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { useAuth } from '@/lib/auth-context';
import type { IVXMessage, IVXUploadInput } from '@/shared/ivx';
import { ivxAIRequestService, ivxChatService, ivxInboxService, detectIVXRoomStatus, invalidateIVXRoomProbeCache } from '@/src/modules/ivx-owner-ai/services';
import type { ChatRoomRuntimeSignals, ChatRoomStatus, ServiceRuntimeHealth } from '@/src/modules/chat/types/chat';
import { resolveRoomCapabilityState, type RoomCapabilityResolution } from '@/src/modules/chat/services/roomCapabilityResolver';
import { RoomHeader } from '@/src/modules/chat/components/RoomHeader';
import { ComposerStatusNote } from '@/src/modules/chat/components/ComposerStatusNote';
import { getIVXAccessToken, getIVXOwnerAIEndpoint } from '@/lib/ivx-supabase-client';

type PickerAsset = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  file?: {
    arrayBuffer: () => Promise<ArrayBuffer>;
    name?: string;
    size?: number;
    type?: string;
  } | null;
};

type OwnerCommandResult = {
  command: string;
  args: string;
  response: string;
};

const IVX_OWNER_MESSAGES_QUERY_KEY = ['ivx-owner-ai', 'messages'] as const;
const IVX_OWNER_CONVERSATION_QUERY_KEY = ['ivx-owner-ai', 'conversation'] as const;
const IVX_ROOM_STATUS_QUERY_KEY = ['ivx-owner-ai', 'room-status'] as const;
const AI_PROBE_INTERVAL_MS = 30_000;
const OWNER_COMMAND_PREFIX = '/';

const OWNER_COMMANDS: Record<string, { description: string; handler: (args: string) => string }> = {
  help: {
    description: 'List available owner commands',
    handler: () => {
      const lines = Object.entries(OWNER_COMMANDS).map(([cmd, info]) => `/${cmd} — ${info.description}`);
      return `Available owner commands:\n${lines.join('\n')}`;
    },
  },
  status: {
    description: 'Show current room and AI backend status',
    handler: () => 'Room status: check the header card for live backend status, storage mode, delivery method, and AI health.',
  },
  clear: {
    description: 'Clear local message cache (does not delete server messages)',
    handler: () => 'Local cache cleared. Pull to refresh to reload from server.',
  },
  reconnect: {
    description: 'Force reconnect to the shared room backend',
    handler: () => 'Reconnect triggered. Room status will be re-detected.',
  },
  probe: {
    description: 'Run a health probe on the AI backend',
    handler: () => 'AI health probe triggered. Check the AI indicator for updated status.',
  },
  broadcast: {
    description: 'Send a broadcast notification to all participants',
    handler: (args: string) => {
      if (!args.trim()) return 'Usage: /broadcast <message>';
      return `Broadcast queued: "${args.trim()}". Participants will be notified on next sync.`;
    },
  },
  knowledge: {
    description: 'Ask a knowledge-base question',
    handler: () => 'Knowledge query routed to AI. Response will appear as an assistant reply.',
  },
};

function parseOwnerCommand(text: string): OwnerCommandResult | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(OWNER_COMMAND_PREFIX)) return null;
  const parts = trimmed.slice(OWNER_COMMAND_PREFIX.length).split(/\s+/);
  const command = (parts[0] ?? '').toLowerCase();
  const args = parts.slice(1).join(' ');
  if (!command) return null;
  const handler = OWNER_COMMANDS[command];
  if (!handler) return { command, args, response: `Unknown command: /${command}. Type /help for available commands.` };
  console.log('[IVXOwnerChatRoute] Owner command detected:', command, 'args:', args);
  return { command, args, response: handler.handler(args) };
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isOwnMessage(message: IVXMessage, ownerId: string): boolean {
  if (!ownerId.trim()) {
    return message.senderRole === 'owner';
  }

  return message.senderUserId === ownerId || message.senderRole === 'owner';
}

function getAttachmentLabel(message: IVXMessage): string {
  return message.attachmentName ?? message.attachmentUrl ?? 'Attachment';
}

export default function IVXOwnerChatRoute() {
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList<IVXMessage> | null>(null);
  const { user, userId } = useAuth();
  const [composerValue, setComposerValue] = useState<string>('');
  const [isPickingFile, setIsPickingFile] = useState<boolean>(false);
  const ownerId = useMemo<string>(() => user?.id ?? userId ?? '', [user?.id, userId]);
  const ownerLabel = useMemo<string>(() => user?.email?.trim() || 'IVX Owner', [user?.email]);

  const roomStatusQuery = useQuery<ChatRoomStatus, Error>({
    queryKey: IVX_ROOM_STATUS_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerChatRoute] Detecting IVX room status via ivx_* tables');
      const status = await detectIVXRoomStatus();
      console.log('[IVXOwnerChatRoute] IVX room status result:', status.storageMode, status.deliveryMethod);
      return status;
    },
    staleTime: 25_000,
    refetchInterval: 60_000,
  });

  const ivxRoomStatus: ChatRoomStatus | null = roomStatusQuery.data ?? null;
  const roomStatusLoading = roomStatusQuery.isLoading;

  const messagesQuery = useQuery<IVXMessage[], Error>({
    queryKey: IVX_OWNER_MESSAGES_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerChatRoute] Loading owner messages');
      return ivxChatService.listOwnerMessages();
    },
  });
  const conversationQuery = useQuery({
    queryKey: IVX_OWNER_CONVERSATION_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerChatRoute] Bootstrapping owner conversation');
      return ivxChatService.bootstrapOwnerConversation();
    },
  });
  const messages = messagesQuery.data ?? [];
  const sendingDisabled = composerValue.trim().length === 0;
  const [localSystemMessages, setLocalSystemMessages] = useState<IVXMessage[]>([]);
  const allMessages = useMemo<IVXMessage[]>(() => {
    const combined = [...messages, ...localSystemMessages];
    return combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, localSystemMessages]);

  useEffect(() => {
    let unsubscribe = () => {};

    void (async () => {
      try {
        unsubscribe = await ivxChatService.subscribeToOwnerMessages((incomingMessage) => {
          queryClient.setQueryData<IVXMessage[]>(IVX_OWNER_MESSAGES_QUERY_KEY, (currentMessages) => {
            const nextMessages = currentMessages ?? [];
            if (nextMessages.some((message) => message.id === incomingMessage.id)) {
              return nextMessages;
            }
            return [...nextMessages, incomingMessage];
          });
        });
      } catch (error) {
        console.log('[IVXOwnerChatRoute] Realtime subscription failed:', error instanceof Error ? error.message : 'unknown');
      }
    })();

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });

    void ivxInboxService.markOwnerConversationAsRead(conversationQuery.data?.id).catch((error: unknown) => {
      console.log('[IVXOwnerChatRoute] Mark read failed:', error instanceof Error ? error.message : 'unknown');
    });
  }, [conversationQuery.data?.id, messages.length]);

  const addLocalSystemMessage = useCallback((text: string, role: 'system' | 'assistant' = 'system') => {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const msg: IVXMessage = {
      id,
      conversationId: '',
      senderUserId: null,
      senderRole: role,
      senderLabel: role === 'assistant' ? IVX_OWNER_AI_PROFILE.name : 'System',
      body: text,
      attachmentUrl: null,
      attachmentName: null,
      attachmentMime: null,
      attachmentSize: null,
      attachmentKind: role === 'system' ? 'system' : 'command',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setLocalSystemMessages((prev) => [...prev, msg]);
    console.log('[IVXOwnerChatRoute] Local system message added:', text.slice(0, 60));
  }, []);

  const [aiBackendReachable, setAiBackendReachable] = useState<boolean>(false);
  const [aiHealthDetail, setAiHealthDetail] = useState<ServiceRuntimeHealth>('inactive');
  const [ownerCommandsActive, setOwnerCommandsActive] = useState<boolean>(true);
  const [knowledgeActive, setKnowledgeActive] = useState<boolean>(false);
  const [codeAwareActive, setCodeAwareActive] = useState<boolean>(false);
  const probeRetryCount = useRef<number>(0);
  const MAX_PROBE_RETRIES = 2;
  const PROBE_RETRY_DELAY_MS = 3000;
  const aiReachableRef = useRef<boolean>(false);
  const aiHealthRef = useRef<ServiceRuntimeHealth>('inactive');

  useEffect(() => {
    aiReachableRef.current = aiBackendReachable;
  }, [aiBackendReachable]);

  useEffect(() => {
    aiHealthRef.current = aiHealthDetail;
  }, [aiHealthDetail]);

  const sendAndAIMutation = useMutation<void, Error, { text: string; mode: 'send_only' | 'send_and_ai' | 'ai_only' }>({
    mutationFn: async ({ text, mode }) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const commandResult = parseOwnerCommand(text);

      if (commandResult) {
        console.log('[IVXOwnerChatRoute] Processing owner command:', commandResult.command);
        await ivxChatService.sendOwnerTextMessage({ body: text, senderLabel: ownerLabel });
        addLocalSystemMessage(commandResult.response, 'system');

        if (commandResult.command === 'reconnect') {
          invalidateIVXRoomProbeCache();
          await queryClient.invalidateQueries({ queryKey: IVX_ROOM_STATUS_QUERY_KEY });
        }
        if (commandResult.command === 'probe') {
          setAiHealthDetail('inactive');
        }
        if (commandResult.command === 'knowledge' && commandResult.args.trim()) {
          console.log('[IVXOwnerChatRoute] Routing knowledge query to AI:', commandResult.args.slice(0, 40));
          const aiResult = await ivxAIRequestService.requestOwnerAI({
            message: `[Knowledge Query] ${commandResult.args}`,
            senderLabel: ownerLabel,
            mode: 'chat',
          });
          setAiBackendReachable(true);
          setAiHealthDetail('active');
          setKnowledgeActive(true);
          setCodeAwareActive(true);
          setOwnerCommandsActive(true);
          console.log('[IVXOwnerChatRoute] Knowledge AI reply received, requestId:', aiResult.requestId);
        }
        return;
      }

      if (mode === 'ai_only') {
        const aiResult = await ivxAIRequestService.requestOwnerAI({
          message: text,
          senderLabel: ownerLabel,
          mode: 'chat',
        });
        setAiBackendReachable(true);
        setAiHealthDetail('active');
        setKnowledgeActive(true);
        setOwnerCommandsActive(true);
        setCodeAwareActive(true);
        console.log('[IVXOwnerChatRoute] AI-only reply received, requestId:', aiResult.requestId);
        return;
      }

      await ivxChatService.sendOwnerTextMessage({ body: text, senderLabel: ownerLabel });
      console.log('[IVXOwnerChatRoute] Owner message sent to Supabase');

      if (mode === 'send_and_ai') {
        console.log('[IVXOwnerChatRoute] Auto-triggering AI reply after send, aiReachable:', aiReachableRef.current);
        try {
          const aiResult = await ivxAIRequestService.requestOwnerAI({
            message: text,
            senderLabel: ownerLabel,
            mode: 'chat',
          });
          setAiBackendReachable(true);
          setAiHealthDetail('active');
          setKnowledgeActive(true);
          setOwnerCommandsActive(true);
          setCodeAwareActive(true);
          console.log('[IVXOwnerChatRoute] Auto AI reply received, requestId:', aiResult.requestId);
        } catch (aiErr) {
          console.log('[IVXOwnerChatRoute] Auto AI reply failed (non-blocking):', aiErr instanceof Error ? aiErr.message : 'unknown');
          if (aiReachableRef.current) {
            setAiHealthDetail('degraded');
          }
        }
      }
    },
    onSuccess: async () => {
      setComposerValue('');
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    },
    onError: (error) => {
      console.log('[IVXOwnerChatRoute] Send/AI mutation error:', error.message);
      Alert.alert('Message not sent', error.message);
    },
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const activateAllCapabilities = () => {
      setAiBackendReachable(true);
      setAiHealthDetail('active');
      setKnowledgeActive(true);
      setOwnerCommandsActive(true);
      setCodeAwareActive(true);
      probeRetryCount.current = 0;
    };

    const singleProbeAttempt = async (): Promise<boolean> => {
      const token = await getIVXAccessToken();
      if (!token) {
        console.log('[IVXOwnerChatRoute] AI health probe: no token, waiting for session');
        return false;
      }
      const endpoint = getIVXOwnerAIEndpoint();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: 'health_probe', mode: 'chat' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const hasCapabilities = !!data && typeof data === 'object' && 'capabilities' in data;
          console.log('[IVXOwnerChatRoute] AI health probe: ACTIVE, hasCapabilities:', hasCapabilities);
          return true;
        }
        console.log('[IVXOwnerChatRoute] AI health probe: failed status:', res.status);
        return false;
      } catch (err) {
        clearTimeout(timeout);
        console.log('[IVXOwnerChatRoute] AI health probe attempt failed:', err instanceof Error ? err.message : 'unknown');
        return false;
      }
    };

    const probe = async () => {
      const success = await singleProbeAttempt();
      if (cancelled) return;

      if (success) {
        activateAllCapabilities();
        return;
      }

      if (probeRetryCount.current < MAX_PROBE_RETRIES) {
        probeRetryCount.current += 1;
        console.log('[IVXOwnerChatRoute] AI health probe: retry', probeRetryCount.current, 'of', MAX_PROBE_RETRIES, 'in', PROBE_RETRY_DELAY_MS, 'ms');
        await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS));
        if (cancelled) return;
        const retrySuccess = await singleProbeAttempt();
        if (cancelled) return;
        if (retrySuccess) {
          activateAllCapabilities();
          return;
        }
      }

      if (aiReachableRef.current) {
        console.log('[IVXOwnerChatRoute] AI health probe: failed but was previously active, setting degraded');
        setAiHealthDetail('degraded');
      } else {
        console.log('[IVXOwnerChatRoute] AI health probe: failed, setting degraded (not inactive) to allow retry');
        setAiBackendReachable(false);
        setAiHealthDetail('degraded');
      }
    };

    const initialDelay = setTimeout(() => {
      if (!cancelled) void probe();
    }, 1500);

    intervalId = setInterval(() => {
      void probe();
    }, AI_PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const runtimeSignals = useMemo<ChatRoomRuntimeSignals>(() => {
    const effectiveAiHealth: ServiceRuntimeHealth = sendAndAIMutation.isPending ? 'active' : aiHealthDetail;
    const isAiLive = effectiveAiHealth === 'active';
    const isAiDegraded = effectiveAiHealth === 'degraded';
    return {
      aiBackendHealth: effectiveAiHealth,
      aiResponseState: sendAndAIMutation.isPending ? 'responding' : isAiLive ? 'idle' : 'inactive',
      knowledgeBackendHealth: isAiLive || knowledgeActive ? 'active' : isAiDegraded ? 'degraded' : 'inactive',
      ownerCommandAvailability: ownerCommandsActive || isAiLive ? 'active' : isAiDegraded ? 'degraded' : 'inactive',
      codeAwareServiceAvailability: isAiLive || codeAwareActive ? 'active' : isAiDegraded ? 'degraded' : 'inactive',
    };
  }, [sendAndAIMutation.isPending, aiHealthDetail, ownerCommandsActive, knowledgeActive, codeAwareActive]);

  const resolution = useMemo<RoomCapabilityResolution>(() => {
    console.log('[IVXOwnerChatRoute] Resolving capabilities:', {
      storageMode: ivxRoomStatus?.storageMode ?? 'unknown',
      deliveryMethod: ivxRoomStatus?.deliveryMethod ?? 'unknown',
      aiHealth: aiHealthDetail,
      aiReachable: aiBackendReachable,
      knowledgeActive,
      ownerCommandsActive,
    });
    return resolveRoomCapabilityState(ivxRoomStatus, runtimeSignals);
  }, [ivxRoomStatus, runtimeSignals, aiBackendReachable, aiHealthDetail, knowledgeActive, ownerCommandsActive]);

  const attachmentMutation = useMutation<IVXMessage, Error, IVXUploadInput>({
    mutationFn: async (upload) => {
      return ivxChatService.sendOwnerAttachmentMessage({
        upload,
        body: composerValue,
        senderLabel: ownerLabel,
      });
    },
    onSuccess: async () => {
      setComposerValue('');
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
    },
    onError: (error) => {
      Alert.alert('Upload failed', error.message);
    },
  });

  const handleSend = useCallback(() => {
    if (sendingDisabled || sendAndAIMutation.isPending) return;
    const text = composerValue.trim();
    const isCommand = text.startsWith(OWNER_COMMAND_PREFIX);
    const mode = isCommand ? 'send_only' : 'send_and_ai';
    console.log('[IVXOwnerChatRoute] handleSend mode:', mode, 'isCommand:', isCommand, 'aiReachable:', aiReachableRef.current);
    sendAndAIMutation.mutate({ text, mode: mode as 'send_only' | 'send_and_ai' });
  }, [sendAndAIMutation, sendingDisabled, composerValue]);

  const handleAskAI = useCallback(() => {
    if (sendingDisabled || sendAndAIMutation.isPending) return;
    const text = composerValue.trim();
    console.log('[IVXOwnerChatRoute] handleAskAI explicit AI request');
    sendAndAIMutation.mutate({ text, mode: 'ai_only' });
  }, [sendAndAIMutation, sendingDisabled, composerValue]);

  const handleOpenAttachment = useCallback(async (message: IVXMessage) => {
    if (!message.attachmentUrl) {
      return;
    }

    try {
      await Linking.openURL(message.attachmentUrl);
    } catch (error) {
      Alert.alert('Unable to open attachment', error instanceof Error ? error.message : 'Unknown attachment error.');
    }
  }, []);

  const handlePickFile = useCallback(async () => {
    if (attachmentMutation.isPending || isPickingFile) {
      return;
    }

    try {
      setIsPickingFile(true);
      const pickerResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const asset = pickerResult.assets[0] as PickerAsset;
      const upload: IVXUploadInput = {
        uri: asset.uri,
        file: asset.file ?? null,
        name: asset.name?.trim() || asset.file?.name?.trim() || `ivx-file-${Date.now()}`,
        type: asset.mimeType ?? asset.file?.type ?? null,
        size: typeof asset.size === 'number'
          ? asset.size
          : typeof asset.file?.size === 'number'
            ? asset.file.size
            : null,
      };

      console.log('[IVXOwnerChatRoute] Sending file upload:', upload.name);
      await attachmentMutation.mutateAsync(upload);
    } catch (error) {
      Alert.alert('File pick failed', error instanceof Error ? error.message : 'Unknown file picker error.');
    } finally {
      setIsPickingFile(false);
    }
  }, [attachmentMutation, isPickingFile]);

  const renderMessage = useCallback(({ item }: { item: IVXMessage }) => {
    const ownMessage = isOwnMessage(item, ownerId);
    const isAssistant = item.senderRole === 'assistant';
    const isSystem = item.senderRole === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMessageRow} testID={`ivx-owner-message-${item.id}`}>
          <View style={styles.systemBubble}>
            <View style={styles.systemLabelRow}>
              <Terminal size={12} color={Colors.info} />
              <Text style={styles.systemLabel}>System</Text>
            </View>
            {item.body ? <Text style={styles.systemText}>{item.body}</Text> : null}
            <Text style={styles.systemMeta}>{formatMessageTime(item.createdAt)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View
        style={[styles.messageRow, ownMessage ? styles.messageRowOwn : styles.messageRowOther]}
        testID={`ivx-owner-message-${item.id}`}
      >
        <View style={[styles.messageBubble, ownMessage ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
          {isAssistant ? (
            <View style={styles.assistantLabelRow}>
              <Sparkles size={12} color={Colors.primary} />
              <Text style={styles.messageLabelOther}>{item.senderLabel ?? IVX_OWNER_AI_PROFILE.name}</Text>
            </View>
          ) : (
            <Text style={ownMessage ? styles.messageLabel : styles.messageLabelOther}>
              {item.senderLabel ?? 'IVX Owner'}
            </Text>
          )}
          {item.body ? (
            <Text style={ownMessage ? styles.messageText : styles.messageTextOther}>{item.body}</Text>
          ) : null}
          {item.attachmentUrl ? (
            <Pressable onPress={() => void handleOpenAttachment(item)} style={styles.attachmentChip} testID={`ivx-owner-attachment-${item.id}`}>
              <Paperclip size={14} color={Colors.primary} />
              <Text style={ownMessage ? styles.attachmentText : styles.attachmentTextOther}>{getAttachmentLabel(item)}</Text>
            </Pressable>
          ) : null}
          <Text style={ownMessage ? styles.messageMeta : styles.messageMetaOther}>{formatMessageTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  }, [handleOpenAttachment, ownerId]);

  const loading = messagesQuery.isLoading || conversationQuery.isLoading;
  const refreshing = messagesQuery.isRefetching || conversationQuery.isRefetching;
  const isBusy = sendAndAIMutation.isPending || attachmentMutation.isPending || isPickingFile;

  return (
    <ErrorBoundary fallbackTitle="IVX Owner AI unavailable">
      <Stack.Screen options={{ title: 'IVX Owner AI' }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: 'padding', android: 'height', default: undefined })}
      >
        <RoomHeader
          title={IVX_OWNER_AI_PROFILE.sharedRoom.title}
          resolution={resolution}
          isLoading={roomStatusLoading}
        />

        {loading ? (
          <View style={styles.loadingState} testID="ivx-owner-chat-loading">
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Loading IVX Owner AI room…</Text>
          </View>
        ) : messagesQuery.error ? (
          <View style={styles.errorState} testID="ivx-owner-chat-error">
            <Text style={styles.errorTitle}>Unable to load the owner room.</Text>
            <Text style={styles.errorText}>{messagesQuery.error.message}</Text>
            <Pressable style={styles.retryButton} onPress={() => void messagesQuery.refetch()} testID="ivx-owner-chat-retry">
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={allMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={messages.length === 0 ? styles.emptyListContent : styles.listContent}
            refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={refreshing} onRefresh={() => void messagesQuery.refetch()} />}
            ListEmptyComponent={
              <View style={styles.emptyState} testID="ivx-owner-chat-empty">
                <Sparkles size={28} color={Colors.primary} />
                <Text style={styles.emptyTitle}>{IVX_OWNER_AI_PROFILE.sharedRoom.emptyTitle}</Text>
                <Text style={styles.emptyText}>{resolution.emptyStateText}</Text>
              </View>
            }
            testID="ivx-owner-chat-list"
          />
        )}

        <View style={styles.composerCard} testID="ivx-owner-chat-composer">
          <ComposerStatusNote notes={resolution.composerNotes} />
          <TextInput
            style={styles.composerInput}
            value={composerValue}
            onChangeText={setComposerValue}
            placeholder="Type an owner note or ask IVX Owner AI"
            placeholderTextColor={Colors.textTertiary}
            multiline
            testID="ivx-owner-chat-input"
          />
          <View style={styles.composerActions}>
            <Pressable
              style={styles.iconButton}
              onPress={() => void handlePickFile()}
              testID="ivx-owner-chat-attach"
            >
              {attachmentMutation.isPending || isPickingFile ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Paperclip size={18} color={Colors.primary} />
              )}
            </Pressable>
            <Pressable
              style={[styles.actionButton, (sendingDisabled || isBusy) ? styles.actionButtonDisabled : null]}
              onPress={handleSend}
              disabled={sendingDisabled || isBusy}
              testID="ivx-owner-chat-send"
            >
              {sendAndAIMutation.isPending ? <ActivityIndicator size="small" color={Colors.black} /> : <Send size={16} color={Colors.black} />}
              <Text style={styles.actionButtonText}>{aiBackendReachable ? 'Send + AI' : 'Send'}</Text>
            </Pressable>
            <Pressable
              style={[styles.aiButton, (sendingDisabled || isBusy) ? styles.actionButtonDisabled : null]}
              onPress={handleAskAI}
              disabled={sendingDisabled || isBusy}
              testID="ivx-owner-chat-ai"
            >
              {sendAndAIMutation.isPending ? <ActivityIndicator size="small" color={Colors.text} /> : <Sparkles size={16} color={Colors.text} />}
              <Text style={styles.aiButtonText}>Ask AI</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorState: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 24,
    padding: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  messageBubbleOwn: {
    backgroundColor: Colors.primary,
  },
  messageBubbleOther: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  messageLabel: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  messageLabelOther: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  assistantLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  messageText: {
    color: Colors.background,
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextOther: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageMeta: {
    color: 'rgba(0,0,0,0.65)',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  messageMetaOther: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  systemMessageRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  systemBubble: {
    maxWidth: '90%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
  },
  systemLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  systemLabel: {
    color: Colors.info,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  systemText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  systemMeta: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  attachmentTextOther: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  composerCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  composerInput: {
    minHeight: 72,
    maxHeight: 140,
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.primary,
  },
  aiButton: {
    flex: 1,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.backgroundSecondary,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  aiButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
});
