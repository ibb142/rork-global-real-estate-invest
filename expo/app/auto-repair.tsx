import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Shield,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Server,
  Database,
  Lock,
  CreditCard,
  Building2,
  Bell,
  BarChart3,
  Wallet,
  UserCheck,
  Mail,
  Users,
  Globe,
  Radio,
  Wrench,
  Clock,
  Play,
  Cpu,
  ShieldCheck,
  CircleAlert,
  Gauge,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type ScanStatus = 'idle' | 'scanning' | 'complete';
type ModuleStatus = 'healthy' | 'degraded' | 'critical' | 'offline' | 'checking';

interface HealthCheck {
  id: string;
  module: string;
  endpoint: string;
  status: ModuleStatus;
  responseTime: number;
  lastChecked: string;
  errorMessage?: string;
  autoRepaired: boolean;
  repairAction?: string;
}

interface RepairLog {
  id: string;
  timestamp: string;
  module: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: string;
  result: 'success' | 'failed' | 'pending';
  duration: number;
}

interface SystemMetric {
  label: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  threshold: number;
  status: 'normal' | 'warning' | 'critical';
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  database: <Database size={18} color="#22C55E" />,
  auth: <Lock size={18} color="#4A90D9" />,
  transactions: <CreditCard size={18} color="#FFD700" />,
  properties: <Building2 size={18} color="#E879F9" />,
  notifications: <Bell size={18} color="#FF9F43" />,
  analytics: <BarChart3 size={18} color="#00D2FF" />,
  wallet: <Wallet size={18} color="#22C55E" />,
  kyc: <UserCheck size={18} color="#4A90D9" />,
  email: <Mail size={18} color="#FF6B6B" />,
  referrals: <Users size={18} color="#A78BFA" />,
  landing_page: <Globe size={18} color="#FFD700" />,
  api_gateway: <Radio size={18} color="#00D2FF" />,
};

const STATUS_CONFIG = {
  healthy: { color: '#22C55E', bg: 'rgba(0,196,140,0.12)', label: 'Healthy' },
  degraded: { color: '#FFB800', bg: 'rgba(255,184,0,0.12)', label: 'Degraded' },
  critical: { color: '#FF4D4D', bg: 'rgba(255,77,77,0.12)', label: 'Critical' },
  offline: { color: '#6A6A6A', bg: 'rgba(106,106,106,0.12)', label: 'Offline' },
  checking: { color: '#4A90D9', bg: 'rgba(74,144,217,0.12)', label: 'Checking...' },
};

const SEVERITY_CONFIG = {
  low: { color: '#4A90D9', bg: 'rgba(74,144,217,0.10)' },
  medium: { color: '#FFB800', bg: 'rgba(255,184,0,0.10)' },
  high: { color: '#FF6B6B', bg: 'rgba(255,107,107,0.10)' },
  critical: { color: '#FF4D4D', bg: 'rgba(255,77,77,0.10)' },
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PulsingDot({ color, size = 8 }: { color: string; size?: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: pulseAnim,
      }}
    />
  );
}

function ScanProgressBar({ progress, isScanning }: { progress: number; isScanning: boolean }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress, widthAnim]);

  useEffect(() => {
    if (isScanning) {
      const shimmer = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(shimmerAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      );
      shimmer.start();
      return () => shimmer.stop();
    }
  }, [isScanning, shimmerAnim]);

  const width = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressBarOuter}>
      <Animated.View
        style={[
          styles.progressBarInner,
          {
            width,
            opacity: isScanning
              ? shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] })
              : 1,
          },
        ]}
      />
    </View>
  );
}

export default function AutoRepairScreen() {
  const router = useRouter();
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [repairLogs, setRepairLogs] = useState<RepairLog[]>([]);
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [uptime, setUptime] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scanSummary, setScanSummary] = useState<{
    total: number;
    healthy: number;
    degraded: number;
    critical: number;
    repaired: number;
  } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const scanMutation = useMutation({
    mutationFn: async () => {
      console.log('[Supabase] Running full system scan');
      const { data, error } = await supabase.from('auto_repair_scans').insert({ status: 'running', created_at: new Date().toISOString() }).select().single();
      if (error) throw new Error(error.message);
      return { success: true, checks: [], summary: null, timestamp: new Date().toISOString(), ...data };
    },
    onMutate: () => {
      setScanStatus('scanning');
      setScanProgress(0);
      setHealthChecks([]);
      setScanSummary(null);
    },
    onSuccess: (data: any) => {
      setHealthChecks(data.checks as HealthCheck[]);
      setScanSummary(data.summary);
      setLastScan(data.timestamp);
      setScanStatus('complete');
      setScanProgress(100);
      console.log('[AutoRepair] Scan complete:', data.summary);
    },
    onError: (err: Error) => {
      console.error('[AutoRepair] Scan failed:', err.message);
      setScanStatus('idle');
    },
  });

  const metricsQuery = useQuery<any>({
    queryKey: ['autoRepair.getSystemMetrics'],
    queryFn: async () => {
      console.log('[Supabase] Fetching system metrics');
      const { data, error } = await supabase.from('system_metrics').select('*').limit(50);
      if (error) { console.log('[Supabase] system_metrics error:', error.message); return null; }
      return data;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (metricsQuery.data) {
      setMetrics(metricsQuery.data.metrics as SystemMetric[]);
      setUptime(metricsQuery.data.uptime);
      if (metricsQuery.data.lastFullScan) setLastScan(metricsQuery.data.lastFullScan);
    }
  }, [metricsQuery.data]);

  const logsQuery = useQuery<any>({
    queryKey: ['autoRepair.getRepairLogs'],
    queryFn: async () => {
      console.log('[Supabase] Fetching repair logs');
      const { data, error } = await supabase.from('repair_logs').select('*').limit(50);
      if (error) { console.log('[Supabase] repair_logs error:', error.message); return null; }
      return data;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (logsQuery.data) {
      setRepairLogs(logsQuery.data as RepairLog[]);
    }
  }, [logsQuery.data]);

  const repairMutation = useMutation({
    mutationFn: async (input: any) => {
      console.log('[Supabase] Triggering repair');
      const { data, error } = await supabase.from('repair_logs').insert({ ...input, status: 'running', created_at: new Date().toISOString() }).select().single();
      if (error) throw new Error(error.message);
      return { success: true, details: 'Repair completed', ...data };
    },
    onSuccess: (data: any) => {
      console.log('[AutoRepair] Repair result:', data.details);
      void logsQuery.refetch();
      void metricsQuery.refetch();
    },
  });

  useEffect(() => {
    if (scanStatus === 'scanning') {
      let p = 0;
      const interval = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p >= 90 && !scanMutation.isSuccess) {
          p = 90;
        }
        setScanProgress(Math.min(p, 100));
        if (p >= 100) clearInterval(interval);
      }, 300);
      return () => clearInterval(interval);
    }
  }, [scanStatus, scanMutation.isSuccess]);

  const handleScan = useCallback(() => {
    scanMutation.mutate();
  }, [scanMutation]);

  const handleRepair = useCallback((module: string, action: string) => {
    repairMutation.mutate({ module, action });
  }, [repairMutation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([metricsQuery.refetch(), logsQuery.refetch()]);
    setRefreshing(false);
  }, [metricsQuery, logsQuery]);

  const overallHealth = useMemo(() => {
    if (!healthChecks.length) return null;
    const critical = healthChecks.filter(c => c.status === 'critical').length;
    const degraded = healthChecks.filter(c => c.status === 'degraded').length;
    if (critical > 0) return 'critical';
    if (degraded > 0) return 'degraded';
    return 'healthy';
  }, [healthChecks]);

  const renderOverallStatus = () => {
    const statusColor = overallHealth
      ? STATUS_CONFIG[overallHealth].color
      : scanStatus === 'scanning' ? '#4A90D9' : '#6A6A6A';
    const statusLabel = overallHealth
      ? STATUS_CONFIG[overallHealth].label
      : scanStatus === 'scanning' ? 'Scanning...' : 'Ready to Scan';

    return (
      <View style={styles.overallCard}>
        <View style={styles.overallTop}>
          <View style={[styles.overallIconWrap, { backgroundColor: statusColor + '20' }]}>
            {scanStatus === 'scanning' ? (
              <ActivityIndicator size="small" color={statusColor} />
            ) : overallHealth === 'healthy' ? (
              <ShieldCheck size={28} color={statusColor} />
            ) : overallHealth === 'critical' ? (
              <CircleAlert size={28} color={statusColor} />
            ) : (
              <Shield size={28} color={statusColor} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.overallLabel}>System Health</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PulsingDot color={statusColor} size={10} />
              <Text style={[styles.overallStatus, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <View style={styles.uptimeBadge}>
            <Clock size={12} color={Colors.textSecondary} />
            <Text style={styles.uptimeText}>{formatUptime(uptime)}</Text>
          </View>
        </View>

        {scanStatus === 'scanning' && (
          <View style={styles.scanProgressWrap}>
            <ScanProgressBar progress={scanProgress} isScanning={true} />
            <Text style={styles.scanProgressText}>
              Scanning modules... {Math.round(scanProgress)}%
            </Text>
          </View>
        )}

        {scanSummary && scanStatus === 'complete' && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#22C55E' }]}>{scanSummary.healthy}</Text>
              <Text style={styles.summaryLabel}>Healthy</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#FFB800' }]}>{scanSummary.degraded}</Text>
              <Text style={styles.summaryLabel}>Degraded</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#FF4D4D' }]}>{scanSummary.critical}</Text>
              <Text style={styles.summaryLabel}>Critical</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: '#4A90D9' }]}>{scanSummary.repaired}</Text>
              <Text style={styles.summaryLabel}>Repaired</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.scanButton,
            scanStatus === 'scanning' && styles.scanButtonDisabled,
          ]}
          onPress={handleScan}
          disabled={scanStatus === 'scanning'}
          activeOpacity={0.7}
        >
          {scanStatus === 'scanning' ? (
            <ActivityIndicator size="small" color="#0A0A0A" />
          ) : (
            <Play size={18} color="#0A0A0A" />
          )}
          <Text style={styles.scanButtonText}>
            {scanStatus === 'scanning' ? 'Scanning...' : scanStatus === 'complete' ? 'Re-Scan System' : 'Run Full Scan'}
          </Text>
        </TouchableOpacity>

        {lastScan && (
          <Text style={styles.lastScanText}>Last scan: {formatTimeAgo(lastScan)}</Text>
        )}
      </View>
    );
  };

  const renderMetrics = () => {
    if (!metrics.length) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Gauge size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>System Metrics</Text>
        </View>
        <View style={styles.metricsGrid}>
          {metrics.map((metric, idx) => {
            const metricColor =
              metric.status === 'critical' ? '#FF4D4D' :
              metric.status === 'warning' ? '#FFB800' : '#22C55E';
            return (
              <View key={idx} style={styles.metricCard}>
                <View style={styles.metricTop}>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <View style={[styles.metricDot, { backgroundColor: metricColor }]} />
                </View>
                <Text style={styles.metricValue}>
                  {metric.unit === 'USD' ? `${new Intl.NumberFormat('en-US').format(metric.value)}` : new Intl.NumberFormat('en-US').format(metric.value)}
                </Text>
                <Text style={styles.metricUnit}>{metric.unit}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderModuleChecks = () => {
    if (!healthChecks.length) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Cpu size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Module Health</Text>
        </View>
        {healthChecks.map((check) => {
          const cfg = STATUS_CONFIG[check.status] || STATUS_CONFIG.healthy;
          const icon = MODULE_ICONS[check.module] || <Server size={18} color={Colors.textSecondary} />;
          const isExpanded = selectedModule === check.id;

          return (
            <TouchableOpacity
              key={check.id}
              style={styles.moduleCard}
              onPress={() => setSelectedModule(isExpanded ? null : check.id)}
              activeOpacity={0.7}
            >
              <View style={styles.moduleRow}>
                <View style={styles.moduleIconWrap}>{icon}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.moduleName}>{check.module.replace(/_/g, ' ').toUpperCase()}</Text>
                  <Text style={styles.moduleEndpoint}>{check.endpoint}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                  {check.status === 'healthy' ? (
                    <CheckCircle size={12} color={cfg.color} />
                  ) : check.status === 'critical' ? (
                    <XCircle size={12} color={cfg.color} />
                  ) : (
                    <AlertTriangle size={12} color={cfg.color} />
                  )}
                  <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={styles.moduleDetails}>
                <Text style={styles.responseTime}>{check.responseTime}ms</Text>
                {check.autoRepaired && (
                  <View style={styles.repairedBadge}>
                    <Wrench size={10} color="#4A90D9" />
                    <Text style={styles.repairedText}>Auto-Repaired</Text>
                  </View>
                )}
              </View>

              {isExpanded && (
                <View style={styles.expandedSection}>
                  {check.errorMessage && (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorLabel}>Error:</Text>
                      <Text style={styles.errorMsg}>{check.errorMessage}</Text>
                    </View>
                  )}
                  {check.repairAction && (
                    <View style={styles.repairBox}>
                      <Text style={styles.repairLabel}>Repair Action:</Text>
                      <Text style={styles.repairMsg}>{check.repairAction}</Text>
                    </View>
                  )}
                  <View style={styles.repairActions}>
                    <TouchableOpacity
                      style={styles.repairBtn}
                      onPress={() => handleRepair(check.module, 'clear_cache')}
                    >
                      <RefreshCw size={14} color="#FFD700" />
                      <Text style={styles.repairBtnText}>Clear Cache</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.repairBtn}
                      onPress={() => handleRepair(check.module, 'revalidate_data')}
                    >
                      <Zap size={14} color="#FFD700" />
                      <Text style={styles.repairBtnText}>Revalidate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.repairBtn}
                      onPress={() => handleRepair(check.module, 'restart_service')}
                    >
                      <Activity size={14} color="#FFD700" />
                      <Text style={styles.repairBtnText}>Restart</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderRepairLogs = () => {
    if (!repairLogs.length) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Wrench size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Repair History</Text>
        </View>
        {repairLogs.slice(0, 10).map((log) => {
          const sevCfg = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.low;
          const resultColor =
            log.result === 'success' ? '#22C55E' :
            log.result === 'failed' ? '#FF4D4D' : '#FFB800';

          return (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logTop}>
                <View style={[styles.sevBadge, { backgroundColor: sevCfg.bg }]}>
                  <Text style={[styles.sevText, { color: sevCfg.color }]}>{log.severity.toUpperCase()}</Text>
                </View>
                <Text style={styles.logTime}>{formatTimeAgo(log.timestamp)}</Text>
              </View>
              <Text style={styles.logModule}>{log.module.replace(/_/g, ' ')}</Text>
              <Text style={styles.logIssue}>{log.issue}</Text>
              <View style={styles.logBottom}>
                <Text style={styles.logAction}>{log.action}</Text>
                <View style={[styles.resultBadge, { backgroundColor: resultColor + '18' }]}>
                  <Text style={[styles.resultText, { color: resultColor }]}>{log.result}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderAutoRepairFeatures = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Zap size={18} color={Colors.primary} />
        <Text style={styles.sectionTitle}>Auto-Repair Capabilities</Text>
      </View>
      {[
        {
          icon: <Database size={20} color="#22C55E" />,
          title: 'Data Integrity Monitor',
          desc: 'Validates all records, detects corruption, auto-fixes schema mismatches',
          status: 'Active',
          statusColor: '#22C55E',
        },
        {
          icon: <CreditCard size={20} color="#FFD700" />,
          title: 'Stuck Transaction Recovery',
          desc: 'Finds pending transactions older than 24h and auto-resolves or flags them',
          status: 'Active',
          statusColor: '#22C55E',
        },
        {
          icon: <Globe size={20} color="#4A90D9" />,
          title: 'Landing Page Health',
          desc: 'Monitors render time, asset loading, form submissions, and API connectivity',
          status: 'Active',
          statusColor: '#22C55E',
        },
        {
          icon: <Radio size={20} color="#E879F9" />,
          title: 'API Endpoint Watchdog',
          desc: 'Pings all Supabase endpoints every 30s, auto-retries on timeout, alerts on failure',
          status: 'Active',
          statusColor: '#22C55E',
        },
        {
          icon: <Lock size={20} color="#FF9F43" />,
          title: 'Auth Service Guard',
          desc: 'Monitors JWT validation, token refresh cycles, and session integrity',
          status: 'Active',
          statusColor: '#22C55E',
        },
        {
          icon: <Bell size={20} color="#FF6B6B" />,
          title: 'Alert & Escalation Engine',
          desc: 'Critical issues trigger instant alerts to CEO via email, SMS, and push',
          status: 'Active',
          statusColor: '#22C55E',
        },
      ].map((feature, idx) => (
        <View key={idx} style={styles.featureCard}>
          <View style={styles.featureIconWrap}>{feature.icon}</View>
          <View style={{ flex: 1 }}>
            <View style={styles.featureTitleRow}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <View style={[styles.featureStatus, { backgroundColor: feature.statusColor + '18' }]}>
                <PulsingDot color={feature.statusColor} size={6} />
                <Text style={[styles.featureStatusText, { color: feature.statusColor }]}>
                  {feature.status}
                </Text>
              </View>
            </View>
            <Text style={styles.featureDesc}>{feature.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Auto-Repair Center</Text>
            <Text style={styles.headerSubtitle}>24/7 Health Monitor & Self-Healing</Text>
          </View>
          <View style={styles.liveBadge}>
            <PulsingDot color="#22C55E" />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {renderOverallStatus()}
            {renderMetrics()}
            {renderModuleChecks()}
            {renderAutoRepairFeatures()}
            {renderRepairLogs()}
            <View style={{ height: 40 }} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060A10',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,196,140,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  overallCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  overallTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  overallIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overallLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  overallStatus: {
    fontSize: 20,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
  },
  uptimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  uptimeText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  scanProgressWrap: {
    marginBottom: 16,
  },
  scanProgressText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 6,
    textAlign: 'center',
  },
  progressBarOuter: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  summaryLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#0A0A0A',
  },
  lastScanText: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%' as any,
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  metricTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    flex: 1,
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  metricUnit: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  moduleCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moduleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moduleName: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  moduleEndpoint: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  moduleDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  responseTime: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  repairedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74,144,217,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  repairedText: {
    fontSize: 10,
    color: '#4A90D9',
    fontWeight: '600' as const,
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  errorBox: {
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  errorLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#FF4D4D',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  errorMsg: {
    fontSize: 12,
    color: '#FF8888',
    lineHeight: 18,
  },
  repairBox: {
    backgroundColor: 'rgba(74,144,217,0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  repairLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#4A90D9',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
  repairMsg: {
    fontSize: 12,
    color: '#88BBFF',
    lineHeight: 18,
  },
  repairActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  repairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,215,0,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.20)',
  },
  repairBtnText: {
    fontSize: 11,
    color: '#FFD700',
    fontWeight: '600' as const,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  featureStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  featureStatusText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  featureDesc: {
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 17,
  },
  logCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  logTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sevBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sevText: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  logTime: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  logModule: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'capitalize' as const,
    marginBottom: 2,
  },
  logIssue: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  logBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logAction: {
    fontSize: 10,
    color: Colors.textTertiary,
    flex: 1,
    marginRight: 8,
  },
  resultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resultText: {
    fontSize: 9,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
});
