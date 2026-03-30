import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  Shield,
  ChevronRight,
  Users,
  Zap,
  Lock,
  Star,
  ArrowRight,
  CheckCircle2,
  Coins,
} from 'lucide-react-native';
import Colors from '@/constants/colors';

const IPX_LOGO = require('@/assets/images/ivx-logo.png');

const STATS = [
  { value: '$47M+', label: 'Assets Managed' },
  { value: '2,400+', label: 'Active Investors' },
  { value: '14.5%', label: 'Avg Returns' },
];

const FEATURES = [
  {
    icon: Coins,
    color: '#00C48C',
    title: 'Start from $1',
    desc: 'Own fractional shares in premium real estate worldwide',
  },
  {
    icon: Shield,
    color: '#3B82F6',
    title: 'Escrow Protected',
    desc: 'Bank-grade security on every transaction',
  },
  {
    icon: TrendingUp,
    color: '#FFB800',
    title: '14.5% Avg ROI',
    desc: 'Outperforming S&P 500 with real estate',
  },
  {
    icon: Zap,
    color: '#E879F9',
    title: 'Instant Liquidity',
    desc: 'Trade shares 24/7 — no lockup periods',
  },
];

const TRUST_ITEMS = [
  'SEC Compliant Structure',
  'FDIC Escrow Accounts',
  'Independent Audits',
  'KYC/AML Verified',
];

const TESTIMONIALS = [
  { name: 'Sarah K.', location: 'New York', text: 'IPX made real estate investing accessible. I started with $500 and my portfolio has grown 18% in 8 months.', rating: 5 },
  { name: 'Ahmed R.', location: 'Dubai', text: 'The JV partnerships are incredible. Direct equity in premium US properties from abroad — nothing else compares.', rating: 5 },
  { name: 'Lisa M.', location: 'London', text: 'Finally, a platform that combines AI insights with real estate. The smart investing feature is a game changer.', rating: 5 },
];

function AnimatedCounter({ value, delay }: { value: string; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

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
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={styles.statValue}>{value}</Text>
    </Animated.View>
  );
}

export default function LandingScreen() {
  const router = useRouter();
  const { width: _width } = useWindowDimensions();
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(30)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;

  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const testimonialFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(heroFade, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(heroSlide, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ctaFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(ctaSlide, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [heroFade, heroSlide, logoScale, ctaFade, ctaSlide, glowPulse]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(testimonialFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setActiveTestimonial(prev => (prev + 1) % TESTIMONIALS.length);
        Animated.timing(testimonialFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonialFade]);

  const testimonial = TESTIMONIALS[activeTestimonial] ?? TESTIMONIALS[0]!;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <SafeAreaView edges={['top']} style={styles.safeTop}>
          <View style={styles.topBar}>
            <View style={styles.topBarBrand}>
              <Image source={IPX_LOGO} style={styles.topBarLogo} resizeMode="contain" />
              <Text style={styles.topBarName}>IVX</Text>
            </View>
            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => router.push('/login' as any)}
              activeOpacity={0.7}
              testID="landing-login"
            >
              <Text style={styles.loginLinkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <Animated.View style={[styles.heroSection, {
          opacity: heroFade,
          transform: [{ translateY: heroSlide }],
        }]}>
          <Animated.View style={[styles.logoGlow, { opacity: glowPulse }]} />
          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
            <Image source={IPX_LOGO} style={styles.heroLogo} resizeMode="contain" />
          </Animated.View>

          <Text style={styles.heroTitle}>
            Invest in{'\n'}
            <Text style={styles.heroTitleAccent}>Real Estate</Text>
            {'\n'}from Anywhere
          </Text>

          <Text style={styles.heroSubtitle}>
            Own fractional shares in premium properties.{'\n'}
            Start from just $1 with institutional-grade security.
          </Text>

          <View style={styles.statsRow}>
            {STATS.map((stat, i) => (
              <View key={stat.label} style={[styles.statBlock, i < STATS.length - 1 && styles.statBlockBorder]}>
                <AnimatedCounter value={stat.value} delay={400 + i * 200} />
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View style={[styles.ctaSection, {
          opacity: ctaFade,
          transform: [{ translateY: ctaSlide }],
        }]}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/signup' as any)}
            activeOpacity={0.85}
            testID="landing-get-started"
          >
            <Text style={styles.primaryBtnText}>Get Started — It's Free</Text>
            <ArrowRight size={20} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/login' as any)}
            activeOpacity={0.8}
            testID="landing-sign-in"
          >
            <Text style={styles.secondaryBtnText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.featuresSection}>
          <Text style={styles.sectionLabel}>WHY INVESTORS CHOOSE US</Text>
          <Text style={styles.sectionTitle}>Built for Modern Investors</Text>

          <View style={styles.featuresGrid}>
            {FEATURES.map((feat) => (
              <View key={feat.title} style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: feat.color + '15' }]}>
                  <feat.icon size={22} color={feat.color} />
                </View>
                <Text style={styles.featureTitle}>{feat.title}</Text>
                <Text style={styles.featureDesc}>{feat.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.investTypesSection}>
          <Text style={styles.sectionLabel}>INVESTMENT OPTIONS</Text>
          <Text style={styles.sectionTitle}>Two Ways to Invest</Text>

          <View style={styles.investTypeCard}>
            <View style={[styles.investTypeIcon, { backgroundColor: '#00C48C18' }]}>
              <Coins size={26} color="#00C48C" />
            </View>
            <View style={styles.investTypeContent}>
              <Text style={styles.investTypeTitle}>Fractional Shares</Text>
              <Text style={styles.investTypeDesc}>
                Buy property shares from $1. Earn dividends, trade anytime. Full liquidity with zero lockup.
              </Text>
              <View style={styles.investTypeBadge}>
                <Text style={styles.investTypeBadgeText}>From $1</Text>
              </View>
            </View>
          </View>

          <View style={styles.investTypeCard}>
            <View style={[styles.investTypeIcon, { backgroundColor: '#FFB80018' }]}>
              <Users size={26} color="#FFB800" />
            </View>
            <View style={styles.investTypeContent}>
              <Text style={styles.investTypeTitle}>JV Partnerships</Text>
              <Text style={styles.investTypeDesc}>
                Direct equity stake in live deals. Partner with developers on premium real estate projects.
              </Text>
              <View style={[styles.investTypeBadge, { backgroundColor: '#FFB80015' }]}>
                <Text style={[styles.investTypeBadgeText, { color: '#FFB800' }]}>From $25K</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.testimonialSection}>
          <View style={styles.testimonialHeader}>
            <Users size={16} color={Colors.primary} />
            <Text style={styles.testimonialSectionTitle}>Investor Stories</Text>
          </View>

          <View style={styles.testimonialCard}>
            <View style={styles.testimonialStars}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={`star-${i}`} size={14} color={Colors.primary} fill={Colors.primary} />
              ))}
            </View>
            <Animated.View style={{ opacity: testimonialFade }}>
              <Text style={styles.testimonialText}>"{testimonial.text}"</Text>
              <Text style={styles.testimonialAuthor}>{testimonial.name} — {testimonial.location}</Text>
            </Animated.View>
            <View style={styles.testimonialDots}>
              {TESTIMONIALS.map((_, i) => (
                <View
                  key={`tdot-${i}`}
                  style={[
                    styles.testimonialDot,
                    i === activeTestimonial && styles.testimonialDotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.trustSection}>
          <View style={styles.trustShield}>
            <Shield size={28} color={Colors.primary} />
          </View>
          <Text style={styles.trustTitle}>Regulated & Secure</Text>
          <Text style={styles.trustSubtitle}>Your investments are protected by institutional-grade security</Text>

          <View style={styles.trustGrid}>
            {TRUST_ITEMS.map((item) => (
              <View key={item} style={styles.trustItem}>
                <CheckCircle2 size={16} color={Colors.success} />
                <Text style={styles.trustItemText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.finalCta}>
          <View style={styles.finalCtaGlow} />
          <Text style={styles.finalCtaTitle}>Ready to Build Wealth?</Text>
          <Text style={styles.finalCtaSubtitle}>
            Join thousands of investors earning passive income through real estate.
          </Text>

          <TouchableOpacity
            style={styles.finalCtaBtn}
            onPress={() => router.push('/signup' as any)}
            activeOpacity={0.85}
            testID="landing-final-cta"
          >
            <Text style={styles.finalCtaBtnText}>Create Free Account</Text>
            <ChevronRight size={20} color="#000" />
          </TouchableOpacity>

          <View style={styles.finalCtaTrust}>
            <Lock size={12} color={Colors.textTertiary} />
            <Text style={styles.finalCtaTrustText}>Bank-grade encryption · No credit card required</Text>
          </View>
        </View>

        <SafeAreaView edges={['bottom']}>
          <View style={styles.footer}>
            <Image source={IPX_LOGO} style={styles.footerLogo} resizeMode="contain" />
            <Text style={styles.footerBrand}>IVX HOLDINGS LLC</Text>
            <Text style={styles.footerText}>Premium Real Estate Investment Platform</Text>
            <Text style={styles.footerLegal}>
              © {new Date().getFullYear()} IVX Holdings LLC. All rights reserved.
            </Text>
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
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
    paddingVertical: 12,
  },
  topBarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBarLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  topBarName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900' as const,
    letterSpacing: 2,
  },
  loginLink: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  loginLinkText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 32,
    position: 'relative',
  },
  logoGlow: {
    position: 'absolute',
    top: 20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 60,
      },
      android: {
        elevation: 20,
      },
      default: {},
    }),
  },
  heroLogo: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.primary + '50',
    marginBottom: 28,
  },
  heroTitle: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: '900' as const,
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  heroTitleAccent: {
    color: Colors.primary,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 32,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    width: '100%',
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
  },
  statBlockBorder: {
    borderRightWidth: 1,
    borderRightColor: Colors.surfaceBorder,
  },
  statValue: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '900' as const,
    letterSpacing: -0.5,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 4,
  },
  ctaSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  featuresSection: {
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  sectionLabel: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    width: '48%' as any,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    minWidth: 150,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '45%',
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  featureDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  investTypesSection: {
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  investTypeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
    gap: 14,
  },
  investTypeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  investTypeContent: {
    flex: 1,
  },
  investTypeTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  investTypeDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  investTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  investTypeBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  testimonialSection: {
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  testimonialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  testimonialSectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  testimonialCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  testimonialStars: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 14,
  },
  testimonialText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  testimonialAuthor: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  testimonialDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  testimonialDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceBorder,
  },
  testimonialDotActive: {
    backgroundColor: Colors.primary,
    width: 20,
  },
  trustSection: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 36,
  },
  trustShield: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  trustTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  trustSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  trustGrid: {
    width: '100%',
    gap: 10,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  trustItemText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  finalCta: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    position: 'relative',
    overflow: 'hidden',
  },
  finalCtaGlow: {
    position: 'absolute',
    top: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Colors.primary + '10',
  },
  finalCtaTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  finalCtaSubtitle: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  finalCtaBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 54,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  finalCtaBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800' as const,
  },
  finalCtaTrust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  finalCtaTrustText: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  footerLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    marginBottom: 10,
  },
  footerBrand: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  footerText: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginBottom: 8,
  },
  footerLegal: {
    color: Colors.textTertiary,
    fontSize: 11,
    textAlign: 'center',
  },
});
