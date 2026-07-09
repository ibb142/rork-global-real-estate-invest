/**
 * IVX Enterprise Access Control — Enterprise Audit Log Screen
 * Shows all audit entries with filtering by action type.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, Search, Filter, Shield, Ban, LogOut } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';

interface AuditEntry {
  id: string;
  actor_id: string;
  actor_email: string | null;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_email: string | null;
  details: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  ROLE_ASSIGNED: Colors.info,
  ROLE_REVOKED: Colors.error,
  USER_SUSPENDED: Colors.error,
  FORCE_LOGOUT: Colors.error,
  INVITE_CREATED: Colors.info,
  INVITE_ACCEPTED: Colors.success,
  INVITE_REVOKED: Colors.error,
  APPROVAL_REQUESTED: Colors.warning,
  APPROVAL_GRANTED: Colors.success,
  APPROVAL_DENIED: Colors.error,
};

export default function EnterpriseAuditLogScreen() {
  const router = useRouter();
  const { currentUser, fetchAuditLog } = useEnterpriseAccess();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchAuditLog(100);
      setEntries(data as unknown as AuditEntry[]);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchAuditLog]);

  React.useEffect(() => { void loadEntries(); }, [loadEntries]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filterAction) {
      result = result.filter((e) => e.action === filterAction);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) =>
        (e.actor_email ?? '').toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.target_email ?? '').toLowerCase().includes(q) ||
        (e.details ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, filterAction, searchQuery]);

  const uniqueActions = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.action))).sort();
  }, [entries]);

  if (!currentUser?.isPrivileged) {
    return (
      <SafeAreaView style={styles.denied} edges={['top']}>
        <Shield size={48} color={Colors.error} />
        <Text style={styles.deniedTitle}>Privileged Access Required</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={Colors.text} />
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enterprise Audit Log</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textSecondary} />
        <input style={styles.searchInput as any}
          placeholder="Search audit entries…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </View>

      {uniqueActions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !filterAction && styles.filterChipActive]}
            onPress={() => setFilterAction(null)}
          >
            <Text style={[styles.filterChipText, !filterAction && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {uniqueActions.map((action) => {
            const isActive = filterAction === action;
            return (
              <TouchableOpacity
                key={action}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilterAction(isActive ? null : action)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{action}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadEntries} tintColor={Colors.gold} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={Colors.gold} style={{ marginTop: 40 }} />
        ) : filteredEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={36} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No audit entries found.</Text>
            <Text style={styles.emptySubtext}>Every sensitive action in IVX is logged here for accountability.</Text>
          </View>
        ) : (
          filteredEntries.map((entry) => {
            const actionColor = ACTION_COLORS[entry.action] ?? Colors.textSecondary;
            return (
              <View key={entry.id} style={styles.auditCard}>
                <View style={styles.auditHeader}>
                  <View style={[styles.actionBadge, { backgroundColor: actionColor + '20' }]}>
                    <Text style={[styles.actionText, { color: actionColor }]}>{entry.action}</Text>
                  </View>
                  <Text style={styles.timestamp}>
                    {new Date(entry.created_at).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.actor}>
                  {entry.actor_email ?? 'unknown'} ({entry.actor_role})
                </Text>
                {entry.target_email && (
                  <Text style={styles.target}>→ {entry.target_email}</Text>
                )}
                {entry.details && <Text style={styles.details}>{entry.details}</Text>}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  denied: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  deniedTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  backBtnText: { color: Colors.text, fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.inputBackground, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, backgroundColor: 'transparent', borderWidth: 0, outline: 'none' },
  filterRow: { paddingHorizontal: 16, marginBottom: 8, maxHeight: 40 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: Colors.surfaceLight, marginRight: 8, borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterChipText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600' },
  filterChipTextActive: { color: Colors.black },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 30 },
  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyText: { color: Colors.textTertiary, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: Colors.textTertiary, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  auditCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  auditHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  timestamp: { color: Colors.textTertiary, fontSize: 11 },
  actor: { color: Colors.text, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  target: { color: Colors.textSecondary, fontSize: 12, marginBottom: 2 },
  details: { color: Colors.textTertiary, fontSize: 12 },
});
