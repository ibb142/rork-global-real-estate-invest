import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Users,
  UserCheck,
  UserX,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  ShieldCheck,
  ShieldX,
  BarChart3,
  RefreshCw,
  Calendar,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { fetchWaitlistStats, fetchWaitlistEntries, type WaitlistEntry } from '@/lib/waitlist-service';
import { exportCSV } from '@/lib/csv-export';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'removed', label: 'Removed' },
];

function StatCard({ icon: Icon, iconColor, label, value, subtitle }: {
  icon: React.ComponentType<{ size: number; color: string }>;
  iconColor: string;
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <View style={cardStyles.statCard}>
      <View style={[cardStyles.statIcon, { backgroundColor: iconColor + '15' }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <Text style={cardStyles.statValue}>{value}</Text>
      <Text style={cardStyles.statLabel}>{label}</Text>
      {subtitle ? <Text style={cardStyles.statSub}>{subtitle}</Text> : null}
    </View>
  );
}

function EntryCard({ entry }: { entry: WaitlistEntry }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateStr; }
  };

  const statusColor = entry.status === 'verified' ? '#22C55E'
    : entry.status === 'contacted' ? '#3B82F6'
    : entry.status === 'removed' ? '#EF4444'
    : Colors.warning;

  return (
    <TouchableOpacity
      style={cardStyles.entryCard}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={cardStyles.entryTop}>
        <View style={cardStyles.entryLeft}>
          <Text style={cardStyles.entryName}>{entry.full_name || '—'}</Text>
          <View style={cardStyles.entryMeta}>
            <Mail size={11} color={Colors.textTertiary} />
            <Text style={cardStyles.entryMetaText}>{entry.email || '—'}</Text>
          </View>
          <View style={cardStyles.entryMeta}>
            <Phone size={11} color={Colors.textTertiary} />
            <Text style={cardStyles.entryMetaText}>{entry.phone_e164 || entry.phone || '—'}</Text>
          </View>
        </View>
        <View style={cardStyles.entryRight}>
          <View style={[cardStyles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={[cardStyles.statusText, { color: statusColor }]}>{entry.status}</Text>
          </View>
          {entry.phone_verified ? (
            <ShieldCheck size={14} color="#22C55E" />
          ) : (
            <ShieldX size={14} color={Colors.textTertiary} />
          )}
          <Text style={cardStyles.entryDate}>{formatDate(entry.created_at)}</Text>
        </View>
      </View>

      {expanded && (
        <View style={cardStyles.entryExpanded}>
          <View style={cardStyles.detailRow}>
            <Text style={cardStyles.detailLabel}>Accredited</Text>
            <Text style={cardStyles.detailValue}>{entry.accredited_status || '—'}</Text>
          </View>
          <View style={cardStyles.detailRow}>
            <Text style={cardStyles.detailLabel}>Source</Text>
            <Text style={cardStyles.detailValue}>{entry.source || '—'}</Text>
          </View>
          {entry.utm_source ? (
            <View style={cardStyles.detailRow}>
              <Text style={cardStyles.detailLabel}>UTM Source</Text>
              <Text style={cardStyles.detailValue}>{entry.utm_source}</Text>
            </View>
          ) : null}
          {entry.utm_campaign ? (
            <View style={cardStyles.detailRow}>
              <Text style={cardStyles.detailLabel}>UTM Campaign</Text>
              <Text style={cardStyles.detailValue}>{entry.utm_campaign}</Text>
            </View>
          ) : null}
          <View style={cardStyles.detailRow}>
            <Text style={cardStyles.detailLabel}>Phone Verified</Text>
            <Text style={[cardStyles.detailValue, { color: entry.phone_verified ? '#22C55E' : Colors.error }]}>
              {entry.phone_verified ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={cardStyles.detailRow}>
            <Text style={cardStyles.detailLabel}>Submitted</Text>
            <Text style={cardStyles.detailValue}>{formatDate(entry.submitted_at)}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function WaitlistAdminScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const statsQuery = useQuery({
    queryKey: ['waitlist-admin-stats'],
    queryFn: fetchWaitlistStats,
    staleTime: 15000,
  });

  const entriesQuery = useQuery({
    queryKey: ['waitlist-admin-entries', searchText, statusFilter],
    queryFn: () => fetchWaitlistEntries({ search: searchText, status: statusFilter, limit: 100 }),
    staleTime: 10000,
  });

  const stats = statsQuery.data ?? { total: 0, today: 0, verified: 0, unverified: 0, topCampaigns: [] };
  const entries = entriesQuery.data?.entries ?? [];
  const totalEntries = entriesQuery.data?.total ?? 0;

  const handleRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void queryClient.invalidateQueries({ queryKey: ['waitlist-admin-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['waitlist-admin-entries'] });
  }, [queryClient]);

  const handleExportCSV = useCallback(async () => {
    const currentEntries = entriesQuery.data?.entries ?? [];
    if (currentEntries.length === 0) {
      Alert.alert('No Data', 'No waitlist entries to export.');
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const headers = [
      'Created At', 'Full Name', 'Email', 'Phone', 'Phone Verified',
      'Accredited Status', 'Source', 'UTM Source', 'UTM Campaign', 'Status',
    ];
    const rows = currentEntries.map(e => [
      e.created_at, e.full_name, e.email, e.phone_e164 || e.phone,
      e.phone_verified ? 'Yes' : 'No', e.accredited_status || '',
      e.source, e.utm_source || '', e.utm_campaign || '', e.status,
    ]);

    const count = rows.length;
    const success = await exportCSV(headers, rows, `waitlist_export_${Date.now()}`);
    if (success) {
      Alert.alert('Export Complete', `Exported ${count} entries.`);
    }
  }, [entriesQuery.data?.entries]);

  const debouncedSearch = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout>;
    return (text: string) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setSearchText(text), 400);
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Users size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Waitlist Admin</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <RefreshCw size={18} color={statsQuery.isFetching ? Colors.textTertiary : Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={statsQuery.isFetching && entriesQuery.isFetching}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.statsGrid}>
          <StatCard icon={Users} iconColor={Colors.primary} label="Total" value={stats.total} />
          <StatCard icon={Calendar} iconColor="#22C55E" label="Today" value={stats.today} />
          <StatCard icon={UserCheck} iconColor="#3B82F6" label="Verified" value={stats.verified} />
          <StatCard icon={UserX} iconColor={Colors.error} label="Unverified" value={stats.unverified} />
        </View>

        {stats.topCampaigns.length > 0 && (
          <View style={styles.campaignsCard}>
            <View style={styles.campaignsHeader}>
              <BarChart3 size={16} color={Colors.primary} />
              <Text style={styles.campaignsTitle}>Top Campaigns</Text>
            </View>
            {stats.topCampaigns.map((c, i) => (
              <View key={c.campaign} style={styles.campaignRow}>
                <Text style={styles.campaignRank}>#{i + 1}</Text>
                <View style={styles.campaignInfo}>
                  <Text style={styles.campaignName}>{c.campaign}</Text>
                  <View style={styles.campaignBar}>
                    <View style={[styles.campaignBarFill, {
                      width: `${Math.min(100, (c.count / Math.max(stats.topCampaigns[0]?.count ?? 1, 1)) * 100)}%`,
                    }]} />
                  </View>
                </View>
                <Text style={styles.campaignCount}>{c.count}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Search size={16} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, email, or phone..."
              placeholderTextColor={Colors.inputPlaceholder}
              onChangeText={debouncedSearch}
              autoCapitalize="none"
              autoCorrect={false}
              testID="waitlist-admin-search"
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.filterBtn}
              onPress={() => setShowFilters(!showFilters)}
              activeOpacity={0.7}
            >
              <Filter size={14} color={Colors.primary} />
              <Text style={styles.filterBtnText}>
                {statusFilter === 'all' ? 'Filter' : statusFilter}
              </Text>
              {showFilters ? <ChevronUp size={14} color={Colors.textSecondary} /> : <ChevronDown size={14} color={Colors.textSecondary} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.exportBtn}
              onPress={handleExportCSV}
              activeOpacity={0.7}
            >
              <Download size={14} color="#22C55E" />
              <Text style={styles.exportBtnText}>Export CSV</Text>
            </TouchableOpacity>
          </View>

          {showFilters && (
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
                  onPress={() => { setStatusFilter(f.value); setShowFilters(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, statusFilter === f.value && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.entriesHeader}>
          <Text style={styles.entriesTitle}>Entries</Text>
          <Text style={styles.entriesCount}>{totalEntries} total</Text>
        </View>

        {entriesQuery.isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading entries...</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Users size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Entries Found</Text>
            <Text style={styles.emptyText}>
              {searchText || statusFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Waitlist submissions will appear here.'}
            </Text>
          </View>
        ) : (
          entries.map((entry) => (
            <EntryCard key={entry.id || entry.email} entry={entry} />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const cardStyles = StyleSheet.create({
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    minWidth: 80,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  statSub: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  entryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  entryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryLeft: {
    flex: 1,
    gap: 4,
  },
  entryRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  entryName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  entryMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  entryDate: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  entryExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500' as const,
  },
  detailValue: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600' as const,
  },
});

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
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  campaignsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  campaignsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  campaignsTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  campaignRank: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
    width: 24,
  },
  campaignInfo: {
    flex: 1,
    gap: 4,
  },
  campaignName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  campaignBar: {
    height: 4,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 2,
  },
  campaignBarFill: {
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  campaignCount: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
    width: 30,
    textAlign: 'right' as const,
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
    height: 44,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
    textTransform: 'capitalize' as const,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#22C55E12',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#22C55E30',
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#22C55E',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  entriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  entriesTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  entriesCount: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500' as const,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
    paddingHorizontal: 40,
    lineHeight: 19,
  },
});
