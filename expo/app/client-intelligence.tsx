import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Eye,
  Heart,
  UserPlus,
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  Target,
  Activity,
  Zap,
  Shield,
  DollarSign,
  MousePointerClick,
  Monitor,
  RefreshCw,
  Brain,
  Flame,
  UserMinus,
  Sparkles,
  ArrowUpRight,
  CircleDot,
  Layers,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useQuery } from '@tanstack/react-query';
import { fetchRawEvents, computeAnalytics } from '@/lib/analytics-compute';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabKey = 'view' | 'like' | 'bringback';
type PeriodKey = '7d' | '30d' | '90d' | '1y';

const TABS: { key: TabKey; label: string; icon: typeof Eye }[] = [
  { key: 'view', label: 'What They View', icon: Eye },
  { key: 'like', label: 'What They Like', icon: Heart },
  { key: 'bringback', label: 'Bring Back', icon: UserPlus },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: '1y', label: '1Y' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#FF3B30',
  high: '#FF9500',
  medium: '#FFD700',
  low: '#34C759',
};


function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    Animated.timing(animValue, {
      toValue: value,
      duration: 800,
      useNativeDriver: false,
    }).start();

    const listener = animValue.addListener(({ value: v }) => {
      setDisplayValue(Math.round(v));
    });
    return () => animValue.removeListener(listener);
  }, [value, animValue]);

  return (
    <Text style={styles.counterValue}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </Text>
  );
}

function ProgressBar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct, widthAnim]);

  return (
    <View style={[styles.progressTrack, { height }]}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            height,
            backgroundColor: color,
            width: widthAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

function HourlyChart({ data }: { data: Array<{ hour: number; count: number }> }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barWidth = Math.max((SCREEN_WIDTH - 64) / 24 - 2, 4);

  return (
    <View style={styles.hourlyChart}>
      <View style={styles.hourlyBars}>
        {data.map((d, i) => {
          const height = Math.max((d.count / maxCount) * 60, 2);
          const isActive = d.count > maxCount * 0.7;
          return (
            <View key={i} style={styles.hourlyBarWrapper}>
              <View
                style={[
                  styles.hourlyBar,
                  {
                    height,
                    width: barWidth,
                    backgroundColor: isActive ? Colors.primary : Colors.surfaceLight,
                    borderRadius: barWidth / 2,
                  },
                ]}
              />
              {i % 6 === 0 && (
                <Text style={styles.hourlyLabel}>{d.hour}h</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SectionCard({ children, title, icon: Icon, accent }: {
  children: React.ReactNode;
  title: string;
  icon: typeof Eye;
  accent?: string;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconBadge, { backgroundColor: (accent || Colors.primary) + '15' }]}>
          <Icon size={16} color={accent || Colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function ClientIntelligenceScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('view');
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const tabIndicator = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const { data: report, isLoading, refetch, isRefetching, error } = useQuery<any>({
    queryKey: ['clientIntel.getBehaviorReport', { period }],
    queryFn: async () => {
      console.log('[ClientIntel] Computing behavior report from raw events, period:', period);
      const periodMap: Record<string, string> = { '7d': '7d', '30d': '30d', '90d': '90d', '1y': 'all' };
      const rawEvents = await fetchRawEvents(periodMap[period] || '30d');
      console.log('[ClientIntel] Raw events fetched:', rawEvents.length);
      const analytics = computeAnalytics(rawEvents, periodMap[period] || '30d');

      const totalUsers = analytics.uniqueSessions;
      const activeUsers = analytics.liveData.active;
      const totalEvents = analytics.totalEvents;
      const engagementRate = analytics.smartInsights.engagementScore;
      const peakHour = analytics.smartInsights.peakHour;

      const topScreens = analytics.byEvent.slice(0, 10).map((e, _i) => ({
        screen: e.event,
        views: e.count,
        uniqueUsers: Math.max(Math.round(e.count * 0.7), 1),
        avgViewsPerUser: Math.round((e.count / Math.max(totalUsers, 1)) * 10) / 10,
      }));

      const topActions = analytics.byEvent.slice(0, 12).map(e => ({ action: e.event, count: e.count }));

      const topCTAs = [
        { cta: 'get_started', count: analytics.cta.getStarted },
        { cta: 'sign_in', count: analytics.cta.signIn },
        { cta: 'jv_inquire', count: analytics.cta.jvInquire },
        { cta: 'website_click', count: analytics.cta.websiteClick },
      ].filter(c => c.count > 0);

      const categoryBreakdown = analytics.smartInsights.sectionEngagement.slice(0, 8).map(s => ({
        category: s.section,
        count: s.count,
        pct: s.pct,
      }));

      const hourlyEngagement = analytics.hourlyActivity;

      const investmentJourney = {
        browsersOnly: Math.max(totalUsers - analytics.funnel.scroll50, 0),
        kycInProgress: 0,
        kycApproved: 0,
        firstInvestment: analytics.funnel.formSubmits,
        multiInvestor: 0,
        whale: 0,
      };

      const atRiskUsers = Math.round(totalUsers * (analytics.smartInsights.bounceRate / 100));
      const dormantUsers = Math.max(totalUsers - activeUsers - atRiskUsers, 0);

      const reEngagementStrategies = [];
      if (atRiskUsers > 0) {
        reEngagementStrategies.push({
          priority: 'high',
          segment: 'Bounced Visitors',
          strategy: 'Send targeted follow-up to visitors who left early. Consider improving landing page above-the-fold content.',
          expectedImpact: `Could recover ${Math.round(atRiskUsers * 0.15)} visitors`,
          suggestedAction: 'Launch re-engagement email campaign with exclusive content',
          userCount: atRiskUsers,
        });
      }
      if (analytics.funnel.scroll75 > 0 && analytics.funnel.formSubmits === 0) {
        reEngagementStrategies.push({
          priority: 'critical',
          segment: 'Deep Scrollers Without Conversion',
          strategy: 'Visitors scrolled 75%+ but didn\'t convert. Consider adding a CTA or form at the 75% scroll point.',
          expectedImpact: `${analytics.funnel.scroll75} potential leads`,
          suggestedAction: 'Add exit-intent popup or mid-page CTA',
          userCount: analytics.funnel.scroll75,
        });
      }
      if (dormantUsers > 0) {
        reEngagementStrategies.push({
          priority: 'medium',
          segment: 'Dormant Users',
          strategy: 'Users who visited but haven\'t returned. Send personalized re-engagement content.',
          expectedImpact: `Could re-engage ${Math.round(dormantUsers * 0.1)} users`,
          suggestedAction: 'Create a "We miss you" campaign with new property highlights',
          userCount: dormantUsers,
        });
      }

      return {
        summary: { totalUsers, activeUsers, totalEvents, atRiskUsers, dormantUsers, engagementRate, peakHour },
        whatTheyView: { topScreens, topProperties: [], categoryBreakdown },
        whatTheyLike: { topActions, topCTAs, investmentJourney, mostEngagedProperties: [] },
        howToBringBack: {
          reEngagementStrategies,
          dormantBreakdown: { total: dormantUsers, highValue: 0, withBalance: 0, neverInvested: dormantUsers },
          atRiskBreakdown: { total: atRiskUsers, totalAtRiskValue: 0, avgInvested: 0 },
        },
        engagement: { hourlyEngagement },
      };
    },
    refetchInterval: 3000,
    retry: 1,
    retryDelay: 1000,
    staleTime: 0,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (report) {
      console.log('[ClientIntel] Report received:', {
        period,
        totalUsers: report.summary.totalUsers,
        activeUsers: report.summary.activeUsers,
        totalEvents: report.summary.totalEvents,
      });
    }
    if (error) {
      console.error('[ClientIntel] Query error:', error.message);
    }
  }, [report, error, period]);

  const switchTab = useCallback((tab: TabKey) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = TABS.findIndex(t => t.key === tab);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.spring(tabIndicator, { toValue: idx, useNativeDriver: true, tension: 120, friction: 14 }),
    ]).start(() => {
      setActiveTab(tab);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }, [fadeAnim, tabIndicator]);

  const handlePeriodChange = useCallback((p: PeriodKey) => {
    void Haptics.selectionAsync();
    setPeriod(p);
  }, []);

  const handleRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void refetch();
  }, [refetch]);

  const tabWidth = useMemo(() => (SCREEN_WIDTH - 32) / TABS.length, []);

  const translateX = tabIndicator.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth, tabWidth * 2],
  });

  const renderSummaryCards = useCallback(() => {
    if (!report) return null;
    const { summary } = report;
    const cards = [
      { label: 'Active Users', value: summary.activeUsers, icon: Users, color: Colors.positive, total: summary.totalUsers },
      { label: 'At Risk', value: summary.atRiskUsers, icon: AlertTriangle, color: '#FF9500', total: summary.totalUsers },
      { label: 'Dormant', value: summary.dormantUsers, icon: UserMinus, color: Colors.negative, total: summary.totalUsers },
      { label: 'Engagement', value: summary.engagementRate, icon: Activity, color: Colors.primary, suffix: '%' },
    ];

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroll} contentContainerStyle={styles.summaryContent}>
        {cards.map((card, i) => (
          <TouchableOpacity key={i} style={styles.summaryCard} activeOpacity={0.7}>
            <View style={[styles.summaryIconWrap, { backgroundColor: card.color + '18' }]}>
              <card.icon size={18} color={card.color} />
            </View>
            <AnimatedCounter value={card.value} suffix={card.suffix || ''} />
            <Text style={styles.summaryLabel}>{card.label}</Text>
            {card.total && !card.suffix && (
              <ProgressBar value={card.value} max={card.total} color={card.color} height={3} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }, [report]);

  const renderViewTab = useCallback(() => {
    if (!report) return null;
    const { whatTheyView, engagement } = report;

    return (
      <>
        <SectionCard title="Top Screens Viewed" icon={Monitor} accent="#4A90D9">
          {whatTheyView.topScreens.length === 0 ? (
            <Text style={styles.emptyText}>No screen view data yet. Data populates as users browse.</Text>
          ) : (
            whatTheyView.topScreens.slice(0, 8).map((s: any, i: number) => (
              <View key={i} style={styles.listRow}>
                <View style={styles.listRank}>
                  <Text style={[styles.rankNum, i < 3 && { color: Colors.primary }]}>{i + 1}</Text>
                </View>
                <View style={styles.listContent}>
                  <Text style={styles.listTitle} numberOfLines={1}>{formatScreenName(s.screen)}</Text>
                  <Text style={styles.listSub}>{s.uniqueUsers} users · {s.avgViewsPerUser}x avg</Text>
                </View>
                <View style={styles.listMetric}>
                  <Text style={styles.metricValue}>{s.views.toLocaleString()}</Text>
                  <Text style={styles.metricLabel}>views</Text>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="Property Interest" icon={Target} accent="#FF9500">
          {whatTheyView.topProperties.length === 0 ? (
            <Text style={styles.emptyText}>No property engagement data yet.</Text>
          ) : (
            whatTheyView.topProperties.slice(0, 6).map((p: any, i: number) => (
              <View key={i} style={styles.propertyRow}>
                <View style={styles.propertyInfo}>
                  <Text style={styles.propertyName} numberOfLines={1}>{p.name}</Text>
                  <View style={styles.propertyStats}>
                    <View style={styles.statPill}>
                      <Eye size={10} color={Colors.textSecondary} />
                      <Text style={styles.statPillText}>{p.views}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Users size={10} color={Colors.textSecondary} />
                      <Text style={styles.statPillText}>{p.uniqueViewers}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <DollarSign size={10} color={Colors.positive} />
                      <Text style={[styles.statPillText, { color: Colors.positive }]}>{p.purchases}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.conversionBadge}>
                  <Text style={[styles.conversionText, { color: p.conversionRate > 10 ? Colors.positive : Colors.textSecondary }]}>
                    {p.conversionRate}%
                  </Text>
                  <Text style={styles.conversionLabel}>conv.</Text>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="Engagement by Category" icon={Layers} accent="#8E44AD">
          {whatTheyView.categoryBreakdown.map((c: any, idx: number) => (
            <View key={idx} style={styles.categoryRow}>
              <View style={styles.categoryDot} />
              <Text style={styles.categoryName}>{formatCategoryName(c.category)}</Text>
              <View style={styles.categoryBarWrap}>
                <ProgressBar
                  value={c.count}
                  max={whatTheyView.categoryBreakdown[0]?.count || 1}
                  color={getCategoryColor(idx)}
                  height={5}
                />
              </View>
              <Text style={styles.categoryPct}>{c.pct}%</Text>
            </View>
          ))}
        </SectionCard>

        <SectionCard title="Peak Activity Hours" icon={Clock} accent="#00BCD4">
          <HourlyChart data={engagement.hourlyEngagement} />
          <View style={styles.peakHourInfo}>
            <Zap size={14} color={Colors.primary} />
            <Text style={styles.peakHourText}>
              Peak at {report.summary.peakHour}:00 — best time for push notifications
            </Text>
          </View>
        </SectionCard>
      </>
    );
  }, [report]);

  const renderLikeTab = useCallback(() => {
    if (!report) return null;
    const { whatTheyLike } = report;

    return (
      <>
        <SectionCard title="Most Popular Actions" icon={MousePointerClick} accent="#E91E63">
          {whatTheyLike.topActions.length === 0 ? (
            <Text style={styles.emptyText}>No user action data yet.</Text>
          ) : (
            whatTheyLike.topActions.map((a: any, i: number) => (
              <View key={i} style={styles.actionRow}>
                <View style={[styles.actionIcon, { backgroundColor: getActionColor(i) + '20' }]}>
                  <Sparkles size={12} color={getActionColor(i)} />
                </View>
                <Text style={styles.actionName} numberOfLines={1}>{formatActionName(a.action)}</Text>
                <View style={styles.actionCount}>
                  <Text style={styles.actionCountText}>{a.count.toLocaleString()}</Text>
                </View>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="CTA Clicks" icon={Target} accent="#FF5722">
          {whatTheyLike.topCTAs.length === 0 ? (
            <Text style={styles.emptyText}>No CTA click data recorded yet.</Text>
          ) : (
            whatTheyLike.topCTAs.map((c: any, i: number) => (
              <View key={i} style={styles.ctaRow}>
                <CircleDot size={14} color={Colors.primary} />
                <Text style={styles.ctaName} numberOfLines={1}>{formatActionName(c.cta)}</Text>
                <Text style={styles.ctaCount}>{c.count}</Text>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="Investment Journey Funnel" icon={TrendingUp} accent={Colors.positive}>
          {renderJourneyFunnel(whatTheyLike.investmentJourney)}
        </SectionCard>

        <SectionCard title="Most Engaged Properties" icon={Flame} accent="#FF6D00">
          {whatTheyLike.mostEngagedProperties.length === 0 ? (
            <Text style={styles.emptyText}>No property engagement yet.</Text>
          ) : (
            whatTheyLike.mostEngagedProperties.map((p: any, i: number) => (
              <View key={i} style={styles.engagedPropertyRow}>
                <View style={styles.engagedRank}>
                  <Text style={styles.engagedRankText}>{i + 1}</Text>
                </View>
                <View style={styles.engagedInfo}>
                  <Text style={styles.engagedName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.engagedMeta}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(p.purchaseVolume)} volume · {p.purchases} buys
                  </Text>
                </View>
                <ArrowUpRight size={16} color={Colors.positive} />
              </View>
            ))
          )}
        </SectionCard>
      </>
    );
  }, [report]);

  const renderBringBackTab = useCallback(() => {
    if (!report) return null;
    const { howToBringBack } = report;

    return (
      <>
        <View style={styles.alertBanner}>
          <View style={styles.alertIconWrap}>
            <Brain size={20} color="#FFF" />
          </View>
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>AI Re-Engagement Strategies</Text>
            <Text style={styles.alertSubtitle}>
              {howToBringBack.reEngagementStrategies.length} actionable strategies identified
            </Text>
          </View>
        </View>

        {howToBringBack.reEngagementStrategies.map((s: any, i: number) => (
          <View key={i} style={styles.strategyCard}>
            <View style={styles.strategyHeader}>
              <View style={[styles.priorityBadge, { backgroundColor: (PRIORITY_COLORS[s.priority] || Colors.textSecondary) + '20' }]}>
                <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[s.priority] || Colors.textSecondary }]} />
                <Text style={[styles.priorityText, { color: PRIORITY_COLORS[s.priority] || Colors.textSecondary }]}>
                  {s.priority.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.strategyUserCount}>{s.userCount} users</Text>
            </View>
            <Text style={styles.strategySegment}>{s.segment}</Text>
            <Text style={styles.strategyDescription}>{s.strategy}</Text>
            <View style={styles.strategyImpact}>
              <TrendingUp size={12} color={Colors.positive} />
              <Text style={styles.impactText}>{s.expectedImpact}</Text>
            </View>
            <View style={styles.strategyAction}>
              <Zap size={12} color={Colors.primary} />
              <Text style={styles.actionText}>{s.suggestedAction}</Text>
            </View>
          </View>
        ))}

        <SectionCard title="Dormant Users Breakdown" icon={UserMinus} accent={Colors.negative}>
          <View style={styles.breakdownGrid}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownValue}>{howToBringBack.dormantBreakdown.total}</Text>
              <Text style={styles.breakdownLabel}>Total Dormant</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={[styles.breakdownValue, { color: Colors.negative }]}>{howToBringBack.dormantBreakdown.highValue}</Text>
              <Text style={styles.breakdownLabel}>High Value</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={[styles.breakdownValue, { color: Colors.warning }]}>{howToBringBack.dormantBreakdown.withBalance}</Text>
              <Text style={styles.breakdownLabel}>With Balance</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={[styles.breakdownValue, { color: Colors.textSecondary }]}>{howToBringBack.dormantBreakdown.neverInvested}</Text>
              <Text style={styles.breakdownLabel}>Never Invested</Text>
            </View>
          </View>
        </SectionCard>

        <SectionCard title="At-Risk Value" icon={Shield} accent="#FF9500">
          <View style={styles.atRiskSummary}>
            <View style={styles.atRiskMetric}>
              <Text style={styles.atRiskBigValue}>${new Intl.NumberFormat('en-US').format(howToBringBack.atRiskBreakdown.totalAtRiskValue)}</Text>
              <Text style={styles.atRiskBigLabel}>Total Investment at Risk</Text>
            </View>
            <View style={styles.atRiskRow}>
              <Text style={styles.atRiskLabel}>Users at Risk</Text>
              <Text style={styles.atRiskValue}>{howToBringBack.atRiskBreakdown.total}</Text>
            </View>
            <View style={styles.atRiskRow}>
              <Text style={styles.atRiskLabel}>Avg. Investment</Text>
              <Text style={styles.atRiskValue}>${new Intl.NumberFormat('en-US').format(howToBringBack.atRiskBreakdown.avgInvested)}</Text>
            </View>
          </View>
        </SectionCard>
      </>
    );
  }, [report]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Analyzing client behavior...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.backBtn}
            testID="back-button"
          >
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Client Intelligence</Text>
            <Text style={styles.headerSub}>Behavior · Engagement · Retention</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} testID="refresh-button">
            <RefreshCw size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => handlePeriodChange(p.key)}
              testID={`period-${p.key}`}
            >
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabBar}>
          <Animated.View
            style={[
              styles.tabIndicator,
              { width: tabWidth - 8, transform: [{ translateX: Animated.add(translateX, new Animated.Value(4)) }] },
            ]}
          />
          {TABS.map((tab, _i) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, { width: tabWidth }]}
              onPress={() => switchTab(tab.key)}
              testID={`tab-${tab.key}`}
            >
              <tab.icon size={16} color={activeTab === tab.key ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {renderSummaryCards()}
          {activeTab === 'view' && renderViewTab()}
          {activeTab === 'like' && renderLikeTab()}
          {activeTab === 'bringback' && renderBringBackTab()}
        </Animated.View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function renderJourneyFunnel(journey: {
  browsersOnly: number;
  kycInProgress: number;
  kycApproved: number;
  firstInvestment: number;
  multiInvestor: number;
  whale: number;
}) {
  const steps = [
    { label: 'Browsers Only', value: journey.browsersOnly, color: '#9E9E9E' },
    { label: 'KYC In Progress', value: journey.kycInProgress, color: '#FFB800' },
    { label: 'KYC Approved', value: journey.kycApproved, color: '#4A90D9' },
    { label: 'First Investment', value: journey.firstInvestment, color: '#00C48C' },
    { label: 'Multi-Property', value: journey.multiInvestor, color: '#E91E63' },
    { label: 'Whale ($50k+)', value: journey.whale, color: '#FFD700' },
  ];
  const maxVal = Math.max(...steps.map(s => s.value), 1);

  return (
    <View style={styles.funnelContainer}>
      {steps.map((step, i) => {
        const widthPct = Math.max((step.value / maxVal) * 100, 12);
        return (
          <View key={i} style={styles.funnelStep}>
            <View style={styles.funnelLabelWrap}>
              <Text style={styles.funnelLabel}>{step.label}</Text>
              <Text style={[styles.funnelValue, { color: step.color }]}>{step.value}</Text>
            </View>
            <View style={styles.funnelBarTrack}>
              <View style={[styles.funnelBar, { width: `${widthPct}%`, backgroundColor: step.color }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function formatScreenName(screen: string): string {
  return screen
    .replace(/^screen_view$/, 'Screen View')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatActionName(action: string): string {
  return action
    .replace(/^cta_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatCategoryName(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getCategoryColor(index: number): string {
  const colors = ['#4A90D9', '#FF9500', '#00C48C', '#E91E63', '#8E44AD', '#00BCD4', '#FF5722'];
  return colors[index % colors.length];
}

function getActionColor(index: number): string {
  const colors = ['#FF6D00', '#E91E63', '#4A90D9', '#00C48C', '#8E44AD', '#FFD700', '#FF5722', '#00BCD4', '#9C27B0', '#2196F3', '#FF9800', '#4CAF50'];
  return colors[index % colors.length];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeTop: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 1,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.surface,
  },
  periodBtnActive: {
    backgroundColor: Colors.primary + '20',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
  },
  periodTextActive: {
    color: Colors.primary,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    position: 'relative' as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  tabIndicator: {
    position: 'absolute' as const,
    top: 4,
    bottom: 4,
    borderRadius: 10,
    backgroundColor: Colors.primary + '18',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 5,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryScroll: {
    marginHorizontal: -16,
    marginBottom: 16,
  },
  summaryContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  summaryCard: {
    width: 130,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  counterValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '500' as const,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  sectionIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: 13,
    textAlign: 'center' as const,
    paddingVertical: 20,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listRank: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankNum: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  listContent: {
    flex: 1,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  listSub: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  listMetric: {
    alignItems: 'flex-end' as const,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  propertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 5,
  },
  propertyStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statPillText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  conversionBadge: {
    alignItems: 'center' as const,
    marginLeft: 10,
  },
  conversionText: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  conversionLabel: {
    fontSize: 9,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  categoryName: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500' as const,
    width: 90,
  },
  categoryBarWrap: {
    flex: 1,
  },
  categoryPct: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    width: 40,
    textAlign: 'right' as const,
  },
  hourlyChart: {
    paddingVertical: 8,
  },
  hourlyBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 80,
  },
  hourlyBarWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  hourlyBar: {
    minHeight: 2,
  },
  hourlyLabel: {
    fontSize: 8,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  peakHourInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  peakHourText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionName: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  actionCount: {
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  actionCountText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ctaName: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  ctaCount: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  funnelContainer: {
    gap: 10,
  },
  funnelStep: {
    gap: 4,
  },
  funnelLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  funnelLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  funnelValue: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  funnelBarTrack: {
    height: 8,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  funnelBar: {
    height: 8,
    borderRadius: 4,
  },
  engagedPropertyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  engagedRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  engagedRankText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  engagedInfo: {
    flex: 1,
  },
  engagedName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  engagedMeta: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A0A2E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2D1B4E',
    gap: 12,
  },
  alertIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#8E44AD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#E0B0FF',
  },
  alertSubtitle: {
    fontSize: 12,
    color: '#9B72B0',
    marginTop: 2,
  },
  strategyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  strategyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  strategyUserCount: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  strategySegment: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  strategyDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  strategyImpact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.positive + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  impactText: {
    fontSize: 12,
    color: Colors.positive,
    fontWeight: '600' as const,
    flex: 1,
  },
  strategyAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: Colors.primary + '08',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 11,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  breakdownItem: {
    width: '47%' as any,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center' as const,
  },
  breakdownValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  breakdownLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '500' as const,
  },
  atRiskSummary: {
    gap: 12,
  },
  atRiskMetric: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  atRiskBigValue: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#FF9500',
    letterSpacing: -0.5,
  },
  atRiskBigLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  atRiskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  atRiskLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  atRiskValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  progressTrack: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  progressFill: {
    borderRadius: 3,
  },
});
