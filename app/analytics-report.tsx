import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Eye,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Globe,
  Monitor,
  Smartphone,
  Target,
  BarChart3,
  Activity,
  Zap,
  LogIn,
  RefreshCw,
  MapPin,
  Brain,
  Timer,
  Percent,
  Flame,
  Crosshair,
  Tablet,
  Radio,
  PieChart,
  Layers,
  Sparkles,
  Wifi,
  WifiOff,
  AlertTriangle,
  UserPlus,
  UserCheck,
  Share2,
  Gauge,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRawEvents, computeAnalytics } from '@/lib/analytics-compute';
import type { TrendDelta, AcquisitionChannel, SessionQuality } from '@/lib/analytics-compute';


type PeriodType = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';
type TabType = 'overview' | 'acquisition' | 'funnel' | 'geo' | 'insights' | 'live';

interface AnalyticsData {
  period: string;
  totalLeads: number;
  registeredUsers: number;
  waitlistLeads: number;
  totalEvents: number;
  pageViews: number;
  uniqueSessions: number;
  funnel: {
    pageViews: number;
    scroll25: number;
    scroll50: number;
    scroll75: number;
    scroll100: number;
    formFocuses: number;
    formSubmits: number;
  };
  cta: {
    getStarted: number;
    signIn: number;
    jvInquire: number;
    websiteClick: number;
  };
  conversionRate: number;
  scrollEngagement: number;
  byEvent: Array<{ event: string; count: number }>;
  byPlatform: Array<{ platform: string; count: number }>;
  byReferrer: Array<{ referrer: string; count: number }>;
  dailyViews: Array<{ date: string; views: number; sessions: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
  geoZones: {
    byCountry: Array<{ country: string; count: number; pct: number }>;
    byCity: Array<{ city: string; count: number; country: string; lat?: number; lng?: number; pct: number }>;
    byRegion: Array<{ region: string; count: number; pct: number }>;
    byTimezone: Array<{ timezone: string; count: number }>;
    totalWithGeo: number;
  };
  smartInsights: {
    avgTimeOnPage: number;
    bounceRate: number;
    engagementScore: number;
    topInterests: Array<{ interest: string; count: number; pct: number }>;
    sectionEngagement: Array<{ section: string; count: number; pct: number }>;
    deviceBreakdown: Array<{ device: string; count: number; pct: number }>;
    peakHour: number;
    contentInteraction: {
      scrolledPast50Pct: number;
      scrolledPast75Pct: number;
      interactedWithForm: number;
      submittedForm: number;
      clickedAnyCta: number;
    };
    visitorIntent: {
      highIntent: number;
      mediumIntent: number;
      lowIntent: number;
      highIntentPct: number;
      mediumIntentPct: number;
      lowIntentPct: number;
    };
  };
  liveData: {
    active: number;
    recent: number;
    sessions: Array<{
      sessionId: string;
      ip: string;
      device: string;
      os: string;
      browser: string;
      geo?: { city?: string; country?: string; region?: string };
      currentStep: number;
      sessionDuration: number;
      activeTime: number;
      lastSeen: string;
      startedAt: string;
      isActive: boolean;
    }>;
    breakdown: {
      byCountry: Array<{ country: string; count: number }>;
      byDevice: Array<{ device: string; count: number }>;
      byStep: Array<{ step: string; count: number }>;
    };
    timestamp: string;
  };
  trends: {
    pageViews: TrendDelta;
    sessions: TrendDelta;
    leads: TrendDelta;
    conversionRate: TrendDelta;
    bounceRate: TrendDelta;
    avgDuration: TrendDelta;
  };
  acquisition: AcquisitionChannel[];
  sessionQuality: SessionQuality;
}

const { width: SCREEN_W } = Dimensions.get('window');

const PERIODS: { label: string; value: PeriodType }[] = [
  { label: '1H', value: '1h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'All', value: 'all' },
];

const TABS: { label: string; value: TabType; icon: React.ReactNode }[] = [
  { label: 'Overview', value: 'overview', icon: <BarChart3 size={14} color={Colors.textTertiary} /> },
  { label: 'Acquire', value: 'acquisition', icon: <Share2 size={14} color={Colors.textTertiary} /> },
  { label: 'Funnel', value: 'funnel', icon: <Layers size={14} color={Colors.textTertiary} /> },
  { label: 'Geo', value: 'geo', icon: <MapPin size={14} color={Colors.textTertiary} /> },
  { label: 'Intel', value: 'insights', icon: <Brain size={14} color={Colors.textTertiary} /> },
  { label: 'Live', value: 'live', icon: <Radio size={14} color="#E53935" /> },
];

const COUNTRY_FLAGS: Record<string, string> = {
  'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦', 'Germany': '🇩🇪',
  'France': '🇫🇷', 'Australia': '🇦🇺', 'India': '🇮🇳', 'Brazil': '🇧🇷',
  'Japan': '🇯🇵', 'Mexico': '🇲🇽', 'Spain': '🇪🇸', 'Italy': '🇮🇹',
  'Netherlands': '🇳🇱', 'Switzerland': '🇨🇭', 'Sweden': '🇸🇪', 'Singapore': '🇸🇬',
  'UAE': '🇦🇪', 'United Arab Emirates': '🇦🇪', 'Saudi Arabia': '🇸🇦', 'China': '🇨🇳',
  'South Korea': '🇰🇷', 'Nigeria': '🇳🇬', 'South Africa': '🇿🇦', 'Colombia': '🇨🇴',
  'Argentina': '🇦🇷', 'Portugal': '🇵🇹', 'Ireland': '🇮🇪', 'Poland': '🇵🇱',
  'Turkey': '🇹🇷', 'Philippines': '🇵🇭', 'Indonesia': '🇮🇩', 'Thailand': '🇹🇭',
};

const ACCENT = Colors.primary;
const BLUE = '#4A90D9';
const GREEN = '#00C48C';
const TEAL = '#0097A7';
const RED = '#E53935';
const ORANGE = '#F57C00';
const PURPLE = '#7B61FF';
const YELLOW = '#F9A825';
const NAVY = '#1B365D';
const PINK = '#E91E63';
const LIME = '#7CB342';

const CHART_COLORS = [BLUE, GREEN, ORANGE, PURPLE, TEAL, RED, YELLOW, PINK, LIME, NAVY];

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ivxholding.com';
}

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function AnimatedRing({ percent, size, strokeWidth, color, children }: {
  percent: number; size: number; strokeWidth: number; color: string; children?: React.ReactNode;
}) {
  const segments = 36;
  const radius = (size - strokeWidth) / 2;
  const segmentAngle = 360 / segments;
  const filled = Math.round((percent / 100) * segments);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: segments }).map((_, i) => {
        const angle = (i * segmentAngle - 90) * (Math.PI / 180);
        const x = Math.cos(angle) * radius + size / 2 - 2;
        const y = Math.sin(angle) * radius + size / 2 - 2;
        const isFilled = i < filled;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: isFilled ? color : Colors.surfaceBorder,
            }}
          />
        );
      })}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

function MiniSparkBar({ data, color, height = 48 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data, 1);
  const barWidth = Math.max(Math.floor((SCREEN_W - 80) / data.length) - 2, 3);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
      {data.map((val, i) => {
        const h = Math.max((val / max) * height, 2);
        const isLast = i === data.length - 1;
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: h,
              borderRadius: 2,
              backgroundColor: isLast ? color : color + '60',
            }}
          />
        );
      })}
    </View>
  );
}

function AnimatedCounter({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: value, duration: 800, useNativeDriver: false }).start();
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(listener);
  }, [value, anim]);

  return <Text style={s.counterText}>{prefix}{display.toLocaleString()}{suffix}</Text>;
}

function PulseIndicator({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [active, pulse]);

  return (
    <View style={s.pulseWrap}>
      {active && (
        <Animated.View style={[s.pulseRing, { transform: [{ scale: pulse }], borderColor: GREEN + '40' }]} />
      )}
      <View style={[s.pulseDot, { backgroundColor: active ? GREEN : Colors.textTertiary }]} />
    </View>
  );
}

export default function AnalyticsReportScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodType>('all');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const [fetchCount, setFetchCount] = useState<number>(0);

  const headerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, tension: 40, friction: 10, useNativeDriver: true }).start();
  }, [headerAnim]);

  const pollInterval = activeTab === 'live' ? 5000 : 10000;

  const analyticsQuery = useQuery<AnalyticsData | null>({
    queryKey: ['analytics.getLandingAnalytics', { period }],
    queryFn: async () => {
      console.log('[Analytics] Computing from raw landing_analytics events, period:', period);
      const rawEvents = await fetchRawEvents(period);
      console.log('[Analytics] Raw events fetched:', rawEvents.length);
      if (rawEvents.length === 0) {
        return computeAnalytics([], period) as unknown as AnalyticsData;
      }
      const computed = computeAnalytics(rawEvents, period);
      console.log('[Analytics] Computed:', computed.pageViews, 'views,', computed.uniqueSessions, 'sessions,', computed.totalLeads, 'leads');
      return computed as unknown as AnalyticsData;
    },
    staleTime: 0,
    gcTime: 0,
    refetchInterval: pollInterval,
    networkMode: 'always',
    retry: 1,
    retryDelay: 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const data = analyticsQuery.data as AnalyticsData | undefined ?? null;
  const isLoading = analyticsQuery.isLoading && !analyticsQuery.data;
  const _isFetching = analyticsQuery.isFetching;
  const isError = analyticsQuery.isError && !data;
  const errorMsg = analyticsQuery.error?.message || 'Failed to load analytics';
  const isConnected = !!data || analyticsQuery.isSuccess;
  const lastUpdated = analyticsQuery.dataUpdatedAt ? new Date(analyticsQuery.dataUpdatedAt).toLocaleTimeString() : '';

  useEffect(() => {
    if (analyticsQuery.isSuccess && analyticsQuery.data) {
      setFetchCount(prev => prev + 1);
      console.log(`[Analytics] Supabase data loaded: ${analyticsQuery.data.totalLeads} leads, ${analyticsQuery.data.pageViews} views, ${analyticsQuery.data.uniqueSessions} sessions`);
    }
    if (analyticsQuery.isError) {
      console.error('[Analytics] Supabase error:', analyticsQuery.error?.message);
    }
  }, [analyticsQuery.isSuccess, analyticsQuery.data, analyticsQuery.isError, analyticsQuery.error]);

  const queryClient = useQueryClient();
  const onRefresh = useCallback(async () => {
    setManualRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['analytics.getLandingAnalytics'] });
    setManualRefreshing(false);
  }, [queryClient]);

  const liveData = useMemo(() => data?.liveData ?? null, [data]);

  const funnelSteps = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Page Views', count: data.funnel.pageViews, color: BLUE, pct: 100 },
      { label: 'Scroll 25%', count: data.funnel.scroll25, color: PURPLE, pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll25 / data.funnel.pageViews) * 100) : 0 },
      { label: 'Scroll 50%', count: data.funnel.scroll50, color: '#9B59B6', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll50 / data.funnel.pageViews) * 100) : 0 },
      { label: 'Scroll 75%', count: data.funnel.scroll75, color: ORANGE, pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll75 / data.funnel.pageViews) * 100) : 0 },
      { label: 'Form Focus', count: data.funnel.formFocuses, color: GREEN, pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.formFocuses / data.funnel.pageViews) * 100) : 0 },
      { label: 'Submitted', count: data.funnel.formSubmits, color: '#27AE60', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.formSubmits / data.funnel.pageViews) * 100) : 0 },
    ];
  }, [data]);

  const hourlyData = useMemo(() => {
    if (!data) return [];
    return data.hourlyActivity.map(h => h.count);
  }, [data]);

  const dailyData = useMemo(() => {
    if (!data) return [];
    return data.dailyViews.slice(-14).map(d => d.views);
  }, [data]);

  const hasNoRealData = data && data.pageViews === 0 && data.uniqueSessions === 0 && data.totalLeads === 0;

  const renderDiagnosticPanel = () => {
    if (!hasNoRealData) return null;
    return (
      <View style={s.diagnosticCard}>
        <View style={s.diagnosticHeader}>
          <AlertTriangle size={18} color="#FFB800" />
          <Text style={s.diagnosticTitle}>No Data Yet</Text>
        </View>
        <Text style={s.diagnosticDesc}>
          Analytics computes from real landing page events stored in Supabase. No demo/mock data is shown.
        </Text>
        <View style={s.diagnosticGrid}>
          <View style={s.diagnosticRow}>
            <Text style={s.diagnosticLabel}>Database</Text>
            <View style={[s.diagnosticBadge, { backgroundColor: '#00C48C20' }]}>
              <Text style={[s.diagnosticBadgeText, { color: '#00C48C' }]}>Supabase Connected</Text>
            </View>
          </View>
          <View style={s.diagnosticRow}>
            <Text style={s.diagnosticLabel}>Events Found</Text>
            <Text style={s.diagnosticValue}>0</Text>
          </View>
          <View style={s.diagnosticRow}>
            <Text style={s.diagnosticLabel}>Period</Text>
            <Text style={s.diagnosticValue}>{period}</Text>
          </View>
        </View>
        <View style={s.diagnosticInfo}>
          <Text style={s.diagnosticInfoText}>
            Visit the landing page to generate tracking events. Data will appear here in real-time as visitors interact with your page.
          </Text>
        </View>
      </View>
    );
  };

  const renderOverviewTab = () => {
    if (!data) return null;
    const convPct = parseFloat(String(data.conversionRate)) || 0;
    const totalViews = data.pageViews;
    const totalUnique = data.uniqueSessions;
    const totalRegistrations = data.funnel.formSubmits;
    const totalLeads = data.totalLeads ?? totalRegistrations;
    const registeredUsers = data.registeredUsers ?? 0;
    const waitlistLeads = data.waitlistLeads ?? 0;

    return (
      <>
        <View style={s.leadsHero}>
          <View style={s.leadsHeroIconWrap}>
            <Users size={28} color="#fff" />
          </View>
          <View style={s.leadsHeroContent}>
            <Text style={s.leadsHeroLabel}>TOTAL LEADS</Text>
            <AnimatedCounter value={totalLeads} />
          </View>
          <View style={s.leadsBreakdown}>
            <View style={s.leadsBreakdownItem}>
              <View style={[s.leadsBreakdownDot, { backgroundColor: GREEN }]} />
              <Text style={s.leadsBreakdownText}>{registeredUsers} Registered</Text>
            </View>
            <View style={s.leadsBreakdownItem}>
              <View style={[s.leadsBreakdownDot, { backgroundColor: ORANGE }]} />
              <Text style={s.leadsBreakdownText}>{waitlistLeads} Waitlist</Text>
            </View>
          </View>
          <View style={s.leadsLiveBadge}>
            <View style={s.leadsLiveDot} />
            <Text style={s.leadsLiveText}>Real-time</Text>
          </View>
        </View>

        <View style={s.heroMetrics}>
          <View style={s.heroMetricMain}>
            <View style={s.heroMetricHeader}>
              <Eye size={18} color={BLUE} />
              <Text style={s.heroMetricLabel}>Total Views</Text>
              {renderTrendBadge(data.trends?.pageViews)}
            </View>
            <AnimatedCounter value={totalViews} />
          </View>
          <View style={s.heroMetricDivider} />
          <View style={s.heroMetricMain}>
            <View style={s.heroMetricHeader}>
              <Users size={18} color={PURPLE} />
              <Text style={s.heroMetricLabel}>Visitors</Text>
              {renderTrendBadge(data.trends?.sessions)}
            </View>
            <AnimatedCounter value={totalUnique} />
          </View>
        </View>

        <View style={s.ringRow}>
          <View style={s.ringCard}>
            <AnimatedRing percent={convPct} size={90} strokeWidth={8} color={GREEN}>
              <Text style={s.ringValue}>{convPct}%</Text>
              <Text style={s.ringLabel}>CVR</Text>
            </AnimatedRing>
            <Text style={s.ringCardLabel}>Conversion Rate</Text>
          </View>
          <View style={s.ringCard}>
            <AnimatedRing
              percent={data.funnel.pageViews > 0 ? Math.min(Math.round((data.funnel.scroll75 / data.funnel.pageViews) * 100), 100) : 0}
              size={90}
              strokeWidth={8}
              color={PURPLE}
            >
              <Text style={s.ringValue}>
                {data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll75 / data.funnel.pageViews) * 100) : 0}%
              </Text>
              <Text style={s.ringLabel}>Depth</Text>
            </AnimatedRing>
            <Text style={s.ringCardLabel}>Scroll Depth</Text>
          </View>
          <View style={s.ringCard}>
            <AnimatedRing
              percent={Math.min(totalRegistrations * 5, 100)}
              size={90}
              strokeWidth={8}
              color={ACCENT}
            >
              <Text style={s.ringValue}>{totalRegistrations}</Text>
              <Text style={s.ringLabel}>Signups</Text>
            </AnimatedRing>
            <Text style={s.ringCardLabel}>Registrations</Text>
          </View>
        </View>

        {dailyData.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <TrendingUp size={16} color={GREEN} />
              <Text style={s.cardTitle}>Daily Traffic</Text>
              <View style={s.cardBadge}>
                <Text style={s.cardBadgeText}>{data.dailyViews.length}d</Text>
              </View>
            </View>
            <MiniSparkBar data={dailyData} color={BLUE} height={56} />
            <View style={s.sparkLabelRow}>
              <Text style={s.sparkLabel}>{data.dailyViews.slice(-14)[0]?.date?.slice(5) || ''}</Text>
              <Text style={s.sparkLabel}>Today</Text>
            </View>
          </View>
        )}

        {hourlyData.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Clock size={16} color={PURPLE} />
              <Text style={s.cardTitle}>Hourly Heatmap</Text>
            </View>
            <View style={s.heatmapGrid}>
              {hourlyData.map((count: number, i: number) => {
                const max = Math.max(...hourlyData, 1);
                const intensity = count / max;
                const bgColor = count === 0 ? Colors.backgroundSecondary : `rgba(74, 144, 217, ${0.15 + intensity * 0.85})`;
                return (
                  <View key={i} style={[s.heatmapCell, { backgroundColor: bgColor }]}>
                    <Text style={[s.heatmapHour, count > 0 && { color: '#fff' }]}>{i}</Text>
                    {count > 0 && <Text style={s.heatmapCount}>{count}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Zap size={16} color={ORANGE} />
            <Text style={s.cardTitle}>CTA Performance</Text>
          </View>
          <View style={s.ctaGrid}>
            {[
              { label: 'Get Started', count: data.cta.getStarted, icon: <ArrowUpRight size={16} color={GREEN} />, color: GREEN },
              { label: 'Sign In', count: data.cta.signIn, icon: <LogIn size={16} color={BLUE} />, color: BLUE },
              { label: 'JV Inquire', count: data.cta.jvInquire, icon: <TrendingUp size={16} color={ORANGE} />, color: ORANGE },
              { label: 'Website', count: data.cta.websiteClick, icon: <Globe size={16} color={PURPLE} />, color: PURPLE },
            ].map((cta, i) => (
              <View key={i} style={s.ctaCard}>
                <View style={[s.ctaIconBg, { backgroundColor: cta.color + '18' }]}>
                  {cta.icon}
                </View>
                <Text style={s.ctaValue}>{cta.count}</Text>
                <Text style={s.ctaLabel}>{cta.label}</Text>
                <View style={[s.ctaBar, { backgroundColor: cta.color + '15' }]}>
                  <View style={[s.ctaBarFill, {
                    width: `${Math.max(Math.min((cta.count / Math.max(data.cta.getStarted, 1)) * 100, 100), 5)}%` as any,
                    backgroundColor: cta.color,
                  }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={s.splitRow}>
          <View style={s.splitCard}>
            <View style={s.cardHeader}>
              <Monitor size={14} color={BLUE} />
              <Text style={[s.cardTitle, { fontSize: 13 }]}>Platform</Text>
            </View>
            {data.byPlatform.length === 0 ? (
              <Text style={s.noDataText}>No data</Text>
            ) : (
              data.byPlatform.map((p, i) => (
                <View key={i} style={s.miniListRow}>
                  <View style={[s.miniDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                  <Text style={s.miniLabel} numberOfLines={1}>{p.platform}</Text>
                  <Text style={s.miniValue}>{p.count}</Text>
                </View>
              ))
            )}
          </View>
          <View style={s.splitCard}>
            <View style={s.cardHeader}>
              <Globe size={14} color={TEAL} />
              <Text style={[s.cardTitle, { fontSize: 13 }]}>Referrer</Text>
            </View>
            {data.byReferrer.length === 0 ? (
              <Text style={s.noDataText}>No data</Text>
            ) : (
              data.byReferrer.slice(0, 5).map((r, i) => (
                <View key={i} style={s.miniListRow}>
                  <View style={[s.miniDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                  <Text style={s.miniLabel} numberOfLines={1}>{r.referrer}</Text>
                  <Text style={s.miniValue}>{r.count}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Activity size={16} color={BLUE} />
            <Text style={s.cardTitle}>Event Stream</Text>
            <Text style={s.cardSubtitle}>{data.byEvent.length} events</Text>
          </View>
          {data.byEvent.slice(0, 10).map((evt, i) => {
            const maxEvt = data.byEvent[0]?.count || 1;
            const barPct = Math.round((evt.count / maxEvt) * 100);
            return (
              <View key={i} style={s.eventRow}>
                <View style={[s.eventRank, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '18' }]}>
                  <Text style={[s.eventRankText, { color: CHART_COLORS[i % CHART_COLORS.length] }]}>{i + 1}</Text>
                </View>
                <View style={s.eventInfo}>
                  <Text style={s.eventName} numberOfLines={1}>{evt.event.replace(/_/g, ' ')}</Text>
                  <View style={s.eventBarBg}>
                    <View style={[s.eventBar, { width: `${Math.max(barPct, 4)}%` as any, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                  </View>
                </View>
                <Text style={s.eventCount}>{evt.count}</Text>
              </View>
            );
          })}
          {data.byEvent.length === 0 && (
            <Text style={s.noDataText}>No events tracked yet.</Text>
          )}
        </View>
      </>
    );
  };

  const renderTrendBadge = (trend: TrendDelta | undefined, invertColor?: boolean) => {
    if (!trend || trend.direction === 'flat') return null;
    const isUp = trend.direction === 'up';
    const color = invertColor ? (isUp ? RED : GREEN) : (isUp ? GREEN : RED);
    return (
      <View style={[s.trendBadge, { backgroundColor: color + '14' }]}>
        {isUp ? <ArrowUpRight size={10} color={color} /> : <ArrowDownRight size={10} color={color} />}
        <Text style={[s.trendBadgeText, { color }]}>{trend.pct}%</Text>
      </View>
    );
  };

  const renderAcquisitionTab = () => {
    if (!data) return null;
    const acq = data.acquisition ?? [];
    const sq = data.sessionQuality;

    return (
      <>
        {sq && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Gauge size={16} color={TEAL} />
              <Text style={s.cardTitle}>Session Quality</Text>
            </View>
            <View style={s.sqGrid}>
              <View style={s.sqItem}>
                <Text style={s.sqValue}>{sq.avgPagesPerSession}</Text>
                <Text style={s.sqLabel}>Events / Session</Text>
              </View>
              <View style={s.sqItem}>
                <Text style={s.sqValue}>{formatSeconds(sq.avgSessionDuration)}</Text>
                <Text style={s.sqLabel}>Avg Duration</Text>
              </View>
              <View style={s.sqItem}>
                <Text style={[s.sqValue, { color: GREEN }]}>{sq.engagedSessionsPct}%</Text>
                <Text style={s.sqLabel}>Engaged</Text>
              </View>
            </View>
          </View>
        )}

        {sq && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Users size={16} color={PURPLE} />
              <Text style={s.cardTitle}>New vs Returning</Text>
            </View>
            <View style={s.nvrRow}>
              <View style={s.nvrBlock}>
                <View style={[s.nvrIconWrap, { backgroundColor: BLUE + '18' }]}>
                  <UserPlus size={18} color={BLUE} />
                </View>
                <Text style={s.nvrValue}>{sq.newVsReturning.new}</Text>
                <Text style={s.nvrLabel}>New</Text>
                <Text style={[s.nvrPct, { color: BLUE }]}>{sq.newVsReturning.newPct}%</Text>
              </View>
              <View style={s.nvrDivider} />
              <View style={s.nvrBlock}>
                <View style={[s.nvrIconWrap, { backgroundColor: GREEN + '18' }]}>
                  <UserCheck size={18} color={GREEN} />
                </View>
                <Text style={s.nvrValue}>{sq.newVsReturning.returning}</Text>
                <Text style={s.nvrLabel}>Returning</Text>
                <Text style={[s.nvrPct, { color: GREEN }]}>{sq.newVsReturning.returningPct}%</Text>
              </View>
            </View>
            <View style={s.nvrBarWrap}>
              <View style={[s.nvrBarNew, { flex: Math.max(sq.newVsReturning.newPct, 1) }]} />
              <View style={[s.nvrBarReturn, { flex: Math.max(sq.newVsReturning.returningPct, 1) }]} />
            </View>
          </View>
        )}

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Share2 size={16} color={BLUE} />
            <Text style={s.cardTitle}>Acquisition Channels</Text>
            <Text style={s.cardSubtitle}>{acq.length} channels</Text>
          </View>
          {acq.length === 0 ? (
            <Text style={s.noDataText}>No acquisition data yet.</Text>
          ) : (
            acq.map((ch, i) => {
              const maxSess = acq[0]?.sessions || 1;
              const barW = Math.max(Math.round((ch.sessions / maxSess) * 100), 5);
              return (
                <View key={i} style={s.acqRow}>
                  <View style={[s.acqDot, { backgroundColor: ch.color }]} />
                  <View style={s.acqInfo}>
                    <View style={s.acqTopRow}>
                      <Text style={s.acqName}>{ch.channel}</Text>
                      <Text style={s.acqPct}>{ch.pct}%</Text>
                    </View>
                    <View style={s.acqBarBg}>
                      <View style={[s.acqBarFill, { width: `${barW}%` as any, backgroundColor: ch.color }]} />
                    </View>
                    <View style={s.acqMetaRow}>
                      <Text style={s.acqMeta}>{ch.sessions} sessions</Text>
                      <Text style={s.acqMeta}>{ch.leads} leads</Text>
                      <Text style={[s.acqMeta, ch.conversionRate > 0 && { color: GREEN }]}>{ch.conversionRate}% CVR</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={s.splitRow}>
          <View style={s.splitCard}>
            <View style={s.cardHeader}>
              <Monitor size={14} color={BLUE} />
              <Text style={[s.cardTitle, { fontSize: 13 }]}>Platform</Text>
            </View>
            {data.byPlatform.length === 0 ? (
              <Text style={s.noDataText}>No data</Text>
            ) : (
              data.byPlatform.map((p, i) => (
                <View key={i} style={s.miniListRow}>
                  <View style={[s.miniDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                  <Text style={s.miniLabel} numberOfLines={1}>{p.platform}</Text>
                  <Text style={s.miniValue}>{p.count}</Text>
                </View>
              ))
            )}
          </View>
          <View style={s.splitCard}>
            <View style={s.cardHeader}>
              <Globe size={14} color={TEAL} />
              <Text style={[s.cardTitle, { fontSize: 13 }]}>Referrer</Text>
            </View>
            {data.byReferrer.length === 0 ? (
              <Text style={s.noDataText}>No data</Text>
            ) : (
              data.byReferrer.slice(0, 5).map((r, i) => (
                <View key={i} style={s.miniListRow}>
                  <View style={[s.miniDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                  <Text style={s.miniLabel} numberOfLines={1}>{r.referrer}</Text>
                  <Text style={s.miniValue}>{r.count}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </>
    );
  };

  const renderFunnelTab = () => {
    if (!data) return null;

    return (
      <>
        <View style={s.funnelHero}>
          <Text style={s.funnelHeroTitle}>Conversion Funnel</Text>
          <Text style={s.funnelHeroSub}>
            {data.funnel.pageViews} visitors → {data.funnel.formSubmits} signups
          </Text>
        </View>

        <View style={s.funnelVisual}>
          {funnelSteps.map((step, i) => {
            const widthPct = Math.max(step.pct, 12);
            const isLast = i === funnelSteps.length - 1;
            const dropoff = i > 0 ? funnelSteps[i - 1].pct - step.pct : 0;
            return (
              <View key={i} style={s.funnelStepWrap}>
                <View style={s.funnelStepRow}>
                  <View style={[s.funnelBar, { width: `${widthPct}%` as any, backgroundColor: step.color }]}>
                    <Text style={s.funnelBarText}>{step.count.toLocaleString()}</Text>
                  </View>
                  <Text style={s.funnelPct}>{step.pct}%</Text>
                </View>
                <View style={s.funnelLabelRow}>
                  <Text style={s.funnelLabel}>{step.label}</Text>
                  {i > 0 && dropoff > 0 && (
                    <View style={s.funnelDropoff}>
                      <ArrowDownRight size={9} color={RED} />
                      <Text style={s.funnelDropoffText}>-{dropoff}%</Text>
                    </View>
                  )}
                </View>
                {!isLast && <View style={s.funnelConnector} />}
              </View>
            );
          })}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <PieChart size={16} color={PINK} />
            <Text style={s.cardTitle}>Drop-off Analysis</Text>
          </View>
          {funnelSteps.slice(1).map((step, i) => {
            const prev = funnelSteps[i];
            const dropCount = prev.count - step.count;
            const dropPct = prev.count > 0 ? Math.round((dropCount / prev.count) * 100) : 0;
            return (
              <View key={i} style={s.dropoffRow}>
                <View style={[s.dropoffIcon, { backgroundColor: step.color + '18' }]}>
                  <ArrowDownRight size={12} color={step.color} />
                </View>
                <View style={s.dropoffInfo}>
                  <Text style={s.dropoffLabel}>{prev.label} → {step.label}</Text>
                  <View style={s.dropoffBarBg}>
                    <View style={[s.dropoffBarFill, { width: `${Math.max(dropPct, 3)}%` as any, backgroundColor: RED + '60' }]} />
                  </View>
                </View>
                <View style={s.dropoffStats}>
                  <Text style={s.dropoffValue}>-{dropCount}</Text>
                  <Text style={s.dropoffPctText}>{dropPct}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      </>
    );
  };

  const renderGeoTab = () => {
    if (!data) return null;
    const geo = data.geoZones;

    if (!geo || (geo.byCountry.length === 0 && geo.byCity.length === 0)) {
      return (
        <View style={s.emptyWrap}>
          <MapPin size={48} color={Colors.textTertiary} />
          <Text style={s.emptyTitle}>No Geo Data Yet</Text>
          <Text style={s.emptySubtitle}>Location data will appear as visitors arrive.</Text>
        </View>
      );
    }

    return (
      <>
        <View style={s.geoKpiRow}>
          {[
            { icon: <Globe size={18} color={BLUE} />, value: geo.byCountry.length, label: 'Countries', color: BLUE },
            { icon: <MapPin size={18} color={GREEN} />, value: geo.byCity.length, label: 'Cities', color: GREEN },
            { icon: <Crosshair size={18} color={PURPLE} />, value: geo.totalWithGeo, label: 'Tracked', color: PURPLE },
          ].map((kpi, i) => (
            <View key={i} style={[s.geoKpiCard, { borderTopColor: kpi.color }]}>
              {kpi.icon}
              <Text style={s.geoKpiValue}>{kpi.value}</Text>
              <Text style={s.geoKpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Globe size={16} color={BLUE} />
            <Text style={s.cardTitle}>Top Countries</Text>
          </View>
          {geo.byCountry.map((c, i) => {
            const maxC = geo.byCountry[0]?.count || 1;
            const barW = Math.max(Math.round((c.count / maxC) * 100), 4);
            const flag = COUNTRY_FLAGS[c.country] || '🌍';
            return (
              <View key={i} style={s.geoRow}>
                <Text style={s.geoFlag}>{flag}</Text>
                <View style={s.geoInfo}>
                  <View style={s.geoTopRow}>
                    <Text style={s.geoName} numberOfLines={1}>{c.country}</Text>
                    <Text style={s.geoPct}>{c.pct}%</Text>
                  </View>
                  <View style={s.geoBarBg}>
                    <View style={[s.geoBarFill, { width: `${barW}%` as any, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                  </View>
                </View>
                <Text style={s.geoCount}>{c.count}</Text>
              </View>
            );
          })}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <MapPin size={16} color={GREEN} />
            <Text style={s.cardTitle}>Top Cities</Text>
          </View>
          {geo.byCity.slice(0, 10).map((c, i) => (
            <View key={i} style={s.cityRow}>
              <View style={[s.cityRank, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '18' }]}>
                <Text style={[s.cityRankText, { color: CHART_COLORS[i % CHART_COLORS.length] }]}>{i + 1}</Text>
              </View>
              <View style={s.cityInfo}>
                <Text style={s.cityName} numberOfLines={1}>{c.city}</Text>
                <Text style={s.cityCountry}>{c.country}</Text>
              </View>
              <Text style={s.cityCount}>{c.count}</Text>
            </View>
          ))}
        </View>

        {geo.byTimezone?.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Clock size={16} color={ACCENT} />
              <Text style={s.cardTitle}>Timezone Distribution</Text>
            </View>
            {geo.byTimezone.slice(0, 8).map((tz, i) => (
              <View key={i} style={s.miniListRow}>
                <View style={[s.miniDot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                <Text style={s.miniLabel} numberOfLines={1}>{tz.timezone.replace(/_/g, ' ')}</Text>
                <Text style={s.miniValue}>{tz.count}</Text>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  const renderInsightsTab = () => {
    if (!data) return null;
    const insights = data.smartInsights;

    if (!insights) {
      return (
        <View style={s.emptyWrap}>
          <Brain size={48} color={Colors.textTertiary} />
          <Text style={s.emptyTitle}>Loading Insights</Text>
          <Text style={s.emptySubtitle}>Analysis will appear as more data is collected.</Text>
        </View>
      );
    }

    const engColor = insights.engagementScore >= 60 ? GREEN : insights.engagementScore >= 30 ? ACCENT : RED;

    return (
      <>
        <View style={s.scoreHero}>
          <AnimatedRing percent={insights.engagementScore} size={130} strokeWidth={10} color={engColor}>
            <Text style={[s.scoreBig, { color: engColor }]}>{insights.engagementScore}</Text>
            <Text style={s.scoreUnit}>/100</Text>
          </AnimatedRing>
          <Text style={s.scoreTitle}>Engagement Score</Text>
          <Text style={s.scoreDesc}>Based on scroll depth, CTA clicks, and form submissions</Text>
        </View>

        <View style={s.insightKpiRow}>
          {[
            { icon: <Timer size={16} color={BLUE} />, value: formatSeconds(insights.avgTimeOnPage), label: 'Avg Time', color: BLUE },
            { icon: <Percent size={16} color={RED} />, value: `${insights.bounceRate}%`, label: 'Bounce', color: RED },
            { icon: <Clock size={16} color={ACCENT} />, value: `${insights.peakHour}:00`, label: 'Peak', color: ACCENT },
          ].map((kpi, i) => (
            <View key={i} style={[s.insightKpi, { borderTopColor: kpi.color }]}>
              {kpi.icon}
              <Text style={s.insightKpiValue}>{kpi.value}</Text>
              <Text style={s.insightKpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Flame size={16} color={RED} />
            <Text style={s.cardTitle}>Visitor Intent</Text>
          </View>
          {[
            { label: 'High Intent', desc: 'Submitted form', count: insights.visitorIntent.highIntent, pct: insights.visitorIntent.highIntentPct, color: GREEN },
            { label: 'Medium', desc: 'Clicked CTA', count: insights.visitorIntent.mediumIntent, pct: insights.visitorIntent.mediumIntentPct, color: ACCENT },
            { label: 'Low', desc: 'Browsed only', count: insights.visitorIntent.lowIntent, pct: insights.visitorIntent.lowIntentPct, color: RED },
          ].map((intent, i) => (
            <View key={i} style={s.intentRow}>
              <View style={[s.intentDot, { backgroundColor: intent.color }]} />
              <View style={s.intentInfo}>
                <View style={s.intentTopRow}>
                  <Text style={s.intentLabel}>{intent.label}</Text>
                  <Text style={s.intentPctText}>{intent.pct}%</Text>
                </View>
                <View style={s.intentBarBg}>
                  <View style={[s.intentBarFill, { width: `${Math.max(intent.pct, 3)}%` as any, backgroundColor: intent.color }]} />
                </View>
              </View>
              <Text style={s.intentCount}>{intent.count}</Text>
            </View>
          ))}
        </View>

        {insights.deviceBreakdown?.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Smartphone size={16} color={PINK} />
              <Text style={s.cardTitle}>Devices</Text>
            </View>
            <View style={s.deviceGrid}>
              {insights.deviceBreakdown.map((d, i) => (
                <View key={i} style={[s.deviceCard, { borderTopColor: CHART_COLORS[i % CHART_COLORS.length] }]}>
                  {d.device === 'Mobile' ? <Smartphone size={22} color={CHART_COLORS[i % CHART_COLORS.length]} /> :
                    d.device === 'Tablet' ? <Tablet size={22} color={CHART_COLORS[i % CHART_COLORS.length]} /> :
                    <Monitor size={22} color={CHART_COLORS[i % CHART_COLORS.length]} />}
                  <Text style={s.deviceCount}>{d.count}</Text>
                  <Text style={s.deviceLabel}>{d.device}</Text>
                  <Text style={[s.devicePct, { color: CHART_COLORS[i % CHART_COLORS.length] }]}>{d.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {insights.topInterests?.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Target size={16} color={GREEN} />
              <Text style={s.cardTitle}>Investment Interest</Text>
            </View>
            {insights.topInterests.map((interest, i) => (
              <View key={i} style={s.miniListRow}>
                <View style={[s.miniRank, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '18' }]}>
                  <Text style={[s.miniRankText, { color: CHART_COLORS[i % CHART_COLORS.length] }]}>{i + 1}</Text>
                </View>
                <Text style={s.miniLabel} numberOfLines={1}>{interest.interest.replace(/_/g, ' ')}</Text>
                <Text style={[s.miniPct, { color: CHART_COLORS[i % CHART_COLORS.length] }]}>{interest.pct}%</Text>
                <Text style={s.miniValue}>{interest.count}</Text>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  const renderLiveTab = () => {
    if (isLoading && !liveData) {
      return (
        <View style={s.emptyWrap}>
          <Radio size={48} color={BLUE} />
          <Text style={s.emptyTitle}>Connecting...</Text>
          <Text style={s.emptySubtitle}>Fetching real-time session data.</Text>
        </View>
      );
    }

    if (!liveData) {
      return (
        <View style={s.emptyWrap}>
          <View style={s.liveEmptyIcon}>
            <Radio size={44} color={BLUE} />
          </View>
          <Text style={s.emptyTitle}>No Active Sessions</Text>
          <Text style={s.emptySubtitle}>Live visitor sessions will appear here in real-time when someone visits your landing page.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={onRefresh}>
            <RefreshCw size={14} color="#000" />
            <Text style={s.retryBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const { active, recent, sessions, breakdown } = liveData;

    const getStepLabel = (step: number) => {
      switch (step) {
        case 0: return 'Hero';
        case 1: return 'Goals';
        case 2: return 'Form';
        case 3: return 'Success';
        default: return `Step ${step}`;
      }
    };

    const getStepColor = (step: number) => {
      switch (step) {
        case 0: return BLUE;
        case 1: return ACCENT;
        case 2: return GREEN;
        case 3: return '#27AE60';
        default: return Colors.textTertiary;
      }
    };

    const formatDuration = (sec: number) => {
      if (sec < 60) return `${sec}s`;
      return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    };

    return (
      <>
        <View style={s.liveHero}>
          <PulseIndicator active={active > 0} />
          <Text style={s.liveCount}>{active}</Text>
          <Text style={s.liveLabel}>Active Right Now</Text>
          <View style={s.liveSubRow}>
            <View style={s.liveSub}>
              <Clock size={12} color={PURPLE} />
              <Text style={s.liveSubText}>{recent} in last 5m</Text>
            </View>
            <View style={s.liveSub}>
              <Users size={12} color={BLUE} />
              <Text style={s.liveSubText}>{sessions?.length || 0} sessions</Text>
            </View>
          </View>
        </View>

        {breakdown?.byStep?.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Target size={16} color={BLUE} />
              <Text style={s.cardTitle}>Active by Step</Text>
            </View>
            <View style={s.liveStepGrid}>
              {breakdown.byStep.map((st, i) => {
                const stepNum = parseInt(st.step.replace('Step ', ''), 10) || 0;
                return (
                  <View key={i} style={[s.liveStepCard, { borderTopColor: getStepColor(stepNum) }]}>
                    <Text style={[s.liveStepCount, { color: getStepColor(stepNum) }]}>{st.count}</Text>
                    <Text style={s.liveStepLabel}>{getStepLabel(stepNum)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {breakdown?.byCountry?.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Globe size={16} color={GREEN} />
              <Text style={s.cardTitle}>Live by Country</Text>
            </View>
            {breakdown.byCountry.slice(0, 8).map((c, i) => (
              <View key={i} style={s.miniListRow}>
                <Text style={{ fontSize: 16, width: 24, textAlign: 'center' as const }}>
                  {COUNTRY_FLAGS[c.country] || '🌍'}
                </Text>
                <Text style={s.miniLabel} numberOfLines={1}>{c.country}</Text>
                <Text style={s.miniValue}>{c.count}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.card}>
          <View style={s.cardHeader}>
            <Radio size={16} color={RED} />
            <Text style={s.cardTitle}>Sessions ({sessions?.length || 0})</Text>
          </View>
          {(!sessions || sessions.length === 0) ? (
            <Text style={s.noDataText}>No active sessions right now.</Text>
          ) : (
            sessions.slice(0, 20).map((sess, i) => (
              <View key={sess.sessionId || i} style={s.sessionRow}>
                <PulseIndicator active={sess.isActive} />
                <View style={s.sessionInfo}>
                  <View style={s.sessionTopRow}>
                    <Text style={s.sessionIP} numberOfLines={1}>{sess.ip}</Text>
                    <View style={[s.sessionBadge, { backgroundColor: getStepColor(sess.currentStep) + '20', borderColor: getStepColor(sess.currentStep) + '40' }]}>
                      <Text style={[s.sessionBadgeText, { color: getStepColor(sess.currentStep) }]}>
                        {getStepLabel(sess.currentStep)}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.sessionDetail} numberOfLines={1}>
                    {sess.device} · {sess.os} · {sess.browser}
                  </Text>
                  <View style={s.sessionMetaRow}>
                    {sess.geo?.country && (
                      <Text style={s.sessionMeta}>
                        {COUNTRY_FLAGS[sess.geo.country] || ''} {sess.geo.city || sess.geo.country}
                      </Text>
                    )}
                    <Text style={s.sessionMeta}>{formatDuration(sess.sessionDuration)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </>
    );
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.safe}>
        <Animated.View style={[s.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="analytics-back-btn">
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Analytics</Text>
            <View style={[s.connectionBadge, { backgroundColor: isConnected ? GREEN + '18' : RED + '18' }]}>
              {isConnected ? <Wifi size={10} color={GREEN} /> : <WifiOff size={10} color={RED} />}
              <Text style={[s.connectionText, { color: isConnected ? GREEN : RED }]}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={s.refreshBtn} testID="analytics-refresh-btn">
            <RefreshCw size={17} color={Colors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

        {lastUpdated ? (
          <View style={s.statusBar}>
            <Text style={s.statusText}>Updated {lastUpdated} · {fetchCount} syncs</Text>
            {data && (
              <Text style={s.statusLeads}>{data.totalLeads} leads · {data.pageViews} views</Text>
            )}
          </View>
        ) : null}

        <View style={s.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <TouchableOpacity
                key={tab.value}
                style={[s.tab, isActive && s.tabActive]}
                onPress={() => setActiveTab(tab.value)}
                activeOpacity={0.7}
                testID={`analytics-tab-${tab.value}`}
              >
                {tab.icon}
                <Text style={[s.tabText, isActive && s.tabTextActive]}>{tab.label}</Text>
                {isActive && <View style={s.tabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          contentContainerStyle={s.scrollContent}
        >
          <View style={s.periodRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[s.periodChip, period === p.value && s.periodChipActive]}
                onPress={() => setPeriod(p.value)}
                activeOpacity={0.7}
                testID={`analytics-period-${p.value}`}
              >
                <Text style={[s.periodText, period === p.value && s.periodTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'live' ? (
            renderLiveTab()
          ) : data ? (
            <>
              {renderDiagnosticPanel()}
              {activeTab === 'overview' && renderOverviewTab()}
              {activeTab === 'acquisition' && renderAcquisitionTab()}
              {activeTab === 'funnel' && renderFunnelTab()}
              {activeTab === 'geo' && renderGeoTab()}
              {activeTab === 'insights' && renderInsightsTab()}
            </>
          ) : isError ? (
            <View style={s.emptyWrap}>
              <View style={s.errorIcon}>
                <Activity size={40} color={RED} />
              </View>
              <Text style={s.emptyTitle}>Connection Issue</Text>
              <Text style={s.emptySubtitle}>{errorMsg || 'Could not reach analytics server. Pull down to retry.'}</Text>
              <Text style={s.debugText}>Server: {getApiBaseUrl()}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={onRefresh}>
                <RefreshCw size={14} color="#000" />
                <Text style={s.retryBtnText}>Retry Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Sparkles size={40} color={Colors.textTertiary} />
              <Text style={s.emptyTitle}>Loading Analytics...</Text>
              <Text style={s.emptySubtitle}>Connecting to {getApiBaseUrl()}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  backBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSecondary },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800' as const, color: Colors.text, letterSpacing: -0.3 },
  connectionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  connectionText: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSecondary },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  statusText: { fontSize: 10, fontWeight: '600' as const, color: Colors.textTertiary },
  statusLeads: { fontSize: 10, fontWeight: '700' as const, color: GREEN },
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, position: 'relative' as const },
  tabActive: {},
  tabText: { fontSize: 12, fontWeight: '600' as const, color: Colors.textTertiary },
  tabTextActive: { color: ACCENT, fontWeight: '700' as const },
  tabIndicator: { position: 'absolute', bottom: 0, left: '20%' as any, right: '20%' as any, height: 2, backgroundColor: ACCENT, borderRadius: 1 },

  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  periodChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  periodChipActive: { backgroundColor: ACCENT + '18', borderWidth: 1, borderColor: ACCENT + '50' },
  periodText: { fontSize: 12, fontWeight: '700' as const, color: Colors.textTertiary },
  periodTextActive: { color: ACCENT },

  leadsHero: {
    backgroundColor: '#0A1628',
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1B365D',
    gap: 12,
  },
  leadsHeroIconWrap: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1B365D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadsHeroContent: { gap: 2 },
  leadsHeroLabel: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#4A90D9',
    letterSpacing: 1.5,
  },
  leadsBreakdown: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 2,
  },
  leadsBreakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  leadsBreakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  leadsBreakdownText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#8BA4C4',
  },
  leadsLiveBadge: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#00C48C18',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  leadsLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00C48C',
  },
  leadsLiveText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#00C48C',
    letterSpacing: 0.3,
  },
  heroMetrics: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 16, overflow: 'hidden' },
  heroMetricMain: { flex: 1, padding: 20, alignItems: 'center', gap: 6 },
  heroMetricDivider: { width: 1, backgroundColor: Colors.surfaceBorder, marginVertical: 12 },
  heroMetricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetricLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary },
  counterText: { fontSize: 32, fontWeight: '900' as const, color: Colors.text, letterSpacing: -1 },

  ringRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  ringCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: 14, alignItems: 'center', gap: 8 },
  ringValue: { fontSize: 18, fontWeight: '900' as const, color: Colors.text },
  ringLabel: { fontSize: 9, fontWeight: '600' as const, color: Colors.textTertiary, letterSpacing: 0.5 },
  ringCardLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },

  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: Colors.text },
  cardSubtitle: { fontSize: 11, fontWeight: '600' as const, color: Colors.textTertiary },
  cardBadge: { backgroundColor: '#4A90D918', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardBadgeText: { fontSize: 10, fontWeight: '700' as const, color: '#4A90D9' },

  sparkLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sparkLabel: { fontSize: 10, fontWeight: '600' as const, color: Colors.textTertiary },

  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: { width: (SCREEN_W - 80) / 12 - 4, aspectRatio: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  heatmapHour: { fontSize: 8, fontWeight: '700' as const, color: Colors.textTertiary },
  heatmapCount: { fontSize: 7, fontWeight: '800' as const, color: '#FFFFFF' },

  ctaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ctaCard: { flex: 1, minWidth: '43%' as any, backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder, gap: 8 },
  ctaIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ctaValue: { fontSize: 24, fontWeight: '900' as const, color: Colors.text },
  ctaLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },
  ctaBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  ctaBarFill: { height: 4, borderRadius: 2 },

  splitRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  splitCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder },

  miniListRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniLabel: { flex: 1, fontSize: 12, fontWeight: '600' as const, color: Colors.text },
  miniValue: { fontSize: 13, fontWeight: '800' as const, color: Colors.text },
  miniPct: { fontSize: 11, fontWeight: '700' as const, width: 36, textAlign: 'right' as const },
  miniRank: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  miniRankText: { fontSize: 10, fontWeight: '800' as const },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  eventRank: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  eventRankText: { fontSize: 10, fontWeight: '800' as const },
  eventInfo: { flex: 1, gap: 4 },
  eventName: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary, textTransform: 'capitalize' as const },
  eventBarBg: { height: 4, backgroundColor: Colors.backgroundSecondary, borderRadius: 2, overflow: 'hidden' },
  eventBar: { height: 4, borderRadius: 2 },
  eventCount: { width: 40, fontSize: 13, fontWeight: '800' as const, color: Colors.text, textAlign: 'right' as const },

  funnelHero: { backgroundColor: Colors.surface, borderRadius: 18, padding: 24, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 16, alignItems: 'center', gap: 6 },
  funnelHeroTitle: { fontSize: 22, fontWeight: '900' as const, color: Colors.text, letterSpacing: -0.3 },
  funnelHeroSub: { fontSize: 13, fontWeight: '600' as const, color: Colors.textSecondary },

  funnelVisual: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 14, gap: 2 },
  funnelStepWrap: { gap: 4, marginBottom: 6 },
  funnelStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelBar: { height: 36, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12, minWidth: 50 },
  funnelBarText: { fontSize: 12, fontWeight: '800' as const, color: '#FFFFFF' },
  funnelPct: { fontSize: 13, fontWeight: '800' as const, color: Colors.text, width: 40, textAlign: 'right' as const },
  funnelLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  funnelLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },
  funnelDropoff: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#E5393518', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  funnelDropoffText: { fontSize: 9, fontWeight: '700' as const, color: '#E53935' },
  funnelConnector: { width: 1, height: 8, backgroundColor: Colors.surfaceBorder, marginLeft: 20 },

  dropoffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dropoffIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dropoffInfo: { flex: 1, gap: 4 },
  dropoffLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },
  dropoffBarBg: { height: 4, backgroundColor: Colors.backgroundSecondary, borderRadius: 2, overflow: 'hidden' },
  dropoffBarFill: { height: 4, borderRadius: 2 },
  dropoffStats: { alignItems: 'flex-end', width: 44 },
  dropoffValue: { fontSize: 13, fontWeight: '800' as const, color: '#E53935' },
  dropoffPctText: { fontSize: 9, fontWeight: '600' as const, color: Colors.textTertiary },

  geoKpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  geoKpiCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder, borderTopWidth: 3, alignItems: 'center', gap: 6 },
  geoKpiValue: { fontSize: 24, fontWeight: '900' as const, color: Colors.text },
  geoKpiLabel: { fontSize: 10, fontWeight: '700' as const, color: Colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },

  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  geoFlag: { fontSize: 20, width: 28, textAlign: 'center' as const },
  geoInfo: { flex: 1, gap: 4 },
  geoTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  geoName: { fontSize: 13, fontWeight: '700' as const, color: Colors.text },
  geoPct: { fontSize: 11, fontWeight: '600' as const, color: Colors.textTertiary },
  geoBarBg: { height: 5, backgroundColor: Colors.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  geoBarFill: { height: 5, borderRadius: 3 },
  geoCount: { width: 36, fontSize: 14, fontWeight: '800' as const, color: Colors.text, textAlign: 'right' as const },

  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  cityRank: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cityRankText: { fontSize: 11, fontWeight: '800' as const },
  cityInfo: { flex: 1, gap: 1 },
  cityName: { fontSize: 13, fontWeight: '700' as const, color: Colors.text },
  cityCountry: { fontSize: 10, fontWeight: '500' as const, color: Colors.textTertiary },
  cityCount: { fontSize: 14, fontWeight: '800' as const, color: Colors.text },

  scoreHero: { backgroundColor: Colors.surface, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 16, alignItems: 'center', gap: 10 },
  scoreBig: { fontSize: 36, fontWeight: '900' as const, lineHeight: 40 },
  scoreUnit: { fontSize: 12, fontWeight: '600' as const, color: Colors.textTertiary },
  scoreTitle: { fontSize: 18, fontWeight: '800' as const, color: Colors.text, marginTop: 4 },
  scoreDesc: { fontSize: 12, fontWeight: '500' as const, color: Colors.textSecondary, textAlign: 'center' as const },

  insightKpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  insightKpi: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder, borderTopWidth: 3, alignItems: 'center', gap: 6 },
  insightKpiValue: { fontSize: 18, fontWeight: '900' as const, color: Colors.text },
  insightKpiLabel: { fontSize: 10, fontWeight: '600' as const, color: Colors.textSecondary },

  intentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  intentDot: { width: 10, height: 10, borderRadius: 5 },
  intentInfo: { flex: 1, gap: 4 },
  intentTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  intentLabel: { fontSize: 13, fontWeight: '700' as const, color: Colors.text },
  intentPctText: { fontSize: 12, fontWeight: '700' as const, color: Colors.textSecondary },
  intentBarBg: { height: 6, backgroundColor: Colors.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  intentBarFill: { height: 6, borderRadius: 3 },
  intentCount: { width: 36, fontSize: 14, fontWeight: '800' as const, color: Colors.text, textAlign: 'right' as const },

  deviceGrid: { flexDirection: 'row', gap: 10 },
  deviceCard: { flex: 1, backgroundColor: Colors.backgroundSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.surfaceBorder, borderTopWidth: 3, alignItems: 'center', gap: 6 },
  deviceCount: { fontSize: 22, fontWeight: '900' as const, color: Colors.text },
  deviceLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },
  devicePct: { fontSize: 13, fontWeight: '800' as const },

  liveHero: { backgroundColor: Colors.surface, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 16, alignItems: 'center', gap: 8 },
  liveCount: { fontSize: 56, fontWeight: '900' as const, color: Colors.text, letterSpacing: -2 },
  liveLabel: { fontSize: 14, fontWeight: '700' as const, color: Colors.textSecondary },
  liveSubRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  liveSub: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveSubText: { fontSize: 12, fontWeight: '600' as const, color: Colors.textTertiary },

  pulseWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  pulseDot: { width: 10, height: 10, borderRadius: 5 },

  liveStepGrid: { flexDirection: 'row', gap: 8 },
  liveStepCard: { flex: 1, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.surfaceBorder, borderTopWidth: 3, alignItems: 'center', gap: 4 },
  liveStepCount: { fontSize: 22, fontWeight: '900' as const },
  liveStepLabel: { fontSize: 10, fontWeight: '600' as const, color: Colors.textSecondary },

  sessionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  sessionInfo: { flex: 1, gap: 3 },
  sessionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionIP: { fontSize: 13, fontWeight: '800' as const, color: Colors.text },
  sessionBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  sessionBadgeText: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.3 },
  sessionDetail: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  sessionMeta: { fontSize: 10, fontWeight: '500' as const, color: Colors.textTertiary },

  noDataText: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center' as const, paddingVertical: 16, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800' as const, color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' as const, lineHeight: 20, paddingHorizontal: 24 },
  debugText: { fontSize: 10, color: Colors.textTertiary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  errorIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E5393518', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  liveEmptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#4A90D915', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#000' },

  diagnosticCard: {
    backgroundColor: '#FFB80008', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#FFB80030', marginBottom: 16,
  },
  diagnosticHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 },
  diagnosticTitle: { fontSize: 15, fontWeight: '700' as const, color: '#FFB800' },
  diagnosticDesc: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 18 },
  diagnosticGrid: { gap: 8 },
  diagnosticRow: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  diagnosticLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' as const },
  diagnosticValue: { fontSize: 13, color: Colors.text, fontWeight: '700' as const },
  diagnosticBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  diagnosticBadgeText: { fontSize: 11, fontWeight: '700' as const },
  diagnosticWarning: {
    backgroundColor: '#FF4D4D10', borderRadius: 8, padding: 10, marginTop: 12,
    borderWidth: 1, borderColor: '#FF4D4D20',
  },
  diagnosticWarningText: { fontSize: 11, color: '#FF6B6B', lineHeight: 16 },
  diagnosticInfo: {
    backgroundColor: '#4A90D910', borderRadius: 8, padding: 10, marginTop: 12,
    borderWidth: 1, borderColor: '#4A90D920',
  },
  diagnosticInfoText: { fontSize: 11, color: '#6AADEE', lineHeight: 16 },

  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  trendBadgeText: { fontSize: 10, fontWeight: '700' as const },

  sqGrid: { flexDirection: 'row', gap: 10 },
  sqItem: { flex: 1, backgroundColor: Colors.backgroundSecondary, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.surfaceBorder },
  sqValue: { fontSize: 20, fontWeight: '900' as const, color: Colors.text },
  sqLabel: { fontSize: 10, fontWeight: '600' as const, color: Colors.textSecondary, textAlign: 'center' as const },

  nvrRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  nvrBlock: { flex: 1, alignItems: 'center', gap: 6 },
  nvrIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nvrValue: { fontSize: 26, fontWeight: '900' as const, color: Colors.text },
  nvrLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary },
  nvrPct: { fontSize: 14, fontWeight: '800' as const },
  nvrDivider: { width: 1, backgroundColor: Colors.surfaceBorder, marginVertical: 8 },
  nvrBarWrap: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  nvrBarNew: { backgroundColor: BLUE, borderRadius: 4 },
  nvrBarReturn: { backgroundColor: GREEN, borderRadius: 4 },

  acqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  acqDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  acqInfo: { flex: 1, gap: 4 },
  acqTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  acqName: { fontSize: 14, fontWeight: '700' as const, color: Colors.text },
  acqPct: { fontSize: 12, fontWeight: '700' as const, color: Colors.textSecondary },
  acqBarBg: { height: 5, backgroundColor: Colors.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  acqBarFill: { height: 5, borderRadius: 3 },
  acqMetaRow: { flexDirection: 'row', gap: 12 },
  acqMeta: { fontSize: 10, fontWeight: '600' as const, color: Colors.textTertiary },
});
