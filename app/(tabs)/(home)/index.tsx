import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Globe,
  Users,
  Award,
  Star,
  CheckCircle2,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { getResponsiveSize, isCompactScreen, isExtraSmallScreen } from '@/lib/responsive';
import { trpc } from '@/lib/trpc';
import { useTranslation } from '@/lib/i18n-context';
import { useAnalytics } from '@/lib/analytics-context';
import PropertyCard from '@/components/PropertyCard';
import { platformStats } from '@/mocks/competitive-stats';
import { properties as fallbackProperties } from '@/mocks/properties';

const IPX_LOGO = require('@/assets/images/ipx-logo.jpg');

function LiveStatsTicker({ t }: { t: (key: any) => string }) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (width <= 0) return;
    scrollAnim.setValue(0);
    const animation = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: -width * 2,
        duration: 25000,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [width]);

  const translatedStats = useMemo(() => {
    const labelKeys = ['totalInvestors', 'propertiesTokenized', 'avgAnnualReturn', 'dividendsPaid'] as const;
    return platformStats.slice(0, 4).map((stat, i) => ({
      ...stat,
      label: t(labelKeys[i]),
    }));
  }, [t]);

  return (
    <View style={styles.tickerContainer}>
      <View style={styles.tickerInner}>
        <Animated.View style={[styles.tickerScroll, { transform: [{ translateX: scrollAnim }] }]}>
          {[...translatedStats, ...translatedStats, ...translatedStats].map((stat, i) => (
            <View key={i} style={styles.tickerItem}>
              <Text style={styles.tickerValue}>{stat.value}</Text>
              <Text style={styles.tickerLabel}>{stat.label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

function SocialProofBanner({ t }: { t: (key: any) => string }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <View style={styles.socialProofRow}>
      <View style={styles.socialProofItem}>
        <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
        <Text style={styles.socialProofText}>
          <Text style={styles.socialProofBold}>2,847</Text> {t('investorsOnline')}
        </Text>
      </View>
      <View style={styles.socialProofDivider} />
      <View style={styles.socialProofItem}>
        <Star size={12} color={Colors.primary} />
        <Text style={styles.socialProofText}>
          <Text style={styles.socialProofBold}>4.9</Text> App Store
        </Text>
      </View>
    </View>
  );
}

const QuickActionCard = React.memo(({ icon, title, subtitle, color, onPress }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) => (
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
));

function WhyIPXSection({ onCompare, onSmart, onTrust, t }: { onCompare: () => void; onSmart: () => void; onTrust: () => void; t: (key: any) => string }) {
  return (
    <View style={styles.whySection}>
      <Text style={styles.whySectionTitle}>{t('whyChooseUs')}</Text>
      <View style={styles.quickActionsGrid}>
        <QuickActionCard
          icon={<BarChart3 size={20} color="#4ECDC4" />}
          title={t('beatsSnP')}
          subtitle={t('beatsSnPDesc')}
          color="#4ECDC4"
          onPress={onCompare}
        />
        <QuickActionCard
          icon={<Brain size={20} color={Colors.primary} />}
          title={t('aiPowered')}
          subtitle={t('aiPoweredDesc')}
          color={Colors.primary}
          onPress={onSmart}
        />
        <QuickActionCard
          icon={<Shield size={20} color="#45B7D1" />}
          title={t('bankGradeSecurity')}
          subtitle={t('bankGradeSecurityDesc')}
          color="#45B7D1"
          onPress={onTrust}
        />
        <QuickActionCard
          icon={<Zap size={20} color="#FF6B6B" />}
          title={t('trading247')}
          subtitle={t('trading247Desc')}
          color="#FF6B6B"
          onPress={onCompare}
        />
      </View>
    </View>
  );
}

function TrustBadgesRow({ t }: { t: (key: any) => string }) {
  return (
    <View style={styles.trustBadgesContainer}>
      <View style={styles.trustBadge}>
        <Shield size={14} color={Colors.success} />
        <Text style={styles.trustBadgeText}>{t('secCompliant')}</Text>
      </View>
      <View style={styles.trustBadge}>
        <CheckCircle2 size={14} color={Colors.success} />
        <Text style={styles.trustBadgeText}>{t('fdicEscrow')}</Text>
      </View>
      <View style={styles.trustBadge}>
        <Award size={14} color={Colors.success} />
        <Text style={styles.trustBadgeText}>{t('audited')}</Text>
      </View>
    </View>
  );
}

function PerformanceBanner({ onPress, t }: { onPress: () => void; t: (key: any) => string }) {
  return (
    <TouchableOpacity style={styles.performanceBanner} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.performanceLeft}>
        <View style={styles.performanceIconContainer}>
          <TrendingUp size={18} color={Colors.success} />
        </View>
        <View>
          <Text style={styles.performanceTitle}>{t('ipxIndex')}</Text>
          <Text style={styles.performanceSubtitle}>{t('realTimePerformance')}</Text>
        </View>
      </View>
      <View style={styles.performanceRight}>
        <Text style={styles.performanceValue}>+14.5%</Text>
        <Text style={styles.performanceLabel}>{t('ytdReturn')}</Text>
      </View>
    </TouchableOpacity>
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
      <Text style={styles.testimonialText}>"{t(testimonial.textKey)}"</Text>
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
  const { trackScreen, trackAction } = useAnalytics();
  const screenSize = getResponsiveSize(width);
  const isCompact = isCompactScreen(screenSize);
  const isXs = isExtraSmallScreen(screenSize);

  useEffect(() => {
    trackScreen('Home');
  }, []);

  const propertiesQuery = trpc.properties.list.useQuery({ page: 1, limit: 20 }, {
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
  const unreadQuery = trpc.notifications.getUnreadCount.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 1000 * 60 * 10,
    meta: { skipGlobalErrorHandler: true },
  });

  const rawProperties = (propertiesQuery.data?.properties as typeof fallbackProperties | undefined) ?? fallbackProperties;
  const properties = Array.isArray(rawProperties) ? rawProperties : fallbackProperties;
  const unreadNotifications = unreadQuery.data?.count ?? 3;

  const featuredProperties = useMemo(() => (properties ?? []).filter((p: { status?: string }) => (p?.status ?? '').toLowerCase() === 'live').slice(0, 3), [properties]);
  const comingSoonProperties = useMemo(() => (properties ?? []).filter((p: { status?: string }) => (p?.status ?? '').toLowerCase() === 'coming_soon').slice(0, 2), [properties]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([propertiesQuery.refetch(), unreadQuery.refetch()])
      .finally(() => setRefreshing(false));
  };

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
          <View style={[styles.welcomeSection, { paddingHorizontal: isXs ? 16 : 20 }]}>
            <Text style={[styles.welcomeText, { fontSize: isXs ? 22 : isCompact ? 24 : 28 }]}>{t('ownRealEstate')}</Text>
            <Text style={[styles.welcomeHighlight, { fontSize: isXs ? 22 : isCompact ? 24 : 28 }]}>{t('tradeLikeCrypto')}</Text>
            <Text style={[styles.welcomeSubtext, { fontSize: isXs ? 12 : 14 }]}>
              {t('homeSubtext')}
            </Text>
          </View>

          <SocialProofBanner t={t} />
          <TrustBadgesRow t={t} />

          <View style={{ paddingHorizontal: isXs ? 16 : 20, marginBottom: 20 }}>
            <PerformanceBanner onPress={() => router.push('/compare-investments' as any)} t={t} />
          </View>

          <LiveStatsTicker t={t} />

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

          <View style={{ paddingHorizontal: isXs ? 16 : 20 }}>
            <WhyIPXSection
              onCompare={() => router.push('/compare-investments' as any)}
              onSmart={() => router.push('/smart-investing' as any)}
              onTrust={() => router.push('/trust-center' as any)}
              t={t}
            />
          </View>

          <View style={{ paddingHorizontal: isXs ? 16 : 20, marginBottom: 20 }}>
            <InvestorTestimonial t={t} />
          </View>

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
    paddingBottom: 16,
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
  welcomeSubtext: {
    color: Colors.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  socialProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 12,
    flexWrap: 'wrap',
  },
  socialProofItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  socialProofText: {
    color: Colors.textSecondary,
    fontSize: 12,
    flexShrink: 1,
  },
  socialProofBold: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  socialProofDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.surfaceBorder,
  },
  trustBadgesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  trustBadgeText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
    flexShrink: 1,
  },
  performanceBanner: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  performanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  performanceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  performanceTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    flexShrink: 1,
  },
  performanceSubtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
    flexShrink: 1,
  },
  performanceRight: {
    alignItems: 'flex-end',
  },
  performanceValue: {
    color: Colors.success,
    fontSize: 20,
    fontWeight: '800' as const,
  },
  performanceLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  tickerContainer: {
    height: 56,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tickerInner: {
    flex: 1,
    justifyContent: 'center',
  },
  tickerScroll: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerItem: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  tickerValue: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  tickerLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: 2,
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
    height: 40,
  },
  scrollView: {
    backgroundColor: Colors.background,
  },
});
