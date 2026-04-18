import React, { memo, useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Check, CheckCheck, FileText, PlayCircle, RefreshCw, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { openAttachment, shouldRenderInlineImage, shouldRenderTapToOpenAttachment } from '../services/ivxChat';
import type { ChatMessage } from '../types/chat';

type MessageBubbleProps = {
  message: ChatMessage;
  isMine: boolean;
  onRetry?: (message: ChatMessage) => void;
  onDismiss?: (messageId: string) => void;
};

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getAttachmentLabel(message: ChatMessage): string {
  if (message.fileName?.trim()) {
    return message.fileName.trim();
  }

  if (message.fileType === 'pdf') {
    return 'Open PDF attachment';
  }

  if (message.fileType === 'video') {
    return 'Open video attachment';
  }

  return 'Open file attachment';
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isMine,
  onRetry,
  onDismiss,
}: MessageBubbleProps) {
  const fadeAnim = useRef(new Animated.Value(message.sendStatus === 'sending' ? 0.7 : 1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (message.sendStatus === 'sending') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }

    if (message.sendStatus === 'failed') {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      pulseAnim.setValue(1);
    } else if (!message.sendStatus || message.sendStatus === 'sent') {
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      pulseAnim.setValue(1);
    }

    return undefined;
  }, [message.sendStatus, fadeAnim, pulseAnim]);

  const handleOpenAttachment = useCallback(async () => {
    console.log('[MessageBubble] Opening attachment:', message.fileUrl ?? null);

    try {
      await openAttachment(message.fileUrl);
    } catch (error) {
      console.log('[MessageBubble] Attachment open error:', (error as Error)?.message ?? 'Unknown error');
      Alert.alert('Attachment unavailable', 'This attachment could not be opened right now.');
    }
  }, [message.fileUrl]);

  const handleRetry = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRetry?.(message);
  }, [message, onRetry]);

  const handleDismiss = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss?.(message.id);
  }, [message.id, onDismiss]);

  const isSending = message.sendStatus === 'sending';
  const isFailed = message.sendStatus === 'failed';
  const hasReadReceipts = isMine && !message.optimistic && Array.isArray(message.readBy) && message.readBy.length > 1;

  const bubbleStyles = isMine
    ? [styles.bubble, styles.myBubble, isFailed ? styles.failedBubble : null, isSending ? styles.sendingBubble : null]
    : [styles.bubble, styles.otherBubble];
  const textColorStyle = isMine ? styles.myText : styles.otherText;
  const metaColorStyle = isMine ? styles.myMeta : styles.otherMeta;
  const attachmentCardStyle = isMine ? styles.myAttachmentCard : styles.otherAttachmentCard;

  return (
    <Animated.View
      style={[
        styles.row,
        isMine ? styles.myRow : styles.otherRow,
        { opacity: isSending ? pulseAnim : fadeAnim },
      ]}
      testID={`chat-message-${message.id}`}
    >
      <View style={bubbleStyles}>
        {!isMine && message.senderLabel ? <Text style={styles.senderLabel}>{message.senderLabel}</Text> : null}
        {message.text ? <Text style={[styles.messageText, textColorStyle]}>{message.text}</Text> : null}

        {shouldRenderInlineImage(message) && message.fileUrl ? (
          <Image
            source={{ uri: message.fileUrl }}
            style={styles.imageAttachment}
            resizeMode="cover"
            testID={`chat-message-image-${message.id}`}
          />
        ) : null}

        {shouldRenderTapToOpenAttachment(message) ? (
          <Pressable
            style={[styles.fileCard, attachmentCardStyle]}
            onPress={() => {
              void handleOpenAttachment();
            }}
            testID={`chat-message-file-${message.id}`}
          >
            {message.fileType === 'video'
              ? <PlayCircle size={18} color={isMine ? Colors.black : Colors.primary} />
              : <FileText size={18} color={isMine ? Colors.black : Colors.primary} />}
            <Text style={[styles.attachmentLabel, textColorStyle]} numberOfLines={2}>
              {getAttachmentLabel(message)}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.metaRow}>
          {message.localOnly ? <Text style={[styles.localOnlyBadge, metaColorStyle]}>Local only</Text> : null}

          {isSending ? (
            <View style={styles.sendingIndicator}>
              <ActivityIndicator size={10} color={isMine ? 'rgba(0,0,0,0.5)' : Colors.textTertiary} />
              <Text style={[styles.statusText, metaColorStyle]}>Sending</Text>
            </View>
          ) : isFailed ? (
            <View style={styles.failedIndicator}>
              <AlertCircle size={12} color="#ef4444" />
              <Text style={styles.failedText}>Not sent</Text>
            </View>
          ) : (
            <>
              {hasReadReceipts ? (
                <CheckCheck size={12} color="#D4A017" />
              ) : isMine && !message.optimistic ? (
                <Check size={12} color={isMine ? 'rgba(0,0,0,0.5)' : Colors.textTertiary} />
              ) : null}
              <Text style={[styles.metaText, metaColorStyle]}>{formatMessageTime(message.createdAt)}</Text>
              {hasReadReceipts ? (
                <Text style={styles.readLabel}>Read</Text>
              ) : null}
            </>
          )}
        </View>

        {isFailed ? (
          <View style={styles.failedActions}>
            <Pressable
              style={({ pressed }) => [styles.retryAction, pressed ? styles.pressed : null]}
              onPress={handleRetry}
              testID={`chat-message-retry-${message.id}`}
            >
              <RefreshCw size={13} color="#ef4444" />
              <Text style={styles.retryActionText}>Retry</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.dismissAction, pressed ? styles.pressed : null]}
              onPress={handleDismiss}
              testID={`chat-message-dismiss-${message.id}`}
            >
              <X size={13} color="rgba(0,0,0,0.4)" />
              <Text style={styles.dismissActionText}>Remove</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: {
    marginVertical: 2,
    width: '100%',
  },
  myRow: {
    alignItems: 'flex-end',
  },
  otherRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  myBubble: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
    borderBottomRightRadius: 8,
  },
  otherBubble: {
    backgroundColor: '#161B22',
    borderColor: '#394150',
    borderBottomLeftRadius: 8,
  },
  sendingBubble: {
    borderStyle: 'dashed' as const,
  },
  failedBubble: {
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(255,215,0,0.6)',
  },
  senderLabel: {
    marginBottom: 6,
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
  },
  myText: {
    color: Colors.black,
  },
  otherText: {
    color: '#F8FAFC',
  },
  imageAttachment: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginTop: 10,
    backgroundColor: Colors.backgroundSecondary,
  },
  fileCard: {
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  myAttachmentCard: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  otherAttachmentCard: {
    backgroundColor: Colors.backgroundSecondary,
  },
  attachmentLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 6,
  },
  localOnlyBadge: {
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  myMeta: {
    color: 'rgba(0,0,0,0.6)',
  },
  otherMeta: {
    color: '#B4BDC9',
  },
  readLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#D4A017',
  },
  sendingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  failedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  failedText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#ef4444',
  },
  failedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  retryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  retryActionText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#ef4444',
  },
  dismissAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  dismissActionText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: 'rgba(0,0,0,0.4)',
  },
  pressed: {
    opacity: 0.7,
  },
});
