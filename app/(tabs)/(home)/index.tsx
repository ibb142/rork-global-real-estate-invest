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
  DollarSign,
  Landmark,
  Coins,
  ArrowRight,
  Handshake,
  Globe,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { getResponsiveSize, isCompactScreen, isExtraSmallScreen } from '@/lib/responsive';
import { useQuery } from '@tanstack/react-query';
import { fetchJVDeals } from '@/lib/jv-storage';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n-context';
import { useAnalytics } from '@/lib/analytics-context';
import { useIPX } from '@/lib/ipx-context';
import { useAuth } from '@/lib/auth-context';
import PropertyCard from '@/components/PropertyCard';
import QuickBuyModal from '@/components/QuickBuyModal';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';
import { properties as fallbackProperties } from '@/mocks/properties';
import { JVAgreement } from '@/mocks/jv-agreements';

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

const JVPropertyCard = React.memo(function JVPropertyCard({ agreement, onPress, onInvest, onQuickBuy }: { agreement: JVAgreement; onPress: () => void; onInvest?: () => void; onQuickBuy?: () => void }) {
  if (!agreement || !agreement.id) {
    console.warn('[JVPropertyCard] Invalid agreement data, skipping render');
    return null;
  }
  const status = JV_STATUS_CONFIG[agreement.status] ?? JV_STATUS_CONFIG.draft;
  const partners = Array.isArray(agreement.partners) ? agreement.partners : [];
  const partnerCount = partners.length;
  const totalFormatted = formatCurrencyCompact(agreement.totalInvestment ?? 0);
  const photos = Array.isArray(agreement.photos) ? agreement.photos : [];
  const heroPhoto = photos.length > 0 ? photos[0] : null;

  return (
    <TouchableOpacity
      style={jvStyles.card}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`jv-card-${agreement.id}`}
    >
      {heroPhoto ? (
        <View style={jvStyles.imageWrap}>
          <Image source={{ uri: heroPhoto }} style={jvStyles.heroImage} resizeMode="cover" />
          <View style={jvStyles.imageOverlay} />
          <View style={jvStyles.imageBadgeRow}>
            <View style={[jvStyles.statusBadge, { backgroundColor: status.color + '22' }]}>
              <View style={[jvStyles.statusDot, { backgroundColor: status.color }]} />
              <Text style={[jvStyles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
            {photos.length > 1 ? (
              <View style={jvStyles.photoCountBadge}>
                <Text style={jvStyles.photoCountText}>{photos.length} photos</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={jvStyles.cardHeaderNoImage}>
          <View style={jvStyles.iconWrap}>
            <Users size={18} color={Colors.primary} />
          </View>
          <View style={[jvStyles.statusBadge, { backgroundColor: status.color + '22' }]}>
            <View style={[jvStyles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[jvStyles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      )}

      <View style={jvStyles.cardBody}>
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
            <Text style={jvStyles.metricValue}>{totalFormatted}</Text>
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
          {partners.slice(0, 3).map((p, i) => (
            <View key={p.id || `partner-${i}`} style={[jvStyles.partnerChip, i > 0 ? { marginLeft: -6 } : undefined]}>
              <Text style={jvStyles.partnerInitial}>{(p.name || 'P').charAt(0)}</Text>
            </View>
          ))}
          {partnerCount > 3 ? (
            <Text style={jvStyles.morePartners}>+{partnerCount - 3}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={jvStyles.typeLabel}>{(agreement.type ?? '').replace('_', ' ').toUpperCase()}</Text>
        </View>

        <View style={jvStyles.investBtnRow}>
          {onQuickBuy && (
            <TouchableOpacity
              style={jvStyles.quickBuyBtn}
              onPress={() => { onQuickBuy(); }}
              activeOpacity={0.8}
              testID={`jv-quick-buy-${agreement.id}`}
            >
              <Zap size={13} color="#000" />
              <Text style={jvStyles.quickBuyBtnText}>Buy Now</Text>
            </TouchableOpacity>
          )}
          {onInvest && (
            <TouchableOpacity
              style={jvStyles.detailsBtn}
              onPress={() => { onInvest(); }}
              activeOpacity={0.8}
              testID={`jv-invest-${agreement.id}`}
            >
              <DollarSign size={14} color={Colors.primary} />
              <Text style={jvStyles.detailsBtnText}>Invest</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const jvStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  card: {
    width: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden' as const,
  },
  imageWrap: {
    width: '100%',
    height: 140,
    position: 'relative' as const,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: 'transparent',
  },
  imageBadgeRow: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoCountBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  photoCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600' as const,
  },
  cardBody: {
    padding: 14,
  },
  cardHeaderNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    marginBottom: 4,
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
  investBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickBuyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  quickBuyBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800' as const,
  },
  detailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  detailsBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
  },
});

function QuickInvestSection({ router, jvDeals, jvDealsLoading, isXs, onQuickBuy }: {
  router: ReturnType<typeof useRouter>;
  jvDeals: JVAgreement[];
  jvDealsLoading: boolean;
  isXs: boolean;
  onQuickBuy?: (deal: JVAgreement) => void;
}) {
  const liveDeals = useMemo(() => jvDeals.filter(d => d.status === 'active' || d.status === 'pending_review').slice(0, 3), [jvDeals]);

  return (
    <View style={qiStyles.container}>
      <View style={[qiStyles.header, { paddingHorizontal: isXs ? 16 : 20 }]}>
        <View style={qiStyles.titleRow}>
          <Landmark size={18} color={Colors.primary} />
          <Text style={qiStyles.title}>Invest Now</Text>
        </View>
        <TouchableOpacity
          style={qiStyles.seeAllBtn}
          onPress={() => router.push('/(tabs)/invest' as any)}
          testID="quick-invest-see-all"
        >
          <Text style={qiStyles.seeAllText}>All Options</Text>
          <ChevronRight size={14} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: isXs ? 16 : 20, gap: 12 }}
      >
        <TouchableOpacity
          style={qiStyles.actionCard}
          onPress={() => router.push('/(tabs)/market' as any)}
          activeOpacity={0.8}
          testID="quick-buy-shares"
        >
          <View style={[qiStyles.actionIconWrap, { backgroundColor: '#00C48C18' }]}>
            <Coins size={22} color="#00C48C" />
          </View>
          <Text style={qiStyles.actionTitle}>Buy Property Shares</Text>
          <Text style={qiStyles.actionDesc}>From $1 — fractional ownership in premium real estate</Text>
          <View style={qiStyles.actionCta}>
            <Text style={qiStyles.actionCtaText}>Browse Properties</Text>
            <ArrowRight size={14} color={Colors.primary} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={qiStyles.actionCard}
          onPress={() => router.push('/jv-agreement' as any)}
          activeOpacity={0.8}
          testID="quick-jv-invest"
        >
          <View style={[qiStyles.actionIconWrap, { backgroundColor: '#FFD70018' }]}>
            <Handshake size={22} color="#FFD700" />
          </View>
          <Text style={qiStyles.actionTitle}>JV Partnerships</Text>
          <Text style={qiStyles.actionDesc}>Direct equity stake — partner on live real estate deals</Text>
          <View style={qiStyles.actionCta}>
            <Text style={qiStyles.actionCtaText}>View JV Deals</Text>
            <ArrowRight size={14} color={Colors.primary} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={qiStyles.actionCard}
          onPress={() => router.push('/smart-investing' as any)}
          activeOpacity={0.8}
          testID="quick-smart-invest"
        >
          <View style={[qiStyles.actionIconWrap, { backgroundColor: '#4A90D918' }]}>
            <Globe size={22} color="#4A90D9" />
          </View>
          <Text style={qiStyles.actionTitle}>Smart Investing</Text>
          <Text style={qiStyles.actionDesc}>AI-powered portfolio — auto-diversify across top deals</Text>
          <View style={qiStyles.actionCta}>
            <Text style={qiStyles.actionCtaText}>Get Started</Text>
            <ArrowRight size={14} color={Colors.primary} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      {!jvDealsLoading && liveDeals.length > 0 && (
        <View style={[qiStyles.liveDealsWrap, { paddingHorizontal: isXs ? 16 : 20 }]}>
          <View style={qiStyles.liveDealsBanner}>
            <View style={qiStyles.livePulse} />
            <Text style={qiStyles.liveBannerText}>{liveDeals.length} Live Deal{liveDeals.length > 1 ? 's' : ''} — Open for Investment</Text>
          </View>
          {liveDeals.map((deal) => (
            <TouchableOpacity
              key={deal.id}
              style={qiStyles.liveDealRow}
              onPress={() => router.push({ pathname: '/jv-invest', params: { jvId: deal.id } } as any)}
              activeOpacity={0.8}
              testID={`quick-deal-${deal.id}`}
            >
              {deal.photos && deal.photos.length > 0 ? (
                <Image source={{ uri: deal.photos[0] }} style={qiStyles.liveDealThumb} />
              ) : (
                <View style={[qiStyles.liveDealThumb, { backgroundColor: Colors.primary + '15', alignItems: 'center' as const, justifyContent: 'center' as const }]}>
                  <Landmark size={18} color={Colors.primary} />
                </View>
              )}
              <View style={qiStyles.liveDealInfo}>
                <Text style={qiStyles.liveDealName} numberOfLines={1}>{deal.projectName}</Text>
                <View style={qiStyles.liveDealMeta}>
                  <Text style={qiStyles.liveDealAmount}>{formatCurrencyCompact(deal.totalInvestment)}</Text>
                  <View style={qiStyles.liveDealRoiBadge}>
                    <TrendingUp size={10} color="#00C48C" />
                    <Text style={qiStyles.liveDealRoi}>{deal.expectedROI}% ROI</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={qiStyles.liveDealInvestBtn}
                onPress={() => {
                  if (onQuickBuy) {
                    onQuickBuy(deal);
                  } else {
                    router.push({ pathname: '/jv-invest', params: { jvId: deal.id } } as any);
                  }
                }}
                activeOpacity={0.85}
              >
                <Zap size={13} color="#000" />
                <Text style={qiStyles.liveDealInvestText}>Buy Now</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const qiStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  actionCard: {
    width: 200,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    marginBottom: 12,
  },
  actionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCtaText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  liveDealsWrap: {
    marginTop: 16,
  },
  liveDealsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00C48C',
  },
  liveBannerText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  liveDealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 12,
  },
  liveDealThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.backgroundSecondary,
  },
  liveDealInfo: {
    flex: 1,
  },
  liveDealName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  liveDealMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDealAmount: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  liveDealRoiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#00C48C15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDealRoi: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#00C48C',
  },
  liveDealInvestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  liveDealInvestText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#000',
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
  const [quickBuyVisible, setQuickBuyVisible] = useState(false);
  const [quickBuyDeal, setQuickBuyDeal] = useState<{
    id: string;
    title: string;
    projectName: string;
    totalInvestment: number;
    expectedROI: number;
    photo?: string;
    propertyAddress?: string;
    type?: string;
    minInvestment?: number;
  } | null>(null);
  const { t } = useTranslation();
  const { trackScreen } = useAnalytics();
  const screenSize = getResponsiveSize(width);
  const isCompact = isCompactScreen(screenSize);
  const isXs = isExtraSmallScreen(screenSize);

  useEffect(() => {
    trackScreen('Home');
  }, [trackScreen]);



  const jvDealsQuery = useQuery({
    queryKey: ['jv-deals', 'published'],
    queryFn: async () => {
      const result = await fetchJVDeals({ published: true });
      return { deals: result.deals || [] };
    },
    retry: 2,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchInterval: 8000,
    networkMode: 'always' as const,
  });

  const jvDealsLoading = jvDealsQuery.isLoading;
  const jvDeals = useMemo(() => {
    try {
      const rawDeals = jvDealsQuery.data?.deals;
      const backendDeals = (Array.isArray(rawDeals) ? rawDeals : []) as JVAgreement[];
      console.log('[Home JV] Backend deals:', backendDeals.length, 'Query status:', jvDealsQuery.status);

      const validBackendDeals = backendDeals.filter(d => d && d.id && d.title && d.projectName);

      if (validBackendDeals.length === 0 && jvDealsQuery.isLoading) {
        return [];
      }

      console.log('[Home JV] Using backend deals only, Count:', validBackendDeals.length);

      return validBackendDeals.map(deal => ({
        ...deal,
        photos: (deal.photos && deal.photos.length > 0) ? deal.photos : [],
        partners: Array.isArray(deal.partners) ? deal.partners : [],
        profitSplit: Array.isArray(deal.profitSplit) ? deal.profitSplit : [],
      }));
    } catch (err) {
      console.error('[Home JV] Error processing deals:', err);
      return [];
    }
  }, [jvDealsQuery.data, jvDealsQuery.status, jvDealsQuery.isLoading]);

  const propertiesQuery = useQuery({
    queryKey: ['properties', 'home'],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').limit(20);
      if (error) throw error;
      return { properties: data || [] };
    },
    retry: 1,
    staleTime: 1000 * 60 * 2,
  });
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { count: 0 };
      const { count, error } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false);
      if (error) return { count: 0 };
      return { count: count || 0 };
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 1000 * 60 * 10,
  });

  const rawProperties = (propertiesQuery.data?.properties as typeof fallbackProperties | undefined) ?? fallbackProperties;
  const properties = Array.isArray(rawProperties) ? rawProperties : fallbackProperties;
  const unreadNotifications = unreadQuery.data?.count ?? 0;

  const featuredProperties = useMemo(() => (properties ?? []).filter((p: { status?: string }) => (p?.status ?? '').toLowerCase() === 'live').slice(0, 3), [properties]);
  const comingSoonProperties = useMemo(() => (properties ?? []).filter((p: { status?: string }) => (p?.status ?? '').toLowerCase() === 'coming_soon').slice(0, 2), [properties]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([propertiesQuery.refetch(), unreadQuery.refetch(), jvDealsQuery.refetch()])
      .finally(() => setRefreshing(false));
  }, [propertiesQuery, unreadQuery, jvDealsQuery]);

  const openQuickBuy = useCallback((deal: JVAgreement) => {
    const photos = Array.isArray(deal.photos) ? deal.photos : [];
    setQuickBuyDeal({
      id: deal.id,
      title: deal.title,
      projectName: deal.projectName,
      totalInvestment: deal.totalInvestment,
      expectedROI: deal.expectedROI,
      photo: photos.length > 0 ? photos[0] : undefined,
      propertyAddress: deal.propertyAddress,
      type: deal.type,
      minInvestment: 50,
    });
    setQuickBuyVisible(true);
  }, []);

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

          {/* 2.5 Quick Invest Section */}
          <QuickInvestSection
            router={router}
            jvDeals={jvDeals}
            jvDealsLoading={jvDealsLoading}
            isXs={isXs}
            onQuickBuy={openQuickBuy}
          />

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
              {jvDealsLoading ? (
                <View style={{ paddingHorizontal: isXs ? 16 : 20, flexDirection: 'row', gap: 12 }}>
                  {[1, 2].map(i => (
                    <View key={i} style={{ width: 280, height: 220, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.surfaceBorder }} />
                  ))}
                </View>
              ) : jvDeals.length === 0 ? (
                <View style={{ paddingHorizontal: isXs ? 16 : 20, paddingVertical: 24, alignItems: 'center' as const }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>No JV deals available yet</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: isXs ? 16 : 20 }}
                >
                  {jvDeals.map(deal => (
                    <JVPropertyCard
                      key={deal.id}
                      agreement={deal}
                      onPress={() => router.push('/jv-agreement' as any)}
                      onInvest={() => router.push({ pathname: '/jv-invest', params: { jvId: deal.id } } as any)}
                      onQuickBuy={() => openQuickBuy(deal)}
                    />
                  ))}
                </ScrollView>
              )}
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

      <QuickBuyModal
        visible={quickBuyVisible}
        onClose={() => setQuickBuyVisible(false)}
        deal={quickBuyDeal}
        onNavigateToFullInvest={(dealId) => {
          router.push({ pathname: '/jv-invest', params: { jvId: dealId } } as any);
        }}
      />
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
