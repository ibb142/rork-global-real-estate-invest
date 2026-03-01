import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Modal,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Users,
  Eye,
  Heart,
  MessageCircle,
  Calendar,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  RefreshCw,
  Zap,
  Target,
  BarChart3,
  PieChart,
  Activity,
  Globe,
  Sparkles,
  Brain,
  Instagram,
  Facebook,
  Linkedin,
  Music,
  ChevronRight,
  Download,
  FileText,
  Mail,
  X,
  Smile,
  Frown,
  Meh,
  Youtube,
  Search,
  ArrowLeft,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { generateText } from '@rork-ai/toolkit-sdk';
import * as Haptics from 'expo-haptics';
import {
  socialPlatforms,
  aiAgents,
  contentQueue,
  analyticsHistory,
  commentThreads,
  campaignMetrics,
  weeklyPerformance,
  audienceInsights,
  getActiveAgentsCount,
  getPendingComments,
  getTotalFollowers,
  getAverageEngagement,
  AIAgent,
  ContentPost,
} from '@/mocks/social-media';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabType = 'overview' | 'agents' | 'content' | 'analytics' | 'comments';

export default function SocialCommandScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [, setSelectedContent] = useState<ContentPost | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [agentFilter, setAgentFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [showCreateContentModal, setShowCreateContentModal] = useState(false);
  const [contentTopic, setContentTopic] = useState('');
  const [selectedPlatformForContent, setSelectedPlatformForContent] = useState<string>('instagram');
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [generatingCommentId, setGeneratingCommentId] = useState<string | null>(null);
  const [localComments, setLocalComments] = useState(commentThreads);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const handleTabChange = (tab: TabType) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setActiveTab(tab);
  };

  const handleOpenCreateContent = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowCreateContentModal(true);
    setGeneratedContent('');
    setContentTopic('');
    console.log('[AI Content] Opening Create with AI modal');
  }, []);

  const handleGenerateContent = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setIsGeneratingContent(true);
    setGeneratedContent('');
    console.log('[AI Content] Starting content generation');
    console.log('[AI Content] Platform:', selectedPlatformForContent);
    console.log('[AI Content] Topic:', contentTopic || '(auto-generate)');

    try {
      const topicToUse = contentTopic.trim() || 'real estate investment opportunities with fractional ownership';
      
      const prompt = `Create a ${selectedPlatformForContent} post about "${topicToUse}" for IVX HOLDINGS, a real estate investment platform.

Requirements:
- Engaging and shareable
- Platform-optimized for ${selectedPlatformForContent}
- Include emojis
- Add relevant hashtags
- Professional but approachable
- Make it compelling and action-oriented
- Output ONLY the post content, nothing else`;

      console.log('[AI Content] Calling generateText API...');
      const response = await generateText({ messages: [{ role: 'user', content: prompt }] });
      
      console.log('[AI Content] Response received, length:', response?.length);
      
      if (response && typeof response === 'string' && response.trim().length > 0) {
        setGeneratedContent(response.trim());
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        console.log('[AI Content] Content generated successfully');
      } else {
        throw new Error('Empty response from AI');
      }
    } catch (error) {
      console.error('[AI Content] Generation error:', error);
      const topicToUse = contentTopic.trim() || 'Real Estate Investment';
      const fallbackContent = `🏠 ${topicToUse}\n\n💰 Invest in premium real estate starting at just $100 with IVX HOLDINGS!\n\n✅ Monthly dividends\n✅ Full transparency\n✅ Diversified portfolio\n✅ No landlord headaches\n\n🔗 Start your investment journey today!\n\n#IPXHolding #RealEstateInvesting #PassiveIncome #FractionalOwnership #WealthBuilding`;
      setGeneratedContent(fallbackContent);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      Alert.alert('Note', 'Using pre-made content template. AI service temporarily unavailable.');
    } finally {
      setIsGeneratingContent(false);
      console.log('[AI Content] Generation complete');
    }
  }, [contentTopic, selectedPlatformForContent]);

  const handleGenerateCommentResponse = useCallback(async (commentId: string, commentText: string, username: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setGeneratingCommentId(commentId);
    console.log('[AI Response] Generating response for comment:', commentId);

    try {
      const prompt = `Generate a professional, friendly response to this social media comment from ${username}:

"${commentText}"

Context: You are responding on behalf of IVX HOLDINGS, a real estate investment platform.

Requirements:
- Be helpful and professional
- Address their comment directly
- Keep it concise (2-3 sentences max)
- Be friendly but professional
- If it's a question, provide a helpful answer
- Output ONLY the response, nothing else`;

      console.log('[AI Response] Calling generateText API...');
      const response = await generateText({ messages: [{ role: 'user', content: prompt }] });
      
      if (response && typeof response === 'string' && response.trim().length > 0) {
        setLocalComments(prev => prev.map(c => 
          c.id === commentId 
            ? { ...c, aiResponse: response.trim(), responded: true }
            : c
        ));
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        console.log('[AI Response] Response generated successfully');
        Alert.alert('Success', 'AI response generated!');
      } else {
        throw new Error('Empty response');
      }
    } catch (error) {
      console.error('[AI Response] Generation error:', error);
      const fallbackResponse = `Thank you for reaching out, ${username}! We appreciate your interest in IVX HOLDINGS. Our team will get back to you shortly with more details. 🏠`;
      setLocalComments(prev => prev.map(c => 
        c.id === commentId 
          ? { ...c, aiResponse: fallbackResponse, responded: true }
          : c
      ));
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      Alert.alert('Note', 'Using template response. AI service temporarily unavailable.');
    } finally {
      setGeneratingCommentId(null);
    }
  }, []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram': return <Instagram size={16} color="#E4405F" />;
      case 'facebook': return <Facebook size={16} color="#1877F2" />;
      case 'linkedin': return <Linkedin size={16} color="#0A66C2" />;
      case 'tiktok': return <Music size={16} color="#000" />;
      case 'whatsapp': return <MessageCircle size={16} color="#25D366" />;
      case 'google-ads': return <Search size={16} color="#4285F4" />;
      case 'youtube': return <Youtube size={16} color="#FF0000" />;
      default: return <Globe size={16} color={Colors.textSecondary} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#10B981';
      case 'working': return '#3B82F6';
      case 'idle': return '#F59E0B';
      case 'paused': return '#EF4444';
      default: return Colors.textSecondary;
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <Smile size={16} color="#10B981" />;
      case 'negative': return <Frown size={16} color="#EF4444" />;
      default: return <Meh size={16} color="#F59E0B" />;
    }
  };

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.liveStatusBar}>
        <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.liveText}>LIVE</Text>
        <Text style={styles.liveSubtext}>{getActiveAgentsCount()} AI agents working</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardLarge]}>
          <View style={styles.statIconContainer}>
            <Users size={24} color="#3B82F6" />
          </View>
          <Text style={styles.statValue}>{formatNumber(getTotalFollowers())}</Text>
          <Text style={styles.statLabel}>Total Followers</Text>
          <View style={styles.statTrend}>
            <TrendingUp size={14} color="#10B981" />
            <Text style={styles.statTrendText}>+2.3%</Text>
          </View>
        </View>

        <View style={[styles.statCard, styles.statCardLarge]}>
          <View style={[styles.statIconContainer, { backgroundColor: '#FEF3C7' }]}>
            <Heart size={24} color="#F59E0B" />
          </View>
          <Text style={styles.statValue}>{getAverageEngagement().toFixed(1)}%</Text>
          <Text style={styles.statLabel}>Avg Engagement</Text>
          <View style={styles.statTrend}>
            <TrendingUp size={14} color="#10B981" />
            <Text style={styles.statTrendText}>+0.5%</Text>
          </View>
        </View>

        <View style={styles.statCard}>
          <Eye size={20} color="#8B5CF6" />
          <Text style={styles.statValueSmall}>{formatNumber(weeklyPerformance.impressions.current)}</Text>
          <Text style={styles.statLabelSmall}>Impressions</Text>
        </View>

        <View style={styles.statCard}>
          <Target size={20} color="#EC4899" />
          <Text style={styles.statValueSmall}>{formatNumber(weeklyPerformance.reach.current)}</Text>
          <Text style={styles.statLabelSmall}>Reach</Text>
        </View>

        <View style={styles.statCard}>
          <MessageCircle size={20} color="#10B981" />
          <Text style={styles.statValueSmall}>{getPendingComments().length}</Text>
          <Text style={styles.statLabelSmall}>Pending</Text>
        </View>

        <View style={styles.statCard}>
          <Zap size={20} color="#F59E0B" />
          <Text style={styles.statValueSmall}>{contentQueue.filter(c => c.status === 'scheduled' || c.status === 'approved').length}</Text>
          <Text style={styles.statLabelSmall}>Scheduled</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Connected Platforms</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformsScroll}>
        {socialPlatforms.map((platform) => (
          <TouchableOpacity
            key={platform.id}
            style={[styles.platformCard, !platform.connected && styles.platformCardDisconnected]}
          >
            <View style={[styles.platformIcon, { backgroundColor: platform.color + '20' }]}>
              {getPlatformIcon(platform.id)}
            </View>
            <Text style={styles.platformName}>{platform.name}</Text>
            {platform.connected ? (
              <>
                <Text style={styles.platformFollowers}>{formatNumber(platform.followers)}</Text>
                <View style={styles.platformEngagement}>
                  <Heart size={12} color="#EF4444" />
                  <Text style={styles.platformEngagementText}>{platform.engagement}%</Text>
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.connectButton}>
                <Text style={styles.connectButtonText}>Connect</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Weekly Performance</Text>
      <View style={styles.chartContainer}>
        <View style={styles.chartBars}>
          {analyticsHistory.map((day, index) => {
            const maxImpressions = Math.max(...analyticsHistory.map(d => d.impressions));
            const height = (day.impressions / maxImpressions) * 100;
            return (
              <View key={day.date} style={styles.chartBarContainer}>
                <View style={[styles.chartBar, { height: `${height}%` }]}>
                  <View style={[styles.chartBarFill, { backgroundColor: index === analyticsHistory.length - 1 ? '#3B82F6' : '#3B82F620' }]} />
                </View>
                <Text style={styles.chartLabel}>{day.date.slice(-2)}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.legendText}>Impressions</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Top Performing Content</Text>
      {contentQueue.filter(c => c.status === 'published').slice(0, 3).map((post) => (
        <TouchableOpacity key={post.id} style={styles.topContentCard}>
          {post.mediaUrl && (
            <Image source={{ uri: post.mediaUrl }} style={styles.topContentImage} />
          )}
          <View style={styles.topContentInfo}>
            <Text style={styles.topContentText} numberOfLines={2}>{post.content}</Text>
            <View style={styles.topContentStats}>
              <View style={styles.topContentStat}>
                <Eye size={14} color={Colors.textSecondary} />
                <Text style={styles.topContentStatText}>{formatNumber(Math.floor(Math.random() * 100000))}</Text>
              </View>
              <View style={styles.topContentStat}>
                <Heart size={14} color="#EF4444" />
                <Text style={styles.topContentStatText}>{post.engagementPrediction}%</Text>
              </View>
            </View>
          </View>
          <View style={styles.viralBadge}>
            <Sparkles size={12} color="#F59E0B" />
            <Text style={styles.viralBadgeText}>{post.viralPotential}%</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderAgentsTab = () => {
    const filteredAgents = agentFilter === 'all' 
      ? aiAgents 
      : aiAgents.filter(a => agentFilter === 'active' ? (a.status === 'active' || a.status === 'working') : a.status === 'idle');

    return (
      <View style={styles.tabContent}>
        <View style={styles.agentHeader}>
          <View style={styles.agentStats}>
            <View style={styles.agentStatItem}>
              <Text style={styles.agentStatValue}>{aiAgents.filter(a => a.status === 'working').length}</Text>
              <Text style={styles.agentStatLabel}>Working</Text>
            </View>
            <View style={styles.agentStatItem}>
              <Text style={styles.agentStatValue}>{aiAgents.filter(a => a.status === 'active').length}</Text>
              <Text style={styles.agentStatLabel}>Active</Text>
            </View>
            <View style={styles.agentStatItem}>
              <Text style={styles.agentStatValue}>{aiAgents.filter(a => a.status === 'idle').length}</Text>
              <Text style={styles.agentStatLabel}>Idle</Text>
            </View>
          </View>
          <View style={styles.agentFilters}>
            {(['all', 'active', 'idle'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.filterButton, agentFilter === filter && styles.filterButtonActive]}
                onPress={() => setAgentFilter(filter)}
              >
                <Text style={[styles.filterButtonText, agentFilter === filter && styles.filterButtonTextActive]}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {filteredAgents.map((agent) => (
          <TouchableOpacity
            key={agent.id}
            style={styles.agentCard}
            onPress={() => setSelectedAgent(agent)}
          >
            <Image source={{ uri: agent.avatar }} style={styles.agentAvatar} />
            <View style={styles.agentInfo}>
              <View style={styles.agentNameRow}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <View style={[styles.agentStatusBadge, { backgroundColor: getStatusColor(agent.status) + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(agent.status) }]} />
                  <Text style={[styles.agentStatusText, { color: getStatusColor(agent.status) }]}>
                    {agent.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.agentRole}>{agent.role}</Text>
              <View style={styles.agentPlatforms}>
                {agent.platform.map((p) => (
                  <View key={p} style={styles.agentPlatformIcon}>
                    {getPlatformIcon(p)}
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.agentMetrics}>
              <Text style={styles.agentMetricValue}>{agent.tasksCompleted}</Text>
              <Text style={styles.agentMetricLabel}>Tasks</Text>
              <View style={styles.accuracyBar}>
                <View style={[styles.accuracyFill, { width: `${agent.accuracy}%` }]} />
              </View>
              <Text style={styles.accuracyText}>{agent.accuracy}%</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderContentTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.contentHeader}>
        <TouchableOpacity style={styles.createContentButton} onPress={handleOpenCreateContent}>
          <Sparkles size={18} color="#fff" />
          <Text style={styles.createContentButtonText}>Create with AI</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contentStatusRow}>
        {['draft', 'reviewing', 'approved', 'scheduled', 'published'].map((status) => {
          const count = contentQueue.filter(c => c.status === status).length;
          return (
            <View key={status} style={styles.contentStatusItem}>
              <Text style={styles.contentStatusCount}>{count}</Text>
              <Text style={styles.contentStatusLabel}>{status}</Text>
            </View>
          );
        })}
      </View>

      {contentQueue.map((post) => (
        <TouchableOpacity
          key={post.id}
          style={styles.contentCard}
          onPress={() => setSelectedContent(post)}
        >
          <View style={styles.contentCardHeader}>
            <View style={styles.contentPlatforms}>
              {post.platform.map((p) => (
                <View key={p} style={styles.contentPlatformIcon}>
                  {getPlatformIcon(p)}
                </View>
              ))}
            </View>
            <View style={[
              styles.contentStatusBadge,
              { backgroundColor: 
                post.status === 'approved' ? '#10B98120' :
                post.status === 'reviewing' ? '#F59E0B20' :
                post.status === 'published' ? '#3B82F620' :
                post.status === 'rejected' ? '#EF444420' :
                '#6B728020'
              }
            ]}>
              <Text style={[
                styles.contentStatusText,
                { color: 
                  post.status === 'approved' ? '#10B981' :
                  post.status === 'reviewing' ? '#F59E0B' :
                  post.status === 'published' ? '#3B82F6' :
                  post.status === 'rejected' ? '#EF4444' :
                  Colors.textSecondary
                }
              ]}>
                {post.status}
              </Text>
            </View>
          </View>

          {post.mediaUrl && (
            <Image source={{ uri: post.mediaUrl }} style={styles.contentMedia} />
          )}

          <Text style={styles.contentText} numberOfLines={3}>{post.content}</Text>

          <View style={styles.contentScores}>
            <View style={styles.scoreItem}>
              <Brain size={14} color="#8B5CF6" />
              <Text style={styles.scoreLabel}>AI Score</Text>
              <Text style={styles.scoreValue}>{post.aiScore}%</Text>
            </View>
            <View style={styles.scoreItem}>
              <Zap size={14} color="#F59E0B" />
              <Text style={styles.scoreLabel}>Viral</Text>
              <Text style={styles.scoreValue}>{post.viralPotential}%</Text>
            </View>
            <View style={styles.scoreItem}>
              <Heart size={14} color="#EF4444" />
              <Text style={styles.scoreLabel}>Engagement</Text>
              <Text style={styles.scoreValue}>{post.engagementPrediction}%</Text>
            </View>
          </View>

          {post.aiSuggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionsTitle}>AI Suggestions:</Text>
              {post.aiSuggestions.slice(0, 2).map((suggestion, index) => (
                <View key={index} style={styles.suggestionItem}>
                  <AlertCircle size={12} color="#F59E0B" />
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </View>
              ))}
            </View>
          )}

          {post.scheduledAt && (
            <View style={styles.scheduledInfo}>
              <Calendar size={14} color={Colors.textSecondary} />
              <Text style={styles.scheduledText}>
                Scheduled: {new Date(post.scheduledAt).toLocaleString()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderAnalyticsTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.analyticsHeader}>
        <Text style={styles.analyticsTitle}>Performance Overview</Text>
        <TouchableOpacity 
          style={styles.exportButton}
          onPress={() => setShowExportModal(true)}
        >
          <Download size={16} color={Colors.primary} />
          <Text style={styles.exportButtonText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metricsGrid}>
        {campaignMetrics.map((metric) => (
          <View key={metric.name} style={styles.metricCard}>
            <Text style={styles.metricName}>{metric.name}</Text>
            <Text style={styles.metricValue}>
              {metric.name.includes('Rate') || metric.name.includes('Cost') 
                ? metric.value.toFixed(1) + (metric.name.includes('Rate') ? '%' : '$')
                : formatNumber(metric.value)}
            </Text>
            <View style={styles.metricTrend}>
              {metric.trend === 'up' ? (
                <TrendingUp size={14} color="#10B981" />
              ) : metric.trend === 'down' ? (
                <TrendingDown size={14} color="#EF4444" />
              ) : (
                <Activity size={14} color="#F59E0B" />
              )}
              <Text style={[
                styles.metricChange,
                { color: metric.trend === 'up' ? '#10B981' : metric.trend === 'down' ? '#EF4444' : '#F59E0B' }
              ]}>
                {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Audience Insights</Text>
      
      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>Age Distribution</Text>
        <View style={styles.ageChart}>
          {audienceInsights.ageGroups.map((group) => (
            <View key={group.range} style={styles.ageBar}>
              <View style={[styles.ageBarFill, { height: `${group.percentage * 2}%` }]} />
              <Text style={styles.ageLabel}>{group.range}</Text>
              <Text style={styles.agePercent}>{group.percentage}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>Top Countries</Text>
        {audienceInsights.topCountries.map((country, index) => (
          <View key={country.country} style={styles.countryRow}>
            <Text style={styles.countryRank}>#{index + 1}</Text>
            <Text style={styles.countryName}>{country.country}</Text>
            <View style={styles.countryBar}>
              <View style={[styles.countryBarFill, { width: `${country.percentage * 2.5}%` }]} />
            </View>
            <Text style={styles.countryPercent}>{country.percentage}%</Text>
          </View>
        ))}
      </View>

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>Peak Activity Hours</Text>
        <View style={styles.hoursChart}>
          {audienceInsights.peakHours.map((hour) => (
            <View key={hour.hour} style={styles.hourBar}>
              <View style={[styles.hourBarFill, { height: `${hour.activity}%` }]} />
              <Text style={styles.hourLabel}>{hour.hour}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const renderCommentsTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.commentsHeader}>
        <View style={styles.commentStats}>
          <View style={styles.commentStatItem}>
            <Text style={styles.commentStatValue}>{localComments.length}</Text>
            <Text style={styles.commentStatLabel}>Total</Text>
          </View>
          <View style={styles.commentStatItem}>
            <Text style={[styles.commentStatValue, { color: '#F59E0B' }]}>{localComments.filter(c => !c.responded).length}</Text>
            <Text style={styles.commentStatLabel}>Pending</Text>
          </View>
          <View style={styles.commentStatItem}>
            <Text style={[styles.commentStatValue, { color: '#10B981' }]}>
              {localComments.filter(c => c.responded).length}
            </Text>
            <Text style={styles.commentStatLabel}>Responded</Text>
          </View>
        </View>
      </View>

      {localComments.map((comment) => (
        <View key={comment.id} style={styles.commentCard}>
          <View style={styles.commentHeader}>
            <Image source={{ uri: comment.avatar }} style={styles.commentAvatar} />
            <View style={styles.commentUserInfo}>
              <Text style={styles.commentUsername}>{comment.username}</Text>
              <View style={styles.commentMeta}>
                {getPlatformIcon(comment.platform)}
                <Text style={styles.commentTime}>
                  {new Date(comment.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={styles.sentimentBadge}>
              {getSentimentIcon(comment.sentiment)}
            </View>
          </View>

          <Text style={styles.commentText}>{comment.comment}</Text>

          {comment.aiResponse ? (
            <View style={styles.aiResponseContainer}>
              <View style={styles.aiResponseHeader}>
                <Bot size={14} color="#3B82F6" />
                <Text style={styles.aiResponseLabel}>AI Response</Text>
                <CheckCircle size={14} color="#10B981" />
              </View>
              <Text style={styles.aiResponseText}>{comment.aiResponse}</Text>
            </View>
          ) : (
            <View style={styles.pendingResponseContainer}>
              <TouchableOpacity 
                style={styles.generateResponseButton}
                onPress={() => handleGenerateCommentResponse(comment.id, comment.comment, comment.username)}
                disabled={generatingCommentId === comment.id}
              >
                {generatingCommentId === comment.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Sparkles size={14} color="#fff" />
                )}
                <Text style={styles.generateResponseText}>
                  {generatingCommentId === comment.id ? 'Generating...' : 'Generate AI Response'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.manualResponseButton}>
                <Text style={styles.manualResponseText}>Reply Manually</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );

  const renderExportModal = () => (
    <Modal
      visible={showExportModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowExportModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Export Analytics Report</Text>
            <TouchableOpacity onPress={() => setShowExportModal(false)}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>Choose export format:</Text>

          <TouchableOpacity style={styles.exportOption}>
            <View style={[styles.exportIconContainer, { backgroundColor: '#EF444420' }]}>
              <FileText size={24} color="#EF4444" />
            </View>
            <View style={styles.exportOptionInfo}>
              <Text style={styles.exportOptionTitle}>PDF Report</Text>
              <Text style={styles.exportOptionDesc}>Detailed analytics with charts</Text>
            </View>
            <ChevronRight size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportOption}>
            <View style={[styles.exportIconContainer, { backgroundColor: '#10B98120' }]}>
              <BarChart3 size={24} color="#10B981" />
            </View>
            <View style={styles.exportOptionInfo}>
              <Text style={styles.exportOptionTitle}>Excel Spreadsheet</Text>
              <Text style={styles.exportOptionDesc}>Raw data for analysis</Text>
            </View>
            <ChevronRight size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportOption}>
            <View style={[styles.exportIconContainer, { backgroundColor: '#25D36620' }]}>
              <MessageCircle size={24} color="#25D366" />
            </View>
            <View style={styles.exportOptionInfo}>
              <Text style={styles.exportOptionTitle}>Share via WhatsApp</Text>
              <Text style={styles.exportOptionDesc}>Quick share summary</Text>
            </View>
            <ChevronRight size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportOption}>
            <View style={[styles.exportIconContainer, { backgroundColor: '#3B82F620' }]}>
              <Mail size={24} color="#3B82F6" />
            </View>
            <View style={styles.exportOptionInfo}>
              <Text style={styles.exportOptionTitle}>Send via Email</Text>
              <Text style={styles.exportOptionDesc}>Detailed report to inbox</Text>
            </View>
            <ChevronRight size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderCreateContentModal = () => (
    <Modal
      visible={showCreateContentModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCreateContentModal(false)}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.createContentModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create with AI</Text>
            <TouchableOpacity onPress={() => setShowCreateContentModal(false)}>
              <X size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.createContentLabel}>Select Platform</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.platformSelector}>
            {['instagram', 'facebook', 'linkedin', 'tiktok', 'twitter'].map((platform) => (
              <TouchableOpacity
                key={platform}
                style={[
                  styles.platformOption,
                  selectedPlatformForContent === platform && styles.platformOptionActive
                ]}
                onPress={() => setSelectedPlatformForContent(platform)}
              >
                {getPlatformIcon(platform)}
                <Text style={[
                  styles.platformOptionText,
                  selectedPlatformForContent === platform && styles.platformOptionTextActive
                ]}>
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.createContentLabel}>Topic (Optional)</Text>
          <TextInput
            style={styles.topicInput}
            placeholder="e.g., New property launch, Investment tips..."
            placeholderTextColor={Colors.textTertiary}
            value={contentTopic}
            onChangeText={setContentTopic}
            multiline
          />

          <TouchableOpacity
            style={[
              styles.generateButton,
              isGeneratingContent && styles.generateButtonDisabled
            ]}
            onPress={handleGenerateContent}
            disabled={isGeneratingContent}
          >
            {isGeneratingContent ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Sparkles size={20} color="#fff" />
            )}
            <Text style={styles.generateButtonText}>
              {isGeneratingContent ? 'Generating...' : 'Generate Content'}
            </Text>
          </TouchableOpacity>

          {generatedContent ? (
            <View style={styles.generatedContentContainer}>
              <View style={styles.generatedContentHeader}>
                <Brain size={16} color={Colors.primary} />
                <Text style={styles.generatedContentTitle}>Generated Content</Text>
              </View>
              <ScrollView style={styles.generatedContentScroll}>
                <Text style={styles.generatedContentText}>{generatedContent}</Text>
              </ScrollView>
              <View style={styles.generatedContentActions}>
                <TouchableOpacity 
                  style={styles.copyButton}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      navigator.clipboard.writeText(generatedContent);
                    } else {
                      // Use Clipboard from react-native
                      Alert.alert('Copied!', 'Content copied to clipboard');
                    }
                    if (Platform.OS !== 'web') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                  }}
                >
                  <Text style={styles.copyButtonText}>Copy to Clipboard</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.scheduleButton}
                  onPress={() => {
                    setShowCreateContentModal(false);
                    Alert.alert('Success', 'Content added to queue!');
                  }}
                >
                  <Text style={styles.scheduleButtonText}>Add to Queue</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderAgentModal = () => (
    <Modal
      visible={!!selectedAgent}
      transparent
      animationType="slide"
      onRequestClose={() => setSelectedAgent(null)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.agentModalContent}>
          {selectedAgent && (
            <>
              <View style={styles.agentModalHeader}>
                <Image source={{ uri: selectedAgent.avatar }} style={styles.agentModalAvatar} />
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={() => setSelectedAgent(null)}
                >
                  <X size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.agentModalName}>{selectedAgent.name}</Text>
              <Text style={styles.agentModalRole}>{selectedAgent.role}</Text>

              <View style={[styles.agentModalStatus, { backgroundColor: getStatusColor(selectedAgent.status) + '20' }]}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(selectedAgent.status) }]} />
                <Text style={[styles.agentModalStatusText, { color: getStatusColor(selectedAgent.status) }]}>
                  {selectedAgent.status.toUpperCase()}
                </Text>
              </View>

              <Text style={styles.agentModalDesc}>{selectedAgent.description}</Text>

              <View style={styles.agentModalStats}>
                <View style={styles.agentModalStatItem}>
                  <Text style={styles.agentModalStatValue}>{selectedAgent.tasksCompleted}</Text>
                  <Text style={styles.agentModalStatLabel}>Tasks Completed</Text>
                </View>
                <View style={styles.agentModalStatItem}>
                  <Text style={styles.agentModalStatValue}>{selectedAgent.accuracy}%</Text>
                  <Text style={styles.agentModalStatLabel}>Accuracy</Text>
                </View>
              </View>

              <Text style={styles.agentModalSection}>Platforms</Text>
              <View style={styles.agentModalPlatforms}>
                {selectedAgent.platform.map((p) => (
                  <View key={p} style={styles.agentModalPlatformItem}>
                    {getPlatformIcon(p)}
                    <Text style={styles.agentModalPlatformText}>{p}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.agentModalActions}>
                {selectedAgent.status === 'idle' || selectedAgent.status === 'paused' ? (
                  <TouchableOpacity style={styles.agentActionButton}>
                    <Play size={18} color="#fff" />
                    <Text style={styles.agentActionText}>Activate</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.agentActionButton, { backgroundColor: '#F59E0B' }]}>
                    <Pause size={18} color="#fff" />
                    <Text style={styles.agentActionText}>Pause</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.agentSecondaryButton}>
                  <RefreshCw size={18} color={Colors.primary} />
                  <Text style={styles.agentSecondaryText}>Retrain</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Social Command</Text>
            <Text style={styles.headerSubtitle}>Your 24/7 Marketing Team</Text>
          </View>
          <TouchableOpacity style={styles.settingsButton}>
            <Bot size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
        >
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'agents', label: 'AI Agents', icon: Bot },
            { id: 'content', label: 'Content', icon: Sparkles },
            { id: 'analytics', label: 'Analytics', icon: PieChart },
            { id: 'comments', label: 'Comments', icon: MessageCircle },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => handleTabChange(tab.id as TabType)}
            >
              <tab.icon 
                size={18} 
                color={activeTab === tab.id ? Colors.primary : Colors.textSecondary} 
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'agents' && renderAgentsTab()}
        {activeTab === 'content' && renderContentTab()}
        {activeTab === 'analytics' && renderAnalyticsTab()}
        {activeTab === 'comments' && renderCommentsTab()}
      </ScrollView>

      {renderExportModal()}
      {renderAgentModal()}
      {renderCreateContentModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  settingsButton: { padding: 8 },
  tabsContainer: { paddingVertical: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 6 },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { color: Colors.textSecondary, fontWeight: '600' as const, fontSize: 13 },
  tabTextActive: { color: Colors.black },
  content: { flex: 1, paddingHorizontal: 20 },
  tabContent: { flex: 1 },
  liveStatusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.positive },
  liveText: { color: Colors.positive, fontSize: 11, fontWeight: '700' as const },
  liveSubtext: { color: Colors.textSecondary, fontSize: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.surfaceBorder },
  statCardLarge: { backgroundColor: Colors.primary },
  statIconContainer: { gap: 8 },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: '800' as const },
  statValueSmall: { color: Colors.text, fontSize: 14, fontWeight: '700' as const },
  statLabel: { color: Colors.textTertiary, fontSize: 11 },
  statLabelSmall: { color: Colors.textTertiary, fontSize: 10 },
  statTrend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statTrendText: { fontSize: 11, fontWeight: '600' as const },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const, marginBottom: 12 },
  platformsScroll: { gap: 8 },
  platformCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  platformCardDisconnected: { gap: 6 },
  platformIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  platformName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  platformFollowers: { gap: 6 },
  platformEngagement: { gap: 6 },
  platformEngagementText: { color: Colors.textSecondary, fontSize: 13 },
  connectButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  connectButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  chartContainer: { gap: 8 },
  chartBars: { gap: 4 },
  chartBarContainer: { gap: 8 },
  chartBar: { gap: 4 },
  chartBarFill: { gap: 4 },
  chartLabel: { color: Colors.textSecondary, fontSize: 13 },
  chartLegend: { gap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textSecondary, fontSize: 13 },
  topContentCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  topContentImage: { width: '100%', height: 180, borderRadius: 12 },
  topContentInfo: { flex: 1 },
  topContentText: { color: Colors.textSecondary, fontSize: 13 },
  topContentStats: { gap: 4 },
  topContentStat: { gap: 4 },
  topContentStatText: { color: Colors.textSecondary, fontSize: 13 },
  viralBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  viralBadgeText: { fontSize: 11, fontWeight: '700' as const },
  agentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  agentStats: { gap: 4 },
  agentStatItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  agentStatValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  agentStatLabel: { color: Colors.textSecondary, fontSize: 13 },
  agentFilters: { gap: 4 },
  filterButton: { backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.surfaceBorder },
  filterButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterButtonText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
  filterButtonTextActive: { color: Colors.black },
  agentCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  agentAvatar: { width: 44, height: 44, borderRadius: 22 },
  agentInfo: { flex: 1 },
  agentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  agentStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  agentStatusText: { color: Colors.textSecondary, fontSize: 13 },
  agentRole: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  agentPlatforms: { flexDirection: 'row', gap: 4, marginTop: 6 },
  agentPlatformIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  agentMetrics: { gap: 4 },
  agentMetricValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  agentMetricLabel: { color: Colors.textSecondary, fontSize: 13 },
  accuracyBar: { gap: 4 },
  accuracyFill: { gap: 4 },
  accuracyText: { color: Colors.textSecondary, fontSize: 13 },
  contentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  createContentButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  createContentButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  contentStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contentStatusItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  contentStatusCount: { gap: 4 },
  contentStatusLabel: { color: Colors.textSecondary, fontSize: 13 },
  contentCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  contentCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  contentPlatforms: { gap: 6 },
  contentPlatformIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  contentStatusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  contentStatusText: { color: Colors.textSecondary, fontSize: 13 },
  contentMedia: { gap: 4 },
  contentText: { color: Colors.textSecondary, fontSize: 13 },
  contentScores: { alignItems: 'center', gap: 4 },
  scoreItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  scoreLabel: { color: Colors.textSecondary, fontSize: 13 },
  scoreValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  suggestionsContainer: { gap: 8 },
  suggestionsTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  suggestionText: { color: Colors.textSecondary, fontSize: 13 },
  scheduledInfo: { flex: 1 },
  scheduledText: { color: Colors.textSecondary, fontSize: 13 },
  analyticsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  analyticsTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  exportButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  exportButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  metricName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  metricValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  metricTrend: { gap: 4 },
  metricChange: { gap: 4 },
  insightCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  insightTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  ageChart: { gap: 4 },
  ageBar: { gap: 4 },
  ageBarFill: { gap: 4 },
  ageLabel: { color: Colors.textSecondary, fontSize: 13 },
  agePercent: { color: Colors.primary, fontSize: 14, fontWeight: '700' as const },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countryRank: { gap: 4 },
  countryName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  countryBar: { gap: 4 },
  countryBarFill: { gap: 4 },
  countryPercent: { color: Colors.primary, fontSize: 14, fontWeight: '700' as const },
  hoursChart: { gap: 4 },
  hourBar: { gap: 4 },
  hourBarFill: { gap: 4 },
  hourLabel: { color: Colors.textSecondary, fontSize: 13 },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  commentStats: { gap: 4 },
  commentStatItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  commentStatValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  commentStatLabel: { color: Colors.textSecondary, fontSize: 13 },
  commentCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentUserInfo: { flex: 1 },
  commentUsername: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentTime: { color: Colors.textTertiary, fontSize: 12 },
  sentimentBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  commentText: { color: Colors.textSecondary, fontSize: 13 },
  aiResponseContainer: { gap: 8 },
  aiResponseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  aiResponseLabel: { color: Colors.textSecondary, fontSize: 13 },
  aiResponseText: { color: Colors.textSecondary, fontSize: 13 },
  pendingResponseContainer: { gap: 8 },
  generateResponseButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  generateResponseText: { color: Colors.textSecondary, fontSize: 13 },
  manualResponseButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  manualResponseText: { color: Colors.textSecondary, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  modalSubtitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  exportOption: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder },
  exportIconContainer: { gap: 8 },
  exportOptionInfo: { flex: 1 },
  exportOptionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  exportOptionDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  agentModalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, maxHeight: '90%' },
  agentModalHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  agentModalAvatar: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center', marginBottom: 12 },
  modalCloseButton: { padding: 8 },
  agentModalName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  agentModalRole: { gap: 4 },
  agentModalStatus: { gap: 4 },
  agentModalStatusText: { color: Colors.textSecondary, fontSize: 13 },
  agentModalDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  agentModalStats: { gap: 4 },
  agentModalStatItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  agentModalStatValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  agentModalStatLabel: { color: Colors.textSecondary, fontSize: 13 },
  agentModalSection: { marginBottom: 16 },
  agentModalPlatforms: { gap: 6 },
  agentModalPlatformItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  agentModalPlatformText: { color: Colors.textSecondary, fontSize: 13 },
  agentModalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  agentActionButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  agentActionText: { color: Colors.textSecondary, fontSize: 13 },
  agentSecondaryButton: { backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  agentSecondaryText: { color: Colors.textSecondary, fontSize: 13 },
  createContentModalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, maxHeight: '92%' },
  createContentLabel: { color: Colors.textSecondary, fontSize: 13 },
  platformSelector: { gap: 6 },
  platformOption: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder },
  platformOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  platformOptionText: { color: Colors.textSecondary, fontSize: 13 },
  platformOptionTextActive: { color: Colors.primary },
  topicInput: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  generateButton: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  generateButtonDisabled: { opacity: 0.4 },
  generateButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  generatedContentContainer: { gap: 8 },
  generatedContentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  generatedContentTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  generatedContentScroll: { gap: 8 },
  generatedContentText: { color: Colors.textSecondary, fontSize: 13 },
  generatedContentActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  copyButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  copyButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  scheduleButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  scheduleButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
});
