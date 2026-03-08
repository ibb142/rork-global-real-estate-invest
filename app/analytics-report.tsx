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
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { useInstantCache } from '@/lib/use-instant-query';

type PeriodType = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';
type TabType = 'overview' | 'funnel' | 'geo' | 'insights' | 'live';

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

  const headerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, tension: 40, friction: 10, useNativeDriver: true }).start();
  }, [headerAnim]);

  const analyticsQuery = trpc.analytics.getLandingAnalytics.useQuery(
    { period },
    {
      staleTime: 0,
      refetchInterval: activeTab === 'live' ? 5000 : 1000 * 8,
      retry: 5,
      retryDelay: (attempt) => Math.min(500 * Math.pow(2, attempt), 5000),
      placeholderData: (prev) => prev,
      gcTime: 1000 * 60 * 10,
    }
  );

  useEffect(() => {
    if (analyticsQuery.data) {
      console.log('[Analytics] Data received:', {
        period,
        pageViews: analyticsQuery.data.pageViews,
        uniqueSessions: analyticsQuery.data.uniqueSessions,
        totalEvents: analyticsQuery.data.totalEvents,
        funnel: analyticsQuery.data.funnel,
        liveActive: analyticsQuery.data.liveData?.active ?? 0,
        liveSessions: analyticsQuery.data.liveData?.sessions?.length ?? 0,
      });
    }
    if (analyticsQuery.error) {
      console.error('[Analytics] Query error:', analyticsQuery.error.message);
    }
  }, [analyticsQuery.data, analyticsQuery.error, period]);

  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const utils = trpc.useUtils();
  const onRefresh = useCallback(async () => {
    setManualRefreshing(true);
    await utils.analytics.getLandingAnalytics.invalidate();
    setManualRefreshing(false);
  }, [utils]);

  const rawData = useInstantCache(`analytics_report_${period}`, analyticsQuery.data, analyticsQuery.isSuccess);
  const data = useMemo(() => {
    if (rawData && rawData.pageViews === 0 && rawData.uniqueSessions === 0 && rawData.totalEvents === 0) {
      console.log('[Analytics] Received empty data, checking if query has better data...');
      if (analyticsQuery.data && (analyticsQuery.data.pageViews > 0 || analyticsQuery.data.uniqueSessions > 0)) {
        return analyticsQuery.data;
      }
    }
    return rawData;
  }, [rawData, analyticsQuery.data]);

  const liveData = useMemo(() => {
    if (data?.liveData) return data.liveData;
    return null;
  }, [data]);
  const liveLoading = analyticsQuery.isLoading && !data;
  const liveError: string | null = null;

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
    return data.hourlyActivity.map((h: any) => h.count);
  }, [data]);

  const dailyData = useMemo(() => {
    if (!data) return [];
    return data.dailyViews.slice(-14).map((d: any) => d.views);
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
              <Eye size={18} color={BLUE} />
              <Text style={s.heroMetricLabel}>Total Views</Text>
            </View>
            <AnimatedCounter value={totalViews} />
          </View>
          <View style={s.heroMetricDivider} />
          <View style={s.heroMetricMain}>
            <View style={s.heroMetricHeader}>
              <Users size={18} color={PURPLE} />
              <Text style={s.heroMetricLabel}>Unique Visitors</Text>
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
              data.byPlatform.map((p: any, i: number) => (
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
              data.byReferrer.slice(0, 5).map((r: any, i: number) => (
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
          {data.byEvent.slice(0, 10).map((evt: any, i: number) => {
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
          {geo.byCountry.map((c: any, i: number) => {
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
          {geo.byCity.slice(0, 10).map((c: any, i: number) => (
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
            {geo.byTimezone.slice(0, 8).map((tz: any, i: number) => (
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
              {insights.deviceBreakdown.map((d: any, i: number) => (
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
            {insights.topInterests.map((interest: any, i: number) => (
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
    if (liveLoading && !liveData && !liveError) {
      return (
        <View style={s.emptyWrap}>
          <Radio size={48} color={BLUE} />
          <Text style={s.emptyTitle}>Connecting...</Text>
          <Text style={s.emptySubtitle}>Fetching real-time session data.</Text>
        </View>
      );
    }

    if (!liveData) {
      if (analyticsQuery.isError) {
        return (
          <View style={s.emptyWrap}>
            <View style={s.errorIcon}>
              <Radio size={48} color={RED} />
            </View>
            <Text style={s.emptyTitle}>Connection Issue</Text>
            <Text style={s.emptySubtitle}>{analyticsQuery.error?.message || 'Unable to fetch live data'}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={onRefresh}>
              <RefreshCw size={14} color="#000" />
              <Text style={s.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={s.emptyWrap}>
          <Radio size={48} color={Colors.textTertiary} />
          <Text style={s.emptyTitle}>No Live Data</Text>
          <Text style={s.emptySubtitle}>Live sessions will appear as visitors browse your landing page.</Text>
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
              <Globe size={16} color={GREEN} />
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
            <Radio size={16} color={RED} />
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
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="analytics-back-btn">
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Analytics</Text>
            <View style={s.liveBadge}>
              <View style={s.liveBadgeDot} />
              <Text style={s.liveBadgeText}>LIVE</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={s.refreshBtn} testID="analytics-refresh-btn">
            <RefreshCw size={17} color={Colors.textSecondary} />
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
              {activeTab === 'overview' && renderOverviewTab()}
              {activeTab === 'funnel' && renderFunnelTab()}
              {activeTab === 'geo' && renderGeoTab()}
              {activeTab === 'insights' && renderInsightsTab()}
            </>
          ) : analyticsQuery.isError ? (
            <View style={s.emptyWrap}>
              <View style={s.errorIcon}>
                <Activity size={40} color={RED} />
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
              <Sparkles size={40} color={Colors.textTertiary} />
              <Text style={s.emptyTitle}>Loading Analytics...</Text>
              <Text style={s.emptySubtitle}>Fetching your real-time data.</Text>
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
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GREEN + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  liveBadgeText: { fontSize: 9, fontWeight: '800' as const, color: GREEN, letterSpacing: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSecondary },

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

  heroMetrics: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 16, overflow: 'hidden' },
  heroMetricMain: { flex: 1, padding: 20, alignItems: 'center', gap: 6 },
  heroMetricDivider: { width: 1, backgroundColor: Colors.surfaceBorder, marginVertical: 12 },
  heroMetricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetricLabel: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary },
  counterText: { fontSize: 32, fontWeight: '900' as const, color: Colors.text, letterSpacing: -1 },

  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  trendText: { fontSize: 11, fontWeight: '700' as const },

  ringRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  ringCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.surfaceBorder, padding: 14, alignItems: 'center', gap: 8 },
  ringValue: { fontSize: 18, fontWeight: '900' as const, color: Colors.text },
  ringLabel: { fontSize: 9, fontWeight: '600' as const, color: Colors.textTertiary, letterSpacing: 0.5 },
  ringCardLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },

  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.surfaceBorder, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: Colors.text },
  cardSubtitle: { fontSize: 11, fontWeight: '600' as const, color: Colors.textTertiary },
  cardBadge: { backgroundColor: BLUE + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardBadgeText: { fontSize: 10, fontWeight: '700' as const, color: BLUE },

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
  funnelDropoff: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: RED + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  funnelDropoffText: { fontSize: 9, fontWeight: '700' as const, color: RED },
  funnelConnector: { width: 1, height: 8, backgroundColor: Colors.surfaceBorder, marginLeft: 20 },

  dropoffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dropoffIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dropoffInfo: { flex: 1, gap: 4 },
  dropoffLabel: { fontSize: 11, fontWeight: '600' as const, color: Colors.textSecondary },
  dropoffBarBg: { height: 4, backgroundColor: Colors.backgroundSecondary, borderRadius: 2, overflow: 'hidden' },
  dropoffBarFill: { height: 4, borderRadius: 2 },
  dropoffStats: { alignItems: 'flex-end', width: 44 },
  dropoffValue: { fontSize: 13, fontWeight: '800' as const, color: RED },
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
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  sessionMeta: { fontSize: 10, fontWeight: '500' as const, color: Colors.textTertiary },

  noDataText: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center' as const, paddingVertical: 16, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800' as const, color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' as const, lineHeight: 20, paddingHorizontal: 24 },
  errorIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: RED + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#000' },
});
