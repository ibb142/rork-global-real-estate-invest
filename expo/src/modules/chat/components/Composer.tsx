import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import { FileText, ImageIcon, Send, Video } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { guessUploadFileType, uploadService } from '../services/uploadService';
import type { CapabilityState, ChatFileType, UploadableFile } from '../types/chat';

type UploadKind = 'image' | 'video' | 'document';

type ComposerPayload = {
  text?: string;
  fileType?: ChatFileType;
  upload?: UploadableFile;
};

type ComposerStatusIndicator = {
  state: CapabilityState;
  label: string;
  detail: string;
  isLoading: boolean;
  testID: string;
};

type ComposerNote = {
  id: string;
  tone: 'info' | 'warning';
  text: string;
  testID: string;
};

type ComposerProps = {
  onSend: (payload: ComposerPayload) => Promise<void>;
  sending?: boolean;
  onFocus?: () => void;
  onTyping?: () => void;
  bottomInset?: number;
  notes?: ComposerNote[];
  statusIndicator?: ComposerStatusIndicator | null;
};

function normalizeComposerText(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value == null) {
    return fallback;
  }

  try {
    return String(value);
  } catch (error) {
    console.log('[Composer] Failed to normalize text value:', (error as Error)?.message ?? 'Unknown error');
    return fallback;
  }
}

export function Composer({
  onSend,
  sending = false,
  onFocus,
  onTyping,
  bottomInset = 16,
}: ComposerProps) {
  const [text, setText] = useState<string>('');
  const textRef = useRef<string>('');
  const inputRef = useRef<TextInput | null>(null);

  const pickAttachmentMutation = useMutation<UploadableFile | null, Error, UploadKind>({
    mutationFn: async (kind) => {
      console.log('[Composer] Attachment pick requested:', kind);
      if (kind === 'image') {
        return uploadService.pickImage();
      }

      if (kind === 'video') {
        return uploadService.pickVideo();
      }

      return uploadService.pickDocument();
    },
  });

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const isBusy = sending || pickAttachmentMutation.isPending;
  const normalizedText = useMemo(() => normalizeComposerText(text), [text]);
  const canSendText = useMemo(() => normalizedText.trim().length > 0 && !isBusy, [isBusy, normalizedText]);
  const containerPaddingBottom = useMemo(() => Math.max(bottomInset, 8), [bottomInset]);

  const handleSend = useCallback(async (overrideText?: unknown) => {
    const capturedValue = normalizeComposerText(overrideText, textRef.current);
    const value = capturedValue.trim();
    if (!value || isBusy) {
      console.log('[Composer] Skipping send:', {
        isBusy,
        normalizedType: typeof capturedValue,
        normalizedLength: capturedValue.length,
      });
      return;
    }

    try {
      console.log('[Composer] Sending text payload length:', value.length);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSend({ text: capturedValue });
      textRef.current = '';
      setText('');
      inputRef.current?.clear();
    } catch (error) {
      console.log('[Composer] Send error:', (error as Error)?.message ?? 'Unknown error');
    }
  }, [isBusy, onSend]);

  const handleAttachment = useCallback(async (kind: UploadKind) => {
    if (isBusy) {
      return;
    }

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const attachment = await pickAttachmentMutation.mutateAsync(kind);
      if (!attachment) {
        return;
      }

      const capturedText = normalizeComposerText(textRef.current);
      const trimmedText = capturedText.trim();
      const fileType = guessUploadFileType(attachment.type ?? null);
      await onSend({
        text: trimmedText.length > 0 ? capturedText : undefined,
        fileType,
        upload: attachment,
      });
      textRef.current = '';
      setText('');
      inputRef.current?.clear();
    } catch (error) {
      console.log('[Composer] Attachment send error:', (error as Error)?.message ?? 'Unknown error');
      Alert.alert('Attachment not sent', 'We could not send that attachment. Please try again.');
    }
  }, [isBusy, onSend, pickAttachmentMutation, text]);

  return (
    <View style={[styles.container, { paddingBottom: containerPaddingBottom }]} testID="chat-composer">
      <View style={styles.inputShell}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(value) => {
            const nextValue = normalizeComposerText(value);
            textRef.current = nextValue;
            setText(nextValue);
            if (nextValue.trim().length > 0) {
              onTyping?.();
            }
          }}
          onFocus={onFocus}
          placeholder="Write a message"
          placeholderTextColor="#B8C0CC"
          style={styles.input}
          multiline
          maxLength={1200}
          editable={!isBusy}
          textAlignVertical="top"
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={(event) => {
            const submittedText = normalizeComposerText(event?.nativeEvent?.text, textRef.current);
            void handleSend(submittedText);
          }}
          selectionColor={Colors.primary}
          testID="chat-composer-input"
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            canSendText ? styles.sendButtonActive : styles.sendButtonDisabled,
            pressed && canSendText ? styles.pressed : null,
          ]}
          onPress={() => {
            void handleSend();
          }}
          disabled={!canSendText}
          testID="chat-composer-send"
        >
          <Send size={16} color={canSendText ? Colors.black : Colors.textTertiary} />
        </Pressable>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressed : null]}
          onPress={() => {
            void handleAttachment('image');
          }}
          disabled={isBusy}
          testID="chat-composer-image"
        >
          <ImageIcon size={16} color={Colors.primary} />
          <Text style={styles.actionText}>{pickAttachmentMutation.isPending ? 'Preparing…' : 'Image'}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressed : null]}
          onPress={() => {
            void handleAttachment('video');
          }}
          disabled={isBusy}
          testID="chat-composer-video"
        >
          <Video size={16} color={Colors.primary} />
          <Text style={styles.actionText}>{pickAttachmentMutation.isPending ? 'Preparing…' : 'Video'}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressed : null]}
          onPress={() => {
            void handleAttachment('document');
          }}
          disabled={isBusy}
          testID="chat-composer-document"
        >
          <FileText size={16} color={Colors.primary} />
          <Text style={styles.actionText}>{pickAttachmentMutation.isPending ? 'Preparing…' : 'PDF / File'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingTop: 4,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minHeight: 34,
  },
  input: {
    flex: 1,
    minHeight: 34,
    maxHeight: 74,
    backgroundColor: '#12161C',
    borderWidth: 1,
    borderColor: '#46505E',
    borderRadius: 12,
    color: '#F8FAFC',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    fontSize: 14,
    lineHeight: 18,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  sendButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceBorder,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  actionText: {
    color: '#E2E8F0',
    fontSize: 8,
    fontWeight: '600' as const,
  },
  pressed: {
    opacity: 0.82,
  },
});
