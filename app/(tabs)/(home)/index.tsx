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
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
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
import { fetchJVDeals, clearLocalDealCache } from '@/lib/jv-storage';
import { parseDeal as sharedParseDeal, QUERY_KEY_PUBLISHED_JV_DEALS, isValidPhoto } from '@/lib/parse-deal';
import { supabase } from '@/lib/supabase';
import { useJVRealtime } from '@/lib/jv-realtime';
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

const IGPhotoSlider = React.memo(function IGPhotoSlider({ photos, cardWidth }: { photos: string[]; cardWidth: number }) {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const IMG_HEIGHT = cardWidth;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / cardWidth);
    setActiveIndex(index);
  }, [cardWidth]);

  const renderPhoto = useCallback(({ item }: { item: string }) => (
    <Image source={{ uri: item }} style={{ width: cardWidth, height: IMG_HEIGHT }} resizeMode="cover" />
  ), [cardWidth, IMG_HEIGHT]);

  const keyExtractor = useCallback((_item: string, index: number) => `ig-photo-${index}`, []);

  return (
    <View style={{ width: cardWidth, height: IMG_HEIGHT, position: 'relative' as const }}>
      <FlatList
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={{ width: cardWidth, height: IMG_HEIGHT }}
        getItemLayout={(_, index) => ({ length: cardWidth, offset: cardWidth * index, index })}
      />
      {photos.length > 1 && (
        <View style={igStyles.dotsRow}>
          {photos.map((_, i) => (
            <View
              key={`ig-dot-${i}`}
              style={[
                igStyles.dot,
                i === activeIndex ? igStyles.dotActive : igStyles.dotInactive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const JVPropertyCard = React.memo(function JVPropertyCard({ agreement, onPress, onInvest, onQuickBuy, cardWidth }: { agreement: JVAgreement; onPress: () => void; onInvest?: () => void; onQuickBuy?: () => void; cardWidth: number }) {
  if (!agreement || !agreement.id) {
    console.warn('[JVPropertyCard] Invalid agreement data, skipping render');
    return null;
  }
  const status = JV_STATUS_CONFIG[agreement.status] ?? JV_STATUS_CONFIG.draft;
  const partnersRaw = agreement.partners;
  const partners = Array.isArray(partnersRaw) ? partnersRaw : (typeof partnersRaw === 'string' ? (() => { try { const p = JSON.parse(partnersRaw); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
  const partnerCount = typeof partnersRaw === 'number' ? partnersRaw : partners.length;
  const totalFormatted = formatCurrencyCompact(agreement.totalInvestment ?? 0);
  const photosRaw = agreement.photos;
  const photos = Array.isArray(photosRaw) ? photosRaw : (typeof photosRaw === 'string' ? (() => { try { const p = JSON.parse(photosRaw as string); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
  const validPhotos = photos.filter(isValidPhoto);
  const hasRealPhotos = validPhotos.length > 0;

  return (
    <View style={[igStyles.card, { width: cardWidth }]} testID={`jv-card-${agreement.id}`}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.95}>
        <View style={igStyles.cardHeader}>
          <View style={igStyles.headerLeft}>
            <View style={igStyles.avatarWrap}>
              <Landmark size={14} color={Colors.primary} />
            </View>
            <View>
              <Text style={igStyles.headerName} numberOfLines={1}>{agreement.projectName}</Text>
              {agreement.propertyAddress ? (
                <View style={igStyles.headerLocationRow}>
                  <MapPin size={9} color={Colors.textTertiary} />
                  <Text style={igStyles.headerLocation} numberOfLines={1}>{agreement.propertyAddress}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={[igStyles.statusPill, { backgroundColor: status.color + '20' }]}>
            <View style={[igStyles.statusDotSmall, { backgroundColor: status.color }]} />
            <Text style={[igStyles.statusPillText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {hasRealPhotos ? (
          <IGPhotoSlider photos={validPhotos} cardWidth={cardWidth} />
        ) : (
          <View style={igStyles.noPhotoPlaceholder}>
            <View style={igStyles.noPhotoIconWrap}>
              <Landmark size={32} color={Colors.primary} />
            </View>
            <Text style={igStyles.noPhotoTitle}>{agreement.projectName}</Text>
            {agreement.description ? (
              <Text style={igStyles.noPhotoDesc} numberOfLines={3}>{agreement.description}</Text>
            ) : (
              <Text style={igStyles.noPhotoDesc}>Investment opportunity — {formatCurrencyCompact(agreement.totalInvestment ?? 0)} · {agreement.expectedROI}% ROI</Text>
            )}
          </View>
        )}
      </TouchableOpacity>

      <View style={igStyles.cardActions}>
        <View style={igStyles.statsBar}>
          <View style={igStyles.statItem}>
            <Text style={igStyles.statVal}>{totalFormatted}</Text>
            <Text style={igStyles.statLbl}>Investment</Text>
          </View>
          <View style={igStyles.statSep} />
          <View style={igStyles.statItem}>
            <Text style={[igStyles.statVal, { color: Colors.success }]}>{agreement.expectedROI}%</Text>
            <Text style={igStyles.statLbl}>ROI</Text>
          </View>
          <View style={igStyles.statSep} />
          <View style={igStyles.statItem}>
            <Text style={igStyles.statVal}>{partnerCount}</Text>
            <Text style={igStyles.statLbl}>Partners</Text>
          </View>
        </View>

        <View style={igStyles.captionRow}>
          <Text style={igStyles.captionTitle} numberOfLines={1}>{agreement.title}</Text>
          <Text style={igStyles.captionType}>{(agreement.type ?? '').replace('_', ' ').toUpperCase()}</Text>
        </View>

        <View style={igStyles.btnRow}>
          {onQuickBuy && (
            <TouchableOpacity
              style={igStyles.buyBtn}
              onPress={() => { onQuickBuy(); }}
              activeOpacity={0.8}
              testID={`jv-quick-buy-${agreement.id}`}
            >
              <Zap size={14} color="#000" />
              <Text style={igStyles.buyBtnText}>Buy Now</Text>
            </TouchableOpacity>
          )}
          {onInvest && (
            <TouchableOpacity
              style={igStyles.investBtn}
              onPress={() => { onInvest(); }}
              activeOpacity={0.8}
              testID={`jv-invest-${agreement.id}`}
            >
              <DollarSign size={14} color={Colors.primary} />
              <Text style={igStyles.investBtnText}>Invest</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
});

const igStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden' as const,
    borderWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
  },
  headerName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  headerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  headerLocation: {
    color: Colors.textTertiary,
    fontSize: 11,
    maxWidth: 180,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  dotsRow: {
    position: 'absolute' as const,
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  cardActions: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  statLbl: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  statSep: {
    width: 1,
    height: 22,
    backgroundColor: Colors.surfaceBorder,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  captionTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  captionType: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  buyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 11,
  },
  buyBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  investBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  investBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  noPhotoPlaceholder: {
    width: '100%' as any,
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  noPhotoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  noPhotoTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 6,
  },
  noPhotoDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center' as const,
    lineHeight: 18,
    maxWidth: 280,
  },
});

const jvStyles = StyleSheet.create({
  section: {
    marginBottom: 20,
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

  useJVRealtime('home-jv-deals', true);

  useEffect(() => {
    trackScreen('Home');
  }, [trackScreen]);

  const jvDealsQuery = useQuery({
    queryKey: [...QUERY_KEY_PUBLISHED_JV_DEALS],
    queryFn: async () => {
      console.log('[Home] Fetching published JV deals...');
      const result = await fetchJVDeals({ published: true });
      const parsed = (result.deals || []).map((d: any) => sharedParseDeal(d));
      console.log('[Home] Fetched', parsed.length, 'published deals (source: Supabase or local)');

      if (parsed.length === 0) {
        console.log('[Home] No published deals found — trying unfiltered fetch for explicitly published active deals');
        const allResult = await fetchJVDeals({});
        const allActive = (allResult.deals || [])
          .filter((d: any) => d.status === 'active' && d.published === true)
          .map((d: any) => sharedParseDeal(d));
        if (allActive.length > 0) {
          console.log('[Home] Found', allActive.length, 'published active deals from unfiltered fetch');
          return { deals: allActive };
        }
      }

      return { deals: parsed };
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 5000,
    gcTime: 1000 * 60 * 3,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  const jvDealsLoading = jvDealsQuery.isLoading;
  const jvDeals = useMemo(() => {
    try {
      const rawDeals = jvDealsQuery.data?.deals;
      const backendDeals = (Array.isArray(rawDeals) ? rawDeals : []) as unknown as JVAgreement[];
      console.log('[Home JV] Backend deals:', backendDeals.length, 'Query status:', jvDealsQuery.status);

      const validBackendDeals = backendDeals.filter(d => {
        if (!d || !d.id || !d.title || !d.projectName) return false;
        const s = d.status as string;
        if (s === 'trashed' || s === 'archived' || s === 'permanently_deleted') return false;
        return true;
      });

      const mapped = validBackendDeals.map(deal => {
        const base = {
          ...deal,
          partners: (deal.partners as any),
          profitSplit: Array.isArray(deal.profitSplit) ? deal.profitSplit : [],
        };
        return base;
      }) as JVAgreement[];

      console.log('[Home JV] Using backend deals, Count:', mapped.length);
      return mapped;
    } catch (err) {
      console.error('[Home JV] Error processing deals:', err);
      return [];
    }
  }, [jvDealsQuery.data, jvDealsQuery.status]);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await clearLocalDealCache();
      console.log('[Home] Cleared ALL local caches before refresh — forcing fresh Supabase fetch');
      await Promise.all([
        propertiesQuery.refetch(),
        unreadQuery.refetch(),
        jvDealsQuery.refetch(),
      ]);
      console.log('[Home] Pull-to-refresh complete — data is fresh from Supabase');
    } catch (err) {
      console.log('[Home] Refresh error:', (err as Error)?.message);
    } finally {
      setRefreshing(false);
    }
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

          {/* 4. JV Deals — Instagram-style feed */}
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
                <View style={{ paddingHorizontal: isXs ? 16 : 20 }}>
                  {[1, 2].map(i => (
                    <View key={i} style={{ width: '100%', height: 300, backgroundColor: Colors.surface, borderRadius: 2, marginBottom: 16 }} />
                  ))}
                </View>
              ) : jvDeals.length === 0 ? (
                <View style={{ paddingHorizontal: isXs ? 16 : 20, paddingVertical: 24, alignItems: 'center' as const }}>
                  <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>No JV deals available yet</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: isXs ? 16 : 20 }}>
                  {jvDeals.map(deal => (
                    <JVPropertyCard
                      key={deal.id}
                      agreement={deal}
                      cardWidth={width - (isXs ? 32 : 40)}
                      onPress={() => router.push({ pathname: '/jv-invest', params: { jvId: deal.id } } as any)}
                      onInvest={() => router.push({ pathname: '/jv-invest', params: { jvId: deal.id } } as any)}
                      onQuickBuy={() => openQuickBuy(deal)}
                    />
                  ))}
                </View>
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
