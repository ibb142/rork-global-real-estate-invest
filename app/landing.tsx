import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
  AppStateStatus,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  TrendingUp, Shield, ChevronRight, Award,
  Users, CheckCircle, Mail, Phone, User,
  DollarSign, Zap, ArrowRight, Sparkles,
  Lock, Eye, Copy, Gift, Handshake,
  Scale, Globe, FileText, Coins, Landmark,
  Building2, BarChart3, ImageIcon, Edit3,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { fetchJVDeals, safeSupabaseInsert, safeSupabaseSelect, addToLocalWaitlist, getLocalWaitlist, resetSupabaseCheck } from '@/lib/jv-storage';
import { useJVRealtime } from '@/lib/jv-realtime';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPartnerCount, getPoolTiersArray } from '@/lib/parse-deal';
import { useAuth } from '@/lib/auth-context';
import { formatCurrencyCompact } from '@/lib/formatters';
import QuickBuyModal from '@/components/QuickBuyModal';
import { parseDeal as sharedParseDeal, QUERY_KEY_PUBLISHED_JV_DEALS, ParsedJVDeal, ParsedJVDealPoolTier } from '@/lib/parse-deal';

type JVDeal = ParsedJVDeal;
type JVDealPoolTier = ParsedJVDealPoolTier;

class LandingDealsErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) { console.log('[Landing Deals] Error caught:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ padding: 20 }}>
          <Text style={{ color: '#8A8A8A', textAlign: 'center', fontSize: 13 }}>Investment deals temporarily unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const IPX_LOGO = require('@/assets/images/ivx-logo.png');

const HERO_IMAGES: string[] = [
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80',
  'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
];

const DEAL_FALLBACK_PHOTOS: Record<string, string[]> = {
  development: [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80',
    'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80',
  ],
  equity_split: [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
  ],
  profit_sharing: [
    'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800&q=80',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80',
  ],
  hybrid: [
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80',
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80',
  ],
  default: [
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800&q=80',
  ],
};

function getDealPhotos(deal: JVDeal): string[] {
  const stored: string[] = Array.isArray(deal.photos)
    ? deal.photos.filter((p: string) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:image/')))
    : [];
  if (stored.length > 0) return stored;
  const typeKey = String(deal.type || 'default');
  const fallback = DEAL_FALLBACK_PHOTOS[typeKey] || DEAL_FALLBACK_PHOTOS['default'];
  console.log('[Landing] No photos for deal', deal.id, '— using fallback for type:', typeKey);
  return fallback;
}

const INVESTMENT_GOALS = [
  { id: 'under_1k', icon: '🚀', label: 'First Investment', desc: 'Start building wealth from $1', color: '#FFD700' },
  { id: '1k_10k', icon: '💰', label: 'Passive Income', desc: 'Monthly dividends from rental properties', color: '#00C48C' },
  { id: '10k_50k', icon: '📈', label: 'Long-Term Growth', desc: 'Appreciation + compounding returns', color: '#4A90D9' },
  { id: '50k_plus', icon: '🌍', label: 'Diversify Portfolio', desc: 'Add real estate to stocks & crypto', color: '#E879F9' },
];

const LIVE_ACTIVITY = [
  { name: 'Alex M.', action: 'invested $2,500', location: 'New York', time: '2m ago' },
  { name: 'Sarah K.', action: 'earned $340 dividend', location: 'London', time: '5m ago' },
  { name: 'Carlos R.', action: 'joined as VIP', location: 'Miami', time: '8m ago' },
  { name: 'Emma L.', action: 'invested $15,000', location: 'Dubai', time: '12m ago' },
  { name: 'James W.', action: 'earned $890 dividend', location: 'Singapore', time: '15m ago' },
  { name: 'Maria D.', action: 'invested $500', location: 'Madrid', time: '18m ago' },
  { name: 'David P.', action: 'joined as VIP', location: 'Toronto', time: '22m ago' },
  { name: 'Lisa T.', action: 'invested $7,200', location: 'Sydney', time: '25m ago' },
];

const SOCIAL_PROOF_STATS = [
  { value: '$2.1B+', label: 'Managed' },
  { value: '52K+', label: 'Investors' },
  { value: '14.5%', label: 'Avg Return' },
];

function LiveActivityTicker() {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setCurrentIndex(prev => (prev + 1) % LIVE_ACTIVITY.length);
        slideAnim.setValue(20);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = LIVE_ACTIVITY[currentIndex];

  return (
    <Animated.View style={[s.activityTicker, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={s.activityDot} />
      <Text style={s.activityText}>
        <Text style={s.activityName}>{item.name}</Text>
        {' '}{item.action}{' '}
        <Text style={s.activityLocation}>· {item.location}</Text>
      </Text>
      <Text style={s.activityTime}>{item.time}</Text>
    </Animated.View>
  );
}

export default function LandingScreen() {
  const router = useRouter();
  const { ownerDirectAccess, ownerAccessLoading, isAdmin } = useAuth();
  const { width: _screenWidth } = useWindowDimensions();

  const [quickBuyVisible, setQuickBuyVisible] = useState<boolean>(false);
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

  const [step, setStep] = useState<number>(0);
  const [selectedGoal, setSelectedGoal] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  const [memberPosition, setMemberPosition] = useState<number>(0);
  const [heroIndex, setHeroIndex] = useState<number>(0);
  const [showReferral, setShowReferral] = useState<boolean>(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const stepFade = useRef(new Animated.Value(1)).current;
  const stepSlide = useRef(new Animated.Value(0)).current;
  const heroOpacity = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;

  const sessionIdRef = useRef<string>(`lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const geoDataRef = useRef<{ city?: string; region?: string; country?: string; countryCode?: string; lat?: number; lng?: number; timezone?: string } | undefined>(undefined);
  const hasTrackedRef = useRef<{ pageView: boolean; step1: boolean; step2: boolean; step3: boolean; scroll25: boolean; scroll50: boolean; scroll75: boolean; scroll100: boolean }>({
    pageView: false, step1: false, step2: false, step3: false,
    scroll25: false, scroll50: false, scroll75: false, scroll100: false,
  });
  const sessionStartRef = useRef<number>(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityStartRef = useRef<number>(Date.now());
  const totalVisibleTimeRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);

  const trackMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      console.log('[Landing] Track event:', input.event);
      await safeSupabaseInsert('landing_analytics', {
        event: input.event as string,
        session_id: input.sessionId as string,
        properties: input.properties,
        geo: input.geo,
        created_at: new Date().toISOString(),
      });
      return { success: true };
    },
  });

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
        geoCountry: geoDataRef.current?.country,
        section: (properties?.section as string) || 'hero',
        step,
      },
      geo: geoDataRef.current,
    }, { onError: (e) => console.log('[Landing Track] Supabase insert failed (non-fatal):', e) });
  };

  const trackEvent = useCallback((event: string, properties?: Record<string, unknown>) => {
    trackEventRef.current(event, properties);
  }, []);

  const sendHeartbeat = useCallback(() => {
    const now = Date.now();
    const sessionDuration = Math.round((now - sessionStartRef.current) / 1000);
    if (isVisibleRef.current) {
      totalVisibleTimeRef.current += now - visibilityStartRef.current;
      visibilityStartRef.current = now;
    }
    const activeTime = Math.round(totalVisibleTimeRef.current / 1000);

    trackMutation.mutate({
      event: 'heartbeat',
      sessionId: sessionIdRef.current,
      properties: {
        sessionDuration,
        activeTime,
        currentStep: step,
        platform: Platform.OS,
        timestamp: new Date().toISOString(),
        section: `step_${step}`,
        page: '/landing',
      },
      geo: geoDataRef.current,
    }, { onError: () => {} });
  }, [step, trackMutation]);

  useEffect(() => {
    heartbeatRef.current = setInterval(sendHeartbeat, 15000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sendHeartbeat]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisChange = () => {
        const now = Date.now();
        if (document.hidden) {
          if (isVisibleRef.current) {
            totalVisibleTimeRef.current += now - visibilityStartRef.current;
            isVisibleRef.current = false;
            trackEvent('tab_hidden', { section: `step_${step}`, sessionDuration: Math.round((now - sessionStartRef.current) / 1000) });
          }
        } else {
          if (!isVisibleRef.current) {
            visibilityStartRef.current = now;
            isVisibleRef.current = true;
            trackEvent('tab_visible', { section: `step_${step}`, sessionDuration: Math.round((now - sessionStartRef.current) / 1000) });
          }
        }
      };
      document.addEventListener('visibilitychange', handleVisChange);
      return () => document.removeEventListener('visibilitychange', handleVisChange);
    } else {
      const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
        const now = Date.now();
        if (state === 'active') {
          visibilityStartRef.current = now;
          isVisibleRef.current = true;
        } else if (state === 'background' || state === 'inactive') {
          if (isVisibleRef.current) {
            totalVisibleTimeRef.current += now - visibilityStartRef.current;
            isVisibleRef.current = false;
          }
        }
      });
      return () => sub.remove();
    }
  }, [step, trackEvent]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const now = Date.now();
      const sessionDuration = Math.round((now - sessionStartRef.current) / 1000);
      if (isVisibleRef.current) {
        totalVisibleTimeRef.current += now - visibilityStartRef.current;
      }
      const activeTime = Math.round(totalVisibleTimeRef.current / 1000);
      trackMutation.mutate({
        event: 'session_end',
        sessionId: sessionIdRef.current,
        properties: { sessionDuration, activeTime, finalStep: step, platform: Platform.OS },
        geo: geoDataRef.current,
      }, { onError: () => {} });
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    return undefined;
  }, [step, trackMutation]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollHeight = contentSize.height - layoutMeasurement.height;
    if (scrollHeight <= 0) return;
    const pct = Math.round((contentOffset.y / scrollHeight) * 100);

    if (pct >= 25 && !hasTrackedRef.current.scroll25) {
      hasTrackedRef.current.scroll25 = true;
      trackEvent('scroll_25', { section: 'properties', scrollPercent: 25 });
    }
    if (pct >= 50 && !hasTrackedRef.current.scroll50) {
      hasTrackedRef.current.scroll50 = true;
      trackEvent('scroll_50', { section: 'how_it_works', scrollPercent: 50 });
    }
    if (pct >= 75 && !hasTrackedRef.current.scroll75) {
      hasTrackedRef.current.scroll75 = true;
      trackEvent('scroll_75', { section: 'testimonials', scrollPercent: 75 });
    }
    if (pct >= 95 && !hasTrackedRef.current.scroll100) {
      hasTrackedRef.current.scroll100 = true;
      trackEvent('scroll_100', { section: 'footer', scrollPercent: 100 });
    }
  }, [trackEvent]);

  const statsQuery = useQuery({
    queryKey: ['waitlist-stats'],
    queryFn: async () => {
      const { count } = await safeSupabaseSelect('waitlist', { count: true });
      if (count !== null) {
        return { totalMembers: count };
      }
      const localList = await getLocalWaitlist();
      return { totalMembers: localList.length };
    },
    retry: 1,
    staleTime: 1000 * 60,
  });

  const localParseDeal = useCallback((d: any): JVDeal => {
    const parsed = sharedParseDeal(d);
    console.log('[Landing] parseDeal:', parsed.id, '| project:', parsed.projectName, '| photos:', parsed.photos.length, '| published:', parsed.published);
    return parsed;
  }, []);

  const publishedDealsQuery = useQuery({
    queryKey: [...QUERY_KEY_PUBLISHED_JV_DEALS],
    queryFn: async () => {
      console.log('[Landing] Fetching published JV deals...');
      let deals: JVDeal[] = [];
      try {
        const result = await fetchJVDeals({ published: true });
        console.log('[Landing] Got', result.deals?.length ?? 0, 'published deals from storage layer');
        deals = (result.deals || []).map(localParseDeal);
      } catch (err) {
        console.log('[Landing] Published deals fetch failed:', (err as Error)?.message, '— resetting + using fallback');
        resetSupabaseCheck();
      }

      if (deals.length === 0) {
        console.log('[Landing] Zero published deals — only showing explicitly published deals, no fallback to all');
      }

      console.log('[Landing] Final deals count:', deals.length, '| names:', deals.map(d => d.projectName).join(', '));
      return { deals };
    },
    staleTime: 5000,
    gcTime: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always' as const,
    refetchInterval: 12000,
    refetchIntervalInBackground: false,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 5000),
    placeholderData: { deals: [] } as { deals: JVDeal[] },
  });

  const displayDeals = useMemo(() => {
    const queryDeals = publishedDealsQuery.data?.deals ?? [];
    console.log('[Landing] displayDeals: showing', queryDeals.length, 'deals');
    return queryDeals;
  }, [publishedDealsQuery.data?.deals]);



  useJVRealtime('landing-jv-deals', true);


  const handleEditDeal = useCallback((dealId: string) => {
    console.log('[Landing] Navigate to edit deal:', dealId);
    router.push(`/jv-agreement?editId=${dealId}` as any);
  }, [router]);

  const openQuickBuy = useCallback((deal: JVDeal) => {
    const qbPhotos: string[] = getDealPhotos(deal);
    setQuickBuyDeal({
      id: deal.id,
      title: deal.title,
      projectName: deal.projectName,
      totalInvestment: Number(deal.totalInvestment),
      expectedROI: Number(deal.expectedROI),
      photo: qbPhotos.length > 0 ? qbPhotos[0] : undefined,
      propertyAddress: deal.propertyAddress,
      type: deal.type,
      minInvestment: 50,
    });
    setQuickBuyVisible(true);
    trackEvent('landing_quick_buy_open', { dealId: deal.id, dealTitle: deal.title });
  }, [trackEvent]);

  const joinMutation = useMutation({
    mutationFn: async (input: { firstName: string; lastName: string; email: string; phone: string; goal: string }) => {
      const { data } = await safeSupabaseInsert('waitlist', {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        goal: input.goal,
        created_at: new Date().toISOString(),
      });
      if (data) {
        return { success: true, alreadyRegistered: false, position: data?.id ? parseInt(String(data.id), 10) : Math.floor(Math.random() * 500) + 100 };
      }
      const localResult = await addToLocalWaitlist({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
        goal: input.goal,
      });
      return { success: true, alreadyRegistered: false, position: localResult.position };
    },
    onSuccess: (data: { success: boolean; alreadyRegistered: boolean; position: number }) => {
      console.log('[Waitlist] Joined:', data);
      setMemberPosition(data.position);
      goToStep(3);
    },
    onError: (err: unknown) => {
      console.error('[Waitlist] Error:', err);
      setFormError('Something went wrong. Please try again.');
    },
  });

  useEffect(() => {
    const fetchGeo = async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        geoDataRef.current = { timezone: tz };
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          geoDataRef.current = {
            city: data.city, region: data.region, country: data.country_name,
            countryCode: data.country_code, lat: data.latitude, lng: data.longitude,
            timezone: data.timezone || tz,
          };
          console.log('[Landing Geo]', geoDataRef.current.city, geoDataRef.current.country);
        }
      } catch (err) {
        console.log('[Landing Geo] Failed:', err);
      }
    };
    void fetchGeo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasTrackedRef.current.pageView) {
      hasTrackedRef.current.pageView = true;
      trackEvent('landing_page_view', { section: 'hero' });
    }

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 12, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    const imgInterval = HERO_IMAGES.length > 0 ? setInterval(() => {
      Animated.timing(heroOpacity, { toValue: 0.3, duration: 400, useNativeDriver: true }).start(() => {
        setHeroIndex(prev => (prev + 1) % HERO_IMAGES.length);
        Animated.timing(heroOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      });
    }, 4000) : null;

    return () => { if (imgInterval) clearInterval(imgInterval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToStep = useCallback((nextStep: number) => {
    trackEvent(`step_${nextStep}_enter`, { section: `step_${nextStep}`, previousStep: step });

    Animated.timing(stepFade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      stepSlide.setValue(40);
      Animated.parallel([
        Animated.timing(stepFade, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(stepSlide, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
      ]).start();
    });

    Animated.timing(progressAnim, { toValue: nextStep / 3, duration: 500, useNativeDriver: false }).start();

    if (nextStep === 3) {
      Animated.sequence([
        Animated.delay(200),
        Animated.spring(successScale, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      ]).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(confettiAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(confettiAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [step, trackEvent, stepFade, stepSlide, progressAnim, successScale, confettiAnim]);

  const handleGoalSelect = useCallback((goalId: string) => {
    setSelectedGoal(goalId);
    trackEvent('goal_selected', { goal: goalId, section: 'step_1' });
    setTimeout(() => goToStep(2), 400);
  }, [goToStep, trackEvent]);

  const handleSubmit = useCallback(() => {
    setFormError('');
    if (!firstName.trim()) { setFormError('Enter your first name'); return; }
    if (!email.trim() || !email.includes('@')) { setFormError('Enter a valid email'); return; }

    trackEvent('form_submit', { goal: selectedGoal, section: 'step_2' });

    joinMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim() || firstName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      goal: (selectedGoal as string) || 'under_1k',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, email, phone, selectedGoal, trackEvent]);

  const totalMembers = (statsQuery.data?.totalMembers ?? 0) + 52000;
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const renderStep0 = () => (
    <Animated.View style={[s.stepContainer, { opacity: stepFade, transform: [{ translateY: stepSlide }] }]}>
      <View style={s.heroImageWrap}>
        <Animated.Image
          source={{ uri: HERO_IMAGES[heroIndex] }}
          style={[s.heroImage, { opacity: heroOpacity }]}
          resizeMode="cover"
        />
        <View style={s.heroImageGradient} />

        <View style={s.heroOverlayContent}>
          <View style={s.heroLogoRow}>
            <Image source={IPX_LOGO} style={s.heroLogo} resizeMode="contain" />
            <View>
              <Text style={s.heroBrandName}>IVXHOLDINGS</Text>
              <View style={s.heroLiveRow}>
                <Animated.View style={[s.heroLiveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={s.heroLiveText}>LIVE</Text>
              </View>
            </View>
          </View>

          <View style={s.heroReturnBadge}>
            <TrendingUp size={14} color="#00C48C" />
            <Text style={s.heroReturnText}>+14.5% avg return</Text>
          </View>
        </View>

        <View style={s.heroDots}>
          {HERO_IMAGES.map((_, i) => (
            <View key={i} style={[s.heroDot, i === heroIndex && s.heroDotActive]} />
          ))}
        </View>
      </View>

      <View style={s.heroContent}>
        <LiveActivityTicker />

        <Text style={s.heroTitle}>
          Own Real Estate.{'\n'}
          <Text style={s.heroTitleAccent}>Earn Like a Landlord.</Text>
        </Text>

        <Text style={s.heroSubtitle}>
          Start with $1. Earn monthly dividends. Trade shares 24/7. Join 52,000+ investors worldwide.
        </Text>

        <View style={s.socialProofRow}>
          {SOCIAL_PROOF_STATS.map((stat, i) => (
            <View key={i} style={s.socialProofItem}>
              <Text style={s.socialProofValue}>{stat.value}</Text>
              <Text style={s.socialProofLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.trustBadgesRow}>
          {[
            { icon: <Shield size={12} color="#00C48C" />, label: 'SEC Compliant' },
            { icon: <Lock size={12} color="#4A90D9" />, label: 'Bank-Grade Security' },
            { icon: <Award size={12} color="#FFD700" />, label: 'FDIC Escrow' },
          ].map((badge, i) => (
            <View key={i} style={s.trustBadge}>
              {badge.icon}
              <Text style={s.trustBadgeText}>{badge.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.investNowSection}>
          <View style={s.investNowHeader}>
            <View style={s.investNowTitleRow}>
              <Landmark size={18} color={Colors.primary} />
              <Text style={s.investNowTitle}>Start Investing</Text>
            </View>
            <View style={s.investNowLiveBadge}>
              <View style={s.investNowPulse} />
              <Text style={s.investNowLiveText}>OPEN</Text>
            </View>
          </View>
          <Text style={s.investNowSubtitle}>No minimum barriers. Buy shares or join JV deals directly.</Text>

          <View style={s.investOptionsRow}>
            <TouchableOpacity
              style={s.investOptionCard}
              onPress={() => { trackEvent('landing_buy_shares'); router.push('/(tabs)/market' as any); }}
              activeOpacity={0.85}
              testID="landing-buy-shares"
            >
              <View style={[s.investOptionIcon, { backgroundColor: 'rgba(0,196,140,0.12)' }]}>
                <Coins size={22} color="#00C48C" />
              </View>
              <Text style={s.investOptionTitle}>Buy Shares</Text>
              <Text style={s.investOptionDesc}>From $1 — own fractions of premium properties</Text>
              <View style={s.investOptionCta}>
                <Text style={s.investOptionCtaText}>Buy Now</Text>
                <ArrowRight size={12} color={Colors.primary} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.investOptionCard}
              onPress={() => { trackEvent('landing_jv_invest'); router.push('/jv-agreement' as any); }}
              activeOpacity={0.85}
              testID="landing-jv-invest"
            >
              <View style={[s.investOptionIcon, { backgroundColor: 'rgba(255,215,0,0.12)' }]}>
                <Handshake size={22} color="#FFD700" />
              </View>
              <Text style={s.investOptionTitle}>JV Deals</Text>
              <Text style={s.investOptionDesc}>Direct equity — partner on live real estate projects</Text>
              <View style={s.investOptionCta}>
                <Text style={s.investOptionCtaText}>Invest Now</Text>
                <ArrowRight size={12} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={s.investStatsStrip}>
            <View style={s.investStripItem}>
              <Building2 size={12} color="#4A90D9" />
              <Text style={s.investStripText}>24/7 Trading</Text>
            </View>
            <View style={s.investStripDot} />
            <View style={s.investStripItem}>
              <BarChart3 size={12} color="#00C48C" />
              <Text style={s.investStripText}>14.5% Avg Return</Text>
            </View>
            <View style={s.investStripDot} />
            <View style={s.investStripItem}>
              <Shield size={12} color="#FFD700" />
              <Text style={s.investStripText}>FDIC Protected</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={s.jvSection}
          onPress={() => { trackEvent('jv_agreement_click'); router.push('/jv-agreement' as any); }}
          activeOpacity={0.85}
          testID="landing-jv-agreement"
        >
          <View style={s.jvSectionHeader}>
            <View style={s.jvIconRow}>
              <Handshake size={22} color="#FFD700" />
              <View style={s.jvLiveBadge}>
                <Text style={s.jvLiveBadgeText}>NEW</Text>
              </View>
            </View>
            <ChevronRight size={18} color={Colors.primary} />
          </View>
          <Text style={s.jvSectionTitle}>Joint Venture Agreements</Text>
          <Text style={s.jvSectionSubtitle}>
            Partner with global investors. Create secure JV deals with institutional-grade legal protection.
          </Text>
          <View style={s.jvStatsRow}>
            <View style={s.jvStatItem}>
              <DollarSign size={12} color="#00C48C" />
              <Text style={s.jvStatValue}>$25M+</Text>
              <Text style={s.jvStatLabel}>JV Deals</Text>
            </View>
            <View style={s.jvStatDivider} />
            <View style={s.jvStatItem}>
              <Globe size={12} color="#4A90D9" />
              <Text style={s.jvStatValue}>12+</Text>
              <Text style={s.jvStatLabel}>Countries</Text>
            </View>
            <View style={s.jvStatDivider} />
            <View style={s.jvStatItem}>
              <Scale size={12} color="#E879F9" />
              <Text style={s.jvStatValue}>100%</Text>
              <Text style={s.jvStatLabel}>Protected</Text>
            </View>
          </View>
          <View style={s.jvFeaturesRow}>
            {[
              { icon: <FileText size={11} color="#FFD700" />, label: 'Smart Contracts' },
              { icon: <Shield size={11} color="#00C48C" />, label: 'Legal Shield' },
              { icon: <Users size={11} color="#4A90D9" />, label: 'Multi-Partner' },
            ].map((feat, i) => (
              <View key={i} style={s.jvFeatureChip}>
                {feat.icon}
                <Text style={s.jvFeatureText}>{feat.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {displayDeals.length > 0 && (
          <View style={s.howItWorksSection}>
            <Text style={s.howItWorksTitle}>How to Invest from This Page</Text>
            <View style={s.howItWorksSteps}>
              {[
                { num: '1', label: 'Choose a Deal', desc: 'Browse live JV opportunities above', color: '#00C48C' },
                { num: '2', label: 'Tap Invest Now', desc: 'Select amount & investment type', color: '#FFD700' },
                { num: '3', label: 'Create Account', desc: 'Quick signup — takes 30 seconds', color: '#4A90D9' },
                { num: '4', label: 'Confirm & Own', desc: 'You\'re an investor. Track returns 24/7', color: '#E879F9' },
              ].map((item, i) => (
                <View key={i} style={s.howItWorksStep}>
                  <View style={[s.howItWorksNum, { backgroundColor: item.color + '18', borderColor: item.color + '35' }]}>
                    <Text style={[s.howItWorksNumText, { color: item.color }]}>{item.num}</Text>
                  </View>
                  <View style={s.howItWorksStepText}>
                    <Text style={s.howItWorksStepLabel}>{item.label}</Text>
                    <Text style={s.howItWorksStepDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {displayDeals.length > 0 && (
          <LandingDealsErrorBoundary>
          <View style={s.liveDealsSection}>
            <View style={s.liveDealsSectionHeader}>
              <View style={s.liveDealsTitleRow}>
                <Globe size={18} color="#00C48C" />
                <Text style={s.liveDealsSectionTitle}>Live Investment Opportunities</Text>
              </View>
              <View style={s.liveDealsBadge}>
                <Animated.View style={[s.liveDealsPulse, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={s.liveDealsBadgeText}>{displayDeals.length} LIVE</Text>
              </View>
            </View>
            <Text style={s.liveDealsSectionSub}>Published JV deals with photos — purchase tokenized shares or join as JV partner.</Text>

            {displayDeals.map((deal: JVDeal) => {
              const typeLabels: Record<string, string> = {
                equity_split: '📊 Equity Split',
                profit_sharing: '💰 Profit Sharing',
                hybrid: '🔄 Hybrid',
                development: '🏗️ Development JV',
              };
              const dealPhotos: string[] = getDealPhotos(deal);
              return (
                <View
                  key={deal.id}
                  style={s.liveDealCard}
                >
                  <View style={s.liveDealGalleryWrap}>
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      style={s.liveDealGalleryScroll}
                    >
                      {dealPhotos.map((uri: string, idx: number) => (
                        <Image
                          key={`lp-photo-${deal.id}-${idx}`}
                          source={{ uri }}
                          style={s.liveDealImage}
                          resizeMode="cover"
                          onError={(e) => console.log('[Landing] Deal image load error:', deal.id, e.nativeEvent?.error)}
                        />
                      ))}
                    </ScrollView>
                    {dealPhotos.length > 1 && (
                      <View style={s.liveDealPhotoDots}>
                        {dealPhotos.map((_: string, idx: number) => (
                          <View key={idx} style={[s.liveDealPhotoDot, idx === 0 && s.liveDealPhotoDotActive]} />
                        ))}
                      </View>
                    )}
                    <View style={s.liveDealPhotoCountBadge}>
                      <ImageIcon size={10} color="#fff" />
                      <Text style={s.liveDealPhotoCountText}>{dealPhotos.length}</Text>
                    </View>
                    <View style={s.liveDealOverlayBadge}>
                      <Animated.View style={[s.liveDealOverlayDot, { transform: [{ scale: pulseAnim }] }]} />
                      <Text style={s.liveDealOverlayText}>LIVE</Text>
                    </View>
                  </View>
                  <View style={s.liveDealContent}>
                    {isAdmin && (
                      <View style={s.adminActionsRow}>
                        <TouchableOpacity
                          style={s.adminEditBtn}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            handleEditDeal(deal.id);
                          }}
                          activeOpacity={0.7}
                          testID={`admin-edit-${deal.id}`}
                        >
                          <Edit3 size={14} color="#4A90D9" />
                          <Text style={s.adminEditBtnText}>Edit</Text>
                        </TouchableOpacity>

                      </View>
                    )}
                    <View style={s.liveDealTopRow}>
                      <View style={s.liveDealTypeBadge}>
                        <Text style={s.liveDealTypeText}>{typeLabels[String(deal.type)] || String(deal.type)}</Text>
                      </View>
                      <View style={s.liveDealRoiBadge}>
                        <TrendingUp size={10} color="#00C48C" />
                        <Text style={s.liveDealRoiText}>{String(deal.expectedROI)}% ROI</Text>
                      </View>
                    </View>
                    <Text style={s.liveDealTitle}>{String(deal.title)}</Text>
                    <Text style={s.liveDealProject}>{String(deal.projectName)}</Text>
                    {deal.propertyAddress ? (
                      <View style={s.liveDealLocationRow}>
                        <Globe size={11} color="#5A5A5A" />
                        <Text style={s.liveDealLocation} numberOfLines={1}>{String(deal.propertyAddress)}</Text>
                      </View>
                    ) : null}
                    {deal.description ? (
                      <Text style={s.liveDealDesc} numberOfLines={2}>{String(deal.description)}</Text>
                    ) : null}
                    <View style={s.liveDealMetrics}>
                      <View style={s.liveDealMetric}>
                        <Text style={s.liveDealMetricValue}>
                          {formatCurrencyCompact(Number(deal.totalInvestment))}
                        </Text>
                        <Text style={s.liveDealMetricLabel}>Investment</Text>
                      </View>
                      <View style={s.liveDealMetricDivider} />
                      <View style={s.liveDealMetric}>
                        <Text style={[s.liveDealMetricValue, { color: '#00C48C' }]}>{String(deal.expectedROI)}%</Text>
                        <Text style={s.liveDealMetricLabel}>Expected ROI</Text>
                      </View>
                      <View style={s.liveDealMetricDivider} />
                      <View style={s.liveDealMetric}>
                        <Text style={s.liveDealMetricValue}>{getPartnerCount(deal.partners)}</Text>
                        <Text style={s.liveDealMetricLabel}>Partners</Text>
                      </View>
                    </View>

                    {getPoolTiersArray(deal).length > 0 ? (
                      <View style={s.liveDealPoolOptions}>
                        {getPoolTiersArray(deal).slice(0, 2).map((tier: JVDealPoolTier) => {
                          const tierColors: Record<string, string> = { jv_direct: '#00C48C', token_shares: '#FFD700', private_lending: '#4A90D9', open: '#E879F9' };
                          const tierIcons: Record<string, string> = { jv_direct: '🏛️', token_shares: '🪙', private_lending: '🏦', open: '🌐' };
                          const color = tierColors[tier.type] || '#FFD700';
                          const fillPct = tier.targetAmount > 0 ? Math.min((tier.currentRaised / tier.targetAmount) * 100, 100) : 0;
                          return (
                            <TouchableOpacity
                              key={tier.id}
                              style={s.liveDealPoolCard}
                              onPress={() => {
                                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                trackEvent('landing_pool_click', { dealId: deal.id, tierId: tier.id, tierType: tier.type });
                                router.push(`/jv-invest?jvId=${String(deal.id)}` as any);
                              }}
                              activeOpacity={0.85}
                            >
                              <View style={[s.liveDealPoolIcon, { backgroundColor: color + '18' }]}>
                                <Text style={{ fontSize: 16 }}>{tierIcons[tier.type] || '💰'}</Text>
                              </View>
                              <View style={s.liveDealPoolText}>
                                <Text style={s.liveDealPoolTitle}>{tier.label || tier.type}</Text>
                                <Text style={s.liveDealPoolDesc}>Min {formatCurrencyCompact(tier.minInvestment)}</Text>
                                <View style={{ height: 3, backgroundColor: '#1A1A1E', borderRadius: 2, marginTop: 4, overflow: 'hidden' as const }}>
                                  <View style={{ height: 3, backgroundColor: color, borderRadius: 2, width: `${fillPct}%` as any }} />
                                </View>
                              </View>
                              <ArrowRight size={13} color={color} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={s.liveDealPoolOptions}>
                        <TouchableOpacity
                          style={s.liveDealPoolCard}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            trackEvent('landing_jv_direct_click', { dealId: deal.id });
                            router.push(`/jv-invest?jvId=${String(deal.id)}` as any);
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={[s.liveDealPoolIcon, { backgroundColor: 'rgba(0,196,140,0.12)' }]}>
                            <Landmark size={16} color="#00C48C" />
                          </View>
                          <View style={s.liveDealPoolText}>
                            <Text style={s.liveDealPoolTitle}>JV Partner</Text>
                            <Text style={s.liveDealPoolDesc}>Direct equity stake</Text>
                          </View>
                          <ArrowRight size={13} color="#00C48C" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.liveDealPoolCard}
                          onPress={() => {
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            trackEvent('landing_token_shares_click', { dealId: deal.id });
                            router.push(`/jv-invest?jvId=${String(deal.id)}` as any);
                          }}
                          activeOpacity={0.85}
                        >
                          <View style={[s.liveDealPoolIcon, { backgroundColor: 'rgba(255,215,0,0.12)' }]}>
                            <Coins size={16} color="#FFD700" />
                          </View>
                          <View style={s.liveDealPoolText}>
                            <Text style={s.liveDealPoolTitle}>Token Shares</Text>
                            <Text style={s.liveDealPoolDesc}>From $50</Text>
                          </View>
                          <ArrowRight size={13} color="#FFD700" />
                        </TouchableOpacity>
                      </View>
                    )}

                    <View style={s.liveDealFooter}>
                      <View style={s.liveDealInfoChips}>
                        <View style={s.liveDealLiveBadge}>
                          <View style={s.liveDealLiveDot} />
                          <Text style={s.liveDealLiveBadgeText}>LIVE</Text>
                        </View>
                        <View style={s.liveDealInfoChip}>
                          <Text style={s.liveDealInfoChipText}>{String(deal.distributionFrequency)}</Text>
                        </View>
                        <View style={s.liveDealInfoChip}>
                          <Text style={s.liveDealInfoChipText}>{String(deal.exitStrategy)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.liveDealDualCta}>
                      <TouchableOpacity
                        style={s.liveDealInvestBtn}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                          trackEvent('live_deal_invest_click', { dealId: deal.id, dealTitle: deal.title });
                          openQuickBuy(deal);
                        }}
                        activeOpacity={0.85}
                        testID={`invest-deal-${deal.id}`}
                      >
                        <Zap size={16} color="#000" />
                        <Text style={s.liveDealInvestBtnText}>Invest Now</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.liveDealDetailBtn}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          trackEvent('live_deal_detail_click', { dealId: deal.id });
                          router.push(`/jv-invest?jvId=${String(deal.id)}` as any);
                        }}
                        activeOpacity={0.85}
                        testID={`detail-deal-${deal.id}`}
                      >
                        <Text style={s.liveDealDetailBtnText}>Full Details</Text>
                        <ChevronRight size={14} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          </LandingDealsErrorBoundary>
        )}
      </View>
    </Animated.View>
  );

  const renderStep1 = () => (
    <Animated.View style={[s.stepContainer, { opacity: stepFade, transform: [{ translateY: stepSlide }] }]}>
      <View style={s.stepHeader}>
        <View style={s.stepBadge}>
          <Sparkles size={12} color={Colors.primary} />
          <Text style={s.stepBadgeText}>STEP 1 OF 3</Text>
        </View>
        <Text style={s.stepTitle}>What{"'"}s your{'\n'}investment goal?</Text>
        <Text style={s.stepSubtitle}>
          We{"'"}ll personalize your experience and match you with the best opportunities.
        </Text>
      </View>

      <View style={s.goalsGrid}>
        {INVESTMENT_GOALS.map((goal) => {
          const isSelected = selectedGoal === goal.id;
          return (
            <TouchableOpacity
              key={goal.id}
              style={[
                s.goalCard,
                isSelected && { borderColor: goal.color, backgroundColor: goal.color + '12' },
              ]}
              onPress={() => handleGoalSelect(goal.id)}
              activeOpacity={0.8}
              testID={`goal-${goal.id}`}
            >
              <Text style={s.goalEmoji}>{goal.icon}</Text>
              <View style={s.goalTextWrap}>
                <Text style={s.goalLabel}>{goal.label}</Text>
                <Text style={s.goalDesc}>{goal.desc}</Text>
              </View>
              {isSelected ? (
                <View style={[s.goalCheck, { backgroundColor: goal.color }]}>
                  <CheckCircle size={14} color="#000" />
                </View>
              ) : (
                <View style={s.goalCircle} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.stepFooterNote}>
        <Users size={12} color={Colors.textTertiary} />
        <Text style={s.stepFooterNoteText}>
          <Text style={{ color: Colors.primary, fontWeight: '700' as const }}>2,340</Text> people chose their goal today
        </Text>
      </View>
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View style={[s.stepContainer, { opacity: stepFade, transform: [{ translateY: stepSlide }] }]}>
      <View style={s.stepHeader}>
        <View style={s.stepBadge}>
          <Zap size={12} color={Colors.primary} />
          <Text style={s.stepBadgeText}>STEP 2 OF 3</Text>
        </View>
        <Text style={s.stepTitle}>Create your{'\n'}free account</Text>
        <Text style={s.stepSubtitle}>
          Takes 30 seconds. No credit card required. Start investing immediately.
        </Text>
      </View>

      <View style={s.formWrap}>
        <View style={s.formInputRow}>
          <View style={[s.formInput, { flex: 1 }]}>
            <User size={16} color={Colors.textTertiary} />
            <TextInput
              style={s.formInputText}
              placeholder="First name"
              placeholderTextColor={Colors.inputPlaceholder}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              testID="landing-first-name"
            />
          </View>
          <View style={[s.formInput, { flex: 1 }]}>
            <User size={16} color={Colors.textTertiary} />
            <TextInput
              style={s.formInputText}
              placeholder="Last name"
              placeholderTextColor={Colors.inputPlaceholder}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              testID="landing-last-name"
            />
          </View>
        </View>

        <View style={s.formInput}>
          <Mail size={16} color={Colors.textTertiary} />
          <TextInput
            style={s.formInputText}
            placeholder="Email address"
            placeholderTextColor={Colors.inputPlaceholder}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="landing-email"
          />
        </View>

        <View style={s.formInput}>
          <Phone size={16} color={Colors.textTertiary} />
          <TextInput
            style={s.formInputText}
            placeholder="Phone (optional)"
            placeholderTextColor={Colors.inputPlaceholder}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            testID="landing-phone"
          />
        </View>

        {formError.length > 0 && (
          <Text style={s.formError}>{formError}</Text>
        )}

        <TouchableOpacity
          style={[s.submitBtn, joinMutation.isPending && { opacity: 0.6 }]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={joinMutation.isPending}
          testID="landing-submit"
        >
          {joinMutation.isPending ? (
            <Text style={s.submitBtnText}>Creating account...</Text>
          ) : (
            <>
              <Text style={s.submitBtnText}>Get Early Access</Text>
              <ArrowRight size={18} color="#000" />
            </>
          )}
        </TouchableOpacity>

        <Text style={s.formDisclaimer}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
          No spam — ever.
        </Text>
      </View>

      <View style={s.memberJoinRow}>
        <View style={s.memberAvatarsRow}>
          {['#FFD700', '#4A90D9', '#00C48C', '#FF6B6B', '#E879F9'].map((c, i) => (
            <View key={i} style={[s.memberAv, { backgroundColor: c, marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i }]} />
          ))}
        </View>
        <Text style={s.memberJoinText}>
          <Text style={{ color: Colors.primary, fontWeight: '800' as const }}>
            {totalMembers.toLocaleString()}+
          </Text>
          {' '}investors already joined
        </Text>
      </View>
    </Animated.View>
  );

  const renderStep3 = () => (
    <Animated.View style={[s.stepContainer, { opacity: stepFade, transform: [{ translateY: stepSlide }] }]}>
      <Animated.View style={[s.successWrap, { transform: [{ scale: successScale }] }]}>
        <View style={s.successIconOuter}>
          <Animated.View style={[s.successIconInner, { transform: [{ scale: pulseAnim }] }]}>
            <CheckCircle size={48} color="#00C48C" />
          </Animated.View>
        </View>

        <Text style={s.successTitle}>{"You're in!"} 🎉</Text>
        <Text style={s.successSubtitle}>
          Welcome, {firstName || 'Investor'}! You{"'"}re member{' '}
          <Text style={s.successHighlight}>#{(memberPosition || totalMembers + 1).toLocaleString()}</Text>
        </Text>

        <View style={s.successStatsRow}>
          <View style={s.successStat}>
            <Text style={s.successStatValue}>VIP</Text>
            <Text style={s.successStatLabel}>Access Level</Text>
          </View>
          <View style={s.successStatDivider} />
          <View style={s.successStat}>
            <Text style={s.successStatValue}>Priority</Text>
            <Text style={s.successStatLabel}>Deal Access</Text>
          </View>
          <View style={s.successStatDivider} />
          <View style={s.successStat}>
            <Text style={s.successStatValue}>$500</Text>
            <Text style={s.successStatLabel}>Bonus Eligible</Text>
          </View>
        </View>

        <View style={s.nextStepsWrap}>
          <Text style={s.nextStepsTitle}>YOUR NEXT STEPS</Text>

          {[
            { num: '1', label: 'Complete your profile', desc: 'Unlock full investment access', icon: <User size={16} color={Colors.primary} />, done: true },
            { num: '2', label: 'Verify your identity', desc: 'Quick KYC — takes 2 minutes', icon: <Shield size={16} color="#4A90D9" />, done: false },
            { num: '3', label: 'Make your first investment', desc: 'Start from just $1', icon: <DollarSign size={16} color="#00C48C" />, done: false },
          ].map((item, i) => (
            <View key={i} style={s.nextStepRow}>
              <View style={[s.nextStepIcon, item.done && { backgroundColor: Colors.primary + '20', borderColor: Colors.primary + '40' }]}>
                {item.done ? <CheckCircle size={16} color={Colors.primary} /> : item.icon}
              </View>
              <View style={s.nextStepText}>
                <Text style={s.nextStepLabel}>{item.label}</Text>
                <Text style={s.nextStepDesc}>{item.desc}</Text>
              </View>
              <ChevronRight size={16} color={Colors.textTertiary} />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={s.ctaSignup}
          onPress={() => { trackEvent('cta_complete_profile'); router.push('/signup' as any); }}
          activeOpacity={0.85}
        >
          <Text style={s.ctaSignupText}>Complete Your Profile</Text>
          <ArrowRight size={18} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.referralBtn}
          onPress={() => setShowReferral(!showReferral)}
          activeOpacity={0.8}
        >
          <Gift size={16} color={Colors.primary} />
          <Text style={s.referralBtnText}>Invite Friends & Earn $50 Each</Text>
          <ChevronRight size={14} color={Colors.primary} />
        </TouchableOpacity>

        {showReferral && (
          <View style={s.referralBox}>
            <Text style={s.referralTitle}>Your Referral Link</Text>
            <View style={s.referralLinkRow}>
              <Text style={s.referralLink} numberOfLines={1}>
                ivxholding.com/ref/{firstName?.toLowerCase() || 'investor'}-{memberPosition || 'vip'}
              </Text>
              <TouchableOpacity style={s.referralCopyBtn} activeOpacity={0.7}>
                <Copy size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={s.referralRewardRow}>
              <View style={s.referralRewardItem}>
                <Text style={s.referralRewardValue}>$50</Text>
                <Text style={s.referralRewardLabel}>You earn</Text>
              </View>
              <View style={s.referralRewardDivider} />
              <View style={s.referralRewardItem}>
                <Text style={s.referralRewardValue}>$50</Text>
                <Text style={s.referralRewardLabel}>Friend earns</Text>
              </View>
              <View style={s.referralRewardDivider} />
              <View style={s.referralRewardItem}>
                <Text style={s.referralRewardValue}>∞</Text>
                <Text style={s.referralRewardLabel}>No limit</Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={s.exploreBtn}
          onPress={() => { trackEvent('cta_explore_properties'); router.push('/signup' as any); }}
          activeOpacity={0.8}
        >
          <Eye size={15} color={Colors.primary} />
          <Text style={s.exploreBtnText}>Explore Properties</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {step > 0 && (
            <View style={s.progressBarWrap}>
              <Animated.View style={[s.progressBarFill, { width: progressWidth as any }]} />
            </View>
          )}

          <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            bounces={Platform.OS !== 'web'}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
            onScroll={step === 0 ? handleScroll : undefined}
            scrollEventThrottle={200}
          >
            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </Animated.ScrollView>

          {step === 0 && (
            <SafeAreaView edges={['bottom']} style={s.bottomCTA}>
              <TouchableOpacity
                style={s.mainCTA}
                onPress={() => { trackEvent('cta_get_started'); goToStep(1); }}
                activeOpacity={0.85}
                testID="landing-get-started"
              >
                <Text style={s.mainCTAText}>Get Started — It{"'"}s Free</Text>
                <ArrowRight size={20} color="#000" />
              </TouchableOpacity>
              <View style={s.bottomRow}>
                <TouchableOpacity
                  style={s.secondaryCTA}
                  onPress={() => { trackEvent('cta_sign_in'); router.push('/login' as any); }}
                  activeOpacity={0.75}
                >
                  <Text style={s.secondaryCTAText}>
                    Already a member?{' '}
                    <Text style={s.secondaryCTALink}>Sign In</Text>
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.ownerCTA}
                  onPress={async () => {
                    trackEvent('cta_owner_access');
                    const result = await ownerDirectAccess();
                    if (result.success) {
                      router.replace('/(tabs)' as any);
                    }
                  }}
                  activeOpacity={0.75}
                  disabled={ownerAccessLoading}
                  testID="landing-owner-access"
                >
                  <Lock size={12} color="#FFD700" />
                  <Text style={s.ownerCTAText}>{ownerAccessLoading ? 'Accessing...' : 'CEO Access'}</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      <QuickBuyModal
        visible={quickBuyVisible}
        onClose={() => setQuickBuyVisible(false)}
        deal={quickBuyDeal}
        onNavigateToFullInvest={(dealId: string) => {
          setQuickBuyVisible(false);
          setTimeout(() => router.push(`/jv-invest?jvId=${dealId}` as any), 300);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060608',
  },
  safeTop: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 160,
  },
  progressBarWrap: {
    height: 3,
    backgroundColor: '#1A1A1A',
  },
  progressBarFill: {
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  stepContainer: {
    flex: 1,
  },

  heroImageWrap: {
    height: 280,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    // Dark gradient overlay
    ...(Platform.OS === 'web'
      ? { backgroundImage: 'linear-gradient(180deg, rgba(6,6,8,0.3) 0%, rgba(6,6,8,0.7) 60%, rgba(6,6,8,1) 100%)' } as any
      : { backgroundColor: 'rgba(6,6,8,0.55)' }),
  },
  heroOverlayContent: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    overflow: 'hidden',
  },
  heroBrandName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800' as const,
    letterSpacing: 2,
  },
  heroLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  heroLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00C48C',
  },
  heroLiveText: {
    color: '#00C48C',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  heroReturnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,196,140,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroReturnText: {
    color: '#00C48C',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  heroDots: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  heroDotActive: {
    width: 22,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },

  heroContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 18,
  },

  activityTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0C1A12',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00C48C',
  },
  activityText: {
    flex: 1,
    color: '#9A9A9A',
    fontSize: 12,
  },
  activityName: {
    color: '#fff',
    fontWeight: '700' as const,
  },
  activityLocation: {
    color: '#6A6A6A',
  },
  activityTime: {
    color: '#6A6A6A',
    fontSize: 10,
  },

  heroTitle: {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#FFFFFF',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroTitleAccent: {
    color: Colors.primary,
  },
  heroSubtitle: {
    color: '#8A8A8A',
    fontSize: 15,
    lineHeight: 23,
  },

  socialProofRow: {
    flexDirection: 'row',
    backgroundColor: '#0D0D0F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E1E22',
    overflow: 'hidden',
  },
  socialProofItem: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1E1E22',
  },
  socialProofValue: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900' as const,
    letterSpacing: 0.5,
  },
  socialProofLabel: {
    color: '#6A6A6A',
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 3,
  },

  trustBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0D0D0F',
    borderWidth: 1,
    borderColor: '#1E1E22',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  trustBadgeText: {
    color: '#7A7A7A',
    fontSize: 11,
    fontWeight: '600' as const,
  },

  stepHeader: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 8,
    gap: 10,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start' as const,
  },
  stepBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  stepTitle: {
    fontSize: 30,
    fontWeight: '900' as const,
    color: '#FFFFFF',
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    color: '#7A7A7A',
    fontSize: 14,
    lineHeight: 21,
  },

  goalsGrid: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0D0D0F',
    borderWidth: 1.5,
    borderColor: '#1E1E22',
    borderRadius: 18,
    padding: 18,
  },
  goalEmoji: {
    fontSize: 28,
  },
  goalTextWrap: {
    flex: 1,
    gap: 3,
  },
  goalLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  goalDesc: {
    color: '#6A6A6A',
    fontSize: 12,
    lineHeight: 17,
  },
  goalCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2A2A2E',
  },

  stepFooterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  stepFooterNoteText: {
    color: '#6A6A6A',
    fontSize: 12,
  },

  formWrap: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 14,
  },
  formInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0D0D0F',
    borderWidth: 1.5,
    borderColor: '#1E1E22',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  formInputText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    height: 52,
  },
  formError: {
    color: '#FF4D4D',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  formDisclaimer: {
    color: '#4A4A4A',
    fontSize: 11,
    textAlign: 'center' as const,
    lineHeight: 16,
  },

  memberJoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  memberAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAv: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#060608',
  },
  memberJoinText: {
    color: '#6A6A6A',
    fontSize: 13,
  },

  successWrap: {
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
    gap: 16,
  },
  successIconOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0,196,140,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,196,140,0.2)',
  },
  successIconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,196,140,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
  },
  successSubtitle: {
    color: '#8A8A8A',
    fontSize: 15,
    textAlign: 'center' as const,
    lineHeight: 22,
  },
  successHighlight: {
    color: Colors.primary,
    fontWeight: '800' as const,
  },

  successStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#0D0D0F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E1E22',
    width: '100%',
    overflow: 'hidden',
    marginTop: 4,
  },
  successStat: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  successStatValue: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '900' as const,
  },
  successStatLabel: {
    color: '#5A5A5A',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  successStatDivider: {
    width: 1,
    backgroundColor: '#1E1E22',
  },

  nextStepsWrap: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  nextStepsTitle: {
    color: '#5A5A5A',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0D0D0F',
    borderWidth: 1,
    borderColor: '#1E1E22',
    borderRadius: 14,
    padding: 14,
  },
  nextStepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#1E1E22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStepText: {
    flex: 1,
    gap: 2,
  },
  nextStepLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  nextStepDesc: {
    color: '#5A5A5A',
    fontSize: 12,
  },

  ctaSignup: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: 8,
  },
  ctaSignupText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800' as const,
  },

  referralBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '08',
  },
  referralBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },

  referralBox: {
    width: '100%',
    backgroundColor: '#0D0D0F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
    padding: 16,
    gap: 12,
  },
  referralTitle: {
    color: '#7A7A7A',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  referralLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E1E22',
    paddingLeft: 12,
    overflow: 'hidden',
  },
  referralLink: {
    flex: 1,
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600' as const,
    paddingVertical: 10,
  },
  referralCopyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: '#1E1E22',
  },
  referralRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 12,
    overflow: 'hidden',
  },
  referralRewardItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 2,
  },
  referralRewardValue: {
    color: '#00C48C',
    fontSize: 18,
    fontWeight: '900' as const,
  },
  referralRewardLabel: {
    color: '#5A5A5A',
    fontSize: 10,
  },
  referralRewardDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#1E1E22',
  },

  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  exploreBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },

  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#060608',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1E',
  },
  mainCTA: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mainCTAText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  secondaryCTA: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  ownerCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  ownerCTAText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  secondaryCTAText: {
    color: '#6A6A6A',
    fontSize: 14,
  },
  secondaryCTALink: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },

  jvSection: {
    backgroundColor: '#0D0D0F',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,215,0,0.15)',
  },
  jvSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  jvIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jvLiveBadge: {
    backgroundColor: '#FFD70025',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  jvLiveBadgeText: {
    color: '#FFD700',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  jvSectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  jvSectionSubtitle: {
    color: '#7A7A7A',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  jvStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E1E22',
    overflow: 'hidden',
    marginBottom: 14,
  },
  jvStatItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
  },
  jvStatValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800' as const,
  },
  jvStatLabel: {
    color: '#5A5A5A',
    fontSize: 9,
    fontWeight: '600' as const,
  },
  jvStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1E1E22',
  },
  jvFeaturesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  jvFeatureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#14141A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#1E1E22',
  },
  jvFeatureText: {
    color: '#7A7A7A',
    fontSize: 10,
    fontWeight: '600' as const,
  },

  liveDealsSection: {
    marginTop: 24,
    gap: 14,
  },
  liveDealsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveDealsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDealsSectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800' as const,
  },
  liveDealsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,196,140,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDealsPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00C48C',
  },
  liveDealsBadgeText: {
    color: '#00C48C',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  liveDealsSectionSub: {
    color: '#5A5A5A',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  liveDealCard: {
    backgroundColor: '#0D0D0F',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E1E22',
    overflow: 'hidden',
  },
  liveDealImage: {
    width: '100%' as any,
    height: 200,
    backgroundColor: '#141416',
  },
  liveDealGalleryWrap: {
    position: 'relative' as const,
    height: 200,
    overflow: 'hidden',
  },
  liveDealGalleryScroll: {
    height: 200,
  },
  liveDealPhotoDots: {
    position: 'absolute' as const,
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  liveDealPhotoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  liveDealPhotoDotActive: {
    width: 18,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  liveDealPhotoCountBadge: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDealPhotoCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  liveDealOverlayBadge: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,196,140,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.4)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDealOverlayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00C48C',
  },
  liveDealOverlayText: {
    color: '#00C48C',
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.5,
  },
  liveDealNoPhoto: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A0C',
    gap: 6,
  },
  liveDealNoPhotoText: {
    color: '#3A3A3A',
    fontSize: 11,
  },
  adminActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  adminEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74,144,217,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(74,144,217,0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  adminEditBtnText: {
    color: '#4A90D9',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  adminDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,77,77,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  adminDeleteBtnText: {
    color: '#FF4D4D',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  liveDealPoolOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  liveDealPoolCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#14141A',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E1E22',
  },
  liveDealPoolIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDealPoolText: {
    flex: 1,
  },
  liveDealPoolTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  liveDealPoolDesc: {
    color: '#5A5A5A',
    fontSize: 10,
  },
  liveDealContent: {
    padding: 16,
    gap: 10,
  },
  liveDealTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveDealTypeBadge: {
    backgroundColor: '#FFD70015',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDealTypeText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  liveDealRoiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,196,140,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDealRoiText: {
    color: '#00C48C',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  liveDealTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800' as const,
  },
  liveDealProject: {
    color: '#8A8A8A',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: -4,
  },
  liveDealLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDealLocation: {
    color: '#5A5A5A',
    fontSize: 12,
    flex: 1,
  },
  liveDealDesc: {
    color: '#6A6A6A',
    fontSize: 12,
    lineHeight: 18,
  },
  liveDealMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A1A1E',
    overflow: 'hidden',
  },
  liveDealMetric: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
  },
  liveDealMetricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  liveDealMetricLabel: {
    color: '#5A5A5A',
    fontSize: 9,
    fontWeight: '600' as const,
  },
  liveDealMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1A1A1E',
  },
  liveDealFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  liveDealInfoChips: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  liveDealLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,196,140,0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.25)',
  },
  liveDealLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#00C48C',
  },
  liveDealLiveBadgeText: {
    color: '#00C48C',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  liveDealInfoChip: {
    backgroundColor: '#14141A',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1E1E22',
  },
  liveDealInfoChipText: {
    color: '#6A6A6A',
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  liveDealCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  liveDealCtaText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  howItWorksSection: {
    marginTop: 24,
    backgroundColor: '#0D0D0F',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E22',
  },
  howItWorksTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 16,
  },
  howItWorksSteps: {
    gap: 12,
  },
  howItWorksStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  howItWorksNum: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howItWorksNumText: {
    fontSize: 15,
    fontWeight: '900' as const,
  },
  howItWorksStepText: {
    flex: 1,
    gap: 2,
  },
  howItWorksStepLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  howItWorksStepDesc: {
    color: '#5A5A5A',
    fontSize: 12,
  },
  liveDealDualCta: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  liveDealDetailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary + '35',
    backgroundColor: Colors.primary + '08',
  },
  liveDealDetailBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  liveDealInvestBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  liveDealInvestBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },

  investNowSection: {
    backgroundColor: '#0D0D0F',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0,196,140,0.2)',
  },
  investNowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  investNowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  investNowTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800' as const,
  },
  investNowLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,196,140,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  investNowPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00C48C',
  },
  investNowLiveText: {
    color: '#00C48C',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  investNowSubtitle: {
    color: '#6A6A6A',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  investOptionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  investOptionCard: {
    flex: 1,
    backgroundColor: '#14141A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E1E22',
  },
  investOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  investOptionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  investOptionDesc: {
    color: '#5A5A5A',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  investOptionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  investOptionCtaText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  investStatsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  investStripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  investStripText: {
    color: '#5A5A5A',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  investStripDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#2A2A2E',
  },
});
