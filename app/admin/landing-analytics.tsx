import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Eye,
  Users,
  MousePointer,
  TrendingUp,
  ArrowUpRight,
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
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';

type PeriodType = '1h' | '24h' | '7d' | '30d' | '90d' | 'all';
type TabType = 'overview' | 'geo' | 'insights';

const PERIODS: { label: string; value: PeriodType }[] = [
  { label: '1H', value: '1h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: 'All', value: 'all' },
];

const TABS: { label: string; value: TabType; icon: React.ReactNode }[] = [
  { label: 'Overview', value: 'overview', icon: <BarChart3 size={14} color={Colors.textSecondary} /> },
  { label: 'Geo Zones', value: 'geo', icon: <MapPin size={14} color={Colors.textSecondary} /> },
  { label: 'Smart Intel', value: 'insights', icon: <Brain size={14} color={Colors.textSecondary} /> },
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

const GEO_COLORS = ['#4A90D9', '#00C48C', '#FF6B6B', '#FFD700', '#7B68EE', '#E879F9', '#F97316', '#06B6D4', '#84CC16', '#EC4899'];

function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function LandingAnalyticsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodType>('30d');
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const analyticsQuery = trpc.analytics.getLandingAnalytics.useQuery(
    { period },
    { staleTime: 1000 * 30, refetchInterval: 1000 * 60 }
  );

  const utils = trpc.useUtils();

  const onRefresh = useCallback(() => {
    void utils.analytics.getLandingAnalytics.invalidate();
  }, [utils]);

  const data = analyticsQuery.data;

  const funnelSteps = data ? [
    { label: 'Page Views', count: data.funnel.pageViews, color: '#4A90D9', pct: 100 },
    { label: 'Scrolled 25%', count: data.funnel.scroll25, color: '#7B68EE', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll25 / data.funnel.pageViews) * 100) : 0 },
    { label: 'Scrolled 50%', count: data.funnel.scroll50, color: '#9B59B6', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll50 / data.funnel.pageViews) * 100) : 0 },
    { label: 'Scrolled 75%', count: data.funnel.scroll75, color: Colors.primary, pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.scroll75 / data.funnel.pageViews) * 100) : 0 },
    { label: 'Form Focused', count: data.funnel.formFocuses, color: '#00C48C', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.formFocuses / data.funnel.pageViews) * 100) : 0 },
    { label: 'Form Submitted', count: data.funnel.formSubmits, color: '#27AE60', pct: data.funnel.pageViews > 0 ? Math.round((data.funnel.formSubmits / data.funnel.pageViews) * 100) : 0 },
  ] : [];

  const maxHourly = data ? Math.max(...data.hourlyActivity.map(h => h.count), 1) : 1;

  const renderOverviewTab = () => {
    if (!data) return null;
    return (
      <>
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderLeftColor: '#4A90D9' }]}>
            <View style={[styles.kpiIcon, { backgroundColor: '#4A90D918' }]}>
              <Eye size={16} color="#4A90D9" />
            </View>
            <Text style={styles.kpiValue}>{data.pageViews.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Page Views</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#7B68EE' }]}>
            <View style={[styles.kpiIcon, { backgroundColor: '#7B68EE18' }]}>
              <Users size={16} color="#7B68EE" />
            </View>
            <Text style={styles.kpiValue}>{data.uniqueSessions.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Unique Visitors</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: '#27AE60' }]}>
            <View style={[styles.kpiIcon, { backgroundColor: '#27AE6018' }]}>
              <Target size={16} color="#27AE60" />
            </View>
            <Text style={styles.kpiValue}>{data.conversionRate}%</Text>
            <Text style={styles.kpiLabel}>Conversion</Text>
          </View>
          <View style={[styles.kpiCard, { borderLeftColor: Colors.primary }]}>
            <View style={[styles.kpiIcon, { backgroundColor: Colors.primary + '18' }]}>
              <MousePointer size={16} color={Colors.primary} />
            </View>
            <Text style={styles.kpiValue}>{data.funnel.formSubmits}</Text>
            <Text style={styles.kpiLabel}>Registrations</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <BarChart3 size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Conversion Funnel</Text>
          </View>
          {funnelSteps.map((step, i) => (
            <View key={i} style={styles.funnelRow}>
              <View style={styles.funnelLabelWrap}>
                <Text style={styles.funnelLabel}>{step.label}</Text>
                <Text style={styles.funnelPct}>{step.pct}%</Text>
              </View>
              <View style={styles.funnelBarBg}>
                <View style={[styles.funnelBar, { width: `${Math.max(step.pct, 2)}%` as any, backgroundColor: step.color }]} />
              </View>
              <Text style={styles.funnelCount}>{step.count.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Zap size={16} color="#FF6B6B" />
            <Text style={styles.cardTitle}>CTA Clicks</Text>
          </View>
          <View style={styles.ctaGrid}>
            {[
              { label: 'Get Started', count: data.cta.getStarted, icon: <ArrowUpRight size={14} color="#00C48C" />, color: '#00C48C' },
              { label: 'Sign In', count: data.cta.signIn, icon: <LogIn size={14} color="#4A90D9" />, color: '#4A90D9' },
              { label: 'JV Inquire', count: data.cta.jvInquire, icon: <TrendingUp size={14} color={Colors.primary} />, color: Colors.primary },
              { label: 'Website', count: data.cta.websiteClick, icon: <Globe size={14} color="#9B59B6" />, color: '#9B59B6' },
            ].map((cta, i) => (
              <View key={i} style={[styles.ctaItem, { borderColor: cta.color + '30' }]}>
                <View style={[styles.ctaIconWrap, { backgroundColor: cta.color + '15' }]}>
                  {cta.icon}
                </View>
                <Text style={styles.ctaCount}>{cta.count}</Text>
                <Text style={styles.ctaLabel}>{cta.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {data.dailyViews.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <TrendingUp size={16} color="#00C48C" />
              <Text style={styles.cardTitle}>Daily Views</Text>
            </View>
            <View style={styles.chartWrap}>
              {data.dailyViews.slice(-14).map((day, i) => {
                const maxViews = Math.max(...data.dailyViews.slice(-14).map(d => d.views), 1);
                const h = Math.max((day.views / maxViews) * 80, 3);
                const dateLabel = day.date.slice(5);
                return (
                  <View key={i} style={styles.chartCol}>
                    <Text style={styles.chartBarValue}>{day.views}</Text>
                    <View style={[styles.chartBar, { height: h, backgroundColor: day.views > 0 ? '#4A90D9' : Colors.surfaceBorder }]} />
                    <Text style={styles.chartLabel}>{dateLabel}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Clock size={16} color="#7B68EE" />
            <Text style={styles.cardTitle}>Hourly Activity</Text>
          </View>
          <View style={styles.hourlyWrap}>
            {data.hourlyActivity.map((h, i) => {
              const barH = Math.max((h.count / maxHourly) * 40, 2);
              return (
                <View key={i} style={styles.hourlyCol}>
                  <View style={[styles.hourlyBar, { height: barH, backgroundColor: h.count > 0 ? '#7B68EE' : Colors.surfaceBorder }]} />
                  {i % 4 === 0 && <Text style={styles.hourlyLabel}>{h.hour}h</Text>}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.rowCards}>
          <View style={[styles.halfCard]}>
            <View style={styles.cardHeader}>
              <Monitor size={16} color="#4A90D9" />
              <Text style={styles.cardTitle}>Platform</Text>
            </View>
            {data.byPlatform.length === 0 ? (
              <Text style={styles.noDataText}>No data yet</Text>
            ) : (
              data.byPlatform.map((p, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={styles.listDot}>
                    {p.platform === 'web' ? <Monitor size={12} color="#4A90D9" /> : <Smartphone size={12} color="#00C48C" />}
                  </View>
                  <Text style={styles.listLabel} numberOfLines={1}>{p.platform}</Text>
                  <Text style={styles.listValue}>{p.count}</Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.halfCard]}>
            <View style={styles.cardHeader}>
              <Globe size={16} color="#9B59B6" />
              <Text style={styles.cardTitle}>Referrer</Text>
            </View>
            {data.byReferrer.length === 0 ? (
              <Text style={styles.noDataText}>No data yet</Text>
            ) : (
              data.byReferrer.slice(0, 5).map((r, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={[styles.refDot, { backgroundColor: GEO_COLORS[i % GEO_COLORS.length] }]} />
                  <Text style={styles.listLabel} numberOfLines={1}>{r.referrer}</Text>
                  <Text style={styles.listValue}>{r.count}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Activity size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>All Events</Text>
          </View>
          {data.byEvent.map((evt, i) => {
            const maxEvt = data.byEvent[0]?.count || 1;
            const barPct = Math.round((evt.count / maxEvt) * 100);
            return (
              <View key={i} style={styles.eventRow}>
                <Text style={styles.eventName}>{evt.event.replace(/_/g, ' ')}</Text>
                <View style={styles.eventBarBg}>
                  <View style={[styles.eventBar, { width: `${Math.max(barPct, 3)}%` as any }]} />
                </View>
                <Text style={styles.eventCount}>{evt.count}</Text>
              </View>
            );
          })}
          {data.byEvent.length === 0 && (
            <Text style={styles.noDataText}>No events tracked yet. Data will appear as visitors interact with the landing page.</Text>
          )}
        </View>
      </>
    );
  };

  const renderGeoTab = () => {
    if (!data) return null;
    const geo = data.geoZones;

    if (!geo || (geo.byCountry.length === 0 && geo.byCity.length === 0)) {
      return (
        <View style={styles.emptyWrap}>
          <MapPin size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Geo Data Yet</Text>
          <Text style={styles.emptySubtitle}>
            Location tracking is now active. As visitors arrive from different locations, their geo data will appear here. GPS zone data will build up over time.
          </Text>
        </View>
      );
    }

    const maxCountry = geo.byCountry[0]?.count || 1;
    const maxCity = geo.byCity[0]?.count || 1;

    return (
      <>
        <View style={styles.geoSummaryRow}>
          <View style={[styles.geoSummaryCard, { borderLeftColor: '#4A90D9' }]}>
            <Globe size={18} color="#4A90D9" />
            <Text style={styles.geoSummaryValue}>{geo.byCountry.length}</Text>
            <Text style={styles.geoSummaryLabel}>Countries</Text>
          </View>
          <View style={[styles.geoSummaryCard, { borderLeftColor: '#00C48C' }]}>
            <MapPin size={18} color="#00C48C" />
            <Text style={styles.geoSummaryValue}>{geo.byCity.length}</Text>
            <Text style={styles.geoSummaryLabel}>Cities</Text>
          </View>
          <View style={[styles.geoSummaryCard, { borderLeftColor: '#7B68EE' }]}>
            <Crosshair size={18} color="#7B68EE" />
            <Text style={styles.geoSummaryValue}>{geo.totalWithGeo}</Text>
            <Text style={styles.geoSummaryLabel}>Tracked</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Globe size={16} color="#4A90D9" />
            <Text style={styles.cardTitle}>Top Countries</Text>
          </View>
          {geo.byCountry.map((c, i) => {
            const barW = Math.max(Math.round((c.count / maxCountry) * 100), 3);
            const flag = COUNTRY_FLAGS[c.country] || '🌍';
            return (
              <View key={i} style={styles.geoRow}>
                <Text style={styles.geoFlag}>{flag}</Text>
                <View style={styles.geoLabelWrap}>
                  <Text style={styles.geoLabel} numberOfLines={1}>{c.country}</Text>
                  <Text style={styles.geoPct}>{c.pct}%</Text>
                </View>
                <View style={styles.geoBarBg}>
                  <View style={[styles.geoBar, { width: `${barW}%` as any, backgroundColor: GEO_COLORS[i % GEO_COLORS.length] }]} />
                </View>
                <Text style={styles.geoCount}>{c.count}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MapPin size={16} color="#00C48C" />
            <Text style={styles.cardTitle}>Top Cities</Text>
          </View>
          {geo.byCity.map((c, i) => {
            const barW = Math.max(Math.round((c.count / maxCity) * 100), 3);
            return (
              <View key={i} style={styles.geoRow}>
                <View style={[styles.cityDot, { backgroundColor: GEO_COLORS[i % GEO_COLORS.length] }]} />
                <View style={styles.geoLabelWrap}>
                  <Text style={styles.geoLabel} numberOfLines={1}>{c.city}</Text>
                  <Text style={styles.geoSubLabel}>{c.country}</Text>
                </View>
                <View style={styles.geoBarBg}>
                  <View style={[styles.geoBar, { width: `${barW}%` as any, backgroundColor: GEO_COLORS[i % GEO_COLORS.length] + '90' }]} />
                </View>
                <Text style={styles.geoCount}>{c.count}</Text>
              </View>
            );
          })}
        </View>

        {geo.byRegion.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Target size={16} color="#FF6B6B" />
              <Text style={styles.cardTitle}>Top Regions / States</Text>
            </View>
            {geo.byRegion.slice(0, 10).map((r, i) => (
              <View key={i} style={styles.regionRow}>
                <View style={[styles.regionRank, { backgroundColor: GEO_COLORS[i % GEO_COLORS.length] + '20' }]}>
                  <Text style={[styles.regionRankText, { color: GEO_COLORS[i % GEO_COLORS.length] }]}>{i + 1}</Text>
                </View>
                <Text style={styles.regionName} numberOfLines={1}>{r.region}</Text>
                <Text style={styles.regionPct}>{r.pct}%</Text>
                <Text style={styles.regionCount}>{r.count}</Text>
              </View>
            ))}
          </View>
        )}

        {geo.byTimezone.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Clock size={16} color="#FFD700" />
              <Text style={styles.cardTitle}>Visitor Timezones</Text>
            </View>
            {geo.byTimezone.slice(0, 8).map((tz, i) => (
              <View key={i} style={styles.listRow}>
                <View style={[styles.tzDot, { backgroundColor: GEO_COLORS[i % GEO_COLORS.length] }]} />
                <Text style={styles.listLabel} numberOfLines={1}>{tz.timezone.replace(/_/g, ' ')}</Text>
                <Text style={styles.listValue}>{tz.count}</Text>
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
        <View style={styles.emptyWrap}>
          <Brain size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>Smart Insights Loading</Text>
          <Text style={styles.emptySubtitle}>As more data is collected, intelligent analysis will be generated here.</Text>
        </View>
      );
    }

    const engagementColor = insights.engagementScore >= 60 ? '#00C48C' : insights.engagementScore >= 30 ? '#FFD700' : '#FF6B6B';

    return (
      <>
        <View style={styles.insightScoreCard}>
          <View style={styles.insightScoreHeader}>
            <Brain size={20} color={engagementColor} />
            <Text style={styles.insightScoreTitle}>Engagement Score</Text>
          </View>
          <View style={styles.insightScoreRow}>
            <Text style={[styles.insightScoreBig, { color: engagementColor }]}>{insights.engagementScore}</Text>
            <Text style={[styles.insightScoreMax, { color: engagementColor }]}>/100</Text>
          </View>
          <View style={styles.insightScoreBarBg}>
            <View style={[styles.insightScoreBar, { width: `${insights.engagementScore}%` as any, backgroundColor: engagementColor }]} />
          </View>
          <Text style={styles.insightScoreDesc}>
            Based on scroll depth, CTA clicks, and form submissions
          </Text>
        </View>

        <View style={styles.insightMetricRow}>
          <View style={[styles.insightMetricCard, { borderTopColor: '#4A90D9' }]}>
            <Timer size={16} color="#4A90D9" />
            <Text style={styles.insightMetricValue}>{formatSeconds(insights.avgTimeOnPage)}</Text>
            <Text style={styles.insightMetricLabel}>Avg Time on Page</Text>
          </View>
          <View style={[styles.insightMetricCard, { borderTopColor: '#FF6B6B' }]}>
            <Percent size={16} color="#FF6B6B" />
            <Text style={styles.insightMetricValue}>{insights.bounceRate}%</Text>
            <Text style={styles.insightMetricLabel}>Bounce Rate</Text>
          </View>
          <View style={[styles.insightMetricCard, { borderTopColor: '#FFD700' }]}>
            <Clock size={16} color="#FFD700" />
            <Text style={styles.insightMetricValue}>{insights.peakHour}:00</Text>
            <Text style={styles.insightMetricLabel}>Peak Hour</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Flame size={16} color="#FF6B6B" />
            <Text style={styles.cardTitle}>Visitor Intent Breakdown</Text>
          </View>
          {[
            { label: 'High Intent', desc: 'Submitted form', count: insights.visitorIntent.highIntent, pct: insights.visitorIntent.highIntentPct, color: '#00C48C' },
            { label: 'Medium Intent', desc: 'Clicked CTA', count: insights.visitorIntent.mediumIntent, pct: insights.visitorIntent.mediumIntentPct, color: '#FFD700' },
            { label: 'Low Intent', desc: 'Browsed only', count: insights.visitorIntent.lowIntent, pct: insights.visitorIntent.lowIntentPct, color: '#FF6B6B' },
          ].map((intent, i) => (
            <View key={i} style={styles.intentRow}>
              <View style={[styles.intentDot, { backgroundColor: intent.color }]} />
              <View style={styles.intentLabelWrap}>
                <Text style={styles.intentLabel}>{intent.label}</Text>
                <Text style={styles.intentDesc}>{intent.desc}</Text>
              </View>
              <View style={styles.intentBarBg}>
                <View style={[styles.intentBar, { width: `${Math.max(intent.pct, 2)}%` as any, backgroundColor: intent.color }]} />
              </View>
              <View style={styles.intentStats}>
                <Text style={styles.intentCount}>{intent.count}</Text>
                <Text style={styles.intentPct}>{intent.pct}%</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Activity size={16} color="#7B68EE" />
            <Text style={styles.cardTitle}>Content Interaction</Text>
          </View>
          {[
            { label: 'Scrolled past 50%', count: insights.contentInteraction.scrolledPast50Pct, color: '#7B68EE' },
            { label: 'Scrolled past 75%', count: insights.contentInteraction.scrolledPast75Pct, color: '#9B59B6' },
            { label: 'Interacted with form', count: insights.contentInteraction.interactedWithForm, color: '#00C48C' },
            { label: 'Submitted form', count: insights.contentInteraction.submittedForm, color: '#27AE60' },
            { label: 'Clicked any CTA', count: insights.contentInteraction.clickedAnyCta, color: '#4A90D9' },
          ].map((item, i) => {
            const maxVal = Math.max(
              insights.contentInteraction.scrolledPast50Pct,
              insights.contentInteraction.clickedAnyCta,
              1
            );
            const barPct = Math.max(Math.round((item.count / maxVal) * 100), 3);
            return (
              <View key={i} style={styles.contentRow}>
                <View style={[styles.contentDot, { backgroundColor: item.color }]} />
                <Text style={styles.contentLabel}>{item.label}</Text>
                <View style={styles.contentBarBg}>
                  <View style={[styles.contentBar, { width: `${barPct}%` as any, backgroundColor: item.color }]} />
                </View>
                <Text style={styles.contentCount}>{item.count}</Text>
              </View>
            );
          })}
        </View>

        {insights.topInterests.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Target size={16} color="#00C48C" />
              <Text style={styles.cardTitle}>Investment Interest</Text>
            </View>
            {insights.topInterests.map((interest, i) => (
              <View key={i} style={styles.interestRow}>
                <View style={[styles.interestRank, { backgroundColor: GEO_COLORS[i % GEO_COLORS.length] + '20' }]}>
                  <Text style={[styles.interestRankText, { color: GEO_COLORS[i % GEO_COLORS.length] }]}>{i + 1}</Text>
                </View>
                <Text style={styles.interestName} numberOfLines={1}>{interest.interest.replace(/_/g, ' ')}</Text>
                <Text style={styles.interestPct}>{interest.pct}%</Text>
                <Text style={styles.interestCount}>{interest.count}</Text>
              </View>
            ))}
          </View>
        )}

        {insights.deviceBreakdown.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Smartphone size={16} color="#E879F9" />
              <Text style={styles.cardTitle}>Device Breakdown</Text>
            </View>
            <View style={styles.deviceGrid}>
              {insights.deviceBreakdown.map((d, i) => {
                return (
                  <View key={i} style={[styles.deviceCard, { borderColor: GEO_COLORS[i % GEO_COLORS.length] + '30' }]}>
                    {d.device === 'Mobile' ? <Smartphone size={20} color={GEO_COLORS[i % GEO_COLORS.length]} /> :
                      d.device === 'Tablet' ? <Tablet size={20} color={GEO_COLORS[i % GEO_COLORS.length]} /> :
                      <Monitor size={20} color={GEO_COLORS[i % GEO_COLORS.length]} />}
                    <Text style={styles.deviceCount}>{d.count}</Text>
                    <Text style={styles.deviceLabel}>{d.device}</Text>
                    <Text style={[styles.devicePct, { color: GEO_COLORS[i % GEO_COLORS.length] }]}>{d.pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {insights.sectionEngagement.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Eye size={16} color="#F97316" />
              <Text style={styles.cardTitle}>Section Engagement</Text>
            </View>
            {insights.sectionEngagement.map((s, i) => (
              <View key={i} style={styles.listRow}>
                <View style={[styles.sectionDot, { backgroundColor: GEO_COLORS[i % GEO_COLORS.length] }]} />
                <Text style={styles.listLabel} numberOfLines={1}>{s.section.replace(/_/g, ' ')}</Text>
                <Text style={styles.listValue}>{s.count}</Text>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Landing Analytics</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <RefreshCw size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.value}
              style={[styles.tabChip, activeTab === tab.value && styles.tabChipActive]}
              onPress={() => setActiveTab(tab.value)}
              activeOpacity={0.7}
            >
              {tab.icon}
              <Text style={[styles.tabText, activeTab === tab.value && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={analyticsQuery.isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.periodChip, period === p.value && styles.periodChipActive]}
                onPress={() => setPeriod(p.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.periodText, period === p.value && styles.periodTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {analyticsQuery.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading analytics...</Text>
            </View>
          ) : !data ? (
            <View style={styles.emptyWrap}>
              <Activity size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Data Yet</Text>
              <Text style={styles.emptySubtitle}>Landing page tracking will start collecting data from today. Check back soon!</Text>
            </View>
          ) : (
            <>
              {activeTab === 'overview' && renderOverviewTab()}
              {activeTab === 'geo' && renderGeoTab()}
              {activeTab === 'insights' && renderInsightsTab()}
            </>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Tracking Active</Text>
            <Text style={styles.infoText}>
              Real-time tracking with GPS zone detection is enabled. Events recorded: page views, scroll depth, form interactions, CTA clicks, referrer sources, visitor location, and device info. Data refreshes every 60 seconds.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#27AE6018',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27AE60',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800' as const,
    color: '#27AE60',
    letterSpacing: 0.8,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  tabChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tabChipActive: {
    backgroundColor: '#0D1B2A',
    borderColor: '#1E3A5F',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: '#4A90D9',
  },
  scrollContent: {
    padding: 16,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
  },
  periodChipActive: {
    backgroundColor: Colors.primary + '18',
    borderColor: Colors.primary + '50',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  periodTextActive: {
    color: Colors.primary,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%' as any,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderLeftWidth: 3,
    gap: 6,
  },
  kpiIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: Colors.text,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  funnelRow: {
    marginBottom: 10,
  },
  funnelLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  funnelLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  funnelPct: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  funnelBarBg: {
    height: 8,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  funnelBar: {
    height: 8,
    borderRadius: 4,
  },
  funnelCount: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
    textAlign: 'right' as const,
  },
  ctaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ctaItem: {
    flex: 1,
    minWidth: '42%' as any,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  ctaIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaCount: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: Colors.text,
  },
  ctaLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 110,
    gap: 2,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  chartBarValue: {
    fontSize: 8,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  chartBar: {
    width: '70%' as any,
    borderRadius: 3,
    minHeight: 3,
  },
  chartLabel: {
    fontSize: 8,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  hourlyWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 1,
  },
  hourlyCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  hourlyBar: {
    width: '80%' as any,
    borderRadius: 2,
    minHeight: 2,
  },
  hourlyLabel: {
    fontSize: 8,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  rowCards: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  halfCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  noDataText: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: 12,
    lineHeight: 18,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  listDot: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  listValue: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  eventName: {
    width: 110,
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'capitalize' as const,
  },
  eventBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  eventBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  eventCount: {
    width: 40,
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'right' as const,
  },
  infoCard: {
    backgroundColor: Colors.primary + '0C',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    marginBottom: 12,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  geoSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  geoSummaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderLeftWidth: 3,
    alignItems: 'center',
    gap: 6,
  },
  geoSummaryValue: {
    fontSize: 22,
    fontWeight: '900' as const,
    color: Colors.text,
  },
  geoSummaryLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  geoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  geoFlag: {
    fontSize: 18,
    width: 26,
    textAlign: 'center' as const,
  },
  geoLabelWrap: {
    width: 100,
  },
  geoLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  geoPct: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
  },
  geoSubLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  geoBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  geoBar: {
    height: 8,
    borderRadius: 4,
  },
  geoCount: {
    width: 36,
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'right' as const,
  },
  cityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder + '50',
  },
  regionRank: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regionRankText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  regionName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  regionPct: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    width: 40,
    textAlign: 'right' as const,
  },
  regionCount: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.text,
    width: 36,
    textAlign: 'right' as const,
  },
  tzDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  insightScoreCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 14,
    alignItems: 'center',
    gap: 10,
  },
  insightScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insightScoreTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  insightScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  insightScoreBig: {
    fontSize: 52,
    fontWeight: '900' as const,
    lineHeight: 56,
  },
  insightScoreMax: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 8,
    opacity: 0.5,
  },
  insightScoreBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  insightScoreBar: {
    height: 8,
    borderRadius: 4,
  },
  insightScoreDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
  },
  insightMetricRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  insightMetricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderTopWidth: 3,
    alignItems: 'center',
    gap: 6,
  },
  insightMetricValue: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: Colors.text,
  },
  insightMetricLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  intentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  intentLabelWrap: {
    width: 90,
  },
  intentLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  intentDesc: {
    fontSize: 9,
    color: Colors.textTertiary,
  },
  intentBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  intentBar: {
    height: 8,
    borderRadius: 4,
  },
  intentStats: {
    alignItems: 'flex-end',
    width: 44,
  },
  intentCount: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  intentPct: {
    fontSize: 9,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  contentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  contentLabel: {
    width: 130,
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  contentBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  contentBar: {
    height: 6,
    borderRadius: 3,
  },
  contentCount: {
    width: 36,
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'right' as const,
  },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder + '50',
  },
  interestRank: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestRankText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  interestName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.text,
    textTransform: 'capitalize' as const,
  },
  interestPct: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
    width: 40,
    textAlign: 'right' as const,
  },
  interestCount: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.text,
    width: 32,
    textAlign: 'right' as const,
  },
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  deviceCard: {
    flex: 1,
    minWidth: '28%' as any,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  deviceCount: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: Colors.text,
  },
  deviceLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  devicePct: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
});
