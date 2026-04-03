import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Target,
  Globe,
  Filter,
  TrendingUp,
  Users,
  Shield,
  Zap,
  MapPin,
  DollarSign,
  Eye,
  MousePointer,
  BarChart3,
  Copy,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Link,
  Lock,
  Unlock,
  Radio,
  Crosshair,
  Activity,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

type TabType = 'dashboard' | 'audience' | 'filters' | 'utm' | 'keywords' | 'rules';

interface TrafficSource {
  id: string;
  name: string;
  icon: string;
  sessions: number;
  conversions: number;
  cpl: number;
  quality: 'high' | 'medium' | 'low';
  enabled: boolean;
  color: string;
}

interface AudienceRule {
  id: string;
  type: 'age' | 'income' | 'interest' | 'location' | 'behavior';
  label: string;
  value: string;
  active: boolean;
}

interface TrafficFilter {
  id: string;
  name: string;
  description: string;
  active: boolean;
  blocked: number;
  severity: 'critical' | 'high' | 'medium';
}

interface UTMLink {
  id: string;
  name: string;
  source: string;
  medium: string;
  campaign: string;
  clicks: number;
  conversions: number;
  url: string;
}

interface Keyword {
  id: string;
  term: string;
  volume: number;
  competition: 'low' | 'medium' | 'high';
  cpc: number;
  active: boolean;
  platform: 'google' | 'meta' | 'both';
}

interface TrafficRule {
  id: string;
  name: string;
  condition: string;
  action: 'allow' | 'block' | 'redirect';
  hits: number;
  active: boolean;
}

const TRAFFIC_SOURCES: TrafficSource[] = [
  { id: '1', name: 'Google Ads', icon: 'G', sessions: 12840, conversions: 312, cpl: 18.50, quality: 'high', enabled: true, color: '#4285F4' },
  { id: '2', name: 'Meta Ads', icon: 'M', sessions: 9210, conversions: 198, cpl: 24.10, quality: 'high', enabled: true, color: '#1877F2' },
  { id: '3', name: 'Organic Search', icon: 'O', sessions: 7430, conversions: 241, cpl: 0, quality: 'high', enabled: true, color: Colors.positive },
  { id: '4', name: 'Referral', icon: 'R', sessions: 3820, conversions: 94, cpl: 8.20, quality: 'medium', enabled: true, color: Colors.accent },
  { id: '5', name: 'TikTok Ads', icon: 'T', sessions: 5610, conversions: 87, cpl: 31.40, quality: 'medium', enabled: false, color: '#FF0050' },
  { id: '6', name: 'Email', icon: 'E', sessions: 2940, conversions: 118, cpl: 3.10, quality: 'high', enabled: true, color: Colors.warning },
  { id: '7', name: 'Direct', icon: 'D', sessions: 4120, conversions: 156, cpl: 0, quality: 'high', enabled: true, color: '#9B59B6' },
];

const AUDIENCE_RULES: AudienceRule[] = [
  { id: '1', type: 'age', label: 'Age Range', value: '28-55 years old', active: true },
  { id: '2', type: 'income', label: 'Household Income', value: '$75K+ per year', active: true },
  { id: '3', type: 'interest', label: 'Interest: Real Estate', value: 'Property investment, REITs, Rental income', active: true },
  { id: '4', type: 'interest', label: 'Interest: Finance', value: 'Stock market, Passive income, Wealth building', active: true },
  { id: '5', type: 'location', label: 'Geo Target', value: 'USA, Canada, UK, Australia', active: true },
  { id: '6', type: 'behavior', label: 'Behavior: Investors', value: 'Searched investment apps last 30 days', active: true },
  { id: '7', type: 'behavior', label: 'Lookalike: Top Investors', value: '2% lookalike of top 500 investors', active: false },
  { id: '8', type: 'income', label: 'Net Worth Signal', value: '$200K+ net worth indicators', active: false },
];

const TRAFFIC_FILTERS: TrafficFilter[] = [
  { id: '1', name: 'Bot Traffic Blocker', description: 'Block automated bot visits and fake clicks', active: true, blocked: 8420, severity: 'critical' },
  { id: '2', name: 'VPN / Proxy Filter', description: 'Block users hiding behind VPN or proxies', active: true, blocked: 3210, severity: 'high' },
  { id: '3', name: 'Click Fraud Protection', description: 'Detect and block fraudulent ad clicks', active: true, blocked: 1840, severity: 'critical' },
  { id: '4', name: 'Low-Quality Traffic', description: 'Block traffic with bounce rate > 95%', active: true, blocked: 5670, severity: 'high' },
  { id: '5', name: 'Competitor Blocking', description: 'Block traffic from known competitor domains', active: false, blocked: 320, severity: 'medium' },
  { id: '6', name: 'Geo Restriction', description: 'Block countries with 0% conversion history', active: true, blocked: 12300, severity: 'medium' },
  { id: '7', name: 'Duplicate IP Filter', description: 'Limit same IP to 3 sessions per day', active: true, blocked: 2100, severity: 'medium' },
];

const UTM_LINKS: UTMLink[] = [
  { id: '1', name: 'Google RE Investors', source: 'google', medium: 'cpc', campaign: 'real_estate_investors_q1', clicks: 4820, conversions: 143, url: 'https://ipxholding.com?utm_source=google&utm_medium=cpc&utm_campaign=real_estate_investors_q1' },
  { id: '2', name: 'Meta High Income', source: 'meta', medium: 'paid_social', campaign: 'high_income_investors', clicks: 3140, conversions: 89, url: 'https://ipxholding.com?utm_source=meta&utm_medium=paid_social&utm_campaign=high_income_investors' },
  { id: '3', name: 'Instagram Stories', source: 'instagram', medium: 'story_ad', campaign: 'fractional_re_story', clicks: 2210, conversions: 54, url: 'https://ipxholding.com?utm_source=instagram&utm_medium=story_ad&utm_campaign=fractional_re_story' },
  { id: '4', name: 'Email Blast Jan', source: 'email', medium: 'newsletter', campaign: 'january_opportunities', clicks: 1890, conversions: 76, url: 'https://ipxholding.com?utm_source=email&utm_medium=newsletter&utm_campaign=january_opportunities' },
];

const KEYWORDS: Keyword[] = [
  { id: '1', term: 'real estate investment app', volume: 40500, competition: 'high', cpc: 8.40, active: true, platform: 'both' },
  { id: '2', term: 'fractional real estate investing', volume: 22100, competition: 'medium', cpc: 6.20, active: true, platform: 'google' },
  { id: '3', term: 'invest in real estate with 100 dollars', volume: 18300, competition: 'low', cpc: 4.80, active: true, platform: 'google' },
  { id: '4', term: 'passive income real estate', volume: 60500, competition: 'high', cpc: 7.90, active: true, platform: 'both' },
  { id: '5', term: 'real estate crowdfunding platform', volume: 14800, competition: 'medium', cpc: 5.60, active: true, platform: 'google' },
  { id: '6', term: 'best real estate investment apps 2025', volume: 9900, competition: 'medium', cpc: 6.10, active: false, platform: 'google' },
  { id: '7', term: 'property investment for beginners', volume: 33100, competition: 'medium', cpc: 5.20, active: true, platform: 'both' },
  { id: '8', term: 'monthly dividend real estate', volume: 12400, competition: 'low', cpc: 4.30, active: false, platform: 'meta' },
];

const TRAFFIC_RULES: TrafficRule[] = [
  { id: '1', name: 'Premium Investor Fast Track', condition: 'Income signal > $150K AND interest = real_estate', action: 'allow', hits: 1840, active: true },
  { id: '2', name: 'Block Low-Intent Searches', condition: 'Keyword contains "free" OR "no money"', action: 'block', hits: 3210, active: true },
  { id: '3', name: 'Accredited Investor Redirect', condition: 'Query param accredited=true', action: 'redirect', hits: 420, active: true },
  { id: '4', name: 'Block Competitor Keywords', condition: 'Referring keyword contains competitor name', action: 'block', hits: 890, active: false },
  { id: '5', name: 'High Value Audience Boost', condition: 'Lookalike score > 85%', action: 'allow', hits: 2140, active: true },
];

const formatNumber = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
};

export default function TrafficControlCenter() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [sources, setSources] = useState<TrafficSource[]>(TRAFFIC_SOURCES);
  const [audienceRules, setAudienceRules] = useState<AudienceRule[]>(AUDIENCE_RULES);
  const [filters, setFilters] = useState<TrafficFilter[]>(TRAFFIC_FILTERS);
  const [keywords, setKeywords] = useState<Keyword[]>(KEYWORDS);
  const [rules, setRules] = useState<TrafficRule[]>(TRAFFIC_RULES);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [pulseAnim] = useState(new Animated.Value(1));

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const totalSessions = useMemo(() => sources.filter(s => s.enabled).reduce((a, s) => a + s.sessions, 0), [sources]);
  const totalConversions = useMemo(() => sources.filter(s => s.enabled).reduce((a, s) => a + s.conversions, 0), [sources]);
  const conversionRate = useMemo(() => ((totalConversions / totalSessions) * 100).toFixed(2), [totalConversions, totalSessions]);
  const totalBlocked = useMemo(() => filters.filter(f => f.active).reduce((a, f) => a + f.blocked, 0), [filters]);
  const avgCPL = useMemo(() => {
    const paid = sources.filter(s => s.enabled && s.cpl > 0);
    if (!paid.length) return 0;
    return paid.reduce((a, s) => a + s.cpl, 0) / paid.length;
  }, [sources]);

  const toggleSource = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
    console.log('[Traffic Control] Toggled source:', id);
  }, []);

  const toggleAudience = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAudienceRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  }, []);

  const toggleFilter = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilters(prev => prev.map(f => f.id === id ? { ...f, active: !f.active } : f));
  }, []);

  const toggleKeyword = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setKeywords(prev => prev.map(k => k.id === id ? { ...k, active: !k.active } : k));
  }, []);

  const toggleRule = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  }, []);

  const addKeyword = useCallback(() => {
    if (!newKeyword.trim()) return;
    const kw: Keyword = {
      id: `kw-${Date.now()}`,
      term: newKeyword.trim(),
      volume: 0,
      competition: 'medium',
      cpc: 0,
      active: true,
      platform: 'both',
    };
    setKeywords(prev => [kw, ...prev]);
    setNewKeyword('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [newKeyword]);

  const copyUTM = useCallback(async (link: UTMLink) => {
    try {
      const { safeSetString: safeCopy } = await import('@/lib/safe-clipboard');
      await safeCopy(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Traffic Control] Copied UTM:', link.url);
    } catch {
      Alert.alert('Copied!', link.url);
    }
  }, []);

  const getQualityColor = (q: TrafficSource['quality']) => {
    if (q === 'high') return Colors.positive;
    if (q === 'medium') return Colors.warning;
    return Colors.negative;
  };

  const getCompColor = (c: Keyword['competition']) => {
    if (c === 'low') return Colors.positive;
    if (c === 'medium') return Colors.warning;
    return Colors.negative;
  };

  const getActionColor = (a: TrafficRule['action']) => {
    if (a === 'allow') return Colors.positive;
    if (a === 'block') return Colors.negative;
    return Colors.accent;
  };

  const getSeverityColor = (s: TrafficFilter['severity']) => {
    if (s === 'critical') return Colors.negative;
    if (s === 'high') return Colors.warning;
    return Colors.accent;
  };

  const getAudienceTypeIcon = (type: AudienceRule['type']) => {
    switch (type) {
      case 'age': return '👤';
      case 'income': return '💰';
      case 'interest': return '❤️';
      case 'location': return '📍';
      case 'behavior': return '🎯';
    }
  };

  const renderDashboard = () => (
    <View style={styles.tabContent}>
      <View style={styles.heroMetrics}>
        <View style={[styles.heroCard, { borderColor: Colors.positive + '40' }]}>
          <Animated.View style={[styles.liveIndicator, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.liveDot} />
          </Animated.View>
          <Text style={styles.heroValue}>{formatNumber(totalSessions)}</Text>
          <Text style={styles.heroLabel}>Live Sessions</Text>
          <Text style={styles.heroSub}>Last 30 days</Text>
        </View>
        <View style={[styles.heroCard, { borderColor: Colors.primary + '40' }]}>
          <View style={[styles.heroIconBg, { backgroundColor: Colors.primary + '20' }]}>
            <Target size={18} color={Colors.primary} />
          </View>
          <Text style={styles.heroValue}>{formatNumber(totalConversions)}</Text>
          <Text style={styles.heroLabel}>Conversions</Text>
          <Text style={[styles.heroSub, { color: Colors.positive }]}>{conversionRate}% rate</Text>
        </View>
        <View style={[styles.heroCard, { borderColor: Colors.negative + '40' }]}>
          <View style={[styles.heroIconBg, { backgroundColor: Colors.negative + '20' }]}>
            <Shield size={18} color={Colors.negative} />
          </View>
          <Text style={styles.heroValue}>{formatNumber(totalBlocked)}</Text>
          <Text style={styles.heroLabel}>Blocked</Text>
          <Text style={styles.heroSub}>Bad traffic</Text>
        </View>
        <View style={[styles.heroCard, { borderColor: Colors.accent + '40' }]}>
          <View style={[styles.heroIconBg, { backgroundColor: Colors.accent + '20' }]}>
            <DollarSign size={18} color={Colors.accent} />
          </View>
          <Text style={styles.heroValue}>${avgCPL.toFixed(0)}</Text>
          <Text style={styles.heroLabel}>Avg CPL</Text>
          <Text style={styles.heroSub}>Cost per lead</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Traffic Sources</Text>
      {sources.map(source => (
        <View key={source.id} style={[styles.sourceCard, !source.enabled && styles.sourceCardDisabled]}>
          <View style={[styles.sourceIcon, { backgroundColor: source.color + '20' }]}>
            <Text style={[styles.sourceIconText, { color: source.color }]}>{source.icon}</Text>
          </View>
          <View style={styles.sourceInfo}>
            <View style={styles.sourceRow}>
              <Text style={[styles.sourceName, !source.enabled && styles.dimText]}>{source.name}</Text>
              <View style={[styles.qualityBadge, { backgroundColor: getQualityColor(source.quality) + '20' }]}>
                <Text style={[styles.qualityText, { color: getQualityColor(source.quality) }]}>{source.quality}</Text>
              </View>
            </View>
            <View style={styles.sourceMetrics}>
              <View style={styles.sourceMetric}>
                <Eye size={11} color={Colors.textTertiary} />
                <Text style={styles.sourceMetricText}>{formatNumber(source.sessions)}</Text>
              </View>
              <View style={styles.sourceMetric}>
                <MousePointer size={11} color={Colors.textTertiary} />
                <Text style={styles.sourceMetricText}>{source.conversions} conv</Text>
              </View>
              {source.cpl > 0 && (
                <View style={styles.sourceMetric}>
                  <DollarSign size={11} color={Colors.textTertiary} />
                  <Text style={styles.sourceMetricText}>${source.cpl} CPL</Text>
                </View>
              )}
            </View>
          </View>
          <Switch
            value={source.enabled}
            onValueChange={() => toggleSource(source.id)}
            trackColor={{ false: Colors.surfaceBorder, true: Colors.positive + '60' }}
            thumbColor={source.enabled ? Colors.positive : Colors.textTertiary}
          />
        </View>
      ))}

      <View style={styles.conversionBar}>
        <View style={styles.conversionBarHeader}>
          <Text style={styles.conversionBarTitle}>Traffic Quality Score</Text>
          <Text style={[styles.conversionBarValue, { color: Colors.positive }]}>87/100</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: '87%' }]} />
        </View>
        <Text style={styles.conversionBarNote}>You're blocking 31% of low-quality traffic — excellent targeting</Text>
      </View>
    </View>
  );

  const renderAudience = () => (
    <View style={styles.tabContent}>
      <View style={styles.audienceHero}>
        <View style={styles.audienceHeroLeft}>
          <Crosshair size={22} color={Colors.primary} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.audienceHeroTitle}>Audience Targeting</Text>
            <Text style={styles.audienceHeroSub}>Define exactly WHO sees your ads</Text>
          </View>
        </View>
        <View style={styles.audienceHeroBadge}>
          <Text style={styles.audienceHeroBadgeText}>{audienceRules.filter(r => r.active).length} Active</Text>
        </View>
      </View>

      <View style={styles.audienceStats}>
        <View style={styles.audienceStat}>
          <Text style={styles.audienceStatValue}>1.2M</Text>
          <Text style={styles.audienceStatLabel}>Addressable</Text>
        </View>
        <View style={styles.audienceStatDivider} />
        <View style={styles.audienceStat}>
          <Text style={[styles.audienceStatValue, { color: Colors.primary }]}>284K</Text>
          <Text style={styles.audienceStatLabel}>Filtered Target</Text>
        </View>
        <View style={styles.audienceStatDivider} />
        <View style={styles.audienceStat}>
          <Text style={[styles.audienceStatValue, { color: Colors.positive }]}>76%</Text>
          <Text style={styles.audienceStatLabel}>Match Rate</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Targeting Rules</Text>
      {audienceRules.map(rule => (
        <View key={rule.id} style={[styles.ruleCard, !rule.active && styles.ruleCardOff]}>
          <Text style={styles.ruleEmoji}>{getAudienceTypeIcon(rule.type)}</Text>
          <View style={styles.ruleInfo}>
            <View style={styles.ruleRow}>
              <Text style={[styles.ruleLabel, !rule.active && styles.dimText]}>{rule.label}</Text>
              <View style={[styles.typeBadge, { backgroundColor: Colors.accent + '20' }]}>
                <Text style={[styles.typeBadgeText, { color: Colors.accent }]}>{rule.type}</Text>
              </View>
            </View>
            <Text style={[styles.ruleValue, !rule.active && styles.dimText]}>{rule.value}</Text>
          </View>
          <Switch
            value={rule.active}
            onValueChange={() => toggleAudience(rule.id)}
            trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + '60' }}
            thumbColor={rule.active ? Colors.primary : Colors.textTertiary}
          />
        </View>
      ))}

      <TouchableOpacity
        style={styles.addRuleButton}
        onPress={() => Alert.alert('Add Rule', 'Custom audience rule builder coming soon. You can target by age, income, interests, location, and behavior patterns.')}
      >
        <Plus size={18} color={Colors.primary} />
        <Text style={styles.addRuleText}>Add Targeting Rule</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFilters = () => (
    <View style={styles.tabContent}>
      <View style={styles.filterHero}>
        <Shield size={24} color={Colors.negative} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.filterHeroTitle}>Traffic Filters</Text>
          <Text style={styles.filterHeroSub}>Blocking {formatNumber(totalBlocked)} low-quality visits</Text>
        </View>
        <View style={[styles.filterHeroBadge, { backgroundColor: Colors.negative + '20' }]}>
          <Text style={[styles.filterHeroBadgeText, { color: Colors.negative }]}>
            {filters.filter(f => f.active).length}/{filters.length} ON
          </Text>
        </View>
      </View>

      {filters.map(filter => (
        <View key={filter.id} style={[styles.filterCard, !filter.active && styles.ruleCardOff]}>
          <View style={styles.filterCardTop}>
            <View style={[styles.severityDot, { backgroundColor: getSeverityColor(filter.severity) }]} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.filterName, !filter.active && styles.dimText]}>{filter.name}</Text>
              <Text style={styles.filterDesc}>{filter.description}</Text>
            </View>
            <Switch
              value={filter.active}
              onValueChange={() => toggleFilter(filter.id)}
              trackColor={{ false: Colors.surfaceBorder, true: Colors.negative + '60' }}
              thumbColor={filter.active ? Colors.negative : Colors.textTertiary}
            />
          </View>
          <View style={styles.filterStats}>
            <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(filter.severity) + '15' }]}>
              <Text style={[styles.severityText, { color: getSeverityColor(filter.severity) }]}>{filter.severity}</Text>
            </View>
            <Text style={styles.filterBlocked}>
              {formatNumber(filter.blocked)} blocked
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.filterSummary}>
        <AlertTriangle size={16} color={Colors.warning} />
        <Text style={styles.filterSummaryText}>
          Turn off filters carefully. Unfiltered traffic increases cost per acquisition by up to 3x.
        </Text>
      </View>
    </View>
  );

  const renderUTM = () => (
    <View style={styles.tabContent}>
      <View style={styles.utmHero}>
        <Link size={22} color={Colors.accent} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.utmHeroTitle}>UTM Campaign Builder</Text>
          <Text style={styles.utmHeroSub}>Track every click from every source</Text>
        </View>
      </View>

      <View style={styles.utmStats}>
        <View style={styles.utmStat}>
          <Text style={styles.utmStatValue}>{new Intl.NumberFormat('en-US').format(UTM_LINKS.reduce((a, l) => a + l.clicks, 0))}</Text>
          <Text style={styles.utmStatLabel}>Total Clicks</Text>
        </View>
        <View style={styles.utmStatDivider} />
        <View style={styles.utmStat}>
          <Text style={[styles.utmStatValue, { color: Colors.positive }]}>{UTM_LINKS.reduce((a, l) => a + l.conversions, 0)}</Text>
          <Text style={styles.utmStatLabel}>Conversions</Text>
        </View>
        <View style={styles.utmStatDivider} />
        <View style={styles.utmStat}>
          <Text style={styles.utmStatValue}>{UTM_LINKS.length}</Text>
          <Text style={styles.utmStatLabel}>Active Links</Text>
        </View>
      </View>

      {UTM_LINKS.map(link => (
        <View key={link.id} style={styles.utmCard}>
          <View style={styles.utmCardHeader}>
            <Text style={styles.utmName}>{link.name}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, copiedId === link.id && styles.copyBtnDone]}
              onPress={() => copyUTM(link)}
            >
              {copiedId === link.id ? (
                <CheckCircle size={14} color={Colors.positive} />
              ) : (
                <Copy size={14} color={Colors.textSecondary} />
              )}
              <Text style={[styles.copyBtnText, copiedId === link.id && { color: Colors.positive }]}>
                {copiedId === link.id ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.utmTags}>
            <View style={styles.utmTag}><Text style={styles.utmTagText}>src: {link.source}</Text></View>
            <View style={styles.utmTag}><Text style={styles.utmTagText}>med: {link.medium}</Text></View>
            <View style={[styles.utmTag, { backgroundColor: Colors.primary + '15' }]}>
              <Text style={[styles.utmTagText, { color: Colors.primary }]}>camp: {link.campaign}</Text>
            </View>
          </View>
          <View style={styles.utmMetrics}>
            <View style={styles.utmMetric}>
              <MousePointer size={12} color={Colors.textTertiary} />
              <Text style={styles.utmMetricText}>{new Intl.NumberFormat('en-US').format(link.clicks)} clicks</Text>
            </View>
            <View style={styles.utmMetric}>
              <Target size={12} color={Colors.positive} />
              <Text style={[styles.utmMetricText, { color: Colors.positive }]}>{link.conversions} conv</Text>
            </View>
            <View style={styles.utmMetric}>
              <BarChart3 size={12} color={Colors.accent} />
              <Text style={[styles.utmMetricText, { color: Colors.accent }]}>
                {((link.conversions / link.clicks) * 100).toFixed(1)}% CVR
              </Text>
            </View>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.addRuleButton}
        onPress={() => Alert.alert('New UTM Link', 'UTM link generator: Set source, medium, and campaign name. The link will auto-track all traffic to that specific campaign.')}
      >
        <Plus size={18} color={Colors.accent} />
        <Text style={[styles.addRuleText, { color: Colors.accent }]}>Create UTM Link</Text>
      </TouchableOpacity>
    </View>
  );

  const renderKeywords = () => (
    <View style={styles.tabContent}>
      <View style={styles.keywordHero}>
        <Zap size={22} color={Colors.primary} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.keywordHeroTitle}>Keyword Targeting</Text>
          <Text style={styles.keywordHeroSub}>Control which searches find your ads</Text>
        </View>
      </View>

      <View style={styles.keywordAddRow}>
        <TextInput
          style={styles.keywordInput}
          value={newKeyword}
          onChangeText={setNewKeyword}
          placeholder="Add keyword, e.g. real estate app..."
          placeholderTextColor={Colors.textTertiary}
          onSubmitEditing={addKeyword}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.keywordAddBtn} onPress={addKeyword}>
          <Plus size={18} color={Colors.black} />
        </TouchableOpacity>
      </View>

      <View style={styles.keywordStatsRow}>
        <Text style={styles.keywordStatsText}>
          <Text style={{ color: Colors.positive }}>{keywords.filter(k => k.active).length}</Text> active ·{' '}
          <Text style={{ color: Colors.textTertiary }}>{keywords.filter(k => !k.active).length}</Text> paused
        </Text>
        <Text style={styles.keywordStatsText}>
          {formatNumber(keywords.filter(k => k.active).reduce((a, k) => a + k.volume, 0))} monthly searches
        </Text>
      </View>

      {keywords.map(kw => (
        <View key={kw.id} style={[styles.keywordCard, !kw.active && styles.ruleCardOff]}>
          <View style={styles.keywordCardLeft}>
            <Switch
              value={kw.active}
              onValueChange={() => toggleKeyword(kw.id)}
              trackColor={{ false: Colors.surfaceBorder, true: Colors.primary + '60' }}
              thumbColor={kw.active ? Colors.primary : Colors.textTertiary}
            />
          </View>
          <View style={styles.keywordInfo}>
            <Text style={[styles.keywordTerm, !kw.active && styles.dimText]}>{kw.term}</Text>
            <View style={styles.keywordMeta}>
              <Text style={styles.keywordVolume}>{formatNumber(kw.volume)}/mo</Text>
              <View style={[styles.compBadge, { backgroundColor: getCompColor(kw.competition) + '20' }]}>
                <Text style={[styles.compText, { color: getCompColor(kw.competition) }]}>{kw.competition}</Text>
              </View>
              <Text style={styles.keywordCpc}>${kw.cpc} CPC</Text>
              <View style={[styles.platformBadge, { backgroundColor: Colors.surfaceBorder }]}>
                <Text style={styles.platformBadgeText}>{kw.platform}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setKeywords(prev => prev.filter(k => k.id !== kw.id));
            }}
          >
            <Trash2 size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );

  const renderRules = () => (
    <View style={styles.tabContent}>
      <View style={styles.rulesHero}>
        <Radio size={22} color={Colors.positive} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.rulesHeroTitle}>Traffic Rules Engine</Text>
          <Text style={styles.rulesHeroSub}>Automate who gets in and who gets blocked</Text>
        </View>
      </View>

      <View style={styles.rulesLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.positive }]} />
          <Text style={styles.legendText}>Allow</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.negative }]} />
          <Text style={styles.legendText}>Block</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
          <Text style={styles.legendText}>Redirect</Text>
        </View>
      </View>

      {rules.map(rule => (
        <View key={rule.id} style={[styles.ruleEngineCard, !rule.active && styles.ruleCardOff]}>
          <View style={styles.ruleEngineHeader}>
            <View style={[styles.actionBadge, { backgroundColor: getActionColor(rule.action) + '20' }]}>
              {rule.action === 'allow' ? (
                <Unlock size={12} color={getActionColor(rule.action)} />
              ) : rule.action === 'block' ? (
                <Lock size={12} color={getActionColor(rule.action)} />
              ) : (
                <ChevronRight size={12} color={getActionColor(rule.action)} />
              )}
              <Text style={[styles.actionBadgeText, { color: getActionColor(rule.action) }]}>
                {rule.action.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.ruleHits}>{formatNumber(rule.hits)} hits</Text>
            <Switch
              value={rule.active}
              onValueChange={() => toggleRule(rule.id)}
              trackColor={{ false: Colors.surfaceBorder, true: Colors.positive + '60' }}
              thumbColor={rule.active ? Colors.positive : Colors.textTertiary}
            />
          </View>
          <Text style={[styles.ruleName, !rule.active && styles.dimText]}>{rule.name}</Text>
          <View style={styles.conditionBadge}>
            <Activity size={11} color={Colors.textTertiary} />
            <Text style={styles.conditionText}>{rule.condition}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.addRuleButton}
        onPress={() => Alert.alert('New Rule', 'Build a custom traffic rule using conditions like keyword, geography, device type, referral source, or user behavior. Set action to Allow, Block, or Redirect.')}
      >
        <Plus size={18} color={Colors.positive} />
        <Text style={[styles.addRuleText, { color: Colors.positive }]}>Add Traffic Rule</Text>
      </TouchableOpacity>

      <View style={styles.ruleEngineNote}>
        <Zap size={14} color={Colors.primary} />
        <Text style={styles.ruleEngineNoteText}>
          Rules fire in order. The first matching rule wins. Drag to reorder priority.
        </Text>
      </View>
    </View>
  );

  const TABS = [
    { key: 'dashboard' as TabType, label: 'Sources', icon: BarChart3 },
    { key: 'audience' as TabType, label: 'Audience', icon: Users },
    { key: 'filters' as TabType, label: 'Filters', icon: Shield },
    { key: 'utm' as TabType, label: 'UTM', icon: Link },
    { key: 'keywords' as TabType, label: 'Keywords', icon: Target },
    { key: 'rules' as TabType, label: 'Rules', icon: Radio },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Traffic Control</Text>
          <View style={styles.liveTag}>
            <View style={styles.liveDotSmall} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>
        </View>
        <View style={[styles.scoreTag, { backgroundColor: Colors.positive + '20' }]}>
          <Text style={[styles.scoreTagText, { color: Colors.positive }]}>87%</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(tab => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <IconComp size={15} color={isActive ? Colors.black : Colors.textSecondary} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPadding}>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'audience' && renderAudience()}
        {activeTab === 'filters' && renderFilters()}
        {activeTab === 'utm' && renderUTM()}
        {activeTab === 'keywords' && renderKeywords()}
        {activeTab === 'rules' && renderRules()}
        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.text },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.positive + '20',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.positive },
  liveTagText: { fontSize: 10, fontWeight: '700' as const, color: Colors.positive },
  scoreTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scoreTagText: { fontSize: 13, fontWeight: '700' as const },

  tabBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600' as const, color: Colors.textSecondary },
  tabTextActive: { color: Colors.black },

  content: { flex: 1 },
  contentPadding: { padding: 16 },
  tabContent: { gap: 12 },

  heroMetrics: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  heroCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  liveIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.positive + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.positive },
  heroIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroValue: { fontSize: 16, fontWeight: '800' as const, color: Colors.text },
  heroLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  heroSub: { fontSize: 10, color: Colors.textTertiary, marginTop: 1 },

  sectionTitle: { fontSize: 15, fontWeight: '700' as const, color: Colors.text, marginTop: 4, marginBottom: 2 },

  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  sourceCardDisabled: { opacity: 0.5 },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceIconText: { fontSize: 16, fontWeight: '800' as const },
  sourceInfo: { flex: 1 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sourceName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text },
  qualityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  qualityText: { fontSize: 10, fontWeight: '700' as const },
  sourceMetrics: { flexDirection: 'row', gap: 10 },
  sourceMetric: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sourceMetricText: { fontSize: 11, color: Colors.textTertiary },
  dimText: { color: Colors.textTertiary },

  conversionBar: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  conversionBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  conversionBarTitle: { fontSize: 14, fontWeight: '600' as const, color: Colors.text },
  conversionBarValue: { fontSize: 14, fontWeight: '700' as const },
  barBg: { height: 8, backgroundColor: Colors.surfaceBorder, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: Colors.positive, borderRadius: 4 },
  conversionBarNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 8, lineHeight: 17 },

  audienceHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  audienceHeroLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  audienceHeroTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  audienceHeroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  audienceHeroBadge: {
    backgroundColor: Colors.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  audienceHeroBadgeText: { fontSize: 13, fontWeight: '700' as const, color: Colors.primary },

  audienceStats: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  audienceStat: { flex: 1, alignItems: 'center' },
  audienceStatValue: { fontSize: 18, fontWeight: '800' as const, color: Colors.text },
  audienceStatLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  audienceStatDivider: { width: 1, backgroundColor: Colors.border },

  ruleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  ruleCardOff: { opacity: 0.5 },
  ruleEmoji: { fontSize: 20 },
  ruleInfo: { flex: 1 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  ruleLabel: { fontSize: 13, fontWeight: '600' as const, color: Colors.text },
  ruleValue: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  typeBadgeText: { fontSize: 10, fontWeight: '600' as const },

  addRuleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: 12,
    paddingVertical: 14,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addRuleText: { fontSize: 14, fontWeight: '600' as const, color: Colors.primary },

  filterHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.negative + '10',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.negative + '30',
  },
  filterHeroTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  filterHeroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  filterHeroBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  filterHeroBadgeText: { fontSize: 12, fontWeight: '700' as const },

  filterCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterCardTop: { flexDirection: 'row', alignItems: 'center' },
  severityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  filterName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, marginBottom: 2 },
  filterDesc: { fontSize: 12, color: Colors.textSecondary },
  filterStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  severityText: { fontSize: 11, fontWeight: '700' as const },
  filterBlocked: { fontSize: 12, color: Colors.textSecondary },

  filterSummary: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.warning + '10',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
    marginTop: 4,
  },
  filterSummaryText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  utmHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  utmHeroTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  utmHeroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  utmStats: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  utmStat: { flex: 1, alignItems: 'center' },
  utmStatValue: { fontSize: 18, fontWeight: '800' as const, color: Colors.text },
  utmStatLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  utmStatDivider: { width: 1, backgroundColor: Colors.border },

  utmCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  utmCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  utmName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, flex: 1 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  copyBtnDone: { backgroundColor: Colors.positive + '20' },
  copyBtnText: { fontSize: 12, fontWeight: '600' as const, color: Colors.textSecondary },
  utmTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  utmTag: {
    backgroundColor: Colors.surfaceBorder,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  utmTagText: { fontSize: 11, color: Colors.textSecondary },
  utmMetrics: { flexDirection: 'row', gap: 14 },
  utmMetric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  utmMetricText: { fontSize: 12, color: Colors.textSecondary },

  keywordHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  keywordHeroTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  keywordHeroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  keywordAddRow: { flexDirection: 'row', gap: 10 },
  keywordInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  keywordAddBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  keywordStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  keywordStatsText: { fontSize: 12, color: Colors.textSecondary },

  keywordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  keywordCardLeft: {},
  keywordInfo: { flex: 1 },
  keywordTerm: { fontSize: 13, fontWeight: '600' as const, color: Colors.text, marginBottom: 5 },
  keywordMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  keywordVolume: { fontSize: 11, color: Colors.textSecondary },
  compBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  compText: { fontSize: 10, fontWeight: '700' as const },
  keywordCpc: { fontSize: 11, color: Colors.textSecondary },
  platformBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  platformBadgeText: { fontSize: 10, color: Colors.textTertiary },

  rulesHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rulesHeroTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.text },
  rulesHeroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  rulesLegend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: Colors.textSecondary },

  ruleEngineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  ruleEngineHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionBadgeText: { fontSize: 11, fontWeight: '700' as const },
  ruleHits: { flex: 1, fontSize: 12, color: Colors.textTertiary },
  ruleName: { fontSize: 14, fontWeight: '600' as const, color: Colors.text },
  conditionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  conditionText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },

  ruleEngineNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: Colors.primary + '10',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
    marginTop: 4,
  },
  ruleEngineNoteText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  bottomPad: { height: 40 },
});
