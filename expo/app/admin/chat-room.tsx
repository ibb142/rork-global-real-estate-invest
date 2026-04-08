import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Radio } from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { ChatScreen } from '@/src/modules/chat';
import {
  getChatConversationDisplayId,
  getChatConversationTitle,
  resolveChatConversationId,
} from '@/src/modules/chat/services/chatRooms';

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

  const routeConversationId = useMemo(() => {
    return normalizeParam(params.conversationId, 'ivx-owner-room');
  }, [params.conversationId]);

  const conversationId = useMemo(() => {
    return resolveChatConversationId(routeConversationId);
  }, [routeConversationId]);

  const displayConversationId = useMemo(() => {
    return getChatConversationDisplayId(routeConversationId);
  }, [routeConversationId]);

  const title = useMemo(() => {
    return getChatConversationTitle(routeConversationId, normalizeParam(params.title, 'Admin Message Room')) ?? 'Admin Message Room';
  }, [params.title, routeConversationId]);

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

        <ChatScreen
          conversationId={conversationId}
          currentUserId={currentUserId}
          roomMeta={{
            badgeText: 'Owner room',
            title: 'IVX Owner Room',
            subtitle: `Conversation ID: ${displayConversationId}`,
            capabilityPills: ['Realtime sync', 'Owner access', 'Image / video', 'PDF / File'],
            auditCards: [
              {
                id: 'capabilities',
                eyebrow: 'What it can do',
                title: 'Shared owner communication lane',
                description: 'This room is already wired as a reusable owner/admin room across app routes, web, and Expo clients.',
                bullets: [
                  'Send plain-text updates plus image, video, PDF, and general file attachments.',
                  'Open the room by friendly slug, then resolve it to the stable UUID-backed conversation before reads and writes.',
                  'Bootstrap the canonical room record and participant row when the known IVX room is missing.',
                  'Reuse the same room key from assistant and ops flows instead of creating one-off support threads.',
                ],
              },
              {
                id: 'delivery',
                eyebrow: 'How it works end to end',
                title: 'Resilient Supabase delivery path',
                description: 'Every send goes through the shared chat provider, which keeps the room alive even when part of the schema is unavailable.',
                bullets: [
                  'Composer → chatService.sendMessage() → Supabase chat provider.',
                  'Primary path writes to conversations/messages with live inserts and polling.',
                  'If the main tables are unavailable, the provider falls back to chat_rooms/room_messages, then realtime_snapshots, then local device storage.',
                  'The status card above the thread tells you if the room is shared in Supabase or only cached on the current device.',
                ],
              },
              {
                id: 'value',
                eyebrow: 'How it helps the app',
                title: 'Owner ops, QA, and escalation hub',
                description: 'The room gives the product a durable internal comms lane for support handoff, live QA, and incident coordination.',
                bullets: [
                  'Coordinate owner/admin decisions without mixing those messages into public investor support tickets.',
                  'Test attachments, routing, and shared-room behavior safely before pointing users into the flow.',
                  'Create a natural handoff target for AI assistant summaries, support escalations, and ops alerts.',
                  'Surface backend permission or schema problems immediately because fallback state is visible in the UI.',
                ],
              },
            ],
            emptyTitle: 'No owner messages yet',
            emptyText: 'Send the first owner update, media upload, or document into the shared IVX room.',
          }}
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
