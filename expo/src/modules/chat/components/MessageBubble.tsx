import React, { memo, useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, PlayCircle } from 'lucide-react-native';
import { ResizeMode, Video } from 'expo-av';
import Colors from '@/constants/colors';
import type { ChatMessage } from '../types/chat';

type MessageBubbleProps = {
  message: ChatMessage;
  isMine: boolean;
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

export const MessageBubble = memo(function MessageBubble({
  message,
  isMine,
}: MessageBubbleProps) {
  const [videoFailed, setVideoFailed] = useState<boolean>(false);

  const handleOpenAttachment = useCallback(async () => {
    if (!message.fileUrl) {
      return;
    }

    console.log('[MessageBubble] Opening attachment:', message.fileUrl);

    try {
      const canOpen = await Linking.canOpenURL(message.fileUrl);
      if (!canOpen) {
        Alert.alert('Attachment unavailable', 'This attachment could not be opened on your device.');
        return;
      }

      await Linking.openURL(message.fileUrl);
    } catch (error) {
      console.log('[MessageBubble] Attachment open error:', (error as Error)?.message ?? 'Unknown error');
      Alert.alert('Attachment unavailable', 'This attachment could not be opened right now.');
    }
  }, [message.fileUrl]);

  const bubbleStyles = isMine
    ? [styles.bubble, styles.myBubble]
    : [styles.bubble, styles.otherBubble];
  const textColorStyle = isMine ? styles.myText : styles.otherText;
  const metaColorStyle = isMine ? styles.myMeta : styles.otherMeta;
  const attachmentCardStyle = isMine ? styles.myAttachmentCard : styles.otherAttachmentCard;

  return (
    <View
      style={[styles.row, isMine ? styles.myRow : styles.otherRow]}
      testID={`chat-message-${message.id}`}
    >
      <View style={bubbleStyles}>
        {message.text ? <Text style={[styles.messageText, textColorStyle]}>{message.text}</Text> : null}

        {message.fileType === 'image' && message.fileUrl ? (
          <Image
            source={{ uri: message.fileUrl }}
            style={styles.imageAttachment}
            resizeMode="cover"
            testID={`chat-message-image-${message.id}`}
          />
        ) : null}

        {message.fileType === 'video' && message.fileUrl && !videoFailed ? (
          <View style={[styles.videoWrap, attachmentCardStyle]}>
            <Video
              source={{ uri: message.fileUrl }}
              style={styles.videoAttachment}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              onError={(playbackError) => {
                console.log('[MessageBubble] Video playback error:', playbackError);
                setVideoFailed(true);
              }}
            />
            <View style={styles.videoLabelRow}>
              <PlayCircle size={16} color={isMine ? Colors.black : Colors.primary} />
              <Text style={[styles.attachmentLabel, textColorStyle]}>Video attachment</Text>
            </View>
          </View>
        ) : null}

        {((message.fileType === 'pdf' || message.fileType === 'file') || (message.fileType === 'video' && videoFailed)) && message.fileUrl ? (
          <Pressable
            style={[styles.fileCard, attachmentCardStyle]}
            onPress={() => {
              void handleOpenAttachment();
            }}
            testID={`chat-message-file-${message.id}`}
          >
            <FileText size={18} color={isMine ? Colors.black : Colors.primary} />
            <Text style={[styles.attachmentLabel, textColorStyle]}>
              {message.fileType === 'pdf'
                ? 'Open PDF attachment'
                : message.fileType === 'video'
                  ? 'Open video attachment'
                  : 'Open file attachment'}
            </Text>
          </Pressable>
        ) : null}

        <Text style={[styles.metaText, metaColorStyle]}>{formatMessageTime(message.createdAt)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    marginVertical: 6,
    width: '100%',
  },
  myRow: {
    alignItems: 'flex-end',
  },
  otherRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  myBubble: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryDark,
    borderBottomRightRadius: 8,
  },
  otherBubble: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceBorder,
    borderBottomLeftRadius: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  myText: {
    color: Colors.black,
  },
  otherText: {
    color: Colors.text,
  },
  imageAttachment: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginTop: 10,
    backgroundColor: Colors.backgroundSecondary,
  },
  videoWrap: {
    marginTop: 10,
  },
  videoAttachment: {
    width: 240,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundSecondary,
  },
  videoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
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
    fontSize: 13,
    fontWeight: '600',
  },
  metaText: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
  },
  myMeta: {
    color: 'rgba(0,0,0,0.6)',
  },
  otherMeta: {
    color: Colors.textTertiary,
  },
});
