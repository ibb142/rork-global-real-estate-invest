import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  TrendingUp,
  Shield,
  Users,
  Lock,
  ArrowRight,
  CheckCircle2,
  Coins,
  Clock,
  Mail,
  User,
  Phone,
  CheckCircle,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  MapPin,
  Landmark,
  Building2,
  BarChart3,
  Globe,
  ChevronRight,
  Star,
  Zap,
  Instagram,
  MessageCircle,
  Linkedin,
  ExternalLink,
  ScanLine,
} from 'lucide-react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { landingTracker } from '@/lib/landing-tracker';
import {
  validateFullName,
  validateEmail,
  validatePhone,
  isFormValid,
  submitWaitlistEntry,
  getErrorMessage,
  sendOtp,
  verifyOtp,
  type WaitlistErrorCode,
} from '@/lib/waitlist-service';
import Colors from '@/constants/colors';
import { formatCurrencyCompact } from '@/lib/formatters';
import { IVX_LOGO_SOURCE } from '@/constants/brand';
import { fetchCanonicalDeals } from '@/lib/canonical-deals';
import type { PublishedDealCardModel } from '@/lib/published-deal-card-model';
import type { DealTrustInfo } from '@/lib/parse-deal';
import { getDealExitProjection } from '@/lib/investor-intake';
import InvestorIntakeForm from '@/components/InvestorIntakeForm';
import {
  diagnoseDealPhotos,
  getPhotoSourcePresentation,
  type DealPhotoDiagnostic,
} from '@/lib/deal-photo-health';

const IVX_BUSINESS_CARD_URL = 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/u2shr3b6qstzut5xgdyud.jpg';

const SOCIAL_LINKS = [
  { id: 'website', label: 'ivxholding.com', url: 'https://ivxholding.com', icon: Globe, color: '#FFD700' },
  { id: 'instagram', label: '@IVXHolding', url: 'https://www.instagram.com/ivxholding?igsh=MXYzZWtxMGxxOGRucg==', icon: Instagram, color: '#E1306C' },
  { id: 'tiktok', label: '@IVXInvesting', url: 'https://www.tiktok.com/@IVXInvesting', icon: Zap, color: '#00F2EA' },
  { id: 'whatsapp', label: 'WhatsApp', url: 'https://wa.me/15616443503', icon: MessageCircle, color: '#25D366' },
  { id: 'linkedin', label: 'IVX Holdings', url: 'https://www.linkedin.com/company/ivxholdings', icon: Linkedin, color: '#0A66C2' },
];

const GOLD = '#FFD700';
const GOLD_DIM = '#C9A800';
const SURFACE_ELEVATED = '#181818';
const ACCENT_GREEN = '#00E676';
const ACCENT_BLUE = '#448AFF';

const STATS = [
  { value: '3', label: 'Upcoming Deals', icon: Building2 },
  { value: '$50', label: 'Min Investment', icon: Coins },
  { value: '25%+', label: 'Target ROI', icon: TrendingUp },
];

const FEATURES = [
  {
    icon: Coins,
    gradient: ['#00E676', '#00C853'] as const,
    title: 'Start from $50',
    desc: 'Own fractional shares in premium real estate projects worldwide',
  },
  {
    icon: Shield,
    gradient: ['#448AFF', '#2979FF'] as const,
    title: 'Escrow Protected',
    desc: 'Funds held in escrow until deal milestones are verified and met',
  },
  {
    icon: TrendingUp,
    gradient: [GOLD, GOLD_DIM] as const,
    title: 'Target 25%+ ROI',
    desc: 'Curated deals with strong projected returns and transparent financials',
  },
  {
    icon: Lock,
    gradient: ['#E040FB', '#AA00FF'] as const,
    title: 'LLC Structure',
    desc: 'Each deal backed by a dedicated LLC entity for maximum protection',
  },
];

const TRUST_ITEMS = [
  { text: 'LLC-Backed Investments', icon: Building2 },
  { text: 'Escrow-Protected Funds', icon: Shield },
  { text: 'Title Insurance Verified', icon: CheckCircle2 },
  { text: 'Permit-Approved Projects', icon: Star },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Create Your Account',
    desc: 'Join the waitlist, complete onboarding, and review the active offering terms before participating.',
    accent: ACCENT_GREEN,
  },
  {
    step: '02',
    title: 'Review Live Real Estate Deals',
    desc: 'Explore curated properties with photos, financials, entity details, and deal-specific disclosures.',
    accent: ACCENT_BLUE,
  },
  {
    step: '03',
    title: 'Commit When Terms Fit',
    desc: 'Eligible investors can participate from $50 on supported offerings, subject to each deal’s terms.',
    accent: GOLD,
  },
];

const COMPANY_FACTS = [
  {
    id: 'entity',
    label: 'Legal entity',
    value: 'IVX Holdings LLC',
    detail: 'Deal disclosures, offering terms, and investor communications are issued under the IVX entity.',
    icon: Building2,
    accent: GOLD,
  },
  {
    id: 'contact',
    label: 'Investor relations',
    value: 'investors@ivxholding.com',
    detail: '+1 (561) 644-3503 · Response target within 24 hours for inbound investor questions.',
    icon: Mail,
    accent: ACCENT_GREEN,
  },
  {
    id: 'address',
    label: 'Business address',
    value: '1001 Brickell Bay Drive, Suite 2700, Miami, FL 33131',
    detail: 'Primary investor correspondence and diligence support location.',
    icon: MapPin,
    accent: ACCENT_BLUE,
  },
  {
    id: 'team',
    label: 'Founder / team diligence',
    value: 'Leadership introductions available during active diligence',
    detail: 'Prospective investors can request a live call with management and deal operations before committing.',
    icon: Users,
    accent: GOLD_DIM,
  },
];

const INVESTOR_DISCLOSURES = [
  {
    id: 'risk',
    title: 'Risk disclaimer',
    text: 'All investments involve risk, including partial or total loss of capital. Past performance does not predict future results.',
  },
  {
    id: 'fees',
    title: 'Fees',
    text: 'Fees, operating expenses, and sponsor compensation vary by offering and should be reviewed in the deal terms before participating.',
  },
  {
    id: 'liquidity',
    title: 'Liquidity / exit terms',
    text: 'Real estate offerings are typically illiquid. Exit timing, hold periods, and repayment waterfalls are defined per deal.',
  },
  {
    id: 'returns',
    title: 'No guaranteed returns',
    text: 'Projected ROI, distributions, and timelines are underwriting estimates only. They can change based on project performance.',
  },
];

function AnimatedCounter({ value, delay }: { value: string; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 100, friction: 14, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, [opacity, translateY, delay]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={styles.statValue}>{value}</Text>
    </Animated.View>
  );
}

function FadeInView({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: object }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, [opacity, translateY, delay]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

function LandingDealPhoto({ uri, width, height }: { uri: string; width: number; height: number }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  if (failed) {
    return (
      <View style={[dealStyles.photoFallback, { width, height }]}>
        <Landmark size={32} color={GOLD} />
        <Text style={dealStyles.photoFallbackText}>Photo unavailable</Text>
      </View>
    );
  }

  return (
    <View style={{ width, height, backgroundColor: '#0A0A0A' }}>
      {loading && (
        <View style={dealStyles.photoLoading}>
          <ActivityIndicator size="small" color={GOLD} />
        </View>
      )}
      <Image
        source={{ uri }}
        style={{ width, height }}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => { setFailed(true); setLoading(false); }}
      />
    </View>
  );
}

function LandingDealSlider({ photos, cardWidth }: { photos: string[]; cardWidth: number }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const IMG_HEIGHT = Math.round(cardWidth * 0.58);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    setActiveIndex(idx);
  }, [cardWidth]);

  if (!photos || photos.length === 0) {
    return (
      <View style={[dealStyles.photoFallback, { width: cardWidth, height: IMG_HEIGHT }]}>
        <Landmark size={36} color={GOLD} />
        <Text style={dealStyles.photoFallbackText}>Photos coming soon</Text>
      </View>
    );
  }

  return (
    <View style={{ width: cardWidth, height: IMG_HEIGHT, position: 'relative' as const, overflow: 'hidden' as const }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ width: cardWidth, height: IMG_HEIGHT }}
      >
        {photos.slice(0, 6).map((uri, i) => (
          <LandingDealPhoto key={`lp-${i}`} uri={uri} width={cardWidth} height={IMG_HEIGHT} />
        ))}
      </ScrollView>
      {photos.length > 1 && (
        <>
          <View style={dealStyles.counterBadge}>
            <Text style={dealStyles.counterText}>{activeIndex + 1}/{Math.min(photos.length, 6)}</Text>
          </View>
          <View style={dealStyles.dotsRow}>
            {photos.slice(0, 6).map((_, i) => (
              <View key={`dot-${i}`} style={[dealStyles.dot, i === activeIndex ? dealStyles.dotActive : dealStyles.dotInactive]} />
            ))}
          </View>
        </>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={dealStyles.photoGradient}
      />
    </View>
  );
}

type LandingShowcaseDeal = PublishedDealCardModel & {
  resolvedPhotos: string[];
  photoDiagnostic: DealPhotoDiagnostic;
};

interface DealProofItem {
  id: string;
  label: string;
  value: string;
}

function getDealProofItems(deal: LandingShowcaseDeal): DealProofItem[] {
  const trust = deal.rawTrustInfo as DealTrustInfo | undefined;
  const verifiedDocs = Array.isArray(trust?.documents)
    ? trust.documents.filter((doc) => doc?.verified).length
    : 0;

  const titleAndInsurance = trust?.titleVerified && trust?.insuranceCoverage
    ? 'Title verified + insurance tracked'
    : trust?.titleVerified
      ? 'Title verification tracked'
      : trust?.insuranceCoverage
        ? 'Insurance coverage tracked'
        : 'Review deal docs before funding';

  const escrowFlow = trust?.escrowProtected
    ? 'Escrow / payment workflow documented'
    : 'Payment instructions shared during diligence';

  const permitStatus = trust?.permitStatus === 'approved'
    ? 'Permit approved'
    : trust?.permitStatus === 'pending'
      ? 'Permit review pending'
      : 'Permit status shared in docs';

  const docsLabel = verifiedDocs > 0
    ? `${verifiedDocs} verified diligence docs tracked`
    : 'Offering docs shared during diligence';

  return [
    {
      id: 'entity',
      label: 'LLC / sponsor',
      value: trust?.llcName || deal.developerName || 'IVX Holdings LLC',
    },
    {
      id: 'title',
      label: 'Title / insurance',
      value: titleAndInsurance,
    },
    {
      id: 'escrow',
      label: 'Escrow flow',
      value: escrowFlow,
    },
    {
      id: 'docs',
      label: 'Docs / permits',
      value: verifiedDocs > 0 ? docsLabel : permitStatus,
    },
  ];
}

function LandingDealsShowcase({ scrollToForm }: { scrollToForm: () => void }) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(screenWidth - 48, 380);

  const dealsQuery = useQuery<LandingShowcaseDeal[]>({
    queryKey: ['landing-deals-showcase'],
    queryFn: async (): Promise<LandingShowcaseDeal[]> => {
      try {
        const canonicalResult = await fetchCanonicalDeals();
        const cards = canonicalResult.deals.slice(0, 5);
        const resolvedDeals = await Promise.all(cards.map(async (card) => {
          const photoDiagnostic = await diagnoseDealPhotos(card);
          const resolvedPhotos = photoDiagnostic.resolvedPhotos;

          console.log(
            '[Landing Showcase] Deal resolved:',
            card.title,
            '| canonical:',
            card.photos.length,
            '| final:',
            resolvedPhotos.length,
            '| source:',
            photoDiagnostic.source,
          );
          return { ...card, resolvedPhotos, photoDiagnostic };
        }));

        console.log('[Landing Showcase] Loaded', resolvedDeals.length, 'shared landing deals');
        return resolvedDeals;
      } catch (err) {
        console.log('[Landing Showcase] Fetch error:', (err as Error)?.message);
        return [];
      }
    },
    staleTime: 60000,
  });

  const deals = dealsQuery.data ?? [];
  const isLoading = dealsQuery.isPending;

  return (
    <FadeInView delay={200}>
      <View style={dealStyles.section} testID="landing-featured-deals-section">
        <View style={dealStyles.sectionHeader}>
          <View style={dealStyles.sectionLabelRow}>
            <Zap size={12} color={ACCENT_GREEN} />
            <Text style={dealStyles.sectionLabel}>LIVE OPPORTUNITIES</Text>
          </View>
          <Text style={dealStyles.sectionTitle}>Featured Deals</Text>
          <Text style={dealStyles.sectionSubtitle}>Real properties with photos, financials, and projected returns</Text>
        </View>

        {isLoading ? (
          <View style={[dealStyles.statusCard, dealStyles.statusCardLoading]}>
            <ActivityIndicator size="small" color={GOLD} />
            <Text style={dealStyles.statusTitle}>Loading live deals</Text>
            <Text style={dealStyles.statusText}>Fetching the same published deals used by the app.</Text>
          </View>
        ) : deals.length === 0 ? (
          <View style={dealStyles.statusCard}>
            <Landmark size={28} color={GOLD} />
            <Text style={dealStyles.statusTitle}>No live deals are published yet</Text>
            <Text style={dealStyles.statusText}>The featured deals section is active. It will populate automatically when published deals are available in the shared source.</Text>
            <TouchableOpacity style={dealStyles.investBtn} onPress={scrollToForm} activeOpacity={0.85} testID="landing-deals-empty-cta">
              <Text style={dealStyles.investBtnText}>Join Waitlist Anyway</Text>
              <ArrowRight size={15} color="#000" />
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            pagingEnabled={false}
            snapToInterval={cardWidth + 14}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 0 }}
          >
            {deals.map((deal, idx) => {
              const title = deal.title || 'Investment Opportunity';
              const totalInvestment = Number(deal.totalInvestment || 0);
              const roi = Number(deal.expectedROI || 0);
              const location = deal.addressShort || deal.addressFull;
              const minInvestmentLabel = deal.minInvestment > 0 ? formatCurrencyCompact(deal.minInvestment) : '$50';
              const proofItems = getDealProofItems(deal);
              const exitProjection = getDealExitProjection(deal);
              const estimatedSaleLabel = exitProjection.estimatedSalePrice > 0 ? formatCurrencyCompact(exitProjection.estimatedSalePrice) : 'TBA';
              const projectedPayoutLabel = exitProjection.estimatedGrossPayoutAtMinimum > 0 ? formatCurrencyCompact(exitProjection.estimatedGrossPayoutAtMinimum) : 'TBA';
              const ownershipLabel = exitProjection.minimumOwnershipPercent > 0 ? `${exitProjection.minimumOwnershipPercent.toFixed(3)}%` : 'TBA';
              const timelineLabel = deal.timeline || 'Deal-specific';

              const sourcePresentation = getPhotoSourcePresentation(deal.photoDiagnostic.source);

              return (
                <View key={deal.id || `deal-${idx}`} style={[dealStyles.card, { width: cardWidth, marginRight: idx < deals.length - 1 ? 14 : 0 }]} testID={`landing-deal-card-${deal.id || idx}`}>
                  <LandingDealSlider photos={deal.resolvedPhotos} cardWidth={cardWidth} />

                  <View style={dealStyles.cardContent}>
                    <View style={dealStyles.liveBadgeRow}>
                      <View style={dealStyles.liveBadge}>
                        <View style={dealStyles.liveDot} />
                        <Text style={dealStyles.liveBadgeText}>LIVE</Text>
                      </View>
                      <View
                        style={[
                          dealStyles.sourceBadge,
                          {
                            backgroundColor: sourcePresentation.backgroundColor,
                            borderColor: sourcePresentation.borderColor,
                          },
                        ]}
                        testID={`landing-deal-source-${deal.id || idx}`}
                      >
                        <Text style={[dealStyles.sourceBadgeText, { color: sourcePresentation.textColor }]}>
                          {sourcePresentation.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={dealStyles.dealTitle} numberOfLines={1}>{title}</Text>
                    {location ? (
                      <View style={dealStyles.locationRow}>
                        <MapPin size={11} color={Colors.textTertiary} />
                        <Text style={dealStyles.locationText} numberOfLines={1}>{location}</Text>
                      </View>
                    ) : null}

                    <View style={dealStyles.metricsRow}>
                      <View style={dealStyles.metric}>
                        <Text style={dealStyles.metricValue}>{formatCurrencyCompact(totalInvestment)}</Text>
                        <Text style={dealStyles.metricLabel}>Investment</Text>
                      </View>
                      <View style={dealStyles.metricDivider} />
                      <View style={dealStyles.metric}>
                        <Text style={[dealStyles.metricValue, { color: ACCENT_GREEN }]}>{roi > 0 ? `${roi}%` : 'TBA'}</Text>
                        <Text style={dealStyles.metricLabel}>Projected ROI</Text>
                      </View>
                      <View style={dealStyles.metricDivider} />
                      <View style={dealStyles.metric}>
                        <Text style={dealStyles.metricValue}>{minInvestmentLabel}</Text>
                        <Text style={dealStyles.metricLabel}>Starting Access</Text>
                      </View>
                    </View>

                    <View style={dealStyles.proofGrid} testID={`landing-deal-proof-${deal.id || idx}`}>
                      {proofItems.map((item) => (
                        <View key={item.id} style={dealStyles.proofCard}>
                          <Text style={dealStyles.proofLabel}>{item.label}</Text>
                          <Text style={dealStyles.proofValue}>{item.value}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={dealStyles.exitProjectionCard} testID={`landing-deal-exit-math-${deal.id || idx}`}>
                      <View style={dealStyles.exitProjectionHeader}>
                        <Text style={dealStyles.exitProjectionTitle}>Exit math for the minimum ticket</Text>
                        <Text style={dealStyles.exitProjectionTimeline}>{timelineLabel}</Text>
                      </View>
                      <View style={dealStyles.exitProjectionGrid}>
                        <View style={dealStyles.exitProjectionItem}>
                          <Text style={dealStyles.exitProjectionLabel}>Est. sale</Text>
                          <Text style={dealStyles.exitProjectionValue}>{estimatedSaleLabel}</Text>
                        </View>
                        <View style={dealStyles.exitProjectionItem}>
                          <Text style={dealStyles.exitProjectionLabel}>Min ownership</Text>
                          <Text style={dealStyles.exitProjectionValue}>{ownershipLabel}</Text>
                        </View>
                        <View style={dealStyles.exitProjectionItem}>
                          <Text style={dealStyles.exitProjectionLabel}>Min ticket</Text>
                          <Text style={dealStyles.exitProjectionValue}>{minInvestmentLabel}</Text>
                        </View>
                        <View style={dealStyles.exitProjectionItem}>
                          <Text style={dealStyles.exitProjectionLabel}>Est. gross payout</Text>
                          <Text style={[dealStyles.exitProjectionValue, { color: ACCENT_GREEN }]}>{projectedPayoutLabel}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={dealStyles.cardDisclosure}>
                      Projected returns are estimates only. Review fees, liquidity, exit terms, and full offering documents before participating.
                    </Text>

                    <TouchableOpacity
                      style={dealStyles.investBtn}
                      onPress={scrollToForm}
                      activeOpacity={0.85}
                      testID={`landing-deal-cta-${deal.id || idx}`}
                    >
                      <Text style={dealStyles.investBtnText}>Join Waitlist to Invest</Text>
                      <ArrowRight size={15} color="#000" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        <Text style={dealStyles.disclaimer}>
          Deal information is for preliminary review. Projected returns, distributions, fees, and timelines vary by offering and are not guaranteed.
        </Text>
      </View>
    </FadeInView>
  );
}

const dealStyles = StyleSheet.create({
  section: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    color: ACCENT_GREEN,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800' as const,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: '#252525',
  },
  cardContent: {
    padding: 18,
  },
  liveBadgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    marginBottom: 10,
  },
  liveBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: ACCENT_GREEN + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT_GREEN,
  },
  liveBadgeText: {
    color: ACCENT_GREEN,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  sourceBadge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
  },
  dealTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginBottom: 14,
  },
  locationText: {
    color: Colors.textTertiary,
    fontSize: 13,
  },
  metricsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#0E0E0E',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  metric: {
    flex: 1,
    alignItems: 'center' as const,
  },
  metricValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 2,
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#252525',
  },
  proofGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 12,
  },
  proofCard: {
    width: '47%',
    backgroundColor: '#101010',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    padding: 12,
    minHeight: 74,
  },
  proofLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  proofValue: {
    color: '#F5F5F5',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  exitProjectionCard: {
    backgroundColor: '#0D1310',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ACCENT_GREEN + '20',
    padding: 14,
    marginBottom: 14,
  },
  exitProjectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    marginBottom: 10,
  },
  exitProjectionTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800' as const,
    flex: 1,
  },
  exitProjectionTimeline: {
    color: ACCENT_GREEN,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  exitProjectionGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  exitProjectionItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exitProjectionLabel: {
    color: '#6E8B78',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  exitProjectionValue: {
    color: '#F5F5F5',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700' as const,
  },
  cardDisclosure: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 14,
  },
  investBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 14,
  },
  investBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  disclaimer: {
    color: Colors.textTertiary,
    fontSize: 10,
    textAlign: 'center' as const,
    marginTop: 16,
    lineHeight: 15,
    fontStyle: 'italic' as const,
  },
  statusCard: {
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#252525',
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center' as const,
    gap: 10,
  },
  statusCardLoading: {
    minHeight: 180,
    justifyContent: 'center' as const,
  },
  statusTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
  },
  statusText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center' as const,
    maxWidth: 320,
    marginBottom: 4,
  },
  photoFallback: {
    backgroundColor: '#0E0E0E',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  photoFallbackText: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  photoLoading: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 1,
    backgroundColor: '#0A0A0A',
  },
  photoGradient: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  counterBadge: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 2,
  },
  counterText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  dotsRow: {
    position: 'absolute' as const,
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 5,
    zIndex: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 20,
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});


function LandingWaitlistForm() {
  return (
    <InvestorIntakeForm
      variant="landing"
      source="landing_page"
      pagePath="/"
      testIdPrefix="landing-investor"
    />
  );
}

function LandingWaitlistFormLegacy() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpSendCount, setOtpSendCount] = useState(0);
  const [otpVerifyCount, setOtpVerifyCount] = useState(0);
  const [otpError, setOtpError] = useState('');

  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const formFocusTracked = useRef(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setOtpCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOtp = useCallback(async () => {
    setOtpError('');
    if (!validatePhone(phone)) {
      setOtpError(getErrorMessage('invalid_phone'));
      return;
    }
    if (otpSendCount >= 5) {
      setOtpError(getErrorMessage('rate_limited'));
      return;
    }

    console.log('[Waitlist OTP] Sending real OTP to:', phone);
    landingTracker.trackFormFocus();
    setOtpSending(true);

    try {
      const result = await sendOtp(phone);
      if (result.success) {
        setOtpSendCount(prev => prev + 1);
        setOtpSent(true);
        startCooldown();
        console.log('[Waitlist OTP] OTP sent successfully');
      } else {
        const errorCode = result.error || 'otp_send_failed';
        setOtpError(getErrorMessage(errorCode));
        console.log('[Waitlist OTP] Send failed:', errorCode);
      }
    } catch (err) {
      console.log('[Waitlist OTP] Send exception:', (err as Error)?.message);
      setOtpError(getErrorMessage('otp_send_failed'));
    } finally {
      setOtpSending(false);
    }
  }, [phone, otpSendCount, startCooldown]);

  const handleVerifyOtp = useCallback(async () => {
    setOtpError('');
    if (otpVerifyCount >= 5) {
      setOtpError(getErrorMessage('rate_limited'));
      return;
    }

    setOtpVerifyCount(prev => prev + 1);
    setOtpVerifying(true);

    try {
      const result = await verifyOtp(phone, otpCode);
      if (result.success) {
        console.log('[Waitlist OTP] Code verified successfully');
        setPhoneVerified(true);
        setOtpError('');
      } else {
        const errorCode = result.error || 'otp_invalid';
        setOtpError(getErrorMessage(errorCode));
        console.log('[Waitlist OTP] Verify failed:', errorCode);
      }
    } catch (err) {
      console.log('[Waitlist OTP] Verify exception:', (err as Error)?.message);
      setOtpError(getErrorMessage('otp_invalid'));
    } finally {
      setOtpVerifying(false);
    }
  }, [otpCode, otpVerifyCount, phone]);

  const canSubmit = isFormValid(fullName, email, phone, phoneVerified, consent);

  const submitMutation = useMutation({
    mutationFn: async () => {
      console.log('[Landing Waitlist] Submitting form...');
      const result = await submitWaitlistEntry({
        full_name: fullName,
        email,
        phone,
        accredited_status: null,
        consent,
        phone_verified: phoneVerified,
        source: 'landing_page',
        page_path: '/',
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_content: '',
        utm_term: '',
        referrer: '',
      });

      if (!result.success) {
        throw new Error(result.error || 'submission_failed');
      }
      return result;
    },
    onSuccess: () => {
      console.log('[Landing Waitlist] Submission successful');
      setSubmitted(true);
      landingTracker.trackFormSubmit('waitlist');
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    },
    onError: (err: Error) => {
      const code = err.message as WaitlistErrorCode;
      const msg = getErrorMessage(code);
      setFormError(msg);
      console.log('[Landing Waitlist] Error:', code, msg);
    },
  });

  const handleFormFocus = useCallback(() => {
    if (!formFocusTracked.current) {
      formFocusTracked.current = true;
      landingTracker.trackFormFocus();
    }
  }, []);

  const handleSubmit = () => {
    setFormError('');
    if (!validateFullName(fullName)) {
      setFormError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!validateEmail(email)) {
      setFormError(getErrorMessage('invalid_email'));
      return;
    }
    if (!validatePhone(phone)) {
      setFormError(getErrorMessage('invalid_phone'));
      return;
    }
    if (!phoneVerified) {
      setFormError('Please verify your phone number first.');
      return;
    }
    if (!consent) {
      setFormError('Please agree to receive updates to continue.');
      return;
    }
    submitMutation.mutate();
  };

  if (submitted) {
    return (
      <Animated.View style={[formStyles.successWrap, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
        <View style={formStyles.successIconWrap}>
          <CheckCircle size={52} color={ACCENT_GREEN} />
        </View>
        <Text style={formStyles.successTitle}>You're on the waitlist</Text>
        <Text style={formStyles.successSubtitle}>
          We'll notify you as soon as IVX opens access. Early members receive priority updates and launch access.
        </Text>
        <TouchableOpacity style={formStyles.returnBtn} onPress={() => setSubmitted(false)} activeOpacity={0.85}>
          <Text style={formStyles.returnBtnText}>Return to site</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={formStyles.container}>
      <View style={formStyles.inputWrap}>
        <User size={16} color={Colors.textTertiary} />
        <TextInput
          style={formStyles.input}
          placeholder="Full name"
          placeholderTextColor="#555"
          value={fullName}
          onChangeText={setFullName}
          onFocus={handleFormFocus}
          autoCapitalize="words"
          maxLength={120}
          testID="landing-wl-name"
        />
      </View>

      <View style={formStyles.inputWrap}>
        <Mail size={16} color={Colors.textTertiary} />
        <TextInput
          style={formStyles.input}
          placeholder="you@example.com"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="landing-wl-email"
        />
      </View>

      <View style={formStyles.phoneRow}>
        <View style={[formStyles.inputWrap, formStyles.phoneInput]}>
          <Phone size={16} color={Colors.textTertiary} />
          <TextInput
            style={formStyles.input}
            placeholder="+1 305 555 1212"
            placeholderTextColor="#555"
            value={phone}
            onChangeText={(v) => { setPhone(v); if (phoneVerified) { setPhoneVerified(false); setOtpSent(false); setOtpCode(''); } }}
            keyboardType="phone-pad"
            editable={!phoneVerified}
            testID="landing-wl-phone"
          />
          {phoneVerified && <ShieldCheck size={18} color={ACCENT_GREEN} />}
        </View>
        {!phoneVerified && (
          <TouchableOpacity
            style={[formStyles.otpSendBtn, (otpCooldown > 0 || !validatePhone(phone) || otpSending) && formStyles.otpSendBtnDisabled]}
            onPress={handleSendOtp}
            disabled={otpCooldown > 0 || !validatePhone(phone) || otpSending}
            activeOpacity={0.7}
            testID="landing-wl-send-otp"
          >
            {otpSending ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={formStyles.otpSendBtnText}>
                {otpCooldown > 0 ? `${otpCooldown}s` : otpSent ? 'Resend' : 'Send Code'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {otpSent && !phoneVerified && (
        <View style={formStyles.otpSection}>
          <View style={formStyles.otpInputRow}>
            <View style={[formStyles.inputWrap, formStyles.otpInput]}>
              <TextInput
                style={formStyles.input}
                placeholder="6-digit code"
                placeholderTextColor="#555"
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                maxLength={6}
                testID="landing-wl-otp"
              />
            </View>
            <TouchableOpacity
              style={[formStyles.otpVerifyBtn, (otpCode.length < 6 || otpVerifying) && formStyles.otpVerifyBtnDisabled]}
              onPress={handleVerifyOtp}
              disabled={otpCode.length < 6 || otpVerifying}
              activeOpacity={0.7}
              testID="landing-wl-verify-otp"
            >
              {otpVerifying ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={formStyles.otpVerifyBtnText}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
          {otpError ? (
            <View style={formStyles.errorRow}>
              <AlertCircle size={13} color={Colors.error} />
              <Text style={formStyles.errorText}>{otpError}</Text>
            </View>
          ) : null}
        </View>
      )}

      {phoneVerified && (
        <View style={formStyles.verifiedBanner}>
          <ShieldCheck size={14} color={ACCENT_GREEN} />
          <Text style={formStyles.verifiedText}>Phone verified</Text>
        </View>
      )}

      <TouchableOpacity
        style={formStyles.consentRow}
        onPress={() => setConsent(!consent)}
        activeOpacity={0.7}
        testID="landing-wl-consent"
      >
        <View style={[formStyles.checkbox, consent && formStyles.checkboxChecked]}>
          {consent && <CheckCircle2 size={14} color="#000" />}
        </View>
        <Text style={formStyles.consentText}>
          I agree to receive product updates and waitlist notifications by email and SMS.
        </Text>
      </TouchableOpacity>

      {formError ? (
        <View style={formStyles.formErrorRow}>
          <AlertCircle size={14} color={Colors.error} />
          <Text style={formStyles.formErrorText}>{formError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[formStyles.submitBtn, (!canSubmit || submitMutation.isPending) && formStyles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitMutation.isPending}
        activeOpacity={0.85}
        testID="landing-wl-submit"
      >
        {submitMutation.isPending ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <>
            <Text style={formStyles.submitBtnText}>Join Waitlist</Text>
            <ArrowRight size={18} color="#000" />
          </>
        )}
      </TouchableOpacity>
      <Text style={formStyles.privacyText}>
        Your information is encrypted and will only be used to contact you about investment opportunities.
      </Text>
    </View>
  );
}

void LandingWaitlistFormLegacy;

export default function LandingScreen() {
  const router = useRouter();
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);
  const scrollMilestones = useRef<Set<number>>(new Set());
  const sectionViewsTracked = useRef<Set<string>>(new Set());
  const [formSectionY, setFormSectionY] = useState<number>(0);

  useEffect(() => {
    void landingTracker.init();
    landingTracker.trackPageView();
    console.log('[Landing] Analytics tracker initialized');

    return () => {
      landingTracker.trackSessionEnd();
      landingTracker.destroy();
    };
  }, []);

  const trackSectionOnce = useCallback((section: string) => {
    if (!sectionViewsTracked.current.has(section)) {
      sectionViewsTracked.current.add(section);
      landingTracker.trackSectionView(section);
    }
  }, []);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const scrollableHeight = contentSize.height - layoutMeasurement.height;
    if (scrollableHeight <= 0) return;
    const pct = Math.round((contentOffset.y / scrollableHeight) * 100);
    const milestones = [25, 50, 75, 100];
    for (const m of milestones) {
      if (pct >= m && !scrollMilestones.current.has(m)) {
        scrollMilestones.current.add(m);
        landingTracker.trackScroll(m);
      }
    }
    if (pct >= 5) trackSectionOnce('hero');
    if (pct >= 20) trackSectionOnce('features');
    if (pct >= 35) trackSectionOnce('deals');
    if (pct >= 50) trackSectionOnce('how_it_works');
    if (pct >= 65) trackSectionOnce('trust_security');
    if (pct >= 80) trackSectionOnce('waitlist_form');
    if (pct >= 95) trackSectionOnce('footer');
  }, [trackSectionOnce]);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(logoRotate, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(heroFade, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.spring(heroSlide, { toValue: 0, tension: 40, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ctaFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(ctaSlide, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [heroFade, heroSlide, logoScale, logoRotate, ctaFade, ctaSlide, pulseAnim]);

  const handleFormLayout = useCallback((event: LayoutChangeEvent) => {
    const nextY = event.nativeEvent.layout.y;
    setFormSectionY(nextY);
    console.log('[Landing] Waitlist form y-position:', nextY);
  }, []);

  const scrollToForm = () => {
    landingTracker.trackCtaClick('join_waitlist');
    if (!scrollRef.current) {
      return;
    }

    if (formSectionY > 0) {
      scrollRef.current.scrollTo({ y: Math.max(0, formSectionY - 24), animated: true });
      return;
    }

    scrollRef.current.scrollToEnd({ animated: true });
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={200}
        >
          {/* NAV BAR */}
          <SafeAreaView edges={['top']} style={styles.safeTop}>
            <View style={styles.topBar}>
              <View style={styles.topBarBrand}>
                <Image source={IVX_LOGO_SOURCE} style={styles.topBarLogo} resizeMode="contain" />
                <View>
                  <Text style={styles.topBarName}>IVX</Text>
                  <Text style={styles.topBarTagline}>HOLDINGS</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.loginLink}
                onPress={() => {
                  landingTracker.trackCtaClick('sign_in');
                  router.push('/login' as any);
                }}
                activeOpacity={0.7}
                testID="landing-login"
              >
                <Text style={styles.loginLinkText}>Sign In</Text>
                <ChevronRight size={14} color={GOLD} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* HERO */}
          <Animated.View style={[styles.heroSection, {
            opacity: heroFade,
            transform: [{ translateY: heroSlide }],
          }]}>
            <Animated.View style={[styles.heroLogoWrap, { transform: [{ scale: logoScale }] }]}>
              <View style={styles.heroLogoCard}>
                <Image source={IVX_LOGO_SOURCE} style={styles.heroLogo} resizeMode="contain" />
              </View>
            </Animated.View>

            <View style={styles.comingSoonBadge}>
              <Clock size={11} color={ACCENT_GREEN} />
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>

            <Text style={styles.heroTitle}>
              Invest in{'\n'}
              <Text style={styles.heroTitleGold}>Real Estate</Text>
              {'\n'}from Anywhere
            </Text>

            <Text style={styles.heroSubtitle}>
              Join the IVX waitlist to review curated real estate offerings, investor disclosures, and deal-specific terms. Fractional access starts from $50 on eligible deals.
            </Text>

            <View style={styles.openAccessPill} testID="landing-open-access-pill">
              <Globe size={14} color={GOLD} />
              <View style={styles.openAccessCopy}>
                <Text style={styles.openAccessTitle}>Review offer eligibility</Text>
                <Text style={styles.openAccessText}>Availability depends on each deal’s terms and onboarding review.</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              {STATS.map((stat, i) => (
                <View key={stat.label} style={[styles.statBlock, i < STATS.length - 1 && styles.statBlockBorder]}>
                  <stat.icon size={16} color={GOLD} style={{ marginBottom: 6 }} />
                  <AnimatedCounter value={stat.value} delay={600 + i * 250} />
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.statsDisclaimer}>Target returns are projections only. All investments involve risk.</Text>
          </Animated.View>

          {/* CTA BUTTONS */}
          <Animated.View style={[styles.ctaSection, {
            opacity: ctaFade,
            transform: [{ translateY: ctaSlide }],
          }]}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={scrollToForm}
                activeOpacity={0.85}
                testID="landing-get-started"
              >
                <LinearGradient
                  colors={[GOLD, '#E6B800']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.primaryBtnGradient}
                >
                  <Text style={styles.primaryBtnText}>Join Waitlist</Text>
                  <ArrowRight size={20} color="#000" />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                landingTracker.trackCtaClick('sign_in_approved');
                router.push('/login' as any);
              }}
              activeOpacity={0.8}
              testID="landing-sign-in"
            >
              <Text style={styles.secondaryBtnText}>Already have an account? </Text>
              <Text style={[styles.secondaryBtnText, { color: GOLD }]}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* FEATURES */}
          <FadeInView delay={100}>
            <View style={styles.featuresSection}>
              <View style={styles.sectionLabelRow}>
                <BarChart3 size={12} color={GOLD} />
                <Text style={[styles.sectionLabel, { color: GOLD }]}>WHY INVESTORS CHOOSE US</Text>
              </View>
              <Text style={styles.sectionTitle}>Built for Modern Investors</Text>

              <View style={styles.featuresGrid}>
                {FEATURES.map((feat) => (
                  <View key={feat.title} style={styles.featureCard}>
                    <LinearGradient
                      colors={[feat.gradient[0] + '20', feat.gradient[1] + '08']}
                      style={styles.featureIconWrap}
                    >
                      <feat.icon size={22} color={feat.gradient[0]} />
                    </LinearGradient>
                    <Text style={styles.featureTitle}>{feat.title}</Text>
                    <Text style={styles.featureDesc}>{feat.desc}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeInView>

          {/* LIVE DEALS */}
          <LandingDealsShowcase scrollToForm={scrollToForm} />

          {/* INVESTMENT OPTIONS */}
          <FadeInView delay={100}>
            <View style={styles.investTypesSection}>
              <View style={styles.sectionLabelRow}>
                <Globe size={12} color={ACCENT_BLUE} />
                <Text style={[styles.sectionLabel, { color: ACCENT_BLUE }]}>INVESTMENT OPTIONS</Text>
              </View>
              <Text style={styles.sectionTitle}>Two Ways to Invest</Text>

              <View style={styles.investTypeCard}>
                <LinearGradient
                  colors={[ACCENT_GREEN + '20', ACCENT_GREEN + '05']}
                  style={styles.investTypeIcon}
                >
                  <Coins size={26} color={ACCENT_GREEN} />
                </LinearGradient>
                <View style={styles.investTypeContent}>
                  <View style={styles.previewLabelRow}>
                    <Text style={styles.investTypeTitle}>Fractional Shares</Text>
                    <View style={styles.previewBadge}><Text style={styles.previewBadgeText}>Preview</Text></View>
                  </View>
                  <Text style={styles.investTypeDesc}>
                    Buy property shares from $50. Earn projected returns from real estate development projects.
                  </Text>
                  <TouchableOpacity style={styles.investTypeCta} onPress={scrollToForm} activeOpacity={0.7}>
                    <Text style={[styles.investTypeCtaText, { color: ACCENT_GREEN }]}>Join Waitlist</Text>
                    <ArrowRight size={13} color={ACCENT_GREEN} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.investTypeCard}>
                <LinearGradient
                  colors={[GOLD + '20', GOLD + '05']}
                  style={styles.investTypeIcon}
                >
                  <Users size={26} color={GOLD} />
                </LinearGradient>
                <View style={styles.investTypeContent}>
                  <View style={styles.previewLabelRow}>
                    <Text style={styles.investTypeTitle}>JV Partnerships</Text>
                    <View style={styles.previewBadge}><Text style={styles.previewBadgeText}>Preview</Text></View>
                  </View>
                  <Text style={styles.investTypeDesc}>
                    Direct equity stake in live deals. Partner with developers on premium real estate projects.
                  </Text>
                  <TouchableOpacity style={styles.investTypeCta} onPress={scrollToForm} activeOpacity={0.7}>
                    <Text style={[styles.investTypeCtaText, { color: GOLD }]}>Get Early Access</Text>
                    <ArrowRight size={13} color={GOLD} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </FadeInView>

          {/* HOW IT WORKS */}
          <FadeInView delay={100}>
            <View style={styles.howItWorksSection}>
              <View style={styles.sectionLabelRow}>
                <Sparkles size={12} color={GOLD} />
                <Text style={[styles.sectionLabel, { color: GOLD }]}>SIMPLE PROCESS</Text>
              </View>
              <Text style={styles.sectionTitle}>How It Works</Text>

              {HOW_IT_WORKS.map((item, i) => (
                <View key={`step-${i}`} style={styles.stepCard}>
                  <View style={[styles.stepNumber, { backgroundColor: item.accent + '18' }]}>
                    <Text style={[styles.stepNumberText, { color: item.accent }]}>{item.step}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>{item.title}</Text>
                    <Text style={styles.stepDesc}>{item.desc}</Text>
                  </View>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <View style={styles.stepConnector} />
                  )}
                </View>
              ))}
            </View>
          </FadeInView>

          {/* TRUST */}
          <FadeInView delay={100}>
            <View style={styles.trustSection}>
              <LinearGradient
                colors={[GOLD + '15', GOLD + '05']}
                style={styles.trustShield}
              >
                <Shield size={30} color={GOLD} />
              </LinearGradient>
              <Text style={styles.trustTitle}>Built for Investor Diligence</Text>
              <Text style={styles.trustSubtitle}>Each live deal is presented with entity structure, document checks, and a clearer payment flow before commitment.</Text>

              <View style={styles.trustGrid}>
                {TRUST_ITEMS.map((item) => (
                  <View key={item.text} style={styles.trustItem}>
                    <item.icon size={16} color={ACCENT_GREEN} />
                    <Text style={styles.trustItemText}>{item.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeInView>

          {/* COMPANY CREDIBILITY */}
          <FadeInView delay={100}>
            <View style={styles.credibilitySection} testID="landing-credibility-section">
              <View style={styles.sectionLabelRow}>
                <Building2 size={12} color={ACCENT_GREEN} />
                <Text style={[styles.sectionLabel, { color: ACCENT_GREEN }]}>COMPANY CREDIBILITY</Text>
              </View>
              <Text style={styles.sectionTitle}>Who investors are dealing with</Text>
              <Text style={styles.credibilityIntro}>
                Clear company identity, contact points, and diligence access reduce friction before paid traffic starts.
              </Text>
              <View style={styles.credibilityGrid}>
                {COMPANY_FACTS.map((item) => (
                  <View key={item.id} style={styles.credibilityCard}>
                    <View style={[styles.credibilityIconWrap, { backgroundColor: item.accent + '18' }]}> 
                      <item.icon size={18} color={item.accent} />
                    </View>
                    <Text style={styles.credibilityLabel}>{item.label}</Text>
                    <Text style={styles.credibilityValue}>{item.value}</Text>
                    <Text style={styles.credibilityDetail}>{item.detail}</Text>
                  </View>
                ))}
              </View>
            </View>
          </FadeInView>

          {/* INVESTOR DISCLOSURES */}
          <FadeInView delay={100}>
            <View style={styles.disclosureSection} testID="landing-disclosure-section">
              <View style={styles.sectionLabelRow}>
                <AlertCircle size={12} color={GOLD} />
                <Text style={[styles.sectionLabel, { color: GOLD }]}>INVESTOR DISCLOSURES</Text>
              </View>
              <Text style={styles.sectionTitle}>Review these before you click in</Text>
              <View style={styles.disclosureCard}>
                {INVESTOR_DISCLOSURES.map((item, index) => (
                  <View key={item.id} style={[styles.disclosureRow, index < INVESTOR_DISCLOSURES.length - 1 && styles.disclosureRowBorder]}>
                    <View style={styles.disclosureBullet} />
                    <View style={styles.disclosureTextWrap}>
                      <Text style={styles.disclosureTitle}>{item.title}</Text>
                      <Text style={styles.disclosureText}>{item.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </FadeInView>

          {/* WAITLIST FORM */}
          <FadeInView delay={100}>
            <View nativeID="waitlist" style={styles.waitlistFormSection} onLayout={handleFormLayout} testID="landing-waitlist-section">
              <LinearGradient
                colors={[ACCENT_GREEN + '08', 'transparent']}
                style={styles.waitlistFormGlow}
              />
              <View style={styles.waitlistFormBadge}>
                <Sparkles size={13} color={GOLD} />
                <Text style={styles.waitlistFormBadgeText}>JOIN THE WAITLIST</Text>
              </View>
              <Text style={styles.waitlistFormTitle}>Reserve Your Spot</Text>
              <Text style={styles.waitlistFormSubtitle}>
                Be the first to know when we launch. Real estate investing open to everyone.
              </Text>

              <LandingWaitlistForm />
            </View>
          </FadeInView>

          {/* QR BUSINESS CARD */}
          <FadeInView delay={100}>
            <View style={cardStyles.section}>
              <View style={cardStyles.wrap}>
                <View style={cardStyles.imageWrap}>
                  <Image
                    source={{ uri: IVX_BUSINESS_CARD_URL }}
                    style={cardStyles.cardImage}
                    resizeMode="contain"
                  />
                  <View style={cardStyles.scanBadge}>
                    <ScanLine size={12} color={GOLD} />
                    <Text style={cardStyles.scanBadgeText}>QR ENABLED</Text>
                  </View>
                </View>

                <View style={cardStyles.copyWrap}>
                  <Text style={cardStyles.eyebrow}>QUICK ACCESS</Text>
                  <Text style={cardStyles.title}>Scan to access IVX instantly</Text>
                  <Text style={cardStyles.desc}>
                    Open the IVX platform, explore live deals, and connect with us directly.
                  </Text>

                  <View style={cardStyles.actions}>
                    <TouchableOpacity
                      style={cardStyles.primaryBtn}
                      onPress={() => router.push('/(tabs)' as any)}
                      activeOpacity={0.85}
                      testID="card-open-ivx"
                    >
                      <LinearGradient
                        colors={['#f3d36b', '#b8860b']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={cardStyles.primaryBtnGrad}
                      >
                        <Text style={cardStyles.primaryBtnText}>Open IVX</Text>
                        <ExternalLink size={14} color="#000" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={cardStyles.socialSection}>
                <Text style={cardStyles.socialTitle}>Connect With Us</Text>
                <View style={cardStyles.socialGrid}>
                  {SOCIAL_LINKS.map((link) => (
                    <TouchableOpacity
                      key={link.id}
                      style={cardStyles.socialCard}
                      onPress={() => {
                        try {
                          void Linking.openURL(link.url);
                        } catch (e) {
                          console.log('[Landing] Failed to open:', link.url, e);
                        }
                      }}
                      activeOpacity={0.75}
                      testID={`card-social-${link.id}`}
                    >
                      <View style={[cardStyles.socialIconWrap, { backgroundColor: link.color + '18' }]}>
                        <link.icon size={18} color={link.color} />
                      </View>
                      <Text style={cardStyles.socialLabel} numberOfLines={1}>{link.label}</Text>
                      <ChevronRight size={12} color="#555" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </FadeInView>

          {/* FOOTER */}
          <SafeAreaView edges={['bottom']}>
            <View style={styles.footer}>
              <Image source={IVX_LOGO_SOURCE} style={styles.footerLogo} resizeMode="contain" />
              <Text style={styles.footerBrand}>IVX HOLDINGS LLC</Text>
              <Text style={styles.footerText}>Premium Real Estate Investment Platform</Text>
              <View style={styles.footerContactRow}>
                <Text style={styles.footerContactText}>investors@ivxholding.com</Text>
                <Text style={styles.footerContactDot}>•</Text>
                <Text style={styles.footerContactText}>+1 (561) 644-3503</Text>
              </View>
              <Text style={styles.footerAddress}>1001 Brickell Bay Drive, Suite 2700, Miami, FL 33131</Text>
              <View style={styles.footerDivider} />
              <Text style={styles.footerLegal}>
                {'\u00A9'} {new Date().getFullYear()} IVX Holdings LLC. All rights reserved.
              </Text>
              <Text style={styles.footerDisclaimer}>
                This platform is not registered with the SEC or any state securities regulator. Investments offered here are speculative and involve substantial risk, including the possible loss of your entire investment. Projected returns are estimates only and are not guaranteed. Nothing on this site constitutes an offer to sell or a solicitation of an offer to buy securities.
              </Text>
            </View>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const formStyles = StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252525',
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '500' as const,
    height: 52,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  phoneInput: {
    flex: 1,
  },
  otpSendBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpSendBtnDisabled: {
    backgroundColor: '#222',
  },
  otpSendBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  otpSection: {
    marginBottom: 4,
  },
  otpInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  otpInput: {
    flex: 1,
  },
  otpVerifyBtn: {
    backgroundColor: ACCENT_GREEN,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpVerifyBtnDisabled: {
    backgroundColor: '#222',
  },
  otpVerifyBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '500' as const,
    flex: 1,
  },
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT_GREEN + '12',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: ACCENT_GREEN + '25',
  },
  verifiedText: {
    color: ACCENT_GREEN,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  consentText: {
    flex: 1,
    color: '#777',
    fontSize: 12,
    lineHeight: 18,
  },
  formErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.error + '12',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  formErrorText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '500' as const,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: ACCENT_GREEN,
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  submitBtnDisabled: {
    opacity: 0.35,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  privacyText: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successIconWrap: {
    marginBottom: 18,
  },
  successTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubtitle: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  returnBtn: {
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252525',
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  returnBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700' as const,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
  },
  safeTop: {
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  topBarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarLogo: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D2B1E',
    backgroundColor: '#090909',
  },
  topBarName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900' as const,
    letterSpacing: 3,
    lineHeight: 24,
  },
  topBarTagline: {
    color: GOLD,
    fontSize: 8,
    fontWeight: '700' as const,
    letterSpacing: 3,
    marginTop: -1,
  },
  loginLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD + '30',
    backgroundColor: GOLD + '08',
  },
  loginLinkText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
  },
  heroLogoWrap: {
    marginBottom: 24,
  },
  heroLogoCard: {
    backgroundColor: '#090909',
    borderRadius: 32,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D2B1E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 10,
  },
  heroLogo: {
    width: 124,
    height: 124,
    borderRadius: 24,
    backgroundColor: '#090909',
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT_GREEN + '12',
    borderWidth: 1,
    borderColor: ACCENT_GREEN + '25',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 24,
  },
  comingSoonText: {
    color: ACCENT_GREEN,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.8,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900' as const,
    textAlign: 'center',
    lineHeight: 46,
    letterSpacing: -0.8,
  },
  heroTitleGold: {
    color: GOLD,
  },
  heroSubtitle: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  openAccessPill: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    backgroundColor: '#101511',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ACCENT_GREEN + '30',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  openAccessCopy: {
    flex: 1,
  },
  openAccessTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800' as const,
    marginBottom: 2,
  },
  openAccessText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 32,
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#252525',
    overflow: 'hidden',
    width: '100%',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  statBlockBorder: {
    borderRightWidth: 1,
    borderRightColor: '#252525',
  },
  statValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900' as const,
    letterSpacing: -0.5,
  },
  statLabel: {
    color: '#666',
    fontSize: 10,
    fontWeight: '600' as const,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  statsDisclaimer: {
    color: '#444',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  ctaSection: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  primaryBtn: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 60,
    borderRadius: 18,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800' as const,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  featuresSection: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
    minWidth: 150,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '45%' as any,
  },
  featureIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  featureTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  featureDesc: {
    color: '#777',
    fontSize: 12,
    lineHeight: 18,
  },
  investTypesSection: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  investTypeCard: {
    flexDirection: 'row',
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 12,
    gap: 14,
  },
  investTypeIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  investTypeContent: {
    flex: 1,
  },
  previewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  investTypeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  previewBadge: {
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  previewBadgeText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  investTypeDesc: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  investTypeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  investTypeCtaText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  howItWorksSection: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  stepCard: {
    flexDirection: 'row' as const,
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 12,
    gap: 14,
    position: 'relative' as const,
  },
  stepNumber: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '900' as const,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  stepDesc: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
  },
  stepConnector: {
    position: 'absolute' as const,
    bottom: -12,
    left: 38,
    width: 2,
    height: 12,
    backgroundColor: '#252525',
  },
  trustSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  trustShield: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: GOLD + '25',
  },
  trustTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 8,
  },
  trustSubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  trustGrid: {
    width: '100%',
    gap: 10,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#222',
  },
  trustItemText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  credibilitySection: {
    paddingHorizontal: 24,
    marginBottom: 48,
  },
  credibilityIntro: {
    color: '#888',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  credibilityGrid: {
    gap: 12,
  },
  credibilityCard: {
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
  },
  credibilityIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
  },
  credibilityLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  credibilityValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
    lineHeight: 22,
    marginBottom: 6,
  },
  credibilityDetail: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
  },
  disclosureSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  disclosureCard: {
    backgroundColor: '#0E0E0E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GOLD + '20',
    overflow: 'hidden' as const,
  },
  disclosureRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  disclosureRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  disclosureBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
    marginTop: 6,
  },
  disclosureTextWrap: {
    flex: 1,
  },
  disclosureTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 4,
    textTransform: 'capitalize' as const,
  },
  disclosureText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
  },
  waitlistFormSection: {
    marginHorizontal: 24,
    marginBottom: 32,
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ACCENT_GREEN + '20',
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
  },
  waitlistFormGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  waitlistFormBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GOLD + '12',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  waitlistFormBadgeText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  waitlistFormTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  waitlistFormSubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  footerLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2D2B1E',
    backgroundColor: '#090909',
  },
  footerBrand: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 2,
    marginBottom: 4,
  },
  footerText: {
    color: '#555',
    fontSize: 12,
    marginBottom: 10,
  },
  footerContactRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 8,
  },
  footerContactText: {
    color: '#B8B8B8',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  footerContactDot: {
    color: '#555',
    fontSize: 12,
  },
  footerAddress: {
    color: '#6D6D6D',
    fontSize: 11,
    textAlign: 'center' as const,
    lineHeight: 17,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  footerDivider: {
    width: 40,
    height: 1,
    backgroundColor: '#252525',
    marginBottom: 16,
  },
  footerLegal: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
  },
  footerDisclaimer: {
    color: '#444',
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 14,
    paddingHorizontal: 12,
    opacity: 0.8,
  },
});

const cardStyles = StyleSheet.create({
  section: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  wrap: {
    backgroundColor: '#050505',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.18)',
    padding: 20,
    overflow: 'hidden' as const,
  },
  imageWrap: {
    position: 'relative' as const,
    marginBottom: 20,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1.78,
    borderRadius: 18,
    backgroundColor: '#000',
  },
  scanBadge: {
    position: 'absolute' as const,
    top: 12,
    right: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD + '30',
  },
  scanBadgeText: {
    color: GOLD,
    fontSize: 9,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
  },
  copyWrap: {
    paddingHorizontal: 4,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: '#caa94e',
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: '#f3d36b',
    lineHeight: 28,
    marginBottom: 10,
  },
  desc: {
    color: 'rgba(255, 236, 170, 0.82)',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  primaryBtn: {
    borderRadius: 999,
    overflow: 'hidden' as const,
  },
  primaryBtnGrad: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 24,
    height: 46,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  socialSection: {
    marginTop: 20,
  },
  socialTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  socialGrid: {
    gap: 8,
  },
  socialCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#111',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    gap: 12,
  },
  socialIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  socialLabel: {
    flex: 1,
    color: '#ddd',
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
