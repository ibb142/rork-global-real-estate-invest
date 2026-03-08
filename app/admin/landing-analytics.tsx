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
  AlertTriangle,
  TrendingDown,
  Lightbulb,
} from 'lucide-react-native';
import { trpc } from '@/lib/trpc';
import { useInstantCache } from '@/lib/use-instant-query';
import { useAuth } from '@/lib/auth-context';
import { getAuthToken } from '@/lib/auth-store';

type PeriodType = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';
type TabType = 'overview' | 'funnel' | 'geo' | 'insights' | 'live' | 'brain';

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
  { label: 'Overview', value: 'overview', icon: <BarChart3 size={14} color="#97A0AF" /> },
  { label: 'Funnel', value: 'funnel', icon: <Layers size={14} color="#97A0AF" /> },
  { label: 'Geo', value: 'geo', icon: <MapPin size={14} color="#97A0AF" /> },
  { label: 'Intel', value: 'insights', icon: <Brain size={14} color="#97A0AF" /> },
  { label: 'Live', value: 'live', icon: <Radio size={14} color="#E53935" /> },
  { label: 'AI Brain', value: 'brain', icon: <Sparkles size={14} color="#FFB800" /> },
];

const IMPACT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: '#FF4D4D18', text: '#FF4D4D', label: 'CRITICAL' },
  high: { bg: '#FFB80018', text: '#FFB800', label: 'HIGH' },
  medium: { bg: '#4A90D918', text: '#4A90D9', label: 'MEDIUM' },
  low: { bg: '#00C48C18', text: '#00C48C', label: 'LOW' },
};

const TYPE_ICONS: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pattern: { icon: <Activity size={14} color="#7B68EE" />, color: '#7B68EE', label: 'Pattern' },
  anomaly: { icon: <AlertTriangle size={14} color="#FF4D4D" />, color: '#FF4D4D', label: 'Anomaly' },
  prediction: { icon: <TrendingUp size={14} color="#00C48C" />, color: '#00C48C', label: 'Prediction' },
  recommendation: { icon: <Lightbulb size={14} color="#FFB800" />, color: '#FFB800', label: 'Recommendation' },
  trend: { icon: <TrendingDown size={14} color="#4A90D9" />, color: '#4A90D9', label: 'Trend' },
};

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


const SS_BLUE = '#0073EA';
const SS_GREEN = '#00854D';
const SS_TEAL = '#0097A7';
const SS_RED = '#E53935';
const SS_ORANGE = '#F57C00';
const SS_PURPLE = '#7B61FF';
const SS_YELLOW = '#F9A825';
const SS_NAVY = '#1B365D';
const SS_PINK = '#E91E63';
const SS_LIME = '#7CB342';

const CHART_COLORS = [SS_BLUE, SS_GREEN, SS_ORANGE, SS_PURPLE, SS_TEAL, SS_RED, SS_YELLOW, SS_PINK, SS_LIME, SS_NAVY];

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function AnimatedRing({ percent, size, strokeWidth, color, children }: {
  percent: number; size: number; strokeWidth: number; color: string; children?: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: percent, duration: 1200, useNativeDriver: false }).start();
  }, [percent, anim]);

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
              backgroundColor: isFilled ? color : '#1E1E22',
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
  const _s = suffix;
  const _p = prefix;
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<number>(0);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: value, duration: 800, useNativeDriver: false }).start();
    const listener = anim.addListener(({ value: v }) => setDisplay(Math.round(v as number)));
    return () => anim.removeListener(listener);
  }, [value, anim]);

  return <Text style={s.counterText}>{_p}{display.toLocaleString()}{_s}</Text>;
}

function TrendBadge({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const isPositive = inverted ? value < 0 : value > 0;
  const absVal = Math.abs(value);
  return (
    <View style={[s.trendBadge, { backgroundColor: isPositive ? '#00C48C15' : '#FF6B6B15' }]}>
      {isPositive ? (
        <ArrowUpRight size={10} color="#00C48C" />
      ) : (
        <ArrowDownRight size={10} color="#FF6B6B" />
      )}
      <Text style={[s.trendText, { color: isPositive ? '#00C48C' : '#FF6B6B' }]}>
        {absVal}%
      </Text>
    </View>
  );
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
        <Animated.View style={[s.pulseRing, { transform: [{ scale: pulse }], borderColor: '#00C48C40' }]} />
      )}
      <View style={[s.pulseDot, { backgroundColor: active ? '#00C48C' : '#555' }]} />
    </View>
  );
}

export default function LandingAnalyticsScreen() {
  const router = useRouter();
  const { isAuthenticated, isAdmin, isLoading: authLoading, refreshSession } = useAuth();
  const [period, setPeriod] = useState<PeriodType>('all');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [_retryCount, setRetryCount] = useState(0);
  const [liveData, setLiveData] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const headerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, tension: 40, friction: 10, useNativeDriver: true }).start();
  }, [headerAnim]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isAdmin) {
      void refreshSession().then((ok) => {
        if (ok) setRetryCount(c => c + 1);
      });
    }
  }, [authLoading, isAuthenticated, isAdmin, refreshSession]);

  const analyticsQuery = trpc.analytics.getLandingAnalytics.useQuery(
    { period },
    {
      enabled: !authLoading,
      staleTime: 0,
      refetchInterval: 1000 * 3,
      retry: 3,
      retryDelay: (attempt) => Math.min(500 * Math.pow(2, attempt), 3000),
      placeholderData: (prev) => prev,
    }
  );

  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '';

  const fetchLiveSessions = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setLiveLoading(true);
      }
      setLiveError(null);

      const tokenStr = getAuthToken() || '';
      if (!tokenStr) {
        console.warn('[LiveSessions] No auth token available');
        setLiveError('Not authenticated. Please log in.');
        setLiveLoading(false);
        return;
      }

      const baseUrl = apiBaseUrl;
      if (!baseUrl) {
        console.warn('[LiveSessions] No API base URL configured');
        setLiveError('API not configured');
        setLiveLoading(false);
        return;
      }

      const url = `${baseUrl}/track/live-sessions`;
      console.log('[LiveSessions] Fetching:', url);
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${tokenStr}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[LiveSessions] Data received:', JSON.stringify(data).slice(0, 200));
        setLiveData(data);
        setLiveError(null);
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[LiveSessions] HTTP ${res.status}: ${errText}`);
        setLiveError(`Server returned ${res.status}`);
      }
    } catch (err: any) {
      console.warn('[LiveSessions] Error:', err?.message || err);
      setLiveError(err?.message || 'Connection failed');
    } finally {
      setLiveLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (activeTab === 'live') {
      void fetchLiveSessions(true);
      const interval = setInterval(() => fetchLiveSessions(false), 5000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [activeTab, fetchLiveSessions]);

  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const utils = trpc.useUtils();
  const onRefresh = useCallback(async () => {
    setManualRefreshing(true);
    void refreshSession().then((refreshed) => {
      if (refreshed) setRetryCount(prev => prev + 1);
    });
    await utils.analytics.getLandingAnalytics.invalidate();
    setManualRefreshing(false);
  }, [utils, refreshSession]);

  const data = useInstantCache(`landing_analytics_${period}`, analyticsQuery.data, analyticsQuery.isSuccess);

  const funnelSteps = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Page Views', count: data.funnel.pageViews, color: '#4A90D9', pct: 100 },
      { label: 'Scroll 25%', count: data.funnel.scroll25, color: '#7B68EE', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll25 / data.funnel.pageViews) * 100) : 0 },
      { label: 'Scroll 50%', count: data.funnel.scroll50, color: '#9B59B6', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll50 / data.funnel.pageViews) * 100) : 0 },
      { label: 'Scroll 75%', count: data.funnel.scroll75, color: SS_ORANGE, pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll75 / data.funnel.pageViews) * 100) : 0 },
      { label: 'Form Focus', count: data.funnel.formFocuses, color: '#00C48C', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.formFocuses / data.funnel.pageViews) * 100) : 0 },
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

  const renderOverviewTab = () => {
    if (!data) return null;

    const convPct = parseFloat(String(data.conversionRate)) || 0;
    const totalViews = data.pageViews;
    const totalUnique = data.uniqueSessions;
    const totalRegistrations = data.funnel.formSubmits;

    return (
      <>
        <View style={s.heroMetrics}>
          <View style={s.heroMetricMain}>
            <View style={s.heroMetricHeader}>
              <Eye size={18} color="#4A90D9" />
              <Text style={s.heroMetricLabel}>Total Views</Text>
            </View>
            <AnimatedCounter value={totalViews} />
            {totalViews > 0 && <TrendBadge value={12} />}
          </View>

          <View style={s.heroMetricDivider} />

          <View style={s.heroMetricMain}>
            <View style={s.heroMetricHeader}>
              <Users size={18} color="#7B68EE" />
              <Text style={s.heroMetricLabel}>Unique Visitors</Text>
            </View>
            <AnimatedCounter value={totalUnique} />
            {totalUnique > 0 && <TrendBadge value={8} />}
          </View>
        </View>

        <View style={s.ringRow}>
          <View style={s.ringCard}>
            <AnimatedRing percent={convPct} size={90} strokeWidth={8} color="#00C48C">
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
              color="#7B68EE"
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
              color="#FFD700"
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
              <TrendingUp size={16} color="#00C48C" />
              <Text style={s.cardTitle}>Daily Traffic</Text>
              <View style={s.cardBadge}>
                <Text style={s.cardBadgeText}>{data.dailyViews.length}d</Text>
              </View>
            </View>
            <MiniSparkBar data={dailyData} color="#4A90D9" height={56} />
            <View style={s.sparkLabelRow}>
              <Text style={s.sparkLabel}>{data.dailyViews.slice(-14)[0]?.date?.slice(5) || ''}</Text>
              <Text style={s.sparkLabel}>Today</Text>
            </View>
          </View>
        )}

        {hourlyData.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Clock size={16} color="#7B68EE" />
              <Text style={s.cardTitle}>Hourly Heatmap</Text>
            </View>
            <View style={s.heatmapGrid}>
              {hourlyData.map((count, i) => {
                const max = Math.max(...hourlyData, 1);
                const intensity = count / max;
                const bgColor = count === 0 ? '#111' : `rgba(74, 144, 217, ${0.15 + intensity * 0.85})`;
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
            <Zap size={16} color={SS_ORANGE} />
            <Text style={s.cardTitle}>CTA Performance</Text>
          </View>
          <View style={s.ctaGrid}>
            {[
              { label: 'Get Started', count: data.cta.getStarted, icon: <ArrowUpRight size={16} color={SS_GREEN} />, color: SS_GREEN },
              { label: 'Sign In', count: data.cta.signIn, icon: <LogIn size={16} color={SS_BLUE} />, color: SS_BLUE },
              { label: 'JV Inquire', count: data.cta.jvInquire, icon: <TrendingUp size={16} color={SS_ORANGE} />, color: SS_ORANGE },
              { label: 'Website', count: data.cta.websiteClick, icon: <Globe size={16} color={SS_PURPLE} />, color: SS_PURPLE },
            ].map((cta, i) => (
              <View key={i} style={s.ctaCard}>
                <View style={[s.ctaIconBg, { backgroundColor: cta.color + '12' }]}>
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
              <Monitor size={14} color={SS_BLUE} />
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
              <Globe size={14} color={SS_TEAL} />
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
            <Activity size={16} color={SS_BLUE} />
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

  const renderFunnelTab = () => {
    if (!data) return null;
    const _maxCount = funnelSteps[0]?.count || 1;

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
                      <ArrowDownRight size={9} color="#FF6B6B" />
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
            <PieChart size={16} color="#E879F9" />
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
                    <View style={[s.dropoffBarFill, { width: `${Math.max(dropPct, 3)}%` as any, backgroundColor: '#FF6B6B60' }]} />
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
          <MapPin size={48} color="#97A0AF" />
          <Text style={s.emptyTitle}>No Geo Data Yet</Text>
          <Text style={s.emptySubtitle}>Location data will appear as visitors arrive from different locations.</Text>
        </View>
      );
    }

    return (
      <>
        <View style={s.geoKpiRow}>
          {[
            { icon: <Globe size={18} color="#4A90D9" />, value: geo.byCountry.length, label: 'Countries', color: '#4A90D9' },
            { icon: <MapPin size={18} color="#00C48C" />, value: geo.byCity.length, label: 'Cities', color: '#00C48C' },
            { icon: <Crosshair size={18} color="#7B68EE" />, value: geo.totalWithGeo, label: 'Tracked', color: '#7B68EE' },
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
            <Globe size={16} color="#4A90D9" />
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
            <MapPin size={16} color="#00C48C" />
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

        {geo.byTimezone.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Clock size={16} color="#FFD700" />
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
          <Brain size={48} color="#97A0AF" />
          <Text style={s.emptyTitle}>Loading Insights</Text>
          <Text style={s.emptySubtitle}>Intelligent analysis will be generated as more data is collected.</Text>
        </View>
      );
    }

    const engColor = insights.engagementScore >= 60 ? '#00C48C' : insights.engagementScore >= 30 ? '#FFD700' : '#FF6B6B';

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
            { icon: <Timer size={16} color="#4A90D9" />, value: formatSeconds(insights.avgTimeOnPage), label: 'Avg Time', color: '#4A90D9' },
            { icon: <Percent size={16} color="#FF6B6B" />, value: `${insights.bounceRate}%`, label: 'Bounce', color: '#FF6B6B' },
            { icon: <Clock size={16} color="#FFD700" />, value: `${insights.peakHour}:00`, label: 'Peak', color: '#FFD700' },
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
            <Flame size={16} color="#FF6B6B" />
            <Text style={s.cardTitle}>Visitor Intent</Text>
          </View>
          {[
            { label: 'High Intent', desc: 'Submitted form', count: insights.visitorIntent.highIntent, pct: insights.visitorIntent.highIntentPct, color: '#00C48C' },
            { label: 'Medium', desc: 'Clicked CTA', count: insights.visitorIntent.mediumIntent, pct: insights.visitorIntent.mediumIntentPct, color: '#FFD700' },
            { label: 'Low', desc: 'Browsed only', count: insights.visitorIntent.lowIntent, pct: insights.visitorIntent.lowIntentPct, color: '#FF6B6B' },
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

        {insights.deviceBreakdown.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Smartphone size={16} color="#E879F9" />
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

        {insights.topInterests.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Target size={16} color="#00C48C" />
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

  const brainQuery = trpc.aiLearning.getAIBrainStatus.useQuery(undefined, {
    enabled: activeTab === 'brain',
    staleTime: 10000,
    refetchInterval: activeTab === 'brain' ? 15000 : false,
  });

  const learnMutation = trpc.aiLearning.runLearningCycle.useMutation({
    onSuccess: () => {
      void utils.aiLearning.getAIBrainStatus.invalidate();
    },
  });

  const renderBrainTab = () => {
    const brain = brainQuery.data;

    if (brainQuery.isLoading && !brain) {
      return (
        <View style={s.emptyWrap}>
          <Sparkles size={48} color="#FFB800" />
          <Text style={s.emptyTitle}>Loading AI Brain...</Text>
          <Text style={s.emptySubtitle}>Connecting to the self-learning engine.</Text>
        </View>
      );
    }

    if (!brain) {
      return (
        <View style={s.emptyWrap}>
          <Sparkles size={48} color="#97A0AF" />
          <Text style={s.emptyTitle}>AI Brain Offline</Text>
          <Text style={s.emptySubtitle}>Run a learning cycle to activate the AI engine.</Text>
          <TouchableOpacity
            style={[s.retryBtn, { backgroundColor: '#FFB800' }]}
            onPress={() => learnMutation.mutate({ period })}
          >
            <Sparkles size={14} color="#000" />
            <Text style={s.retryBtnText}>Train AI</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const mem = brain.memory;
    const stats = brain.stats;

    return (
      <>
        <View style={s.brainHero}>
          <View style={s.brainPulseOuter}>
            <View style={[s.brainPulseInner, { backgroundColor: brain.status === 'active' ? '#00C48C' : '#FFB800' }]} />
          </View>
          <Text style={s.brainStatus}>
            {brain.status === 'active' ? 'AI Brain Active' : 'Learning Mode'}
          </Text>
          <Text style={s.brainCycles}>
            {mem.learningCycles} learning cycles completed
          </Text>
        </View>

        <View style={s.brainKpiRow}>
          {[
            { value: stats.activeLearnings, label: 'Active', color: '#00C48C' },
            { value: mem.totalDataPointsProcessed, label: 'Data Points', color: '#4A90D9' },
            { value: stats.avgConfidence, label: 'Confidence', color: '#FFB800', suffix: '%' },
          ].map((kpi, i) => (
            <View key={i} style={[s.brainKpiCard, { borderTopColor: kpi.color }]}>
              <Text style={[s.brainKpiValue, { color: kpi.color }]}>
                {kpi.value.toLocaleString()}{kpi.suffix || ''}
              </Text>
              <Text style={s.brainKpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={s.trainBtn}
          onPress={() => learnMutation.mutate({ period })}
          disabled={learnMutation.isPending}
          activeOpacity={0.7}
        >
          <Sparkles size={16} color="#000" />
          <Text style={s.trainBtnText}>
            {learnMutation.isPending ? 'Training...' : 'Run Learning Cycle'}
          </Text>
          {learnMutation.data && (
            <View style={s.trainBadge}>
              <Text style={s.trainBadgeText}>+{learnMutation.data.newLearnings}</Text>
            </View>
          )}
        </TouchableOpacity>

        {stats.byType && Object.keys(stats.byType).length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Activity size={16} color="#7B68EE" />
              <Text style={s.cardTitle}>Learning Types</Text>
            </View>
            {Object.entries(stats.byType).map(([type, count], _i) => {
              const typeInfo = TYPE_ICONS[type] || { icon: <Activity size={14} color="#97A0AF" />, color: '#97A0AF', label: type };
              const maxCount = Math.max(...Object.values(stats.byType as Record<string, number>), 1);
              return (
                <View key={type} style={s.brainTypeRow}>
                  <View style={[s.brainTypeIcon, { backgroundColor: typeInfo.color + '15' }]}>
                    {typeInfo.icon}
                  </View>
                  <View style={s.brainTypeInfo}>
                    <Text style={s.brainTypeLabel}>{typeInfo.label}</Text>
                    <View style={s.brainTypeBarBg}>
                      <View style={[s.brainTypeBarFill, {
                        width: `${Math.max(((count as number) / maxCount) * 100, 5)}%` as any,
                        backgroundColor: typeInfo.color,
                      }]} />
                    </View>
                  </View>
                  <Text style={[s.brainTypeCount, { color: typeInfo.color }]}>{count as number}</Text>
                </View>
              );
            })}
          </View>
        )}

        {brain.activeAnomalies.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <AlertTriangle size={16} color="#FF4D4D" />
              <Text style={s.cardTitle}>Active Anomalies</Text>
            </View>
            {brain.activeAnomalies.map((anomaly) => (
              <View key={anomaly.id} style={s.brainInsightRow}>
                <View style={[s.brainInsightDot, { backgroundColor: '#FF4D4D' }]} />
                <View style={s.brainInsightInfo}>
                  <Text style={s.brainInsightTitle} numberOfLines={2}>{anomaly.title}</Text>
                  <Text style={s.brainInsightDesc} numberOfLines={3}>{anomaly.description}</Text>
                  <View style={s.brainInsightMeta}>
                    <View style={[s.brainConfBadge, { backgroundColor: IMPACT_STYLES[anomaly.impact]?.bg || '#eee' }]}>
                      <Text style={[s.brainConfText, { color: IMPACT_STYLES[anomaly.impact]?.text || '#999' }]}>
                        {IMPACT_STYLES[anomaly.impact]?.label || anomaly.impact}
                      </Text>
                    </View>
                    <Text style={s.brainConfPct}>{anomaly.confidence}% conf.</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {brain.activePredictions.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <TrendingUp size={16} color="#00C48C" />
              <Text style={s.cardTitle}>Predictions</Text>
            </View>
            {brain.activePredictions.map((pred) => (
              <View key={pred.id} style={s.brainInsightRow}>
                <View style={[s.brainInsightDot, { backgroundColor: '#00C48C' }]} />
                <View style={s.brainInsightInfo}>
                  <Text style={s.brainInsightTitle} numberOfLines={2}>{pred.title}</Text>
                  <Text style={s.brainInsightDesc} numberOfLines={3}>{pred.description}</Text>
                  <Text style={s.brainConfPct}>{pred.confidence}% confidence</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {brain.topRecommendations.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Lightbulb size={16} color="#FFB800" />
              <Text style={s.cardTitle}>Smart Recommendations</Text>
            </View>
            {brain.topRecommendations.map((rec, i) => (
              <View key={rec.id} style={s.brainRecRow}>
                <View style={[s.brainRecNum, { backgroundColor: IMPACT_STYLES[rec.impact]?.bg || '#eee' }]}>
                  <Text style={[s.brainRecNumText, { color: IMPACT_STYLES[rec.impact]?.text || '#999' }]}>
                    {i + 1}
                  </Text>
                </View>
                <View style={s.brainRecInfo}>
                  <Text style={s.brainRecTitle} numberOfLines={2}>{rec.title}</Text>
                  <Text style={s.brainRecDesc} numberOfLines={3}>{rec.description}</Text>
                  <View style={s.brainInsightMeta}>
                    <View style={[s.brainConfBadge, { backgroundColor: IMPACT_STYLES[rec.impact]?.bg || '#eee' }]}>
                      <Text style={[s.brainConfText, { color: IMPACT_STYLES[rec.impact]?.text || '#999' }]}>
                        {IMPACT_STYLES[rec.impact]?.label || rec.impact}
                      </Text>
                    </View>
                    <Text style={s.brainConfPct}>{rec.confidence}% conf.</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {brain.recentLearnings.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Brain size={16} color="#7B68EE" />
              <Text style={s.cardTitle}>Recent Learnings</Text>
              <Text style={s.cardSubtitle}>{brain.recentLearnings.length} active</Text>
            </View>
            {brain.recentLearnings.slice(0, 15).map((learning) => {
              const typeInfo = TYPE_ICONS[learning.type] || { icon: <Activity size={14} color="#97A0AF" />, color: '#97A0AF', label: learning.type };
              return (
                <View key={learning.id} style={s.brainLearningRow}>
                  <View style={[s.brainLearningIcon, { backgroundColor: typeInfo.color + '15' }]}>
                    {typeInfo.icon}
                  </View>
                  <View style={s.brainLearningInfo}>
                    <Text style={s.brainLearningTitle} numberOfLines={1}>{learning.title}</Text>
                    <View style={s.brainLearningMetaRow}>
                      <Text style={[s.brainLearningType, { color: typeInfo.color }]}>{typeInfo.label}</Text>
                      <Text style={s.brainLearningConf}>{learning.confidence}%</Text>
                      <Text style={s.brainLearningPts}>{learning.dataPoints} pts</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {brain.baselines && Object.keys(brain.baselines).length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <BarChart3 size={16} color="#4A90D9" />
              <Text style={s.cardTitle}>Behavior Baselines</Text>
            </View>
            {Object.entries(brain.baselines).map(([key, baseline]) => (
              <View key={key} style={s.brainBaselineRow}>
                <Text style={s.brainBaselineLabel}>{key.replace(/_/g, ' ')}</Text>
                <View style={s.brainBaselineValues}>
                  <Text style={s.brainBaselineAvg}>avg: {Math.round((baseline as any).avg)}</Text>
                  <Text style={s.brainBaselineRange}>
                    {Math.round((baseline as any).min)}-{Math.round((baseline as any).max)}
                  </Text>
                  <Text style={s.brainBaselineSamples}>{(baseline as any).samples} samples</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  const renderLiveTab = () => {
    if (liveLoading && !liveData && !liveError) {
      return (
        <View style={s.emptyWrap}>
          <Radio size={48} color={SS_BLUE} />
          <Text style={s.emptyTitle}>Connecting...</Text>
          <Text style={s.emptySubtitle}>Fetching real-time session data.</Text>
        </View>
      );
    }

    if (liveError && !liveData) {
      return (
        <View style={s.emptyWrap}>
          <View style={s.errorIcon}>
            <Radio size={48} color="#FF6B6B" />
          </View>
          <Text style={s.emptyTitle}>Connection Issue</Text>
          <Text style={s.emptySubtitle}>{liveError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchLiveSessions(true)}>
            <RefreshCw size={14} color="#000" />
            <Text style={s.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!liveData) {
      return (
        <View style={s.emptyWrap}>
          <Radio size={48} color="#97A0AF" />
          <Text style={s.emptyTitle}>No Live Data</Text>
          <Text style={s.emptySubtitle}>Live sessions will appear as visitors browse.</Text>
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
        case 0: return '#4A90D9';
        case 1: return '#FFD700';
        case 2: return '#00C48C';
        case 3: return '#27AE60';
        default: return '#5E6C84';
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
              <Clock size={12} color="#7B68EE" />
              <Text style={s.liveSubText}>{recent} in last 5m</Text>
            </View>
            <View style={s.liveSub}>
              <Users size={12} color="#4A90D9" />
              <Text style={s.liveSubText}>{sessions?.length || 0} sessions</Text>
            </View>
          </View>
        </View>

        {breakdown?.byStep?.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Target size={16} color={SS_BLUE} />
              <Text style={s.cardTitle}>Active by Step</Text>
            </View>
            <View style={s.liveStepGrid}>
              {breakdown.byStep.map((st: { step: string; count: number }, i: number) => {
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
              <Globe size={16} color="#00C48C" />
              <Text style={s.cardTitle}>Live by Country</Text>
            </View>
            {breakdown.byCountry.slice(0, 8).map((c: { country: string; count: number }, i: number) => (
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
            <Radio size={16} color="#FF4D4D" />
            <Text style={s.cardTitle}>Sessions ({sessions?.length || 0})</Text>
          </View>
          {(!sessions || sessions.length === 0) ? (
            <Text style={s.noDataText}>No active sessions right now.</Text>
          ) : (
            sessions.slice(0, 20).map((sess: any, i: number) => (
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
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="back-btn">
            <ArrowLeft size={20} color="#1B2A3D" />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Analytics</Text>
            <View style={s.liveBadge}>
              <View style={s.liveBadgeDot} />
              <Text style={s.liveBadgeText}>LIVE</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={s.refreshBtn}>
            <RefreshCw size={17} color="#5E6C84" />
          </TouchableOpacity>
        </Animated.View>

        <View style={s.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <TouchableOpacity
                key={tab.value}
                style={[s.tab, isActive && s.tabActive]}
                onPress={() => setActiveTab(tab.value)}
                activeOpacity={0.7}
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
          refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} tintColor={SS_BLUE} />}
          contentContainerStyle={s.scrollContent}
        >
          <View style={s.periodRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[s.periodChip, period === p.value && s.periodChipActive]}
                onPress={() => setPeriod(p.value)}
                activeOpacity={0.7}
              >
                <Text style={[s.periodText, period === p.value && s.periodTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'live' ? (
            renderLiveTab()
          ) : activeTab === 'brain' ? (
            renderBrainTab()
          ) : data ? (
            <>
              {activeTab === 'overview' && renderOverviewTab()}
              {activeTab === 'funnel' && renderFunnelTab()}
              {activeTab === 'geo' && renderGeoTab()}
              {activeTab === 'insights' && renderInsightsTab()}
            </>
          ) : analyticsQuery.isError ? (
            <View style={s.emptyWrap}>
              <View style={s.errorIcon}>
                <Activity size={40} color="#FF6B6B" />
              </View>
              <Text style={s.emptyTitle}>Failed to Load</Text>
              <Text style={s.emptySubtitle}>{analyticsQuery.error?.message || 'Pull down to retry.'}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={onRefresh}>
                <RefreshCw size={14} color="#000" />
                <Text style={s.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Activity size={40} color="#97A0AF" />
              <Text style={s.emptyTitle}>No Data Yet</Text>
              <Text style={s.emptySubtitle}>Check back after visitors start arriving.</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FC' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E5EC',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F3F8' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800' as const, color: '#1B2A3D', letterSpacing: -0.3 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SS_GREEN },
  liveBadgeText: { fontSize: 9, fontWeight: '800' as const, color: SS_GREEN, letterSpacing: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F3F8' },

  tabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, position: 'relative' as const },
  tabActive: {},
  tabText: { fontSize: 12, fontWeight: '600' as const, color: '#97A0AF' },
  tabTextActive: { color: SS_BLUE, fontWeight: '700' as const },
  tabIndicator: { position: 'absolute', bottom: 0, left: '20%' as any, right: '20%' as any, height: 2, backgroundColor: SS_BLUE, borderRadius: 1 },

  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },
  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  periodChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', borderWidth: 1, borderColor: '#E0E5EC' },
  periodChipActive: { backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: SS_BLUE + '50' },
  periodText: { fontSize: 12, fontWeight: '700' as const, color: '#97A0AF' },
  periodTextActive: { color: SS_BLUE },

  heroMetrics: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 16, overflow: 'hidden' },
  heroMetricMain: { flex: 1, padding: 20, alignItems: 'center', gap: 6 },
  heroMetricDivider: { width: 1, backgroundColor: '#E0E5EC', marginVertical: 12 },
  heroMetricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetricLabel: { fontSize: 12, fontWeight: '600' as const, color: '#5E6C84' },
  counterText: { fontSize: 32, fontWeight: '900' as const, color: '#1B2A3D', letterSpacing: -1 },

  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  trendText: { fontSize: 11, fontWeight: '700' as const },

  ringRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  ringCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E0E5EC', padding: 14, alignItems: 'center', gap: 8 },
  ringValue: { fontSize: 18, fontWeight: '900' as const, color: '#1B2A3D' },
  ringLabel: { fontSize: 9, fontWeight: '600' as const, color: '#97A0AF', letterSpacing: 0.5 },
  ringCardLabel: { fontSize: 11, fontWeight: '600' as const, color: '#5E6C84' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: '#1B2A3D' },
  cardSubtitle: { fontSize: 11, fontWeight: '600' as const, color: '#97A0AF' },
  cardBadge: { backgroundColor: SS_BLUE + '14', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardBadgeText: { fontSize: 10, fontWeight: '700' as const, color: SS_BLUE },

  sparkLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sparkLabel: { fontSize: 10, fontWeight: '600' as const, color: '#97A0AF' },

  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: { width: (SCREEN_W - 80) / 12 - 4, aspectRatio: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  heatmapHour: { fontSize: 8, fontWeight: '700' as const, color: '#97A0AF' },
  heatmapCount: { fontSize: 7, fontWeight: '800' as const, color: '#FFFFFF' },

  ctaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ctaCard: { flex: 1, minWidth: '43%' as any, backgroundColor: '#F7F9FC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E0E5EC', gap: 8 },
  ctaIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ctaValue: { fontSize: 24, fontWeight: '900' as const, color: '#1B2A3D' },
  ctaLabel: { fontSize: 11, fontWeight: '600' as const, color: '#5E6C84' },
  ctaBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  ctaBarFill: { height: 4, borderRadius: 2 },

  splitRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  splitCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E0E5EC' },

  miniListRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniLabel: { flex: 1, fontSize: 12, fontWeight: '600' as const, color: '#1B2A3D' },
  miniValue: { fontSize: 13, fontWeight: '800' as const, color: '#1B2A3D' },
  miniPct: { fontSize: 11, fontWeight: '700' as const, width: 36, textAlign: 'right' as const },
  miniRank: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  miniRankText: { fontSize: 10, fontWeight: '800' as const },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  eventRank: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  eventRankText: { fontSize: 10, fontWeight: '800' as const },
  eventInfo: { flex: 1, gap: 4 },
  eventName: { fontSize: 12, fontWeight: '600' as const, color: '#5E6C84', textTransform: 'capitalize' as const },
  eventBarBg: { height: 4, backgroundColor: '#EDF0F5', borderRadius: 2, overflow: 'hidden' },
  eventBar: { height: 4, borderRadius: 2 },
  eventCount: { width: 40, fontSize: 13, fontWeight: '800' as const, color: '#1B2A3D', textAlign: 'right' as const },

  funnelHero: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 16, alignItems: 'center', gap: 6 },
  funnelHeroTitle: { fontSize: 22, fontWeight: '900' as const, color: '#1B2A3D', letterSpacing: -0.3 },
  funnelHeroSub: { fontSize: 13, fontWeight: '600' as const, color: '#5E6C84' },

  funnelVisual: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 14, gap: 2 },
  funnelStepWrap: { gap: 4, marginBottom: 6 },
  funnelStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelBar: { height: 36, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12, minWidth: 50 },
  funnelBarText: { fontSize: 12, fontWeight: '800' as const, color: '#FFFFFF' },
  funnelPct: { fontSize: 13, fontWeight: '800' as const, color: '#1B2A3D', width: 40, textAlign: 'right' as const },
  funnelLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  funnelLabel: { fontSize: 11, fontWeight: '600' as const, color: '#5E6C84' },
  funnelDropoff: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFEBEE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  funnelDropoffText: { fontSize: 9, fontWeight: '700' as const, color: SS_RED },
  funnelConnector: { width: 1, height: 8, backgroundColor: '#E0E5EC', marginLeft: 20 },

  dropoffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dropoffIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dropoffInfo: { flex: 1, gap: 4 },
  dropoffLabel: { fontSize: 11, fontWeight: '600' as const, color: '#5E6C84' },
  dropoffBarBg: { height: 4, backgroundColor: '#EDF0F5', borderRadius: 2, overflow: 'hidden' },
  dropoffBarFill: { height: 4, borderRadius: 2 },
  dropoffStats: { alignItems: 'flex-end', width: 44 },
  dropoffValue: { fontSize: 13, fontWeight: '800' as const, color: SS_RED },
  dropoffPctText: { fontSize: 9, fontWeight: '600' as const, color: '#97A0AF' },

  geoKpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  geoKpiCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E0E5EC', borderTopWidth: 3, alignItems: 'center', gap: 6 },
  geoKpiValue: { fontSize: 24, fontWeight: '900' as const, color: '#1B2A3D' },
  geoKpiLabel: { fontSize: 10, fontWeight: '700' as const, color: '#5E6C84', textTransform: 'uppercase' as const, letterSpacing: 0.5 },

  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  geoFlag: { fontSize: 20, width: 28, textAlign: 'center' as const },
  geoInfo: { flex: 1, gap: 4 },
  geoTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  geoName: { fontSize: 13, fontWeight: '700' as const, color: '#1B2A3D' },
  geoPct: { fontSize: 11, fontWeight: '600' as const, color: '#97A0AF' },
  geoBarBg: { height: 5, backgroundColor: '#EDF0F5', borderRadius: 3, overflow: 'hidden' },
  geoBarFill: { height: 5, borderRadius: 3 },
  geoCount: { width: 36, fontSize: 14, fontWeight: '800' as const, color: '#1B2A3D', textAlign: 'right' as const },

  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  cityRank: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cityRankText: { fontSize: 11, fontWeight: '800' as const },
  cityInfo: { flex: 1, gap: 1 },
  cityName: { fontSize: 13, fontWeight: '700' as const, color: '#1B2A3D' },
  cityCountry: { fontSize: 10, fontWeight: '500' as const, color: '#97A0AF' },
  cityCount: { fontSize: 14, fontWeight: '800' as const, color: '#1B2A3D' },

  scoreHero: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 16, alignItems: 'center', gap: 10 },
  scoreBig: { fontSize: 36, fontWeight: '900' as const, lineHeight: 40 },
  scoreUnit: { fontSize: 12, fontWeight: '600' as const, color: '#97A0AF' },
  scoreTitle: { fontSize: 18, fontWeight: '800' as const, color: '#1B2A3D', marginTop: 4 },
  scoreDesc: { fontSize: 12, fontWeight: '500' as const, color: '#5E6C84', textAlign: 'center' as const },

  insightKpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  insightKpi: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E0E5EC', borderTopWidth: 3, alignItems: 'center', gap: 6 },
  insightKpiValue: { fontSize: 18, fontWeight: '900' as const, color: '#1B2A3D' },
  insightKpiLabel: { fontSize: 10, fontWeight: '600' as const, color: '#5E6C84' },

  intentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  intentDot: { width: 10, height: 10, borderRadius: 5 },
  intentInfo: { flex: 1, gap: 4 },
  intentTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  intentLabel: { fontSize: 13, fontWeight: '700' as const, color: '#1B2A3D' },
  intentPctText: { fontSize: 12, fontWeight: '700' as const, color: '#5E6C84' },
  intentBarBg: { height: 6, backgroundColor: '#EDF0F5', borderRadius: 3, overflow: 'hidden' },
  intentBarFill: { height: 6, borderRadius: 3 },
  intentCount: { width: 36, fontSize: 14, fontWeight: '800' as const, color: '#1B2A3D', textAlign: 'right' as const },

  deviceGrid: { flexDirection: 'row', gap: 10 },
  deviceCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E0E5EC', borderTopWidth: 3, alignItems: 'center', gap: 6 },
  deviceCount: { fontSize: 22, fontWeight: '900' as const, color: '#1B2A3D' },
  deviceLabel: { fontSize: 11, fontWeight: '600' as const, color: '#5E6C84' },
  devicePct: { fontSize: 13, fontWeight: '800' as const },

  liveHero: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 16, alignItems: 'center', gap: 8 },
  liveCount: { fontSize: 56, fontWeight: '900' as const, color: '#1B2A3D', letterSpacing: -2 },
  liveLabel: { fontSize: 14, fontWeight: '700' as const, color: '#5E6C84' },
  liveSubRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  liveSub: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveSubText: { fontSize: 12, fontWeight: '600' as const, color: '#97A0AF' },

  pulseWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  pulseDot: { width: 10, height: 10, borderRadius: 5 },

  liveStepGrid: { flexDirection: 'row', gap: 8 },
  liveStepCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E0E5EC', borderTopWidth: 3, alignItems: 'center', gap: 4 },
  liveStepCount: { fontSize: 22, fontWeight: '900' as const },
  liveStepLabel: { fontSize: 10, fontWeight: '600' as const, color: '#5E6C84' },

  sessionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  sessionInfo: { flex: 1, gap: 3 },
  sessionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionIP: { fontSize: 13, fontWeight: '800' as const, color: '#1B2A3D' },
  sessionBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  sessionBadgeText: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.3 },
  sessionDetail: { fontSize: 11, fontWeight: '600' as const, color: '#5E6C84' },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  sessionMeta: { fontSize: 10, fontWeight: '500' as const, color: '#97A0AF' },

  noDataText: { fontSize: 12, color: '#97A0AF', textAlign: 'center' as const, paddingVertical: 16, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800' as const, color: '#1B2A3D' },
  emptySubtitle: { fontSize: 13, color: '#5E6C84', textAlign: 'center' as const, lineHeight: 20, paddingHorizontal: 24 },
  errorIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFEBEE', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: SS_BLUE, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#FFFFFF' },

  brainHero: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, borderWidth: 1, borderColor: '#E0E5EC', marginBottom: 16, alignItems: 'center', gap: 10 },
  brainPulseOuter: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#00C48C18', alignItems: 'center', justifyContent: 'center' },
  brainPulseInner: { width: 20, height: 20, borderRadius: 10 },
  brainStatus: { fontSize: 22, fontWeight: '900' as const, color: '#1B2A3D', letterSpacing: -0.3 },
  brainCycles: { fontSize: 12, fontWeight: '600' as const, color: '#97A0AF' },

  brainKpiRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  brainKpiCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E0E5EC', borderTopWidth: 3, alignItems: 'center', gap: 4 },
  brainKpiValue: { fontSize: 20, fontWeight: '900' as const },
  brainKpiLabel: { fontSize: 10, fontWeight: '600' as const, color: '#5E6C84', textTransform: 'uppercase' as const, letterSpacing: 0.5 },

  trainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFB800', borderRadius: 14, paddingVertical: 14, marginBottom: 16 },
  trainBtnText: { fontSize: 14, fontWeight: '800' as const, color: '#000' },
  trainBadge: { backgroundColor: '#00000020', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  trainBadgeText: { fontSize: 11, fontWeight: '800' as const, color: '#000' },

  brainTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  brainTypeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brainTypeInfo: { flex: 1, gap: 4 },
  brainTypeLabel: { fontSize: 12, fontWeight: '700' as const, color: '#1B2A3D', textTransform: 'capitalize' as const },
  brainTypeBarBg: { height: 4, backgroundColor: '#EDF0F5', borderRadius: 2, overflow: 'hidden' },
  brainTypeBarFill: { height: 4, borderRadius: 2 },
  brainTypeCount: { fontSize: 14, fontWeight: '900' as const, width: 30, textAlign: 'right' as const },

  brainInsightRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  brainInsightDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  brainInsightInfo: { flex: 1, gap: 4 },
  brainInsightTitle: { fontSize: 13, fontWeight: '700' as const, color: '#1B2A3D', lineHeight: 18 },
  brainInsightDesc: { fontSize: 11, fontWeight: '500' as const, color: '#5E6C84', lineHeight: 16 },
  brainInsightMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  brainConfBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  brainConfText: { fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.3 },
  brainConfPct: { fontSize: 10, fontWeight: '600' as const, color: '#97A0AF' },

  brainRecRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  brainRecNum: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brainRecNumText: { fontSize: 12, fontWeight: '900' as const },
  brainRecInfo: { flex: 1, gap: 4 },
  brainRecTitle: { fontSize: 13, fontWeight: '700' as const, color: '#1B2A3D', lineHeight: 18 },
  brainRecDesc: { fontSize: 11, fontWeight: '500' as const, color: '#5E6C84', lineHeight: 16 },

  brainLearningRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  brainLearningIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brainLearningInfo: { flex: 1, gap: 2 },
  brainLearningTitle: { fontSize: 12, fontWeight: '600' as const, color: '#1B2A3D' },
  brainLearningMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brainLearningType: { fontSize: 10, fontWeight: '700' as const },
  brainLearningConf: { fontSize: 10, fontWeight: '600' as const, color: '#97A0AF' },
  brainLearningPts: { fontSize: 10, fontWeight: '500' as const, color: '#C0C7D3' },

  brainBaselineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EDF0F5' },
  brainBaselineLabel: { fontSize: 12, fontWeight: '700' as const, color: '#1B2A3D', textTransform: 'capitalize' as const, flex: 1 },
  brainBaselineValues: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brainBaselineAvg: { fontSize: 11, fontWeight: '700' as const, color: '#4A90D9' },
  brainBaselineRange: { fontSize: 10, fontWeight: '500' as const, color: '#97A0AF' },
  brainBaselineSamples: { fontSize: 10, fontWeight: '500' as const, color: '#C0C7D3' },
});
