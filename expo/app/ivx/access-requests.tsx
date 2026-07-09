/**
 * IVX Enterprise Access Control — Access Requests Screen
 * Shows pending access requests and allows owner to approve/deny.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, ShieldCheck, Check, X, Clock, AlertCircle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';

interface ApprovalRequest {
  id: string;
  requester_id: string;
  requester_email: string | null;
  requester_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  description: string;
  status: string;
  created_at: string;
}

export default function AccessRequestsScreen() {
  const router = useRouter();
  const { currentUser, approveAction, fetchAuditLog } = useEnterpriseAccess();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRequests = useCallback(async () => {
    setRefreshing(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const result = await supabase
        .from('ivx_owner_approvals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setRequests((result.data ?? []) as unknown as ApprovalRequest[]);
    } catch {
      // Table might not exist yet
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void loadRequests(); }, [loadRequests]);

  const handleApprove = useCallback(async (req: ApprovalRequest) => {
    try {
      await approveAction({ requestId: req.id, decision: 'approved' });
      Alert.alert('Approved', 'Request has been approved.');
      void loadRequests();
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [approveAction, loadRequests]);

  const handleDeny = useCallback(async (req: ApprovalRequest) => {
    try {
      await approveAction({ requestId: req.id, decision: 'denied' });
      Alert.alert('Denied', 'Request has been denied.');
      void loadRequests();
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [approveAction, loadRequests]);

  if (!currentUser?.isOwner) {
    return (
      <SafeAreaView style={styles.denied} edges={['top']}>
        <ShieldCheck size={48} color={Colors.error} />
        <Text style={styles.deniedTitle}>Owner Access Required</Text>
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
        <Text style={styles.headerTitle}>Access Requests</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadRequests} tintColor={Colors.gold} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={Colors.gold} style={{ marginTop: 40 }} />
        ) : requests.length === 0 ? (
          <View style={styles.emptyState}>
            <ShieldCheck size={36} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No access requests pending.</Text>
            <Text style={styles.emptySubtext}>
              When staff or admins request approval for dangerous actions, they will appear here.
            </Text>
          </View>
        ) : (
          requests.map((req) => (
            <View key={req.id} style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <View style={[styles.statusBadge,
                  { backgroundColor: req.status === 'pending' ? Colors.warning + '20' :
                    req.status === 'approved' ? Colors.success + '20' : Colors.error + '20' }
                ]}>
                  <Text style={[styles.statusText,
                    { color: req.status === 'pending' ? Colors.warning :
                      req.status === 'approved' ? Colors.success : Colors.error }
                  ]}>{req.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.timestamp}>
                  {new Date(req.created_at).toLocaleString()}
                </Text>
              </View>

              <Text style={styles.requestAction}>{req.action}</Text>
              <Text style={styles.requestDescription}>{req.description}</Text>

              <View style={styles.requestMeta}>
                <Text style={styles.metaLabel}>Requested by:</Text>
                <Text style={styles.metaValue}>{req.requester_email ?? 'unknown'} ({req.requester_role})</Text>
              </View>

              {req.status === 'pending' && (
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleApprove(req)}
                  >
                    <Check size={16} color={Colors.black} />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.denyBtn}
                    onPress={() => handleDeny(req)}
                  >
                    <X size={16} color={Colors.error} />
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
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
  content: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  emptyText: { color: Colors.textTertiary, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: Colors.textTertiary, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  requestCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  requestHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  timestamp: { color: Colors.textTertiary, fontSize: 11 },
  requestAction: { color: Colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  requestDescription: { color: Colors.textSecondary, fontSize: 13, marginBottom: 10 },
  requestMeta: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  metaLabel: { color: Colors.textTertiary, fontSize: 12 },
  metaValue: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  requestActions: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
    justifyContent: 'center', backgroundColor: Colors.gold, paddingVertical: 10, borderRadius: 10,
  },
  approveBtnText: { color: Colors.black, fontSize: 14, fontWeight: '700' },
  denyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
    justifyContent: 'center', paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.error + '40',
  },
  denyBtnText: { color: Colors.error, fontSize: 14, fontWeight: '700' },
});
