import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  ScrollView,
  TextInput,
  useWindowDimensions,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  Phone,
  User,
  DollarSign,
  ChevronDown,
  CheckCircle,
  Sparkles,
} from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import Colors from '@/constants/colors';

const IPX_LOGO = require('@/assets/images/ivx-logo.png');
const WAITLIST_STORAGE_KEY = 'ivx_waitlist_submissions';

const STATS = [
  { value: '3', label: 'Active Projects' },
  { value: '$50', label: 'Min Investment' },
  { value: '25%+', label: 'Target ROI' },
];

const FEATURES = [
  {
    icon: Coins,
    color: '#22C55E',
    title: 'Start from $50',
    desc: 'Own fractional shares in premium real estate projects',
  },
  {
    icon: Shield,
    color: '#3B82F6',
    title: 'Escrow Protected',
    desc: 'Funds held in escrow until deal milestones are met',
  },
  {
    icon: TrendingUp,
    color: '#FFB800',
    title: 'Target 25%+ ROI',
    desc: 'Curated deals with strong projected returns',
  },
  {
    icon: Lock,
    color: '#E879F9',
    title: 'LLC Structure',
    desc: 'Each deal backed by a dedicated LLC entity',
  },
];

const TRUST_ITEMS = [
  'LLC-Backed Investments',
  'Escrow-Protected Funds',
  'Title Insurance Verified',
  'Permit-Approved Projects',
];

const PLATFORM_HIGHLIGHTS = [
  { title: 'Join the Waitlist', desc: 'Tell us your investment goals. Our team personally reviews every application.' },
  { title: 'Get Approved', desc: 'Once approved, you\'ll get early access to curated real estate deals before they go public.' },
  { title: 'Start Investing', desc: 'Invest in premium real estate with as little as $50. Full transparency on every deal.' },
];

const INVESTMENT_RANGES = [
  '$1,000 – $5,000',
  '$5,000 – $10,000',
  '$10,000 – $25,000',
  '$25,000 – $50,000',
  '$50,000 – $100,000',
  '$100,000 – $250,000',
  '$250,000+',
];

interface WaitlistForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  investmentRange: string;
}

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

function EmbeddedWaitlistForm() {
  const [form, setForm] = useState<WaitlistForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    investmentRange: '',
  });
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const submitMutation = useMutation({
    mutationFn: async (data: WaitlistForm) => {
      console.log('[Landing Waitlist] Submitting:', JSON.stringify(data));
      const submission = {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        investment_range: data.investmentRange,
        source: 'landing_page_embedded',
        created_at: new Date().toISOString(),
      };

      let savedToSupabase = false;
      try {
        const { error } = await supabase.from('waitlist').insert(submission);
        if (error) {
          console.log('[Landing Waitlist] Supabase error:', error.message);
        } else {
          savedToSupabase = true;
          console.log('[Landing Waitlist] Saved to Supabase');
        }
      } catch (err) {
        console.log('[Landing Waitlist] Supabase exception:', (err as Error)?.message);
      }

      try {
        const existing = await AsyncStorage.getItem(WAITLIST_STORAGE_KEY);
        const list = existing ? JSON.parse(existing) : [];
        list.push({ ...submission, savedToSupabase, submittedAt: new Date().toISOString() });
        await AsyncStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(list));
        console.log('[Landing Waitlist] Saved to local storage (' + list.length + ' total)');
      } catch (storageErr) {
        console.log('[Landing Waitlist] Local backup failed:', (storageErr as Error)?.message);
      }

      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    },
    onError: (err: Error) => {
      console.log('[Landing Waitlist] Error:', err.message);
      Alert.alert('Submission Error', 'Please try again.', [{ text: 'OK' }]);
    },
  });

  const handleSubmit = () => {
    if (!form.firstName.trim()) { Alert.alert('Missing Info', 'Please enter your first name'); return; }
    if (!form.lastName.trim()) { Alert.alert('Missing Info', 'Please enter your last name'); return; }
    if (!form.email.trim()) { Alert.alert('Missing Info', 'Please enter your email'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) { Alert.alert('Invalid Email', 'Please enter a valid email address'); return; }
    if (!form.phone.trim()) { Alert.alert('Missing Info', 'Please enter your phone number'); return; }
    if (!form.investmentRange) { Alert.alert('Missing Info', 'Please select your investment range'); return; }
    submitMutation.mutate(form);
  };

  if (submitted) {
    return (
      <Animated.View style={[formStyles.successWrap, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
        <View style={formStyles.successIconWrap}>
          <CheckCircle size={48} color="#22C55E" />
        </View>
        <Text style={formStyles.successTitle}>You're on the List!</Text>
        <Text style={formStyles.successSubtitle}>
          Thank you, {form.firstName}. Our investment team will reach out to you to discuss opportunities.
        </Text>
        <View style={formStyles.successDetail}>
          <Text style={formStyles.successDetailLabel}>Investment Interest</Text>
          <Text style={formStyles.successDetailValue}>{form.investmentRange}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={formStyles.container}>
      <View style={formStyles.row}>
        <View style={formStyles.halfField}>
          <View style={formStyles.inputWrap}>
            <User size={16} color={Colors.textTertiary} />
            <TextInput
              style={formStyles.input}
              placeholder="First Name"
              placeholderTextColor={Colors.inputPlaceholder}
              value={form.firstName}
              onChangeText={(v) => setForm(p => ({ ...p, firstName: v }))}
              autoCapitalize="words"
              testID="landing-wl-first"
            />
          </View>
        </View>
        <View style={formStyles.halfField}>
          <View style={formStyles.inputWrap}>
            <User size={16} color={Colors.textTertiary} />
            <TextInput
              style={formStyles.input}
              placeholder="Last Name"
              placeholderTextColor={Colors.inputPlaceholder}
              value={form.lastName}
              onChangeText={(v) => setForm(p => ({ ...p, lastName: v }))}
              autoCapitalize="words"
              testID="landing-wl-last"
            />
          </View>
        </View>
      </View>

      <View style={formStyles.inputWrap}>
        <Mail size={16} color={Colors.textTertiary} />
        <TextInput
          style={formStyles.input}
          placeholder="Email Address"
          placeholderTextColor={Colors.inputPlaceholder}
          value={form.email}
          onChangeText={(v) => setForm(p => ({ ...p, email: v }))}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          testID="landing-wl-email"
        />
      </View>

      <View style={formStyles.inputWrap}>
        <Phone size={16} color={Colors.textTertiary} />
        <TextInput
          style={formStyles.input}
          placeholder="Cell Phone"
          placeholderTextColor={Colors.inputPlaceholder}
          value={form.phone}
          onChangeText={(v) => setForm(p => ({ ...p, phone: v }))}
          keyboardType="phone-pad"
          testID="landing-wl-phone"
        />
      </View>

      <TouchableOpacity
        style={formStyles.dropdownTrigger}
        onPress={() => setShowRangeDropdown(!showRangeDropdown)}
        activeOpacity={0.7}
        testID="landing-wl-range"
      >
        <DollarSign size={16} color={Colors.textTertiary} />
        <Text style={[formStyles.dropdownText, !form.investmentRange && formStyles.dropdownPlaceholder]}>
          {form.investmentRange || 'How much do you want to invest?'}
        </Text>
        <ChevronDown size={16} color={Colors.textTertiary} />
      </TouchableOpacity>
      {showRangeDropdown && (
        <View style={formStyles.dropdownList}>
          {INVESTMENT_RANGES.map((option) => (
            <TouchableOpacity
              key={option}
              style={[formStyles.dropdownOption, form.investmentRange === option && formStyles.dropdownOptionActive]}
              onPress={() => { setForm(p => ({ ...p, investmentRange: option })); setShowRangeDropdown(false); }}
              activeOpacity={0.7}
            >
              <Text style={[formStyles.dropdownOptionText, form.investmentRange === option && formStyles.dropdownOptionTextActive]}>{option}</Text>
              {form.investmentRange === option && <CheckCircle size={14} color={Colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[formStyles.submitBtn, submitMutation.isPending && formStyles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={submitMutation.isPending}
        activeOpacity={0.85}
        testID="landing-wl-submit"
      >
        {submitMutation.isPending ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <>
            <Text style={formStyles.submitBtnText}>Reserve My Spot</Text>
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

export default function LandingScreen() {
  const router = useRouter();
  const { width: _width } = useWindowDimensions();
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(40)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(30)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const formRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);

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

  const scrollToForm = () => {
    if (formRef.current && scrollRef.current) {
      formRef.current.measureLayout(
        scrollRef.current.getInnerViewNode?.() ?? (scrollRef.current as any),
        (_x: number, y: number) => {
          scrollRef.current?.scrollTo({ y: y - 20, animated: true });
        },
        () => {
          console.log('[Landing] measureLayout failed, using fallback scroll');
        }
      );
    }
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

            <View style={styles.comingSoonBadge}>
              <Clock size={12} color="#22C55E" />
              <Text style={styles.comingSoonText}>LAUNCHING SOON</Text>
            </View>

            <Text style={styles.heroTitle}>
              Invest in{'\n'}
              <Text style={styles.heroTitleAccent}>Real Estate</Text>
              {'\n'}from Anywhere
            </Text>

            <Text style={styles.heroSubtitle}>
              Access curated real estate opportunities backed by real assets.{'\n'}
              Start investing from $50 with fractional ownership.
            </Text>

            <View style={styles.statsRow}>
              {STATS.map((stat, i) => (
                <View key={stat.label} style={[styles.statBlock, i < STATS.length - 1 && styles.statBlockBorder]}>
                  <AnimatedCounter value={stat.value} delay={400 + i * 200} />
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.statsDisclaimer}>Target returns are projections only. All investments involve risk. Past performance does not guarantee future results.</Text>
          </Animated.View>

          <Animated.View style={[styles.ctaSection, {
            opacity: ctaFade,
            transform: [{ translateY: ctaSlide }],
          }]}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={scrollToForm}
              activeOpacity={0.85}
              testID="landing-get-started"
            >
              <Text style={styles.primaryBtnText}>Join Investor Waitlist</Text>
              <ArrowRight size={20} color="#000" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.push('/login' as any)}
              activeOpacity={0.8}
              testID="landing-sign-in"
            >
              <Text style={styles.secondaryBtnText}>Already approved? Sign In</Text>
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
              <View style={[styles.investTypeIcon, { backgroundColor: '#22C55E18' }]}>
                <Coins size={26} color="#22C55E" />
              </View>
              <View style={styles.investTypeContent}>
                <Text style={styles.investTypeTitle}>Fractional Shares</Text>
                <Text style={styles.investTypeDesc}>
                  Buy property shares from $50. Earn projected returns from real estate development projects.
                </Text>
                <View style={styles.investTypeBadge}>
                  <Text style={styles.investTypeBadgeText}>From $50</Text>
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
              <Shield size={16} color={Colors.primary} />
              <Text style={styles.testimonialSectionTitle}>How It Works</Text>
            </View>

            {PLATFORM_HIGHLIGHTS.map((item, i) => (
              <View key={`highlight-${i}`} style={styles.highlightCard}>
                <View style={styles.highlightNumber}>
                  <Text style={styles.highlightNumberText}>{i + 1}</Text>
                </View>
                <View style={styles.highlightContent}>
                  <Text style={styles.highlightTitle}>{item.title}</Text>
                  <Text style={styles.highlightDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
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

          <View ref={formRef} style={styles.waitlistFormSection}>
            <View style={styles.waitlistFormGlow} />
            <View style={styles.waitlistFormBadge}>
              <Sparkles size={14} color={Colors.primary} />
              <Text style={styles.waitlistFormBadgeText}>JOIN THE WAITLIST</Text>
            </View>
            <Text style={styles.waitlistFormTitle}>Reserve Your Spot</Text>
            <Text style={styles.waitlistFormSubtitle}>
              Full investment transactions launching soon. Join our waitlist and our team will personally reach out to discuss your goals.
            </Text>

            <EmbeddedWaitlistForm />
          </View>

          <SafeAreaView edges={['bottom']}>
            <View style={styles.footer}>
              <Image source={IPX_LOGO} style={styles.footerLogo} resizeMode="contain" />
              <Text style={styles.footerBrand}>IVX HOLDINGS LLC</Text>
              <Text style={styles.footerText}>Premium Real Estate Investment Platform</Text>
              <Text style={styles.footerLegal}>
                © {new Date().getFullYear()} IVX Holdings LLC. All rights reserved.
              </Text>
              <Text style={styles.footerDisclaimer}>
                This platform is not registered with the SEC or any state securities regulator. Investments offered here are speculative and involve substantial risk, including the possible loss of your entire investment. Projected returns are estimates only and are not guaranteed. Nothing on this site constitutes an offer to sell or a solicitation of an offer to buy securities. All investors should conduct their own due diligence before making investment decisions.
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
    height: 50,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
    marginBottom: 10,
  },
  dropdownText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  dropdownPlaceholder: {
    color: Colors.inputPlaceholder,
  },
  dropdownList: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 10,
    marginTop: -4,
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  dropdownOptionActive: {
    backgroundColor: Colors.primary + '10',
  },
  dropdownOptionText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  dropdownOptionTextActive: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  submitBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  privacyText: {
    color: Colors.textTertiary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 12,
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIconWrap: {
    marginBottom: 16,
  },
  successTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  successDetail: {
    width: '100%',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successDetailLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  successDetailValue: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
});

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
    marginBottom: 20,
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#22C55E15',
    borderWidth: 1,
    borderColor: '#22C55E30',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  comingSoonText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
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
  statsDisclaimer: {
    color: Colors.textTertiary,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
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
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    minWidth: 150,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '45%' as unknown as number,
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
  waitlistFormSection: {
    marginHorizontal: 20,
    marginBottom: 28,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#22C55E30',
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
  },
  waitlistFormGlow: {
    position: 'absolute',
    top: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#22C55E06',
  },
  waitlistFormBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  waitlistFormBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  waitlistFormTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900' as const,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  waitlistFormSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  highlightCard: {
    flexDirection: 'row' as const,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 10,
    gap: 14,
  },
  highlightNumber: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  highlightNumberText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  highlightContent: {
    flex: 1,
  },
  highlightTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  highlightDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
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
  footerDisclaimer: {
    color: Colors.textTertiary,
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 12,
    paddingHorizontal: 16,
    opacity: 0.7,
  },
});
