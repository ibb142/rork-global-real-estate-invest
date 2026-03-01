import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Send, MessageCircle, HelpCircle, Clock, CheckCircle, User, Headphones, ArrowRight, Bot, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useTranslation } from '@/lib/i18n-context';
import { getResponsiveSize, isExtraSmallScreen } from '@/lib/responsive';
import { supportMessages, quickReplies, supportTickets as mockTickets } from '@/mocks/chat';
import { trpc } from '@/lib/trpc';
import { ChatMessage } from '@/types';
import ChatBubble from '@/components/ChatBubble';
import { useRorkAgent, createRorkTool } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';

type ViewMode = 'chat' | 'tickets';
type ConnectionStatus = 'connecting' | 'connected' | 'waiting';

const AI_SYSTEM_PROMPT = `You are an AI assistant for IVX HOLDINGS LLC - a real estate investment platform. Provide helpful, concise responses about:
- Investment opportunities and how to invest
- Portfolio management and dividends
- Account questions and withdrawals
- Property information
- Stock trading: Users can buy and sell stocks every day during market hours. Daily trading is available for all listed stocks on the platform.

Key features:
- Real estate fractional ownership with quarterly dividends
- Daily stock trading (buy/sell) available during market hours
- Withdraw dividends anytime (3-5 business days to bank)
- Principal investment stays until property is sold

Be friendly and professional. Keep responses brief (2-3 sentences max for quick chat).`;

export default function ChatScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(supportMessages);
  const [inputText, setInputText] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [, setAgentName] = useState<string>('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const ticketsQuery = trpc.support.getUserTickets.useQuery({ page: 1, limit: 20 });
  const createTicketMutation = trpc.support.createTicket.useMutation();

  const supportTickets = useMemo(() => {
    if (ticketsQuery.data?.tickets && Array.isArray(ticketsQuery.data.tickets)) {
      return ticketsQuery.data.tickets.map((t: { id: string; subject?: string; category?: string; status?: string; priority?: string; messages?: Array<{ id: string; senderId?: string; senderName?: string; message?: string; timestamp?: string; isSupport?: boolean; status?: string }>; createdAt?: string; updatedAt?: string }) => ({
        id: t.id,
        subject: t.subject ?? '',
        category: t.category as any,
        status: t.status as any,
        priority: t.priority as any,
        messages: (t.messages ?? []).map((m: { id: string; senderId?: string; senderName?: string; message?: string; timestamp?: string; isSupport?: boolean; status?: string }) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          message: m.message ?? '',
          timestamp: m.timestamp,
          isSupport: m.isSupport,
          status: m.status as any,
        })),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));
    }
    return mockTickets;
  }, [ticketsQuery.data]);

  const screenSize = getResponsiveSize(width);
  const isXs = isExtraSmallScreen(screenSize);
  const { t } = useTranslation();

  const { messages: aiMessages, sendMessage: sendAiMessage } = useRorkAgent({
    tools: {
      getHelp: createRorkTool({
        description: 'Get help information about IVX HOLDINGS',
        zodSchema: z.object({
          topic: z.string().optional().describe('Topic to get help about'),
        }),
        execute: () => 'Help information provided',
      }),
    },
  });

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    const connectTimer = setTimeout(() => {
      setConnectionStatus('waiting');
    }, 1000);

    const agentTimer = setTimeout(() => {
      setConnectionStatus('connected');
      setAgentName('AI Assistant');
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      clearTimeout(agentTimer);
    };
  }, []);

  useEffect(() => {
    if (aiMessages.length > 0) {
      const lastMessage = aiMessages[aiMessages.length - 1];
      
      if (lastMessage.role === 'assistant') {
        setIsAiTyping(false);
        const textParts = lastMessage.parts.filter(p => p.type === 'text');
        if (textParts.length > 0) {
          const textContent = textParts.map(p => p.type === 'text' ? p.text : '').join('');
          
          setMessages(prev => {
            const existingIds = prev.map(m => m.id);
            if (existingIds.includes(lastMessage.id)) return prev;
            const aiReply: ChatMessage = {
              id: lastMessage.id,
              senderId: 'ai-support',
              senderName: 'IPX AI',
              senderAvatar: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=200',
              message: textContent,
              timestamp: new Date().toISOString(),
              isSupport: true,
              status: 'delivered',
            };
            return [...prev, aiReply];
          });
        }
      }
    }
  }, [aiMessages]);

  useEffect(() => {
    if (connectionStatus === 'connecting' || connectionStatus === 'waiting') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [connectionStatus, pulseAnim]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: 'user-1',
      senderName: 'You',
      message: userText,
      timestamp: new Date().toISOString(),
      isSupport: false,
      status: 'sent',
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsAiTyping(true);

    try {
      const fullPrompt = `${AI_SYSTEM_PROMPT}\n\nUser: ${userText}`;
      await sendAiMessage(fullPrompt);
    } catch (error) {
      console.error('AI error:', error);
      setIsAiTyping(false);
      const errorReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        senderId: 'ai-support',
        senderName: 'IPX AI',
        senderAvatar: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=200',
        message: "I'm having trouble right now. For immediate assistance, please tap 'Start Live Chat' above to connect with our support team.",
        timestamp: new Date().toISOString(),
        isSupport: true,
        status: 'delivered',
      };
      setMessages(prev => [...prev, errorReply]);
    }
  }, [inputText, sendAiMessage]);

  const handleQuickReply = (reply: string) => {
    setInputText(reply);
  };

  const submitTicket = useCallback((subject: string, category: 'general' | 'kyc' | 'technical' | 'trading' | 'wallet', message: string) => {
    createTicketMutation.mutate({
      subject,
      category,
      message,
    }, {
      onSuccess: (data) => {
        if (data.success) {
          console.log('[Chat] Ticket created:', data.ticketId, 'category:', category);
          ticketsQuery.refetch();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Ticket Created', `Your ${subject} ticket has been submitted. We'll respond within 24 hours.`);
        }
      },
      onError: (error) => {
        console.error('[Chat] Create ticket error:', error);
        Alert.alert('Error', 'Could not create ticket. Please try again.');
      },
    });
  }, [createTicketMutation, ticketsQuery]);

  const renderConnectionStatus = () => {
    return (
      <View style={styles.connectionStatusContainer}>
        <View style={styles.connectionStatusInner}>
          {connectionStatus === 'connecting' && (
            <>
              <Animated.View style={[styles.statusDot, styles.statusDotConnecting, { opacity: pulseAnim }]} />
              <View style={styles.connectionTextContainer}>
                <Text style={styles.connectionStatusText}>{t('connectingAi')}</Text>
                <Text style={styles.connectionSubText}>{t('pleaseWaitMoment')}</Text>
              </View>
            </>
          )}
          {connectionStatus === 'waiting' && (
            <>
              <Animated.View style={[styles.statusDot, styles.statusDotWaiting, { opacity: pulseAnim }]} />
              <View style={styles.connectionTextContainer}>
                <Text style={styles.connectionStatusText}>{t('initializingAi')}</Text>
                <Text style={styles.connectionSubText}>{t('almostReady')}</Text>
              </View>
            </>
          )}
          {connectionStatus === 'connected' && (
            <>
              <View style={[styles.statusDot, styles.statusDotConnected]} />
              <View style={styles.connectionTextContainer}>
                <View style={styles.aiConnectedRow}>
                  <Text style={styles.connectionStatusText}>{t('aiReady')}</Text>
                  <View style={styles.aiBadgeSmall}>
                    <Sparkles size={10} color={Colors.primary} />
                  </View>
                </View>
                <Text style={styles.connectionSubTextOnline}>{t('aiInstantResponses')}</Text>
              </View>
              <View style={styles.agentAvatarContainer}>
                <Bot size={18} color={Colors.primary} />
              </View>
            </>
          )}
        </View>
        {isAiTyping && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>{t('aiTyping')}</Text>
          </View>
        )}
      </View>
    );
  };

  const getTicketStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <Clock size={16} color={Colors.warning} />;
      case 'in_progress':
        return <MessageCircle size={16} color={Colors.info} />;
      case 'resolved':
        return <CheckCircle size={16} color={Colors.success} />;
      default:
        return <HelpCircle size={16} color={Colors.textTertiary} />;
    }
  };

  const getStatusColor = (status: string) => {
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
  };

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

        <View style={[styles.tabsContainer, { marginHorizontal: isXs ? 16 : 20 }]}>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'chat' && styles.tabActive]}
            onPress={() => setViewMode('chat')}
          >
            <MessageCircle size={isXs ? 16 : 18} color={viewMode === 'chat' ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.tabText, { fontSize: isXs ? 12 : 14 }, viewMode === 'chat' && styles.tabTextActive]}>
              {t('liveChat')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'tickets' && styles.tabActive]}
            onPress={() => setViewMode('tickets')}
          >
            <HelpCircle size={isXs ? 16 : 18} color={viewMode === 'tickets' ? Colors.primary : Colors.textTertiary} />
            <Text style={[styles.tabText, { fontSize: isXs ? 12 : 14 }, viewMode === 'tickets' && styles.tabTextActive]}>
              {t('tickets')} ({supportTickets.length})
            </Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'chat' ? (
          <KeyboardAvoidingView
            style={styles.chatContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={90}
          >
            {renderConnectionStatus()}
            
            <ScrollView
              ref={scrollViewRef}
              style={[styles.messagesContainer, { minHeight: height * 0.4 }]}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.welcomeCard, { marginHorizontal: isXs ? 12 : 16, padding: isXs ? 16 : 20 }]}>
                <View style={[styles.welcomeIconContainer, { width: isXs ? 48 : 56, height: isXs ? 48 : 56 }]}>
                  <Headphones size={isXs ? 24 : 28} color={Colors.primary} />
                </View>
                <Text style={[styles.welcomeTitle, { fontSize: isXs ? 16 : 18 }]}>{t('welcomeSupport')}</Text>
                <Text style={[styles.welcomeText, { fontSize: isXs ? 12 : 14 }]}>
                  {t('welcomeSupportDesc')}
                </Text>
                <View style={[styles.welcomeFeatures, { flexDirection: isXs ? 'column' : 'row', gap: isXs ? 8 : 16 }]}>
                  <View style={styles.welcomeFeature}>
                    <CheckCircle size={isXs ? 12 : 14} color={Colors.success} />
                    <Text style={[styles.welcomeFeatureText, { fontSize: isXs ? 11 : 12 }]}>{t('avgResponse')}</Text>
                  </View>
                  <View style={styles.welcomeFeature}>
                    <CheckCircle size={isXs ? 12 : 14} color={Colors.success} />
                    <Text style={[styles.welcomeFeatureText, { fontSize: isXs ? 11 : 12 }]}>{t('expertAgents')}</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  style={[styles.startChatButton, { paddingVertical: isXs ? 12 : 14, paddingHorizontal: isXs ? 16 : 20 }, createTicketMutation.isPending && { opacity: 0.6 }]}
                  disabled={createTicketMutation.isPending}
                  onPress={() => {
                    const openTickets = supportTickets.filter(t => t.status === 'open' || t.status === 'in_progress');
                    if (openTickets.length >= 3) {
                      const limitMsg: ChatMessage = {
                        id: `msg-limit-${Date.now()}`,
                        senderId: 'ai-support',
                        senderName: 'IPX AI',
                        senderAvatar: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=200',
                        message: `You have ${openTickets.length} open tickets. Please wait for existing tickets to be resolved before creating new ones. Check the Tickets tab for updates.`,
                        timestamp: new Date().toISOString(),
                        isSupport: true,
                        status: 'delivered',
                      };
                      setMessages(prev => [...prev, limitMsg]);
                      return;
                    }

                    const recentContext = messages.slice(-5).filter(m => !m.isSupport).map(m => m.message).join(' | ');
                    const ticketSubject = recentContext.length > 10 
                      ? `Live Chat: ${recentContext.substring(0, 80)}...`
                      : 'Live Chat Request';

                    createTicketMutation.mutate({
                      subject: ticketSubject,
                      category: 'general',
                      message: recentContext.length > 10
                        ? `User requested live agent after discussing: ${recentContext.substring(0, 200)}`
                        : 'I would like to speak with a human support agent.',
                    }, {
                      onSuccess: (data) => {
                        if (data.success) {
                          console.log('[Chat] Live chat ticket created:', data.ticketId);
                          ticketsQuery.refetch();
                          const waitTime = openTickets.length === 0 ? '5-10' : `${10 + openTickets.length * 5}-${15 + openTickets.length * 5}`;
                          const confirmMsg: ChatMessage = {
                            id: `msg-ticket-${Date.now()}`,
                            senderId: 'ai-support',
                            senderName: 'IPX AI',
                            senderAvatar: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=200',
                            message: `Your live chat request has been submitted (Ticket #${data.ticketId?.slice(-6) ?? 'pending'}). Estimated wait time: ${waitTime} minutes. A support agent will be assigned shortly. You can track your ticket in the Tickets tab.`,
                            timestamp: new Date().toISOString(),
                            isSupport: true,
                            status: 'delivered',
                          };
                          setMessages(prev => [...prev, confirmMsg]);
                          setTimeout(() => setViewMode('tickets'), 2000);
                        }
                      },
                      onError: (error) => {
                        console.error('[Chat] Live chat ticket error:', error);
                        const errorMsg: ChatMessage = {
                          id: `msg-error-${Date.now()}`,
                          senderId: 'ai-support',
                          senderName: 'IPX AI',
                          senderAvatar: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=200',
                          message: 'Sorry, we could not create your support ticket right now. Please try again later or email us at support@ipxholding.com.',
                          timestamp: new Date().toISOString(),
                          isSupport: true,
                          status: 'delivered',
                        };
                        setMessages(prev => [...prev, errorMsg]);
                      },
                    });
                  }}
                >
                  <Headphones size={isXs ? 16 : 18} color={Colors.black} />
                  <Text style={[styles.startChatText, { fontSize: isXs ? 13 : 15 }]}>{t('startLiveHuman')}</Text>
                  <ArrowRight size={isXs ? 16 : 18} color={Colors.black} />
                </TouchableOpacity>
              </View>

              {messages.map(message => (
                <ChatBubble key={message.id} message={message} />
              ))}
            </ScrollView>

            <View style={styles.quickRepliesContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.quickRepliesContent, { paddingHorizontal: isXs ? 12 : 16 }]}
              >
                {quickReplies.map((reply, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.quickReplyButton, { paddingHorizontal: isXs ? 10 : 14, paddingVertical: isXs ? 6 : 8 }]}
                    onPress={() => handleQuickReply(reply)}
                  >
                    <Text style={[styles.quickReplyText, { fontSize: isXs ? 11 : 13 }]}>{reply}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <SafeAreaView edges={['bottom']} style={[styles.inputContainer, { paddingHorizontal: isXs ? 12 : 16 }]}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, { fontSize: isXs ? 14 : 16, minHeight: isXs ? 44 : 50, paddingHorizontal: isXs ? 14 : 18 }]}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={t('typeMessage')}
                  placeholderTextColor={Colors.inputPlaceholder}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.sendButton, { width: isXs ? 44 : 50, height: isXs ? 44 : 50 }, !inputText.trim() && styles.sendButtonDisabled]}
                  onPress={handleSend}
                  disabled={!inputText.trim()}
                >
                  <Send size={isXs ? 18 : 20} color={inputText.trim() ? Colors.black : Colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView style={[styles.ticketsContainer, { paddingHorizontal: isXs ? 16 : 20 }]} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={[styles.newTicketButton, { paddingVertical: isXs ? 12 : 14 }]}
              onPress={() => {
                Alert.alert(
                  'New Support Ticket',
                  'What do you need help with?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Account Issue',
                      onPress: () => submitTicket('Account Issue', 'general', 'I need help with my account.'),
                    },
                    {
                      text: 'Investment Help',
                      onPress: () => submitTicket('Investment Help', 'trading', 'I need help with my investments.'),
                    },
                    {
                      text: 'General Support',
                      onPress: () => submitTicket('General Support', 'general', 'I need general assistance.'),
                    },
                  ]
                );
              }}
            >
              <HelpCircle size={isXs ? 18 : 20} color={Colors.black} />
              <Text style={[styles.newTicketText, { fontSize: isXs ? 14 : 15 }]}>Create New Ticket</Text>
            </TouchableOpacity>

            {supportTickets.map(ticket => (
              <TouchableOpacity key={ticket.id} style={[styles.ticketCard, { padding: isXs ? 12 : 16 }]}>
                <View style={styles.ticketHeader}>
                  <View style={styles.ticketStatus}>
                    {getTicketStatusIcon(ticket.status)}
                    <Text style={[styles.ticketStatusText, { color: getStatusColor(ticket.status) }]}>
                      {ticket.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.ticketDate}>
                    {new Date(ticket.createdAt ?? Date.now()).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                <View style={styles.ticketFooter}>
                  <View style={styles.ticketCategory}>
                    <Text style={styles.ticketCategoryText}>{ticket.category}</Text>
                  </View>
                  <Text style={styles.ticketMessages}>
                    {ticket.messages.length} messages
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.bottomPadding} />
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
  chatContainer: {
    flex: 1,
  },
  connectionStatusContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectionStatusInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotConnecting: {
    backgroundColor: Colors.warning,
  },
  statusDotWaiting: {
    backgroundColor: Colors.info,
  },
  statusDotConnected: {
    backgroundColor: Colors.success,
  },
  connectionTextContainer: {
    flex: 1,
  },
  connectionStatusText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  connectionSubText: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  connectionSubTextOnline: {
    color: Colors.success,
    fontSize: 12,
    marginTop: 2,
  },
  agentAvatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiConnectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiBadgeSmall: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 6,
    padding: 3,
  },
  typingIndicator: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  typingText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontStyle: 'italic',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 4,
  },
  welcomeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  welcomeIconContainer: {
    borderRadius: 28,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  welcomeTitle: {
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  welcomeText: {
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  welcomeFeatures: {
    alignItems: 'center',
    marginBottom: 18,
  },
  welcomeFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  welcomeFeatureText: {
    color: Colors.textSecondary,
  },
  startChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    width: '100%',
  },
  startChatText: {
    fontWeight: '700' as const,
    color: Colors.black,
  },
  quickRepliesContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingVertical: 8,
  },
  quickRepliesContent: {
    gap: 8,
  },
  quickReplyButton: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  quickReplyText: {
    color: Colors.text,
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
    paddingVertical: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendButton: {
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surface,
  },
  ticketsContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
  bottomPadding: {
    height: 40,
  },
});
