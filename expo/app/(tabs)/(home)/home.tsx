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
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronRight,
  Clapperboard,
  Shield,
  TrendingUp,
  Award,
  CheckCircle2,
  ArrowUpRight,
  Wallet,
} from 'lucide-react-native';
import { useRouter, Link } from 'expo-router';
import { useScreenFocusState } from '@/hooks/useScreenFocusState';
import Colors from '@/constants/colors';
import { getResponsiveSize, isCompactScreen, isExtraSmallScreen } from '@/lib/responsive';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolvePrimaryDealPhoto, usePublishedJVDeals, triggerManualJVRefresh } from '@/lib/parse-deal';
import { supabase } from '@/lib/supabase';
import { useJVRealtime, usePublicationWatchdog } from '@/lib/jv-realtime';
import { useTranslation } from '@/lib/i18n-context';
import { useAnalytics } from '@/lib/analytics-context';
import { useIPX } from '@/lib/ipx-context';
import { useAuth } from '@/lib/auth-context';
import QuickBuyModal from '@/components/QuickBuyModal';
import InvestorFirstFeed from '@/components/InvestorFirstFeed';
import { formatCurrency } from '@/lib/formatters';
import type { JVAgreement } from '@/types/jv';
import { IVX_LOGO_SOURCE } from '@/constants/brand';







function getPrimaryDealPhoto(deal: JVAgreement): string | undefined {
  const primaryPhoto = resolvePrimaryDealPhoto({
    id: deal.id,
    title: deal.title,
    projectName: deal.projectName,
    photos: deal.photos,
    publishedAt: deal.publishedAt,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    updated_at: typeof (deal as unknown as Record<string, unknown>).updated_at === 'string'
      ? ((deal as unknown as Record<string, unknown>).updated_at as string)
      : undefined,
  });

  if (primaryPhoto) {
    console.log('[Home] Shared primary photo resolved for deal:', deal.id, '|', primaryPhoto.substring(0, 120));
  }

  return primaryPhoto;
}

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

  const mode = !isAuthenticated ? 'signup' : !hasHoldings ? 'explore' : 'portfolio';

  const ctaTitle = mode === 'signup' ? 'Start Investing Today' : mode === 'explore' ? 'Build Your Portfolio' : '';
  const ctaSubtitle = mode === 'signup' ? 'Own real estate globally with curated access' : mode === 'explore' ? 'Browse properties and start earning' : '';
  const ctaBtnText = mode === 'signup' ? 'Get Started' : 'Explore';
  const ctaIconColor = mode === 'signup' ? Colors.primary : Colors.success;
  const ctaTestId = mode === 'signup' ? 'portfolio-cta-signup' : 'portfolio-cta-invest';
  const ctaOnPress = mode === 'signup'
    ? () => router.push('/signup' as any)
    : () => router.push('/(tabs)/market' as any);

  return (
    <Animated.View style={[psStyles.container, mode !== 'portfolio' ? psStyles.ctaContainer : undefined, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
      {mode !== 'portfolio' ? (
        <View style={psStyles.ctaInner}>
          <View style={psStyles.ctaLeft}>
            <View style={psStyles.ctaIconWrap}>
              {mode === 'signup' ? (
                <Wallet size={22} color={ctaIconColor} />
              ) : (
                <TrendingUp size={22} color={ctaIconColor} />
              )}
            </View>
            <View style={psStyles.ctaTextWrap}>
              <Text style={psStyles.ctaTitle}>{ctaTitle}</Text>
              <Text style={psStyles.ctaSubtitle}>{ctaSubtitle}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={psStyles.ctaButton}
            onPress={ctaOnPress}
            activeOpacity={0.8}
            testID={ctaTestId}
          >
            <Text style={psStyles.ctaButtonText}>{ctaBtnText}</Text>
            <ArrowUpRight size={14} color={Colors.black} />
          </TouchableOpacity>
        </View>
      ) : (
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
      )}
    </Animated.View>
  );
}

const psStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  ctaContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    paddingHorizontal: 16,
    marginHorizontal: 0,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isAuthenticated, isLoading: authLoading, userRole } = useAuth();
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
    propertyMarketValue?: number;
    salePrice?: number;
    fractionalSharePrice?: number;
    timelineMin?: number;
    timelineMax?: number;
    priceChange1h?: number;
    priceChange2h?: number;
  } | null>(null);
  const { t } = useTranslation();
  const analytics = useAnalytics();
  const screenSize = getResponsiveSize(width);
  const isCompact = isCompactScreen(screenSize);
  const isXs = isExtraSmallScreen(screenSize);

  useJVRealtime('home-jv-deals', true);
  usePublicationWatchdog(true);

  useEffect(() => {
    analytics?.trackScreen?.('Home');
  }, [analytics]);

  const isScreenFocused = useScreenFocusState(true);
  const publishedJV = usePublishedJVDeals({ refetchIntervalMs: isScreenFocused ? 1000 * 90 : false });

  const jvDealsLoading = publishedJV.isLoading;
  const jvDeals = useMemo(() => {
    try {
      const rawDeals = publishedJV.deals;
      const backendDeals = (Array.isArray(rawDeals) ? rawDeals : []) as unknown as JVAgreement[];
      console.log('[Home JV] Shared hook deals:', backendDeals.length);

      const validBackendDeals = backendDeals.filter(d => {
        if (!d || !d.id) return false;
        if (!d.title && !d.projectName) return false;
        const s = d.status as string;
        if (s === 'trashed' || s === 'archived' || s === 'permanently_deleted') return false;
        return true;
      });

      const mapped = validBackendDeals.map(deal => {
        const base = {
          ...deal,
          title: deal.title || deal.projectName || 'Untitled Deal',
          projectName: deal.projectName || deal.title || '',
          partners: (deal.partners as any),
          profitSplit: Array.isArray(deal.profitSplit) ? deal.profitSplit : [],
        };
        return base;
      }) as JVAgreement[];

      if (mapped.length > 0) {
        console.log('[Home JV] Using shared deals, Count:', mapped.length);
        return mapped;
      }

      console.log('[Home JV] No deals found from shared hook');
      return [];
    } catch (err) {
      console.error('[Home JV] Error processing deals:', err);
      return [];
    }
  }, [publishedJV.deals]);

  const queryClient = useQueryClient();

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

  const unreadNotifications = unreadQuery.data?.count ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      triggerManualJVRefresh();
      console.log('[Home] Manual refresh triggered — Supabase cache reset for fresh data');
      await Promise.all([
        unreadQuery.refetch(),
        publishedJV.refetch(),
        queryClient.invalidateQueries({ queryKey: ['ivx-home-feed'] }),
      ]);
      console.log('[Home] Pull-to-refresh complete — data is fresh from Supabase');
    } catch (err) {
      console.log('[Home] Refresh error:', (err as Error)?.message);
    } finally {
      setRefreshing(false);
    }
  }, [unreadQuery, publishedJV, queryClient]);

  const openQuickBuy = useCallback((deal: JVAgreement) => {
    const primaryPhoto = getPrimaryDealPhoto(deal);
    const rawDeal = deal as unknown as Record<string, unknown>;
    const marketVal = typeof rawDeal.property_market_value === 'number' ? rawDeal.property_market_value
      : typeof rawDeal.propertyMarketValue === 'number' ? rawDeal.propertyMarketValue
      : typeof rawDeal.market_value === 'number' ? rawDeal.market_value
      : undefined;
    const trustMarket = rawDeal.trustMarket as {
      minInvestment?: number;
      salePrice?: number;
      explicitSalePrice?: number;
      fractionalSharePrice?: number;
      timelineMin?: number;
      timelineMax?: number;
      priceChange1h?: number;
      priceChange2h?: number;
    } | undefined;
    setQuickBuyDeal({
      id: deal.id,
      title: deal.title,
      projectName: deal.projectName,
      totalInvestment: deal.totalInvestment,
      expectedROI: deal.expectedROI,
      photo: primaryPhoto,
      propertyAddress: deal.propertyAddress,
      type: deal.type,
      minInvestment: trustMarket?.minInvestment ? Math.max(trustMarket.minInvestment, 1) : 50,
      propertyMarketValue: marketVal as number | undefined,
      salePrice: trustMarket?.explicitSalePrice,
      fractionalSharePrice: trustMarket?.fractionalSharePrice,
      timelineMin: trustMarket?.timelineMin,
      timelineMax: trustMarket?.timelineMax,
      priceChange1h: trustMarket?.priceChange1h,
      priceChange2h: trustMarket?.priceChange2h,
    });
    setQuickBuyVisible(true);
  }, []);

  const handleOpenOwnerLogin = useCallback((): void => {
    console.log('[Home] Open Owner Login pressed -> /login?ownerMode=1');
    try {
      router.push('/login?ownerMode=1' as any);
    } catch (pushError) {
      console.log('[Home] router.push failed:', pushError);
    }
  }, [router]);

  // ── Boot router for the de-facto entry route `/`.
  // The Supabase client (lib/supabase.ts) restores the persisted session from
  // AsyncStorage on app start. Owners are NOT auto-redirected into
  // /admin/owner-controls on cold start — they land on the normal app Home
  // with bottom tabs and can open Owner Controls from Profile → Admin Panel
  // or any of the in-app admin shortcuts. This preserves the full app
  // experience (Home / Invest / Market / Portfolio / Chat / Profile) for
  // owners while keeping admin access one tap away.
  // Boot proof log (inline; previous hook was removed but call lingered → bundle crash).
  useEffect(() => {
    console.log('[Home] boot', { authLoading, isAuthenticated, userRole });
  }, [authLoading, isAuthenticated, userRole]);

  // NOTE: Previous design restored. The Home tab no longer hijacks unauthenticated
  // visitors with an owner-only sign-in gate. The normal IVX Home (tagline,
  // Portfolio Snapshot CTA, featured deals, coming soon, trust badges) renders
  // for everyone; auth-only sections (e.g. PortfolioSnapshot) handle their own
  // CTA-to-login internally. Owner Login remains reachable from Profile → Owner
  // Controls and from /owner-access / /login?ownerMode=1.
  void handleOpenOwnerLogin;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: isXs ? 12 : 16 }]}>
          <View style={styles.brandContainer}>
            <Image
              source={IVX_LOGO_SOURCE}
              style={[styles.brandLogo, { width: isXs ? 44 : 55, height: isXs ? 44 : 55 }]}
              resizeMode="contain"
              accessibilityLabel="IVX HOLDINGS LLC logo"
            />
            <Text style={[styles.brandName, { fontSize: isXs ? 14 : isCompact ? 16 : 18 }]}>IVX HOLDINGS LLC</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.reelsButton}
              onPress={() => router.push({ pathname: '/videos', params: { type: 'reel' } } as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Project Reels"
              accessibilityHint="Opens the dedicated Project Reels module — construction updates and drone footage"
              testID="home-reels-button"
            >
              <Clapperboard size={isXs ? 22 : 26} color={Colors.primary} />
            </TouchableOpacity>
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
              {unreadNotifications > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadNotifications}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.scrollView, Platform.OS === 'web' && styles.scrollViewWeb]}
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

          {/* 3+4. Investor-first feed — 3 featured deals → 1 featured project video → repeat.
              Canonical order from /api/ivx/video-platform/home-feed (same sequence as
              landing page + iOS). Replaces Property Reels + Featured Properties + JV carousel
              so no duplicate or random videos appear. */}
          <JVErrorBoundary>
            <InvestorFirstFeed
              jvDeals={jvDeals}
              jvDealsLoading={jvDealsLoading}
              isXs={isXs}
              cardWidth={width}
              openQuickBuy={openQuickBuy}
            />
          </JVErrorBoundary>

          {/* 5. In-app owner entry */}
          <View style={{ paddingHorizontal: isXs ? 16 : 20, marginBottom: 20 }}>
            <Link
              href={{ pathname: '/login', params: { ownerMode: '1' } } as any}
              asChild
            >
            <TouchableOpacity
              style={styles.ownerCTA}
              onPress={handleOpenOwnerLogin}
              activeOpacity={0.8}
              testID="home-owner-login-entry"
              accessibilityRole="button"
              accessibilityLabel="Owner Login, direct owner sign in inside the app"
            >
              <View style={styles.ownerCTALeft}>
                <View style={styles.ownerCTAIcon}>
                  <Shield size={20} color={Colors.primary} />
                </View>
                <View style={styles.ownerCTAMeta}>
                  <Text style={styles.ownerCTATitle}>Owner Login</Text>
                  <Text style={styles.ownerCTASubtitle}>Direct approved-owner route inside the app — not the landing page.</Text>
                </View>
              </View>
              <ChevronRight size={18} color={Colors.primary} />
            </TouchableOpacity>
            </Link>
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
  authRedirectContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: 12,
    paddingHorizontal: 24,
  },
  authRedirectText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
  },
  authRedirectButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 48,
    minWidth: 190,
    justifyContent: 'center',
  },
  authRedirectButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  authRedirectSecondary: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authRedirectSecondaryText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    textDecorationLine: 'underline' as const,
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
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  reelsButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  auditButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  notificationButton: {
    position: 'relative' as const,
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
  scrollViewWeb: {
    // @ts-ignore: web-only CSS property to hide scrollbar
    scrollbarWidth: 'none',
    // @ts-ignore: web-only CSS property
    msOverflowStyle: 'none',
  } as any,
});
