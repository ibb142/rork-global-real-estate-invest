/**
 * IVX Enterprise Access Control — Registration with Invite Token
 * Validates an invite token, assigns role/department, and redirects to the correct dashboard.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Shield, Check, Mail, Lock, User, Phone, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useEnterpriseAccess } from '@/lib/enterprise-access-context';
import { useAuth } from '@/lib/auth-context';
import { ROLE_LABELS, DEPARTMENT_LABELS, type EnterpriseRole, type EnterpriseDepartment } from '@/constants/enterprise-roles';

export default function EnterpriseRegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invite?: string; role?: string; department?: string }>();
  const { acceptInvite, currentUser } = useEnterpriseAccess();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteValidated, setInviteValidated] = useState(false);
  const [inviteRole, setInviteRole] = useState<EnterpriseRole | null>(null);
  const [inviteDepartment, setInviteDepartment] = useState<EnterpriseDepartment | null>(null);
  const navigationDoneRef = useRef(false);

  // If already authenticated, try to accept the invite immediately
  useEffect(() => {
    const inviteToken = typeof params.invite === 'string' ? params.invite : null;
    if (!isAuthenticated || !inviteToken || navigationDoneRef.current) return;
    navigationDoneRef.current = true;
    void (async () => {
      try {
        const result = await acceptInvite(inviteToken);
        Alert.alert(
          'Welcome to IVX',
          `You have been assigned the role of ${ROLE_LABELS[result.role]} in ${DEPARTMENT_LABELS[result.department]}.`,
          [{ text: 'Continue', onPress: () => router.replace('/ivx/role-dashboard' as any) }],
        );
      } catch (error) {
        Alert.alert('Invite Failed', error instanceof Error ? error.message : 'Could not accept invite.');
      }
    })();
  }, [isAuthenticated, params.invite, acceptInvite, router]);

  const handleRegister = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Email and password are required.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      // Sign up via Supabase
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            role: inviteRole ?? 'member',
          },
        },
      });

      if (error) throw error;

      // Create profile
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: email.trim().toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          role: inviteRole ?? 'member',
        });
      }

      // Accept invite if present
      if (params.invite && data.user) {
        try {
          await acceptInvite(params.invite);
        } catch (inviteError) {
          console.log('[EnterpriseRegister] Invite acceptance failed:', inviteError);
        }
      }

      Alert.alert(
        'Registration Complete',
        inviteRole
          ? `You have been registered as ${ROLE_LABELS[inviteRole]}. Please check your email to confirm your account.`
          : 'Your account has been created. Please check your email to confirm.',
        [{ text: 'Continue', onPress: () => router.replace('/login' as any) }],
      );
    } catch (error) {
      Alert.alert('Registration Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [email, password, firstName, lastName, phone, inviteRole, params.invite, acceptInvite, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enterprise Registration</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {params.invite && (
          <View style={styles.inviteBanner}>
            <Shield size={20} color={Colors.gold} />
            <View style={styles.inviteBannerInfo}>
              <Text style={styles.inviteBannerTitle}>Invite Token Detected</Text>
              <Text style={styles.inviteBannerText}>
                {inviteRole
                  ? `Role: ${ROLE_LABELS[inviteRole]} · ${inviteDepartment ? DEPARTMENT_LABELS[inviteDepartment] : ''}`
                  : 'Your role will be assigned after registration.'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>First Name</Text>
          <View style={styles.inputContainer}>
            <User size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="John"
              placeholderTextColor={Colors.inputPlaceholder}
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Last Name</Text>
          <View style={styles.inputContainer}>
            <User size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="Doe"
              placeholderTextColor={Colors.inputPlaceholder}
              value={lastName}
              onChangeText={setLastName}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.inputContainer}>
            <Mail size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.inputPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Phone (optional)</Text>
          <View style={styles.inputContainer}>
            <Phone size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="+1 (555) 000-0000"
              placeholderTextColor={Colors.inputPlaceholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputContainer}>
            <Lock size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.inputPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        </View>

        <View style={styles.securityNote}>
          <Shield size={14} color={Colors.info} />
          <Text style={styles.securityNoteText}>
            By registering, you agree to IVX enterprise security policies. All actions are audit-logged.
            Your role and permissions are controlled by the Owner.
          </Text>
        </View>

        <TouchableOpacity style={styles.registerButton} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.black} />
          ) : (
            <>
              <Check size={18} color={Colors.black} />
              <Text style={styles.registerButtonText}>Complete Registration</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => router.push('/login' as any)}
        >
          <Text style={styles.loginLinkText}>Already have an account? Sign in</Text>
          <ChevronRight size={14} color={Colors.gold} />
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
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingBottom: 40 },
  inviteBanner: {
    flexDirection: 'row', gap: 12, padding: 14, backgroundColor: Colors.gold + '15',
    borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: Colors.gold + '30',
  },
  inviteBannerInfo: { flex: 1 },
  inviteBannerTitle: { color: Colors.gold, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  inviteBannerText: { color: Colors.textSecondary, fontSize: 12 },
  formGroup: { marginBottom: 16 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    paddingVertical: 14, backgroundColor: Colors.inputBackground, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.inputBorder,
  },
  input: { flex: 1, color: Colors.text, fontSize: 14 },
  securityNote: {
    flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.info + '15',
    borderRadius: 10, marginBottom: 20,
  },
  securityNoteText: { color: Colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  registerButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, paddingVertical: 16, borderRadius: 14, marginBottom: 16,
  },
  registerButtonText: { color: Colors.black, fontSize: 16, fontWeight: '700' },
  loginLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 12,
  },
  loginLinkText: { color: Colors.gold, fontSize: 14, fontWeight: '600' },
});
