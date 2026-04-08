import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { ChatScreen } from '@/src/modules/chat';

function normalizeParam(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

export default function ChatRoomRoute() {
  const params = useLocalSearchParams<{ conversationId?: string | string[]; title?: string | string[] }>();
  const { user } = useAuth();

  const conversationId = useMemo(() => {
    return normalizeParam(params.conversationId, 'ivx-demo-room');
  }, [params.conversationId]);

  const title = useMemo(() => {
    return normalizeParam(params.title, 'IVX Message Room');
  }, [params.title]);

  const currentUserId = user?.id ?? 'ivx-preview-user';

  return (
    <ErrorBoundary fallbackTitle="Chat room unavailable">
      <View style={styles.container}>
        <Stack.Screen options={{ title }} />
        <ChatScreen conversationId={conversationId} currentUserId={currentUserId} />
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
