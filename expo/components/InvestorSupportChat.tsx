import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  useWindowDimensions,
  Alert,
  Keyboard,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Bot, CheckCircle, Headphones, Send, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { useTranslation } from '@/lib/i18n-context';
import { getResponsiveSize, isExtraSmallScreen } from '@/lib/responsive';
import { aiInvestorService } from '@/lib/ai-investor-service';
import { awsAnalyticsBackup } from '@/lib/aws-analytics-backup';
import type { AWSAnalyticsEvent } from '@/lib/aws-analytics-backup';
import type { ChatMessage } from '@/types';
import ChatBubble from '@/components/ChatBubble';

type ConnectionStatus = 'connecting' | 'connected' | 'waiting';

type ChatVariant = 'screen' | 'card';

const DEFAULT_QUICK_REPLIES = IVX_OWNER_AI_PROFILE.support.quickReplies;

const DEFAULT_WELCOME_MESSAGE = IVX_OWNER_AI_PROFILE.support.welcomeMessage;

const MAX_RENDERED_MESSAGES = 120;

function trimMessages(nextMessages: ChatMessage[]): ChatMessage[] {
  if (nextMessages.length <= MAX_RENDERED_MESSAGES) {
    return nextMessages;
  }

  return nextMessages.slice(nextMessages.length - MAX_RENDERED_MESSAGES);
}

export interface HumanSupportRequestResult {
  ok: boolean;
  message: string;
}

interface InvestorSupportChatProps {
  variant?: ChatVariant;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  source: AWSAnalyticsEvent['source'];
  testIdPrefix: string;
  keyboardVerticalOffset?: number;
  extraBottomInset?: number;
  requestHumanLabel?: string;
  welcomeMessage?: string;
  onRequestHumanSupport: (messages: ChatMessage[]) => Promise<HumanSupportRequestResult>;
  quickReplies?: readonly string[];
}

export default function InvestorSupportChat({
  variant = 'screen',
  style,
  contentStyle,
  source,
  testIdPrefix,
  keyboardVerticalOffset = 0,
  extraBottomInset = 0,
  requestHumanLabel,
  welcomeMessage = DEFAULT_WELCOME_MESSAGE,
  onRequestHumanSupport,
  quickReplies = DEFAULT_QUICK_REPLIES,
}: InvestorSupportChatProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      senderId: 'support-1',
      senderName: IVX_OWNER_AI_PROFILE.support.assistantDisplayName,
      senderAvatar: '',
      message: welcomeMessage,
      timestamp: new Date().toISOString(),
      isSupport: true,
      status: 'read',
    },
  ]);
  const [inputText, setInputText] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isAiTyping, setIsAiTyping] = useState<boolean>(false);
  const [isEscalating, setIsEscalating] = useState<boolean>(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState<boolean>(false);
  const [_aiProvider, setAiProvider] = useState<string>('');
  const messagesListRef = useRef<FlatList<ChatMessage>>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const screenSize = getResponsiveSize(width);
  const isXs = isExtraSmallScreen(screenSize);
  const isCard = variant === 'card';
  const composerBottomPadding = useMemo(() => {
    if (isCard) {
      return 10;
    }

    const accessoryInset = isKeyboardVisible ? 0 : extraBottomInset;
    return Math.max(insets.bottom + accessoryInset, 8 + accessoryInset);
  }, [extraBottomInset, insets.bottom, isCard, isKeyboardVisible]);

  const scrollToLatest = useCallback((animated: boolean = true) => {
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    scrollToLatest(true);
  }, [isAiTyping, isKeyboardVisible, messages, scrollToLatest]);

  useEffect(() => {
    const connectTimer = setTimeout(() => {
      setConnectionStatus('waiting');
    }, 1000);

    const agentTimer = setTimeout(() => {
      setConnectionStatus('connected');
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      clearTimeout(agentTimer);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      console.log('[InvestorSupportChat] Keyboard shown');
      setIsKeyboardVisible(true);
      scrollToLatest(true);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      console.log('[InvestorSupportChat] Keyboard hidden');
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToLatest]);

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

  const appendSupportMessage = useCallback((message: string) => {
    const supportReply: ChatMessage = {
      id: `msg-support-${Date.now()}`,
      senderId: 'ai-support',
      senderName: IVX_OWNER_AI_PROFILE.support.assistantDisplayName,
      senderAvatar: '',
      message,
      timestamp: new Date().toISOString(),
      isSupport: true,
      status: 'delivered',
    };

    setMessages((prev) => trimMessages([...prev, supportReply]));
  }, []);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isAiTyping) {
      return;
    }

    const userText = inputText.trim();
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: 'user-1',
      senderName: 'You',
      senderAvatar: '',
      message: userText,
      timestamp: new Date().toISOString(),
      isSupport: false,
      status: 'sent',
    };

    const nextMessages = trimMessages([...messages, userMessage]);
    setMessages((prev) => trimMessages([...prev, userMessage]));
    setInputText('');
    setIsAiTyping(true);

    try {
      const result = await aiInvestorService.generateResponse(userText, undefined, undefined, nextMessages);
      setAiProvider(result.provider);
      console.log('[InvestorSupportChat] AI response via', result.provider, '| lang:', result.language, '| failovers:', result.failovers, '| source:', source);

      const aiReply: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        senderId: 'ai-support',
        senderName: IVX_OWNER_AI_PROFILE.support.assistantDisplayName,
        senderAvatar: '',
        message: result.text,
        timestamp: new Date().toISOString(),
        isSupport: true,
        status: 'delivered',
      };

      setMessages((prev) => trimMessages([...prev, aiReply]));
      setIsAiTyping(false);

      try {
        awsAnalyticsBackup.enqueue({
          id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          event: 'ai_chat_interaction',
          session_id: `${source}_${Date.now()}`,
          properties: {
            user_message_length: userText.length,
            ai_provider: result.provider,
            language: result.language,
            failovers: result.failovers,
          },
          platform: Platform.OS,
          source,
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      } catch (analyticsError) {
        console.log('[InvestorSupportChat] Analytics enqueue failed:', (analyticsError as Error)?.message);
      }
    } catch (error) {
      console.error('[InvestorSupportChat] AI error:', error);
      setIsAiTyping(false);
      appendSupportMessage("I'm having trouble right now. Please try again in a moment or request human support below.");
    }
  }, [appendSupportMessage, inputText, isAiTyping, messages, source]);

  const handleQuickReply = useCallback((reply: string) => {
    setInputText(reply);
  }, []);

  const handleRequestHuman = useCallback(async () => {
    if (isEscalating) {
      return;
    }

    setIsEscalating(true);

    try {
      const result = await onRequestHumanSupport(messages);
      appendSupportMessage(result.message);

      if (result.ok) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (error) {
      console.error('[InvestorSupportChat] Human support request failed:', error);
      appendSupportMessage('We could not connect human support right now. Please try again shortly or contact investors@ivxholding.com.');
      Alert.alert('Support unavailable', 'Please try again in a moment.');
    } finally {
      setIsEscalating(false);
    }
  }, [appendSupportMessage, isEscalating, messages, onRequestHumanSupport]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    return <ChatBubble message={item} />;
  }, []);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const welcomeHeader = useMemo(() => {
    return (
      <View style={[styles.welcomeCard, isCard && styles.welcomeCardCompact, { marginHorizontal: isXs ? 12 : 16, padding: isXs ? 16 : 20 }]}>
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
          style={[styles.startChatButton, { paddingVertical: isXs ? 12 : 14, paddingHorizontal: isXs ? 16 : 20 }, isEscalating && styles.startChatButtonDisabled]}
          disabled={isEscalating}
          onPress={() => {
            void handleRequestHuman();
          }}
          activeOpacity={0.85}
          testID={`${testIdPrefix}-request-human`}
        >
          <Headphones size={isXs ? 16 : 18} color={Colors.black} />
          <Text style={[styles.startChatText, { fontSize: isXs ? 13 : 15 }]}>{requestHumanLabel ?? t('startLiveHuman')}</Text>
          <ArrowRight size={isXs ? 16 : 18} color={Colors.black} />
        </TouchableOpacity>
      </View>
    );
  }, [handleRequestHuman, isCard, isEscalating, isXs, requestHumanLabel, t, testIdPrefix]);

  const canSendMessage = inputText.trim().length > 0 && !isAiTyping;

  const renderConnectionStatus = useCallback(() => {
    return (
      <View style={[styles.connectionStatusContainer, isCard && styles.connectionStatusContainerCard]}>
        <View style={styles.connectionStatusInner}>
          {connectionStatus === 'connecting' ? (
            <>
              <Animated.View style={[styles.statusDot, styles.statusDotConnecting, { opacity: pulseAnim }]} />
              <View style={styles.connectionTextContainer}>
                <Text style={styles.connectionStatusText}>{t('connectingAi')}</Text>
                <Text style={styles.connectionSubText}>{t('pleaseWaitMoment')}</Text>
              </View>
            </>
          ) : null}

          {connectionStatus === 'waiting' ? (
            <>
              <Animated.View style={[styles.statusDot, styles.statusDotWaiting, { opacity: pulseAnim }]} />
              <View style={styles.connectionTextContainer}>
                <Text style={styles.connectionStatusText}>{t('initializingAi')}</Text>
                <Text style={styles.connectionSubText}>{t('almostReady')}</Text>
              </View>
            </>
          ) : null}

          {connectionStatus === 'connected' ? (
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
          ) : null}
        </View>

        {isAiTyping ? (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>{t('aiTyping')}</Text>
          </View>
        ) : null}
      </View>
    );
  }, [connectionStatus, isAiTyping, isCard, pulseAnim, t]);

  return (
    <View style={[styles.container, isCard && styles.containerCard, style]} testID={`${testIdPrefix}-container`}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(keyboardVerticalOffset, 80) : keyboardVerticalOffset}
      >
        {renderConnectionStatus()}

        <FlatList
          ref={messagesListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={[styles.messagesContainer, isCard && styles.messagesContainerCard]}
          contentContainerStyle={[styles.messagesContent, contentStyle]}
          ListHeaderComponent={welcomeHeader}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          onContentSizeChange={() => {
            scrollToLatest(false);
          }}
          testID={`${testIdPrefix}-messages`}
        />

        <View style={styles.quickRepliesContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.quickRepliesContent, { paddingHorizontal: isXs ? 12 : 16 }]}
            keyboardShouldPersistTaps="handled"
            testID={`${testIdPrefix}-quick-replies`}
          >
            {quickReplies.map((reply, index) => (
              <TouchableOpacity
                key={`${reply}-${index}`}
                style={[styles.quickReplyButton, { paddingHorizontal: isXs ? 10 : 14, paddingVertical: isXs ? 6 : 8 }]}
                onPress={() => handleQuickReply(reply)}
                testID={`${testIdPrefix}-quick-reply-${index}`}
              >
                <Text style={[styles.quickReplyText, { fontSize: isXs ? 11 : 13 }]}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {isCard ? (
          <View style={[styles.inputContainer, { paddingHorizontal: isXs ? 12 : 16, paddingBottom: composerBottomPadding }]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, { fontSize: isXs ? 14 : 16, minHeight: isXs ? 44 : 50, paddingHorizontal: isXs ? 14 : 18 }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder={t('typeMessage')}
                placeholderTextColor={Colors.inputPlaceholder}
                multiline
                maxLength={500}
                testID={`${testIdPrefix}-input`}
              />
              <TouchableOpacity
                style={[styles.sendButton, { width: isXs ? 44 : 50, height: isXs ? 44 : 50 }, !canSendMessage && styles.sendButtonDisabled]}
                onPress={() => {
                  void handleSend();
                }}
                disabled={!canSendMessage}
                testID={`${testIdPrefix}-send`}
              >
                <Send size={isXs ? 18 : 20} color={canSendMessage ? Colors.black : Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <SafeAreaView edges={['bottom']} style={[styles.inputContainer, { paddingHorizontal: isXs ? 12 : 16, paddingBottom: composerBottomPadding }]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, { fontSize: isXs ? 14 : 16, minHeight: isXs ? 44 : 50, paddingHorizontal: isXs ? 14 : 18 }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder={t('typeMessage')}
                placeholderTextColor={Colors.inputPlaceholder}
                multiline
                maxLength={500}
                testID={`${testIdPrefix}-input`}
              />
              <TouchableOpacity
                style={[styles.sendButton, { width: isXs ? 44 : 50, height: isXs ? 44 : 50 }, !canSendMessage && styles.sendButtonDisabled]}
                onPress={() => {
                  void handleSend();
                }}
                disabled={!canSendMessage}
                testID={`${testIdPrefix}-send`}
              >
                <Send size={isXs ? 18 : 20} color={canSendMessage ? Colors.black : Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  containerCard: {
    backgroundColor: '#090909',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    overflow: 'hidden' as const,
  },
  keyboardContainer: {
    flex: 1,
  },
  connectionStatusContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectionStatusContainerCard: {
    paddingTop: 14,
  },
  connectionStatusInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  aiConnectedRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    fontStyle: 'italic' as const,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  messagesContainerCard: {
    backgroundColor: '#090909',
  },
  messagesContent: {
    paddingVertical: 12,
    gap: 4,
  },
  welcomeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    alignItems: 'center' as const,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  welcomeCardCompact: {
    marginTop: 2,
  },
  welcomeIconContainer: {
    borderRadius: 28,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 14,
  },
  welcomeTitle: {
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  welcomeText: {
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: 16,
  },
  welcomeFeatures: {
    alignItems: 'center' as const,
    marginBottom: 18,
  },
  welcomeFeature: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  welcomeFeatureText: {
    color: Colors.textSecondary,
  },
  startChatButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    width: '100%',
  },
  startChatButtonDisabled: {
    opacity: 0.65,
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
    paddingTop: 8,
  },
  inputWrapper: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surface,
  },
});
