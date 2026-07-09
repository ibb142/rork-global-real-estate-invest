/**
 * IVX Enterprise Access Control — Generic Invite Screen
 * Owner/admin can invite any role (admin, investor, buyer, member, realtor, influencer, partner, lender).
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Share, Clipboard, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Mail, Phone, Copy, Share2, Send, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';
import {
  ALL_ENTERPRISE_ROLES, ALL_ENTERPRISE_DEPARTMENTS,
  ROLE_LABELS, ROLE_DESCRIPTIONS, DEPARTMENT_LABELS,
  type EnterpriseRole, type EnterpriseDepartment,
} from '@/constants/enterprise-roles';

export default function InviteRoleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { sendInvite } = useEnterpriseAccess();

  const initialRole = (ALL_ENTERPRISE_ROLES.includes(params.role as EnterpriseRole)
    ? params.role
    : 'member') as EnterpriseRole;

  const [method, setMethod] = useState<'email' | 'sms' | 'link'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<EnterpriseRole>(initialRole);
  const [department, setDepartment] = useState<EnterpriseDepartment>('general');
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleInvite = useCallback(async () => {
    if (method === 'email' && !email.trim()) {
      Alert.alert('Email Required', 'Enter an email address.');
      return;
    }
    if (method === 'sms' && !phone.trim()) {
      Alert.alert('Phone Required', 'Enter a phone number.');
      return;
    }

    setLoading(true);
    try {
      const result = await sendInvite({
        email: method === 'email' ? email.trim() : undefined,
        phone: method === 'sms' ? phone.trim() : undefined,
        role,
        department,
        expiresInHours: 72,
        auditNote: `Invite ${role} from owner`,
      });
      setGeneratedLink(`https://ivxholding.com/register?invite=${result.token}`);
      Alert.alert('Invite Created', `${ROLE_LABELS[role]} invite generated.`);
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [method, email, phone, role, department, sendInvite]);

  const copyLink = useCallback(() => {
    if (!generatedLink) return;
    if (Platform.OS === 'web') navigator.clipboard?.writeText(generatedLink);
    else Clipboard?.setString?.(generatedLink);
    Alert.alert('Copied', 'Link copied to clipboard.');
  }, [generatedLink]);

  const shareLink = useCallback(async () => {
    if (!generatedLink) return;
    try { await Share.share({ message: generatedLink, url: generatedLink }); } catch {}
  }, [generatedLink]);

  const inviteableRoles = ALL_ENTERPRISE_ROLES.filter((r) => r !== 'owner');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite {ROLE_LABELS[role]}</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Select Role</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {inviteableRoles.map((r) => {
              const isActive = role === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleChip, isActive && styles.roleChipActive]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleChipText, isActive && styles.roleChipTextActive]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={styles.roleDescription}>{ROLE_DESCRIPTIONS[role]}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite Method</Text>
          <View style={styles.methodRow}>
            {([
              { key: 'email' as const, label: 'Email', icon: Mail },
              { key: 'sms' as const, label: 'SMS', icon: Phone },
              { key: 'link' as const, label: 'Link', icon: Copy },
            ]).map((m) => {
              const Icon = m.icon;
              const isActive = method === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.methodCard, isActive && styles.methodCardActive]}
                  onPress={() => setMethod(m.key)}
                >
                  <Icon size={20} color={isActive ? Colors.gold : Colors.textSecondary} />
                  <Text style={[styles.methodCardText, isActive && styles.methodCardTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {method === 'email' && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.textInput}
              placeholder="user@example.com"
              placeholderTextColor={Colors.inputPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        )}

        {method === 'sms' && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="+1 (555) 000-0000"
              placeholderTextColor={Colors.inputPlaceholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Department</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ALL_ENTERPRISE_DEPARTMENTS.map((dept) => {
              const isActive = department === dept;
              return (
                <TouchableOpacity
                  key={dept}
                  style={[styles.deptChip, isActive && styles.deptChipActive]}
                  onPress={() => setDepartment(dept)}
                >
                  <Text style={[styles.deptChipText, isActive && styles.deptChipTextActive]}>
                    {DEPARTMENT_LABELS[dept]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity style={styles.sendButton} onPress={handleInvite} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.black} />
          ) : (
            <>
              <Send size={18} color={Colors.black} />
              <Text style={styles.sendButtonText}>
                {method === 'link' ? 'Generate Link' : 'Send Invite'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {generatedLink && (
          <View style={styles.linkResult}>
            <Text style={styles.linkResultLabel}>Invite Link:</Text>
            <Text style={styles.linkText} numberOfLines={2}>{generatedLink}</Text>
            <View style={styles.linkActions}>
              <TouchableOpacity style={styles.linkAction} onPress={copyLink}>
                <Copy size={14} color={Colors.gold} />
                <Text style={styles.linkActionText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkAction} onPress={shareLink}>
                <Share2 size={14} color={Colors.gold} />
                <Text style={styles.linkActionText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.controlCenterLink}
          onPress={() => router.push('/ivx/owner-control-center' as any)}
        >
          <Text style={styles.controlCenterLinkText}>Owner Control Center</Text>
          <ChevronRight size={16} color={Colors.gold} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  methodRow: { flexDirection: 'row', gap: 10 },
  methodCard: {
    flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16, borderRadius: 14,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  methodCardActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + '15' },
  methodCardText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  methodCardTextActive: { color: Colors.gold },
  inputGroup: { marginBottom: 20 },
  inputLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  textInput: {
    backgroundColor: Colors.inputBackground, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 14, color: Colors.text, fontSize: 14, borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  roleChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceLight, marginRight: 8, borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  roleChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  roleChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  roleChipTextActive: { color: Colors.black },
  roleDescription: { color: Colors.textTertiary, fontSize: 12, marginTop: 8 },
  deptChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: Colors.surfaceLight, marginRight: 8, borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  deptChipActive: { backgroundColor: Colors.info + '30', borderColor: Colors.info },
  deptChipText: { color: Colors.textSecondary, fontSize: 11 },
  deptChipTextActive: { color: Colors.info, fontWeight: '700' },
  sendButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, paddingVertical: 16, borderRadius: 14, marginBottom: 16,
  },
  sendButtonText: { color: Colors.black, fontSize: 16, fontWeight: '700' },
  linkResult: {
    padding: 14, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  linkResultLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  linkText: {
    color: Colors.gold, fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  linkActions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  linkAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkActionText: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  controlCenterLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 30,
  },
  controlCenterLinkText: { color: Colors.gold, fontSize: 14, fontWeight: '600' },
});
