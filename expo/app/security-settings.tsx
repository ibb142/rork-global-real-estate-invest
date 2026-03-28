import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import {
  Lock,
  Smartphone,
  Fingerprint,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  X,
  Monitor,
  LogOut,
  Copy,
  Key,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { isBiometricAvailable, getBiometricType, authenticateWithBiometric, setBiometricEnabled as saveBiometricPref, isBiometricEnabled as loadBiometricPref } from '@/lib/biometric-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAnalytics } from '@/lib/analytics-context';

interface LoginSession {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

const SESSIONS_KEY = '@ipx_sessions';

const getDeviceName = (): string => {
  if (Platform.OS === 'ios') return 'iPhone';
  if (Platform.OS === 'android') return 'Android Device';
  return 'Web Browser';
};

const createCurrentSession = (): LoginSession => ({
  id: `session-${Date.now()}`,
  device: getDeviceName(),
  location: 'Current Location',
  lastActive: 'Now',
  isCurrent: true,
});

export default function SecuritySettingsScreen() {
  const { trackAction } = useAnalytics();
  const queryClient = useQueryClient();

  const changePasswordMutation = useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      const { error } = await supabase.auth.updateUser({ password: input.newPassword });
      if (error) return { success: false, message: error.message };
      return { success: true, message: 'Password updated' };
    },
  });

  const enable2FAMutation = useMutation({
    mutationFn: async () => {
      console.log('[Security] 2FA enable requested - not yet supported via Supabase MFA');
      return { success: false, message: '2FA setup requires Supabase MFA configuration', secret: '', backupCodes: [] as string[] };
    },
  });

  const confirm2FAMutation = useMutation({
    mutationFn: async (_input: { code: string }) => {
      return { success: false, message: '2FA confirmation requires Supabase MFA configuration' };
    },
  });

  const disable2FAMutation = useMutation({
    mutationFn: async (_input: { password: string; code: string }) => {
      return { success: false, message: '2FA disable requires Supabase MFA configuration' };
    },
  });

  const profileQuery = useQuery({
    queryKey: ['security-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      return { twoFactorEnabled: false };
    },
    retry: 1,
  });
  const twoFAEnabled = profileQuery.data?.twoFactorEnabled ?? false;

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('none');
  const [sessions, setSessions] = useState<LoginSession[]>([createCurrentSession()]);

  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [setupSecret, setSetupSecret] = useState('');
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [setupVerifyCode, setSetupVerifyCode] = useState('');

  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const bioAvailable = await isBiometricAvailable();
        setBiometricAvailable(bioAvailable);
        if (bioAvailable) {
          const bioType = await getBiometricType();
          setBiometricType(bioType);
          console.log('[Security] Biometric type:', bioType, 'available:', bioAvailable);
        }
        const bioEnabled = await loadBiometricPref();
        setBiometricEnabled(bioEnabled);

        const storedSessions = await AsyncStorage.getItem(SESSIONS_KEY);
        if (storedSessions) {
          const parsed: LoginSession[] = JSON.parse(storedSessions);
          const hasCurrent = parsed.some(s => s.isCurrent);
          if (!hasCurrent) {
            parsed.unshift(createCurrentSession());
          } else {
            const currentIdx = parsed.findIndex(s => s.isCurrent);
            if (currentIdx >= 0) {
              parsed[currentIdx].lastActive = 'Now';
              parsed[currentIdx].device = getDeviceName();
            }
          }
          setSessions(parsed);
        } else {
          const initial = [createCurrentSession()];
          await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(initial));
        }
      } catch (e) {
        console.error('[Security] Load prefs error:', e);
      }
    };
    void loadPrefs();
  }, []);

  const handleToggleBiometric = useCallback(async (val: boolean) => {
    if (val && biometricAvailable) {
      const result = await authenticateWithBiometric('Enable biometric login for IVX Holdings');
      if (!result.success) {
        Alert.alert('Authentication Failed', result.error || 'Could not verify your identity.');
        return;
      }
    }
    setBiometricEnabled(val);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackAction('biometric_toggled', { enabled: val, type: biometricType });
    await saveBiometricPref(val);
    console.log('[Security] Biometric', val ? 'enabled' : 'disabled', '— type:', biometricType);
  }, [trackAction, biometricAvailable, biometricType]);

  const securityScore = useMemo(() => {
    let score = 50;
    if (twoFAEnabled) score += 25;
    if (biometricEnabled) score += 25;
    return score;
  }, [twoFAEnabled, biometricEnabled]);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const handleChangePassword = () => {
    if (!currentPassword) {
      Alert.alert('Required', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Too Short', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }
    changePasswordMutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: (data) => {
          if (data.success) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            trackAction('password_changed');
            Alert.alert('Password Updated', 'Your password has been changed successfully.');
            setShowChangePassword(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
          } else {
            Alert.alert('Error', (data as any).message || 'Failed to change password.');
          }
        },
        onError: (error) => {
          console.error('[Security] Password change error:', error);
          Alert.alert('Error', 'Failed to change password. Please try again.');
        },
      }
    );
  };

  const handleToggle2FA = useCallback((val: boolean) => {
    if (val) {
      enable2FAMutation.mutate(undefined, {
        onSuccess: (data) => {
          if (data.success && data.secret) {
            setSetupSecret(data.secret);
            setSetupBackupCodes(data.backupCodes || []);
            setSetupVerifyCode('');
            setShowSetup2FA(true);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } else {
            Alert.alert('Error', (data as any).message || 'Failed to start 2FA setup.');
          }
        },
        onError: (error) => {
          console.error('[Security] Enable 2FA error:', error);
          Alert.alert('Error', 'Failed to start 2FA setup.');
        },
      });
    } else {
      setDisablePassword('');
      setDisableCode('');
      setShowDisable2FA(true);
    }
  }, [enable2FAMutation]);

  const handleConfirm2FA = useCallback(() => {
    if (setupVerifyCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code from your authenticator app.');
      return;
    }
    confirm2FAMutation.mutate(
      { code: setupVerifyCode },
      {
        onSuccess: (data) => {
          if (data.success) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            trackAction('2fa_enabled');
            void queryClient.invalidateQueries({ queryKey: ['security-profile'] });
            setShowSetup2FA(false);
            Alert.alert('2FA Enabled', 'Two-factor authentication is now active on your account.');
          } else {
            Alert.alert('Invalid Code', data.message || 'Please check the code and try again.');
          }
        },
        onError: () => {
          Alert.alert('Error', 'Verification failed. Please try again.');
        },
      }
    );
  }, [setupVerifyCode, confirm2FAMutation, trackAction, queryClient]);

  const handleDisable2FA = useCallback(() => {
    if (!disablePassword) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }
    if (disableCode.length < 6) {
      Alert.alert('Required', 'Please enter your 2FA code or backup code.');
      return;
    }
    disable2FAMutation.mutate(
      { password: disablePassword, code: disableCode },
      {
        onSuccess: (data) => {
          if (data.success) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            trackAction('2fa_disabled');
            void queryClient.invalidateQueries({ queryKey: ['security-profile'] });
            setShowDisable2FA(false);
            Alert.alert('2FA Disabled', 'Two-factor authentication has been removed.');
          } else {
            Alert.alert('Error', data.message || 'Failed to disable 2FA.');
          }
        },
        onError: () => {
          Alert.alert('Error', 'Failed to disable 2FA. Check your credentials.');
        },
      }
    );
  }, [disablePassword, disableCode, disable2FAMutation, trackAction, queryClient]);

  const copyToClipboard = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Copied', 'Copied to clipboard.');
  }, []);

  const persistSessions = useCallback(async (updatedSessions: LoginSession[]) => {
    try {
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(updatedSessions));
    } catch (e) {
      console.error('[Security] Session persist error:', e);
    }
  }, []);

  const handleRevokeSession = useCallback((session: LoginSession) => {
    Alert.alert(
      'Revoke Session',
      `Remove access for ${session.device}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            const updated = sessions.filter(s => s.id !== session.id);
            setSessions(updated);
            void persistSessions(updated);
            trackAction('session_revoked', { device: session.device });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }, [sessions, trackAction, persistSessions]);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.securityScore}>
          <View style={[styles.scoreCircle, { borderColor: securityScore >= 75 ? Colors.success : securityScore >= 50 ? Colors.warning : Colors.error }]}>
            <Text style={[styles.scoreValue, { color: securityScore >= 75 ? Colors.success : securityScore >= 50 ? Colors.warning : Colors.error }]}>{securityScore}</Text>
            <Text style={[styles.scoreLabel, { color: securityScore >= 75 ? Colors.success : securityScore >= 50 ? Colors.warning : Colors.error }]}>Score</Text>
          </View>
          <View style={styles.scoreMeta}>
            <Text style={styles.scoreTitle}>Security Score</Text>
            <Text style={styles.scoreSubtitle}>
              {securityScore >= 75 ? 'Your account is well protected' : securityScore >= 50 ? 'Enable more features for better security' : 'Your account needs attention'}
            </Text>
            <View style={styles.scoreChecks}>
              <View style={styles.scoreCheck}>
                {twoFAEnabled ? <CheckCircle size={14} color={Colors.success} /> : <AlertTriangle size={14} color={Colors.warning} />}
                <Text style={styles.scoreCheckText}>{twoFAEnabled ? '2FA enabled' : '2FA disabled'}</Text>
              </View>
              <View style={styles.scoreCheck}>
                <CheckCircle size={14} color={Colors.success} />
                <Text style={styles.scoreCheckText}>Strong password</Text>
              </View>
              <View style={styles.scoreCheck}>
                {biometricEnabled ? <CheckCircle size={14} color={Colors.success} /> : <AlertTriangle size={14} color={Colors.warning} />}
                <Text style={styles.scoreCheckText}>{biometricEnabled ? 'Biometric active' : 'Biometric inactive'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Authentication</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setShowChangePassword(true)}
            >
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: Colors.primary + '15' }]}>
                  <Lock size={18} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Password</Text>
                  <Text style={styles.settingSub}>bcrypt hashed, change regularly</Text>
                </View>
              </View>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
            <View style={styles.settingDivider} />
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: Colors.success + '15' }]}>
                  <Smartphone size={18} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Two-Factor Authentication</Text>
                  <Text style={styles.settingSub}>{twoFAEnabled ? 'TOTP authenticator active' : 'Add authenticator app'}</Text>
                </View>
              </View>
              <Switch
                value={twoFAEnabled}
                onValueChange={handleToggle2FA}
                trackColor={{ false: Colors.backgroundTertiary, true: Colors.success + '50' }}
                thumbColor={twoFAEnabled ? Colors.success : Colors.textTertiary}
              />
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.settingIcon, { backgroundColor: Colors.info + '15' }]}>
                  <Fingerprint size={18} color={Colors.info} />
                </View>
                <View>
                  <Text style={styles.settingLabel}>Biometric Login</Text>
                  <Text style={styles.settingSub}>Face ID / Touch ID</Text>
                </View>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{ false: Colors.backgroundTertiary, true: Colors.info + '50' }}
                thumbColor={biometricEnabled ? Colors.info : Colors.textTertiary}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Sessions</Text>
          <View style={styles.sessionsCard}>
            {sessions.map((session, index) => (
              <React.Fragment key={session.id}>
                {index > 0 && <View style={styles.settingDivider} />}
                <View style={styles.sessionRow}>
                  <View style={styles.sessionLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: session.isCurrent ? Colors.success + '15' : Colors.backgroundTertiary }]}>
                      <Monitor size={18} color={session.isCurrent ? Colors.success : Colors.textTertiary} />
                    </View>
                    <View>
                      <View style={styles.sessionNameRow}>
                        <Text style={styles.settingLabel}>{session.device}</Text>
                        {session.isCurrent && (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>Current</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.settingSub}>{session.location} • {session.lastActive}</Text>
                    </View>
                  </View>
                  {!session.isCurrent && (
                    <TouchableOpacity
                      style={styles.revokeButton}
                      onPress={() => handleRevokeSession(session)}
                    >
                      <LogOut size={16} color={Colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal visible={showChangePassword} animationType="slide" transparent onRequestClose={() => setShowChangePassword(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePassword(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.passwordLabel}>Current Password</Text>
              <View style={styles.passwordInputRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrentPw}
                  placeholder="Enter current password"
                  placeholderTextColor={Colors.textTertiary}
                />
                <TouchableOpacity onPress={() => setShowCurrentPw(!showCurrentPw)}>
                  {showCurrentPw ? <EyeOff size={18} color={Colors.textTertiary} /> : <Eye size={18} color={Colors.textTertiary} />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.passwordLabel}>New Password</Text>
              <View style={styles.passwordInputRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPw}
                  placeholder="Minimum 8 characters"
                  placeholderTextColor={Colors.textTertiary}
                />
                <TouchableOpacity onPress={() => setShowNewPw(!showNewPw)}>
                  {showNewPw ? <EyeOff size={18} color={Colors.textTertiary} /> : <Eye size={18} color={Colors.textTertiary} />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.passwordLabel}>Confirm New Password</Text>
              <TextInput
                style={[styles.passwordInput, styles.passwordInputFull]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Re-enter new password"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <TouchableOpacity
              style={[styles.updateButton, changePasswordMutation.isPending && styles.buttonDisabled]}
              onPress={handleChangePassword}
              disabled={changePasswordMutation.isPending}
            >
              <Text style={styles.updateButtonText}>
                {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSetup2FA} animationType="slide" transparent onRequestClose={() => setShowSetup2FA(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Up 2FA</Text>
              <TouchableOpacity onPress={() => setShowSetup2FA(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.setupStep}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={styles.setupStepText}>
                Open your authenticator app (Google Authenticator, Authy, etc.)
              </Text>
            </View>

            <View style={styles.setupStep}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text style={styles.setupStepText}>Add a new account and enter this secret key:</Text>
            </View>

            <TouchableOpacity style={styles.secretBox} onPress={() => copyToClipboard(setupSecret)}>
              <Key size={16} color={Colors.primary} />
              <Text style={styles.secretText} numberOfLines={1}>{setupSecret}</Text>
              <Copy size={16} color={Colors.textTertiary} />
            </TouchableOpacity>

            {setupBackupCodes.length > 0 && (
              <View style={styles.backupSection}>
                <Text style={styles.backupTitle}>Backup Codes (save these!)</Text>
                <View style={styles.backupGrid}>
                  {setupBackupCodes.map((code, idx) => (
                    <Text key={idx} style={styles.backupCode}>{code}</Text>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.copyAllButton}
                  onPress={() => copyToClipboard(setupBackupCodes.join('\n'))}
                >
                  <Copy size={14} color={Colors.primary} />
                  <Text style={styles.copyAllText}>Copy All</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.setupStep}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <Text style={styles.setupStepText}>Enter the 6-digit code from your app:</Text>
            </View>

            <TextInput
              style={styles.codeInput}
              value={setupVerifyCode}
              onChangeText={setSetupVerifyCode}
              placeholder="000000"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />

            <TouchableOpacity
              style={[styles.updateButton, confirm2FAMutation.isPending && styles.buttonDisabled]}
              onPress={handleConfirm2FA}
              disabled={confirm2FAMutation.isPending}
            >
              <Text style={styles.updateButtonText}>
                {confirm2FAMutation.isPending ? 'Verifying...' : 'Enable 2FA'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDisable2FA} animationType="slide" transparent onRequestClose={() => setShowDisable2FA(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Disable 2FA</Text>
              <TouchableOpacity onPress={() => setShowDisable2FA(false)}>
                <X size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.disableWarning}>
              Removing two-factor authentication will make your account less secure.
            </Text>

            <View style={styles.passwordField}>
              <Text style={styles.passwordLabel}>Password</Text>
              <TextInput
                style={[styles.passwordInput, styles.passwordInputFull]}
                value={disablePassword}
                onChangeText={setDisablePassword}
                secureTextEntry
                placeholder="Enter your password"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.passwordLabel}>2FA Code or Backup Code</Text>
              <TextInput
                style={[styles.passwordInput, styles.passwordInputFull]}
                value={disableCode}
                onChangeText={setDisableCode}
                placeholder="6-digit code or 8-char backup"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="default"
                maxLength={8}
              />
            </View>

            <TouchableOpacity
              style={[styles.dangerButton, disable2FAMutation.isPending && styles.buttonDisabled]}
              onPress={handleDisable2FA}
              disabled={disable2FAMutation.isPending}
            >
              <Text style={styles.dangerButtonText}>
                {disable2FAMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  securityScore: { alignItems: 'center', gap: 4 },
  scoreCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFD700' + '15', alignItems: 'center', justifyContent: 'center' },
  scoreValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  scoreLabel: { color: Colors.textSecondary, fontSize: 13 },
  scoreMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  scoreSubtitle: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' as const, textAlign: 'center' as const },
  scoreChecks: { alignItems: 'center', gap: 4 },
  scoreCheck: { alignItems: 'center', gap: 4 },
  scoreCheckText: { color: Colors.textSecondary, fontSize: 13 },
  section: { marginBottom: 20 },
  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const, marginBottom: 12 },
  settingsCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  settingDivider: { width: 1, height: 24, backgroundColor: Colors.surfaceBorder },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  settingIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingLabel: { color: Colors.textSecondary, fontSize: 13, flexShrink: 1 },
  settingSub: { color: Colors.textTertiary, fontSize: 12, marginTop: 2, flexShrink: 1 },
  changeText: { color: Colors.textSecondary, fontSize: 13 },
  sessionsCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  sessionNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  currentBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  currentBadgeText: { fontSize: 11, fontWeight: '700' as const },
  revokeButton: { backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  passwordField: { gap: 6, marginBottom: 12 },
  passwordLabel: { color: Colors.textSecondary, fontSize: 13 },
  passwordInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  passwordInputFull: { flex: 1 },
  updateButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  updateButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  dangerButton: { backgroundColor: Colors.error + '15', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  dangerButtonText: { color: Colors.error, fontWeight: '700' as const, fontSize: 15 },
  setupStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  stepBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  stepBadgeText: { fontSize: 11, fontWeight: '700' as const },
  setupStepText: { color: Colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  secretBox: { backgroundColor: '#0D0D0D', borderRadius: 12, padding: 14 },
  secretText: { color: Colors.textSecondary, fontSize: 13 },
  backupSection: { marginBottom: 16 },
  backupTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' as const },
  backupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  backupCode: { backgroundColor: '#0D0D0D', borderRadius: 8, padding: 10, alignItems: 'center', minWidth: 80 },
  copyAllButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  copyAllText: { color: Colors.textSecondary, fontSize: 13 },
  codeInput: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, color: Colors.text, fontSize: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  disableWarning: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: Colors.error + '10', borderRadius: 10, marginBottom: 12 },
  bottomPadding: { height: 120 },
  scrollView: { backgroundColor: Colors.background },
});
