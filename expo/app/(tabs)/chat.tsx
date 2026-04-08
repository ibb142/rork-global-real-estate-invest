import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Clock, HelpCircle, MessageCircle, User } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useTranslation } from '@/lib/i18n-context';
import { getResponsiveSize, isExtraSmallScreen } from '@/lib/responsive';
import InvestorSupportChat, { type HumanSupportRequestResult } from '@/components/InvestorSupportChat';
import type { ChatMessage } from '@/types';
import {
  type CreateSupportTicketParams,
  type SupportTicketItem,
  type SupportTicketRow,
  type TicketCategory,
  type TicketStatus,
  buildLiveSupportTicketDraft,
  createSupportTicket,
  fetchUserSupportTickets,
  mapSupportTicketRows,
} from '@/lib/support-chat';

type ViewMode = 'chat' | 'tickets';

const APP_CHAT_QUICK_REPLIES = [
  'How do I invest?',
  'Frontend bug or screen issue',
  'Backend / Supabase problem',
  'AWS S3 + CloudFront help',
  'ChatGPT / OpenAI integration',
  'Can AI fix code automatically?',
] as const;

const APP_CHAT_WELCOME_MESSAGE = 'Hello! Ask about investing, account support, frontend or web issues, backend or Supabase flows, AWS S3 and CloudFront, or ChatGPT and OpenAI integration.';

export default function ChatScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  const screenSize = getResponsiveSize(width);
  const isXs = isExtraSmallScreen(screenSize);
  const chatBottomInset = useMemo(() => {
    return Math.max(tabBarHeight - insets.bottom, 0) + 12;
  }, [insets.bottom, tabBarHeight]);

  const ticketsQuery = useQuery<SupportTicketRow[]>({
    queryKey: ['support-tickets'],
    queryFn: fetchUserSupportTickets,
  });

  const createTicketMutation = useMutation<SupportTicketRow, Error, CreateSupportTicketParams>({
    mutationFn: createSupportTicket,
  });

  const supportTickets = useMemo<SupportTicketItem[]>(() => {
    return mapSupportTicketRows(ticketsQuery.data ?? []);
  }, [ticketsQuery.data]);

  const getTicketStatusColor = useCallback((status: TicketStatus) => {
    switch (status) {
      case 'open':
        return Colors.warning;
      case 'in_progress':
        return Colors.info;
      case 'resolved':
        return Colors.success;
      default:
        return Colors.textTertiary;
    }
  }, []);

  const getTicketStatusIcon = useCallback((status: TicketStatus) => {
    switch (status) {
      case 'open':
        return <Clock size={16} color={Colors.warning} />;
      case 'in_progress':
        return <MessageCircle size={16} color={Colors.info} />;
      case 'resolved':
        return <User size={16} color={Colors.success} />;
      default:
        return <HelpCircle size={16} color={Colors.textTertiary} />;
    }
  }, []);

  const submitTicket = useCallback(
    async (subject: string, category: TicketCategory, message: string) => {
      try {
        const data = await createTicketMutation.mutateAsync({
          subject,
          category,
          message,
        });

        console.log('[ChatScreen] Ticket created:', data.id, 'category:', category);
        await ticketsQuery.refetch();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Ticket Created', `Your ${subject} ticket has been submitted. We'll respond within 24 hours.`);
      } catch (error) {
        console.error('[ChatScreen] Create ticket error:', error);
        Alert.alert('Error', 'Could not create ticket. Please try again.');
      }
    },
    [createTicketMutation, ticketsQuery]
  );

  const handleRequestHumanSupport = useCallback(
    async (messages: ChatMessage[]): Promise<HumanSupportRequestResult> => {
      const openTickets = supportTickets.filter(
        (ticket) => ticket.status === 'open' || ticket.status === 'in_progress'
      );

      if (openTickets.length >= 3) {
        return {
          ok: false,
          message: `You already have ${openTickets.length} open tickets. Please wait for an existing ticket to be updated before starting another live support request.`,
        };
      }

      const draft = buildLiveSupportTicketDraft(messages);

      try {
        const data = await createTicketMutation.mutateAsync({
          subject: draft.subject,
          category: draft.category,
          message: draft.message,
          priority: draft.priority,
        });

        console.log('[ChatScreen] Live support ticket created:', data.id);
        await ticketsQuery.refetch();
        const waitTime = openTickets.length === 0 ? '5-10' : `${10 + openTickets.length * 5}-${15 + openTickets.length * 5}`;
        setViewMode('tickets');

        return {
          ok: true,
          message: `Your live chat request has been submitted (Ticket #${data.id.slice(-6)}). Estimated wait time: ${waitTime} minutes. A support agent will review your ticket shortly.`,
        };
      } catch (error) {
        console.error('[ChatScreen] Live support request failed:', error);
        return {
          ok: false,
          message: 'Sorry, we could not create your support ticket right now. Please try again later or email investors@ivxholding.com.',
        };
      }
    },
    [createTicketMutation, supportTickets, ticketsQuery]
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: isXs ? 16 : 20 }]}> 
          <View style={styles.headerTop}>
            <Text style={[styles.headerTitle, { fontSize: isXs ? 26 : 32 }]}>{t('liveSupport')}</Text>
            <View style={[styles.headerBadge, { paddingHorizontal: isXs ? 8 : 10, paddingVertical: isXs ? 4 : 5 }]}> 
              <User size={isXs ? 12 : 14} color={Colors.black} />
              <Text style={[styles.headerBadgeText, { fontSize: isXs ? 10 : 12 }]}>24/7</Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { fontSize: isXs ? 12 : 14 }]}>{t('customerCare')}</Text>
        </View>

        <View style={[styles.moduleCard, { marginHorizontal: isXs ? 16 : 20, padding: isXs ? 14 : 16 }]}>
          <View style={styles.moduleCardHeader}>
            <View style={styles.moduleBadge}>
              <Text style={styles.moduleBadgeText}>NEW</Text>
            </View>
            <TouchableOpacity
              style={styles.moduleButton}
              onPress={() => router.push('/chat-room?conversationId=ivx-owner-room&title=IVX%20Message%20Room' as any)}
              testID="chat-open-message-room"
            >
              <Text style={styles.moduleButtonText}>Open room</Text>
              <ArrowUpRight size={14} color={Colors.black} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.moduleTitle, { fontSize: isXs ? 16 : 18 }]}>Realtime message room</Text>
          <Text style={[styles.moduleText, { fontSize: isXs ? 12 : 13 }]}>Use the new Supabase-backed chat module for direct message, image, video, and PDF room testing without replacing live support.</Text>
        </View>

        <View style={[styles.tabsContainer, { marginHorizontal: isXs ? 16 : 20 }]}> 
          <TouchableOpacity
            style={[styles.tab, viewMode === 'chat' && styles.tabActive]}
            onPress={() => setViewMode('chat')}
            testID="chat-tab-live-chat"
          >
            <MessageCircle size={isXs ? 16 : 18} color={viewMode === 'chat' ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.tabText, { fontSize: isXs ? 12 : 14 }, viewMode === 'chat' && styles.tabTextActive]}>
              {t('liveChat')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'tickets' && styles.tabActive]}
            onPress={() => setViewMode('tickets')}
            testID="chat-tab-tickets"
          >
            <HelpCircle size={isXs ? 16 : 18} color={viewMode === 'tickets' ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.tabText, { fontSize: isXs ? 12 : 14 }, viewMode === 'tickets' && styles.tabTextActive]}>
              {t('tickets')} ({supportTickets.length})
            </Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'chat' ? (
          <View style={styles.chatPanel}>
            <InvestorSupportChat
              variant="screen"
              source="chat"
              testIdPrefix="chat-screen"
              keyboardVerticalOffset={0}
              extraBottomInset={chatBottomInset}
              welcomeMessage={APP_CHAT_WELCOME_MESSAGE}
              quickReplies={APP_CHAT_QUICK_REPLIES}
              onRequestHumanSupport={handleRequestHumanSupport}
            />
          </View>
        ) : (
          <ScrollView
            style={[styles.ticketsContainer, { paddingHorizontal: isXs ? 16 : 20 }]}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.ticketsContent}
            testID="chat-tickets-scroll"
          >
            <TouchableOpacity
              style={[styles.newTicketButton, { paddingVertical: isXs ? 12 : 14 }]}
              onPress={() => {
                Alert.alert('New Support Ticket', 'What do you need help with?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Account Issue',
                    onPress: () => {
                      void submitTicket('Account Issue', 'general', 'I need help with my account.');
                    },
                  },
                  {
                    text: 'Investment Help',
                    onPress: () => {
                      void submitTicket('Investment Help', 'trading', 'I need help with my investments.');
                    },
                  },
                  {
                    text: 'Technical Issue',
                    onPress: () => {
                      void submitTicket('Technical Issue', 'technical', 'I need help with a technical problem, bug, or integration.');
                    },
                  },
                  {
                    text: 'General Support',
                    onPress: () => {
                      void submitTicket('General Support', 'general', 'I need general assistance.');
                    },
                  },
                ]);
              }}
              testID="chat-create-ticket"
            >
              <HelpCircle size={isXs ? 18 : 20} color={Colors.black} />
              <Text style={[styles.newTicketText, { fontSize: isXs ? 14 : 15 }]}>Create New Ticket</Text>
            </TouchableOpacity>

            {supportTickets.length === 0 ? (
              <View style={styles.emptyState}>
                <HelpCircle size={22} color={Colors.textTertiary} />
                <Text style={styles.emptyStateTitle}>No support tickets yet</Text>
                <Text style={styles.emptyStateText}>Start a live chat or create a ticket if you need help from the IVX team.</Text>
              </View>
            ) : null}

            {supportTickets.map((ticket) => (
              <TouchableOpacity key={ticket.id} style={[styles.ticketCard, { padding: isXs ? 12 : 16 }]} activeOpacity={0.85} testID={`ticket-${ticket.id}`}>
                <View style={styles.ticketHeader}>
                  <View style={styles.ticketStatus}>
                    {getTicketStatusIcon(ticket.status)}
                    <Text style={[styles.ticketStatusText, { color: getTicketStatusColor(ticket.status) }]}>
                      {ticket.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.ticketDate}>{new Date(ticket.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                <View style={styles.ticketFooter}>
                  <View style={styles.ticketCategory}>
                    <Text style={styles.ticketCategoryText}>{ticket.category}</Text>
                  </View>
                  <Text style={styles.ticketMessages}>{ticket.messages.length} messages</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingVertical: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: '800' as const,
    color: Colors.text,
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    marginTop: 4,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: 12,
  },
  headerBadgeText: {
    color: Colors.black,
    fontWeight: '700' as const,
  },
  moduleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  moduleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  moduleBadge: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moduleBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  moduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  moduleButtonText: {
    color: Colors.black,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  moduleTitle: {
    color: Colors.text,
    fontWeight: '800' as const,
  },
  moduleText: {
    color: Colors.textSecondary,
    lineHeight: 19,
    marginTop: 6,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: Colors.black,
  },
  chatPanel: {
    flex: 1,
  },
  ticketsContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  ticketsContent: {
    paddingBottom: 120,
  },
  newTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    marginBottom: 16,
  },
  newTicketText: {
    fontWeight: '700' as const,
    color: Colors.black,
  },
  ticketCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ticketStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketStatusText: {
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
  },
  ticketDate: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  ticketSubject: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 10,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketCategory: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ticketCategoryText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
  },
  ticketMessages: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    gap: 8,
    marginBottom: 12,
  },
  emptyStateTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  emptyStateText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
