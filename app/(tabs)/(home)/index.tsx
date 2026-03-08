import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronRight,
  Sparkles,
  Shield,
  TrendingUp,
  Brain,
  Zap,
  BarChart3,
  Users,
  Award,
  Star,
  CheckCircle2,
  MapPin,
  ArrowUpRight,
  Wallet,
  Lock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { getResponsiveSize, isCompactScreen, isExtraSmallScreen } from '@/lib/responsive';
import { trpc } from '@/lib/trpc';
import { useInstantCache } from '@/lib/use-instant-query';
import { useTranslation } from '@/lib/i18n-context';
import { useAnalytics } from '@/lib/analytics-context';
import { useIPX } from '@/lib/ipx-context';
import { useAuth } from '@/lib/auth-context';
import PropertyCard from '@/components/PropertyCard';
import { formatCurrency } from '@/lib/formatters';
import { properties as fallbackProperties } from '@/mocks/properties';
import { SAMPLE_JV_AGREEMENTS, JVAgreement } from '@/mocks/jv-agreements';

const IPX_LOGO = require('@/assets/images/ivx-logo.png');

function PortfolioSnapshot({ router }: { router: ReturnType<typeof useRouter> }) {
  const { holdings, getTotalIPXValue, getTotalIPXPnL, getTotalIPXPnLPercent } = useIPX();
  const { isAuthenticated } = useAuth();
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const hasHoldings = holdings.length > 0 && isAuthenticated;
  const totalValue = getTotalIPXValue;
  const totalPnL = getTotalIPXPnL;
  const pnlPercent = getTotalIPXPnLPercent;
  const isPositive = totalPnL >= 0;

  if (!isAuthenticated) {
    return (
      <Animated.View style={[psStyles.container, psStyles.ctaContainer, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={psStyles.ctaLeft}>
          <View style={psStyles.ctaIconWrap}>
            <Wallet size={22} color={Colors.primary} />
          </View>
          <View style={psStyles.ctaTextWrap}>
            <Text style={psStyles.ctaTitle}>Start Investing Today</Text>
            <Text style={psStyles.ctaSubtitle}>From $1 — Own real estate globally</Text>
          </View>
        </View>
        <TouchableOpacity
          style={psStyles.ctaButton}
          onPress={() => router.push('/signup' as any)}
          activeOpacity={0.8}
          testID="portfolio-cta-signup"
        >
          <Text style={psStyles.ctaButtonText}>Get Started</Text>
          <ArrowUpRight size={14} color={Colors.black} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (!hasHoldings) {
    return (
      <Animated.View style={[psStyles.container, psStyles.ctaContainer, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={psStyles.ctaLeft}>
          <View style={psStyles.ctaIconWrap}>
            <TrendingUp size={22} color={Colors.success} />
          </View>
          <View style={psStyles.ctaTextWrap}>
            <Text style={psStyles.ctaTitle}>Build Your Portfolio</Text>
            <Text style={psStyles.ctaSubtitle}>Browse properties and start earning</Text>
          </View>
        </View>
        <TouchableOpacity
          style={psStyles.ctaButton}
          onPress={() => router.push('/(tabs)/market' as any)}
          activeOpacity={0.8}
          testID="portfolio-cta-invest"
        >
          <Text style={psStyles.ctaButtonText}>Explore</Text>
          <ArrowUpRight size={14} color={Colors.black} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[psStyles.container, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={psStyles.portfolioCard}
        onPress={() => router.push('/(tabs)/portfolio' as any)}
        activeOpacity={0.85}
        testID="portfolio-snapshot"
      >
        <View style={psStyles.portfolioHeader}>
          <Text style={psStyles.portfolioLabel}>Your Portfolio</Text>
          <View style={psStyles.holdingsCount}>
            <Text style={psStyles.holdingsCountText}>{holdings.length} {holdings.length === 1 ? 'property' : 'properties'}</Text>
          </View>
        </View>
        <Text style={psStyles.portfolioValue}>{formatCurrency(totalValue)}</Text>
        <View style={psStyles.pnlRow}>
          <View style={[psStyles.pnlBadge, { backgroundColor: isPositive ? Colors.success + '18' : Colors.error + '18' }]}>
            <TrendingUp size={12} color={isPositive ? Colors.success : Colors.error} />
            <Text style={[psStyles.pnlText, { color: isPositive ? Colors.success : Colors.error }]}>
              {isPositive ? '+' : ''}{formatCurrency(totalPnL)} ({pnlPercent.toFixed(2)}%)
            </Text>
          </View>
          <Text style={psStyles.pnlLabel}>All time</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const psStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    paddingHorizontal: 16,
    marginHorizontal: 0,
  },
  ctaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  ctaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextWrap: {
    flex: 1,
  },
  ctaTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  ctaSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  ctaButtonText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  portfolioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  portfolioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  portfolioLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  holdingsCount: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  holdingsCountText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  portfolioValue: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: -1,
    marginBottom: 8,
  },
  pnlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pnlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pnlText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  pnlLabel: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
});

function InlineTrustBadges({ t }: { t: (key: any) => string }) {
  return (
    <View style={styles.inlineTrustRow}>
      <View style={styles.inlineTrustBadge}>
        <Shield size={12} color={Colors.success} />
        <Text style={styles.inlineTrustText}>{t('secCompliant')}</Text>
      </View>
      <View style={styles.inlineTrustDot} />
      <View style={styles.inlineTrustBadge}>
        <CheckCircle2 size={12} color={Colors.success} />
        <Text style={styles.inlineTrustText}>{t('fdicEscrow')}</Text>
      </View>
      <View style={styles.inlineTrustDot} />
      <View style={styles.inlineTrustBadge}>
        <Award size={12} color={Colors.success} />
        <Text style={styles.inlineTrustText}>{t('audited')}</Text>
      </View>
    </View>
  );
}

const QuickActionCard = React.memo(function QuickActionCard({ icon, title, subtitle, color, onPress }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.quickAction}
      onPress={onPress}
      activeOpacity={0.7}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      accessibilityHint="Opens details"
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + '15' }]}>
        {icon}
      </View>
      <Text style={styles.quickActionTitle}>{title}</Text>
      <Text style={styles.quickActionSubtitle} numberOfLines={2}>{subtitle}</Text>
      <View style={styles.quickActionArrow}>
        <ChevronRight size={14} color={Colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
});

const JV_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#9A9A9A' },
  pending_review: { label: 'Pending', color: '#FFB800' },
  active: { label: 'Active', color: '#00C48C' },
  completed: { label: 'Completed', color: '#4A90D9' },
  expired: { label: 'Expired', color: '#FF4D4D' },
};

class JVErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.log('[JV Section] Error caught:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ padding: 20 }}>
          <Text style={{ color: Colors.textSecondary, textAlign: 'center' }}>JV section temporarily unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const JVPropertyCard = React.memo(function JVPropertyCard({ agreement, onPress }: { agreement: JVAgreement; onPress: () => void }) {
  const status = JV_STATUS_CONFIG[agreement.status] ?? JV_STATUS_CONFIG.draft;
  const partnerCount = agreement.partners?.length ?? 0;
  const totalFormatted = agreement.totalInvestment >= 1000000
    ? `${(agreement.totalInvestment / 1000000).toFixed(1)}M`
    : `${(agreement.totalInvestment / 1000).toFixed(0)}K`;

  return (
    <TouchableOpacity
      style={jvStyles.card}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`jv-card-${agreement.id}`}
    >
      <View style={jvStyles.cardHeader}>
        <View style={jvStyles.iconWrap}>
          <Users size={18} color={Colors.primary} />
        </View>
        <View style={[jvStyles.statusBadge, { backgroundColor: status.color + '20' }]}>
          <View style={[jvStyles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[jvStyles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <Text style={jvStyles.cardTitle} numberOfLines={1}>{agreement.projectName}</Text>
      <Text style={jvStyles.cardSubtitle} numberOfLines={1}>{agreement.title}</Text>

      {agreement.propertyAddress ? (
        <View style={jvStyles.addressRow}>
          <MapPin size={10} color={Colors.textTertiary} />
          <Text style={jvStyles.addressText} numberOfLines={1}>{agreement.propertyAddress}</Text>
        </View>
      ) : null}

      <View style={jvStyles.metricsRow}>
        <View style={jvStyles.metric}>
          <Text style={jvStyles.metricValue}>${totalFormatted}</Text>
          <Text style={jvStyles.metricLabel}>Investment</Text>
        </View>
        <View style={jvStyles.metricDivider} />
        <View style={jvStyles.metric}>
          <Text style={[jvStyles.metricValue, { color: Colors.success }]}>{agreement.expectedROI}%</Text>
          <Text style={jvStyles.metricLabel}>ROI</Text>
        </View>
        <View style={jvStyles.metricDivider} />
        <View style={jvStyles.metric}>
          <Text style={jvStyles.metricValue}>{partnerCount}</Text>
          <Text style={jvStyles.metricLabel}>Partners</Text>
        </View>
      </View>

      <View style={jvStyles.partnersPreview}>
        {(agreement.partners ?? []).slice(0, 3).map((p, i) => (
          <View key={p.id} style={[jvStyles.partnerChip, i > 0 ? { marginLeft: -6 } : undefined]}>
            <Text style={jvStyles.partnerInitial}>{p.name.charAt(0)}</Text>
          </View>
        ))}
        {partnerCount > 3 ? (
          <Text style={jvStyles.morePartners}>+{partnerCount - 3}</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text style={jvStyles.typeLabel}>{(agreement.type ?? '').replace('_', ' ').toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );
});

const jvStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  card: {
    width: 260,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  cardSubtitle: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  addressText: {
    color: Colors.textTertiary,
    fontSize: 10,
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.surfaceBorder,
  },
  partnersPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary + '30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  partnerInitial: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800' as const,
  },
  morePartners: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
    marginLeft: 4,
  },
  typeLabel: {
    color: Colors.textTertiary,
    fontSize: 8,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});

function WhyIPXSection({ onCompare, onSmart, onTrust, t }: { onCompare: () => void; onSmart: () => void; onTrust: () => void; t: (key: any) => string }) {
  return (
    <View style={styles.whySection}>
      <Text style={styles.whySectionTitle}>{t('whyChooseUs')}</Text>
      <View style={styles.quickActionsGrid}>
        <QuickActionCard
          icon={<Brain size={20} color={Colors.primary} />}
          title="AI Investing"
          subtitle="Smart analysis picks the best deals for you"
          color={Colors.primary}
          onPress={onSmart}
        />
        <QuickActionCard
          icon={<Lock size={20} color="#45B7D1" />}
          title="Secure Escrow"
          subtitle="FDIC-insured escrow protects every dollar"
          color="#45B7D1"
          onPress={onTrust}
        />
        <QuickActionCard
          icon={<BarChart3 size={20} color="#4ECDC4" />}
          title="Beating Markets"
          subtitle="14.5% avg returns vs 10% S&P 500"
          color="#4ECDC4"
          onPress={onCompare}
        />
        <QuickActionCard
          icon={<Zap size={20} color="#FF6B6B" />}
          title="Instant Liquidity"
          subtitle="Trade shares 24/7 — no lockup periods"
          color="#FF6B6B"
          onPress={onCompare}
        />
      </View>
    </View>
  );
}

const TESTIMONIAL_KEYS = [
  { name: 'Sarah K.', location: 'New York', textKey: 'testimonial1Text' as const, rating: 5 },
  { name: 'Ahmed R.', location: 'Dubai', textKey: 'testimonial2Text' as const, rating: 5 },
  { name: 'Lisa M.', location: 'London', textKey: 'testimonial3Text' as const, rating: 5 },
];

function InvestorTestimonial({ t }: { t: (key: any) => string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent(prev => (prev + 1) % TESTIMONIAL_KEYS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const testimonial = TESTIMONIAL_KEYS[current];

  return (
    <View style={styles.testimonialCard}>
      <View style={styles.testimonialHeader}>
        <Users size={16} color={Colors.primary} />
        <Text style={styles.testimonialSectionTitle}>{t('investorStories')}</Text>
      </View>
      <View style={styles.testimonialStars}>
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star key={i} size={14} color={Colors.primary} fill={Colors.primary} />
        ))}
      </View>
      <Text style={styles.testimonialText}>{`"${t(testimonial.textKey)}"`}</Text>
      <Text style={styles.testimonialAuthor}>{testimonial.name} — {testimonial.location}</Text>
      <View style={styles.testimonialDots}>
        {TESTIMONIAL_KEYS.map((_, i) => (
          <View key={i} style={[styles.testimonialDot, i === current && styles.testimonialDotActive]} />
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();
  const { trackScreen } = useAnalytics();
  const screenSize = getResponsiveSize(width);
  const isCompact = isCompactScreen(screenSize);
  const isXs = isExtraSmallScreen(screenSize);

  useEffect(() => {
    trackScreen('Home');
  }, [trackScreen]);

  const propertiesQuery = trpc.properties.list.useQuery({ page: 1, limit: 20 }, {
    retry: 1,
    staleTime: 1000 * 60 * 2,
    placeholderData: (prev) => prev,
    meta: { skipGlobalErrorHandler: true },
  });
  const unreadQuery = trpc.notifications.getUnreadCount.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 1000 * 60 * 10,
    placeholderData: (prev) => prev,
    meta: { skipGlobalErrorHandler: true },
  });

  const cachedProperties = useInstantCache('home_properties', propertiesQuery.data, propertiesQuery.isSuccess);
  const cachedUnread = useInstantCache('home_unread', unreadQuery.data, unreadQuery.isSuccess);

  const rawProperties = (cachedProperties?.properties as typeof fallbackProperties | undefined) ?? fallbackProperties;
  const properties = Array.isArray(rawProperties) ? rawProperties : fallbackProperties;
  const unreadNotifications = cachedUnread?.count ?? 3;

  const featuredProperties = useMemo(() => (properties ?? []).filter((p: { status?: string }) => (p?.status ?? '').toLowerCase() === 'live').slice(0, 3), [properties]);
  const comingSoonProperties = useMemo(() => (properties ?? []).filter((p: { status?: string }) => (p?.status ?? '').toLowerCase() === 'coming_soon').slice(0, 2), [properties]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([propertiesQuery.refetch(), unreadQuery.refetch()])
      .finally(() => setRefreshing(false));
  }, [propertiesQuery, unreadQuery]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: isXs ? 12 : 16 }]}>
          <View style={styles.brandContainer}>
            <Image
              source={IPX_LOGO}
              style={[styles.brandLogo, { width: isXs ? 44 : 55, height: isXs ? 44 : 55 }]}
              resizeMode="contain"
              accessibilityLabel="IVX HOLDINGS LLC logo"
            />
            <Text style={[styles.brandName, { fontSize: isXs ? 14 : isCompact ? 16 : 18 }]}>IVX HOLDINGS LLC</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={() => router.push('/notifications' as any)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} unread` : 'Notifications'}
            accessibilityHint="Opens notifications screen"
            testID="home-notification-button"
          >
            <Bell size={isXs ? 22 : 26} color={Colors.text} />
            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadNotifications}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {/* 1. Tagline + Inline Trust */}
          <View style={[styles.welcomeSection, { paddingHorizontal: isXs ? 16 : 20 }]}>
            <Text style={[styles.welcomeText, { fontSize: isXs ? 22 : isCompact ? 24 : 28 }]}>{t('ownRealEstate')}</Text>
            <Text style={[styles.welcomeHighlight, { fontSize: isXs ? 22 : isCompact ? 24 : 28 }]}>{t('tradeLikeCrypto')}</Text>
            <InlineTrustBadges t={t} />
          </View>

          {/* 2. Portfolio Snapshot / CTA */}
          <PortfolioSnapshot router={router} />

          {/* 3. Featured Properties — your product, front and center */}
          <View style={styles.featuredSection}>
            <View style={[styles.sectionHeader, { paddingHorizontal: isXs ? 16 : 20 }]}>
              <View style={styles.sectionTitleContainer}>
                <Sparkles size={isXs ? 16 : 18} color={Colors.primary} />
                <Text style={[styles.sectionTitle, { fontSize: isXs ? 16 : 18 }]}>{t('featuredProperties')}</Text>
              </View>
              <TouchableOpacity style={styles.seeAllButton} onPress={() => router.push('/(tabs)/market' as any)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="See all properties"
                accessibilityHint="Opens the market screen"
                testID="see-all-properties"
              >
                <Text style={[styles.seeAllText, { fontSize: isXs ? 12 : 14 }]}>{t('seeAll')}</Text>
                <ChevronRight size={isXs ? 14 : 16} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.featuredScroll, { paddingHorizontal: isXs ? 16 : 20 }]}
            >
              {featuredProperties.map(property => (
                <PropertyCard key={property.id} property={property} variant="compact" isCompact={isCompact} />
              ))}
            </ScrollView>
          </View>

          {/* 4. JV Deals */}
          <JVErrorBoundary>
            <View style={jvStyles.section}>
              <View style={[styles.sectionHeader, { paddingHorizontal: isXs ? 16 : 20 }]}>
                <View style={styles.sectionTitleContainer}>
                  <Users size={isXs ? 16 : 18} color={Colors.primary} />
                  <Text style={[styles.sectionTitle, { fontSize: isXs ? 16 : 18 }]}>JV Deals</Text>
                </View>
                <TouchableOpacity
                  style={styles.seeAllButton}
                  onPress={() => router.push('/jv-agreement' as any)}
                  testID="see-all-jv"
                >
                  <Text style={[styles.seeAllText, { fontSize: isXs ? 12 : 14 }]}>See All</Text>
                  <ChevronRight size={isXs ? 14 : 16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: isXs ? 16 : 20 }}
              >
                {SAMPLE_JV_AGREEMENTS.map(jv => (
                  <JVPropertyCard
                    key={jv.id}
                    agreement={jv}
                    onPress={() => router.push('/jv-agreement' as any)}
                  />
                ))}
              </ScrollView>
            </View>
          </JVErrorBoundary>

          {/* 5. Why IVX — 4 compelling cards */}
          <View style={{ paddingHorizontal: isXs ? 16 : 20 }}>
            <WhyIPXSection
              onCompare={() => router.push('/compare-investments' as any)}
              onSmart={() => router.push('/smart-investing' as any)}
              onTrust={() => router.push('/trust-center' as any)}
              t={t}
            />
          </View>

          {/* 6. Testimonials */}
          <View style={{ paddingHorizontal: isXs ? 16 : 20, marginBottom: 20 }}>
            <InvestorTestimonial t={t} />
          </View>

          {/* 7. Coming Soon */}
          {comingSoonProperties.length > 0 && (
            <View style={[styles.comingSoonSection, { paddingHorizontal: isXs ? 16 : 20 }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { fontSize: isXs ? 16 : 18 }]}>{t('comingSoon')}</Text>
              </View>
              {comingSoonProperties.map(property => (
                <PropertyCard key={property.id} property={property} isCompact={isCompact} />
              ))}
            </View>
          )}

          {/* 8. Owner CTA */}
          <View style={{ paddingHorizontal: isXs ? 16 : 20, marginBottom: 20 }}>
            <TouchableOpacity
              style={styles.ownerCTA}
              onPress={() => router.push('/trust-center' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.ownerCTALeft}>
                <View style={styles.ownerCTAIcon}>
                  <Shield size={20} color={Colors.primary} />
                </View>
                <View style={styles.ownerCTAMeta}>
                  <Text style={styles.ownerCTATitle}>{t('propertyOwners')}</Text>
                  <Text style={styles.ownerCTASubtitle}>{t('protectEquity')}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    borderRadius: 12,
  },
  brandName: {
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: 1,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  welcomeSection: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  welcomeText: {
    fontWeight: '800' as const,
    color: Colors.text,
    lineHeight: 32,
  },
  welcomeHighlight: {
    fontWeight: '800' as const,
    color: Colors.primary,
    lineHeight: 32,
  },
  inlineTrustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  inlineTrustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineTrustText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  inlineTrustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },
  comingSoonSection: {
    marginBottom: 20,
  },
  featuredSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700' as const,
    color: Colors.text,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  featuredScroll: {
    gap: 0,
  },
  whySection: {
    marginBottom: 8,
  },
  whySectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 14,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickAction: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    width: '48%' as any,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 4,
    paddingRight: 16,
  },
  quickActionSubtitle: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  quickActionArrow: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
  testimonialCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  testimonialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  testimonialSectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  testimonialStars: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 8,
  },
  testimonialText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  testimonialAuthor: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  testimonialDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  testimonialDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceBorder,
  },
  testimonialDotActive: {
    backgroundColor: Colors.primary,
    width: 18,
  },
  ownerCTA: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  ownerCTALeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  ownerCTAIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerCTAMeta: {
    flex: 1,
    minWidth: 0,
  },
  ownerCTATitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  ownerCTASubtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  bottomPadding: {
    height: 120,
  },
  scrollView: {
    backgroundColor: Colors.background,
  },
});
