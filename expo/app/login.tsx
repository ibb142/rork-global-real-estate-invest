import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LoginFailureReason, OwnerDirectAccessAuditResult } from '@/lib/auth-context';
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
import { useRouter, useLocalSearchParams, Href } from 'expo-router';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Shield, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { checkAuthRateLimit, recordAuthAttempt, getRateLimitMessage } from '@/lib/auth-rate-limiter';
import { validateEmail, sanitizeEmail } from '@/lib/auth-helpers';
import { getPasswordResetRedirectUrl } from '@/lib/auth-password-recovery';
import {
  buildRepairIssueItems,
  fetchOwnerRepairReadiness,
  getOwnerRepairReadiness,
  type OwnerRepairReadiness,
} from '@/lib/owner-repair-readiness';

import { IVX_LOGO_SOURCE } from '@/constants/brand';
import {
  getAdminAccessLockFixUpdate,
  getAdminAccessLockHonestStatus,
  getAdminAccessLockMessage,
  getAdminAccessLockNextStep,
  isAdminAccessLocked,
} from '@/lib/admin-access-lock';
import { getOpenAccessModeMessage, isOpenAccessModeEnabled } from '@/lib/open-access';

function shouldAuditOwnerRecoveryForFailure(failureReason: LoginFailureReason | undefined, message: string): boolean {
  if (
    failureReason === 'invalid_credentials'
    || failureReason === 'email_not_confirmed'
    || failureReason === 'rate_limited'
    || failureReason === 'service_unavailable'
    || failureReason === 'unknown'
  ) {
    return true;
  }

  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes('invalid login credentials')
    || lowerMessage.includes('invalid email or password')
    || lowerMessage.includes('email not confirmed')
    || lowerMessage.includes('temporarily unavailable')
    || lowerMessage.includes('failed to fetch')
    || lowerMessage.includes('timeout');
}

function buildLoginFailureAlertMessage(
  baseMessage: string,
  failureReason: LoginFailureReason | undefined,
  remainingAttempts: number,
  lockedUntilMs: number,
): string {
  if (failureReason === 'service_unavailable') {
    return `${baseMessage}\n\nControlled owner recovery can still restore access on a previously verified owner device.`;
  }

  if (failureReason !== 'invalid_credentials') {
    return baseMessage;
  }

  const rejectionEvidence = 'Server check: email is normalized (trim + lowercase); password is trimmed for leading/trailing spaces only. Supabase rejected this email/password pair.';

  if (lockedUntilMs > Date.now()) {
    return `${baseMessage}\n\n${rejectionEvidence}\n\n${getRateLimitMessage(lockedUntilMs)}`;
  }

  if (remainingAttempts > 0) {
    return `${baseMessage}\n\n${rejectionEvidence}\n\nDevice cooldown guard: ${remainingAttempts} invalid password attempt${remainingAttempts === 1 ? '' : 's'} left before a 15-minute pause on this device.`;
  }

  return `${baseMessage}\n\n${rejectionEvidence}`;
}

type LoginAttemptTone = 'neutral' | 'success' | 'warning';

interface LoginAttemptState {
  status: 'idle' | 'submitting' | 'success' | 'failed';
  title: string;
  detail: string;
  email: string;
  tone: LoginAttemptTone;
}

const INITIAL_LOGIN_ATTEMPT_STATE: LoginAttemptState = {
  status: 'idle',
  title: 'Direct sign-in path',
  detail: 'Email + password always go through live Supabase sign-in. Trusted owner restore stays separate below.',
  email: '',
  tone: 'neutral',
};

type LoginIssueSeverity = 'critical' | 'warning' | 'success';

interface LoginIssueItem {
  id: string;
  title: string;
  detail: string;
  severity: LoginIssueSeverity;
}

interface RecoveryTruthItem {
  id: string;
  title: string;
  detail: string;
}

function classifyOwnerAuditSeverity(reason: string): LoginIssueSeverity {
  const lowerReason = reason.toLowerCase();
  if (
    lowerReason.includes('window is no longer active')
    || lowerReason.includes('could not be detected')
    || lowerReason.includes('carrier subnet')
    || lowerReason.includes('temporarily unavailable')
    || lowerReason.includes('rate limit')
  ) {
    return 'warning';
  }

  return 'critical';
}

function dedupeLoginIssues(items: LoginIssueItem[]): LoginIssueItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.severity}:${item.title}:${item.detail}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildLoginIssueItems(params: {
  failureReason: LoginFailureReason | null;
  failedLoginMessage: string | null;
  attemptedEmail: string;
  remainingAttempts: number;
  lockedUntilMs: number;
  audit: OwnerDirectAccessAuditResult | null;
  ownerRepairReadiness: OwnerRepairReadiness;
}): LoginIssueItem[] {
  const {
    failureReason,
    failedLoginMessage,
    attemptedEmail,
    remainingAttempts,
    lockedUntilMs,
    audit,
    ownerRepairReadiness,
  } = params;

  const items: LoginIssueItem[] = [];

  if (failureReason === 'invalid_credentials' && failedLoginMessage) {
    items.push({
      id: 'live-password-rejected',
      title: 'Supabase rejected the live password',
      detail: attemptedEmail
        ? `The exact password entered for ${attemptedEmail} was sent to Supabase and rejected there.`
        : 'The exact password entered on this screen was sent to Supabase and rejected there.',
      severity: 'critical',
    });
  }

  if (failureReason === 'email_not_confirmed') {
    items.push({
      id: 'email-not-confirmed',
      title: 'Email confirmation is incomplete',
      detail: 'Supabase still requires email confirmation for this account before password sign-in can complete.',
      severity: 'critical',
    });
  }

  if (failureReason === 'service_unavailable') {
    items.push({
      id: 'service-unavailable',
      title: 'Live sign-in is temporarily unavailable',
      detail: 'The direct Supabase login path could not be reached cleanly. Trusted owner recovery or password reset is the safe fallback.',
      severity: 'warning',
    });
  }

  if (failureReason === 'admin_access_locked') {
    items.push({
      id: 'admin-access-locked',
      title: 'Admin access is temporarily locked',
      detail: getAdminAccessLockMessage(),
      severity: 'critical',
    });
  }

  if (failureReason === 'rate_limited') {
    items.push({
      id: 'server-rate-limit',
      title: 'Rate limit is active',
      detail: 'Supabase is throttling repeated sign-in attempts right now. Wait briefly before trying again.',
      severity: 'warning',
    });
  }

  const shouldSurfaceServerRepairBlocker = (
    failureReason === 'service_unavailable'
    || failureReason === 'unknown'
  ) && !ownerRepairReadiness.hasRealServiceRole;

  if (failureReason === 'invalid_credentials' && !ownerRepairReadiness.hasRealServiceRole) {
    items.push({
      id: 'admin-repair-separate-from-signin',
      title: 'Server repair key is separate from normal sign-in',
      detail: 'This password rejection already came from the live Supabase email/password sign-in path. A missing or bad service-role key did not cause the rejection. That key is only needed for backend admin repair of an existing owner auth account if support must inspect or rewrite it.',
      severity: 'warning',
    });
  }

  if (shouldSurfaceServerRepairBlocker) {
    buildRepairIssueItems(ownerRepairReadiness)
      .filter((item) => item.tone !== 'success')
      .forEach((item) => {
        items.push({
          id: `owner-repair-${item.id}`,
          title: item.title,
          detail: item.detail,
          severity: item.tone === 'critical' ? 'critical' : 'warning',
        });
      });
  }

  if (lockedUntilMs > Date.now()) {
    items.push({
      id: 'device-cooldown-active',
      title: 'Device cooldown is active',
      detail: getRateLimitMessage(lockedUntilMs),
      severity: 'warning',
    });
  } else if (failureReason === 'invalid_credentials' && remainingAttempts > 0) {
    items.push({
      id: 'device-cooldown-guard',
      title: 'Local cooldown guard is armed',
      detail: `${remainingAttempts} invalid password attempt${remainingAttempts === 1 ? '' : 's'} remain before this device pauses sign-in for 15 minutes.`,
      severity: 'warning',
    });
  }

  if (audit?.eligible) {
    items.push({
      id: 'trusted-restore-available',
      title: 'Trusted owner restore is available',
      detail: audit.currentIP
        ? `This verified device can restore owner access now from ${audit.currentIP}.`
        : 'This verified device can restore owner access now without another password entry.',
      severity: 'success',
    });
  }

  if (audit?.emailMismatch && audit.verifiedEmail) {
    items.push({
      id: 'verified-email-mismatch',
      title: 'The entered owner email is not the verified owner email',
      detail: `This device is anchored to ${audit.verifiedEmail}, not ${(audit.requestedEmail ?? attemptedEmail) || 'the current email'}.`,
      severity: 'critical',
    });
  }

  if (audit && !audit.eligible) {
    const auditReasons = audit.blockingReasons.length > 0 ? audit.blockingReasons : [audit.message];
    auditReasons.forEach((reason, index) => {
      items.push({
        id: `audit-reason-${index}`,
        title: classifyOwnerAuditSeverity(reason) === 'critical' ? 'Owner restore blocker' : 'Owner restore warning',
        detail: reason,
        severity: classifyOwnerAuditSeverity(reason),
      });
    });
  }

  if (audit?.subnetMatch && audit.currentIP && audit.storedIP && audit.currentIP !== audit.storedIP) {
    items.push({
      id: 'carrier-subnet-match',
      title: 'Carrier subnet fallback is available',
      detail: `Current network ${audit.currentIP} is different from ${audit.storedIP}, but both still match the same trusted carrier subnet.`,
      severity: 'warning',
    });
  }

  return dedupeLoginIssues(items);
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; justRegistered?: string }>();
  const openAccessMode = isOpenAccessModeEnabled();
  const openAccessMessage = getOpenAccessModeMessage();
  const adminAccessLocked = isAdminAccessLocked();
  const adminAccessLockMessage = getAdminAccessLockMessage();
  const adminAccessLockHonestStatus = getAdminAccessLockHonestStatus();
  const adminAccessLockFixUpdate = getAdminAccessLockFixUpdate();
  const adminAccessLockNextStep = getAdminAccessLockNextStep();
  const {
    login,
    verify2FA,
    cancelTwoFactor,
    requiresTwoFactor,
    loginLoading,
    verify2FALoading,
    pendingTwoFactorEmail,
    pendingTwoFactorFactorLabel,
    isOwnerIPAccess,
    detectedIP,
    isAuthenticated,
    isAdmin,
    auditOwnerDirectAccess,
    ownerDirectAccess,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFACode, setTwoFACode] = useState<string[]>(['', '', '', '', '', '']);
  const [failedLoginMessage, setFailedLoginMessage] = useState<string | null>(null);
  const [ownerRecoveryAudit, setOwnerRecoveryAudit] = useState<OwnerDirectAccessAuditResult | null>(null);
  const [ownerRecoveryLoading, setOwnerRecoveryLoading] = useState<boolean>(false);
  const [liveOwnerAuditLoading, setLiveOwnerAuditLoading] = useState<boolean>(false);
  const [passwordResetLoading, setPasswordResetLoading] = useState<boolean>(false);
  const [lastFailureReason, setLastFailureReason] = useState<LoginFailureReason | null>(null);
  const [attemptState, setAttemptState] = useState<LoginAttemptState>(INITIAL_LOGIN_ATTEMPT_STATE);
  const twoFARefs = useRef<(TextInput | null)[]>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const registrationAlertShown = useRef(false);
  const normalizedEmail = useMemo(() => sanitizeEmail(email), [email]);
  const effectiveRecoveryEmail = useMemo(() => {
    if (ownerRecoveryAudit?.emailMismatch && ownerRecoveryAudit.verifiedEmail) {
      return ownerRecoveryAudit.verifiedEmail;
    }

    return normalizedEmail;
  }, [normalizedEmail, ownerRecoveryAudit?.emailMismatch, ownerRecoveryAudit?.verifiedEmail]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, logoScale]);

  useEffect(() => {
    const nextEmail = typeof params.email === 'string' ? params.email.trim() : '';
    if (nextEmail) {
      setEmail(nextEmail);
    }
  }, [params.email]);

  useEffect(() => {
    const justRegistered = params.justRegistered === '1' || (Array.isArray(params.justRegistered) && params.justRegistered.includes('1'));
    if (!justRegistered || registrationAlertShown.current) {
      return;
    }

    registrationAlertShown.current = true;
    Alert.alert('Registration Saved', 'Your account is registered. Next time, only Sign In is required.');
  }, [params.justRegistered]);

  useEffect(() => {
    if (!openAccessMode) {
      return;
    }

    console.log('[Login] Open access mode active — bypassing login screen');
    router.replace('/(tabs)' as any);
  }, [openAccessMode, router]);

  useEffect(() => {
    if (openAccessMode || !normalizedEmail || !validateEmail(normalizedEmail)) {
      setLiveOwnerAuditLoading(false);
      if (!failedLoginMessage) {
        setOwnerRecoveryAudit(null);
      }
      return;
    }

    let cancelled = false;
    setLiveOwnerAuditLoading(true);
    const timer = setTimeout(() => {
      void auditOwnerDirectAccess(normalizedEmail)
        .then((audit) => {
          if (cancelled) {
            return;
          }
          console.log('[Login] Proactive owner audit:', JSON.stringify(audit));
          setOwnerRecoveryAudit(audit);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          console.log('[Login] Proactive owner audit failed:', error instanceof Error ? error.message : error);
        })
        .finally(() => {
          if (!cancelled) {
            setLiveOwnerAuditLoading(false);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auditOwnerDirectAccess, failedLoginMessage, normalizedEmail, openAccessMode]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const openOwnerAccess = useCallback((source: 'login' | 'login-failure' | 'owner-recovery' = 'login') => {
    const normalizedEmail = sanitizeEmail(email);
    router.push({
      pathname: '/owner-access',
      params: {
        source,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
      },
    } as Href);
  }, [email, router]);

  const handleOwnerTrustedRestore = useCallback(async () => {
    setOwnerRecoveryLoading(true);
    try {
      const result = await ownerDirectAccess(normalizedEmail);
      if (result.success) {
        setFailedLoginMessage(null);
        setLastFailureReason(null);
        setAttemptState({
          status: 'success',
          title: 'Trusted owner access restored',
          detail: result.message,
          email: normalizedEmail,
          tone: 'success',
        });
        Alert.alert('Owner Access Restored', result.message, [
          { text: 'Continue', onPress: () => router.replace('/(tabs)' as any) },
        ]);
        return;
      }

      setAttemptState({
        status: 'failed',
        title: 'Trusted owner access blocked',
        detail: result.message,
        email: normalizedEmail,
        tone: 'warning',
      });
      Alert.alert('Trusted Access Blocked', result.message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to restore trusted owner access';
      setAttemptState({
        status: 'failed',
        title: 'Trusted owner access blocked',
        detail: message,
        email: normalizedEmail,
        tone: 'warning',
      });
      Alert.alert('Trusted Access Blocked', message);
    } finally {
      setOwnerRecoveryLoading(false);
    }
  }, [normalizedEmail, ownerDirectAccess, router]);

  const handlePasswordReset = useCallback(async (targetEmail?: string) => {
    const resetTarget = sanitizeEmail(targetEmail ?? effectiveRecoveryEmail);
    if (!resetTarget) {
      Alert.alert('Enter Email', 'Please enter your owner email first, then tap Forgot.');
      return;
    }
    if (!validateEmail(resetTarget)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setPasswordResetLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const redirectTo = getPasswordResetRedirectUrl();
      console.log('[Login] Sending password reset email to:', resetTarget, 'redirect:', redirectTo);
      const { error } = await supabase.auth.resetPasswordForEmail(resetTarget, {
        redirectTo,
      });
      if (error) {
        throw error;
      }

      const detail = ownerRecoveryAudit?.emailMismatch && ownerRecoveryAudit.verifiedEmail === resetTarget
        ? `A reset link was sent to the verified owner email ${resetTarget} saved on this device.`
        : `A reset link was sent to ${resetTarget}.`;
      setAttemptState({
        status: 'success',
        title: 'Password reset email sent',
        detail,
        email: resetTarget,
        tone: 'success',
      });
      Alert.alert('Check Your Email', `${detail} Please check your inbox and spam folder.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not send reset email. Please try again.';
      setAttemptState({
        status: 'failed',
        title: 'Password reset failed',
        detail: message,
        email: resetTarget,
        tone: 'warning',
      });
      Alert.alert('Reset Failed', message);
    } finally {
      setPasswordResetLoading(false);
    }
  }, [effectiveRecoveryEmail, ownerRecoveryAudit?.emailMismatch, ownerRecoveryAudit?.verifiedEmail]);

  const handleLogin = async () => {
    setLastFailureReason(null);
    if (!email.trim()) {
      setAttemptState({
        status: 'failed',
        title: 'Email required',
        detail: 'Enter the exact owner or member email before submitting.',
        email: '',
        tone: 'warning',
      });
      Alert.alert('Missing Email', 'Please enter your email address.');
      shake();
      return;
    }
    if (!validateEmail(email.trim())) {
      setAttemptState({
        status: 'failed',
        title: 'Email format invalid',
        detail: 'The sign-in request was not sent because the email format is invalid.',
        email: email.trim(),
        tone: 'warning',
      });
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      shake();
      return;
    }
    const passwordForSignIn = password.trim();
    if (!passwordForSignIn) {
      setAttemptState({
        status: 'failed',
        title: 'Password required',
        detail: 'The app trims leading/trailing spaces, but it cannot sign in with an empty password.',
        email: sanitizeEmail(email),
        tone: 'warning',
      });
      Alert.alert('Missing Password', 'Please enter your password.');
      shake();
      return;
    }

    const identifier = sanitizeEmail(email);
    const rateCheck = checkAuthRateLimit(identifier);
    if (!rateCheck.allowed) {
      const lockedMessage = getRateLimitMessage(rateCheck.lockedUntilMs);
      setAttemptState({
        status: 'failed',
        title: 'Device cooldown active',
        detail: lockedMessage,
        email: identifier,
        tone: 'warning',
      });
      shake();
      Alert.alert('Account Locked', lockedMessage);
      return;
    }

    console.log('[Login] Starting rebuilt direct sign-in flow for:', identifier);
    setAttemptState({
      status: 'submitting',
      title: 'Checking live credentials',
      detail: 'Submitting your exact email/password to Supabase and waiting for a real session response.',
      email: identifier,
      tone: 'neutral',
    });
    setFailedLoginMessage(null);

    const result = await login(identifier, passwordForSignIn);
    if (result.success || result.requiresTwoFactor) {
      recordAuthAttempt(identifier, true);
    } else if (result.failureReason === 'invalid_credentials') {
      recordAuthAttempt(identifier, false);
    }

    if (result.success) {
      console.log('[Login] Direct sign-in succeeded for:', identifier);
      setLastFailureReason(null);
      setAttemptState({
        status: 'success',
        title: 'Session verified',
        detail: 'Supabase returned a live session. Opening your workspace now.',
        email: identifier,
        tone: 'success',
      });
      router.replace('/(tabs)' as any);
      return;
    }

    if (result.requiresTwoFactor) {
      setLastFailureReason(null);
      setAttemptState({
        status: 'success',
        title: 'Second factor required',
        detail: 'Your password was accepted. Enter the verification code to complete sign-in.',
        email: identifier,
        tone: 'neutral',
      });
      return;
    }

    shake();
    const normalizedMessage = result.message || 'Invalid email or password.';
    setLastFailureReason(result.failureReason ?? null);
    setFailedLoginMessage(normalizedMessage);

    const shouldAuditOwnerRecovery = shouldAuditOwnerRecoveryForFailure(result.failureReason, normalizedMessage);

    let audit: OwnerDirectAccessAuditResult | null = null;
    if (shouldAuditOwnerRecovery) {
      try {
        audit = await auditOwnerDirectAccess(identifier);
        setOwnerRecoveryAudit(audit);
      } catch (error: unknown) {
        console.log('[Login] Owner recovery audit failed:', error instanceof Error ? error.message : error);
      }
    }

    const nextRateCheck = result.failureReason === 'invalid_credentials'
      ? checkAuthRateLimit(identifier)
      : rateCheck;
    const baseFailureMessage = buildLoginFailureAlertMessage(
      normalizedMessage,
      result.failureReason,
      nextRateCheck.remainingAttempts,
      nextRateCheck.lockedUntilMs,
    );
    const msg = audit?.emailMismatch
      ? `${baseFailureMessage}\n\n${audit.message}`
      : baseFailureMessage;

    setAttemptState({
      status: 'failed',
      title: result.failureReason === 'admin_access_locked'
        ? 'Admin access is temporarily locked'
        : audit?.eligible
          ? result.failureReason === 'service_unavailable'
            ? 'Live sign-in unavailable, trusted owner restore available'
            : 'Direct sign-in blocked, trusted owner restore available'
          : audit?.emailMismatch
            ? 'Trusted owner email mismatch'
            : result.failureReason === 'service_unavailable'
              ? 'Live sign-in temporarily unavailable'
              : 'Server rejected this sign-in',
      detail: msg,
      email: identifier,
      tone: 'warning',
    });

    if (audit?.eligible) {
      Alert.alert(
        'Owner Access Available',
        `${msg}\n\nThis device is already verified for trusted owner recovery. You can restore owner access without signing in again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore Owner Access', onPress: () => { void handleOwnerTrustedRestore(); } },
        ]
      );
      return;
    }

    Alert.alert('Sign In Failed', msg);
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
  const rateLimitSnapshot = useMemo(() => {
    if (!normalizedEmail) {
      return { allowed: true, remainingAttempts: 0, lockedUntilMs: 0 };
    }

    return checkAuthRateLimit(normalizedEmail);
  }, [normalizedEmail, failedLoginMessage, lastFailureReason]);
  const ownerRepairReadinessQuery = useQuery<OwnerRepairReadiness>({
    queryKey: ['owner-repair-readiness'],
    queryFn: fetchOwnerRepairReadiness,
    staleTime: 60000,
    enabled: !openAccessMode,
  });
  const ownerRepairReadiness = ownerRepairReadinessQuery.data ?? getOwnerRepairReadiness();
  const loginIssueItems = useMemo<LoginIssueItem[]>(() => buildLoginIssueItems({
    failureReason: lastFailureReason,
    failedLoginMessage,
    attemptedEmail: normalizedEmail,
    remainingAttempts: rateLimitSnapshot.remainingAttempts,
    lockedUntilMs: rateLimitSnapshot.lockedUntilMs,
    audit: ownerRecoveryAudit,
    ownerRepairReadiness,
  }), [failedLoginMessage, lastFailureReason, normalizedEmail, ownerRecoveryAudit, ownerRepairReadiness, rateLimitSnapshot.lockedUntilMs, rateLimitSnapshot.remainingAttempts]);
  const criticalLoginIssues = useMemo<LoginIssueItem[]>(() => loginIssueItems.filter((item) => item.severity === 'critical'), [loginIssueItems]);
  const warningLoginIssues = useMemo<LoginIssueItem[]>(() => loginIssueItems.filter((item) => item.severity === 'warning'), [loginIssueItems]);
  const successLoginIssues = useMemo<LoginIssueItem[]>(() => loginIssueItems.filter((item) => item.severity === 'success'), [loginIssueItems]);
  const shouldShowOwnerAccessNotice = liveOwnerAuditLoading
    || isOwnerIPAccess
    || (isAuthenticated && isAdmin)
    || !!ownerRecoveryAudit?.eligible
    || !!ownerRecoveryAudit?.emailMismatch
    || !!ownerRecoveryAudit?.ownerDeviceVerified;
  const ownerAccessNoticeAccent = ownerRecoveryAudit?.eligible || isOwnerIPAccess
    ? Colors.success
    : ownerRecoveryAudit?.emailMismatch
      ? Colors.error
      : ownerRecoveryAudit?.ownerDeviceVerified
        ? Colors.warning
        : Colors.primary;
  const ownerAccessNoticeMessage = liveOwnerAuditLoading
    ? 'Checking whether this device still qualifies for trusted owner recovery.'
    : ownerRecoveryAudit?.eligible
      ? `Trusted owner recovery available${ownerRecoveryAudit.currentIP ? ` · ${ownerRecoveryAudit.currentIP}` : ''}`
      : ownerRecoveryAudit?.emailMismatch && ownerRecoveryAudit.verifiedEmail
        ? `Verified owner email on this device: ${ownerRecoveryAudit.verifiedEmail}`
        : ownerRecoveryAudit?.ownerDeviceVerified
          ? ownerRecoveryAudit.message
          : isOwnerIPAccess
            ? `Trusted owner device recognized${detectedIP ? ` · ${detectedIP}` : ''}`
            : 'Verified owner session detected. Open your owner access hub.';
  const ownerAccessNoticeLink = ownerRecoveryAudit?.eligible
    ? 'Restore owner access now'
    : ownerRecoveryAudit?.emailMismatch && ownerRecoveryAudit.verifiedEmail
      ? 'Send verified owner reset link'
      : ownerRecoveryAudit?.ownerDeviceVerified
        ? 'Open owner access audit'
        : 'Open owner access';
  const canSendPasswordReset = !!effectiveRecoveryEmail && validateEmail(effectiveRecoveryEmail);
  const shouldPromoteResetAction = !ownerRecoveryAudit?.eligible
    && canSendPasswordReset
    && lastFailureReason === 'invalid_credentials';
  const adminLockUpdateItems = useMemo<RecoveryTruthItem[]>(() => {
    return [
      {
        id: 'fix-update',
        title: 'What is already in place',
        detail: adminAccessLockFixUpdate,
      },
      {
        id: 'honest-lock-status',
        title: 'What is still blocking you',
        detail: adminAccessLockHonestStatus,
      },
      {
        id: 'next-step',
        title: 'What must happen next',
        detail: adminAccessLockNextStep,
      },
    ];
  }, [adminAccessLockFixUpdate, adminAccessLockHonestStatus, adminAccessLockNextStep]);
  const recoveryTruthItems = useMemo<RecoveryTruthItem[]>(() => {
    const resetTargetLabel = effectiveRecoveryEmail || 'your verified owner email';

    return [
      {
        id: 'truth-direct-signin',
        title: 'Normal owner sign-in',
        detail: 'This screen sends the entered email and password straight to Supabase. The server repair key is not used for that sign-in.',
      },
      {
        id: 'truth-service-role',
        title: ownerRepairReadiness.hasRealServiceRole
          ? 'Backend repair is ready if support truly needs it'
          : 'Backend repair is separate from your sign-in',
        detail: ownerRepairReadiness.hasRealServiceRole
          ? 'If support must inspect or repair an existing owner auth user directly, the backend has the required admin authority.'
          : 'A missing or bad service-role key only affects backend-only repair of an existing owner auth user. It did not cause the password rejection on this screen.',
      },
      {
        id: 'truth-fastest-path',
        title: 'Fastest safe path now',
        detail: ownerRecoveryAudit?.eligible
          ? 'This device is already trusted. Use restore to reopen owner access without another password entry.'
          : `Admin login cannot safely be removed from a new or unverified device. If the password is wrong or unknown, send a reset link to ${resetTargetLabel}, sign in with the new password, then verify this device again.`,
      },
    ];
  }, [effectiveRecoveryEmail, ownerRecoveryAudit?.eligible, ownerRepairReadiness.hasRealServiceRole]);

  if (openAccessMode) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={styles.openAccessContainer}>
            <Animated.View style={[styles.formCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <Text style={styles.title}>Workspace is open</Text>
              <Text style={styles.subtitle}>{openAccessMessage}</Text>
              <TouchableOpacity
                style={styles.signInBtn}
                onPress={() => router.replace('/(tabs)' as any)}
                activeOpacity={0.85}
                testID="login-open-app-direct"
              >
                <Text style={styles.signInBtnText}>Open App</Text>
                <ChevronRight size={20} color={Colors.black} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ownerAlternativeCard}
                activeOpacity={0.84}
                onPress={() => router.replace('/admin' as any)}
                testID="login-open-admin-direct"
              >
                <View style={styles.ownerAlternativeIconWrap}>
                  <Shield size={18} color={Colors.black} />
                </View>
                <View style={styles.ownerAlternativeContent}>
                  <Text style={styles.ownerAlternativeTitle}>Admin is open too</Text>
                  <Text style={styles.ownerAlternativeText}>Login is disabled in this build. Open Admin directly while emergency access recovery stays active.</Text>
                </View>
                <ChevronRight size={18} color={Colors.primary} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
                <Text style={styles.twoFASubtitle}>
                  {pendingTwoFactorEmail
                    ? `Enter the 6-digit code from ${pendingTwoFactorFactorLabel} to finish signing in as ${pendingTwoFactorEmail}.`
                    : `Enter the 6-digit code from ${pendingTwoFactorFactorLabel} to finish signing in.`}
                </Text>
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
                    testID={`login-2fa-digit-${i + 1}`}
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
              <View style={styles.logoCard}>
                <Image source={IVX_LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
              </View>
              <Text style={styles.brand}>IVX HOLDINGS LLC</Text>
              <Text style={styles.tagline}>Premium Real Estate Investing</Text>
            </Animated.View>

            <Animated.View style={[styles.formCard, {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { translateX: shakeAnim }],
            }]}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Use direct email/password sign-in first. Owner recovery stays available below if this device was already verified.</Text>

              {adminAccessLocked ? (
                <View style={styles.adminLockCard} testID="login-admin-lock-card">
                  <View style={styles.authAuditHeader}>
                    <Shield size={15} color={Colors.error} />
                    <Text style={styles.authAuditTitle}>Admin access locked</Text>
                  </View>
                  <Text style={styles.authAuditText}>{adminAccessLockMessage}</Text>
                  <View style={styles.truthList}>
                    {adminLockUpdateItems.map((item, index) => (
                      <View key={item.id} style={styles.truthRow}>
                        <View style={styles.truthIndexWrap}>
                          <Text style={styles.truthIndex}>{index + 1}</Text>
                        </View>
                        <View style={styles.truthBody}>
                          <Text style={styles.truthRowTitle}>{item.title}</Text>
                          <Text style={styles.truthRowDetail}>{item.detail}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View
                style={[
                  styles.authAuditCard,
                  attemptState.tone === 'success'
                    ? styles.authAuditCardSuccess
                    : attemptState.tone === 'warning'
                      ? styles.authAuditCardWarning
                      : styles.authAuditCardNeutral,
                ]}
                testID="login-auth-audit-card"
              >
                <View style={styles.authAuditHeader}>
                  <Shield
                    size={15}
                    color={attemptState.tone === 'success' ? Colors.success : attemptState.tone === 'warning' ? '#F59E0B' : Colors.primary}
                  />
                  <Text style={styles.authAuditTitle}>{attemptState.title}</Text>
                </View>
                <Text style={styles.authAuditText}>{attemptState.detail}</Text>
                {attemptState.email ? (
                  <View style={styles.authAuditEmailRow}>
                    <Text style={styles.authAuditEmailLabel}>Email checked</Text>
                    <Text style={styles.authAuditEmailValue}>{attemptState.email}</Text>
                  </View>
                ) : null}
              </View>

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
                  <TouchableOpacity
                    onPress={() => { void handlePasswordReset(); }}
                    disabled={passwordResetLoading}
                  >
                    <Text style={styles.forgotLink}>{passwordResetLoading ? 'Sending…' : 'Forgot?'}</Text>
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

              {shouldShowOwnerAccessNotice ? (
                <TouchableOpacity
                  style={styles.ownerAccessNotice}
                  testID="login-owner-access-notice"
                  activeOpacity={0.82}
                  onPress={ownerRecoveryAudit?.eligible
                    ? () => { void handleOwnerTrustedRestore(); }
                    : ownerRecoveryAudit?.emailMismatch && ownerRecoveryAudit.verifiedEmail
                      ? () => { void handlePasswordReset(ownerRecoveryAudit.verifiedEmail); }
                      : () => openOwnerAccess('owner-recovery')}
                  disabled={ownerRecoveryLoading || passwordResetLoading}
                >
                  {ownerRecoveryLoading || passwordResetLoading || liveOwnerAuditLoading ? (
                    <ActivityIndicator size="small" color={ownerAccessNoticeAccent} />
                  ) : (
                    <Shield size={16} color={ownerAccessNoticeAccent} />
                  )}
                  <View style={styles.ownerAccessNoticeContent}>
                    <Text style={styles.ownerAccessNoticeText}>{ownerAccessNoticeMessage}</Text>
                    <Text style={[styles.ownerAccessLink, { color: ownerAccessNoticeAccent }]}>{ownerAccessNoticeLink}</Text>
                  </View>
                  <ChevronRight size={16} color={ownerAccessNoticeAccent} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.ownerAlternativeCard}
                activeOpacity={0.84}
                onPress={() => {
                  openOwnerAccess('login');
                }}
                testID="login-owner-alternative"
              >
                <View style={styles.ownerAlternativeIconWrap}>
                  <Shield size={18} color={Colors.black} />
                </View>
                <View style={styles.ownerAlternativeContent}>
                  <Text style={styles.ownerAlternativeTitle}>{adminAccessLocked ? 'Owner-only admin access' : 'Owner access alternative'}</Text>
                  <Text style={styles.ownerAlternativeText}>{adminAccessLocked ? `${adminAccessLockMessage} If this is the configured owner account, open Owner Access to continue with the owner-only route.` : 'If this is your project owner account, do not use public signup. Open Owner Access to restore trusted-device access, confirm the carried owner email, or use the safe reset path. Admin login is not removed on new devices.'}</Text>
                </View>
                <ChevronRight size={18} color={Colors.primary} />
              </TouchableOpacity>

              <View style={styles.truthCard} testID="login-truth-card">
                <Text style={styles.truthTitle}>Straight answer</Text>
                <Text style={styles.truthSubtitle}>Why the server repair key came up, and what actually gets you back in fastest.</Text>
                <View style={styles.truthList}>
                  {recoveryTruthItems.map((item, index) => (
                    <View key={item.id} style={styles.truthRow}>
                      <View style={styles.truthIndexWrap}>
                        <Text style={styles.truthIndex}>{index + 1}</Text>
                      </View>
                      <View style={styles.truthBody}>
                        <Text style={styles.truthRowTitle}>{item.title}</Text>
                        <Text style={styles.truthRowDetail}>{item.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {failedLoginMessage ? (
                <View style={styles.loginFailureCard} testID="login-failure-card">
                  <View style={styles.loginFailureHeader}>
                    <Shield size={15} color={lastFailureReason === 'admin_access_locked' ? Colors.error : ownerRecoveryAudit?.eligible ? Colors.success : '#F59E0B'} />
                    <Text style={styles.loginFailureTitle}>{lastFailureReason === 'admin_access_locked' ? 'Admin access locked' : ownerRecoveryAudit?.eligible ? 'Owner recovery is available' : ownerRecoveryAudit?.emailMismatch ? 'Trusted owner email mismatch' : 'Sign-in needs attention'}</Text>
                  </View>
                  <Text style={styles.loginFailureText}>{failedLoginMessage}</Text>
                  <Text style={styles.loginFailureHint}>
                    {lastFailureReason === 'admin_access_locked'
                      ? adminAccessLockMessage
                      : ownerRecoveryAudit?.eligible
                        ? 'This device is already trusted. Restore owner access instantly or open the owner hub.'
                        : ownerRecoveryAudit?.emailMismatch && ownerRecoveryAudit.verifiedEmail
                          ? `Use ${ownerRecoveryAudit.verifiedEmail} on Sign In or open Owner Access to continue with the verified owner route.`
                          : 'If this is your owner account, use Owner Access instead of creating a new public account.'}
                  </Text>
                  {normalizedEmail ? (
                    <View style={styles.failedEmailChip} testID="login-failed-email-chip">
                      <Text style={styles.failedEmailChipLabel}>Last attempted owner email</Text>
                      <Text style={styles.failedEmailChipValue}>{normalizedEmail}</Text>
                    </View>
                  ) : null}
                  {loginIssueItems.length > 0 ? (
                    <View style={styles.issueMatrix} testID="login-issue-matrix">
                      {criticalLoginIssues.length > 0 ? (
                        <View style={styles.issueGroup}>
                          <Text style={[styles.issueGroupTitle, styles.issueGroupTitleCritical]}>Red blockers</Text>
                          {criticalLoginIssues.map((item, index) => (
                            <View key={item.id} style={[styles.issueRow, styles.issueRowCritical]}>
                              <View style={[styles.issueIndexWrap, styles.issueIndexWrapCritical]}>
                                <Text style={styles.issueIndex}>{index + 1}</Text>
                              </View>
                              <View style={styles.issueBody}>
                                <Text style={styles.issueTitle}>{item.title}</Text>
                                <Text style={styles.issueDetail}>{item.detail}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {warningLoginIssues.length > 0 ? (
                        <View style={styles.issueGroup}>
                          <Text style={[styles.issueGroupTitle, styles.issueGroupTitleWarning]}>Yellow warnings</Text>
                          {warningLoginIssues.map((item, index) => (
                            <View key={item.id} style={[styles.issueRow, styles.issueRowWarning]}>
                              <View style={[styles.issueIndexWrap, styles.issueIndexWrapWarning]}>
                                <Text style={styles.issueIndex}>{index + 1}</Text>
                              </View>
                              <View style={styles.issueBody}>
                                <Text style={styles.issueTitle}>{item.title}</Text>
                                <Text style={styles.issueDetail}>{item.detail}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      {successLoginIssues.length > 0 ? (
                        <View style={styles.issueGroup}>
                          <Text style={[styles.issueGroupTitle, styles.issueGroupTitleSuccess]}>Verified recovery paths</Text>
                          {successLoginIssues.map((item, index) => (
                            <View key={item.id} style={[styles.issueRow, styles.issueRowSuccess]}>
                              <View style={[styles.issueIndexWrap, styles.issueIndexWrapSuccess]}>
                                <Text style={styles.issueIndex}>{index + 1}</Text>
                              </View>
                              <View style={styles.issueBody}>
                                <Text style={styles.issueTitle}>{item.title}</Text>
                                <Text style={styles.issueDetail}>{item.detail}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.loginFailureActions}>
                    {ownerRecoveryAudit?.eligible ? (
                      <TouchableOpacity
                        style={[styles.loginFailurePrimaryAction, ownerRecoveryLoading && styles.loginFailureActionDisabled]}
                        activeOpacity={0.84}
                        onPress={() => { void handleOwnerTrustedRestore(); }}
                        disabled={ownerRecoveryLoading}
                        testID="login-restore-owner-access"
                      >
                        {ownerRecoveryLoading ? (
                          <ActivityIndicator size="small" color={Colors.black} />
                        ) : (
                          <>
                            <Text style={styles.loginFailurePrimaryActionText}>Restore owner access</Text>
                            <ChevronRight size={16} color={Colors.black} />
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {canSendPasswordReset ? (
                      <TouchableOpacity
                        style={[
                          shouldPromoteResetAction ? styles.loginFailurePrimaryAction : styles.loginFailureSecondaryAction,
                          passwordResetLoading && styles.loginFailureActionDisabled,
                        ]}
                        activeOpacity={0.84}
                        onPress={() => { void handlePasswordReset(); }}
                        disabled={passwordResetLoading}
                        testID="login-reset-owner-password"
                      >
                        {passwordResetLoading ? (
                          <ActivityIndicator size="small" color={shouldPromoteResetAction ? Colors.black : Colors.text} />
                        ) : shouldPromoteResetAction ? (
                          <>
                            <Text style={styles.loginFailurePrimaryActionText}>Reset password now</Text>
                            <ChevronRight size={16} color={Colors.black} />
                          </>
                        ) : (
                          <Text style={styles.loginFailureSecondaryActionText}>Send reset link</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.loginFailureSecondaryAction}
                      activeOpacity={0.84}
                      onPress={() => openOwnerAccess('login-failure')}
                      testID="login-open-owner-hub"
                    >
                      <Text style={styles.loginFailureSecondaryActionText}>Open owner hub</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

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
  openAccessContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: 20,
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
  logoCard: {
    borderRadius: 24,
    padding: 8,
    backgroundColor: '#090909',
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    marginBottom: 14,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 20,
    backgroundColor: '#090909',
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
    marginBottom: 18,
    lineHeight: 20,
  },
  authAuditCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
    gap: 8,
  },
  authAuditCardNeutral: {
    borderColor: Colors.primary + '26',
    backgroundColor: Colors.primary + '10',
  },
  authAuditCardSuccess: {
    borderColor: Colors.success + '2E',
    backgroundColor: Colors.success + '12',
  },
  authAuditCardWarning: {
    borderColor: '#F59E0B35',
    backgroundColor: '#1B1409',
  },
  authAuditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authAuditTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  authAuditText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  authAuditEmailRow: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF10',
    backgroundColor: '#050A11',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  authAuditEmailLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  authAuditEmailValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
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
  ownerAccessNotice: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '2A',
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ownerAccessNoticeContent: {
    flex: 1,
  },
  ownerAccessNoticeText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  ownerAccessLink: {
    marginTop: 4,
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  adminLockCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EF444440',
    backgroundColor: '#1B0B0B',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  ownerAlternativeCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3B82F638',
    backgroundColor: '#07111D',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ownerAlternativeCardDisabled: {
    opacity: 0.52,
  },
  ownerAlternativeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  ownerAlternativeContent: {
    flex: 1,
  },
  ownerAlternativeTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  ownerAlternativeText: {
    marginTop: 3,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  truthCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E3A5F',
    backgroundColor: '#0E1726',
    padding: 14,
    gap: 10,
  },
  truthTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  truthSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  truthList: {
    gap: 10,
  },
  truthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  truthIndexWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  truthIndex: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '900' as const,
  },
  truthBody: {
    flex: 1,
    gap: 3,
  },
  truthRowTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  truthRowDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  loginFailureCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F59E0B30',
    backgroundColor: '#18120A',
    padding: 14,
    gap: 10,
  },
  loginFailureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginFailureTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  loginFailureText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
  },
  loginFailureHint: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  failedEmailChip: {
    marginTop: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFFFFF12',
    backgroundColor: '#080F18',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  failedEmailChipLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  failedEmailChipValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  issueMatrix: {
    gap: 12,
  },
  issueGroup: {
    gap: 8,
  },
  issueGroupTitle: {
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  issueGroupTitleCritical: {
    color: Colors.error,
  },
  issueGroupTitleWarning: {
    color: Colors.warning,
  },
  issueGroupTitleSuccess: {
    color: Colors.success,
  },
  issueRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  issueRowCritical: {
    borderColor: Colors.error + '30',
    backgroundColor: '#1A0B0B',
  },
  issueRowWarning: {
    borderColor: Colors.warning + '30',
    backgroundColor: '#1B1409',
  },
  issueRowSuccess: {
    borderColor: Colors.success + '30',
    backgroundColor: '#08140C',
  },
  issueIndexWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  issueIndexWrapCritical: {
    backgroundColor: Colors.error,
  },
  issueIndexWrapWarning: {
    backgroundColor: Colors.warning,
  },
  issueIndexWrapSuccess: {
    backgroundColor: Colors.success,
  },
  issueIndex: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  issueBody: {
    flex: 1,
    gap: 3,
  },
  issueTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  issueDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  loginFailureActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  loginFailurePrimaryAction: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loginFailurePrimaryActionText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  loginFailureSecondaryAction: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF14',
    backgroundColor: '#FFFFFF0A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginFailureSecondaryActionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  loginFailureActionDisabled: {
    opacity: 0.6,
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
