import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import { FileText, ImageIcon, Send, Video } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { uploadService } from '../services/uploadService';
import type { ChatFileType } from '../types/chat';

type UploadKind = 'image' | 'video' | 'document';

type UploadResponse = {
  url: string;
  fileType: ChatFileType;
};

type ComposerPayload = {
  text?: string;
  fileUrl?: string;
  fileType?: ChatFileType;
};

type ComposerProps = {
  onSend: (payload: ComposerPayload) => Promise<void>;
  sending?: boolean;
  onFocus?: () => void;
  bottomInset?: number;
};

export function Composer({
  onSend,
  sending = false,
  onFocus,
  bottomInset = 16,
}: ComposerProps) {
  const [text, setText] = useState<string>('');

  const uploadMutation = useMutation<UploadResponse | null, Error, UploadKind>({
    mutationFn: async (kind) => {
      console.log('[Composer] Upload requested:', kind);
      if (kind === 'image') {
        return uploadService.pickImageAndUpload();
      }

      if (kind === 'video') {
        return uploadService.pickVideoAndUpload();
      }

      return uploadService.pickDocumentAndUpload();
    },
  });

  const isBusy = sending || uploadMutation.isPending;
  const canSendText = useMemo(() => text.trim().length > 0 && !isBusy, [isBusy, text]);
  const containerPaddingBottom = useMemo(() => Math.max(bottomInset, 16), [bottomInset]);

  const handleSend = useCallback(async () => {
    const value = text.trim();
    if (!value || isBusy) {
      return;
    }

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSend({ text: value });
      setText('');
    } catch (error) {
      console.log('[Composer] Send error:', (error as Error)?.message ?? 'Unknown error');
    }
  }, [isBusy, onSend, text]);

  const handleUpload = useCallback(
    async (kind: UploadKind) => {
      if (isBusy) {
        return;
      }

      try {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const result = await uploadMutation.mutateAsync(kind);
        if (!result) {
          return;
        }

        await onSend({
          fileUrl: result.url,
          fileType: result.fileType,
        });
      } catch (error) {
        console.log('[Composer] Upload error:', (error as Error)?.message ?? 'Unknown error');
        Alert.alert('Upload failed', 'We could not upload that attachment. Please try again.');
      }
    },
    [isBusy, onSend, uploadMutation],
  );

  return (
    <View style={[styles.container, { paddingBottom: containerPaddingBottom }]} testID="chat-composer">
      <View style={styles.inputShell}>
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={onFocus}
          placeholder="Write a message"
          placeholderTextColor={Colors.inputPlaceholder}
          style={styles.input}
          multiline
          maxLength={1200}
          editable={!isBusy}
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
            void handleUpload('image');
          }}
          disabled={isBusy}
          testID="chat-composer-image"
        >
          <ImageIcon size={16} color={Colors.primary} />
          <Text style={styles.actionText}>Image</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressed : null]}
          onPress={() => {
            void handleUpload('video');
          }}
          disabled={isBusy}
          testID="chat-composer-video"
        >
          <Video size={16} color={Colors.primary} />
          <Text style={styles.actionText}>Video</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressed : null]}
          onPress={() => {
            void handleUpload('document');
          }}
          disabled={isBusy}
          testID="chat-composer-document"
        >
          <FileText size={16} color={Colors.primary} />
          <Text style={styles.actionText}>{uploadMutation.isPending ? 'Uploading…' : 'PDF / File'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 132,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 18,
    color: Colors.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  pressed: {
    opacity: 0.82,
  },
});
