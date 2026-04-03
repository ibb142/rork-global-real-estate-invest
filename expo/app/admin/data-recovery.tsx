import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Database,
  ArchiveRestore,
  Shield,
  Clock,
  Trash2,
  Download,
  Search,
  HardDrive,
  CheckCircle,
  XCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDeletedItems,
  getBackups,
  getRecoveryStats,
  restoreDeletedItem,
  createFullBackup,
  restoreFromBackup,
  type DataSnapshot,
  type BackupRecord,
  type RecoverableEntity,
} from '@/lib/data-recovery';

type TabType = 'deleted' | 'backups';

const ENTITY_LABELS: Record<string, string> = {
  jv_deals: 'JV Deal',
  transactions: 'Transaction',
  holdings: 'Holding',
  properties: 'Property',
  wallets: 'Wallet',
  profiles: 'Profile',
  notifications: 'Notification',
};

export default function DataRecoveryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('deleted');
  const [searchQuery, setSearchQuery] = useState('');
  const [backupNote, setBackupNote] = useState('');

  const statsQuery = useQuery({
    queryKey: ['data-recovery-stats'],
    queryFn: async () => {
      console.log('[DataRecovery] Fetching stats...');
      const stats = await getRecoveryStats();
      console.log('[DataRecovery] Stats:', stats);
      return stats;
    },
    staleTime: 1000 * 10,
  });

  const deletedQuery = useQuery({
    queryKey: ['deleted-items'],
    queryFn: async () => {
      console.log('[DataRecovery] Fetching deleted items...');
      const items = await getDeletedItems({ limit: 200 });
      console.log('[DataRecovery] Found', items.length, 'deleted items');
      return items;
    },
    staleTime: 1000 * 10,
  });

  const backupsQuery = useQuery({
    queryKey: ['data-backups'],
    queryFn: async () => {
      console.log('[DataRecovery] Fetching backups...');
      const backups = await getBackups();
      console.log('[DataRecovery] Found', backups.length, 'backups');
      return backups;
    },
    staleTime: 1000 * 10,
  });

  const restoreMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      console.log('[DataRecovery] Restoring item:', snapshotId);
      const result = await restoreDeletedItem(snapshotId);
      if (!result.success) throw new Error(result.error || 'Restore failed');
      return result;
    },
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Restored', 'Item has been successfully restored to the database.');
    },
    onError: (err: Error) => {
      Alert.alert('Restore Failed', err.message);
    },
  });

  const backupMutation = useMutation({
    mutationFn: async (params: { entityType: RecoverableEntity | 'all'; note?: string }) => {
      console.log('[DataRecovery] Creating backup:', params.entityType);
      const result = await createFullBackup(params.entityType, params.note);
      if (!result.success) throw new Error(result.error || 'Backup failed');
      return result;
    },
    onSuccess: (result) => {
      invalidateAll();
      setBackupNote('');
      Alert.alert('Backup Created', `Backed up ${result.backup?.entityCount || 0} records successfully.`);
    },
    onError: (err: Error) => {
      Alert.alert('Backup Failed', err.message);
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      console.log('[DataRecovery] Restoring from backup:', backupId);
      const result = await restoreFromBackup(backupId);
      if (!result.success && result.errors.length > 0) {
        throw new Error(`Restored ${result.restoredCount} items. Errors: ${result.errors.join(', ')}`);
      }
      return result;
    },
    onSuccess: (result) => {
      invalidateAll();
      Alert.alert('Backup Restored', `Successfully restored ${result.restoredCount} records.`);
    },
    onError: (err: Error) => {
      Alert.alert('Restore Result', err.message);
    },
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['data-recovery-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['deleted-items'] });
    void queryClient.invalidateQueries({ queryKey: ['data-backups'] });
    void queryClient.invalidateQueries({ queryKey: ['jvAgreements.list'] });
    void queryClient.invalidateQueries({ queryKey: ['jv-deals'] });
    void queryClient.invalidateQueries({ queryKey: ['published-jv-deals'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-transactions'] });
  }, [queryClient]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      statsQuery.refetch(),
      deletedQuery.refetch(),
      backupsQuery.refetch(),
    ]).finally(() => setRefreshing(false));
  }, [statsQuery, deletedQuery, backupsQuery]);

  const filteredDeleted = useMemo(() => {
    let items = deletedQuery.data ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.entityTitle || '').toLowerCase().includes(q) ||
        (i.entityId || '').toLowerCase().includes(q) ||
        (i.entityType || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [deletedQuery.data, searchQuery]);

  const handleRestore = useCallback((item: DataSnapshot) => {
    Alert.alert(
      'Restore Item',
      `Restore "${item.entityTitle}" (${ENTITY_LABELS[item.entityType] || item.entityType}) back to the database?\n\nThis will re-insert the data as it was before deletion.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => restoreMutation.mutate(item.id),
        },
      ]
    );
  }, [restoreMutation]);

  const handleCreateBackup = useCallback((entityType: RecoverableEntity | 'all') => {
    Alert.alert(
      'Create Backup',
      `Create a full backup of ${entityType === 'all' ? 'ALL data' : entityType}?\n\nThis will save a snapshot of current data that can be restored later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Backup',
          onPress: () => backupMutation.mutate({ entityType, note: backupNote || undefined }),
        },
      ]
    );
  }, [backupMutation, backupNote]);

  const handleRestoreBackup = useCallback((backup: BackupRecord) => {
    Alert.alert(
      'Restore Backup',
      `Restore backup from ${formatDate(backup.createdAt)}?\n\nThis will re-insert ${backup.entityCount} records. Existing records with the same ID will be updated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore All',
          style: 'destructive',
          onPress: () => restoreBackupMutation.mutate(backup.id),
        },
      ]
    );
  }, [restoreBackupMutation]);

  const stats = statsQuery.data;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="recovery-back">
            <ArrowLeft size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Database size={18} color="#22C55E" />
            <Text style={styles.headerTitle}>Data Recovery</Text>
          </View>
          <View style={styles.headerRight}>
            <Shield size={18} color={Colors.primary} />
          </View>
        </View>

        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#FF4D4D' }]}>{stats.deletedItemsCount}</Text>
              <Text style={styles.statLabel}>Deleted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#22C55E' }]}>{stats.restorableCount}</Text>
              <Text style={styles.statLabel}>Restorable</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#4A90D9' }]}>{stats.backupsCount}</Text>
              <Text style={styles.statLabel}>Backups</Text>
            </View>
          </View>
        )}

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'deleted' && styles.tabActive]}
            onPress={() => setActiveTab('deleted')}
          >
            <Trash2 size={14} color={activeTab === 'deleted' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'deleted' && styles.tabTextActive]}>
              Deleted Items ({filteredDeleted.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'backups' && styles.tabActive]}
            onPress={() => setActiveTab('backups')}
          >
            <HardDrive size={14} color={activeTab === 'backups' ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'backups' && styles.tabTextActive]}>
              Backups ({backupsQuery.data?.length || 0})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {activeTab === 'deleted' && (
            <>
              <View style={styles.searchWrap}>
                <Search size={16} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search deleted items..."
                  placeholderTextColor={Colors.textTertiary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  testID="recovery-search"
                />
              </View>

              {deletedQuery.isLoading ? (
                <View style={styles.centerWrap}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.centerText}>Loading deleted items...</Text>
                </View>
              ) : filteredDeleted.length === 0 ? (
                <View style={styles.centerWrap}>
                  <CheckCircle size={48} color="#22C55E" />
                  <Text style={styles.emptyTitle}>No Deleted Items</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery ? 'No items match your search' : 'All data is safe. Deleted items will appear here for recovery.'}
                  </Text>
                </View>
              ) : (
                filteredDeleted.map(item => (
                  <View key={item.id} style={[styles.itemCard, item.restored && styles.itemCardRestored]} testID={`deleted-${item.id}`}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemTitleWrap}>
                        <Text style={styles.itemTitle} numberOfLines={1}>{item.entityTitle}</Text>
                        <View style={styles.itemBadges}>
                          <View style={styles.entityBadge}>
                            <Text style={styles.entityBadgeText}>{ENTITY_LABELS[item.entityType] || item.entityType}</Text>
                          </View>
                          {item.restored ? (
                            <View style={[styles.statusBadge, { backgroundColor: '#22C55E18' }]}>
                              <CheckCircle size={10} color="#22C55E" />
                              <Text style={[styles.statusBadgeText, { color: '#22C55E' }]}>Restored</Text>
                            </View>
                          ) : (
                            <View style={[styles.statusBadge, { backgroundColor: '#FF4D4D18' }]}>
                              <XCircle size={10} color="#FF4D4D" />
                              <Text style={[styles.statusBadgeText, { color: '#FF4D4D' }]}>Deleted</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    <View style={styles.itemMeta}>
                      <View style={styles.metaRow}>
                        <Clock size={10} color={Colors.textTertiary} />
                        <Text style={styles.metaText}>Deleted: {formatDate(item.deletedAt)}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Shield size={10} color={Colors.textTertiary} />
                        <Text style={styles.metaText}>By: {item.deletedByRole} ({item.deletedBy.substring(0, 8)}...)</Text>
                      </View>
                      {item.restoredAt && (
                        <View style={styles.metaRow}>
                          <ArchiveRestore size={10} color="#22C55E" />
                          <Text style={[styles.metaText, { color: '#22C55E' }]}>Restored: {formatDate(item.restoredAt)}</Text>
                        </View>
                      )}
                    </View>

                    {!item.restored && (
                      <TouchableOpacity
                        style={styles.restoreBtn}
                        onPress={() => handleRestore(item)}
                        disabled={restoreMutation.isPending}
                        testID={`restore-${item.id}`}
                      >
                        {restoreMutation.isPending ? (
                          <ActivityIndicator size="small" color="#22C55E" />
                        ) : (
                          <>
                            <ArchiveRestore size={15} color="#22C55E" />
                            <Text style={styles.restoreBtnText}>Restore to Database</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === 'backups' && (
            <>
              <View style={styles.backupActions}>
                <TextInput
                  style={styles.backupNoteInput}
                  placeholder="Backup note (optional)..."
                  placeholderTextColor={Colors.textTertiary}
                  value={backupNote}
                  onChangeText={setBackupNote}
                />
                <View style={styles.backupBtnsRow}>
                  <TouchableOpacity
                    style={styles.backupBtn}
                    onPress={() => handleCreateBackup('all')}
                    disabled={backupMutation.isPending}
                  >
                    {backupMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Download size={15} color="#fff" />
                        <Text style={styles.backupBtnText}>Backup ALL Data</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.backupBtn, { backgroundColor: '#4A90D9' }]}
                    onPress={() => handleCreateBackup('jv_deals')}
                    disabled={backupMutation.isPending}
                  >
                    <Download size={15} color="#fff" />
                    <Text style={styles.backupBtnText}>JV Deals Only</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {backupsQuery.isLoading ? (
                <View style={styles.centerWrap}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.centerText}>Loading backups...</Text>
                </View>
              ) : (backupsQuery.data ?? []).length === 0 ? (
                <View style={styles.centerWrap}>
                  <HardDrive size={48} color={Colors.textTertiary} />
                  <Text style={styles.emptyTitle}>No Backups Yet</Text>
                  <Text style={styles.emptySubtitle}>Create your first backup to protect your data.</Text>
                </View>
              ) : (
                (backupsQuery.data ?? []).map(backup => (
                  <View key={backup.id} style={styles.backupCard} testID={`backup-${backup.id}`}>
                    <View style={styles.backupHeader}>
                      <View style={styles.backupIconWrap}>
                        <HardDrive size={18} color="#4A90D9" />
                      </View>
                      <View style={styles.backupInfo}>
                        <Text style={styles.backupTitle}>
                          {backup.entityType === 'all' ? 'Full Backup' : `${ENTITY_LABELS[backup.entityType] || backup.entityType} Backup`}
                        </Text>
                        <Text style={styles.backupMeta}>{backup.entityCount} records | {formatDate(backup.createdAt)}</Text>
                        {backup.note && <Text style={styles.backupNote}>{backup.note}</Text>}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.restoreBackupBtn}
                      onPress={() => handleRestoreBackup(backup)}
                      disabled={restoreBackupMutation.isPending}
                    >
                      {restoreBackupMutation.isPending ? (
                        <ActivityIndicator size="small" color="#FFD700" />
                      ) : (
                        <>
                          <ArchiveRestore size={15} color="#FFD700" />
                          <Text style={styles.restoreBackupBtnText}>Restore This Backup</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  headerRight: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
    marginTop: 2,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.primary + '18',
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  centerText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    marginTop: 8,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FF4D4D25',
    borderLeftWidth: 3,
    borderLeftColor: '#FF4D4D50',
  },
  itemCardRestored: {
    borderColor: '#22C55E25',
    borderLeftColor: '#22C55E50',
    opacity: 0.7,
  },
  itemHeader: {
    marginBottom: 8,
  },
  itemTitleWrap: {
    gap: 6,
  },
  itemTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  itemBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  entityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Colors.backgroundSecondary,
  },
  entityBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  itemMeta: {
    gap: 4,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: Colors.textTertiary,
    fontSize: 11,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#22C55E15',
    borderWidth: 1,
    borderColor: '#22C55E30',
  },
  restoreBtnText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  backupActions: {
    marginHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  backupNoteInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  backupBtnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  backupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#22C55E',
  },
  backupBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  backupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4A90D925',
    borderLeftWidth: 3,
    borderLeftColor: '#4A90D950',
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backupIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#4A90D915',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backupInfo: {
    flex: 1,
  },
  backupTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  backupMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
  },
  backupNote: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontStyle: 'italic' as const,
    marginTop: 3,
  },
  restoreBackupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#FFD70015',
    borderWidth: 1,
    borderColor: '#FFD70030',
  },
  restoreBackupBtnText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '700' as const,
  },
});
