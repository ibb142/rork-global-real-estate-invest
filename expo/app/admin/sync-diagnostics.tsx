import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Globe,
  Layers,
  Clock,
  Shield,
  Zap,
  Activity,
  BarChart3,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLandingSyncStatus, syncToLandingPage } from '@/lib/landing-sync';
import { usePublishedJVDeals } from '@/lib/parse-deal';
import {
  CANONICAL_MIN_INVESTMENT,
  CANONICAL_DISTRIBUTION_LABEL,
  CANONICAL_CLAIMS,
  validatePublicClaim,
} from '@/lib/published-deal-card-model';
import { getDeployStatus } from '@/lib/landing-deploy';
import { getCanonicalCacheStats } from '@/lib/canonical-deals';
import { performanceMonitor } from '@/lib/performance-monitor';


type StatusLevel = 'green' | 'yellow' | 'red';

interface DiagnosticItem {
  id: string;
  label: string;
  value: string;
  status: StatusLevel;
  detail?: string;
}

export default function SyncDiagnosticsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const publishedJV = usePublishedJVDeals();

  const syncStatusQuery = useQuery({
    queryKey: ['sync-diagnostics-status'],
    queryFn: getLandingSyncStatus,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    refetchInterval: false,
  });

  const forceSyncMutation = useMutation({
    mutationFn: () => syncToLandingPage(),
    onSuccess: (result) => {
      console.log('[SyncDiag] Force sync result:', result.success, 'deals:', result.syncedDeals);
      void queryClient.invalidateQueries({ queryKey: ['sync-diagnostics-status'] });
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      void queryClient.invalidateQueries({ queryKey: ['sync-diagnostics-status'] });
      void publishedJV.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, publishedJV]);

  const status = syncStatusQuery.data;
  const appVisibleCount = publishedJV.deals.length;

  const cacheStats = getCanonicalCacheStats();
  const perfSummary = performanceMonitor.getSummary();

  const claimChecks = useMemo(() => {
    const testClaims = [
      '$50 minimum investment',
      'Monthly distributions',
      'Not FDIC insured',
      'IVX Holdings LLC',
    ];
    return testClaims.map(claim => ({
      claim,
      ...validatePublicClaim(claim),
    }));
  }, []);

  const diagnostics: DiagnosticItem[] = [];

  diagnostics.push({
    id: 'jv-deals-published',
    label: 'Published JV Deals (Supabase)',
    value: status ? String(status.publishedDealsCount) : '...',
    status: status?.publishedDealsCount != null && status.publishedDealsCount > 0 ? 'green' : 'yellow',
    detail: 'jv_deals table — single source of truth',
  });

  diagnostics.push({
    id: 'landing-deals-count',
    label: 'Landing Deals (Derived)',
    value: status ? String(status.landingDealsCount) : '...',
    status: status ? (status.inSync ? 'green' : 'red') : 'yellow',
    detail: 'landing_deals table — auto-generated, read-only',
  });

  diagnostics.push({
    id: 'canonical-api-count',
    label: 'Canonical API Count',
    value: status ? String(status.canonicalApiCount) : '...',
    status: status?.canonicalApiCount != null && status.canonicalApiCount > 0 ? 'green' : 'yellow',
    detail: 'Same as published jv_deals — canonical endpoint',
  });

  diagnostics.push({
    id: 'app-visible-count',
    label: 'App Visible Deals',
    value: String(appVisibleCount),
    status: appVisibleCount > 0 ? 'green' : 'yellow',
    detail: 'Deals visible in app Invest screen right now',
  });

  diagnostics.push({
    id: 'sync-status',
    label: 'Sync Status',
    value: status?.inSync ? 'IN SYNC' : 'OUT OF SYNC',
    status: status?.inSync ? 'green' : 'red',
    detail: status?.inSync
      ? 'jv_deals and landing_deals counts match'
      : `Mismatch: ${status?.publishedDealsCount ?? '?'} published vs ${status?.landingDealsCount ?? '?'} landing`,
  });

  diagnostics.push({
    id: 'last-sync',
    label: 'Last Sync Time',
    value: status?.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never',
    status: status?.lastSync ? 'green' : 'yellow',
  });

  diagnostics.push({
    id: 'last-deploy',
    label: 'Last Deploy Time',
    value: status?.lastDeployTime ? new Date(status.lastDeployTime).toLocaleString() : 'Never',
    status: status?.lastDeployTime ? 'green' : 'yellow',
  });

  diagnostics.push({
    id: 'last-deploy-error',
    label: 'Last Deploy Error',
    value: status?.lastDeployError || 'None',
    status: status?.lastDeployError ? 'red' : 'green',
  });

  diagnostics.push({
    id: 'min-investment',
    label: 'Canonical Min Investment',
    value: `${CANONICAL_MIN_INVESTMENT}`,
    status: 'green',
    detail: 'Shared across app and landing page',
  });

  diagnostics.push({
    id: 'distribution-freq',
    label: 'Canonical Distribution',
    value: CANONICAL_DISTRIBUTION_LABEL,
    status: 'green',
    detail: 'Shared across app and landing page',
  });

  const deployStatus = getDeployStatus();
  diagnostics.push({
    id: 'deploy-mode',
    label: 'Deploy Mode',
    value: deployStatus.canDeploy ? 'Backend API' : 'Not Configured',
    status: deployStatus.canDeploy ? 'green' : 'yellow',
    detail: 'Deploy is backend-only. No client-side AWS credentials used.',
  });

  diagnostics.push({
    id: 'compliance-note',
    label: 'Compliance Disclaimer',
    value: CANONICAL_CLAIMS.complianceNote ? 'Active' : 'Missing',
    status: CANONICAL_CLAIMS.complianceNote ? 'green' : 'red',
    detail: CANONICAL_CLAIMS.complianceNote,
  });

  const countMismatch = status && !status.inSync;
  const appVsApiMismatch = status && appVisibleCount !== status.publishedDealsCount;

  const getStatusIcon = (level: StatusLevel) => {
    switch (level) {
      case 'green': return <CheckCircle2 size={16} color="#22C55E" />;
      case 'yellow': return <AlertTriangle size={16} color="#FFD700" />;
      case 'red': return <XCircle size={16} color="#FF4D4D" />;
    }
  };

  const getStatusBg = (level: StatusLevel) => {
    switch (level) {
      case 'green': return 'rgba(0,196,140,0.08)';
      case 'yellow': return 'rgba(255,215,0,0.08)';
      case 'red': return 'rgba(255,77,77,0.08)';
    }
  };

  const getStatusBorder = (level: StatusLevel) => {
    switch (level) {
      case 'green': return 'rgba(0,196,140,0.2)';
      case 'yellow': return 'rgba(255,215,0,0.2)';
      case 'red': return 'rgba(255,77,77,0.2)';
    }
  };

  const overallStatus: StatusLevel = countMismatch || appVsApiMismatch ? 'red' : (status?.publishedDealsCount === 0 ? 'yellow' : 'green');

  const renderDiagRow = (item: DiagnosticItem) => (
    <View key={item.id} style={styles.diagRow}>
      <View style={styles.diagLeft}>
        {getStatusIcon(item.status)}
        <View style={styles.diagTextWrap}>
          <Text style={styles.diagLabel}>{item.label}</Text>
          {item.detail ? <Text style={styles.diagDetail}>{item.detail}</Text> : null}
        </View>
      </View>
      <Text style={[styles.diagValue, { color: item.status === 'red' ? '#FF4D4D' : item.status === 'green' ? '#22C55E' : Colors.text }]}>{item.value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Sync Diagnostics</Text>
          <Text style={styles.headerSub}>App vs Landing Page Health</Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={styles.refreshBtn}
          disabled={refreshing}
        >
          <RefreshCw size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        <View style={[styles.overallCard, { backgroundColor: getStatusBg(overallStatus), borderColor: getStatusBorder(overallStatus) }]}>
          <View style={styles.overallRow}>
            {overallStatus === 'green' ? (
              <Shield size={28} color="#22C55E" />
            ) : overallStatus === 'yellow' ? (
              <AlertTriangle size={28} color="#FFD700" />
            ) : (
              <XCircle size={28} color="#FF4D4D" />
            )}
            <View style={styles.overallTextWrap}>
              <Text style={styles.overallTitle}>
                {overallStatus === 'green' ? 'All Systems In Sync' :
                 overallStatus === 'yellow' ? 'Attention Required' : 'Sync Issues Detected'}
              </Text>
              <Text style={styles.overallSub}>
                {overallStatus === 'green'
                  ? 'App and landing page are displaying the same deal data from jv_deals.'
                  : countMismatch
                    ? `jv_deals has ${status?.publishedDealsCount} published deals but landing_deals has ${status?.landingDealsCount}. Run sync to fix.`
                    : appVsApiMismatch
                      ? `App shows ${appVisibleCount} deals but API has ${status?.publishedDealsCount}. Refresh or check filters.`
                      : 'No published deals found. Publish deals to populate both app and landing.'}
              </Text>
            </View>
          </View>
        </View>

        {(countMismatch || appVsApiMismatch) ? (
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={() => forceSyncMutation.mutate()}
            disabled={forceSyncMutation.isPending}
            activeOpacity={0.85}
          >
            {forceSyncMutation.isPending ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Zap size={18} color="#000" />
            )}
            <Text style={styles.syncBtnText}>
              {forceSyncMutation.isPending ? 'Syncing...' : 'Force Sync Now'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {forceSyncMutation.isSuccess ? (
          <View style={styles.syncResult}>
            <CheckCircle2 size={14} color="#22C55E" />
            <Text style={styles.syncResultText}>
              Sync completed: {forceSyncMutation.data?.syncedDeals} deals synced
              {forceSyncMutation.data?.errors.length ? ` (${forceSyncMutation.data.errors.length} errors)` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Database size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Data Sources</Text>
        </View>

        {diagnostics.slice(0, 4).map(renderDiagRow)}

        <View style={styles.sectionHeader}>
          <Layers size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Sync Health</Text>
        </View>

        {diagnostics.slice(4, 8).map(renderDiagRow)}

        <View style={styles.sectionHeader}>
          <Globe size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Content Consistency</Text>
        </View>

        {diagnostics.slice(8).map(renderDiagRow)}

        <View style={styles.sectionHeader}>
          <Activity size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Performance Metrics</Text>
        </View>

        <View style={styles.perfCard}>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Cache Hit Rate</Text>
            <Text style={[styles.perfValue, { color: cacheStats.cacheHitRate > 50 ? '#22C55E' : '#FFD700' }]}>
              {cacheStats.cacheHitRate}%
            </Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Last Fetch Latency</Text>
            <Text style={[styles.perfValue, {
              color: (cacheStats.lastFetchLatencyMs ?? 0) < 500 ? '#22C55E' :
                     (cacheStats.lastFetchLatencyMs ?? 0) < 2000 ? '#FFD700' : '#FF4D4D'
            }]}>
              {cacheStats.lastFetchLatencyMs != null ? `${cacheStats.lastFetchLatencyMs}ms` : 'N/A'}
            </Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Total API Fetches</Text>
            <Text style={styles.perfValue}>{cacheStats.totalFetches}</Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Cache Hits</Text>
            <Text style={styles.perfValue}>{cacheStats.cacheHits}</Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Cached Deals</Text>
            <Text style={styles.perfValue}>{cacheStats.cachedDealCount}</Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Cache Source</Text>
            <Text style={styles.perfValue}>{cacheStats.cachedSource ?? 'none'}</Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Perf Tracked Endpoints</Text>
            <Text style={styles.perfValue}>{perfSummary.trackedEndpoints}</Text>
          </View>
          <View style={styles.perfRow}>
            <Text style={styles.perfLabel}>Memory Warnings</Text>
            <Text style={[styles.perfValue, { color: perfSummary.memoryWarnings > 0 ? '#FF4D4D' : '#22C55E' }]}>
              {perfSummary.memoryWarnings}
            </Text>
          </View>
          {perfSummary.slowestApi ? (
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Slowest API</Text>
              <Text style={styles.perfValue}>{perfSummary.slowestApi.endpoint} ({perfSummary.slowestApi.avgMs}ms)</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <BarChart3 size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Claim Validation</Text>
        </View>

        <View style={styles.claimCard}>
          <Text style={styles.claimCardTitle}>Removed Claims (Do NOT use publicly)</Text>
          {CANONICAL_CLAIMS.removedClaims.map((claim, i) => (
            <View key={`removed-${i}`} style={styles.claimRow}>
              <XCircle size={14} color="#FF4D4D" />
              <Text style={styles.claimRemovedText}>{claim}</Text>
            </View>
          ))}
        </View>

        <View style={styles.claimCard}>
          <Text style={styles.claimCardTitle}>Approved Disclaimers</Text>
          {CANONICAL_CLAIMS.disclaimers.map((d, i) => (
            <View key={`disc-${i}`} style={styles.claimRow}>
              <CheckCircle2 size={14} color="#22C55E" />
              <Text style={styles.claimApprovedText}>{d}</Text>
            </View>
          ))}
        </View>

        <View style={styles.claimCard}>
          <Text style={styles.claimCardTitle}>Active Claim Checks</Text>
          {claimChecks.map((check, i) => (
            <View key={`check-${i}`} style={styles.claimRow}>
              {check.valid ? (
                <CheckCircle2 size={14} color="#22C55E" />
              ) : (
                <XCircle size={14} color="#FF4D4D" />
              )}
              <View style={styles.claimTextWrap}>
                <Text style={[styles.claimCheckText, { color: check.valid ? '#22C55E' : '#FF4D4D' }]}>
                  {check.claim}
                </Text>
                {check.reason ? <Text style={styles.claimReasonText}>{check.reason}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Clock size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Architecture (Backend-Only Deploy)</Text>
        </View>

        <View style={styles.archCard}>
          <Text style={styles.archTitle}>Data Flow</Text>
          <View style={styles.archFlow}>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>jv_deals</Text>
              <Text style={styles.archNodeSub}>Source of Truth</Text>
            </View>
            <Text style={styles.archArrow}>{"→"}</Text>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>App</Text>
              <Text style={styles.archNodeSub}>usePublishedJVDeals()</Text>
            </View>
          </View>
          <View style={styles.archFlow}>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>jv_deals</Text>
              <Text style={styles.archNodeSub}>Source of Truth</Text>
            </View>
            <Text style={styles.archArrow}>{"→"}</Text>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>landing_deals</Text>
              <Text style={styles.archNodeSub}>Auto-derived</Text>
            </View>
            <Text style={styles.archArrow}>{"→"}</Text>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>Website</Text>
              <Text style={styles.archNodeSub}>ivxholding.com</Text>
            </View>
          </View>
          <View style={styles.archFlow}>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>Shared Model</Text>
              <Text style={styles.archNodeSub}>published-deal-card-model.ts</Text>
            </View>
            <Text style={styles.archArrow}>{"→"}</Text>
            <View style={styles.archNode}>
              <Text style={styles.archNodeTitle}>Both</Text>
              <Text style={styles.archNodeSub}>App + Landing</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
  },
  headerSub: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,215,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  overallCard: {
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  overallRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  overallTextWrap: {
    flex: 1,
  },
  overallTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800' as const,
    marginBottom: 4,
  },
  overallSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  syncBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  syncBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800' as const,
  },
  syncResult: {
    marginHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,196,140,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.2)',
  },
  syncResultText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '600' as const,
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  diagLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  diagTextWrap: {
    flex: 1,
  },
  diagLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  diagDetail: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  diagValue: {
    fontSize: 14,
    fontWeight: '800' as const,
    marginLeft: 10,
    flexShrink: 0,
  },
  perfCard: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  perfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  perfLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  perfValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    textAlign: 'right' as const,
    flexShrink: 0,
    maxWidth: '50%',
  },
  claimCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  claimCardTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  claimRemovedText: {
    color: '#FF4D4D',
    fontSize: 12,
    flex: 1,
    textDecorationLine: 'line-through',
  },
  claimApprovedText: {
    color: '#22C55E',
    fontSize: 12,
    flex: 1,
  },
  claimTextWrap: {
    flex: 1,
  },
  claimCheckText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  claimReasonText: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  archCard: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 14,
  },
  archTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  archFlow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  archNode: {
    backgroundColor: 'rgba(255,215,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  archNodeTitle: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  archNodeSub: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: 1,
  },
  archArrow: {
    color: Colors.textTertiary,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  bottomPad: {
    height: 100,
  },
});
