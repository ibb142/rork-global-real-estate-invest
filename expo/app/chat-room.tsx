import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { useAuth } from '@/lib/auth-context';
import { ChatModule } from '@/src/modules/chat';
import { getChatConversationTitle, resolveChatActorId, resolveChatConversationId } from '@/src/modules/chat/services/chatRooms';

function normalizeOptionalParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const nextValue = value[0]?.trim();
    return nextValue ? nextValue : undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

export default function ChatRoomRoute() {
  const params = useLocalSearchParams<{ conversationId?: string | string[]; title?: string | string[] }>();
  const { user } = useAuth();

  const routeConversationId = useMemo(() => {
    return normalizeOptionalParam(params.conversationId);
  }, [params.conversationId]);

  const conversationId = useMemo(() => {
    return resolveChatConversationId(routeConversationId);
  }, [routeConversationId]);

  const title = useMemo(() => {
    return getChatConversationTitle(routeConversationId, normalizeOptionalParam(params.title) ?? IVX_OWNER_AI_PROFILE.sharedRoom.title) ?? IVX_OWNER_AI_PROFILE.sharedRoom.title;
  }, [params.title, routeConversationId]);

  const currentUserId = useMemo(() => {
    return resolveChatActorId(user?.id, 'preview');
  }, [user?.id]);

  return (
    <ErrorBoundary fallbackTitle="Chat room unavailable">
      <View style={styles.container}>
        <Stack.Screen options={{ title }} />
        <ChatModule
          currentUserId={currentUserId}
          initialConversationId={conversationId}
          initialTitle={title}
        />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
