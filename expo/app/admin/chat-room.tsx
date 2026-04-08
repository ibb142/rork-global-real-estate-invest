import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Radio } from 'lucide-react-native';
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

export default function AdminChatRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ conversationId?: string | string[]; title?: string | string[] }>();
  const { user } = useAuth();

  const conversationId = useMemo(() => {
    return normalizeParam(params.conversationId, 'ivx-owner-room');
  }, [params.conversationId]);

  const title = useMemo(() => {
    return normalizeParam(params.title, 'Admin Message Room');
  }, [params.title]);

  const currentUserId = user?.id ?? 'ivx-admin-preview';

  return (
    <ErrorBoundary fallbackTitle="Admin chat unavailable">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container} testID="admin-chat-room-screen">
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              testID="admin-chat-room-back"
            >
              <ArrowLeft size={20} color={Colors.text} />
            </TouchableOpacity>

            <View style={styles.headerCopy}>
              <View style={styles.badge}>
                <Radio size={12} color={Colors.primary} />
                <Text style={styles.badgeText}>LIVE</Text>
              </View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>Owner/admin access to the shared realtime IVX room.</Text>
            </View>
          </View>
        </SafeAreaView>

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
  safeArea: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
  },
  badgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
