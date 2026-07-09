/**
 * IVX Enterprise Access Control — User Permissions Screen
 * Shows the RBAC permission matrix for all roles.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Shield, Check, X, Lock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';
import {
  ALL_ENTERPRISE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS,
  ROLE_HIERARCHY_LEVELS, ROLE_DEFINITIONS,
  type EnterpriseRole,
} from '@/constants/enterprise-roles';

export default function UserPermissionsScreen() {
  const router = useRouter();
  const { currentUser, fetchPermissions } = useEnterpriseAccess();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPermissions = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPermissions();
    } catch {
      // Ignore — we use static matrix
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPermissions]);

  React.useEffect(() => { void loadPermissions(); }, [loadPermissions]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permission Matrix</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadPermissions} tintColor={Colors.gold} />}
      >
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Check size={14} color={Colors.success} />
            <Text style={styles.legendText}>Allowed</Text>
          </View>
          <View style={styles.legendItem}>
            <X size={14} color={Colors.textTertiary} />
            <Text style={styles.legendText}>Denied</Text>
          </View>
          <View style={styles.legendItem}>
            <Lock size={14} color={Colors.warning} />
            <Text style={styles.legendText}>Needs Owner Approval</Text>
          </View>
        </View>

        {ALL_ENTERPRISE_ROLES.map((role) => {
          const def = ROLE_DEFINITIONS[role];
          const isCurrentRole = currentUser?.role === role;
          return (
            <View
              key={role}
              style={[styles.roleCard, isCurrentRole && styles.roleCardCurrent]}
            >
              <View style={styles.roleCardHeader}>
                <View style={styles.roleTitleRow}>
                  <Shield size={18} color={role === 'owner' ? Colors.gold : Colors.info} />
                  <Text style={styles.roleName}>{ROLE_LABELS[role]}</Text>
                  {isCurrentRole && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>YOU</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.hierarchyLevel}>Level {ROLE_HIERARCHY_LEVELS[role]}</Text>
              </View>

              <Text style={styles.roleDesc}>{ROLE_DESCRIPTIONS[role]}</Text>

              <View style={styles.capabilities}>
                <CapabilityRow label="Can Invite" enabled={def.canInvite} />
                <CapabilityRow label="Can Deploy" enabled={def.canDeploy} />
                <CapabilityRow label="Can Manage Money" enabled={def.canManageMoney} />
                <CapabilityRow label="Can Access Secrets" enabled={def.canAccessSecrets} />
                <CapabilityRow
                  label="Requires Owner Approval"
                  enabled={def.requiresOwnerApproval}
                  isWarning
                />
              </View>

              <View style={styles.permissionsSection}>
                <Text style={styles.permissionsTitle}>Module Permissions ({def.permissions.length})</Text>
                {def.permissions.map((perm, i) => (
                  <View key={i} style={styles.permissionRow}>
                    <Text style={styles.permissionModule}>{perm.module}</Text>
                    <View style={styles.permissionActions}>
                      {perm.actions.map((action, j) => (
                        <View key={j} style={styles.actionTag}>
                          <Text style={styles.actionTagText}>{action}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.securityNote}>
          <Lock size={16} color={Colors.warning} />
          <Text style={styles.securityNoteText}>
            Security Rules: Owner cannot be deleted or downgraded. Staff cannot create another owner.
            Admin cannot override owner. Every sensitive action is logged.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CapabilityRow({ label, enabled, isWarning }: { label: string; enabled: boolean; isWarning?: boolean }) {
  return (
    <View style={styles.capabilityRow}>
      {isWarning ? (
        enabled ? <Lock size={14} color={Colors.warning} /> : <Check size={14} color={Colors.success} />
      ) : (
        enabled ? <Check size={14} color={Colors.success} /> : <X size={14} color={Colors.textTertiary} />
      )}
      <Text style={[styles.capabilityText, !enabled && !isWarning && styles.capabilityTextDisabled]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 30 },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 16, paddingVertical: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { color: Colors.textSecondary, fontSize: 12 },
  roleCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  roleCardCurrent: { borderColor: Colors.gold, borderWidth: 2 },
  roleCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  roleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleName: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  currentBadge: {
    backgroundColor: Colors.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  currentBadgeText: { color: Colors.black, fontSize: 9, fontWeight: '800' },
  hierarchyLevel: { color: Colors.textTertiary, fontSize: 12 },
  roleDesc: { color: Colors.textSecondary, fontSize: 13, marginBottom: 12 },
  capabilities: { gap: 6, marginBottom: 12 },
  capabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capabilityText: { color: Colors.text, fontSize: 13 },
  capabilityTextDisabled: { color: Colors.textTertiary },
  permissionsSection: { borderTopWidth: 1, borderTopColor: Colors.surfaceBorder, paddingTop: 10 },
  permissionsTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  permissionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBorder,
  },
  permissionModule: { color: Colors.text, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  permissionActions: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: 180 },
  actionTag: { backgroundColor: Colors.surfaceLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  actionTagText: { color: Colors.textSecondary, fontSize: 10 },
  securityNote: {
    flexDirection: 'row', gap: 10, padding: 14, backgroundColor: Colors.warning + '15',
    borderRadius: 12, marginTop: 8,
  },
  securityNoteText: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
});
