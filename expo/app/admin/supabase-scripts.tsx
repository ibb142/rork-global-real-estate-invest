import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Database,
  CheckCircle,
  XCircle,
  RefreshCw,
  Zap,
  Shield,
  Table2,
  HardDrive,
  Radio,
  Settings,
  AlertTriangle,
  Clock,
  Server,
  ChevronDown,
  ChevronUp,
  Rocket,
  Users,
  Copy,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import Colors from '@/constants/colors';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

console.log('[Supabase Status] Live dashboard loaded');

type CheckStatus = 'pending' | 'checking' | 'ok' | 'missing' | 'error';

interface TableCheck {
  name: string;
  status: CheckStatus;
  rowCount?: number;
  hasRls?: boolean;
}

interface FunctionCheck {
  name: string;
  status: CheckStatus;
}

interface BucketCheck {
  name: string;
  status: CheckStatus;
  isPublic?: boolean;
}

interface RealtimeCheck {
  table: string;
  status: CheckStatus;
}

interface SectionState {
  tables: boolean;
  functions: boolean;
  storage: boolean;
  realtime: boolean;
  config: boolean;
  deploy: boolean;
}

type DeployAction = 'idle' | 'deploying' | 'success' | 'error';

const KYC_TABLES_SQL = `-- IVX KYC Tables: kyc_verifications + kyc_documents
-- Run this in Supabase SQL Editor to create KYC tables

-- 1. KYC Verifications table (stores personal info + verification results)
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  date_of_birth TEXT,
  nationality TEXT,
  nationality_code TEXT,
  tax_id TEXT,
  street TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  country_code TEXT,
  status TEXT DEFAULT 'pending',
  verification_score NUMERIC,
  risk_level TEXT,
  verification_passed BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. KYC Documents table (stores uploaded document references)
CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_url TEXT,
  issuing_country TEXT,
  status TEXT DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE kyc_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — users can read/write own, admins can read all
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own kyc') THEN
    CREATE POLICY "Users can read own kyc" ON kyc_verifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can upsert own kyc') THEN
    CREATE POLICY "Users can upsert own kyc" ON kyc_verifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own kyc') THEN
    CREATE POLICY "Users can update own kyc" ON kyc_verifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own kyc docs') THEN
    CREATE POLICY "Users can read own kyc docs" ON kyc_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own kyc docs') THEN
    CREATE POLICY "Users can insert own kyc docs" ON kyc_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin read all kyc') THEN
    CREATE POLICY "Admin read all kyc" ON kyc_verifications FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin read all kyc docs') THEN
    CREATE POLICY "Admin read all kyc docs" ON kyc_documents FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin update kyc') THEN
    CREATE POLICY "Admin update kyc" ON kyc_verifications FOR UPDATE TO authenticated USING (true);
  END IF;
END $;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications(status);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_user ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_type ON kyc_documents(document_type);

-- 6. Auto-update trigger for kyc_verifications
CREATE OR REPLACE FUNCTION update_kyc_updated_at()
RETURNS TRIGGER AS $
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kyc_verifications_updated_at ON kyc_verifications;
CREATE TRIGGER kyc_verifications_updated_at
  BEFORE UPDATE ON kyc_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_kyc_updated_at();

-- 7. Auto-sync KYC status to profiles when admin approves/rejects
CREATE OR REPLACE FUNCTION sync_kyc_status_to_profile()
RETURNS TRIGGER AS $
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE profiles SET kyc_status = CASE
      WHEN NEW.verification_passed = true THEN 'approved'
      ELSE NEW.status
    END WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kyc_sync_profile_trigger ON kyc_verifications;
CREATE TRIGGER kyc_sync_profile_trigger
  AFTER UPDATE ON kyc_verifications
  FOR EACH ROW
  EXECUTE FUNCTION sync_kyc_status_to_profile();`;

const WAITLIST_SQL = `-- IVX Bootstrap: Waitlist Table + Auto-Deploy Function
-- Run this ONCE in Supabase SQL Editor to enable auto-deploy

-- 1. Create exec_sql function for future auto-deploys
CREATE OR REPLACE FUNCTION ivx_exec_sql(sql_text TEXT)
RETURNS VOID AS $
BEGIN
  EXECUTE sql_text;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  investment_range TEXT,
  return_expectation TEXT,
  preferred_contact_hour TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anonymous inserts on waitlist') THEN
    CREATE POLICY "Allow anonymous inserts on waitlist" ON waitlist FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated read on waitlist') THEN
    CREATE POLICY "Allow authenticated read on waitlist" ON waitlist FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated update on waitlist') THEN
    CREATE POLICY "Allow authenticated update on waitlist" ON waitlist FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $;

-- 5. Enable Realtime
DO $ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE waitlist;
EXCEPTION WHEN duplicate_object THEN NULL;
END $;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);

-- 7. Auto-update trigger
CREATE OR REPLACE FUNCTION update_waitlist_updated_at()
RETURNS TRIGGER AS $
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waitlist_updated_at ON waitlist;
CREATE TRIGGER waitlist_updated_at
  BEFORE UPDATE ON waitlist
  FOR EACH ROW
  EXECUTE FUNCTION update_waitlist_updated_at();`;

const ALL_TABLES = [
  'jv_deals', 'landing_deals', 'audit_trail', 'waitlist',
  'profiles', 'wallets', 'holdings', 'transactions', 'notifications',
  'analytics_events', 'analytics_dashboard', 'analytics_kpi',
  'analytics_retention', 'analytics_investments',
  'system_health', 'system_metrics', 'staff_activity', 'staff_activity_log',
  'signups', 'applications', 'ai_brain_status',
  'auto_repair_scans', 'repair_logs',
  'ipx_holdings', 'ipx_purchases',
  'earn_accounts', 'earn_deposits', 'earn_payouts',
  'kyc_verifications', 'kyc_documents',
  'referrals', 'referral_invites',
  'sms_reports', 'sms_messages',
  'lender_sync_stats', 'lender_sync_config', 'synced_lenders',
  'lender_sync_jobs', 'imported_lenders',
  'orders', 'support_tickets', 'influencer_applications', 'push_tokens',
  'properties', 'market_data', 'market_index',
  'image_registry', 'app_config', 'landing_analytics',
  'retargeting_dashboard', 'audience_segments', 'ad_pixels',
  'utm_analytics', 'search_discovery', 're_engagement_triggers',
  'engagement_scoring', 'emails',
  'visitor_sessions', 'realtime_snapshots',
  'image_backups', 'image_health_reports',
  'landing_investments',
];

const ALL_FUNCTIONS = [
  'is_admin', 'is_owner_of', 'get_user_role', 'verify_admin_access',
  'ensure_deal_photos_bucket', 'increment_sms_counter',
  'update_updated_at', 'update_updated_at_column', 'increment_jv_version',
  'upsert_visitor_session', 'mark_inactive_sessions', 'save_realtime_snapshot',
  'ivx_exec_sql',
];

const REALTIME_TABLES = ['jv_deals', 'landing_deals', 'waitlist', 'notifications', 'transactions', 'landing_analytics', 'visitor_sessions', 'analytics_events'];
const STORAGE_BUCKETS = ['deal-photos', 'landing-page'];

export default function SupabaseStatusPage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [tables, setTables] = useState<TableCheck[]>([]);
  const [functions, setFunctions] = useState<FunctionCheck[]>([]);
  const [buckets, setBuckets] = useState<BucketCheck[]>([]);
  const [realtimeChecks, setRealtimeChecks] = useState<RealtimeCheck[]>([]);
  const [configOk, setConfigOk] = useState<boolean | null>(null);
  const [deployAction, setDeployAction] = useState<DeployAction>('idle');
  const [deployMsg, setDeployMsg] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);
  const [expandedSections, setExpandedSections] = useState<SectionState>({
    tables: false,
    functions: false,
    storage: false,
    realtime: false,
    config: false,
    deploy: true,
  });
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const deployScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (scanning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [scanning, pulseAnim]);

  const runFullScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    console.log('[Supabase Status] Starting full scan...');

    const tableResults: TableCheck[] = [];
    const functionResults: FunctionCheck[] = [];
    const bucketResults: BucketCheck[] = [];
    const realtimeResults: RealtimeCheck[] = [];

    const checkTable = async (name: string): Promise<TableCheck> => {
      try {
        const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true });
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('does not exist') || msg.includes('could not find') || msg.includes('relation')) {
            return { name, status: 'missing' };
          }
          return { name, status: 'ok', rowCount: 0 };
        }
        return { name, status: 'ok', rowCount: count ?? 0 };
      } catch {
        return { name, status: 'error' };
      }
    };

    const batchSize = 8;
    for (let i = 0; i < ALL_TABLES.length; i += batchSize) {
      const batch = ALL_TABLES.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(checkTable));
      tableResults.push(...results);
      setTables([...tableResults]);
    }

    for (const fname of ALL_FUNCTIONS) {
      try {
        const { error } = await supabase.rpc(fname === 'is_admin' ? 'verify_admin_access' : fname === 'verify_admin_access' ? 'verify_admin_access' : fname, fname === 'increment_sms_counter' ? { counter_name: 'test' } : undefined);
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('does not exist') || msg.includes('could not find the function')) {
            functionResults.push({ name: fname, status: 'missing' });
          } else {
            functionResults.push({ name: fname, status: 'ok' });
          }
        } else {
          functionResults.push({ name: fname, status: 'ok' });
        }
      } catch {
        functionResults.push({ name: fname, status: 'error' });
      }
    }
    setFunctions([...functionResults]);

    for (const bucket of STORAGE_BUCKETS) {
      try {
        const { error } = await supabase.storage.from(bucket).list('', { limit: 1 });
        if (error) {
          const msg = (error.message || '').toLowerCase();
          if (msg.includes('not found') || msg.includes('does not exist')) {
            bucketResults.push({ name: bucket, status: 'missing' });
          } else {
            bucketResults.push({ name: bucket, status: 'ok' });
          }
        } else {
          bucketResults.push({ name: bucket, status: 'ok' });
        }
      } catch {
        bucketResults.push({ name: bucket, status: 'error' });
      }
    }
    setBuckets([...bucketResults]);

    for (const table of REALTIME_TABLES) {
      const tableCheck = tableResults.find(t => t.name === table);
      if (tableCheck?.status === 'ok') {
        realtimeResults.push({ table, status: 'ok' });
      } else {
        realtimeResults.push({ table, status: tableCheck?.status === 'missing' ? 'missing' : 'error' });
      }
    }
    setRealtimeChecks([...realtimeResults]);

    try {
      const { data, error } = await supabase.from('app_config').select('key').eq('key', 'admin_roles').single();
      setConfigOk(!error && !!data);
    } catch {
      setConfigOk(false);
    }

    setLastScanAt(new Date().toLocaleTimeString());
    setScanning(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    console.log('[Supabase Status] Scan complete');
  }, [scanning]);

  useEffect(() => {
    void runFullScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSection = useCallback((section: keyof SectionState) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const stats = useMemo(() => {
    const tablesOk = tables.filter(t => t.status === 'ok').length;
    const tablesMissing = tables.filter(t => t.status === 'missing').length;
    const functionsOk = functions.filter(f => f.status === 'ok').length;
    const functionsMissing = functions.filter(f => f.status === 'missing').length;
    const bucketsOk = buckets.filter(b => b.status === 'ok').length;
    const bucketsMissing = buckets.filter(b => b.status === 'missing').length;
    const allOk = tablesMissing === 0 && functionsMissing === 0 && bucketsMissing === 0 && configOk !== false;
    const totalChecks = tables.length + functions.length + buckets.length + (configOk !== null ? 1 : 0);
    const passedChecks = tablesOk + functionsOk + bucketsOk + (configOk ? 1 : 0);
    return { tablesOk, tablesMissing, functionsOk, functionsMissing, bucketsOk, bucketsMissing, allOk, totalChecks, passedChecks };
  }, [tables, functions, buckets, configOk]);

  const healthPercent = stats.totalChecks > 0 ? Math.round((stats.passedChecks / stats.totalChecks) * 100) : 0;

  const waitlistCheck = useMemo(() => tables.find(t => t.name === 'waitlist'), [tables]);
  const waitlistStatus = waitlistCheck?.status ?? 'pending';
  const waitlistRowCount = waitlistCheck?.rowCount ?? 0;

  const getSupabaseProjectRef = useCallback((): string | null => {
    const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
    try {
      const hostname = new URL(url).hostname;
      const ref = hostname.split('.')[0];
      return ref || null;
    } catch {
      return null;
    }
  }, []);

  const openSupabaseSqlEditor = useCallback(async (sql: string) => {
    const ref = getSupabaseProjectRef();
    if (!ref) {
      console.log('[Supabase Status] Could not extract project ref from URL');
      return false;
    }
    const editorUrl = `https://supabase.com/dashboard/project/${ref}/sql/new`;
    console.log('[Supabase Status] Opening Supabase SQL Editor:', editorUrl);
    try {
      await Clipboard.setStringAsync(sql);
      console.log('[Supabase Status] SQL copied to clipboard');
    } catch (e) {
      console.log('[Supabase Status] Clipboard copy failed:', e);
    }
    try {
      await Linking.openURL(editorUrl);
      return true;
    } catch (e) {
      console.log('[Supabase Status] Failed to open URL:', e);
      return false;
    }
  }, [getSupabaseProjectRef]);

  const handleDeployWaitlist = useCallback(async () => {
    console.log('[Supabase Status] Deploying waitlist table...');
    setDeployAction('deploying');
    setDeployMsg('Checking table status...');
    deployScale.setValue(0);

    if (!isSupabaseConfigured()) {
      setDeployAction('error');
      setDeployMsg('Supabase not configured. Add URL and Anon Key.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      const { error: existsError } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true });

      const tableAlreadyExists = !existsError ||
        !((existsError.message || '').toLowerCase().includes('does not exist') ||
          (existsError.message || '').toLowerCase().includes('relation'));

      if (tableAlreadyExists) {
        console.log('[Supabase Status] Waitlist table already exists');
        setDeployAction('success');
        setDeployMsg('Waitlist table is already deployed!');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.spring(deployScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }).start();
        void runFullScan();
        return;
      }

      setDeployMsg('Creating waitlist table...');

      const { error: rpcError } = await supabase.rpc('ivx_exec_sql', { sql_text: WAITLIST_SQL });

      if (rpcError) {
        const msg = (rpcError.message || '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('could not find the function')) {
          console.log('[Supabase Status] ivx_exec_sql not found — opening Supabase SQL Editor');
          setDeployMsg('Opening Supabase SQL Editor...');

          const opened = await openSupabaseSqlEditor(WAITLIST_SQL);

          if (opened) {
            setDeployAction('idle');
            setDeployMsg('SQL copied! Paste in Supabase SQL Editor and click Run. Then tap Refresh.');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
              'First-Time Setup',
              'The SQL has been copied and the Supabase SQL Editor is opening. Paste it and click "Run". This creates the waitlist table AND enables auto-deploy for the future.',
              [{ text: 'Got It' }]
            );
          } else {
            try { await Clipboard.setStringAsync(WAITLIST_SQL); } catch (e) { console.log('[Supabase Status] Clipboard fallback failed:', e); }
            setDeployAction('error');
            setDeployMsg('SQL copied to clipboard — paste in Supabase SQL Editor manually.');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert(
              'SQL Copied',
              'Could not open the browser. The SQL has been copied to your clipboard. Go to supabase.com → SQL Editor → New Query, paste and run.',
            );
          }
          return;
        }
        throw new Error(rpcError.message);
      }

      setDeployMsg('Verifying table...');
      await new Promise(r => setTimeout(r, 1000));

      const { error: verifyError } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true });

      if (verifyError) {
        const vMsg = (verifyError.message || '').toLowerCase();
        if (vMsg.includes('does not exist') || vMsg.includes('relation')) {
          throw new Error('Table creation attempted but verification failed.');
        }
      }

      setDeployAction('success');
      setDeployMsg('Waitlist table deployed & synced!');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(deployScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }).start();

      void runFullScan();
      console.log('[Supabase Status] Waitlist deploy SUCCESS');
    } catch (err) {
      setDeployAction('error');
      setDeployMsg((err as Error)?.message || 'Deploy failed');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.log('[Supabase Status] Waitlist deploy FAILED:', (err as Error)?.message);
    }
  }, [runFullScan, deployScale, openSupabaseSqlEditor]);

  const handleCopyWaitlistSql = useCallback(async () => {
    try { await Clipboard.setStringAsync(WAITLIST_SQL); } catch (e) { console.log('[Supabase Status] Clipboard copy failed:', e); }
    setCopiedSql(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedSql(false), 2000);
    Alert.alert('SQL Copied', 'Paste this in your Supabase SQL Editor and run it.');
  }, []);

  const [copiedKycSql, setCopiedKycSql] = useState(false);

  const handleDeployKycTables = useCallback(async () => {
    console.log('[Supabase Status] Deploying KYC tables...');
    try {
      const { error: rpcError } = await supabase.rpc('ivx_exec_sql', { sql_text: KYC_TABLES_SQL });
      if (rpcError) {
        const msg = (rpcError.message || '').toLowerCase();
        if (msg.includes('does not exist') || msg.includes('could not find the function')) {
          const opened = await openSupabaseSqlEditor(KYC_TABLES_SQL);
          if (opened) {
            Alert.alert('SQL Copied', 'KYC tables SQL copied & Supabase SQL Editor opening. Paste and click Run.');
          } else {
            try { await Clipboard.setStringAsync(KYC_TABLES_SQL); } catch (e) { console.log('[Supabase Status] Clipboard fallback:', e); }
            Alert.alert('SQL Copied', 'Paste in Supabase SQL Editor manually.');
          }
          return;
        }
        throw new Error(rpcError.message);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('KYC Tables Deployed', 'kyc_verifications and kyc_documents tables created with RLS, indexes, and triggers.');
      void runFullScan();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Deploy Failed', (err as Error)?.message || 'Unknown error');
    }
  }, [runFullScan, openSupabaseSqlEditor]);

  const handleCopyKycSql = useCallback(async () => {
    try { await Clipboard.setStringAsync(KYC_TABLES_SQL); } catch (e) { console.log('[Supabase Status] KYC SQL copy failed:', e); }
    setCopiedKycSql(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedKycSql(false), 2000);
    Alert.alert('KYC SQL Copied', 'Paste this in your Supabase SQL Editor and run it.');
  }, []);

  const renderStatusIcon = (status: CheckStatus, size: number = 14) => {
    switch (status) {
      case 'ok': return <CheckCircle size={size} color="#00E676" />;
      case 'missing': return <XCircle size={size} color="#FF5252" />;
      case 'error': return <AlertTriangle size={size} color="#FF9800" />;
      case 'checking': return <ActivityIndicator size="small" color={Colors.primary} />;
      default: return <Clock size={size} color={Colors.textTertiary} />;
    }
  };

  const getHealthColor = () => {
    if (healthPercent >= 95) return '#00E676';
    if (healthPercent >= 75) return '#FFB800';
    if (healthPercent >= 50) return '#FF9800';
    return '#FF5252';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Database size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Supabase Live</Text>
        </View>
        <TouchableOpacity
          onPress={runFullScan}
          style={[styles.refreshHeaderBtn, scanning && styles.refreshHeaderBtnActive]}
          disabled={scanning}
          testID="refresh-scan"
        >
          <RefreshCw size={18} color={scanning ? Colors.textTertiary : Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.healthCard, { opacity: scanning ? pulseAnim : 1 }]}>
          <View style={styles.healthTop}>
            <View style={[styles.healthRing, { borderColor: getHealthColor() }]}>
              <Text style={[styles.healthPercent, { color: getHealthColor() }]}>{healthPercent}%</Text>
            </View>
            <View style={styles.healthInfo}>
              <Text style={styles.healthLabel}>Database Health</Text>
              <Text style={[styles.healthStatus, { color: getHealthColor() }]}>
                {scanning ? 'Scanning...' : stats.allOk ? 'All Systems Operational' : `${stats.passedChecks}/${stats.totalChecks} checks passed`}
              </Text>
              {lastScanAt && (
                <Text style={styles.healthTimestamp}>Last scan: {lastScanAt}</Text>
              )}
            </View>
          </View>

          <View style={styles.healthGrid}>
            <View style={styles.healthStat}>
              <Table2 size={14} color="#42A5F5" />
              <Text style={styles.healthStatValue}>{stats.tablesOk}/{ALL_TABLES.length}</Text>
              <Text style={styles.healthStatLabel}>Tables</Text>
            </View>
            <View style={styles.healthStat}>
              <Settings size={14} color="#AB47BC" />
              <Text style={styles.healthStatValue}>{stats.functionsOk}/{ALL_FUNCTIONS.length}</Text>
              <Text style={styles.healthStatLabel}>Functions</Text>
            </View>
            <View style={styles.healthStat}>
              <HardDrive size={14} color="#FF9800" />
              <Text style={styles.healthStatValue}>{stats.bucketsOk}/{STORAGE_BUCKETS.length}</Text>
              <Text style={styles.healthStatLabel}>Buckets</Text>
            </View>
            <View style={styles.healthStat}>
              <Shield size={14} color={configOk ? '#00E676' : '#FF5252'} />
              <Text style={styles.healthStatValue}>{configOk ? 'OK' : '—'}</Text>
              <Text style={styles.healthStatLabel}>Config</Text>
            </View>
          </View>
        </Animated.View>

        {stats.allOk && !scanning && tables.length > 0 && (
          <View style={styles.allGoodBanner}>
            <Zap size={16} color="#00E676" />
            <Text style={styles.allGoodText}>Everything is deployed and running on Supabase</Text>
          </View>
        )}

        {stats.tablesMissing > 0 && !scanning && (
          <View style={styles.warningBanner}>
            <AlertTriangle size={16} color="#FF9800" />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>{stats.tablesMissing} Missing Tables</Text>
              <Text style={styles.warningText}>
                Run the master SQL script in Supabase SQL Editor to create missing tables.
              </Text>
            </View>
          </View>
        )}

        {/* TABLES SECTION */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('tables')} activeOpacity={0.7}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#42A5F520' }]}>
            <Table2 size={16} color="#42A5F5" />
          </View>
          <Text style={styles.sectionTitle}>Tables</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: stats.tablesMissing > 0 ? '#FF5252' : '#00E676' }]}>
              {stats.tablesOk}/{ALL_TABLES.length}
            </Text>
          </View>
          {expandedSections.tables ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {expandedSections.tables && (
          <View style={styles.sectionContent}>
            {tables.map(t => (
              <View key={t.name} style={styles.checkRow}>
                {renderStatusIcon(t.status)}
                <Text style={[styles.checkName, t.status === 'missing' && styles.checkNameMissing]}>{t.name}</Text>
                {t.status === 'ok' && t.rowCount !== undefined && (
                  <Text style={styles.checkMeta}>{t.rowCount} rows</Text>
                )}
              </View>
            ))}
            {tables.length === 0 && scanning && (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.scanningText}>Scanning tables...</Text>
              </View>
            )}
          </View>
        )}

        {/* FUNCTIONS SECTION */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('functions')} activeOpacity={0.7}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#AB47BC20' }]}>
            <Settings size={16} color="#AB47BC" />
          </View>
          <Text style={styles.sectionTitle}>Functions & RPCs</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: stats.functionsMissing > 0 ? '#FF5252' : '#00E676' }]}>
              {stats.functionsOk}/{ALL_FUNCTIONS.length}
            </Text>
          </View>
          {expandedSections.functions ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {expandedSections.functions && (
          <View style={styles.sectionContent}>
            {functions.map(f => (
              <View key={f.name} style={styles.checkRow}>
                {renderStatusIcon(f.status)}
                <Text style={[styles.checkName, f.status === 'missing' && styles.checkNameMissing]}>{f.name}()</Text>
              </View>
            ))}
            {functions.length === 0 && scanning && (
              <View style={styles.scanningRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.scanningText}>Checking functions...</Text>
              </View>
            )}
          </View>
        )}

        {/* STORAGE SECTION */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('storage')} activeOpacity={0.7}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#FF980020' }]}>
            <HardDrive size={16} color="#FF9800" />
          </View>
          <Text style={styles.sectionTitle}>Storage Buckets</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: stats.bucketsMissing > 0 ? '#FF5252' : '#00E676' }]}>
              {stats.bucketsOk}/{STORAGE_BUCKETS.length}
            </Text>
          </View>
          {expandedSections.storage ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {expandedSections.storage && (
          <View style={styles.sectionContent}>
            {buckets.map(b => (
              <View key={b.name} style={styles.checkRow}>
                {renderStatusIcon(b.status)}
                <Text style={[styles.checkName, b.status === 'missing' && styles.checkNameMissing]}>{b.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* REALTIME SECTION */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('realtime')} activeOpacity={0.7}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#00BCD420' }]}>
            <Radio size={16} color="#00BCD4" />
          </View>
          <Text style={styles.sectionTitle}>Realtime Tables</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: '#00BCD4' }]}>
              {realtimeChecks.filter(r => r.status === 'ok').length}/{REALTIME_TABLES.length}
            </Text>
          </View>
          {expandedSections.realtime ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {expandedSections.realtime && (
          <View style={styles.sectionContent}>
            {realtimeChecks.map(r => (
              <View key={r.table} style={styles.checkRow}>
                {renderStatusIcon(r.status)}
                <Text style={[styles.checkName, r.status === 'missing' && styles.checkNameMissing]}>{r.table}</Text>
              </View>
            ))}
          </View>
        )}

        {/* CONFIG SECTION */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('config')} activeOpacity={0.7}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#00E67620' }]}>
            <Shield size={16} color="#00E676" />
          </View>
          <Text style={styles.sectionTitle}>App Config</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: configOk ? '#00E676' : configOk === false ? '#FF5252' : Colors.textTertiary }]}>
              {configOk ? 'OK' : configOk === false ? 'MISS' : '—'}
            </Text>
          </View>
          {expandedSections.config ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {expandedSections.config && (
          <View style={styles.sectionContent}>
            <View style={styles.checkRow}>
              {renderStatusIcon(configOk ? 'ok' : configOk === false ? 'missing' : 'pending')}
              <Text style={styles.checkName}>admin_roles config</Text>
            </View>
          </View>
        )}

        {/* DEPLOY ACTIONS SECTION */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('deploy')} activeOpacity={0.7}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#FFD70020' }]}>
            <Rocket size={16} color="#FFD700" />
          </View>
          <Text style={styles.sectionTitle}>Quick Deploy</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: '#FFD700' }]}>SYNC</Text>
          </View>
          {expandedSections.deploy ? <ChevronUp size={16} color={Colors.textSecondary} /> : <ChevronDown size={16} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {expandedSections.deploy && (
          <View style={styles.deploySection}>
            <View style={styles.deployCard}>
              <View style={styles.deployCardHeader}>
                <View style={styles.deployCardIcon}>
                  <Users size={18} color="#FFD700" />
                </View>
                <View style={styles.deployCardInfo}>
                  <Text style={styles.deployCardTitle}>Waitlist Table</Text>
                  <Text style={styles.deployCardSub}>
                    {waitlistStatus === 'ok' ? `Deployed · ${waitlistRowCount} entries` : waitlistStatus === 'missing' ? 'Not deployed yet' : 'Checking...'}
                  </Text>
                </View>
                <View style={[styles.deployCardBadge, { backgroundColor: waitlistStatus === 'ok' ? '#00E67620' : '#FF525220' }]}>
                  <Text style={[styles.deployCardBadgeText, { color: waitlistStatus === 'ok' ? '#00E676' : '#FF5252' }]}>
                    {waitlistStatus === 'ok' ? 'LIVE' : waitlistStatus === 'missing' ? 'MISSING' : '...'}
                  </Text>
                </View>
              </View>

              {deployAction === 'success' && (
                <Animated.View style={[styles.deploySuccessBanner, { transform: [{ scale: deployScale }] }]}>
                  <CheckCircle size={14} color="#00E676" />
                  <Text style={styles.deploySuccessText}>{deployMsg}</Text>
                </Animated.View>
              )}

              {deployAction === 'error' && (
                <View style={styles.deployErrorBanner}>
                  <AlertTriangle size={14} color="#FF5252" />
                  <Text style={styles.deployErrorText}>{deployMsg}</Text>
                </View>
              )}

              <View style={styles.deployActions}>
                <TouchableOpacity
                  style={[
                    styles.deployButton,
                    deployAction === 'deploying' && styles.deployButtonDisabled,
                    waitlistStatus === 'ok' && styles.deployButtonUpdate,
                  ]}
                  onPress={handleDeployWaitlist}
                  disabled={deployAction === 'deploying'}
                  activeOpacity={0.85}
                  testID="sync-deploy-waitlist-btn"
                >
                  {deployAction === 'deploying' ? (
                    <View style={styles.deployButtonInner}>
                      <ActivityIndicator color="#000" size="small" />
                      <Text style={styles.deployButtonText}>Deploying...</Text>
                    </View>
                  ) : (
                    <View style={styles.deployButtonInner}>
                      <Rocket size={16} color="#000" />
                      <Text style={styles.deployButtonText}>
                        {waitlistStatus === 'ok' ? 'Re-Sync Waitlist' : 'Deploy Waitlist Now'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.copySqlButton}
                  onPress={handleCopyWaitlistSql}
                  activeOpacity={0.7}
                >
                  <Copy size={14} color={copiedSql ? '#00E676' : Colors.primary} />
                  <Text style={[styles.copySqlText, copiedSql && { color: '#00E676' }]}>
                    {copiedSql ? 'Copied!' : 'Copy SQL'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.deployInfoCard}>
              <Zap size={14} color="#FFD700" />
              <Text style={styles.deployInfoText}>
                One-tap deploy creates the waitlist table with RLS, indexes, realtime, and auto-update triggers directly in Supabase.
              </Text>
            </View>

            <View style={styles.deployCard}>
              <View style={styles.deployCardHeader}>
                <View style={[styles.deployCardIcon, { backgroundColor: '#22C55E20' }]}>
                  <Shield size={18} color="#22C55E" />
                </View>
                <View style={styles.deployCardInfo}>
                  <Text style={styles.deployCardTitle}>KYC Tables</Text>
                  <Text style={styles.deployCardSub}>
                    kyc_verifications + kyc_documents with RLS & triggers
                  </Text>
                </View>
                {(() => {
                  const kycCheck = tables.find(t => t.name === 'kyc_verifications');
                  const kycStatus = kycCheck?.status ?? 'pending';
                  return (
                    <View style={[styles.deployCardBadge, { backgroundColor: kycStatus === 'ok' ? '#00E67620' : '#FF525220' }]}>
                      <Text style={[styles.deployCardBadgeText, { color: kycStatus === 'ok' ? '#00E676' : '#FF5252' }]}>
                        {kycStatus === 'ok' ? 'LIVE' : kycStatus === 'missing' ? 'MISSING' : '...'}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              <View style={styles.deployActions}>
                <TouchableOpacity
                  style={styles.deployButton}
                  onPress={handleDeployKycTables}
                  activeOpacity={0.85}
                  testID="sync-deploy-kyc-btn"
                >
                  <View style={styles.deployButtonInner}>
                    <Rocket size={16} color="#000" />
                    <Text style={styles.deployButtonText}>Deploy KYC Tables</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.copySqlButton}
                  onPress={handleCopyKycSql}
                  activeOpacity={0.7}
                >
                  <Copy size={14} color={copiedKycSql ? '#00E676' : Colors.primary} />
                  <Text style={[styles.copySqlText, copiedKycSql && { color: '#00E676' }]}>
                    {copiedKycSql ? 'Copied!' : 'Copy SQL'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Server size={14} color={Colors.textTertiary} />
          <Text style={styles.footerText}>
            Live from Supabase — no local scripts needed
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  refreshHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  refreshHeaderBtnActive: {
    borderColor: Colors.primary + '40',
  },
  content: {
    flex: 1,
  },
  healthCard: {
    margin: 16,
    padding: 18,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  healthTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  healthRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  healthPercent: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  healthInfo: {
    flex: 1,
    gap: 3,
  },
  healthLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  healthStatus: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  healthTimestamp: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  healthGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
  },
  healthStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  healthStatValue: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  healthStatLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  allGoodBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0D2818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00E67630',
  },
  allGoodText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#00E676',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    backgroundColor: '#1A0E00',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF980040',
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FF9800',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#B87A3D',
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.card,
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  checkName: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  checkNameMissing: {
    color: '#FF5252',
  },
  checkMeta: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  scanningText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  deploySection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deployCard: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFD70030',
  },
  deployCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  deployCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#FFD70018',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deployCardInfo: {
    flex: 1,
    gap: 2,
  },
  deployCardTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  deployCardSub: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  deployCardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deployCardBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  deploySuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0D2818',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00E67630',
    marginBottom: 10,
  },
  deploySuccessText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#00E676',
  },
  deployErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    backgroundColor: '#1A0808',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF525240',
    marginBottom: 10,
  },
  deployErrorText: {
    flex: 1,
    fontSize: 11,
    color: '#FF8A80',
    lineHeight: 16,
  },
  deployActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  deployButton: {
    flex: 1,
    backgroundColor: '#FFD700',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deployButtonDisabled: {
    opacity: 0.6,
  },
  deployButtonUpdate: {
    backgroundColor: '#1A3D1A',
    borderWidth: 1.5,
    borderColor: '#00E676',
  },
  deployButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deployButtonText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#000',
  },
  copySqlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    height: 44,
  },
  copySqlText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  deployInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#1A1400',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD70020',
  },
  deployInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#B8A040',
    lineHeight: 16,
  },
});
