import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
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
  XCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  adminStats,
  getRecentTransactions,
  getPendingKycMembers,
  getRecentActivities,
  members,
} from '@/mocks/admin';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);

  const stats = adminStats;
  const recentTransactions = getRecentTransactions(6);
  const pendingKyc = getPendingKycMembers();
  const recentActivities = getRecentActivities(5);

  const totalWalletBalance = members.reduce((sum, m) => sum + m.walletBalance, 0);
  const totalReturns = members.reduce((sum, m) => sum + m.totalReturns, 0);
  const approvedMembers = members.filter(m => m.kycStatus === 'approved').length;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

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

  const getActivityIcon = useCallback((type: string) => {
    switch (type) {
      case 'investment':
        return <TrendingUp size={14} color={Colors.primary} />;
      case 'kyc_update':
        return <Shield size={14} color={Colors.warning} />;
      case 'withdrawal':
        return <ArrowUpRight size={14} color={Colors.negative} />;
      case 'login':
        return <CheckCircle2 size={14} color={Colors.positive} />;
      default:
        return <Activity size={14} color={Colors.textSecondary} />;
    }
  }, []);

  const cardWidth = (width - 48) / 2;

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
            <Text style={styles.heroValue}>{formatCurrency(stats.totalInvested)}</Text>
            <Text style={styles.heroSub}>Platform-wide AUM</Text>
          </View>
          <View style={[styles.heroCard, { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border }]}>
            <View style={[styles.heroIcon, { backgroundColor: Colors.positive + '20' }]}>
              <TrendingUp size={20} color={Colors.positive} />
            </View>
            <Text style={[styles.heroLabel, { color: Colors.textSecondary }]}>Total Returns</Text>
            <Text style={[styles.heroValue, { color: Colors.positive }]}>{formatCurrency(totalReturns)}</Text>
            <Text style={styles.heroSub}>Paid to investors</Text>
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
            <Text style={styles.statVal}>{stats.totalMembers}</Text>
            <Text style={styles.statLbl}>Total Members</Text>
            <View style={styles.statFooter}>
              <View style={styles.statDot} />
              <Text style={styles.statSub}>{stats.activeMembers} active</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/transactions' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.accent + '20' }]}>
              <ArrowLeftRight size={18} color={Colors.accent} />
            </View>
            <Text style={styles.statVal}>{stats.totalTransactions}</Text>
            <Text style={styles.statLbl}>Transactions</Text>
            <View style={styles.statFooter}>
              <Text style={styles.statSub}>{formatCurrency(stats.totalVolume)} vol</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/properties' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.positive + '20' }]}>
              <Building2 size={18} color={Colors.positive} />
            </View>
            <Text style={styles.statVal}>{stats.totalProperties}</Text>
            <Text style={styles.statLbl}>Properties</Text>
            <View style={styles.statFooter}>
              <View style={[styles.statDot, { backgroundColor: Colors.positive }]} />
              <Text style={styles.statSub}>{stats.liveProperties} live</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { width: cardWidth }]}
            onPress={() => router.push('/admin/members' as any)}
          >
            <View style={[styles.statIconWrap, { backgroundColor: Colors.warning + '20' }]}>
              <Shield size={18} color={Colors.warning} />
            </View>
            <Text style={styles.statVal}>{pendingKyc.length}</Text>
            <Text style={styles.statLbl}>Pending KYC</Text>
            <View style={styles.statFooter}>
              <Text style={styles.statSub}>{approvedMembers} verified</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <BarChart3 size={16} color={Colors.primary} />
            <Text style={styles.metricValue}>{formatCurrency(totalWalletBalance)}</Text>
            <Text style={styles.metricLabel}>Wallet Balances</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <CheckCircle2 size={16} color={Colors.positive} />
            <Text style={styles.metricValue}>{approvedMembers}</Text>
            <Text style={styles.metricLabel}>KYC Approved</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <AlertCircle size={16} color={Colors.warning} />
            <Text style={styles.metricValue}>{pendingKyc.length}</Text>
            <Text style={styles.metricLabel}>Needs Review</Text>
          </View>
        </View>

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
                <Text style={styles.txUser} numberOfLines={1}>{tx.userName}</Text>
                <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <Activity size={16} color={Colors.accent} />
              <Text style={styles.sectionTitleText}>Recent Activity</Text>
            </View>
          </View>
          {recentActivities.map((act) => (
            <View key={act.id} style={styles.actRow}>
              <View style={[styles.actIconWrap, { backgroundColor: Colors.card }]}>
                {getActivityIcon(act.type)}
              </View>
              <View style={styles.actInfo}>
                <Text style={styles.actMember}>{act.memberName}</Text>
                <Text style={styles.actDesc} numberOfLines={2}>{act.description}</Text>
              </View>
              <Text style={styles.actDate}>{formatDate(act.createdAt)}</Text>
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
  actRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  actIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    marginTop: 1,
  },
  actInfo: {
    flex: 1,
  },
  actMember: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  actDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  actDate: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
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
