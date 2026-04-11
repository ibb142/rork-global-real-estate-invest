import React, { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight, Inbox, Sparkles } from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { useAuth } from '@/lib/auth-context';
import type { IVXInboxItem } from '@/shared/ivx';
import { ivxInboxService } from '@/src/modules/ivx-owner-ai/services';

const IVX_OWNER_INBOX_QUERY_KEY = ['ivx-owner-ai', 'inbox'] as const;

function formatInboxTime(value: string | null): string {
  if (!value) {
    return 'Now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function IVXOwnerInboxRoute() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ownerEmail = useMemo<string>(() => user?.email?.trim() || 'IVX Owner', [user?.email]);
  const inboxQuery = useQuery<IVXInboxItem[], Error>({
    queryKey: IVX_OWNER_INBOX_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerInboxRoute] Loading owner inbox');
      return ivxInboxService.loadOwnerInbox();
    },
  });
  const inboxItems = inboxQuery.data ?? [];

  useEffect(() => {
    let unsubscribe = () => {};

    void (async () => {
      try {
        unsubscribe = await ivxInboxService.subscribeToOwnerInbox((items) => {
          queryClient.setQueryData<IVXInboxItem[]>(IVX_OWNER_INBOX_QUERY_KEY, items);
        });
      } catch (error) {
        console.log('[IVXOwnerInboxRoute] Inbox subscription failed:', error instanceof Error ? error.message : 'unknown');
      }
    })();

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  const handleOpenRoom = useCallback(async (item: IVXInboxItem) => {
    try {
      await ivxInboxService.markOwnerConversationAsRead(item.conversationId);
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_INBOX_QUERY_KEY });
      router.push('/ivx/chat');
    } catch (error) {
      Alert.alert('Unable to open room', error instanceof Error ? error.message : 'Unknown owner room error.');
    }
  }, [queryClient, router]);

  const renderInboxItem = useCallback(({ item }: { item: IVXInboxItem }) => {
    return (
      <Pressable
        style={styles.inboxCard}
        onPress={() => void handleOpenRoom(item)}
        testID={`ivx-owner-inbox-item-${item.conversationId}`}
      >
        <View style={styles.inboxCardHeader}>
          <View style={styles.inboxTitleBlock}>
            <Text style={styles.inboxTitle}>{item.title}</Text>
            <Text style={styles.inboxSubtitle}>{item.subtitle ?? 'Owner-only room'}</Text>
          </View>
          <ChevronRight size={20} color={Colors.textTertiary} />
        </View>
        <Text style={styles.inboxPreview}>{item.lastMessageText ?? 'No activity yet. Open the room to send the first owner note.'}</Text>
        <View style={styles.inboxMetaRow}>
          <Text style={styles.inboxMetaText}>{formatInboxTime(item.lastMessageAt)}</Text>
          {item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }, [handleOpenRoom]);

  return (
    <ErrorBoundary fallbackTitle="IVX inbox unavailable">
      <Stack.Screen options={{ title: 'IVX Inbox' }} />
      <View style={styles.container} testID="ivx-owner-inbox-screen">
        <View style={styles.heroCard} testID="ivx-owner-inbox-hero">
          <View style={styles.heroBadge}>
            <Inbox size={16} color={Colors.black} />
            <Text style={styles.heroBadgeText}>Owner Inbox</Text>
          </View>
          <Text style={styles.heroTitle}>IVX Owner AI Inbox</Text>
          <Text style={styles.heroSubtitle}>{ownerEmail}</Text>
          <Text style={styles.heroDescription}>Review the owner-only shared room, unread updates, and the latest IVX Owner AI activity from one place.</Text>
        </View>

        {inboxQuery.isLoading ? (
          <View style={styles.loadingState} testID="ivx-owner-inbox-loading">
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Loading IVX inbox…</Text>
          </View>
        ) : inboxQuery.error ? (
          <View style={styles.errorState} testID="ivx-owner-inbox-error">
            <Text style={styles.errorTitle}>Unable to load the inbox.</Text>
            <Text style={styles.errorText}>{inboxQuery.error.message}</Text>
            <Pressable style={styles.retryButton} onPress={() => void inboxQuery.refetch()} testID="ivx-owner-inbox-retry">
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={inboxItems}
            keyExtractor={(item) => item.conversationId}
            renderItem={renderInboxItem}
            contentContainerStyle={inboxItems.length === 0 ? styles.emptyContent : styles.listContent}
            refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={inboxQuery.isRefetching} onRefresh={() => void inboxQuery.refetch()} />}
            ListEmptyComponent={
              <View style={styles.emptyState} testID="ivx-owner-inbox-empty">
                <Sparkles size={28} color={Colors.primary} />
                <Text style={styles.emptyTitle}>No owner conversations yet</Text>
                <Text style={styles.emptyText}>Open the room to start the first IVX Owner AI message.</Text>
                <Pressable style={styles.openRoomButton} onPress={() => router.push('/ivx/chat')} testID="ivx-owner-inbox-open-room">
                  <Text style={styles.openRoomButtonText}>Open owner room</Text>
                </Pressable>
              </View>
            }
            testID="ivx-owner-inbox-list"
          />
        )}
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    padding: 18,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800' as const,
  },
  heroSubtitle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  heroDescription: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorState: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 24,
    padding: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  openRoomButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  openRoomButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  inboxCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  inboxCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inboxTitleBlock: {
    flex: 1,
    gap: 4,
  },
  inboxTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  inboxSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  inboxPreview: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  inboxMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inboxMetaText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  unreadBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  unreadBadgeText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '800' as const,
  },
});
