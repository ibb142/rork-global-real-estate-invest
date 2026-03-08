import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Search,
  ChevronRight,
  Shield,
  Ban,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  ArrowLeft,
  Users,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { trpc } from '@/lib/trpc';

type FilterType = 'all' | 'active' | 'pending_kyc' | 'suspended';

interface MemberItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  country: string;
  kycStatus: string;
  status: string;
  walletBalance: number;
  totalInvested: number;
  holdings: number;
  totalTransactions: number;
  lastActivity: string;
  createdAt: string;
}

export default function MembersScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const membersQuery = trpc.members.list.useQuery(
    { page: 1, limit: 100, search: searchQuery || undefined },
    { staleTime: 15000 }
  );

  const statsQuery = trpc.members.getStats.useQuery(undefined, {
    staleTime: 30000,
  });

  const kycMutation = trpc.members.updateKycStatus.useMutation({
    onSuccess: () => {
      void membersQuery.refetch();
      void statsQuery.refetch();
    },
  });

  const suspendMutation = trpc.members.suspend.useMutation({
    onSuccess: () => {
      void membersQuery.refetch();
      void statsQuery.refetch();
    },
  });

  const updateMutation = trpc.members.update.useMutation({
    onSuccess: () => {
      void membersQuery.refetch();
      void statsQuery.refetch();
    },
  });

  const members = useMemo(() => {
    const items = membersQuery.data?.members ?? [];
    let result = items;

    if (filter === 'active') {
      result = result.filter((m) => m.status === 'active' && m.kycStatus === 'approved');
    } else if (filter === 'pending_kyc') {
      result = result.filter(
        (m) => m.kycStatus === 'pending' || m.kycStatus === 'in_review'
      );
    } else if (filter === 'suspended') {
      result = result.filter((m) => m.status === 'suspended');
    }

    return result;
  }, [membersQuery.data?.members, filter]);

  const stats = statsQuery.data;

  const getKycStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={14} color={Colors.positive} />;
      case 'in_review':
        return <Clock size={14} color={Colors.primary} />;
      case 'pending':
        return <AlertCircle size={14} color={Colors.warning} />;
      case 'rejected':
        return <Ban size={14} color={Colors.negative} />;
      default:
        return <Clock size={14} color={Colors.textSecondary} />;
    }
  }, []);

  const getKycStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'approved': return Colors.positive;
      case 'in_review': return Colors.primary;
      case 'pending': return Colors.warning;
      case 'rejected': return Colors.negative;
      default: return Colors.textSecondary;
    }
  }, []);

  const handleMemberAction = useCallback((member: MemberItem, action: 'approve' | 'suspend' | 'activate') => {
    const actionText = action === 'approve' ? 'approve KYC for' : action === 'suspend' ? 'suspend' : 'activate';
    Alert.alert(
      `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      `Are you sure you want to ${actionText} ${member.firstName} ${member.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            if (action === 'approve') {
              kycMutation.mutate({ id: member.id, status: 'approved' });
            } else if (action === 'suspend') {
              suspendMutation.mutate({ id: member.id, reason: 'Admin action' });
            } else if (action === 'activate') {
              updateMutation.mutate({ id: member.id, data: { status: 'active' } });
            }
          },
        },
      ]
    );
  }, [kycMutation, suspendMutation, updateMutation]);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  const keyExtractor = useCallback((item: MemberItem) => item.id, []);

  const renderMember: ListRenderItem<MemberItem> = useCallback(({ item: member }) => (
    <TouchableOpacity
      style={styles.memberCard}
      onPress={() => router.push(`/admin/member/${member.id}` as any)}
    >
      <View style={styles.memberHeader}>
        <View style={styles.avatarPlaceholder}>
          <User size={24} color={Colors.textSecondary} />
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>
            {member.firstName} {member.lastName}
          </Text>
          <Text style={styles.memberEmail}>{member.email}</Text>
          <Text style={styles.memberCountry}>{member.country}</Text>
        </View>
        <ChevronRight size={20} color={Colors.textSecondary} />
      </View>

      <View style={styles.memberStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Invested</Text>
          <Text style={styles.statValue}>
            {formatCurrency(member.totalInvested)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Balance</Text>
          <Text style={styles.statValue}>
            {formatCurrency(member.walletBalance)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Holdings</Text>
          <Text style={styles.statValue}>{member.holdings}</Text>
        </View>
      </View>

      <View style={styles.memberFooter}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.kycBadge,
              { backgroundColor: getKycStatusColor(member.kycStatus) + '20' },
            ]}
          >
            {getKycStatusIcon(member.kycStatus)}
            <Text
              style={[
                styles.kycText,
                { color: getKycStatusColor(member.kycStatus) },
              ]}
            >
              KYC: {member.kycStatus.replace('_', ' ')}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              member.status === 'active'
                ? styles.statusActive
                : member.status === 'suspended'
                ? styles.statusSuspended
                : styles.statusInactive,
            ]}
          >
            <Text style={styles.statusText}>{member.status}</Text>
          </View>
        </View>
        <Text style={styles.joinDate}>Joined {formatDate(member.createdAt)}</Text>
      </View>

      <View style={styles.actions}>
        {(member.kycStatus === 'pending' || member.kycStatus === 'in_review') && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => handleMemberAction(member, 'approve')}
          >
            <Shield size={14} color={Colors.positive} />
            <Text style={[styles.actionBtnText, { color: Colors.positive }]}>
              Approve KYC
            </Text>
          </TouchableOpacity>
        )}
        {member.status === 'active' ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.suspendBtn]}
            onPress={() => handleMemberAction(member, 'suspend')}
          >
            <Ban size={14} color={Colors.negative} />
            <Text style={[styles.actionBtnText, { color: Colors.negative }]}>
              Suspend
            </Text>
          </TouchableOpacity>
        ) : member.status === 'suspended' ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.activateBtn]}
            onPress={() => handleMemberAction(member, 'activate')}
          >
            <CheckCircle size={14} color={Colors.positive} />
            <Text style={[styles.actionBtnText, { color: Colors.positive }]}>
              Activate
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  ), [formatCurrency, formatDate, getKycStatusColor, getKycStatusIcon, handleMemberAction, router]);

  const handleRefresh = useCallback(() => {
    void membersQuery.refetch();
    void statsQuery.refetch();
  }, [membersQuery, statsQuery]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Members</Text>
          <Text style={styles.subtitle}>
            {stats
              ? `${stats.totalMembers} total · ${stats.activeMembers} active · ${stats.pendingKyc} pending KYC`
              : `${membersQuery.data?.total ?? 0} total members`}
          </Text>
        </View>
      </View>

      {stats && (
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatNum}>{stats.newMembersToday}</Text>
            <Text style={styles.quickStatLabel}>Today</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatNum}>{stats.newMembersThisWeek}</Text>
            <Text style={styles.quickStatLabel}>This Week</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatNum}>{stats.newMembersThisMonth}</Text>
            <Text style={styles.quickStatLabel}>This Month</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={[styles.quickStatNum, { color: Colors.warning }]}>{stats.pendingKyc}</Text>
            <Text style={styles.quickStatLabel}>Pending KYC</Text>
          </View>
        </View>
      )}

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Search size={20} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search members..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'pending_kyc', label: 'Pending KYC' },
          { key: 'suspended', label: 'Suspended' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key as FilterType)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {membersQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading members...</Text>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconWrap}>
            <Users size={48} color={Colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No members found' : 'No registered members yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery
              ? 'Try a different search term'
              : 'New member registrations will appear here automatically'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={keyExtractor}
          renderItem={renderMember}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl
              refreshing={membersQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  quickStats: {
    flexDirection: 'row' as const,
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center' as const,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  quickStatNum: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  quickStatLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '600' as const,
  },
  quickStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 15,
    color: Colors.text,
  },
  filterContainer: {
    maxHeight: 44,
    marginBottom: 12,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.black,
  },
  list: {
    flex: 1,
    paddingHorizontal: 20,
  },
  memberCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  memberHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.background,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  memberEmail: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  memberCountry: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  memberStats: {
    flexDirection: 'row' as const,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  memberFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  kycBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  kycText: {
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: Colors.positive + '20',
  },
  statusSuspended: {
    backgroundColor: Colors.negative + '20',
  },
  statusInactive: {
    backgroundColor: Colors.textTertiary + '20',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.text,
    textTransform: 'capitalize' as const,
  },
  joinDate: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  approveBtn: {
    backgroundColor: Colors.positive + '15',
  },
  suspendBtn: {
    backgroundColor: Colors.negative + '15',
  },
  activateBtn: {
    backgroundColor: Colors.positive + '15',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  listContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.card,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
});
