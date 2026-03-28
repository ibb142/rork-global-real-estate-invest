import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Modal,
  Animated,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Globe,
  Eye,
  EyeOff,
  Layers,
  Layout,
  Shield,
  ChevronDown,
  ChevronUp,
  Zap,
  Radio,
  Lock,
  Unlock,
  Edit3,
  Save,
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  Search,
  Sliders,
  Share2,
  Users,
  FileText,
  Image,
  MessageSquare,
  Star,
  TrendingUp,
  DollarSign,
  Briefcase,
  MapPin,
  Phone,
  Mail,
  Video,
  BarChart3,
  Target,
  Megaphone,
  Crown,
  Type,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'landing_page_controls_v2';

type TabType = 'sections' | 'modules' | 'content' | 'deploy';

interface LandingSection {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  enabled: boolean;
  order: number;
  category: 'hero' | 'content' | 'social' | 'conversion' | 'footer';
  lastModified: string;
  isLive: boolean;
}

interface AppModule {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  enabled: boolean;
  visibility: 'public' | 'members' | 'admin';
  category: 'core' | 'invest' | 'social' | 'tools' | 'admin';
  route: string;
}

interface ContentBlock {
  id: string;
  section: string;
  key: string;
  label: string;
  value: string;
  type: 'text' | 'url' | 'color' | 'number';
}

interface DeployLog {
  id: string;
  timestamp: string;
  action: string;
  status: 'success' | 'failed' | 'pending';
  changes: number;
  user: string;
}

const DEFAULT_SECTIONS: LandingSection[] = [
  { id: 'hero', name: 'Hero Banner', description: 'Main hero with headline, CTA & video', icon: Layout, enabled: true, order: 1, category: 'hero', lastModified: new Date().toISOString(), isLive: true },
  { id: 'value-prop', name: 'Value Proposition', description: 'Key benefits & investment highlights', icon: Star, enabled: true, order: 2, category: 'content', lastModified: new Date().toISOString(), isLive: true },
  { id: 'how-it-works', name: 'How It Works', description: 'Step-by-step process explanation', icon: Layers, enabled: true, order: 3, category: 'content', lastModified: new Date().toISOString(), isLive: true },
  { id: 'properties', name: 'Featured Properties', description: 'Showcase live investment properties', icon: MapPin, enabled: true, order: 4, category: 'content', lastModified: new Date().toISOString(), isLive: true },
  { id: 'roi-calculator', name: 'ROI Calculator', description: 'Interactive investment return calculator', icon: TrendingUp, enabled: true, order: 5, category: 'conversion', lastModified: new Date().toISOString(), isLive: true },
  { id: 'testimonials', name: 'Testimonials', description: 'Investor testimonials & reviews', icon: MessageSquare, enabled: true, order: 6, category: 'social', lastModified: new Date().toISOString(), isLive: true },
  { id: 'stats', name: 'Platform Stats', description: 'Live platform metrics & numbers', icon: BarChart3, enabled: true, order: 7, category: 'social', lastModified: new Date().toISOString(), isLive: true },
  { id: 'team', name: 'Team Section', description: 'Leadership & team members', icon: Users, enabled: true, order: 8, category: 'content', lastModified: new Date().toISOString(), isLive: true },
  { id: 'jv-deals', name: 'JV Deals Showcase', description: 'Joint venture deal listings', icon: Briefcase, enabled: true, order: 9, category: 'conversion', lastModified: new Date().toISOString(), isLive: true },
  { id: 'video-section', name: 'Video Presentation', description: 'Investor pitch video embed', icon: Video, enabled: true, order: 10, category: 'content', lastModified: new Date().toISOString(), isLive: true },
  { id: 'faq', name: 'FAQ Section', description: 'Frequently asked questions', icon: FileText, enabled: true, order: 11, category: 'content', lastModified: new Date().toISOString(), isLive: true },
  { id: 'newsletter', name: 'Newsletter Signup', description: 'Email capture & lead generation', icon: Mail, enabled: true, order: 12, category: 'conversion', lastModified: new Date().toISOString(), isLive: true },
  { id: 'cta-banner', name: 'CTA Banner', description: 'Final call-to-action section', icon: Megaphone, enabled: true, order: 13, category: 'conversion', lastModified: new Date().toISOString(), isLive: true },
  { id: 'social-proof', name: 'Social Proof Bar', description: 'Logos, badges, & trust signals', icon: Shield, enabled: true, order: 14, category: 'social', lastModified: new Date().toISOString(), isLive: true },
  { id: 'footer', name: 'Footer', description: 'Links, legal, contact info', icon: Globe, enabled: true, order: 15, category: 'footer', lastModified: new Date().toISOString(), isLive: true },
  { id: 'contact', name: 'Contact Form', description: 'Inquiry & contact form', icon: Phone, enabled: false, order: 16, category: 'conversion', lastModified: new Date().toISOString(), isLive: false },
  { id: 'blog-preview', name: 'Blog Preview', description: 'Latest articles & news', icon: FileText, enabled: false, order: 17, category: 'content', lastModified: new Date().toISOString(), isLive: false },
  { id: 'gallery', name: 'Image Gallery', description: 'Property & project photos', icon: Image, enabled: false, order: 18, category: 'content', lastModified: new Date().toISOString(), isLive: false },
];

const DEFAULT_MODULES: AppModule[] = [
  { id: 'home', name: 'Home Screen', description: 'Main dashboard for users', icon: Layout, enabled: true, visibility: 'public', category: 'core', route: '/' },
  { id: 'market', name: 'Marketplace', description: 'Property listings & market', icon: TrendingUp, enabled: true, visibility: 'public', category: 'core', route: '/market' },
  { id: 'portfolio', name: 'Portfolio', description: 'User investment portfolio', icon: BarChart3, enabled: true, visibility: 'members', category: 'core', route: '/portfolio' },
  { id: 'chat', name: 'Chat / Support', description: 'AI chat & customer support', icon: MessageSquare, enabled: true, visibility: 'members', category: 'social', route: '/chat' },
  { id: 'invest', name: 'Invest Tab', description: 'Investment opportunities', icon: DollarSign, enabled: true, visibility: 'public', category: 'invest', route: '/invest' },
  { id: 'jv-invest', name: 'JV Invest', description: 'Joint venture investment flow', icon: Briefcase, enabled: true, visibility: 'members', category: 'invest', route: '/jv-invest' },
  { id: 'buy-shares', name: 'Buy Shares', description: 'Token share purchase flow', icon: DollarSign, enabled: true, visibility: 'members', category: 'invest', route: '/buy-shares' },
  { id: 'debt-acquisition', name: 'Debt Acquisition', description: 'Debt investment module', icon: Target, enabled: true, visibility: 'members', category: 'invest', route: '/invest/debt-acquisition' },
  { id: 'land-partner', name: 'Land Partner', description: 'Land partnership opportunities', icon: MapPin, enabled: true, visibility: 'members', category: 'invest', route: '/invest/land-partner' },
  { id: 'wallet', name: 'Wallet', description: 'Funds & transaction wallet', icon: DollarSign, enabled: true, visibility: 'members', category: 'tools', route: '/wallet' },
  { id: 'referrals', name: 'Referrals', description: 'Referral program & earnings', icon: Share2, enabled: true, visibility: 'members', category: 'social', route: '/referrals' },
  { id: 'profile', name: 'Profile', description: 'User profile & settings', icon: Users, enabled: true, visibility: 'members', category: 'core', route: '/profile' },
  { id: 'signup', name: 'Sign Up', description: 'New user registration', icon: Users, enabled: true, visibility: 'public', category: 'core', route: '/signup' },
  { id: 'login', name: 'Login', description: 'User authentication', icon: Lock, enabled: true, visibility: 'public', category: 'core', route: '/login' },
  { id: 'kyc', name: 'KYC Verification', description: 'Identity verification flow', icon: Shield, enabled: true, visibility: 'members', category: 'tools', route: '/kyc-verification' },
  { id: 'vip-tiers', name: 'VIP Tiers', description: 'VIP membership levels', icon: Crown, enabled: true, visibility: 'public', category: 'social', route: '/vip-tiers' },
  { id: 'notifications', name: 'Notifications', description: 'Push & in-app notifications', icon: Radio, enabled: true, visibility: 'members', category: 'tools', route: '/notifications' },
  { id: 'app-guide', name: 'App Guide', description: 'Onboarding & help guide', icon: FileText, enabled: true, visibility: 'public', category: 'tools', route: '/app-guide' },
  { id: 'company-info', name: 'Company Info', description: 'About IVX Holdings', icon: Globe, enabled: true, visibility: 'public', category: 'core', route: '/company-info' },
  { id: 'trust-center', name: 'Trust Center', description: 'Security & compliance info', icon: Shield, enabled: true, visibility: 'public', category: 'core', route: '/trust-center' },
];

const DEFAULT_CONTENT: ContentBlock[] = [
  { id: 'hero-headline', section: 'hero', key: 'headline', label: 'Hero Headline', value: 'Invest in Real Estate from $100', type: 'text' },
  { id: 'hero-subline', section: 'hero', key: 'subheadline', label: 'Hero Subheadline', value: 'Fractional property investment made simple', type: 'text' },
  { id: 'hero-cta', section: 'hero', key: 'cta_text', label: 'CTA Button Text', value: 'Get Started', type: 'text' },
  { id: 'hero-cta-url', section: 'hero', key: 'cta_url', label: 'CTA Button Link', value: '/signup', type: 'url' },
  { id: 'stats-investors', section: 'stats', key: 'investor_count', label: 'Investor Count', value: '2,500+', type: 'text' },
  { id: 'stats-properties', section: 'stats', key: 'property_count', label: 'Properties Listed', value: '45+', type: 'text' },
  { id: 'stats-invested', section: 'stats', key: 'total_invested', label: 'Total Invested', value: '$12M+', type: 'text' },
  { id: 'stats-returns', section: 'stats', key: 'avg_returns', label: 'Average Returns', value: '14.2%', type: 'text' },
  { id: 'footer-company', section: 'footer', key: 'company_name', label: 'Company Name', value: 'IVX Holdings', type: 'text' },
  { id: 'footer-email', section: 'footer', key: 'contact_email', label: 'Contact Email', value: 'info@ivxholding.com', type: 'text' },
  { id: 'footer-phone', section: 'footer', key: 'contact_phone', label: 'Contact Phone', value: '+1 (888) IVX-HOLD', type: 'text' },
  { id: 'brand-primary', section: 'branding', key: 'primary_color', label: 'Primary Color', value: '#FFD700', type: 'color' },
  { id: 'brand-accent', section: 'branding', key: 'accent_color', label: 'Accent Color', value: '#00C48C', type: 'color' },
];

const SECTION_CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  hero: { label: 'HERO', color: '#FFD700' },
  content: { label: 'CONTENT', color: '#4A90D9' },
  social: { label: 'SOCIAL', color: '#7B68EE' },
  conversion: { label: 'CONVERSION', color: '#00C48C' },
  footer: { label: 'FOOTER', color: '#9A9A9A' },
};

const MODULE_CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  core: { label: 'CORE', color: '#FFD700' },
  invest: { label: 'INVEST', color: '#00C48C' },
  social: { label: 'SOCIAL', color: '#7B68EE' },
  tools: { label: 'TOOLS', color: '#4A90D9' },
  admin: { label: 'ADMIN', color: '#FF6B6B' },
};

const VISIBILITY_MAP: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  public: { label: 'Public', color: '#00C48C', icon: Globe },
  members: { label: 'Members', color: '#4A90D9', icon: Users },
  admin: { label: 'Admin', color: '#FF6B6B', icon: Shield },
};

function PulseDot({ active, color }: { active: boolean; color: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.8, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [active, pulse]);

  return (
    <View style={styles.pulseWrap}>
      {active && (
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulse }], borderColor: color + '40' }]} />
      )}
      <View style={[styles.pulseDot, { backgroundColor: active ? color : '#555' }]} />
    </View>
  );
}

export default function LandingControlScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('sections');
  const [sections, setSections] = useState<LandingSection[]>(DEFAULT_SECTIONS);
  const [modules, setModules] = useState<AppModule[]>(DEFAULT_MODULES);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>(DEFAULT_CONTENT);
  const [editingContent, setEditingContent] = useState<ContentBlock | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [landingEnabled, setLandingEnabled] = useState(true);

  const [deployLogs, setDeployLogs] = useState<DeployLog[]>([
    { id: '1', timestamp: new Date(Date.now() - 3600000).toISOString(), action: 'Sections updated', status: 'success', changes: 3, user: 'Owner' },
    { id: '2', timestamp: new Date(Date.now() - 7200000).toISOString(), action: 'Full deploy', status: 'success', changes: 12, user: 'Owner' },
    { id: '3', timestamp: new Date(Date.now() - 86400000).toISOString(), action: 'Content update', status: 'success', changes: 5, user: 'Owner' },
  ]);

  const headerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 10, useNativeDriver: true }).start();
  }, [headerAnim]);

  const savedStateQuery = useQuery({
    queryKey: ['landing-control-state'],
    queryFn: async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log('[LandingControl] Loaded saved state');
          if (parsed.sections) setSections(parsed.sections);
          if (parsed.modules) setModules(parsed.modules);
          if (parsed.contentBlocks) setContentBlocks(parsed.contentBlocks);
          if (typeof parsed.landingEnabled === 'boolean') setLandingEnabled(parsed.landingEnabled);
          if (typeof parsed.maintenanceMode === 'boolean') setMaintenanceMode(parsed.maintenanceMode);
          return parsed;
        }
      } catch (err) {
        console.log('[LandingControl] Load state error:', err);
      }
      return null;
    },
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = { sections, modules, contentBlocks, landingEnabled, maintenanceMode, savedAt: new Date().toISOString() };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      try {
        await supabase.from('landing_page_config').upsert({
          id: 'main',
          sections: JSON.stringify(sections),
          modules: JSON.stringify(modules),
          content: JSON.stringify(contentBlocks),
          landing_enabled: landingEnabled,
          maintenance_mode: maintenanceMode,
          updated_at: new Date().toISOString(),
        });
        console.log('[LandingControl] Synced to Supabase');
      } catch (err) {
        console.log('[LandingControl] Supabase sync skipped:', err);
      }

      return state;
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      setIsDeploying(true);
      await saveMutation.mutateAsync();
      await new Promise(resolve => setTimeout(resolve, 1500));

      const newLog: DeployLog = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        action: 'Full deploy',
        status: 'success',
        changes: sections.filter(s => s.enabled).length + modules.filter(m => m.enabled).length,
        user: 'Owner',
      };
      setDeployLogs(prev => [newLog, ...prev]);
      setIsDeploying(false);
      return newLog;
    },
    onSuccess: () => {
      Alert.alert('Deployed', 'Landing page configuration deployed successfully.');
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    },
    onError: () => {
      setIsDeploying(false);
      Alert.alert('Error', 'Deployment failed. Please try again.');
    },
  });

  const toggleSection = useCallback((id: string) => {
    setSections(prev => prev.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled, isLive: !s.enabled, lastModified: new Date().toISOString() } : s
    ));
    setHasUnsavedChanges(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const toggleModule = useCallback((id: string) => {
    setModules(prev => prev.map(m =>
      m.id === id ? { ...m, enabled: !m.enabled } : m
    ));
    setHasUnsavedChanges(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const cycleVisibility = useCallback((id: string) => {
    const order: AppModule['visibility'][] = ['public', 'members', 'admin'];
    setModules(prev => prev.map(m => {
      if (m.id !== id) return m;
      const idx = order.indexOf(m.visibility);
      const next = order[(idx + 1) % order.length] as AppModule['visibility'];
      return { ...m, visibility: next };
    }));
    setHasUnsavedChanges(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const toggleAllSections = useCallback((enabled: boolean) => {
    Alert.alert(
      enabled ? 'Enable All Sections' : 'Disable All Sections',
      `Are you sure you want to ${enabled ? 'enable' : 'disable'} all landing page sections?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setSections(prev => prev.map(s => ({ ...s, enabled, isLive: enabled, lastModified: new Date().toISOString() })));
            setHasUnsavedChanges(true);
          },
        },
      ]
    );
  }, []);

  const toggleAllModules = useCallback((enabled: boolean) => {
    Alert.alert(
      enabled ? 'Enable All Modules' : 'Disable All Modules',
      `Are you sure you want to ${enabled ? 'enable' : 'disable'} all app modules?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setModules(prev => prev.map(m => ({ ...m, enabled })));
            setHasUnsavedChanges(true);
          },
        },
      ]
    );
  }, []);

  const openEditContent = useCallback((block: ContentBlock) => {
    setEditingContent(block);
    setEditValue(block.value);
  }, []);

  const saveContentEdit = useCallback(() => {
    if (!editingContent) return;
    setContentBlocks(prev => prev.map(b =>
      b.id === editingContent.id ? { ...b, value: editValue } : b
    ));
    setEditingContent(null);
    setHasUnsavedChanges(true);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [editingContent, editValue]);

  const enabledSections = useMemo(() => sections.filter(s => s.enabled).length, [sections]);
  const enabledModules = useMemo(() => modules.filter(m => m.enabled).length, [modules]);
  const publicModules = useMemo(() => modules.filter(m => m.enabled && m.visibility === 'public').length, [modules]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [sections, searchQuery]);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return modules;
    const q = searchQuery.toLowerCase();
    return modules.filter(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [modules, searchQuery]);

  const groupedSections = useMemo(() => {
    const groups: Record<string, LandingSection[]> = {};
    filteredSections.forEach(s => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category]!.push(s);
    });
    return groups;
  }, [filteredSections]);

  const groupedModules = useMemo(() => {
    const groups: Record<string, AppModule[]> = {};
    filteredModules.forEach(m => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category]!.push(m);
    });
    return groups;
  }, [filteredModules]);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }, []);

  const renderMasterControls = () => (
    <View style={styles.masterCard}>
      <View style={styles.masterRow}>
        <View style={styles.masterLeft}>
          <PulseDot active={landingEnabled && !maintenanceMode} color="#00C48C" />
          <View>
            <Text style={styles.masterTitle}>Landing Page</Text>
            <Text style={styles.masterSub}>
              {landingEnabled ? (maintenanceMode ? 'Maintenance Mode' : 'LIVE') : 'OFFLINE'}
            </Text>
          </View>
        </View>
        <Switch
          value={landingEnabled}
          onValueChange={(val) => {
            if (!val) {
              Alert.alert('Take Landing Offline?', 'This will hide your landing page from all visitors.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Go Offline', style: 'destructive', onPress: () => { setLandingEnabled(false); setHasUnsavedChanges(true); } },
              ]);
            } else {
              setLandingEnabled(true);
              setHasUnsavedChanges(true);
            }
          }}
          trackColor={{ false: '#333', true: '#00C48C60' }}
          thumbColor={landingEnabled ? '#00C48C' : '#666'}
        />
      </View>

      <View style={styles.masterDivider} />

      <View style={styles.masterRow}>
        <View style={styles.masterLeft}>
          <AlertTriangle size={16} color={maintenanceMode ? '#FFB800' : '#555'} />
          <View>
            <Text style={styles.masterLabel}>Maintenance Mode</Text>
            <Text style={styles.masterDesc}>Show "coming soon" to visitors</Text>
          </View>
        </View>
        <Switch
          value={maintenanceMode}
          onValueChange={(val) => {
            setMaintenanceMode(val);
            setHasUnsavedChanges(true);
          }}
          trackColor={{ false: '#333', true: '#FFB80060' }}
          thumbColor={maintenanceMode ? '#FFB800' : '#666'}
        />
      </View>

      <View style={styles.masterStats}>
        <View style={styles.masterStat}>
          <Text style={styles.masterStatValue}>{enabledSections}</Text>
          <Text style={styles.masterStatLabel}>Sections</Text>
        </View>
        <View style={styles.masterStatDivider} />
        <View style={styles.masterStat}>
          <Text style={styles.masterStatValue}>{enabledModules}</Text>
          <Text style={styles.masterStatLabel}>Modules</Text>
        </View>
        <View style={styles.masterStatDivider} />
        <View style={styles.masterStat}>
          <Text style={[styles.masterStatValue, { color: '#00C48C' }]}>{publicModules}</Text>
          <Text style={styles.masterStatLabel}>Public</Text>
        </View>
      </View>
    </View>
  );

  const renderSectionsTab = () => (
    <>
      <View style={styles.bulkRow}>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => toggleAllSections(true)}>
          <Eye size={14} color="#00C48C" />
          <Text style={[styles.bulkBtnText, { color: '#00C48C' }]}>Enable All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => toggleAllSections(false)}>
          <EyeOff size={14} color="#FF6B6B" />
          <Text style={[styles.bulkBtnText, { color: '#FF6B6B' }]}>Disable All</Text>
        </TouchableOpacity>
      </View>

      {Object.entries(groupedSections).map(([category, items]) => {
        const catInfo = SECTION_CATEGORY_MAP[category] ?? { label: category.toUpperCase(), color: '#9A9A9A' };
        const isExpanded = expandedCategory === `sec-${category}` || expandedCategory === null;
        const enabledInCat = items.filter(s => s.enabled).length;

        return (
          <View key={category} style={styles.categoryBlock}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => setExpandedCategory(prev => prev === `sec-${category}` ? null : `sec-${category}`)}
            >
              <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
              <Text style={[styles.categoryLabel, { color: catInfo.color }]}>{catInfo.label}</Text>
              <View style={styles.categoryCountBadge}>
                <Text style={styles.categoryCountText}>{enabledInCat}/{items.length}</Text>
              </View>
              <View style={{ flex: 1 }} />
              {isExpanded ? <ChevronUp size={16} color="#666" /> : <ChevronDown size={16} color="#666" />}
            </TouchableOpacity>

            {isExpanded && items.map((section) => {
              const Icon = section.icon;
              return (
                <View key={section.id} style={[styles.itemCard, !section.enabled && styles.itemCardDisabled]}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.itemIcon, { backgroundColor: (section.enabled ? catInfo.color : '#333') + '18' }]}>
                      <Icon size={18} color={section.enabled ? catInfo.color : '#555'} />
                    </View>
                    <View style={styles.itemInfo}>
                      <View style={styles.itemNameRow}>
                        <Text style={[styles.itemName, !section.enabled && styles.itemNameDisabled]}>{section.name}</Text>
                        {section.isLive && section.enabled && (
                          <View style={styles.liveBadge}>
                            <View style={styles.liveBadgeDot} />
                            <Text style={styles.liveBadgeText}>LIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.itemDesc} numberOfLines={1}>{section.description}</Text>
                    </View>
                  </View>
                  <Switch
                    value={section.enabled}
                    onValueChange={() => toggleSection(section.id)}
                    trackColor={{ false: '#222', true: catInfo.color + '50' }}
                    thumbColor={section.enabled ? catInfo.color : '#555'}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );

  const renderModulesTab = () => (
    <>
      <View style={styles.bulkRow}>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => toggleAllModules(true)}>
          <Unlock size={14} color="#00C48C" />
          <Text style={[styles.bulkBtnText, { color: '#00C48C' }]}>Enable All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => toggleAllModules(false)}>
          <Lock size={14} color="#FF6B6B" />
          <Text style={[styles.bulkBtnText, { color: '#FF6B6B' }]}>Disable All</Text>
        </TouchableOpacity>
      </View>

      {Object.entries(groupedModules).map(([category, items]) => {
        const catInfo = MODULE_CATEGORY_MAP[category] ?? { label: category.toUpperCase(), color: '#9A9A9A' };
        const isExpanded = expandedCategory === `mod-${category}` || expandedCategory === null;
        const enabledInCat = items.filter(m => m.enabled).length;

        return (
          <View key={category} style={styles.categoryBlock}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => setExpandedCategory(prev => prev === `mod-${category}` ? null : `mod-${category}`)}
            >
              <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
              <Text style={[styles.categoryLabel, { color: catInfo.color }]}>{catInfo.label}</Text>
              <View style={styles.categoryCountBadge}>
                <Text style={styles.categoryCountText}>{enabledInCat}/{items.length}</Text>
              </View>
              <View style={{ flex: 1 }} />
              {isExpanded ? <ChevronUp size={16} color="#666" /> : <ChevronDown size={16} color="#666" />}
            </TouchableOpacity>

            {isExpanded && items.map((mod) => {
              const Icon = mod.icon;
              const visInfo = VISIBILITY_MAP[mod.visibility] ?? VISIBILITY_MAP.public!;
              const VisIcon = visInfo.icon;

              return (
                <View key={mod.id} style={[styles.itemCard, !mod.enabled && styles.itemCardDisabled]}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.itemIcon, { backgroundColor: (mod.enabled ? catInfo.color : '#333') + '18' }]}>
                      <Icon size={18} color={mod.enabled ? catInfo.color : '#555'} />
                    </View>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, !mod.enabled && styles.itemNameDisabled]}>{mod.name}</Text>
                      <View style={styles.moduleMetaRow}>
                        <TouchableOpacity
                          style={[styles.visBadge, { backgroundColor: visInfo.color + '15' }]}
                          onPress={() => cycleVisibility(mod.id)}
                          activeOpacity={0.6}
                        >
                          <VisIcon size={10} color={visInfo.color} />
                          <Text style={[styles.visBadgeText, { color: visInfo.color }]}>{visInfo.label}</Text>
                        </TouchableOpacity>
                        <Text style={styles.moduleRoute}>{mod.route}</Text>
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={mod.enabled}
                    onValueChange={() => toggleModule(mod.id)}
                    trackColor={{ false: '#222', true: catInfo.color + '50' }}
                    thumbColor={mod.enabled ? catInfo.color : '#555'}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );

  const renderContentTab = () => {
    const grouped: Record<string, ContentBlock[]> = {};
    contentBlocks.forEach(b => {
      if (!grouped[b.section]) grouped[b.section] = [];
      grouped[b.section]!.push(b);
    });

    return (
      <>
        <View style={styles.contentInfo}>
          <Type size={16} color="#FFD700" />
          <Text style={styles.contentInfoText}>Tap any field to edit landing page content in real time</Text>
        </View>

        {Object.entries(grouped).map(([section, blocks]) => (
          <View key={section} style={styles.contentSection}>
            <Text style={styles.contentSectionTitle}>{section.charAt(0).toUpperCase() + section.slice(1)}</Text>
            {blocks.map(block => (
              <TouchableOpacity
                key={block.id}
                style={styles.contentRow}
                onPress={() => openEditContent(block)}
                activeOpacity={0.7}
              >
                <View style={styles.contentLeft}>
                  <Text style={styles.contentLabel}>{block.label}</Text>
                  <Text style={styles.contentValue} numberOfLines={1}>
                    {block.type === 'color' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: block.value }} />
                        <Text style={styles.contentValue}>{block.value}</Text>
                      </View>
                    ) : block.value}
                  </Text>
                </View>
                <Edit3 size={14} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </>
    );
  };

  const renderDeployTab = () => (
    <>
      <TouchableOpacity
        style={[styles.deployBtn, isDeploying && styles.deployBtnDisabled]}
        onPress={() => {
          Alert.alert('Deploy Changes', 'Push all changes to the live landing page?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Deploy Now', onPress: () => deployMutation.mutate() },
          ]);
        }}
        disabled={isDeploying}
        activeOpacity={0.7}
      >
        {isDeploying ? (
          <RefreshCw size={20} color="#062218" />
        ) : (
          <Zap size={20} color="#062218" />
        )}
        <Text style={styles.deployBtnText}>
          {isDeploying ? 'Deploying...' : 'Deploy to Live'}
        </Text>
        {hasUnsavedChanges && !isDeploying && (
          <View style={styles.deployChangeBadge}>
            <Text style={styles.deployChangeBadgeText}>CHANGES</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        activeOpacity={0.7}
      >
        <Save size={16} color="#FFD700" />
        <Text style={styles.saveBtnText}>
          {saveMutation.isPending ? 'Saving...' : 'Save Draft'}
        </Text>
      </TouchableOpacity>

      <View style={styles.deploySummary}>
        <Text style={styles.deploySummaryTitle}>Current Configuration</Text>
        <View style={styles.deploySummaryRow}>
          <Text style={styles.deploySummaryLabel}>Landing Status</Text>
          <View style={[styles.deploySummaryBadge, { backgroundColor: landingEnabled ? '#00C48C18' : '#FF6B6B18' }]}>
            <Text style={[styles.deploySummaryBadgeText, { color: landingEnabled ? '#00C48C' : '#FF6B6B' }]}>
              {landingEnabled ? 'LIVE' : 'OFFLINE'}
            </Text>
          </View>
        </View>
        <View style={styles.deploySummaryRow}>
          <Text style={styles.deploySummaryLabel}>Maintenance Mode</Text>
          <View style={[styles.deploySummaryBadge, { backgroundColor: maintenanceMode ? '#FFB80018' : '#33333380' }]}>
            <Text style={[styles.deploySummaryBadgeText, { color: maintenanceMode ? '#FFB800' : '#666' }]}>
              {maintenanceMode ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>
        <View style={styles.deploySummaryRow}>
          <Text style={styles.deploySummaryLabel}>Active Sections</Text>
          <Text style={styles.deploySummaryValue}>{enabledSections} / {sections.length}</Text>
        </View>
        <View style={styles.deploySummaryRow}>
          <Text style={styles.deploySummaryLabel}>Active Modules</Text>
          <Text style={styles.deploySummaryValue}>{enabledModules} / {modules.length}</Text>
        </View>
        <View style={styles.deploySummaryRow}>
          <Text style={styles.deploySummaryLabel}>Public Modules</Text>
          <Text style={styles.deploySummaryValue}>{publicModules}</Text>
        </View>
        <View style={styles.deploySummaryRow}>
          <Text style={styles.deploySummaryLabel}>Content Fields</Text>
          <Text style={styles.deploySummaryValue}>{contentBlocks.length}</Text>
        </View>
      </View>

      <View style={styles.deployLogSection}>
        <Text style={styles.deployLogTitle}>Deploy History</Text>
        {deployLogs.map(log => (
          <View key={log.id} style={styles.deployLogRow}>
            <View style={[styles.deployLogDot, { backgroundColor: log.status === 'success' ? '#00C48C' : log.status === 'failed' ? '#FF6B6B' : '#FFB800' }]} />
            <View style={styles.deployLogInfo}>
              <Text style={styles.deployLogAction}>{log.action}</Text>
              <Text style={styles.deployLogMeta}>{formatDate(log.timestamp)} · {log.changes} changes · {log.user}</Text>
            </View>
            <View style={[styles.deployLogStatus, { backgroundColor: (log.status === 'success' ? '#00C48C' : '#FF6B6B') + '15' }]}>
              <Text style={[styles.deployLogStatusText, { color: log.status === 'success' ? '#00C48C' : '#FF6B6B' }]}>
                {log.status.toUpperCase()}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );

  const TABS: { key: TabType; label: string; icon: React.ComponentType<any> }[] = [
    { key: 'sections', label: 'Sections', icon: Layers },
    { key: 'modules', label: 'Modules', icon: Layout },
    { key: 'content', label: 'Content', icon: Type },
    { key: 'deploy', label: 'Deploy', icon: Zap },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Sliders size={20} color="#FFD700" />
            <Text style={styles.headerTitle}>Landing Control</Text>
          </View>
          <Text style={styles.headerSub}>Full control · {enabledSections} sections · {enabledModules} modules</Text>
        </View>
        {hasUnsavedChanges && (
          <TouchableOpacity style={styles.headerSaveBtn} onPress={() => saveMutation.mutate()}>
            <Save size={16} color="#FFD700" />
          </TouchableOpacity>
        )}
      </Animated.View>

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Search size={16} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search sections & modules..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key); setExpandedCategory(null); }}
            >
              <Icon size={15} color={isActive ? '#FFD700' : '#666'} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={savedStateQuery.isRefetching}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['landing-control-state'] })}
            tintColor="#FFD700"
          />
        }
      >
        {renderMasterControls()}

        {activeTab === 'sections' && renderSectionsTab()}
        {activeTab === 'modules' && renderModulesTab()}
        {activeTab === 'content' && renderContentTab()}
        {activeTab === 'deploy' && renderDeployTab()}

        <View style={{ height: 100 }} />
      </ScrollView>

      {hasUnsavedChanges && (
        <View style={styles.unsavedBar}>
          <View style={styles.unsavedBarDot} />
          <Text style={styles.unsavedBarText}>Unsaved changes</Text>
          <TouchableOpacity style={styles.unsavedBarBtn} onPress={() => saveMutation.mutate()}>
            <Text style={styles.unsavedBarBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.unsavedDeployBtn} onPress={() => deployMutation.mutate()}>
            <Zap size={12} color="#062218" />
            <Text style={styles.unsavedDeployBtnText}>Deploy</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={!!editingContent}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingContent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingContent?.label ?? 'Edit'}</Text>
              <TouchableOpacity onPress={() => setEditingContent(null)}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Section: {editingContent?.section}</Text>
            <TextInput
              style={[styles.modalInput, editingContent?.type === 'text' && styles.modalInputMultiline]}
              value={editValue}
              onChangeText={setEditValue}
              placeholder="Enter value..."
              placeholderTextColor={Colors.textTertiary}
              multiline={editingContent?.type === 'text'}
              autoFocus
            />
            {editingContent?.type === 'color' && (
              <View style={styles.colorPreview}>
                <View style={[styles.colorSwatch, { backgroundColor: editValue }]} />
                <Text style={styles.colorPreviewText}>{editValue}</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingContent(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveContentEdit}>
                <Check size={16} color="#062218" />
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  headerSaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFD70015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 6,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  tabActive: {
    backgroundColor: '#FFD70012',
    borderColor: '#FFD70040',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#666',
  },
  tabTextActive: {
    color: '#FFD700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  masterCard: {
    backgroundColor: '#0E1A14',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#00C48C30',
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  masterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  masterTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  masterSub: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#00C48C',
    letterSpacing: 0.5,
  },
  masterDivider: {
    height: 1,
    backgroundColor: '#1A2E22',
    marginVertical: 12,
  },
  masterLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  masterDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  masterStats: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1A2E22',
  },
  masterStat: {
    flex: 1,
    alignItems: 'center',
  },
  masterStatValue: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  masterStatLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  masterStatDivider: {
    width: 1,
    backgroundColor: '#1A2E22',
  },
  bulkRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bulkBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  categoryBlock: {
    marginBottom: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
  },
  categoryCountBadge: {
    backgroundColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryCountText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemCardDisabled: {
    opacity: 0.5,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  itemNameDisabled: {
    color: Colors.textTertiary,
  },
  itemDesc: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00C48C15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#00C48C',
  },
  liveBadgeText: {
    fontSize: 8,
    fontWeight: '800' as const,
    color: '#00C48C',
    letterSpacing: 0.5,
  },
  moduleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  visBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  visBadgeText: {
    fontSize: 9,
    fontWeight: '700' as const,
  },
  moduleRoute: {
    fontSize: 10,
    color: '#444',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  contentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFD70010',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FFD70020',
  },
  contentInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '600' as const,
  },
  contentSection: {
    marginBottom: 16,
  },
  contentSectionTitle: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contentLeft: {
    flex: 1,
    marginRight: 12,
  },
  contentLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    marginBottom: 3,
  },
  contentValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  deployBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#00C48C',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 10,
  },
  deployBtnDisabled: {
    opacity: 0.6,
  },
  deployBtnText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#062218',
  },
  deployChangeBadge: {
    backgroundColor: '#062218',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deployChangeBadgeText: {
    fontSize: 9,
    fontWeight: '800' as const,
    color: '#00C48C',
    letterSpacing: 0.5,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFD70012',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD70030',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#FFD700',
  },
  deploySummary: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deploySummaryTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 14,
  },
  deploySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  deploySummaryLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  deploySummaryValue: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  deploySummaryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deploySummaryBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  deployLogSection: {
    marginBottom: 16,
  },
  deployLogTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  deployLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  deployLogDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deployLogInfo: {
    flex: 1,
  },
  deployLogAction: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deployLogMeta: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  deployLogStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deployLogStatusText: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  unsavedBar: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFD70030',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  unsavedBarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFB800',
  },
  unsavedBarText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  unsavedBarBtn: {
    backgroundColor: '#FFD70015',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  unsavedBarBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#FFD700',
  },
  unsavedDeployBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00C48C',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  unsavedDeployBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#062218',
  },
  pulseWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  modalInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  colorPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorPreviewText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FFD700',
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#062218',
  },
});
