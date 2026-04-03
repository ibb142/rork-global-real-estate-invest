import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Shield, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { checkAuthRateLimit, recordAuthAttempt, getRateLimitMessage } from '@/lib/auth-rate-limiter';
import { validateEmail, sanitizeEmail } from '@/lib/auth-helpers';

const IPX_LOGO = require('@/assets/images/ivx-logo.png');

export default function LoginScreen() {
  const router = useRouter();
  const { login, verify2FA, cancelTwoFactor, requiresTwoFactor, loginLoading, verify2FALoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFACode, setTwoFACode] = useState(['', '', '', '', '', '']);
  const twoFARefs = useRef<(TextInput | null)[]>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      shake();
      return;
    }
    if (!validateEmail(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      shake();
      return;
    }
    if (!password) {
      Alert.alert('Missing Password', 'Please enter your password.');
      shake();
      return;
    }

    const identifier = sanitizeEmail(email);
    const rateCheck = checkAuthRateLimit(identifier);
    if (!rateCheck.allowed) {
      shake();
      Alert.alert('Account Locked', getRateLimitMessage(rateCheck.lockedUntilMs));
      return;
    }

    const result = await login(identifier, password);
    recordAuthAttempt(identifier, result.success || !!result.requiresTwoFactor);

    if (!result.success && !result.requiresTwoFactor) {
      shake();
      const remaining = rateCheck.remainingAttempts - 1;
      const msg = remaining > 0
        ? `${result.message || 'Invalid email or password.'}\n${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : result.message || 'Invalid email or password.';
      Alert.alert('Sign In Failed', msg);
    }
  };

  const handle2FAInput = (index: number, value: string) => {
    const updated = [...twoFACode];
    updated[index] = value;
    setTwoFACode(updated);
    if (value && index < 5) {
      twoFARefs.current[index + 1]?.focus();
    }
    if (updated.every(c => c !== '')) {
      void handleVerify2FA(updated.join(''));
    }
  };

  const handle2FAKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !twoFACode[index] && index > 0) {
      twoFARefs.current[index - 1]?.focus();
    }
  };

  const handleVerify2FA = async (code: string) => {
    const result = await verify2FA(code);
    if (!result.success) {
      shake();
      setTwoFACode(['', '', '', '', '', '']);
      twoFARefs.current[0]?.focus();
      Alert.alert('Invalid Code', result.message || 'The 2FA code is incorrect.');
    }
  };

  const isLoading = loginLoading || verify2FALoading;

  if (requiresTwoFactor) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <TouchableOpacity style={styles.backButton} onPress={() => { cancelTwoFactor(); }}>
                <ArrowLeft size={22} color={Colors.text} />
              </TouchableOpacity>

              <View style={styles.twoFAHeader}>
                <View style={styles.twoFAIconWrap}>
                  <Shield size={32} color={Colors.primary} />
                </View>
                <Text style={styles.twoFATitle}>Two-Factor Auth</Text>
                <Text style={styles.twoFASubtitle}>Enter the 6-digit code from your authenticator app</Text>
              </View>

              <Animated.View style={[styles.codeRow, { transform: [{ translateX: shakeAnim }] }]}>
                {twoFACode.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={r => { twoFARefs.current[i] = r; }}
                    style={[styles.codeBox, digit && styles.codeBoxFilled]}
                    value={digit}
                    onChangeText={v => handle2FAInput(i, v.replace(/[^0-9]/g, '').slice(-1))}
                    onKeyPress={({ nativeEvent }) => handle2FAKeyPress(i, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </Animated.View>

              {isLoading && (
                <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
              )}

              <TouchableOpacity style={styles.cancelLink} onPress={() => cancelTwoFactor()}>
                <Text style={styles.cancelLinkText}>Back to Sign In</Text>
              </TouchableOpacity>
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <ArrowLeft size={22} color={Colors.text} />
            </TouchableOpacity>

            <Animated.View style={[styles.heroSection, {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: logoScale }],
            }]}>
              <Image source={IPX_LOGO} style={styles.logo} resizeMode="contain" />
              <Text style={styles.brand}>IVX HOLDINGS LLC</Text>
              <Text style={styles.tagline}>Premium Real Estate Investing</Text>
            </Animated.View>

            <Animated.View style={[styles.formCard, {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { translateX: shakeAnim }],
            }]}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to your investment portfolio</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email Address</Text>
                <View style={styles.inputWrap}>
                  <Mail size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={Colors.inputPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    returnKeyType="next"
                    testID="login-email"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Password</Text>
                  <TouchableOpacity onPress={async () => {
                    if (!email.trim()) {
                      Alert.alert('Enter Email', 'Please enter your email address first, then tap Forgot.');
                      return;
                    }
                    if (!validateEmail(email.trim())) {
                      Alert.alert('Invalid Email', 'Please enter a valid email address.');
                      return;
                    }
                    try {
                      const { supabase } = await import('@/lib/supabase');
                      const { error } = await supabase.auth.resetPasswordForEmail(sanitizeEmail(email), {
                        redirectTo: 'https://ivxholding.com/reset-password',
                      });
                      if (error) {
                        Alert.alert('Error', error.message);
                      } else {
                        Alert.alert('Check Your Email', 'We sent a password reset link to ' + email.trim() + '. Please check your inbox and spam folder.');
                      }
                    } catch (e: any) {
                      Alert.alert('Error', e?.message || 'Could not send reset email. Please try again.');
                    }
                  }}>
                    <Text style={styles.forgotLink}>Forgot?</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.inputWrap}>
                  <Lock size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.inputPlaceholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    testID="login-password"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    {showPassword
                      ? <EyeOff size={18} color={Colors.textTertiary} />
                      : <Eye size={18} color={Colors.textTertiary} />
                    }
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.signInBtn, isLoading && styles.signInBtnDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.85}
                testID="login-submit"
              >
                {isLoading ? (
                  <ActivityIndicator color={Colors.black} />
                ) : (
                  <>
                    <Text style={styles.signInBtnText}>Sign In</Text>
                    <ChevronRight size={20} color={Colors.black} />
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>

              <View style={styles.signupRow}>
                <Text style={styles.signupText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.replace('/signup' as any)}>
                  <Text style={styles.signupLink}>Create Account</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            <Animated.View style={[styles.securityRow, { opacity: fadeAnim }]}>
              <Shield size={13} color={Colors.textTertiary} />
              <Text style={styles.securityText}>Bank-grade encryption · Escrow protected · Regulated structure</Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  backButton: {
    marginTop: 8,
    marginLeft: 20,
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 28,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    marginBottom: 14,
  },
  brand: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
    letterSpacing: 2,
  },
  tagline: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1,
    marginTop: 4,
  },
  formCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 26,
    lineHeight: 20,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotLink: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 14,
    gap: 10,
    height: 52,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    height: '100%' as any,
  },
  signInBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  signInBtnDisabled: {
    opacity: 0.6,
  },
  signInBtnText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  dividerText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  signupLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 20,
  },
  securityText: {
    color: Colors.textTertiary,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  twoFAHeader: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  twoFAIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  twoFATitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 8,
  },
  twoFASubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  codeBox: {
    width: 48,
    height: 58,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  codeBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  cancelLink: {
    marginTop: 32,
    alignItems: 'center',
  },
  cancelLinkText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
