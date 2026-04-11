import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

function getStateColors(state: CapabilityState): { backgroundColor: string; borderColor: string; textColor: string } {
  switch (state) {
    case 'available':
      return {
        backgroundColor: 'rgba(255,215,0,0.1)',
        borderColor: 'rgba(255,215,0,0.28)',
        textColor: Colors.primary,
      };
    case 'degraded':
      return {
        backgroundColor: 'rgba(245,158,11,0.12)',
        borderColor: 'rgba(245,158,11,0.3)',
        textColor: Colors.warning,
      };
    case 'unavailable':
    default:
      return {
        backgroundColor: Colors.backgroundSecondary,
        borderColor: Colors.surfaceBorder,
        textColor: Colors.textSecondary,
      };
  }
}

export function Composer({
  onSend,
  sending = false,
  onFocus,
  onTyping,
  bottomInset = 16,
  notes,
  statusIndicator,
}: ComposerProps) {
  const [text, setText] = useState<string>('');

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

  const isBusy = sending || pickAttachmentMutation.isPending;
  const canSendText = useMemo(() => text.trim().length > 0 && !isBusy, [isBusy, text]);
  const containerPaddingBottom = useMemo(() => Math.max(bottomInset, 16), [bottomInset]);
  const indicatorColors = useMemo(() => {
    return statusIndicator ? getStateColors(statusIndicator.state) : null;
  }, [statusIndicator]);

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

      const trimmedText = text.trim();
      const fileType = guessUploadFileType(attachment.type ?? null);
      await onSend({
        text: trimmedText || undefined,
        fileType,
        upload: attachment,
      });
      setText('');
    } catch (error) {
      console.log('[Composer] Attachment send error:', (error as Error)?.message ?? 'Unknown error');
      Alert.alert('Attachment not sent', 'We could not send that attachment. Please try again.');
    }
  }, [isBusy, onSend, pickAttachmentMutation, text]);

  return (
    <View style={[styles.container, { paddingBottom: containerPaddingBottom }]} testID="chat-composer">
      {statusIndicator && indicatorColors ? (
        <View
          style={[
            styles.statusIndicator,
            {
              backgroundColor: indicatorColors.backgroundColor,
              borderColor: indicatorColors.borderColor,
            },
          ]}
          testID={statusIndicator.testID}
        >
          {statusIndicator.isLoading ? (
            <ActivityIndicator size="small" color={indicatorColors.textColor} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: indicatorColors.textColor }]} />
          )}
          <View style={styles.statusCopy}>
            <Text style={[styles.statusLabel, { color: indicatorColors.textColor }]}>{statusIndicator.label}</Text>
            <Text style={[styles.statusDetail, { color: indicatorColors.textColor }]}>{statusIndicator.detail}</Text>
          </View>
        </View>
      ) : null}

      {notes && notes.length > 0 ? (
        <View style={styles.noteList}>
          {notes.map((note) => {
            const noteColors = note.tone === 'warning'
              ? {
                backgroundColor: 'rgba(245,158,11,0.12)',
                borderColor: 'rgba(245,158,11,0.28)',
                textColor: Colors.warning,
              }
              : {
                backgroundColor: Colors.backgroundSecondary,
                borderColor: Colors.surfaceBorder,
                textColor: Colors.textSecondary,
              };

            return (
              <View
                key={note.id}
                style={[
                  styles.noteCard,
                  {
                    backgroundColor: noteColors.backgroundColor,
                    borderColor: noteColors.borderColor,
                  },
                ]}
                testID={note.testID}
              >
                <Text style={[styles.noteText, { color: noteColors.textColor }]}>{note.text}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.inputShell}>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (value.trim().length > 0) {
              onTyping?.();
            }
          }}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 5,
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  statusDetail: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  noteList: {
    gap: 8,
    marginBottom: 10,
  },
  noteCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
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
