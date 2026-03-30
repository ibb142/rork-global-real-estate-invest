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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';

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
}

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
  const [expandedSections, setExpandedSections] = useState<SectionState>({
    tables: false,
    functions: false,
    storage: false,
    realtime: false,
    config: false,
  });
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
});
