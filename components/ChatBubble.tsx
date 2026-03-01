/**
 * =============================================================================
 * CHAT BUBBLE COMPONENT - components/ChatBubble.tsx
 * =============================================================================
 * 
 * Displays a single chat message in a conversation-style bubble format.
 * Used in support chat and messaging interfaces.
 * 
 * FEATURES:
 * ---------
 * - Different styling for user vs support messages
 * - Support agent avatar display
 * - Message delivery status indicators (sent, delivered, read)
 * - Timestamp display
 * - Rounded bubble corners with chat-style tail
 * 
 * MESSAGE TYPES:
 * --------------
 * - User messages: Gold/primary color, aligned right
 * - Support messages: Dark surface color, aligned left with avatar
 * 
 * STATUS ICONS:
 * -------------
 * - sent: Single check mark (gray)
 * - delivered: Double check mark (gray)
 * - read: Double check mark (gold/primary)
 * 
 * PROPS:
 * ------
 * - message: ChatMessage - The message data from @/types
 *   - id, senderId, senderName, senderAvatar
 *   - message (text content)
 *   - timestamp, isSupport, status
 * 
 * PERFORMANCE:
 * ------------
 * - Uses React.memo() to prevent unnecessary re-renders
 * - useMemo() for formatted time and status icon
 * 
 * USAGE:
 * ------
 * import ChatBubble from '@/components/ChatBubble';
 * 
 * <ChatBubble message={chatMessage} />
 * =============================================================================
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Check, CheckCheck } from 'lucide-react-native';
import { ChatMessage } from '@/types';
import Colors from '@/constants/colors';

interface ChatBubbleProps {
  message: ChatMessage;
}

const ChatBubble = memo(function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = !message.isSupport;
  
  const formattedTime = useMemo(() => {
    const date = new Date(message.timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }, [message.timestamp]);

  const statusIcon = useMemo(() => {
    switch (message.status) {
      case 'sent':
        return <Check size={12} color={Colors.textTertiary} />;
      case 'delivered':
        return <CheckCheck size={12} color={Colors.textTertiary} />;
      case 'read':
        return <CheckCheck size={12} color={Colors.primary} />;
      default:
        return null;
    }
  }, [message.status]);

  return (
    <View style={[styles.container, isUser && styles.containerUser]}>
      {!isUser && message.senderAvatar && (
        <Image source={{ uri: message.senderAvatar }} style={styles.avatar} />
      )}
      
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleSupport]}>
        {!isUser && (
          <Text style={styles.senderName}>{message.senderName}</Text>
        )}
        <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
          {message.message}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.timestamp, isUser && styles.timestampUser]}>
            {formattedTime}
          </Text>
          {isUser && statusIcon}
        </View>
      </View>
    </View>
  );
});

export default ChatBubble;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  containerUser: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleSupport: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderTopRightRadius: 4,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
  },
  messageTextUser: {
    color: Colors.black,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  timestampUser: {
    color: 'rgba(0, 0, 0, 0.5)',
  },
});
