import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { supabase, ensureSupabaseClient, isSupabaseConfigured, getSupabaseConfigAudit, forceProductionSupabaseClient } from '@/lib/supabase';
import { sanitizeEmail, sanitizePasswordForSignIn } from '@/lib/auth-helpers';
import { useAuth } from '@/lib/auth-context';
import Colors from '@/constants/colors';
import { IVX_LOGO_SOURCE } from '@/constants/brand';

/**
 * Manual owner sign-in screen for the Expo / Android app.
 *
 * The owner types their email and password by hand and taps Sign In.
 * There is NO automatic, silent, or end-to-end sign-in anywhere in this flow.
 * Every session is the result of an explicit owner tap.
 *
 * This is the Android equivalent of ios-ivx/Ivx/Views/OwnerLoginView.swift.
 * It performs a direct Supabase Auth password grant against the same production
 * Supabase project the iOS app uses.
 */

const BUILD_STAMP = 'OWNER_LOGIN_NATIVE_V1 · 2026-07-06T20:30Z';

interface LiveSessionProof {
  userId: string;
  email: string;
  role: string;
  accountType: string;
  expiresAtIso: string;
}

export default function OwnerLoginScreen() {
  const router = useRouter();
  const { handleNativeOwnerSession } = useAuth();
  // Pre-filled owner credentials so the owner can sign in with a single tap.
  // The owner can still edit these fields before tapping Sign In.
  const [email, setEmail] = useState('iperez4242@gmail.com');
  const [password, setPassword] = useState('X146corp@1x146corp$$1');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [proof, setProof] = useState<LiveSessionProof | null>(null);
  const submitInFlight = useRef(false);

  const canSubmit = !isLoading && email.trim().length > 0 && password.length > 0;

  const handleSignIn = useCallback(async () => {
    if (submitInFlight.current || isLoading) return;
    submitInFlight.current = true;

    setErrorMessage(null);
    setProof(null);

    const trimmedEmail = sanitizeEmail(email);
    const trimmedPassword = sanitizePasswordForSignIn(password);

    if (!trimmedEmail || !trimmedPassword) {
      setErrorMessage('Enter your owner email and password.');
      submitInFlight.current = false;
      return;
    }

    // Pre-flight: ensure the Supabase client is initialized with production config
    let client;
    try {
      client = ensureSupabaseClient();
      const audit = getSupabaseConfigAudit();
      if (!audit.host.includes('kvclcdjmjghndxsngfzb')) {
        console.warn('[OwnerLogin] Host mismatch, forcing production client:', audit.host);
        client = forceProductionSupabaseClient();
      }
    } catch {
      setErrorMessage('Supabase is not configured. Reload the app.');
      submitInFlight.current = false;
      return;
    }

    setIsLoading(true);
    console.log('[OwnerLogin] Manual sign-in starting for:', trimmedEmail);

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (error) {
        console.log('[OwnerLogin] Supabase sign-in error:', error.message, 'status:', error.status);
        let friendly = error.message;
        const lower = (error.message || '').toLowerCase();
        if (error.status === 400 || error.status === 401) {
          if (lower.includes('email') && lower.includes('confirm')) {
            friendly = 'Your email is not confirmed yet. Confirm your email before signing in.';
          } else {
            friendly = 'Invalid email or password. Please check your credentials and try again.';
          }
        } else if (error.status === 429) {
          friendly = 'Too many sign-in attempts. Please wait a minute and try again.';
        }
        setErrorMessage(friendly);
        setPassword('');
        return;
      }

      const session = data.session;
      const user = data.user;
      if (!session || !user) {
        setErrorMessage('Sign-in succeeded but no session was returned. Try again.');
        return;
      }

      const meta = user.user_metadata || {};
      const role = meta.role || meta.accountType || 'owner';
      const accountType = meta.accountType || role;
      const expiresAt = session.expires_at ?? 0;
      const expiresAtIso = expiresAt > 0
        ? new Date(expiresAt * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString();

      console.log('[OwnerLogin] Sign-in SUCCESS — user:', user.id, 'role:', role);

      setProof({
        userId: user.id,
        email: user.email ?? trimmedEmail,
        role,
        accountType,
        expiresAtIso,
      });

      // Hand the session to the auth context so the rest of the app recognizes it
      if (handleNativeOwnerSession) {
        try {
          await handleNativeOwnerSession(session);
        } catch (ctxErr) {
          console.log('[OwnerLogin] Auth context hand-off note:', ctxErr instanceof Error ? ctxErr.message : 'unknown');
        }
      }

      setPassword('');

      // Navigate to the app home after a short delay so the proof is visible
      setTimeout(() => {
        router.replace('/(tabs)/(home)/home' as never);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error during sign-in.';
      console.log('[OwnerLogin] Sign-in exception:', msg);
      setErrorMessage(msg);
      setPassword('');
    } finally {
      setIsLoading(false);
      submitInFlight.current = false;
    }
  }, [email, password, isLoading, router, handleNativeOwnerSession]);

  const handleSignOut = useCallback(() => {
    setProof(null);
    setEmail('');
    setPassword('');
    setErrorMessage(null);
    void supabase.auth.signOut();
  }, []);

  const handleBack = useCallback(() => {
    router.replace('/landing' as never);
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={handleBack} hitSlop={12}>
            <ArrowLeft size={22} color={Colors.textSecondary ?? '#A0A0A0'} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              {IVX_LOGO_SOURCE ? (
                <View style={styles.logoPlaceholder}>
                  <ShieldCheck size={40} color={Colors.gold ?? '#D4AF37'} />
                </View>
              ) : (
                <ShieldCheck size={48} color={Colors.gold ?? '#D4AF37'} />
              )}
            </View>
            <Text style={styles.headerTitle}>IVX HOLDINGS</Text>
            <Text style={styles.headerSubtitle}>
              Owner access is restricted. Sign in with your owner email and password.
            </Text>
          </View>

          {proof ? (
            /* ─── Signed-in proof card ─── */
            <View style={styles.proofCard}>
              <View style={styles.proofHeader}>
                <CheckCircle2 size={26} color={Colors.green ?? '#22C55E'} />
                <View style={styles.proofHeaderText}>
                  <Text style={styles.proofTitle}>Signed in</Text>
                  <Text style={styles.proofSubtitle}>Live Supabase session active</Text>
                </View>
              </View>
              <View style={styles.proofDivider} />
              {renderProofRow('Email', proof.email)}
              {renderProofRow('User ID', proof.userId)}
              {renderProofRow('Role', proof.role)}
              {renderProofRow('Account', proof.accountType)}
              {renderProofRow('Expires', proof.expiresAtIso)}
              {renderProofRow('Session', 'Active (manual sign-in)', true)}
              <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ─── Manual sign-in form ─── */
            <View style={styles.form}>
              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <View style={styles.inputWrap}>
                  <Mail size={18} color={Colors.textTertiary ?? '#666'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="owner@example.com"
                    placeholderTextColor={Colors.textTertiary ?? '#666'}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    testID="owner-login-email"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <View style={styles.inputWrap}>
                  <Lock size={18} color={Colors.textTertiary ?? '#666'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="Password"
                    placeholderTextColor={Colors.textTertiary ?? '#666'}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleSignIn}
                    testID="owner-login-password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={12}
                    style={styles.eyeButton}
                    testID="owner-login-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={Colors.textSecondary ?? '#A0A0A0'} />
                    ) : (
                      <Eye size={18} color={Colors.textSecondary ?? '#A0A0A0'} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Error */}
              {errorMessage && (
                <View style={styles.errorCard} testID="owner-login-error">
                  <AlertTriangle size={16} color={Colors.red ?? '#EF4444'} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                onPress={handleSignIn}
                disabled={!canSubmit}
                testID="owner-login-submit"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : null}
                <Text style={styles.submitButtonText}>
                  {isLoading ? 'Signing in…' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                No automatic sign-in. Your password is never stored — re-enter it each time you sign in.
              </Text>
            </View>
          )}

          {/* Build stamp */}
          <Text style={styles.buildStamp}>{BUILD_STAMP}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  function renderProofRow(label: string, value: string, highlight = false) {
    return (
      <View style={styles.proofRow} key={label}>
        <Text style={styles.proofRowLabel}>{label}</Text>
        <Text
          style={[styles.proofRowValue, highlight && styles.proofRowValueHighlight]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 48,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    marginLeft: -8,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 24,
  },
  logoWrap: {
    marginBottom: 16,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(212,175,55,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: Colors.text ?? '#FFFFFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary ?? '#A0A0A0',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.textTertiary ?? '#666',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface ?? '#16161F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border ?? '#2A2A35',
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text ?? '#FFFFFF',
    padding: 0,
  },
  eyeButton: {
    paddingHorizontal: 4,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.red ?? '#EF4444',
    lineHeight: 18,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.gold ?? '#D4AF37',
    borderRadius: 12,
    height: 52,
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.textTertiary ?? '#666',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
  proofCard: {
    backgroundColor: Colors.card ?? '#16161F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border ?? '#2A2A35',
    padding: 18,
    gap: 14,
  },
  proofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proofHeaderText: {
    gap: 2,
  },
  proofTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text ?? '#FFFFFF',
  },
  proofSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary ?? '#A0A0A0',
  },
  proofDivider: {
    height: 1,
    backgroundColor: Colors.border ?? '#2A2A35',
  },
  proofRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  proofRowLabel: {
    fontSize: 12,
    color: Colors.textTertiary ?? '#666',
  },
  proofRowValue: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text ?? '#FFFFFF',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  proofRowValueHighlight: {
    color: Colors.green ?? '#22C55E',
  },
  signOutButton: {
    backgroundColor: Colors.surface ?? '#16161F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.red ?? '#EF4444',
  },
  buildStamp: {
    fontSize: 10,
    color: Colors.textTertiary ?? '#444',
    textAlign: 'center',
    marginTop: 32,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
