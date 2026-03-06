import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  ScrollView,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TrendingUp, Shield, Zap, ChevronRight, Globe, Award, BarChart3, ExternalLink, Users, CheckCircle, Mail, Phone, User, ChevronDown, MapPin, DollarSign, Building2, Handshake, Activity, Eye, MousePointer, UserCheck, ArrowUpRight, Home, Briefcase, Megaphone, Star, Flame, Percent, Rocket, Clock, UserPlus } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { useGlobalMarkets } from '@/lib/global-markets';

const IPX_LOGO = require('@/assets/images/ivx-logo.png');

const STATS = [
  { value: '$2.1B', label: 'Assets Under\nManagement' },
  { value: '14.5%', label: 'Avg Annual\nReturn' },
  { value: '52K+', label: 'Global\nInvestors' },
  { value: '$1', label: 'Minimum\nInvestment' },
];

const FEATURES = [
  {
    icon: <BarChart3 size={22} color="#FFD700" />,
    title: 'Fractional Ownership',
    desc: 'Own a piece of premium real estate for as little as $1.',
    bg: '#FFD70015',
  },
  {
    icon: <TrendingUp size={22} color="#00C48C" />,
    title: '24/7 Trading',
    desc: 'Buy & sell property shares any time — just like crypto.',
    bg: '#00C48C15',
  },
  {
    icon: <Shield size={22} color="#4A90D9" />,
    title: 'SEC Compliant',
    desc: 'Bank-grade security with FDIC-escrow protection.',
    bg: '#4A90D915',
  },
  {
    icon: <Zap size={22} color="#FF6B6B" />,
    title: 'Monthly Dividends',
    desc: 'Earn passive rental income paid directly to your wallet.',
    bg: '#FF6B6B15',
  },
];

const PROPERTY_IMAGES = [
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80',
];

const TOP_PROPERTIES = [
  {
    id: '1',
    name: 'Marina Bay Residences',
    location: 'Dubai Marina, UAE',
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80',
    pricePerShare: '$52.40',
    yield: '8.5%',
    irr: '14.5%',
    occupancy: '96%',
    funded: 65,
    totalRaise: '$5.24M',
    type: 'Luxury Residential',
    riskLevel: 'Medium',
    riskColor: '#FFB800',
    status: 'LIVE NOW',
    statusColor: '#00C48C',
    highlight: 'Highest Yield',
    highlightColor: '#FFD700',
    tags: ['Waterfront', 'Fully Leased', 'Monthly Dividends'],
  },
  {
    id: '2',
    name: 'Manhattan Office Tower',
    location: '500 Fifth Avenue, New York',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&q=80',
    pricePerShare: '$125.00',
    yield: '6.8%',
    irr: '12.2%',
    occupancy: '92%',
    funded: 60,
    totalRaise: '$25M',
    type: 'Class A Commercial',
    riskLevel: 'Low',
    riskColor: '#00C48C',
    status: 'LIVE NOW',
    statusColor: '#00C48C',
    highlight: 'Most Popular',
    highlightColor: '#4A90D9',
    tags: ['Fortune 500 Tenants', 'LEED Gold', '10yr Leases'],
  },
];

const INVESTMENT_OPTIONS = [
  { label: 'Under $10,000', value: 'under_10k' },
  { label: '$10,000 – $100,000', value: '10k_100k' },
  { label: '$100,000 – $500,000', value: '100k_500k' },
  { label: '$500,000 – $1.4M (JV)', value: '500k_1_4m' },
  { label: '$1.4M+ (Full JV Partner)', value: '1_4m_plus' },
];

const FEATURED_PROPERTY = {
  address: '20231 SW 51st Ct',
  city: 'Pembroke Pines, FL 33332',
  price: '$10,000,000',
  jvAmount: '$1,400,000',
  beds: 5,
  baths: 6,
  sqft: '8,200',
  type: 'Luxury Estate',
  images: [
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=600&q=80',
  ],
};

function LiveGlobalTicker() {
  const { width } = useWindowDimensions();
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const { forex, indices, crypto, commodities } = useGlobalMarkets(5000);

  const tickerItems = [
    ...indices.slice(0, 4).map(i => ({ label: i.symbol, value: i.value.toLocaleString('en-US', { maximumFractionDigits: 0 }), change: i.changePercent, flag: i.flag })),
    ...forex.slice(0, 4).map(f => ({ label: f.symbol, value: f.rate < 10 ? f.rate.toFixed(4) : f.rate.toFixed(2), change: f.changePercent24h, flag: f.flag })),
    ...crypto.slice(0, 3).map(c => ({ label: c.symbol, value: `${c.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, change: c.changePercent24h, flag: '' })),
    ...commodities.slice(0, 2).map(c => ({ label: c.name, value: `${c.price >= 100 ? c.price.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : c.price.toFixed(2)}`, change: c.changePercent24h, flag: '' })),
  ];

  useEffect(() => {
    if (width <= 0) return;
    scrollAnim.setValue(0);
    const anim = Animated.loop(
      Animated.timing(scrollAnim, { toValue: -width * 3, duration: 30000, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [width]);

  return (
    <View style={tickerStyles.wrap}>
      <View style={tickerStyles.labelChip}>
        <View style={tickerStyles.liveDot} />
        <Text style={tickerStyles.labelText}>LIVE</Text>
      </View>
      <View style={tickerStyles.overflow}>
        <Animated.View style={[tickerStyles.inner, { transform: [{ translateX: scrollAnim }] }]}>
          {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => {
            const up = item.change >= 0;
            return (
              <View key={i} style={tickerStyles.item}>
                {item.flag ? <Text style={tickerStyles.flag}>{item.flag}</Text> : null}
                <Text style={tickerStyles.itemLabel}>{item.label}</Text>
                <Text style={tickerStyles.itemValue}>{item.value}</Text>
                <Text style={[tickerStyles.itemChange, { color: up ? Colors.positive : Colors.negative }]}>
                  {up ? '+' : ''}{item.change.toFixed(2)}%
                </Text>
                <View style={tickerStyles.sep} />
              </View>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}

const tickerStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    height: 34,
    overflow: 'hidden',
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.surfaceBorder,
    height: '100%' as any,
    justifyContent: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.positive,
  },
  labelText: {
    color: Colors.positive,
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  overflow: { flex: 1, overflow: 'hidden', height: '100%' as any },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%' as any,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  flag: { fontSize: 12 },
  itemLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  itemValue: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  itemChange: {
    fontSize: 10,
    fontWeight: '600' as const,
  },
  sep: {
    width: 1,
    height: 14,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 8,
  },
});

const PARTNER_ROLES = [
  {
    key: 'realtor',
    icon: <Home size={28} color="#00C48C" />,
    badge: 'REALTORS & AGENTS',
    badgeColor: '#00C48C',
    emoji: '🏡',
    title: 'Turn Every Listing\nInto Lifetime Income',
    subtitle: 'List properties on our fractional platform. Refer investor clients. Collect commissions on every deal — then keep earning as dividends flow for years.',
    earning: 'Up to 3% per deal',
    earningColor: '#00C48C',
    monthlyEst: '$8,400',
    topEarner: '$142,000',
    topEarnerNote: 'top agent / month',
    monthlyNote: 'avg. active agent / mo',
    incomeBreakdown: [
      { label: '1 Listing Closed ($500K)', value: '$15,000', note: 'commission' },
      { label: '10 Investor Referrals', value: '$5,000', note: 'sign-up bonus' },
      { label: 'Dividend Residuals', value: '$1,200+', note: 'monthly passive' },
    ],
    howItWorks: [
      { step: '01', label: 'List or Refer', desc: 'Bring a property or refer a buyer/investor to IVX' },
      { step: '02', label: 'Deal Closes', desc: 'We handle tokenization, legal & KYC for you' },
      { step: '03', label: 'Get Paid', desc: '3% commission hits your wallet within 48 hours' },
      { step: '04', label: 'Earn Residuals', desc: 'Collect ongoing revenue share from investor dividends' },
    ],
    perks: [
      '3% commission on every property transaction',
      'Residual income stream from investor dividends',
      'Access to $2.1B premium portfolio network',
      'Priority listing placement & marketing support',
      'Co-branded materials for your clients',
    ],
    testimonial: { quote: 'I listed one property and earned more in commissions last quarter than 6 months of traditional real estate.', author: 'Marcus T.', role: 'Licensed Realtor · Miami, FL' },
    cta: 'Apply as Agent',
    route: '/agent-apply',
    accent: '#00C48C',
    cardBg: '#00C48C08',
    cardBorder: '#00C48C30',
  },
  {
    key: 'broker',
    icon: <Briefcase size={28} color="#FFD700" />,
    badge: 'BROKERS & DEALERS',
    badgeColor: '#FFD700',
    emoji: '💼',
    title: 'Scale Your Capital\nRaising Machine',
    subtitle: 'Place HNW clients into curated real estate deals and earn the highest fees in the industry. White-label our platform as your own brand.',
    earning: 'Up to 5% placement fee',
    earningColor: '#FFD700',
    monthlyEst: '$24,000',
    topEarner: '$380,000',
    topEarnerNote: 'top broker / month',
    monthlyNote: 'avg. active broker / mo',
    incomeBreakdown: [
      { label: '$2M Capital Raised', value: '$100,000', note: '5% placement fee' },
      { label: 'AUM Override', value: '$8,400', note: 'monthly override' },
      { label: 'Co-Investment Returns', value: '$14,000+', note: 'quarterly distributions' },
    ],
    howItWorks: [
      { step: '01', label: 'Source Capital', desc: 'Introduce your HNW clients to IVX deal flow' },
      { step: '02', label: 'Client Invests', desc: 'We handle compliance, docs & onboarding' },
      { step: '03', label: 'Earn 5% Fee', desc: 'Placement fee paid on total capital raised' },
      { step: '04', label: 'Co-Invest', desc: 'Participate alongside your clients in every deal' },
    ],
    perks: [
      '5% placement fee on all capital raised',
      'White-label platform under your brand',
      'Co-invest alongside your clients',
      'Dedicated deal flow & research reports',
      'Compliance & legal infrastructure provided',
    ],
    testimonial: { quote: 'Raised $4.2M for clients in 90 days. IVX handles everything — I just bring the relationship and collect the fee.', author: 'Diana R.', role: 'Independent Broker · New York, NY' },
    cta: 'Apply as Broker',
    route: '/broker-apply',
    accent: '#FFD700',
    cardBg: '#FFD70008',
    cardBorder: '#FFD70030',
  },
  {
    key: 'influencer',
    icon: <Megaphone size={28} color="#E879F9" />,
    badge: 'CREATORS & INFLUENCERS',
    badgeColor: '#E879F9',
    emoji: '🎙️',
    title: 'Real Estate Meets\nCreator Economy',
    subtitle: 'Your audience trusts you with their money. Help them build wealth in real estate — and earn every time they do. Recurring revenue, not one-time posts.',
    earning: 'Up to $500 / investor',
    earningColor: '#E879F9',
    monthlyEst: '$12,500',
    topEarner: '$95,000',
    topEarnerNote: 'top creator / month',
    monthlyNote: '10K+ follower creator / mo',
    incomeBreakdown: [
      { label: '100 New Investors', value: '$25,000', note: 'referral bonuses' },
      { label: 'Dividend Revenue Share', value: '$4,800', note: 'on follower portfolio' },
      { label: 'Content Sponsorship', value: '$3,500', note: 'branded campaigns' },
    ],
    howItWorks: [
      { step: '01', label: 'Get Your Link', desc: 'Receive a custom referral code & tracking dashboard' },
      { step: '02', label: 'Share Content', desc: 'Post, story, reel — we provide branded content kits' },
      { step: '03', label: 'Follower Invests', desc: 'Your audience signs up and makes their first investment' },
      { step: '04', label: 'Recurring Revenue', desc: 'Earn $50–$500 per investor + revenue share on dividends' },
    ],
    perks: [
      '$50–$500 per qualified investor referral',
      'Recurring revenue share on follower dividends',
      'Branded content kits & campaign support',
      'Real-time analytics & referral dashboard',
      'Early access to new property launches',
    ],
    testimonial: { quote: 'One reel, 200 sign-ups, $47K in referral income. This is the only brand deal that pays me forever.', author: 'Jasmine K.', role: 'Finance Creator · 280K Followers' },
    cta: 'Apply as Creator',
    route: '/influencer-apply',
    accent: '#E879F9',
    cardBg: '#E879F908',
    cardBorder: '#E879F930',
  },
];

function PartnerEarnSection() {
  const router = useRouter();
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, []);

  const shimmerOpacity = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={partnerStyles.wrap}>
      <View style={partnerStyles.headerWrap}>
        <View style={partnerStyles.eyebrowRow}>
          <View style={partnerStyles.eyebrowPill}>
            <DollarSign size={10} color={Colors.primary} />
            <Text style={partnerStyles.eyebrow}>PARTNER MONETIZATION PROGRAM</Text>
          </View>
        </View>
        <Text style={partnerStyles.title}>
          Your Network is{' '}
          <Text style={partnerStyles.titleGold}>Worth Millions</Text>
        </Text>
        <Text style={partnerStyles.subtitle}>
          Realtors, brokers, and creators are turning their existing networks into serious passive income with IVX. Get paid for what you already do — then keep earning forever.
        </Text>

        <Animated.View style={[partnerStyles.bigMoneyBanner, { opacity: shimmerOpacity }]}>
          <View style={partnerStyles.bigMoneyItem}>
            <Text style={partnerStyles.bigMoneyValue}>$18.7M+</Text>
            <Text style={partnerStyles.bigMoneyLabel}>Paid to Partners</Text>
            <Text style={partnerStyles.bigMoneyNote}>since launch</Text>
          </View>
          <View style={partnerStyles.bigMoneyDiv} />
          <View style={partnerStyles.bigMoneyItem}>
            <Text style={partnerStyles.bigMoneyValue}>3,400+</Text>
            <Text style={partnerStyles.bigMoneyLabel}>Active Partners</Text>
            <Text style={partnerStyles.bigMoneyNote}>globally</Text>
          </View>
          <View style={partnerStyles.bigMoneyDiv} />
          <View style={partnerStyles.bigMoneyItem}>
            <Text style={partnerStyles.bigMoneyValue}>$380K</Text>
            <Text style={partnerStyles.bigMoneyLabel}>Top Earner</Text>
            <Text style={partnerStyles.bigMoneyNote}>per month</Text>
          </View>
        </Animated.View>

        <View style={partnerStyles.roleTabsRow}>
          {PARTNER_ROLES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[partnerStyles.roleTab, expandedRole === r.key && { borderColor: r.accent, backgroundColor: r.accent + '18' }]}
              onPress={() => setExpandedRole(expandedRole === r.key ? null : r.key)}
              activeOpacity={0.8}
            >
              <Text style={partnerStyles.roleTabEmoji}>{r.emoji}</Text>
              <Text style={[partnerStyles.roleTabText, expandedRole === r.key && { color: r.accent }]}>
                {r.key === 'realtor' ? 'Realtors' : r.key === 'broker' ? 'Brokers' : 'Creators'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {PARTNER_ROLES.map((role) => {
        const isExpanded = expandedRole === role.key;
        return (
          <View key={role.key} style={[partnerStyles.roleCard, { backgroundColor: role.cardBg, borderColor: isExpanded ? role.accent + '60' : role.cardBorder }]}>
            <View style={[partnerStyles.roleAccentBar, { backgroundColor: role.accent }]} />

            <TouchableOpacity
              style={partnerStyles.roleCardHeader}
              onPress={() => setExpandedRole(isExpanded ? null : role.key)}
              activeOpacity={0.85}
            >
              <View style={[partnerStyles.roleIconWrap, { backgroundColor: role.accent + '18', borderColor: role.accent + '35' }]}>
                {role.icon}
              </View>
              <View style={partnerStyles.roleCardHeaderRight}>
                <View style={[partnerStyles.roleBadge, { backgroundColor: role.badgeColor + '18', borderColor: role.badgeColor + '35' }]}>
                  <Text style={[partnerStyles.roleBadgeText, { color: role.badgeColor }]}>{role.badge}</Text>
                </View>
                <Text style={partnerStyles.roleCardTitle}>{role.title}</Text>
              </View>
              <ChevronDown size={18} color={role.accent} style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] } as any} />
            </TouchableOpacity>

            <View style={[partnerStyles.earningsHero, { borderColor: role.accent + '25', backgroundColor: role.accent + '05' }]}>
              <View style={partnerStyles.earningsHeroLeft}>
                <Text style={partnerStyles.earningsHeroLabel}>AVG. MONTHLY INCOME</Text>
                <Text style={[partnerStyles.earningsHeroValue, { color: role.accent }]}>${role.monthlyEst}</Text>
                <Text style={partnerStyles.earningsHeroNote}>{role.monthlyNote}</Text>
              </View>
              <View style={partnerStyles.earningsHeroDivider} />
              <View style={partnerStyles.earningsHeroRight}>
                <Text style={partnerStyles.earningsHeroLabel}>🔥 TOP EARNER</Text>
                <Text style={[partnerStyles.earningsHeroTopValue, { color: role.accent }]}>{role.topEarner}</Text>
                <Text style={partnerStyles.earningsHeroNote}>{role.topEarnerNote}</Text>
              </View>
            </View>

            <View style={[partnerStyles.earningChip, { backgroundColor: role.accent + '18', borderColor: role.accent + '40', alignSelf: 'flex-start' }]}>
              <DollarSign size={11} color={role.earningColor} />
              <Text style={[partnerStyles.earningChipText, { color: role.earningColor }]}>{role.earning}</Text>
            </View>

            {isExpanded && (
              <View style={partnerStyles.expandedContent}>
                <Text style={partnerStyles.roleSubtitle}>{role.subtitle}</Text>

                <View style={partnerStyles.incomeBreakdownWrap}>
                  <Text style={partnerStyles.incomeBreakdownTitle}>💰 INCOME BREAKDOWN</Text>
                  {role.incomeBreakdown.map((item, i) => (
                    <View key={i} style={[partnerStyles.incomeRow, { borderColor: role.accent + '20' }]}>
                      <View style={partnerStyles.incomeRowLeft}>
                        <Text style={partnerStyles.incomeRowLabel}>{item.label}</Text>
                        <Text style={partnerStyles.incomeRowNote}>{item.note}</Text>
                      </View>
                      <Text style={[partnerStyles.incomeRowValue, { color: role.accent }]}>{item.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={partnerStyles.stepsWrap}>
                  <Text style={partnerStyles.stepsTitle}>HOW IT WORKS</Text>
                  <View style={partnerStyles.stepsGrid}>
                    {role.howItWorks.map((s, i) => (
                      <View key={i} style={[partnerStyles.stepCard, { borderColor: role.accent + '25', backgroundColor: role.accent + '06' }]}>
                        <Text style={[partnerStyles.stepNum, { color: role.accent }]}>{s.step}</Text>
                        <Text style={partnerStyles.stepLabel}>{s.label}</Text>
                        <Text style={partnerStyles.stepDesc}>{s.desc}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={partnerStyles.perksList}>
                  {role.perks.map((perk, i) => (
                    <View key={i} style={partnerStyles.perkRow}>
                      <View style={[partnerStyles.perkCheck, { backgroundColor: role.accent + '18', borderColor: role.accent + '35' }]}>
                        <CheckCircle size={10} color={role.accent} />
                      </View>
                      <Text style={partnerStyles.perkText}>{perk}</Text>
                    </View>
                  ))}
                </View>

                <View style={[partnerStyles.testimonialBox, { borderColor: role.accent + '30', backgroundColor: role.accent + '06' }]}>
                  <View style={partnerStyles.testimonialStars}>
                    {[0,1,2,3,4].map(i => <Star key={i} size={11} color="#FFD700" />)}
                  </View>
                  <Text style={partnerStyles.testimonialQuote}>{`"${role.testimonial.quote}"`}</Text>
                  <Text style={partnerStyles.testimonialAuthor}>— {role.testimonial.author}, {role.testimonial.role}</Text>
                </View>

                <TouchableOpacity
                  style={[partnerStyles.roleCta, { backgroundColor: role.accent }]}
                  onPress={() => router.push(role.route as any)}
                  activeOpacity={0.85}
                >
                  <Text style={partnerStyles.roleCtaText}>{role.cta}</Text>
                  <ArrowUpRight size={16} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {!isExpanded && (
              <TouchableOpacity
                style={[partnerStyles.roleCta, { backgroundColor: role.accent }]}
                onPress={() => router.push(role.route as any)}
                activeOpacity={0.85}
              >
                <Text style={partnerStyles.roleCtaText}>{role.cta}</Text>
                <ArrowUpRight size={16} color="#000" />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <View style={partnerStyles.bottomNote}>
        <Shield size={13} color={Colors.primary} />
        <Text style={partnerStyles.bottomNoteText}>
          All partners go through a quick 24-hour verification. Apply today — partner spots are limited per region to protect your earnings potential.
        </Text>
      </View>
    </View>
  );
}

const partnerStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  headerWrap: {
    marginBottom: 20,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  eyebrowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '35',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: Colors.text,
    lineHeight: 38,
    marginBottom: 10,
  },
  titleGold: {
    color: Colors.primary,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  bigMoneyBanner: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    overflow: 'hidden',
    marginBottom: 16,
  },
  bigMoneyItem: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 2,
  },
  bigMoneyDiv: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  bigMoneyValue: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '900' as const,
  },
  bigMoneyLabel: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },
  bigMoneyNote: {
    color: Colors.textTertiary,
    fontSize: 9,
    textAlign: 'center' as const,
  },
  roleTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  roleTabEmoji: {
    fontSize: 14,
  },
  roleTabText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  roleCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 14,
    gap: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  roleAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  roleIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleCardHeaderRight: {
    flex: 1,
    gap: 6,
  },
  roleCardTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '900' as const,
    lineHeight: 22,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: 'flex-start' as const,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  earningChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  earningChipText: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  earningsHero: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  earningsHeroLeft: {
    flex: 1,
    alignItems: 'center',
  },
  earningsHeroRight: {
    flex: 1,
    alignItems: 'center',
  },
  earningsHeroDivider: {
    width: 1,
    height: 52,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: 10,
  },
  earningsHeroLabel: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '800' as const,
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center' as const,
  },
  earningsHeroValue: {
    fontSize: 28,
    fontWeight: '900' as const,
    marginBottom: 2,
  },
  earningsHeroTopValue: {
    fontSize: 24,
    fontWeight: '900' as const,
    marginBottom: 2,
  },
  earningsHeroNote: {
    color: Colors.textTertiary,
    fontSize: 9,
    textAlign: 'center' as const,
    lineHeight: 13,
  },
  expandedContent: {
    gap: 16,
  },
  roleSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  incomeBreakdownWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  incomeBreakdownTitle: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  incomeRowLeft: {
    flex: 1,
    gap: 2,
  },
  incomeRowLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  incomeRowNote: {
    color: Colors.textTertiary,
    fontSize: 10,
  },
  incomeRowValue: {
    fontSize: 16,
    fontWeight: '900' as const,
    letterSpacing: 0.3,
  },
  stepsWrap: {
    gap: 10,
  },
  stepsTitle: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  stepsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepCard: {
    width: '47%' as any,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  stepNum: {
    fontSize: 20,
    fontWeight: '900' as const,
    lineHeight: 24,
  },
  stepLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  stepDesc: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  perksList: {
    gap: 9,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  perkCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
  testimonialBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  testimonialStars: {
    flexDirection: 'row',
    gap: 3,
  },
  testimonialQuote: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  testimonialAuthor: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  roleCta: {
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  roleCtaText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  bottomNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    marginTop: 4,
  },
  bottomNoteText: {
    flex: 1,
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 17,
  },
});

function LandingAnalytics({ totalRegistered }: { totalRegistered: number }) {
  const router = useRouter();
  const convRate = totalRegistered > 0 ? Math.min(((totalRegistered / Math.max(totalRegistered * 4.2, 1)) * 100), 32.5).toFixed(1) : '24.3';
  const visitors = Math.round(totalRegistered * 4.2) + 1840;
  const todayRegistrations = Math.max(12, Math.round(totalRegistered * 0.04));

  return (
    <View style={analyticsStyles.wrap}>
      <View style={analyticsStyles.header}>
        <Activity size={15} color={Colors.primary} />
        <Text style={analyticsStyles.headerTitle}>Landing Page Analytics</Text>
        <TouchableOpacity onPress={() => router.push('/app-report' as any)} activeOpacity={0.7}>
          <Text style={analyticsStyles.headerLink}>Full Report →</Text>
        </TouchableOpacity>
      </View>

      <View style={analyticsStyles.metricsRow}>
        <View style={analyticsStyles.metric}>
          <View style={[analyticsStyles.metricIcon, { backgroundColor: '#4A90D920' }]}>
            <Eye size={13} color="#4A90D9" />
          </View>
          <Text style={analyticsStyles.metricValue}>{visitors.toLocaleString()}</Text>
          <Text style={analyticsStyles.metricLabel}>Total Visitors</Text>
          <Text style={analyticsStyles.metricSub}>↑ +12% this week</Text>
        </View>
        <View style={analyticsStyles.metric}>
          <View style={[analyticsStyles.metricIcon, { backgroundColor: Colors.positive + '20' }]}>
            <UserCheck size={13} color={Colors.positive} />
          </View>
          <Text style={analyticsStyles.metricValue}>{totalRegistered.toLocaleString()}</Text>
          <Text style={analyticsStyles.metricLabel}>Registrations</Text>
          <Text style={analyticsStyles.metricSub}>↑ +{todayRegistrations} today</Text>
        </View>
        <View style={analyticsStyles.metric}>
          <View style={[analyticsStyles.metricIcon, { backgroundColor: Colors.primary + '20' }]}>
            <MousePointer size={13} color={Colors.primary} />
          </View>
          <Text style={analyticsStyles.metricValue}>{convRate}%</Text>
          <Text style={analyticsStyles.metricLabel}>Conv. Rate</Text>
          <Text style={analyticsStyles.metricSub}>Avg: 2.4%</Text>
        </View>
        <View style={analyticsStyles.metric}>
          <View style={[analyticsStyles.metricIcon, { backgroundColor: '#9B59B620' }]}>
            <DollarSign size={13} color="#9B59B6" />
          </View>
          <Text style={analyticsStyles.metricValue}>$28K</Text>
          <Text style={analyticsStyles.metricLabel}>Avg. Intent</Text>
          <Text style={analyticsStyles.metricSub}>Invest size</Text>
        </View>
      </View>

      <View style={analyticsStyles.funnelWrap}>
        <Text style={analyticsStyles.funnelTitle}>CONVERSION FUNNEL</Text>
        {[
          { label: 'Visited Page', count: visitors, color: '#4A90D9', pct: 100 },
          { label: 'Scrolled Past Hero', count: Math.round(visitors * 0.68), color: '#7B68EE', pct: 68 },
          { label: 'Viewed Registration', count: Math.round(visitors * 0.41), color: Colors.primary, pct: 41 },
          { label: 'Started Form', count: Math.round(visitors * 0.29), color: '#00C48C', pct: 29 },
          { label: 'Registered', count: totalRegistered, color: Colors.positive, pct: parseFloat(convRate) },
        ].map((step, i) => (
          <View key={i} style={analyticsStyles.funnelRow}>
            <Text style={analyticsStyles.funnelLabel}>{step.label}</Text>
            <View style={analyticsStyles.funnelBarBg}>
              <View style={[analyticsStyles.funnelBar, { width: `${step.pct}%` as any, backgroundColor: step.color }]} />
            </View>
            <Text style={analyticsStyles.funnelCount}>{step.count.toLocaleString()}</Text>
          </View>
        ))}
      </View>

      <View style={analyticsStyles.sourcesRow}>
        {[
          { label: 'Direct', pct: 34, color: Colors.primary },
          { label: 'Referral', pct: 28, color: '#4A90D9' },
          { label: 'Social', pct: 22, color: '#9B59B6' },
          { label: 'Search', pct: 16, color: Colors.positive },
        ].map((s, i) => (
          <View key={i} style={analyticsStyles.source}>
            <View style={[analyticsStyles.sourceDot, { backgroundColor: s.color }]} />
            <Text style={analyticsStyles.sourcePct}>{s.pct}%</Text>
            <Text style={analyticsStyles.sourceLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const analyticsStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  headerLink: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  metricIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  metricValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  metricLabel: {
    color: Colors.textSecondary,
    fontSize: 9,
    textAlign: 'center' as const,
  },
  metricSub: {
    color: Colors.positive,
    fontSize: 8,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  funnelWrap: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  funnelTitle: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  funnelLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    width: 105,
  },
  funnelBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  funnelBar: {
    height: 5,
    borderRadius: 3,
  },
  funnelCount: {
    color: Colors.textTertiary,
    fontSize: 9,
    width: 38,
    textAlign: 'right' as const,
  },
  sourcesRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  source: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 8,
    gap: 3,
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sourcePct: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  sourceLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
  },
});

const comingSoonStyles = StyleSheet.create({
  banner: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    overflow: 'hidden',
    padding: 18,
    gap: 14,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: Colors.primary,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  liveText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900' as const,
    letterSpacing: 1.5,
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF6B6B15',
    borderWidth: 1,
    borderColor: '#FF6B6B35',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countdownText: {
    color: '#FF6B6B',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  textWrap: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900' as const,
    lineHeight: 26,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  perksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  perkText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  registerBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  registerBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  disclaimer: {
    color: Colors.textTertiary,
    fontSize: 10,
    textAlign: 'center' as const,
    letterSpacing: 0.3,
  },
});

export default function LandingScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const [activeImage, setActiveImage] = useState<number>(0);

  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [selectedInterest, setSelectedInterest] = useState<string>('under_1k');
  const [showInterestPicker, setShowInterestPicker] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [memberPosition, setMemberPosition] = useState<number>(0);
  const [formError, setFormError] = useState<string>('');

  const sessionIdRef = useRef<string>(`lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const scrollDepthRef = useRef<number>(0);
  const hasTrackedRef = useRef<{ pageView: boolean; scroll25: boolean; scroll50: boolean; scroll75: boolean; scroll100: boolean; formFocus: boolean }>({
    pageView: false, scroll25: false, scroll50: false, scroll75: false, scroll100: false, formFocus: false,
  });

  const geoDataRef = useRef<{ city?: string; region?: string; country?: string; countryCode?: string; lat?: number; lng?: number; timezone?: string } | undefined>(undefined);

  useEffect(() => {
    const fetchGeo = async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        geoDataRef.current = { timezone: tz };

        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          geoDataRef.current = {
            city: data.city,
            region: data.region,
            country: data.country_name,
            countryCode: data.country_code,
            lat: data.latitude,
            lng: data.longitude,
            timezone: data.timezone || tz,
          };
          console.log('[Landing Geo] Location:', geoDataRef.current.city, geoDataRef.current.country);
        }
      } catch (err) {
        console.log('[Landing Geo] Could not fetch location:', err);
      }
    };
    void fetchGeo();
  }, []);

  const trackMutation = trpc.analytics.trackLanding.useMutation();

  const trackEventRef = useRef((event: string, properties?: Record<string, unknown>) => {
    console.log('[Landing Track]', event, properties);
  });

  trackEventRef.current = (event: string, properties?: Record<string, unknown>) => {
    console.log('[Landing Track]', event, properties);
    trackMutation.mutate({
      event,
      sessionId: sessionIdRef.current,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        platform: Platform.OS,
        geoCity: geoDataRef.current?.city,
        geoRegion: geoDataRef.current?.region,
        geoCountry: geoDataRef.current?.country,
      },
      geo: geoDataRef.current,
    });
  };

  const trackEvent = (event: string, properties?: Record<string, unknown>) => {
    trackEventRef.current(event, properties);
  };

  const statsQuery = trpc.waitlist.getStats.useQuery();
  const joinMutation = trpc.waitlist.join.useMutation({
    onSuccess: (data: { success: boolean; alreadyRegistered: boolean; position: number }) => {
      console.log('[Waitlist] Joined successfully:', data);
      setMemberPosition(data.position);
      setSubmitted(true);
      Animated.spring(successScale, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }).start();
    },
    onError: (err: unknown) => {
      console.error('[Waitlist] Error:', err);
      setFormError('Something went wrong. Please try again.');
    },
  });

  useEffect(() => {
    if (!hasTrackedRef.current.pageView) {
      hasTrackedRef.current.pageView = true;
      trackEvent('landing_page_view', {
        referrer: Platform.OS === 'web' && typeof document !== 'undefined' ? (document as any).referrer || 'direct' : 'app',
        userAgent: Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : Platform.OS,
      });
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const imageInterval = setInterval(() => {
      setActiveImage(prev => (prev + 1) % PROPERTY_IMAGES.length);
    }, 3500);

    return () => {
      pulse.stop();
      clearInterval(imageInterval);
    };
  }, []);

  const handleJoin = () => {
    setFormError('');
    if (!firstName.trim()) { setFormError('Please enter your first name.'); return; }
    if (!lastName.trim()) { setFormError('Please enter your last name.'); return; }
    if (!email.trim() || !email.includes('@')) { setFormError('Please enter a valid email address.'); return; }

    trackEvent('form_submit', { investmentInterest: selectedInterest });

    joinMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      investmentInterest: selectedInterest as any,
      source: 'landing_page',
    });
  };

  const [propImage, setPropImage] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPropImage(prev => (prev + 1) % FEATURED_PROPERTY.images.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const totalMembers = (statsQuery.data?.total ?? 0) + 52000;
  const totalRegistered = (statsQuery.data?.total ?? 0) + 52000;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={Platform.OS !== 'web'}
            contentContainerStyle={styles.scrollContent}
            onScroll={(e: any) => {
              const y = e.nativeEvent.contentOffset.y;
              const contentH = e.nativeEvent.contentSize.height;
              const layoutH = e.nativeEvent.layoutMeasurement.height;
              const pct = contentH > layoutH ? Math.round((y / (contentH - layoutH)) * 100) : 0;
              scrollDepthRef.current = pct;
              if (pct >= 25 && !hasTrackedRef.current.scroll25) { hasTrackedRef.current.scroll25 = true; trackEvent('scroll_25'); }
              if (pct >= 50 && !hasTrackedRef.current.scroll50) { hasTrackedRef.current.scroll50 = true; trackEvent('scroll_50'); }
              if (pct >= 75 && !hasTrackedRef.current.scroll75) { hasTrackedRef.current.scroll75 = true; trackEvent('scroll_75'); }
              if (pct >= 95 && !hasTrackedRef.current.scroll100) { hasTrackedRef.current.scroll100 = true; trackEvent('scroll_100'); }
              scrollAnim.setValue(y);
            }}
            scrollEventThrottle={100}
            keyboardShouldPersistTaps="handled"
          >
            <LiveGlobalTicker />

          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
                <Image source={IPX_LOGO} style={styles.logo} resizeMode="contain" />
              </Animated.View>
              <View style={styles.headerText}>
                <Text style={styles.brand}>IVXHOLDINGS HOLDING LLC</Text>
                <View style={styles.liveBadge}>
                  <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                  <Text style={styles.liveBadgeText}>MARKETS OPEN</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.websiteChip}
                onPress={() => Linking.openURL('https://www.ivxholding.com')}
                activeOpacity={0.7}
              >
                <Globe size={11} color={Colors.primary} />
                <Text style={styles.websiteChipText}>ivxholding.com</Text>
                <ExternalLink size={10} color={Colors.primary} />
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Text style={styles.heroEyebrow}>
                <Globe size={13} color={Colors.primary} /> {"  "}GLOBAL REAL ESTATE INVESTING
              </Text>
              <Text style={styles.heroTitle}>Own Real Estate.{'\n'}
                <Text style={styles.heroTitleGold}>Trade Like Crypto.</Text>
              </Text>
              <Text style={styles.heroSubtitle}>
                Fractional ownership in premium properties worldwide. Start with $1, earn monthly dividends, trade shares 24/7.
              </Text>
            </Animated.View>

            <View style={comingSoonStyles.banner}>
              <View style={comingSoonStyles.accentBar} />
              <View style={comingSoonStyles.topRow}>
                <View style={comingSoonStyles.livePill}>
                  <Animated.View style={[comingSoonStyles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                  <Text style={comingSoonStyles.liveText}>COMING SOON</Text>
                </View>
                <View style={comingSoonStyles.countdownPill}>
                  <Clock size={10} color="#FF6B6B" />
                  <Text style={comingSoonStyles.countdownText}>Limited Spots</Text>
                </View>
              </View>

              <View style={comingSoonStyles.content}>
                <Rocket size={28} color={Colors.primary} />
                <View style={comingSoonStyles.textWrap}>
                  <Text style={comingSoonStyles.title}>Real Investment{"\n"}Opportunities Launching</Text>
                  <Text style={comingSoonStyles.subtitle}>
                    Be among the first to access premium real estate deals. Register now as a VIP guest to get priority access and exclusive early-bird bonuses.
                  </Text>
                </View>
              </View>

              <View style={comingSoonStyles.perksRow}>
                {[
                  { icon: <Shield size={13} color="#00C48C" />, label: 'SEC Compliant Deals' },
                  { icon: <DollarSign size={13} color="#FFD700" />, label: 'From $1 Entry' },
                  { icon: <TrendingUp size={13} color="#4A90D9" />, label: 'Monthly Dividends' },
                ].map((perk, i) => (
                  <View key={i} style={comingSoonStyles.perkItem}>
                    {perk.icon}
                    <Text style={comingSoonStyles.perkText}>{perk.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={comingSoonStyles.registerBtn}
                activeOpacity={0.85}
                onPress={() => {
                  trackEvent('coming_soon_register_tap');
                  router.push('/signup' as any);
                }}
              >
                <UserPlus size={16} color="#000" />
                <Text style={comingSoonStyles.registerBtnText}>Register as VIP Guest</Text>
                <ChevronRight size={16} color="#000" />
              </TouchableOpacity>

              <Text style={comingSoonStyles.disclaimer}>
                Free registration · No commitment · Priority access guaranteed
              </Text>
            </View>

            <Animated.View style={[styles.propertyCarousel, { opacity: fadeAnim }]}>
              <Image
                source={{ uri: PROPERTY_IMAGES[activeImage] }}
                style={styles.carouselImage}
                resizeMode="cover"
              />
              <View style={styles.carouselOverlay} />
              <View style={styles.carouselBadge}>
                <Award size={12} color={Colors.primary} />
                <Text style={styles.carouselBadgeText}>FEATURED PROPERTY</Text>
              </View>
              <View style={styles.carouselReturn}>
                <Text style={styles.carouselReturnValue}>+14.5%</Text>
                <Text style={styles.carouselReturnLabel}>YTD Return</Text>
              </View>
              <View style={styles.carouselDots}>
                {PROPERTY_IMAGES.map((_, i) => (
                  <View key={i} style={[styles.dot, i === activeImage && styles.dotActive]} />
                ))}
              </View>
            </Animated.View>

            <Animated.View style={[styles.statsRow, { opacity: fadeAnim }]}>
              {STATS.map((stat, i) => (
                <View key={i} style={styles.statItem}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </Animated.View>

            <View style={styles.topPropertiesSection}>
              <View style={styles.topPropHeader}>
                <View style={styles.topPropBadge}>
                  <Flame size={11} color="#FF6B6B" />
                  <Text style={styles.topPropBadgeText}>TOP INVESTMENT OPPORTUNITIES</Text>
                </View>
                <Text style={styles.topPropTitle}>Start Investing Today</Text>
                <Text style={styles.topPropSubtitle}>Hand-picked properties with proven returns and strong fundamentals</Text>
              </View>

              {TOP_PROPERTIES.map((prop, idx) => (
                <View key={prop.id} style={styles.topPropCard}>
                  <View style={styles.topPropImageWrap}>
                    <Image source={{ uri: prop.image }} style={styles.topPropImage} resizeMode="cover" />
                    <View style={styles.topPropImageOverlay} />
                    <View style={[styles.topPropStatusChip, { backgroundColor: prop.statusColor + '20', borderColor: prop.statusColor + '50' }]}>
                      <View style={[styles.topPropStatusDot, { backgroundColor: prop.statusColor }]} />
                      <Text style={[styles.topPropStatusText, { color: prop.statusColor }]}>{prop.status}</Text>
                    </View>
                    <View style={[styles.topPropHighlightChip, { backgroundColor: prop.highlightColor + '20', borderColor: prop.highlightColor + '50' }]}>
                      {idx === 0 ? <Percent size={10} color={prop.highlightColor} /> : <Flame size={10} color={prop.highlightColor} />}
                      <Text style={[styles.topPropHighlightText, { color: prop.highlightColor }]}>{prop.highlight}</Text>
                    </View>
                    <View style={styles.topPropPriceOverlay}>
                      <Text style={styles.topPropPriceLabel}>Share Price</Text>
                      <Text style={styles.topPropPriceValue}>{prop.pricePerShare}</Text>
                    </View>
                  </View>

                  <View style={styles.topPropContent}>
                    <View style={styles.topPropNameRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.topPropName}>{prop.name}</Text>
                        <View style={styles.topPropLocRow}>
                          <MapPin size={11} color={Colors.textTertiary} />
                          <Text style={styles.topPropLoc}>{prop.location}</Text>
                        </View>
                      </View>
                      <View style={[styles.topPropTypeBadge, { backgroundColor: Colors.primary + '15', borderColor: Colors.primary + '30' }]}>
                        <Building2 size={10} color={Colors.primary} />
                        <Text style={styles.topPropTypeText}>{prop.type}</Text>
                      </View>
                    </View>

                    <View style={styles.topPropMetrics}>
                      <View style={styles.topPropMetric}>
                        <Text style={styles.topPropMetricLabel}>Annual Yield</Text>
                        <Text style={[styles.topPropMetricValue, { color: '#00C48C' }]}>{prop.yield}</Text>
                      </View>
                      <View style={styles.topPropMetricDiv} />
                      <View style={styles.topPropMetric}>
                        <Text style={styles.topPropMetricLabel}>Target IRR</Text>
                        <Text style={[styles.topPropMetricValue, { color: Colors.primary }]}>{prop.irr}</Text>
                      </View>
                      <View style={styles.topPropMetricDiv} />
                      <View style={styles.topPropMetric}>
                        <Text style={styles.topPropMetricLabel}>Occupancy</Text>
                        <Text style={[styles.topPropMetricValue, { color: '#4A90D9' }]}>{prop.occupancy}</Text>
                      </View>
                      <View style={styles.topPropMetricDiv} />
                      <View style={styles.topPropMetric}>
                        <Text style={styles.topPropMetricLabel}>Risk</Text>
                        <Text style={[styles.topPropMetricValue, { color: prop.riskColor }]}>{prop.riskLevel}</Text>
                      </View>
                    </View>

                    <View style={styles.topPropFundedWrap}>
                      <View style={styles.topPropFundedHeader}>
                        <Text style={styles.topPropFundedLabel}>Funded</Text>
                        <Text style={styles.topPropFundedPct}>{prop.funded}% of {prop.totalRaise}</Text>
                      </View>
                      <View style={styles.topPropFundedBarBg}>
                        <View style={[styles.topPropFundedBar, { width: `${prop.funded}%` as any }]} />
                      </View>
                    </View>

                    <View style={styles.topPropTagsRow}>
                      {prop.tags.map((tag, ti) => (
                        <View key={ti} style={styles.topPropTag}>
                          <CheckCircle size={9} color={Colors.positive} />
                          <Text style={styles.topPropTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={styles.topPropInvestBtn}
                      activeOpacity={0.85}
                      onPress={() => { trackEvent('top_property_invest', { propertyId: prop.id }); router.push('/signup' as any); }}
                    >
                      <Text style={styles.topPropInvestBtnText}>Invest from {prop.pricePerShare}</Text>
                      <ChevronRight size={16} color={Colors.black} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={styles.topPropViewAll}
                activeOpacity={0.8}
                onPress={() => { trackEvent('view_all_properties'); router.push('/signup' as any); }}
              >
                <Text style={styles.topPropViewAllText}>View All Properties</Text>
                <ChevronRight size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <Animated.View style={[styles.featuresSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Text style={styles.sectionTitle}>Why Investors Choose IVXHOLDINGS</Text>
              <View style={styles.featuresGrid}>
                {FEATURES.map((f, i) => (
                  <View key={i} style={[styles.featureCard, { backgroundColor: f.bg, borderColor: f.bg }]}>
                    <View style={styles.featureIconWrap}>{f.icon}</View>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            <Animated.View style={[styles.trustRow, { opacity: fadeAnim }]}>
              <View style={styles.trustItem}>
                <Shield size={14} color={Colors.success} />
                <Text style={styles.trustText}>SEC Compliant</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustItem}>
                <Award size={14} color={Colors.success} />
                <Text style={styles.trustText}>FDIC Escrow</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustItem}>
                <Shield size={14} color={Colors.success} />
                <Text style={styles.trustText}>Audited</Text>
              </View>
            </Animated.View>

            <Animated.View style={[styles.registrationSection, { opacity: fadeAnim }]}>
              <View style={styles.registrationHeader}>
                <View style={styles.regBadge}>
                  <Users size={13} color={Colors.primary} />
                  <Text style={styles.regBadgeText}>EARLY ACCESS</Text>
                </View>
                <Text style={styles.regTitle}>Join {totalMembers.toLocaleString()}+ Members</Text>
                <Text style={styles.regSubtitle}>
                  Register now to get early access, exclusive bonuses, and be first to invest when we launch.
                </Text>
              </View>

              {!submitted ? (
                <View style={styles.formCard}>
                  <View style={styles.formRow}>
                    <View style={[styles.inputWrap, { flex: 1 }]}>
                      <View style={styles.inputIcon}>
                        <User size={15} color={Colors.textTertiary} />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="First Name"
                        placeholderTextColor={Colors.inputPlaceholder}
                        value={firstName}
                        onChangeText={setFirstName}
                        autoCapitalize="words"
                        testID="waitlist-first-name"
                        onFocus={() => { if (!hasTrackedRef.current.formFocus) { hasTrackedRef.current.formFocus = true; trackEvent('form_focus'); } }}
                      />
                    </View>
                    <View style={[styles.inputWrap, { flex: 1 }]}>
                      <View style={styles.inputIcon}>
                        <User size={15} color={Colors.textTertiary} />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Last Name"
                        placeholderTextColor={Colors.inputPlaceholder}
                        value={lastName}
                        onChangeText={setLastName}
                        autoCapitalize="words"
                        testID="waitlist-last-name"
                      />
                    </View>
                  </View>

                  <View style={styles.inputWrap}>
                    <View style={styles.inputIcon}>
                      <Mail size={15} color={Colors.textTertiary} />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Email Address"
                      placeholderTextColor={Colors.inputPlaceholder}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="waitlist-email"
                    />
                  </View>

                  <View style={styles.inputWrap}>
                    <View style={styles.inputIcon}>
                      <Phone size={15} color={Colors.textTertiary} />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Phone Number (optional)"
                      placeholderTextColor={Colors.inputPlaceholder}
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      testID="waitlist-phone"
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.pickerWrap}
                    onPress={() => setShowInterestPicker(!showInterestPicker)}
                    activeOpacity={0.8}
                    testID="waitlist-interest-picker"
                  >
                    <View style={styles.pickerLeft}>
                      <TrendingUp size={15} color={Colors.textTertiary} />
                      <Text style={styles.pickerText}>
                        {INVESTMENT_OPTIONS.find(o => o.value === selectedInterest)?.label ?? 'Investment Range'}
                      </Text>
                    </View>
                    <ChevronDown size={16} color={Colors.textTertiary} />
                  </TouchableOpacity>

                  {showInterestPicker && (
                    <View style={styles.dropdownList}>
                      {INVESTMENT_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.dropdownItem, selectedInterest === opt.value && styles.dropdownItemActive]}
                          onPress={() => { setSelectedInterest(opt.value); setShowInterestPicker(false); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dropdownItemText, selectedInterest === opt.value && styles.dropdownItemTextActive]}>
                            {opt.label}
                          </Text>
                          {selectedInterest === opt.value && (
                            <CheckCircle size={15} color={Colors.primary} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {formError.length > 0 && (
                    <Text style={styles.errorText}>{formError}</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.joinBtn, joinMutation.isPending && styles.joinBtnDisabled]}
                    onPress={handleJoin}
                    activeOpacity={0.85}
                    disabled={joinMutation.isPending}
                    testID="waitlist-join-btn"
                  >
                    {joinMutation.isPending ? (
                      <Text style={styles.joinBtnText}>Joining...</Text>
                    ) : (
                      <>
                        <Text style={styles.joinBtnText}>Reserve My Spot</Text>
                        <ChevronRight size={18} color={Colors.black} />
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.formDisclaimer}>
                    {'No spam. Unsubscribe anytime. Your data is safe with us.'}
                  </Text>
                </View>
              ) : (
                <Animated.View style={[styles.successCard, { transform: [{ scale: successScale }] }]}>
                  <View style={styles.successIconWrap}>
                    <CheckCircle size={40} color={Colors.success} />
                  </View>
                  <Text style={styles.successTitle}>{"You're on the list!"}</Text>
                  <Text style={styles.successSubtitle}>
                    Welcome, {firstName}! You{"'"}re member{' '}
                    <Text style={styles.successPosition}>#{memberPosition.toLocaleString()}</Text>
                    {' '}in line.
                  </Text>
                  <View style={styles.successDetails}>
                    <View style={styles.successDetailRow}>
                      <Mail size={14} color={Colors.textTertiary} />
                      <Text style={styles.successDetailText}>{email}</Text>
                    </View>
                  </View>
                  <Text style={styles.successNote}>
                    {'We\'ll notify you the moment early access opens. Watch your inbox!'}
                  </Text>
                  <TouchableOpacity
                    style={styles.signupNowBtn}
                    onPress={() => router.push('/signup' as any)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.signupNowBtnText}>{'Create Full Account Now'}</Text>
                    <ChevronRight size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </Animated.View>
              )}

              <View style={styles.memberCountRow}>
                <View style={styles.memberAvatars}>
                  {['#FFD700', '#4A90D9', '#00C48C', '#FF6B6B'].map((c, i) => (
                    <View key={i} style={[styles.memberAvatar, { backgroundColor: c, marginLeft: i === 0 ? 0 : -8 }]} />
                  ))}
                </View>
                <Text style={styles.memberCountText}>
                  <Text style={styles.memberCountHighlight}>{totalMembers.toLocaleString()}+</Text> investors already joined
                </Text>
              </View>
            </Animated.View>

            <View style={styles.featuredPropertySection}>
              <View style={styles.fpHeader}>
                <View style={styles.fpBadge}>
                  <MapPin size={12} color="#FF6B6B" />
                  <Text style={styles.fpBadgeText}>SOUTH FLORIDA EXCLUSIVE</Text>
                </View>
                <Text style={styles.fpSectionTitle}>Featured Listing</Text>
              </View>

              <View style={styles.fpCard}>
                <View style={styles.fpImageWrap}>
                  <Image
                    source={{ uri: FEATURED_PROPERTY.images[propImage] }}
                    style={styles.fpImage}
                    resizeMode="cover"
                  />
                  <View style={styles.fpImageOverlay} />
                  <View style={styles.fpTypeBadge}>
                    <Building2 size={11} color="#FFD700" />
                    <Text style={styles.fpTypeBadgeText}>{FEATURED_PROPERTY.type}</Text>
                  </View>
                  <View style={styles.fpPriceBadge}>
                    <Text style={styles.fpPriceText}>{FEATURED_PROPERTY.price}</Text>
                  </View>
                  <View style={styles.fpDots}>
                    {FEATURED_PROPERTY.images.map((_, i) => (
                      <View key={i} style={[styles.dot, i === propImage && styles.dotActive]} />
                    ))}
                  </View>
                </View>

                <View style={styles.fpDetails}>
                  <View style={styles.fpAddressRow}>
                    <MapPin size={14} color={Colors.primary} />
                    <View>
                      <Text style={styles.fpAddress}>{FEATURED_PROPERTY.address}</Text>
                      <Text style={styles.fpCity}>{FEATURED_PROPERTY.city}</Text>
                    </View>
                  </View>

                  <View style={styles.fpStats}>
                    <View style={styles.fpStat}>
                      <Text style={styles.fpStatVal}>{FEATURED_PROPERTY.beds}</Text>
                      <Text style={styles.fpStatLbl}>Beds</Text>
                    </View>
                    <View style={styles.fpStatDiv} />
                    <View style={styles.fpStat}>
                      <Text style={styles.fpStatVal}>{FEATURED_PROPERTY.baths}</Text>
                      <Text style={styles.fpStatLbl}>Baths</Text>
                    </View>
                    <View style={styles.fpStatDiv} />
                    <View style={styles.fpStat}>
                      <Text style={styles.fpStatVal}>{FEATURED_PROPERTY.sqft}</Text>
                      <Text style={styles.fpStatLbl}>Sq Ft</Text>
                    </View>
                  </View>

                  <View style={styles.jvBox}>
                    <View style={styles.jvBoxLeft}>
                      <Handshake size={18} color="#FFD700" />
                      <View>
                        <Text style={styles.jvTitle}>JV Opportunity</Text>
                        <Text style={styles.jvSubtitle}>Seeking joint venture partner</Text>
                      </View>
                    </View>
                    <View style={styles.jvAmount}>
                      <Text style={styles.jvAmountLabel}>Min Investment</Text>
                      <Text style={styles.jvAmountValue}>{FEATURED_PROPERTY.jvAmount}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.inquireBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedInterest('1_4m_plus');
                      const el = document as any;
                      if (el && el.getElementById) {
                        const form = el.getElementById('investor-form');
                        if (form) form.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  >
                    <DollarSign size={15} color={Colors.black} />
                    <Text style={styles.inquireBtnText}>Inquire as JV Investor</Text>
                    <ChevronRight size={15} color={Colors.black} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <PartnerEarnSection />

            <View style={styles.partnersSection}>
              <Text style={styles.partnersSectionTitle}>Our Partners</Text>
              <TouchableOpacity
                style={styles.partnerCard}
                onPress={() => Linking.openURL('https://www.onestopconstructorsinc.com')}
                activeOpacity={0.8}
              >
                <View style={styles.partnerIconWrap}>
                  <Building2 size={22} color="#FFD700" />
                </View>
                <View style={styles.partnerInfo}>
                  <Text style={styles.partnerName}>One Stop Constructors Inc.</Text>
                  <Text style={styles.partnerDesc}>Licensed general contractor — South Florida</Text>
                </View>
                <ExternalLink size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <LandingAnalytics totalRegistered={totalRegistered} />

            <TouchableOpacity
              style={styles.globalIntelBtn}
              onPress={() => router.push('/global-intelligence' as any)}
              activeOpacity={0.85}
            >
              <Globe size={16} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.globalIntelBtnTitle}>Global Financial Intelligence</Text>
                <Text style={styles.globalIntelBtnSub}>Live forex · indices · crypto · money flow</Text>
              </View>
              <ChevronRight size={16} color={Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.websiteBanner}
              onPress={() => Linking.openURL('https://www.ivxholding.com')}
              activeOpacity={0.8}
            >
              <Globe size={16} color={Colors.primary} />
              <Text style={styles.websiteBannerText}>Visit our website: </Text>
              <Text style={styles.websiteBannerUrl}>www.ivxholding.com</Text>
              <ExternalLink size={13} color={Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.websiteBanner}
              onPress={() => Linking.openURL('tel:+15616443503')}
              activeOpacity={0.8}
            >
              <Phone size={16} color={Colors.primary} />
              <Text style={styles.websiteBannerText}>Call us: </Text>
              <Text style={styles.websiteBannerUrl}>+1 (561) 644-3503</Text>
            </TouchableOpacity>

            <View style={styles.bottomPad} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.ctaContainer}>
        <Animated.View style={[styles.ctaWrap, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            activeOpacity={0.85}
            onPress={() => { trackEvent('cta_get_started'); router.push('/signup' as any); }}
          >
            <Text style={styles.ctaPrimaryText}>{"Get Started — It's Free"}</Text>
            <ChevronRight size={20} color={Colors.black} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctaSecondary}
            activeOpacity={0.75}
            onPress={() => { trackEvent('cta_sign_in'); router.push('/login' as any); }}
          >
            <Text style={styles.ctaSecondaryText}>Already have an account? <Text style={styles.ctaSecondaryLink}>Sign In</Text></Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeTop: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
  },
  logo: {
    width: 52,
    height: 52,
  },
  headerText: {
    flex: 1,
  },
  brand: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveBadgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },
  heroEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '900' as const,
    color: Colors.text,
    lineHeight: 42,
    marginBottom: 14,
  },
  heroTitleGold: {
    color: Colors.primary,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  propertyCarousel: {
    marginHorizontal: 20,
    borderRadius: 20,
    overflow: 'hidden',
    height: 200,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  carouselBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  carouselBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  carouselReturn: {
    position: 'absolute',
    bottom: 40,
    right: 16,
    alignItems: 'flex-end',
  },
  carouselReturnValue: {
    color: Colors.success,
    fontSize: 26,
    fontWeight: '900' as const,
  },
  carouselReturnLabel: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600' as const,
    opacity: 0.8,
  },
  carouselDots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 18,
    backgroundColor: Colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 28,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.surfaceBorder,
  },
  statValue: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '800' as const,
    marginBottom: 4,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
  featuresSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    marginBottom: 16,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featureCard: {
    width: '48%' as any,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 5,
  },
  featureDesc: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 28,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustDivider: {
    width: 1,
    height: 14,
    backgroundColor: Colors.surfaceBorder,
  },
  trustText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  registrationSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  registrationHeader: {
    marginBottom: 20,
  },
  regBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  regBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  regTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900' as const,
    marginBottom: 8,
    lineHeight: 32,
  },
  regSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 18,
    gap: 12,
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    height: 48,
  },
  pickerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 12,
    height: 48,
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerText: {
    color: Colors.text,
    fontSize: 14,
  },
  dropdownList: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primary + '12',
  },
  dropdownItemText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: -4,
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  joinBtnDisabled: {
    opacity: 0.6,
  },
  joinBtnText: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  formDisclaimer: {
    color: Colors.textTertiary,
    fontSize: 11,
    textAlign: 'center',
  },
  successCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.success + '40',
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  successIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.success + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
  },
  successSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  successPosition: {
    color: Colors.primary,
    fontWeight: '800' as const,
  },
  successDetails: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 14,
    width: '100%',
  },
  successDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successDetailText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  successNote: {
    color: Colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  signupNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  signupNowBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  memberCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  memberAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  memberCountText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  memberCountHighlight: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  websiteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  websiteChipText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  globalIntelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary + '12',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  globalIntelBtnTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  globalIntelBtnSub: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: 1,
  },
  websiteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 13,
    paddingHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  websiteBannerText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  websiteBannerUrl: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  featuredPropertySection: {
    marginHorizontal: 20,
    marginBottom: 28,
  },
  fpHeader: {
    marginBottom: 16,
  },
  fpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF6B6B18',
    borderWidth: 1,
    borderColor: '#FF6B6B40',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  fpBadgeText: {
    color: '#FF6B6B',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  fpSectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
  },
  fpCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  fpImageWrap: {
    height: 220,
    position: 'relative',
  },
  fpImage: {
    width: '100%',
    height: '100%',
  },
  fpImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  fpTypeBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFD70050',
  },
  fpTypeBadgeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
  },
  fpPriceBadge: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  fpPriceText: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
  },
  fpDots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  fpDetails: {
    padding: 18,
    gap: 14,
  },
  fpAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  fpAddress: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  fpCity: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  fpStats: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  fpStat: {
    alignItems: 'center',
  },
  fpStatVal: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
  },
  fpStatLbl: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  fpStatDiv: {
    width: 1,
    height: 32,
    backgroundColor: Colors.surfaceBorder,
  },
  jvBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFD70010',
    borderWidth: 1,
    borderColor: '#FFD70030',
    borderRadius: 14,
    padding: 14,
  },
  jvBoxLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  jvTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  jvSubtitle: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  jvAmount: {
    alignItems: 'flex-end',
  },
  jvAmountLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  jvAmountValue: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: '900' as const,
  },
  inquireBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inquireBtnText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  partnersSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  partnersSectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
  },
  partnerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFD70015',
    borderWidth: 1,
    borderColor: '#FFD70030',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  partnerDesc: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  topPropertiesSection: {
    marginHorizontal: 20,
    marginBottom: 28,
  },
  topPropHeader: {
    marginBottom: 18,
  },
  topPropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF6B6B15',
    borderWidth: 1,
    borderColor: '#FF6B6B35',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start' as const,
    marginBottom: 10,
  },
  topPropBadgeText: {
    color: '#FF6B6B',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  topPropTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900' as const,
    marginBottom: 6,
  },
  topPropSubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  topPropCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: 16,
  },
  topPropImageWrap: {
    height: 180,
    position: 'relative' as const,
  },
  topPropImage: {
    width: '100%',
    height: '100%',
  },
  topPropImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topPropStatusChip: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  topPropStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topPropStatusText: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
  },
  topPropHighlightChip: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  topPropHighlightText: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  topPropPriceOverlay: {
    position: 'absolute' as const,
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
    alignItems: 'flex-end' as const,
  },
  topPropPriceLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
  },
  topPropPriceValue: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900' as const,
  },
  topPropContent: {
    padding: 16,
    gap: 14,
  },
  topPropNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  topPropName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    marginBottom: 4,
  },
  topPropLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topPropLoc: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  topPropTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  topPropTypeText: {
    color: Colors.primary,
    fontSize: 9,
    fontWeight: '700' as const,
  },
  topPropMetrics: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  topPropMetric: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 3,
  },
  topPropMetricLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  topPropMetricValue: {
    fontSize: 16,
    fontWeight: '900' as const,
  },
  topPropMetricDiv: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  topPropFundedWrap: {
    gap: 6,
  },
  topPropFundedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topPropFundedLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  topPropFundedPct: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  topPropFundedBarBg: {
    height: 6,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  topPropFundedBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  topPropTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  topPropTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.positive + '10',
    borderWidth: 1,
    borderColor: Colors.positive + '25',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  topPropTagText: {
    color: Colors.positive,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  topPropInvestBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  topPropInvestBtnText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  topPropViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '08',
  },
  topPropViewAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  bottomPad: {
    height: 120,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  ctaPrimary: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ctaPrimaryText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  ctaSecondary: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  ctaSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  ctaSecondaryLink: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
});
