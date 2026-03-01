import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Search,
  Filter,
  MapPin,
  Smartphone,
  Globe,
  TrendingUp,
  DollarSign,
  Users,
  Target,
  Clock,
  ChevronRight,
  Zap,
  BarChart3,
  Eye,
  UserCheck,
  AlertCircle,
  Star,
  Building2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

type FilterType = 'all' | 'google' | 'meta' | 'new' | 'qualified';
type LeadStatus = 'hot' | 'warm' | 'cold' | 'converted';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: 'google' | 'meta' | 'organic' | 'referral';
  searchQuery: string;
  keyword: string;
  campaign: string;
  location: string;
  device: 'mobile' | 'desktop' | 'tablet';
  age: string;
  incomeSignal: string;
  status: LeadStatus;
  score: number;
  signedUp: boolean;
  investmentInterest: string;
  timeAgo: string;
  adGroup: string;
  matchType: string;
}

const LEADS: Lead[] = [
  {
    id: '1',
    name: 'James Harrington',
    email: 'j.harrington@gmail.com',
    source: 'google',
    searchQuery: 'best real estate investment app 2025',
    keyword: 'real estate investment app',
    campaign: 'RE Investors Q1 2025',
    location: 'Miami, FL',
    device: 'mobile',
    age: '35-44',
    incomeSignal: '$100K-$150K',
    status: 'hot',
    score: 94,
    signedUp: true,
    investmentInterest: 'Fractional RE, Passive Income',
    timeAgo: '12 min ago',
    adGroup: 'High Intent Investors',
    matchType: 'Exact Match',
  },
  {
    id: '2',
    name: 'Sofia Reyes',
    email: 's.reyes@outlook.com',
    source: 'meta',
    searchQuery: 'invest in real estate with little money',
    keyword: 'fractional real estate investing',
    campaign: 'Meta High Income Investors',
    location: 'Austin, TX',
    device: 'mobile',
    age: '28-34',
    incomeSignal: '$75K-$100K',
    status: 'hot',
    score: 88,
    signedUp: true,
    investmentInterest: 'Passive Income, Monthly Dividends',
    timeAgo: '34 min ago',
    adGroup: 'Millennial Investors',
    matchType: 'Broad Match',
  },
  {
    id: '3',
    name: 'David Kim',
    email: 'd.kim@yahoo.com',
    source: 'google',
    searchQuery: 'passive income real estate app',
    keyword: 'passive income real estate',
    campaign: 'RE Investors Q1 2025',
    location: 'New York, NY',
    device: 'desktop',
    age: '45-54',
    incomeSignal: '$150K+',
    status: 'warm',
    score: 79,
    signedUp: false,
    investmentInterest: 'Commercial RE, REITs',
    timeAgo: '1 hr ago',
    adGroup: 'High Net Worth',
    matchType: 'Phrase Match',
  },
  {
    id: '4',
    name: 'Angela Torres',
    email: 'atorres@proton.me',
    source: 'google',
    searchQuery: 'how to invest in property with 500 dollars',
    keyword: 'invest in real estate with 100 dollars',
    campaign: 'Low Min Investment',
    location: 'Los Angeles, CA',
    device: 'mobile',
    age: '25-34',
    incomeSignal: '$50K-$75K',
    status: 'warm',
    score: 71,
    signedUp: true,
    investmentInterest: 'Starter Properties, Low Minimum',
    timeAgo: '2 hr ago',
    adGroup: 'Entry Level Investors',
    matchType: 'Broad Match',
  },
  {
    id: '5',
    name: 'Marcus Webb',
    email: 'm.webb@gmail.com',
    source: 'meta',
    searchQuery: 'real estate crowdfunding returns',
    keyword: 'real estate crowdfunding platform',
    campaign: 'Meta High Income Investors',
    location: 'Chicago, IL',
    device: 'tablet',
    age: '35-44',
    incomeSignal: '$100K-$150K',
    status: 'converted',
    score: 96,
    signedUp: true,
    investmentInterest: 'Crowdfunding, Portfolio Diversification',
    timeAgo: '3 hr ago',
    adGroup: 'Accredited Investors',
    matchType: 'Exact Match',
  },
  {
    id: '6',
    name: 'Priya Patel',
    email: 'priya.p@hotmail.com',
    source: 'google',
    searchQuery: 'property investment platform reviews',
    keyword: 'property investment for beginners',
    campaign: 'Brand Awareness',
    location: 'Houston, TX',
    device: 'mobile',
    age: '28-34',
    incomeSignal: '$75K-$100K',
    status: 'warm',
    score: 66,
    signedUp: false,
    investmentInterest: 'Beginner Friendly, Low Risk',
    timeAgo: '5 hr ago',
    adGroup: 'First Time Investors',
    matchType: 'Phrase Match',
  },
  {
    id: '7',
    name: 'Tyler Brooks',
    email: 'tbrooks@gmail.com',
    source: 'organic',
    searchQuery: 'ipx holding real estate review',
    keyword: 'brand search',
    campaign: 'Organic',
    location: 'Phoenix, AZ',
    device: 'mobile',
    age: '35-44',
    incomeSignal: '$100K+',
    status: 'hot',
    score: 91,
    signedUp: true,
    investmentInterest: 'Commercial RE, Long-term Growth',
    timeAgo: '6 hr ago',
    adGroup: 'Brand Intent',
    matchType: 'Organic',
  },
  {
    id: '8',
    name: 'Natalia Cruz',
    email: 'n.cruz@icloud.com',
    source: 'meta',
    searchQuery: 'real estate app monthly income',
    keyword: 'monthly dividend real estate',
    campaign: 'Instagram Story Ads',
    location: 'San Diego, CA',
    device: 'mobile',
    age: '25-34',
    incomeSignal: '$75K-$100K',
    status: 'cold',
    score: 42,
    signedUp: false,
    investmentInterest: 'Monthly Income, Dividends',
    timeAgo: '8 hr ago',
    adGroup: 'Instagram Millennials',
    matchType: 'Interest Target',
  },
];

const FUNNEL = [
  { label: 'Ad Impressions', value: '284,100', icon: Eye, color: Colors.textSecondary },
  { label: 'Clicks', value: '12,840', icon: Target, color: Colors.accent },
  { label: 'Landing Page', value: '9,210', icon: Globe, color: '#FFB800' },
  { label: 'Sign-Ups', value: '1,104', icon: UserCheck, color: Colors.primary },
  { label: 'Investors', value: '312', icon: DollarSign, color: Colors.positive },
];

const getStatusColor = (s: LeadStatus) => {
  if (s === 'hot') return '#FF4D4D';
  if (s === 'warm') return Colors.warning;
  if (s === 'converted') return Colors.positive;
  return Colors.textTertiary;
};

const getSourceColor = (s: Lead['source']) => {
  if (s === 'google') return '#4285F4';
  if (s === 'meta') return '#1877F2';
  if (s === 'organic') return Colors.positive;
  return Colors.accent;
};

const getSourceLabel = (s: Lead['source']) => {
  if (s === 'google') return 'G';
  if (s === 'meta') return 'M';
  if (s === 'organic') return 'O';
  return 'R';
};

const getDeviceIcon = (d: Lead['device']) => {
  if (d === 'mobile') return '📱';
  if (d === 'desktop') return '💻';
  return '📟';
};

export default function LeadIntelligence() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const filteredLeads = useMemo(() => {
    let list = LEADS;
    if (activeFilter === 'google') list = list.filter(l => l.source === 'google');
    else if (activeFilter === 'meta') list = list.filter(l => l.source === 'meta');
    else if (activeFilter === 'new') list = list.filter(l => l.signedUp);
    else if (activeFilter === 'qualified') list = list.filter(l => l.score >= 75);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.searchQuery.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.keyword.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: LEADS.length,
    hot: LEADS.filter(l => l.status === 'hot').length,
    signedUp: LEADS.filter(l => l.signedUp).length,
    converted: LEADS.filter(l => l.status === 'converted').length,
    avgScore: Math.round(LEADS.reduce((a, l) => a + l.score, 0) / LEADS.length),
  }), []);

  const toggleExpand = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All Leads' },
    { key: 'google', label: 'Google' },
    { key: 'meta', label: 'Meta' },
    { key: 'qualified', label: 'Qualified' },
    { key: 'new', label: 'Signed Up' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Lead Intelligence</Text>
          <View style={styles.liveTag}>
            <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.liveTagText}>LIVE</Text>
          </View>
        </View>
        <View style={[styles.scorePill, { backgroundColor: Colors.positive + '20' }]}>
          <Text style={[styles.scorePillText, { color: Colors.positive }]}>{stats.total} leads</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: '#FF4D4D40' }]}>
            <Text style={[styles.statValue, { color: '#FF4D4D' }]}>{stats.hot}</Text>
            <Text style={styles.statLabel}>🔥 Hot</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.positive + '40' }]}>
            <Text style={[styles.statValue, { color: Colors.positive }]}>{stats.signedUp}</Text>
            <Text style={styles.statLabel}>✅ Signed Up</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.primary + '40' }]}>
            <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.converted}</Text>
            <Text style={styles.statLabel}>💰 Invested</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.accent + '40' }]}>
            <Text style={[styles.statValue, { color: Colors.accent }]}>{stats.avgScore}</Text>
            <Text style={styles.statLabel}>⚡ Avg Score</Text>
          </View>
        </View>

        <View style={styles.funnelCard}>
          <View style={styles.funnelHeader}>
            <BarChart3 size={16} color={Colors.primary} />
            <Text style={styles.funnelTitle}>Google Ads Funnel — Today</Text>
          </View>
          {FUNNEL.map((step, i) => {
            const IconComp = step.icon;
            const pct = i === 0 ? 100 : Math.round((parseInt(step.value.replace(/,/g, '')) / 284100) * 100);
            return (
              <View key={step.label} style={styles.funnelStep}>
                <View style={styles.funnelStepLeft}>
                  <View style={[styles.funnelIconBg, { backgroundColor: step.color + '20' }]}>
                    <IconComp size={13} color={step.color} />
                  </View>
                  <Text style={styles.funnelStepLabel}>{step.label}</Text>
                </View>
                <View style={styles.funnelStepRight}>
                  <View style={styles.funnelBarBg}>
                    <View style={[styles.funnelBarFill, { width: `${pct}%` as any, backgroundColor: step.color }]} />
                  </View>
                  <Text style={[styles.funnelStepValue, { color: step.color }]}>{step.value}</Text>
                </View>
              </View>
            );
          })}
          <View style={styles.funnelNote}>
            <AlertCircle size={12} color={Colors.warning} />
            <Text style={styles.funnelNoteText}>
              Google gives you: search query, location, device, age bracket, income signal & keyword match type for every lead.
            </Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Search size={15} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search leads, keywords, location..."
            placeholderTextColor={Colors.textTertiary}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
              onPress={() => {
                setActiveFilter(f.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.leadsHeader}>
          <Text style={styles.leadsHeaderText}>{filteredLeads.length} leads found</Text>
          <Text style={styles.leadsHeaderSub}>Tap a lead to see full search data</Text>
        </View>

        {filteredLeads.map(lead => {
          const isExpanded = expandedId === lead.id;
          return (
            <TouchableOpacity
              key={lead.id}
              style={[styles.leadCard, isExpanded && styles.leadCardExpanded]}
              onPress={() => toggleExpand(lead.id)}
              activeOpacity={0.85}
            >
              <View style={styles.leadCardTop}>
                <View style={[styles.sourceCircle, { backgroundColor: getSourceColor(lead.source) + '25' }]}>
                  <Text style={[styles.sourceCircleText, { color: getSourceColor(lead.source) }]}>
                    {getSourceLabel(lead.source)}
                  </Text>
                </View>
                <View style={styles.leadInfo}>
                  <View style={styles.leadNameRow}>
                    <Text style={styles.leadName}>{lead.name}</Text>
                    {lead.signedUp && (
                      <View style={styles.signedBadge}>
                        <UserCheck size={10} color={Colors.positive} />
                        <Text style={styles.signedBadgeText}>Signed Up</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.leadSearch} numberOfLines={1}>🔍 "{lead.searchQuery}"</Text>
                  <View style={styles.leadMeta}>
                    <View style={styles.leadMetaItem}>
                      <MapPin size={10} color={Colors.textTertiary} />
                      <Text style={styles.leadMetaText}>{lead.location}</Text>
                    </View>
                    <Text style={styles.leadMetaText}>{getDeviceIcon(lead.device)}</Text>
                    <Text style={styles.leadMetaText}>{lead.timeAgo}</Text>
                  </View>
                </View>
                <View style={styles.leadRight}>
                  <View style={[styles.scoreBadge, {
                    backgroundColor: lead.score >= 80 ? Colors.positive + '20' : lead.score >= 60 ? Colors.warning + '20' : Colors.surfaceBorder
                  }]}>
                    <Text style={[styles.scoreText, {
                      color: lead.score >= 80 ? Colors.positive : lead.score >= 60 ? Colors.warning : Colors.textTertiary
                    }]}>{lead.score}</Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(lead.status) }]} />
                </View>
              </View>

              {isExpanded && (
                <View style={styles.leadDetails}>
                  <View style={styles.detailDivider} />

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>🎯 Ad Data from Google</Text>
                    <View style={styles.detailGrid}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Keyword</Text>
                        <Text style={styles.detailVal}>{lead.keyword}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Match Type</Text>
                        <Text style={[styles.detailVal, { color: Colors.primary }]}>{lead.matchType}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Campaign</Text>
                        <Text style={styles.detailVal}>{lead.campaign}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Ad Group</Text>
                        <Text style={styles.detailVal}>{lead.adGroup}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>👤 Audience Signals</Text>
                    <View style={styles.detailGrid}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Age</Text>
                        <Text style={styles.detailVal}>{lead.age}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Income Signal</Text>
                        <Text style={[styles.detailVal, { color: Colors.positive }]}>{lead.incomeSignal}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Device</Text>
                        <Text style={styles.detailVal}>{lead.device}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailKey}>Location</Text>
                        <Text style={styles.detailVal}>{lead.location}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>💡 Investment Interest</Text>
                    <View style={[styles.interestTag]}>
                      <Building2 size={12} color={Colors.accent} />
                      <Text style={styles.interestTagText}>{lead.investmentInterest}</Text>
                    </View>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>📧 Contact</Text>
                    <Text style={[styles.detailVal, { color: Colors.primary }]}>{lead.email}</Text>
                  </View>

                  <View style={styles.leadActions}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.primary + '20', borderColor: Colors.primary + '40' }]}>
                      <Zap size={13} color={Colors.primary} />
                      <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Send Nurture Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.positive + '15', borderColor: Colors.positive + '30' }]}>
                      <Star size={13} color={Colors.positive} />
                      <Text style={[styles.actionBtnText, { color: Colors.positive }]}>Mark VIP</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={styles.infoBox}>
          <Text style={styles.infoBoxTitle}>How Google Gives You This Data</Text>
          <View style={styles.infoBoxItem}>
            <Text style={styles.infoBoxBullet}>1.</Text>
            <Text style={styles.infoBoxText}>Someone searches "real estate investment app" on Google → your ad shows up</Text>
          </View>
          <View style={styles.infoBoxItem}>
            <Text style={styles.infoBoxBullet}>2.</Text>
            <Text style={styles.infoBoxText}>They click → Google passes their keyword, location, device, age & income bracket via the Google Ads API</Text>
          </View>
          <View style={styles.infoBoxItem}>
            <Text style={styles.infoBoxBullet}>3.</Text>
            <Text style={styles.infoBoxText}>They land on your app → UTM tracking records which campaign/ad group brought them</Text>
          </View>
          <View style={styles.infoBoxItem}>
            <Text style={styles.infoBoxBullet}>4.</Text>
            <Text style={styles.infoBoxText}>They sign up → you get their name, email, phone. Google Conversion API confirms the lead to optimize your ads automatically</Text>
          </View>
          <View style={styles.infoBoxItem}>
            <Text style={styles.infoBoxBullet}>5.</Text>
            <Text style={styles.infoBoxText}>Google's AI then finds MORE people like your best investors (Smart Bidding + Lookalike)</Text>
          </View>
        </View>

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
    gap: 5,
    backgroundColor: '#FF4D4D20',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF4D4D' },
  liveTagText: { fontSize: 10, fontWeight: '700' as const, color: '#FF4D4D' },
  scorePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scorePillText: { fontSize: 12, fontWeight: '700' as const },

  content: { padding: 16 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: { fontSize: 20, fontWeight: '800' as const, color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 3, textAlign: 'center' },

  funnelCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
    gap: 10,
  },
  funnelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  funnelTitle: { fontSize: 14, fontWeight: '700' as const, color: Colors.text },
  funnelStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  funnelStepLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 130 },
  funnelIconBg: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  funnelStepLabel: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  funnelStepRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: 3,
    overflow: 'hidden',
  },
  funnelBarFill: { height: 6, borderRadius: 3 },
  funnelStepValue: { fontSize: 12, fontWeight: '700' as const, width: 52, textAlign: 'right' },
  funnelNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: Colors.warning + '10',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  funnelNoteText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  filterRow: { marginBottom: 12 },
  filterRowContent: { gap: 8, paddingRight: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600' as const, color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.black },

  leadsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  leadsHeaderText: { fontSize: 14, fontWeight: '700' as const, color: Colors.text },
  leadsHeaderSub: { fontSize: 12, color: Colors.textTertiary },

  leadCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  leadCardExpanded: {
    borderColor: Colors.primary + '50',
  },
  leadCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceCircleText: { fontSize: 16, fontWeight: '800' as const },
  leadInfo: { flex: 1 },
  leadNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  leadName: { fontSize: 14, fontWeight: '700' as const, color: Colors.text },
  signedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.positive + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  signedBadgeText: { fontSize: 9, fontWeight: '700' as const, color: Colors.positive },
  leadSearch: { fontSize: 12, color: Colors.textSecondary, marginBottom: 5, fontStyle: 'italic' },
  leadMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leadMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  leadMetaText: { fontSize: 11, color: Colors.textTertiary },
  leadRight: { alignItems: 'center', gap: 6 },
  scoreBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontSize: 14, fontWeight: '800' as const },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  leadDetails: { marginTop: 4 },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  detailSection: { marginBottom: 14 },
  detailSectionTitle: { fontSize: 12, fontWeight: '700' as const, color: Colors.textSecondary, marginBottom: 8 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailItem: { width: '47%' },
  detailKey: { fontSize: 10, color: Colors.textTertiary, marginBottom: 2 },
  detailVal: { fontSize: 13, fontWeight: '600' as const, color: Colors.text },
  interestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent + '15',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  interestTagText: { fontSize: 13, color: Colors.accent, fontWeight: '600' as const },
  leadActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600' as const },

  infoBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    marginTop: 6,
    gap: 10,
  },
  infoBoxTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 4,
  },
  infoBoxItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  infoBoxBullet: { fontSize: 12, color: Colors.primary, fontWeight: '700' as const, width: 16 },
  infoBoxText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  bottomPad: { height: 40 },
});
