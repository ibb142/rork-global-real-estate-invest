import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TrendingUp, Shield, Zap, ChevronRight, Globe, Award, BarChart3, ExternalLink } from 'lucide-react-native';
import { Linking } from 'react-native';
import Colors from '@/constants/colors';

const { width } = Dimensions.get('window');

const IPX_LOGO = require('@/assets/images/ipx-logo.jpg');

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

export default function LandingScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
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

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={Platform.OS !== 'web'}
          contentContainerStyle={styles.scrollContent}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollAnim } } }],
            { useNativeDriver: false }
          )}
        >
          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]}>
              <Image source={IPX_LOGO} style={styles.logo} resizeMode="contain" />
            </Animated.View>
            <View style={styles.headerText}>
              <Text style={styles.brand}>IPX HOLDING LLC</Text>
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

          <Animated.View style={[styles.featuresSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.sectionTitle}>Why Investors Choose IPX</Text>
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

          <View style={styles.bottomPad} />
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.ctaContainer}>
        <Animated.View style={[styles.ctaWrap, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            activeOpacity={0.85}
            onPress={() => router.push('/signup' as any)}
          >
            <Text style={styles.ctaPrimaryText}>Get Started — It's Free</Text>
            <ChevronRight size={20} color={Colors.black} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctaSecondary}
            activeOpacity={0.75}
            onPress={() => router.push('/login' as any)}
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
    paddingBottom: 20,
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
  websiteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginHorizontal: 20,
    marginTop: 18,
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
