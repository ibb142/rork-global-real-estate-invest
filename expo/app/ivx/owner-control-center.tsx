/**
 * IVX Enterprise Access Control — Owner Control Center
 * The central hub where the Owner manages users, roles, invites, approvals, and audit logs.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  Share,
  Clipboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Crown,
  Users,
  Mail,
  Shield,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Lock,
  Unlock,
  Trash2,
  Check,
  X,
  ChevronRight,
  ArrowLeft,
  Search,
  Clock,
  AlertCircle,
  CheckCircle2,
  Ban,
  LogOut,
  KeyRound,
  FileText,
  Settings,
  Bell,
  Copy,
  Share2,
  Phone,
  Send,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';
import {
  ALL_ENTERPRISE_ROLES,
  ALL_ENTERPRISE_DEPARTMENTS,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_HIERARCHY_LEVELS,
  DEPARTMENT_LABELS,
  type EnterpriseRole,
  type EnterpriseDepartment,
  type InviteRecord,
  type UserAccessRecord,
} from '@/constants/enterprise-roles';

interface UserRow {
  user_id: string;
  role: string;
  department: string;
  status: string;
  assigned_by: string | null;
  assigned_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
}

export default function OwnerControlCenterScreen() {
  const router = useRouter();
  const {
    currentUser,
    loading,
    fetchInvites,
    sendInvite,
    revokeInvite,
    assignRole,
    revokeRole,
    suspendUser,
    forceLogout,
    fetchAuditLog,
    requestApproval,
    approveAction,
  } = useEnterpriseAccess();

  const [activeTab, setActiveTab] = useState<'users' | 'invites' | 'approvals' | 'audit'>('users');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [suspendModalVisible, setSuspendModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<EnterpriseRole>('staff');
  const [inviteDepartment, setInviteDepartment] = useState<EnterpriseDepartment>('operations');
  const [inviteMethod, setInviteMethod] = useState<'email' | 'sms' | 'link'>('email');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  // Data
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditEntries, setAuditEntries] = useState<unknown[]>([]);
  const [approvals, setApprovals] = useState<unknown[]>([]);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [invitesData, auditData] = await Promise.all([
        fetchInvites().catch(() => [] as InviteRecord[]),
        fetchAuditLog(50).catch(() => []),
      ]);
      setInvites(invitesData);
      setAuditEntries(auditData);

      // Fetch users via /me endpoint
      try {
        const token = await getAuthToken();
        const response = await fetch('/api/ivx/access/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (response.ok) {
          const data = await response.json() as { users?: UserRow[] };
          setUsers(data.users ?? []);
        }
      } catch {}

      // Fetch approval requests
      try {
        const token = await getAuthToken();
        const response = await fetch('/api/ivx/access/request-approval', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (response.ok) {
          const data = await response.json() as { requests?: unknown[] };
          setApprovals(data.requests ?? []);
        }
      } catch {}
    } finally {
      setRefreshing(false);
    }
  }, [fetchInvites, fetchAuditLog]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter((u) =>
      u.user_id.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  const filteredInvites = useMemo(() => {
    if (!searchQuery.trim()) return invites;
    const q = searchQuery.toLowerCase();
    return invites.filter((i) =>
      (i.email ?? '').toLowerCase().includes(q) ||
      (i.phone ?? '').toLowerCase().includes(q) ||
      i.role.toLowerCase().includes(q),
    );
  }, [invites, searchQuery]);

  const handleSendInvite = useCallback(async () => {
    if (inviteMethod === 'email' && !inviteEmail.trim()) {
      Alert.alert('Email Required', 'Enter an email address to send the invite.');
      return;
    }
    if (inviteMethod === 'sms' && !invitePhone.trim()) {
      Alert.alert('Phone Required', 'Enter a phone number to send the invite.');
      return;
    }

    setInviteLoading(true);
    try {
      const result = await sendInvite({
        email: inviteMethod === 'email' ? inviteEmail.trim() : undefined,
        phone: inviteMethod === 'sms' ? invitePhone.trim() : undefined,
        role: inviteRole,
        department: inviteDepartment,
        expiresInHours: 72,
        auditNote: `Invited by owner via ${inviteMethod}`,
      });
      setLastInviteLink(result.token);
      Alert.alert(
        'Invite Created',
        `Invite link generated for ${ROLE_LABELS[inviteRole]}.\nToken: ${result.token.slice(0, 8)}...`,
        [
          { text: 'Copy Link', onPress: () => copyInviteLink(result.token) },
          { text: 'Share', onPress: () => shareInviteLink(result.token) },
          { text: 'Done', onPress: () => setInviteModalVisible(false) },
        ],
      );
      setInviteEmail('');
      setInvitePhone('');
      void loadData();
    } catch (error) {
      Alert.alert('Invite Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setInviteLoading(false);
    }
  }, [inviteMethod, inviteEmail, invitePhone, inviteRole, inviteDepartment, sendInvite, loadData]);

  const copyInviteLink = useCallback((token: string) => {
    const link = `https://ivxholding.com/register?invite=${token}`;
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(link);
    } else {
      Clipboard?.setString?.(link);
    }
    Alert.alert('Copied', 'Invite link copied to clipboard.');
  }, []);

  const shareInviteLink = useCallback(async (token: string) => {
    const link = `https://ivxholding.com/register?invite=${token}`;
    try {
      await Share.share({ message: link, url: link });
    } catch {}
  }, []);

  const handleSuspendUser = useCallback(async () => {
    if (!selectedUser || !suspendReason.trim()) {
      Alert.alert('Reason Required', 'Enter a reason for suspending this user.');
      return;
    }
    try {
      await suspendUser({ userId: selectedUser.user_id, reason: suspendReason.trim() });
      Alert.alert('User Suspended', 'The user has been suspended and can no longer access the system.');
      setSuspendModalVisible(false);
      setSelectedUser(null);
      setSuspendReason('');
      void loadData();
    } catch (error) {
      Alert.alert('Suspend Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [selectedUser, suspendReason, suspendUser, loadData]);

  const handleForceLogout = useCallback((user: UserRow) => {
    Alert.alert(
      'Force Logout',
      `Force logout this ${user.role}? They will be signed out of all devices immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Force Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await forceLogout(user.user_id);
              Alert.alert('Done', 'All sessions revoked for this user.');
              void loadData();
            } catch (error) {
              Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
            }
          },
        },
      ],
    );
  }, [forceLogout, loadData]);

  const handleRevokeRole = useCallback((user: UserRow) => {
    Alert.alert(
      'Revoke Role',
      `Revoke ${user.role} role? This will reset the user to member with basic access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeRole(user.user_id);
              Alert.alert('Done', 'Role revoked. User reset to member.');
              void loadData();
            } catch (error) {
              Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
            }
          },
        },
      ],
    );
  }, [revokeRole, loadData]);

  const handleRevokeInvite = useCallback((inviteId: string) => {
    Alert.alert('Revoke Invite', 'Revoke this invite? The link will no longer work.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeInvite(inviteId);
            Alert.alert('Done', 'Invite revoked.');
            void loadData();
          } catch (error) {
            Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
          }
        },
      },
    ]);
  }, [revokeInvite, loadData]);

  if (loading && !currentUser) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.gold} />
        <Text style={styles.loadingText}>Loading Owner Control Center…</Text>
      </SafeAreaView>
    );
  }

  if (!currentUser?.isOwner) {
    return (
      <SafeAreaView style={styles.deniedContainer} edges={['top']}>
        <Shield size={48} color={Colors.error} />
        <Text style={styles.deniedTitle}>Owner Access Required</Text>
        <Text style={styles.deniedText}>
          This control center is restricted to the IVX Owner account.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={Colors.text} />
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Crown size={20} color={Colors.gold} />
          <Text style={styles.headerTitle}>Owner Control Center</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Role Badge */}
      <View style={styles.roleBadgeContainer}>
        <View style={styles.roleBadge}>
          <Crown size={14} color={Colors.gold} />
          <Text style={styles.roleBadgeText}>OWNER — Level 100</Text>
        </View>
        <Text style={styles.roleBadgeEmail}>{currentUser.email}</Text>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'users', label: 'Users', icon: Users },
          { key: 'invites', label: 'Invites', icon: Mail },
          { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
          { key: 'audit', label: 'Audit Log', icon: FileText },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Icon size={16} color={isActive ? Colors.gold : Colors.textSecondary} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by email, role, department…"
          placeholderTextColor={Colors.inputPlaceholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={Colors.gold} />}
      >
        {activeTab === 'users' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All Users ({filteredUsers.length})</Text>
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={() => setInviteModalVisible(true)}
              >
                <UserPlus size={16} color={Colors.black} />
                <Text style={styles.inviteButtonText}>Invite</Text>
              </TouchableOpacity>
            </View>

            {filteredUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <Users size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No users found. Invite your first team member.</Text>
              </View>
            ) : (
              filteredUsers.map((user) => (
                <UserCard
                  key={user.user_id}
                  user={user}
                  onSuspend={() => {
                    setSelectedUser(user);
                    setSuspendModalVisible(true);
                  }}
                  onForceLogout={() => handleForceLogout(user)}
                  onRevokeRole={() => handleRevokeRole(user)}
                />
              ))
            )}
          </View>
        )}

        {activeTab === 'invites' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Invites ({filteredInvites.length})</Text>
              <TouchableOpacity
                style={styles.inviteButton}
                onPress={() => setInviteModalVisible(true)}
              >
                <UserPlus size={16} color={Colors.black} />
                <Text style={styles.inviteButtonText}>New Invite</Text>
              </TouchableOpacity>
            </View>

            {filteredInvites.length === 0 ? (
              <View style={styles.emptyState}>
                <Mail size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No invites yet. Create one to onboard your team.</Text>
              </View>
            ) : (
              filteredInvites.map((invite) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  onRevoke={() => handleRevokeInvite(invite.id)}
                  onCopyLink={() => copyInviteLink(invite.token)}
                  onShareLink={() => shareInviteLink(invite.token)}
                />
              ))
            )}
          </View>
        )}

        {activeTab === 'approvals' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Approval Requests</Text>
            {approvals.length === 0 ? (
              <View style={styles.emptyState}>
                <ShieldCheck size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No pending approval requests.</Text>
              </View>
            ) : (
              <Text style={styles.comingSoon}>Approval requests will appear here when staff request dangerous actions.</Text>
            )}
          </View>
        )}

        {activeTab === 'audit' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audit Log ({auditEntries.length})</Text>
            {auditEntries.length === 0 ? (
              <View style={styles.emptyState}>
                <FileText size={32} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>No audit entries yet. Actions will be logged here.</Text>
              </View>
            ) : (
              (auditEntries as Array<Record<string, unknown>>).map((entry, i) => (
                <AuditEntryCard key={(entry.id as string) ?? i} entry={entry} />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Invite Modal */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Team Member</Text>
              <TouchableOpacity onPress={() => setInviteModalVisible(false)}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Method selector */}
            <View style={styles.methodSelector}>
              {([
                { key: 'email' as const, label: 'Email', icon: Mail },
                { key: 'sms' as const, label: 'SMS', icon: Phone },
                { key: 'link' as const, label: 'Copy Link', icon: Copy },
              ]).map((method) => {
                const Icon = method.icon;
                const isActive = inviteMethod === method.key;
                return (
                  <TouchableOpacity
                    key={method.key}
                    style={[styles.methodButton, isActive && styles.methodButtonActive]}
                    onPress={() => setInviteMethod(method.key)}
                  >
                    <Icon size={16} color={isActive ? Colors.gold : Colors.textSecondary} />
                    <Text style={[styles.methodText, isActive && styles.methodTextActive]}>
                      {method.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {inviteMethod === 'email' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="team@ivxholding.com"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            )}

            {inviteMethod === 'sms' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor={Colors.inputPlaceholder}
                  value={invitePhone}
                  onChangeText={setInvitePhone}
                  keyboardType="phone-pad"
                />
              </View>
            )}

            {/* Role selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Role</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
                {ALL_ENTERPRISE_ROLES.filter((r) => r !== 'owner').map((role) => {
                  const isActive = inviteRole === role;
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[styles.roleChip, isActive && styles.roleChipActive]}
                      onPress={() => setInviteRole(role)}
                    >
                      <Text style={[styles.roleChipText, isActive && styles.roleChipTextActive]}>
                        {ROLE_LABELS[role]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <Text style={styles.roleDescription}>{ROLE_DESCRIPTIONS[inviteRole]}</Text>
            </View>

            {/* Department selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
                {ALL_ENTERPRISE_DEPARTMENTS.map((dept) => {
                  const isActive = inviteDepartment === dept;
                  return (
                    <TouchableOpacity
                      key={dept}
                      style={[styles.deptChip, isActive && styles.deptChipActive]}
                      onPress={() => setInviteDepartment(dept)}
                    >
                      <Text style={[styles.deptChipText, isActive && styles.deptChipTextActive]}>
                        {DEPARTMENT_LABELS[dept]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity
              style={styles.sendInviteButton}
              onPress={handleSendInvite}
              disabled={inviteLoading}
            >
              {inviteLoading ? (
                <ActivityIndicator size="small" color={Colors.black} />
              ) : (
                <>
                  <Send size={18} color={Colors.black} />
                  <Text style={styles.sendInviteButtonText}>
                    {inviteMethod === 'link' ? 'Generate Link' : 'Send Invite'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {lastInviteLink && (
              <View style={styles.linkResult}>
                <Text style={styles.linkResultLabel}>Invite Link:</Text>
                <Text style={styles.linkResultText} numberOfLines={1}>
                  https://ivxholding.com/register?invite={lastInviteLink.slice(0, 12)}…
                </Text>
                <View style={styles.linkActions}>
                  <TouchableOpacity onPress={() => copyInviteLink(lastInviteLink)} style={styles.linkAction}>
                    <Copy size={14} color={Colors.gold} />
                    <Text style={styles.linkActionText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => shareInviteLink(lastInviteLink)} style={styles.linkAction}>
                    <Share2 size={14} color={Colors.gold} />
                    <Text style={styles.linkActionText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Suspend Modal */}
      <Modal visible={suspendModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Suspend User</Text>
              <TouchableOpacity onPress={() => { setSuspendModalVisible(false); setSelectedUser(null); setSuspendReason(''); }}>
                <X size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {selectedUser && (
              <View style={styles.suspendUserInfo}>
                <Ban size={20} color={Colors.error} />
                <Text style={styles.suspendUserText}>
                  Suspend {ROLE_LABELS[selectedUser.role as EnterpriseRole] ?? selectedUser.role} in{' '}
                  {DEPARTMENT_LABELS[selectedUser.department as EnterpriseDepartment] ?? selectedUser.department}
                </Text>
              </View>
            )}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reason for Suspension</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Explain why this user is being suspended…"
                placeholderTextColor={Colors.inputPlaceholder}
                value={suspendReason}
                onChangeText={setSuspendReason}
                multiline
                numberOfLines={3}
              />
            </View>
            <TouchableOpacity style={styles.suspendButton} onPress={handleSuspendUser}>
              <Ban size={18} color={Colors.white} />
              <Text style={styles.suspendButtonText}>Confirm Suspension</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

async function getAuthToken(): Promise<string | null> {
  const { supabase } = await import('@/lib/supabase');
  const result = await supabase.auth.getSession();
  return result.data.session?.access_token ?? null;
}

// ── Sub-components ──

function UserCard({
  user,
  onSuspend,
  onForceLogout,
  onRevokeRole,
}: {
  user: UserRow;
  onSuspend: () => void;
  onForceLogout: () => void;
  onRevokeRole: () => void;
}) {
  const isOwnerRole = user.role === 'owner';
  const isSuspended = user.status === 'suspended';

  return (
    <View style={styles.userCard}>
      <View style={styles.userCardHeader}>
        <View style={styles.userAvatar}>
          <Users size={18} color={isOwnerRole ? Colors.gold : Colors.textSecondary} />
        </View>
        <View style={styles.userCardInfo}>
          <Text style={styles.userCardId} numberOfLines={1}>
            {user.user_id.slice(0, 8)}…
          </Text>
          <View style={styles.userCardBadges}>
            <View style={[styles.roleTag, isOwnerRole && styles.roleTagOwner]}>
              <Text style={[styles.roleTagText, isOwnerRole && styles.roleTagTextOwner]}>
                {ROLE_LABELS[user.role as EnterpriseRole] ?? user.role}
              </Text>
            </View>
            <View style={[styles.deptTag, isSuspended && styles.deptTagSuspended]}>
              <Text style={[styles.deptTagText, isSuspended && styles.deptTagTextSuspended]}>
                {isSuspended ? 'SUSPENDED' : DEPARTMENT_LABELS[user.department as EnterpriseDepartment] ?? user.department}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {!isOwnerRole && (
        <View style={styles.userCardActions}>
          <TouchableOpacity style={styles.actionButtonDanger} onPress={onSuspend}>
            <Ban size={14} color={Colors.error} />
            <Text style={styles.actionButtonTextDanger}>Suspend</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButtonDanger} onPress={onForceLogout}>
            <LogOut size={14} color={Colors.error} />
            <Text style={styles.actionButtonTextDanger}>Force Logout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButtonDanger} onPress={onRevokeRole}>
            <UserMinus size={14} color={Colors.error} />
            <Text style={styles.actionButtonTextDanger}>Revoke Role</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOwnerRole && (
        <View style={styles.ownerProtectedBadge}>
          <Crown size={12} color={Colors.gold} />
          <Text style={styles.ownerProtectedText}>Protected — Owner cannot be modified</Text>
        </View>
      )}
    </View>
  );
}

function InviteCard({
  invite,
  onRevoke,
  onCopyLink,
  onShareLink,
}: {
  invite: InviteRecord;
  onRevoke: () => void;
  onCopyLink: () => void;
  onShareLink: () => void;
}) {
  const isExpired = invite.status === 'expired' || (invite.status === 'pending' && new Date(invite.expires_at) < new Date());
  const statusColor = invite.status === 'accepted' ? Colors.success : isExpired ? Colors.warning : invite.status === 'revoked' ? Colors.error : Colors.info;

  return (
    <View style={styles.inviteCard}>
      <View style={styles.inviteCardHeader}>
        <View style={styles.inviteMethodInfo}>
          {invite.email ? <Mail size={16} color={Colors.textSecondary} /> : invite.phone ? <Phone size={16} color={Colors.textSecondary} /> : <Copy size={16} color={Colors.textSecondary} />}
          <Text style={styles.inviteContactText} numberOfLines={1}>
            {invite.email ?? invite.phone ?? 'Link only'}
          </Text>
        </View>
        <View style={[styles.inviteStatusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.inviteStatusText, { color: statusColor }]}>
            {isExpired ? 'EXPIRED' : invite.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.inviteCardDetails}>
        <View style={styles.inviteDetailRow}>
          <Text style={styles.inviteDetailLabel}>Role:</Text>
          <Text style={styles.inviteDetailValue}>{ROLE_LABELS[invite.role]}</Text>
        </View>
        <View style={styles.inviteDetailRow}>
          <Text style={styles.inviteDetailLabel}>Department:</Text>
          <Text style={styles.inviteDetailValue}>{DEPARTMENT_LABELS[invite.department]}</Text>
        </View>
        <View style={styles.inviteDetailRow}>
          <Text style={styles.inviteDetailLabel}>Expires:</Text>
          <Text style={styles.inviteDetailValue}>
            {new Date(invite.expires_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {invite.status === 'pending' && !isExpired && (
        <View style={styles.inviteCardActions}>
          <TouchableOpacity style={styles.inviteAction} onPress={onCopyLink}>
            <Copy size={14} color={Colors.gold} />
            <Text style={styles.inviteActionText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inviteAction} onPress={onShareLink}>
            <Share2 size={14} color={Colors.gold} />
            <Text style={styles.inviteActionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.inviteAction, styles.inviteActionDanger]} onPress={onRevoke}>
            <Trash2 size={14} color={Colors.error} />
            <Text style={styles.inviteActionTextDanger}>Revoke</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function AuditEntryCard({ entry }: { entry: Record<string, unknown> }) {
  const action = (entry.action as string) ?? 'UNKNOWN';
  const actorEmail = (entry.actor_email as string) ?? 'unknown';
  const actorRole = (entry.actor_role as string) ?? 'member';
  const details = (entry.details as string) ?? '';
  const createdAt = (entry.created_at as string) ?? '';
  const targetEmail = (entry.target_email as string) ?? null;

  const actionColor = action.includes('SUSPEND') || action.includes('REVOKE') || action.includes('DENIED')
    ? Colors.error
    : action.includes('APPROVED') || action.includes('ACCEPTED') || action.includes('GRANTED')
      ? Colors.success
      : action.includes('CREATED') || action.includes('INVITED')
        ? Colors.info
        : Colors.textSecondary;

  return (
    <View style={styles.auditCard}>
      <View style={styles.auditCardHeader}>
        <View style={[styles.auditActionBadge, { backgroundColor: actionColor + '20' }]}>
          <Text style={[styles.auditActionText, { color: actionColor }]}>{action}</Text>
        </View>
        <Text style={styles.auditTimestamp}>
          {createdAt ? new Date(createdAt).toLocaleString() : ''}
        </Text>
      </View>
      <Text style={styles.auditActor}>
        {actorEmail} ({actorRole})
      </Text>
      {targetEmail && <Text style={styles.auditTarget}>→ {targetEmail}</Text>}
      {details ? <Text style={styles.auditDetails}>{details}</Text> : null}
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  deniedTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  deniedText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  backButtonText: {
    color: Colors.text,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  roleBadgeContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gold + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleBadgeText: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  roleBadgeEmail: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.gold + '20',
    borderWidth: 1,
    borderColor: Colors.gold + '40',
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.gold,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  inviteButtonText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: 14,
    textAlign: 'center',
  },
  comingSoon: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // User card
  userCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  userCardHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userCardInfo: {
    flex: 1,
    gap: 4,
  },
  userCardId: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  userCardBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  roleTag: {
    backgroundColor: Colors.info + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleTagText: {
    color: Colors.info,
    fontSize: 11,
    fontWeight: '600',
  },
  roleTagOwner: {
    backgroundColor: Colors.gold + '20',
  },
  roleTagTextOwner: {
    color: Colors.gold,
  },
  deptTag: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  deptTagText: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  deptTagSuspended: {
    backgroundColor: Colors.error + '20',
  },
  deptTagTextSuspended: {
    color: Colors.error,
    fontWeight: '700',
  },
  userCardActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error + '40',
  },
  actionButtonTextDanger: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '600',
  },
  ownerProtectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  ownerProtectedText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '600',
  },
  // Invite card
  inviteCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  inviteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  inviteMethodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  inviteContactText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  inviteStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  inviteStatusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  inviteCardDetails: {
    gap: 4,
    marginBottom: 10,
  },
  inviteDetailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteDetailLabel: {
    color: Colors.textTertiary,
    fontSize: 12,
    minWidth: 80,
  },
  inviteDetailValue: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  inviteCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.gold + '15',
  },
  inviteActionText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '600',
  },
  inviteActionDanger: {
    backgroundColor: Colors.error + '10',
  },
  inviteActionTextDanger: {
    color: Colors.error,
  },
  // Audit card
  auditCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  auditCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  auditActionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  auditActionText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  auditTimestamp: {
    color: Colors.textTertiary,
    fontSize: 11,
  },
  auditActor: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  auditTarget: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  auditDetails: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  methodButtonActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.gold + '15',
  },
  methodText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  methodTextActive: {
    color: Colors.gold,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  textArea: {
    minHeight: 60,
  },
  roleScroll: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  roleChipActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  roleChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: Colors.black,
  },
  roleDescription: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 8,
  },
  deptChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  deptChipActive: {
    backgroundColor: Colors.info + '30',
    borderColor: Colors.info,
  },
  deptChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  deptChipTextActive: {
    color: Colors.info,
    fontWeight: '700',
  },
  sendInviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    paddingVertical: 14,
    borderRadius: 12,
  },
  sendInviteButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '700',
  },
  linkResult: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  linkResultLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  linkResultText: {
    color: Colors.gold,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  linkActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  linkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkActionText: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '600',
  },
  suspendUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.error + '15',
    borderRadius: 10,
  },
  suspendUserText: {
    color: Colors.text,
    fontSize: 14,
    flex: 1,
  },
  suspendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.error,
    paddingVertical: 14,
    borderRadius: 12,
  },
  suspendButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
