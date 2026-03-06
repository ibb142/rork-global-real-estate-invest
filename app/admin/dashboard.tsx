import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Users,
  ArrowLeftRight,
  Building2,
  TrendingUp,
  DollarSign,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ChevronRight,
  ArrowLeft,
  Activity,
  BarChart3,
  Wallet,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const utils = trpc.useUtils();

  const dashboardQuery = trpc.analytics.getDashboard.useQuery(undefined, {
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  const kpiQuery = trpc.analytics.getKPIDashboard.useQuery(undefined, {
    staleTime: 1000 * 60,
  });

  const systemHealthQuery = trpc.analytics.getSystemHealth.useQuery(undefined, {
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  const transactionsQuery = trpc.transactions.list.useQuery({
    page: 1,
    limit: 6,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }, {
    staleTime: 1000 * 30,
  });

  const pendingKycQuery = trpc.members.list.useQuery({
    page: 1,
    limit: 5,
    kycStatus: 'pending',
  }, { staleTime: 1000 * 30 });

  const inReviewKycQuery = trpc.members.list.useQuery({
    page: 1,
    limit: 5,
    kycStatus: 'in_review',
  }, { staleTime: 1000 * 30 });

  const retentionQuery = trpc.analytics.getRetentionMetrics.useQuery(
    { period: '30d' },
    { staleTime: 1000 * 60 * 5 }
  );

  const investmentQuery = trpc.analytics.getInvestmentAnalytics.useQuery(
    { period: '30d' },
    { staleTime: 1000 * 60 * 5 }
  );

  const stats = dashboardQuery.data;
  const recentTransactions = transactionsQuery.data?.transactions ?? [];
  const pendingKyc = [
    ...(pendingKycQuery.data?.members ?? []),
    ...(inReviewKycQuery.data?.members ?? []),
  ];
  const kpis = kpiQuery.data?.kpis ?? [];
  const health = systemHealthQuery.data;
  const retention = retentionQuery.data;
  const investment = investmentQuery.data;

  const isLoading = dashboardQuery.isLoading;
  const refreshing = dashboardQuery.isRefetching;

  const onRefresh = useCallback(() => {
    void utils.analytics.getDashboard.invalidate();
    void utils.analytics.getKPIDashboard.invalidate();
    void utils.analytics.getSystemHealth.invalidate();
    void utils.analytics.getRetentionMetrics.invalidate();
    void utils.analytics.getInvestmentAnalytics.invalidate();
    void utils.transactions.list.invalidate();
    void utils.members.list.invalidate();
  }, [utils]);

  const formatCurrency = useCallback((amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(2)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const getTransactionIcon = useCallback((type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownRight size={14} color={Colors.positive} />;
      case 'withdrawal':
        return <ArrowUpRight size={14} color={Colors.negative} />;
      case 'buy':
        return <ArrowDownRight size={14} color={Colors.primary} />;
      case 'sell':
        return <ArrowUpRight size={14} color={Colors.accent} />;
      default:
        return <DollarSign size={14} color={Colors.textSecondary} />;
    }
  }, []);

  const cardWidth = (width - 48) / 2;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Dashboard</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading live analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Dashboard</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.heroRow}>
          <View style={[styles.heroCard, { backgroundColor: Colors.primary }]}>
            <View style={styles.heroIcon}>
              <Wallet size={20} color={Colors.background} />
            </View>
            <Text style={styles.heroLabel}>Total Invested</Text>
            <Text style={styles.heroValue}>{formatCurrency(stats?.totalInvested ?? 0)}</Text>
            <Text style={styles.heroSub}>Platform-wide AUM</Text>
          </View>
          <View style={[styles.heroCard, { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border }]}>
            <View style={[styles.heroIcon, { backgroundColor: Colors.positive + '20' }]}>
              <TrendingUp size={20} color={Colors.positive} />
            </View>
            <Text style={[styles.heroLabel, { color: Colors.textSecondary }]}>Volume (30d)</Text>
            <Text style={[styles.heroValue, { color: Colors.positive }]}>{formatCurrency(stats?.trends?.volumeLast30d ?? 0)}</Text>
            <Text style={styles.heroSub}>{stats?.trends?.volumeGrowthRate ?? 0}% vs prev</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/members' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.primary + '20' }]}>
              <Users size={18} color={Colors.primary} />
            </View>
            <Text style={styles.statVal}>{stats?.totalMembers ?? 0}</Text>
            <Text style={styles.statLbl}>Total Members</Text>
            <View style={styles.statFooter}>
              <View style={styles.statDot} />
              <Text style={styles.statSub}>{stats?.activeMembers ?? 0} active</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/transactions' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.accent + '20' }]}>
              <ArrowLeftRight size={18} color={Colors.accent} />
            </View>
            <Text style={styles.statVal}>{stats?.totalTransactions ?? 0}</Text>
            <Text style={styles.statLbl}>Transactions</Text>
            <View style={styles.statFooter}>
              <Text style={styles.statSub}>{formatCurrency(stats?.totalVolume ?? 0)} vol</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/properties' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.positive + '20' }]}>
              <Building2 size={18} color={Colors.positive} />
            </View>
            <Text style={styles.statVal}>{stats?.totalProperties ?? 0}</Text>
            <Text style={styles.statLbl}>Properties</Text>
            <View style={styles.statFooter}>
              <View style={[styles.statDot, { backgroundColor: Colors.positive }]} />
              <Text style={styles.statSub}>{stats?.liveProperties ?? 0} live</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/members' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.warning + '20' }]}>
              <Shield size={18} color={Colors.warning} />
            </View>
            <Text style={styles.statVal}>{stats?.pendingKyc ?? 0}</Text>
            <Text style={styles.statLbl}>Pending KYC</Text>
            <View style={styles.statFooter}>
              <Text style={styles.statSub}>{(stats?.totalMembers ?? 0) - (stats?.pendingKyc ?? 0)} verified</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <BarChart3 size={16} color={Colors.primary} />
            <Text style={styles.metricValue}>{formatCurrency(stats?.totalDeposits ?? 0)}</Text>
            <Text style={styles.metricLabel}>Total Deposits</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <ArrowUpRight size={16} color={Colors.negative} />
            <Text style={styles.metricValue}>{formatCurrency(stats?.totalWithdrawals ?? 0)}</Text>
            <Text style={styles.metricLabel}>Withdrawals</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <AlertCircle size={16} color={Colors.warning} />
            <Text style={styles.metricValue}>{stats?.pendingTransactions ?? 0}</Text>
            <Text style={styles.metricLabel}>Pending Tx</Text>
          </View>
        </View>

        {kpis.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <Activity size={16} color={Colors.accent} />
                <Text style={styles.sectionTitleText}>Key Performance Indicators</Text>
              </View>
            </View>
            <View style={styles.kpiGrid}>
              {kpis.map((kpi, idx) => (
                <View key={idx} style={styles.kpiCard}>
                  <Text style={styles.kpiName}>{kpi.name}</Text>
                  <Text style={styles.kpiValue}>
                    {kpi.format === 'currency' ? formatCurrency(kpi.value) :
                     kpi.format === 'percentage' ? `${kpi.value}%` :
                     kpi.value}
                  </Text>
                  {kpi.change !== 0 && (
                    <View style={[styles.kpiChange, kpi.trend === 'up' ? styles.kpiUp : styles.kpiDown]}>
                      <Text style={[styles.kpiChangeText, kpi.trend === 'up' ? styles.kpiUpText : styles.kpiDownText]}>
                        {kpi.change > 0 ? '+' : ''}{kpi.change}%
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {health && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <CheckCircle2 size={16} color={Colors.positive} />
                <Text style={styles.sectionTitleText}>System Health</Text>
              </View>
              <View style={[styles.healthBadge, health.status === 'healthy' ? styles.healthGood : styles.healthBad]}>
                <Text style={styles.healthBadgeText}>{health.status}</Text>
              </View>
            </View>
            <View style={styles.servicesGrid}>
              {health.services.map((svc, idx) => (
                <View key={idx} style={styles.serviceRow}>
                  <View style={[styles.serviceDot, svc.status === 'up' ? styles.serviceUp : styles.serviceDown]} />
                  <Text style={styles.serviceName}>{svc.name}</Text>
                  <Text style={styles.serviceTime}>{svc.responseTime}ms</Text>
                </View>
              ))}
            </View>
            <View style={styles.healthMetrics}>
              <View style={styles.healthMetricItem}>
                <Text style={styles.healthMetricVal}>{health.metrics.activeUsers}</Text>
                <Text style={styles.healthMetricLbl}>Active Users</Text>
              </View>
              <View style={styles.healthMetricItem}>
                <Text style={styles.healthMetricVal}>{health.metrics.transactionsPerHour}</Text>
                <Text style={styles.healthMetricLbl}>Tx/Hour</Text>
              </View>
              <View style={styles.healthMetricItem}>
                <Text style={styles.healthMetricVal}>{health.metrics.errorRate}%</Text>
                <Text style={styles.healthMetricLbl}>Error Rate</Text>
              </View>
              <View style={styles.healthMetricItem}>
                <Text style={styles.healthMetricVal}>{health.metrics.avgResponseTime}ms</Text>
                <Text style={styles.healthMetricLbl}>Avg Response</Text>
              </View>
            </View>
          </View>
        )}

        {retention && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <Users size={16} color={Colors.primary} />
                <Text style={styles.sectionTitleText}>Retention & Engagement</Text>
              </View>
            </View>
            <View style={styles.retentionGrid}>
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>Day 1</Text>
                <Text style={styles.retentionValue}>{retention.retention.day1}%</Text>
              </View>
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>Day 7</Text>
                <Text style={styles.retentionValue}>{retention.retention.day7}%</Text>
              </View>
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>Day 30</Text>
                <Text style={styles.retentionValue}>{retention.retention.day30}%</Text>
              </View>
              <View style={styles.retentionCard}>
                <Text style={styles.retentionLabel}>DAU/MAU</Text>
                <Text style={styles.retentionValue}>{retention.engagement.dauMauRatio}%</Text>
              </View>
            </View>
            <View style={styles.churnRow}>
              <View style={styles.churnItem}>
                <Text style={styles.churnLabel}>Churned Users</Text>
                <Text style={[styles.churnValue, { color: Colors.negative }]}>{retention.churn.churnedUsers}</Text>
              </View>
              <View style={styles.churnItem}>
                <Text style={styles.churnLabel}>Churn Rate</Text>
                <Text style={[styles.churnValue, { color: Colors.negative }]}>{retention.churn.churnRate}%</Text>
              </View>
              <View style={styles.churnItem}>
                <Text style={styles.churnLabel}>At Risk</Text>
                <Text style={[styles.churnValue, { color: Colors.warning }]}>{retention.churn.atRisk}</Text>
              </View>
            </View>
          </View>
        )}

        {investment && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <TrendingUp size={16} color={Colors.positive} />
                <Text style={styles.sectionTitleText}>Investment Analytics (30d)</Text>
              </View>
            </View>
            <View style={styles.investGrid}>
              <View style={styles.investCard}>
                <Text style={styles.investLabel}>Total Investments</Text>
                <Text style={styles.investValue}>{investment.totalInvestments}</Text>
              </View>
              <View style={styles.investCard}>
                <Text style={styles.investLabel}>Volume</Text>
                <Text style={styles.investValue}>{formatCurrency(investment.totalInvestmentVolume)}</Text>
              </View>
              <View style={styles.investCard}>
                <Text style={styles.investLabel}>Avg Investment</Text>
                <Text style={styles.investValue}>{formatCurrency(investment.averageInvestment)}</Text>
              </View>
              <View style={styles.investCard}>
                <Text style={styles.investLabel}>Unique Investors</Text>
                <Text style={styles.investValue}>{investment.uniqueInvestors}</Text>
              </View>
              <View style={styles.investCard}>
                <Text style={styles.investLabel}>Net Flow</Text>
                <Text style={[styles.investValue, { color: investment.netFlow >= 0 ? Colors.positive : Colors.negative }]}>
                  {formatCurrency(investment.netFlow)}
                </Text>
              </View>
              <View style={styles.investCard}>
                <Text style={styles.investLabel}>Dividends Paid</Text>
                <Text style={styles.investValue}>{formatCurrency(investment.totalDividends)}</Text>
              </View>
            </View>
          </View>
        )}

        {pendingKyc.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <Shield size={16} color={Colors.warning} />
                <Text style={styles.sectionTitleText}>Pending KYC</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingKyc.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push('/admin/members' as any)}>
                <Text style={styles.seeAll}>Review All</Text>
              </TouchableOpacity>
            </View>
            {pendingKyc.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={styles.kycRow}
                onPress={() => router.push(`/admin/member/${member.id}` as any)}
              >
                <View style={[styles.kycAvatar, { backgroundColor: Colors.warning + '20' }]}>
                  <Text style={styles.kycInitials}>
                    {member.firstName[0]}{member.lastName[0]}
                  </Text>
                </View>
                <View style={styles.kycInfo}>
                  <Text style={styles.kycName}>{member.firstName} {member.lastName}</Text>
                  <Text style={styles.kycEmail}>{member.email}</Text>
                </View>
                <View style={[
                  styles.kycBadge,
                  member.kycStatus === 'in_review' ? styles.inReview : styles.pendingBadge,
                ]}>
                  <Text style={styles.kycBadgeText}>
                    {member.kycStatus === 'in_review' ? 'In Review' : 'Pending'}
                  </Text>
                </View>
                <ChevronRight size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <Clock size={16} color={Colors.primary} />
              <Text style={styles.sectionTitleText}>Recent Transactions</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/admin/transactions' as any)}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {recentTransactions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No transactions yet</Text>
            </View>
          )}
          {recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={[styles.txIconWrap, {
                backgroundColor: tx.type === 'deposit' ? Colors.positive + '15'
                  : tx.type === 'withdrawal' ? Colors.negative + '15'
                  : tx.type === 'buy' ? Colors.primary + '15'
                  : Colors.accent + '15',
              }]}>
                {getTransactionIcon(tx.type)}
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txUser} numberOfLines={1}>{tx.userId}</Text>
                <Text style={styles.txDesc} numberOfLines={1}>{tx.description || tx.type}</Text>
                <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
              </View>
              <View style={styles.txRight}>
                <Text style={[
                  styles.txAmount,
                  tx.amount > 0 ? { color: Colors.positive } : { color: Colors.negative },
                ]}>
                  {tx.amount > 0 ? '+' : ''}{formatCurrency(Math.abs(tx.amount))}
                </Text>
                <View style={[
                  styles.txStatus,
                  tx.status === 'completed' ? styles.txDone
                    : tx.status === 'pending' ? styles.txPend
                    : styles.txFail,
                ]}>
                  <Text style={styles.txStatusText}>{tx.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.quickLinks}>
          <Text style={styles.quickLinksTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {[
              { label: 'Members', route: '/admin/members', icon: Users, color: Colors.primary },
              { label: 'Transactions', route: '/admin/transactions', icon: ArrowLeftRight, color: Colors.accent },
              { label: 'Properties', route: '/admin/properties', icon: Building2, color: Colors.positive },
              { label: 'Profits', route: '/admin/investor-profits', icon: DollarSign, color: Colors.warning },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <TouchableOpacity
                  key={item.route}
                  style={styles.quickCard}
                  onPress={() => router.push(item.route as any)}
                >
                  <View style={[styles.quickIcon, { backgroundColor: item.color + '20' }]}>
                    <Icon size={20} color={item.color} />
                  </View>
                  <Text style={styles.quickLabel}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.positive + '15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.positive,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.positive,
  },
  scroll: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  heroRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  heroCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
    marginBottom: 4,
  },
  heroValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.background,
    marginBottom: 2,
  },
  heroSub: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.5)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  statCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statVal: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  statLbl: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: 6,
  },
  statFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  statSub: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  metricsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  badge: {
    backgroundColor: Colors.warning + '25',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.warning,
  },
  seeAll: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    width: '48%' as any,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  kpiName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  kpiChange: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kpiUp: {
    backgroundColor: Colors.positive + '20',
  },
  kpiDown: {
    backgroundColor: Colors.negative + '20',
  },
  kpiChangeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  kpiUpText: {
    color: Colors.positive,
  },
  kpiDownText: {
    color: Colors.negative,
  },
  healthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  healthGood: {
    backgroundColor: Colors.positive + '20',
  },
  healthBad: {
    backgroundColor: Colors.negative + '20',
  },
  healthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.positive,
    textTransform: 'capitalize',
  },
  servicesGrid: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serviceUp: {
    backgroundColor: Colors.positive,
  },
  serviceDown: {
    backgroundColor: Colors.negative,
  },
  serviceName: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
    fontWeight: '500',
  },
  serviceTime: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontWeight: '600',
  },
  healthMetrics: {
    flexDirection: 'row',
    marginTop: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  healthMetricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  healthMetricVal: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  healthMetricLbl: {
    fontSize: 9,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  retentionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  retentionCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  retentionLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  retentionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  churnRow: {
    flexDirection: 'row',
    marginTop: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  churnItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  churnLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  churnValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  investGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  investCard: {
    width: '48%' as any,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  investLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  investValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  kycAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kycInitials: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.warning,
  },
  kycInfo: {
    flex: 1,
  },
  kycName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  kycEmail: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  kycBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inReview: {
    backgroundColor: Colors.accent + '20',
  },
  pendingBadge: {
    backgroundColor: Colors.warning + '20',
  },
  kycBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  txIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txInfo: {
    flex: 1,
  },
  txUser: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  txDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  txDate: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  txStatus: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txDone: {
    backgroundColor: Colors.positive + '20',
  },
  txPend: {
    backgroundColor: Colors.warning + '20',
  },
  txFail: {
    backgroundColor: Colors.negative + '20',
  },
  txStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'capitalize',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  quickLinks: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  quickLinksTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bottomPad: {
    height: 100,
  },
});
