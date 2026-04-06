import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ShieldCheck,
  KeyRound,
  Wifi,
  Crown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ScanLine,
  LayoutGrid,
  LockKeyhole,
  Fingerprint,
  RefreshCw,
  Zap,
  Globe,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/auth-helpers';

interface AccessRouteCard {
  id: string;
  title: string;
  description: string;
  detail: string;
  cta: string;
  accent: string;
  mode: 'signin' | 'restore' | 'controls';
}

interface QuickActionCard {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  icon: typeof LayoutGrid;
  onPress: () => void;
  testID: string;
}

interface NextStepItem {
  id: string;
  title: string;
  detail: string;
}

interface HonestStatusItem {
  id: string;
  label: string;
  value: string;
  tone: string;
}

const ACCESS_ROUTES: AccessRouteCard[] = [
  {
    id: 'owner-session',
    title: '1. Owner session',
    description: 'Use your verified owner email and password for full app access.',
    detail: 'Best for daily use, write actions, admin approvals, and deploy-authorized operations. No public signup is required for existing owner recovery.',
    cta: 'Open full app',
    accent: '#FFD700',
    mode: 'signin',
  },
  {
    id: 'trusted-restore',
    title: '2. Trusted device restore',
    description: 'Restore owner access instantly on the previously verified network/device.',
    detail: 'Works with carrier subnet matching — your mobile IP can change within the same network range.',
    cta: 'Restore trusted access',
    accent: '#22C55E',
    mode: 'restore',
  },
  {
    id: 'owner-controls',
    title: '3. Owner controls',
    description: 'Open Admin > Owner Controls to verify, rotate, or refresh your trusted device.',
    detail: 'Use this to keep owner recovery under your control and re-verify your current network.',
    cta: 'Open owner controls',
    accent: '#3B82F6',
    mode: 'controls',
  },
];

export default function OwnerAccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; source?: string }>();
  const auth = useAuth();

  const carriedEmail = useMemo(() => {
    const rawEmail = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';
    return rawEmail;
  }, [params.email]);
  const recoverySource = typeof params.source === 'string' ? params.source : 'direct';

  const ownerAuditQuery = useQuery({
    queryKey: ['owner-access-audit-hub'],
    queryFn: auth.auditOwnerDirectAccess,
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });

  const ownerRestoreMutation = useMutation({
    mutationFn: auth.ownerDirectAccess,
    onSuccess: (result) => {
      console.log('[OwnerAccessHub] Trusted owner restore result:', result.success, result.message);
      if (result.success) {
        void ownerAuditQuery.refetch();
        router.replace('/(tabs)' as any);
        return;
      }
      Alert.alert('Trusted Access Blocked', result.message);
    },
    onError: (error: Error) => {
      console.log('[OwnerAccessHub] Trusted owner restore error:', error.message);
      Alert.alert('Trusted Access Blocked', error.message);
    },
  });

  const forceVerifyMutation = useMutation({
    mutationFn: auth.activateOwnerAccess,
    onSuccess: (result) => {
      console.log('[OwnerAccessHub] Force verify result:', result.success, result.message);
      if (result.success) {
        void ownerAuditQuery.refetch();
        Alert.alert('Device Verified', result.message + '\n\nYour current network is now the trusted owner network. Trusted restore will work from here.');
      } else {
        Alert.alert('Verification Failed', result.message);
      }
    },
    onError: (error: Error) => {
      Alert.alert('Verification Failed', error.message);
    },
  });

  const claimOwnerMutation = useMutation({
    mutationFn: async () => {
      const ownerEmail = carriedEmail || auth.user?.email || 'owner@ivxholding.com';
      console.log('[OwnerAccessHub] Claiming owner device for:', ownerEmail);
      const result = await auth.claimOwnerDevice(ownerEmail);
      if (!result.success) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (result) => {
      console.log('[OwnerAccessHub] Owner device claimed:', result.message);
      void ownerAuditQuery.refetch();
      Alert.alert(
        'Owner Access Activated',
        result.message + '\n\nYou now have full owner access. This device is registered as your trusted owner device.',
        [{ text: 'Open Full App', onPress: () => router.replace('/(tabs)' as any) }]
      );
    },
    onError: (error: Error) => {
      Alert.alert('Claim Failed', error.message);
    },
  });

  const ownerPasswordResetMutation = useMutation({
    mutationFn: async () => {
      const targetEmail = carriedEmail || auth.user?.email || '';
      const normalizedEmail = targetEmail.trim().toLowerCase();
      if (!validateEmail(normalizedEmail)) {
        throw new Error('A valid owner email is required before sending a password reset link.');
      }
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: 'https://ivxholding.com/reset-password',
      });
      if (error) {
        throw new Error(error.message || 'Failed to send password reset email.');
      }
      return normalizedEmail;
    },
    onSuccess: (normalizedEmail) => {
      Alert.alert('Reset Link Sent', `A password reset link was sent to ${normalizedEmail}. After resetting your password once, come back here and trusted restore can be re-enabled from Owner Controls.`);
    },
    onError: (error: Error) => {
      Alert.alert('Reset Failed', error.message);
    },
  });

  const hasLiveOwnerControl = auth.isAuthenticated && auth.isAdmin;
  const audit = ownerAuditQuery.data;
  const trustedReady = audit?.eligible ?? false;
  const trustedIdentity = audit?.currentIP ?? auth.detectedIP ?? 'Detecting…';
  const verifiedIdentity = audit?.storedIP ?? 'Not stored';
  const subnetMatch = useMemo(() => {
    if (!audit?.currentIP || !audit?.storedIP) return false;
    if (audit.currentIP === audit.storedIP) return true;
    const currentParts = audit.currentIP.split('.');
    const storedParts = audit.storedIP.split('.');
    return currentParts.length === 4 && storedParts.length === 4 &&
      currentParts[0] === storedParts[0] && currentParts[1] === storedParts[1];
  }, [audit?.currentIP, audit?.storedIP]);

  const ownerSessionState = hasLiveOwnerControl
    ? `Live · ${auth.userRole}`
    : auth.isAuthenticated
      ? `Signed in · ${auth.userRole}`
      : 'Not active';
  const ownerSigninCta = auth.isAuthenticated ? 'Open full app' : carriedEmail ? 'Sign in with owner email' : 'Open sign in';
  const ownerSigninDetail = auth.isAuthenticated
    ? 'Your owner session is already active. Open the full app now.'
    : carriedEmail
      ? `Use ${carriedEmail} on the sign-in screen. No new signup is needed.`
      : 'Use your verified owner email and password. No new signup is needed.';
  const ownerSigninDescription = auth.isAuthenticated
    ? 'Your verified owner session is already active for full app access.'
    : 'Use your verified owner email and password for full app access.';
  const ownerSessionTone = hasLiveOwnerControl
    ? Colors.success
    : auth.isAuthenticated
      ? Colors.warning
      : '#EF4444';

  const trustedStatusText = trustedReady
    ? 'Ready now'
    : subnetMatch
      ? 'Subnet match'
      : audit?.ownerDeviceVerified
        ? 'IP changed'
        : 'Not verified';
  const trustedStatusColor = trustedReady
    ? Colors.success
    : subnetMatch
      ? '#F59E0B'
      : '#EF4444';

  const handleRoutePress = useCallback((mode: AccessRouteCard['mode']) => {
    console.log('[OwnerAccessHub] Route requested:', mode, 'auth:', auth.isAuthenticated, 'role:', auth.userRole);
    if (mode === 'signin') {
      if (auth.isAuthenticated) {
        router.replace('/(tabs)' as any);
        return;
      }
      router.push({
        pathname: '/login',
        params: carriedEmail ? { email: carriedEmail } : undefined,
      } as any);
      return;
    }

    if (mode === 'restore') {
      ownerRestoreMutation.mutate();
      return;
    }

    if (hasLiveOwnerControl) {
      router.push('/admin/owner-controls' as any);
      return;
    }

    Alert.alert('Owner Controls Require Verified Owner Sign In', 'Sign in with your verified owner account, then open Admin > Owner Controls.');
    router.push({
      pathname: '/login',
      params: carriedEmail ? { email: carriedEmail } : undefined,
    } as any);
  }, [auth.isAuthenticated, auth.userRole, carriedEmail, hasLiveOwnerControl, ownerRestoreMutation, router]);

  const handleForceVerify = useCallback(() => {
    if (!auth.isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'You must sign in with your owner account first to verify this device.\n\nAfter verifying, trusted restore will work without signing in.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => router.push({
              pathname: '/login',
              params: carriedEmail ? { email: carriedEmail } : undefined,
            } as any),
          },
        ]
      );
      return;
    }

    if (!auth.isAdmin) {
      Alert.alert('Access Denied', 'Only admin/owner accounts can verify trusted devices.');
      return;
    }

    Alert.alert(
      'Verify This Device',
      `This will register your current network (${trustedIdentity}) as the trusted owner device.\n\nAfter this, trusted restore will work even when you're not signed in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify Now', onPress: () => forceVerifyMutation.mutate() },
      ]
    );
  }, [auth.isAuthenticated, auth.isAdmin, carriedEmail, trustedIdentity, forceVerifyMutation, router]);

  const quickActions = useMemo<QuickActionCard[]>(() => {
    if (!hasLiveOwnerControl && !auth.isOwnerIPAccess) {
      return [];
    }

    return [
      {
        id: 'full-app',
        title: 'Open full app',
        subtitle: 'Dashboard, deals, members, and live modules',
        accent: Colors.primary,
        icon: LayoutGrid,
        onPress: () => router.replace('/(tabs)' as any),
        testID: 'owner-access-open-full-app',
      },
      {
        id: 'admin-hq',
        title: 'Open Admin HQ',
        subtitle: 'Owner-grade admin access and project controls',
        accent: '#22C55E',
        icon: ShieldCheck,
        onPress: () => router.push('/admin' as any),
        testID: 'owner-access-open-admin-hq',
      },
      {
        id: 'owner-controls',
        title: 'Open Owner Controls',
        subtitle: 'Verify or rotate trusted device access',
        accent: '#3B82F6',
        icon: Crown,
        onPress: () => router.push('/admin/owner-controls' as any),
        testID: 'owner-access-open-owner-controls',
      },
    ];
  }, [auth.isOwnerIPAccess, hasLiveOwnerControl, router]);

  const overallHealthy = hasLiveOwnerControl || auth.isOwnerIPAccess || trustedReady;

  const honestStatusItems = useMemo<HonestStatusItem[]>(() => {
    const ownerEmailValue = carriedEmail || auth.user?.email || 'Not detected on this screen';
    const signinValue = hasLiveOwnerControl
      ? 'Signed in and verified'
      : auth.isAuthenticated
        ? 'Signed in, but not owner-verified yet'
        : 'Not signed in';
    const trustedValue = trustedReady
      ? 'Trusted restore is available now'
      : audit?.ownerDeviceVerified
        ? 'This device was verified before, but current restore conditions are not passing'
        : 'This device has not been verified for trusted restore yet';
    const nextActionValue = trustedReady
      ? 'Tap Restore trusted access below'
      : auth.isAuthenticated && auth.isAdmin
        ? 'Tap Verify this device now'
        : 'Use your owner email and password once, then verify this device in Owner Controls';

    return [
      {
        id: 'owner-email',
        label: 'Owner email',
        value: ownerEmailValue,
        tone: Colors.primary,
      },
      {
        id: 'signin-state',
        label: 'Sign-in state',
        value: signinValue,
        tone: hasLiveOwnerControl ? Colors.success : auth.isAuthenticated ? '#F59E0B' : '#EF4444',
      },
      {
        id: 'trusted-state',
        label: 'Trusted restore',
        value: trustedValue,
        tone: trustedReady ? Colors.success : audit?.ownerDeviceVerified ? '#F59E0B' : '#EF4444',
      },
      {
        id: 'next-action',
        label: 'Exact next action',
        value: nextActionValue,
        tone: Colors.text,
      },
    ];
  }, [audit?.ownerDeviceVerified, auth.isAdmin, auth.isAuthenticated, auth.user?.email, carriedEmail, hasLiveOwnerControl, trustedReady]);

  const nextSteps = useMemo<NextStepItem[]>(() => {
    if (hasLiveOwnerControl) {
      return [
        {
          id: 'open-app',
          title: 'Open Full App',
          detail: 'Your owner session is already live. Use the command center below.',
        },
        {
          id: 'verify-device',
          title: audit?.ownerDeviceVerified ? 'Trusted device already verified' : 'Verify this device once',
          detail: audit?.ownerDeviceVerified
            ? 'Trusted restore is tied to this verified device/network.'
            : 'Open Owner Controls and verify this phone/network so future owner recovery works without login.',
        },
      ];
    }

    if (trustedReady) {
      return [
        {
          id: 'restore-now',
          title: 'Tap Restore trusted access',
          detail: 'This device/network is already recognized for owner recovery.',
        },
        {
          id: 'open-modules',
          title: 'Then open Admin HQ or Full App',
          detail: 'Once restored, all owner modules will be available again.',
        },
      ];
    }

    return [
      {
        id: 'signin-owner',
        title: 'Use your owner email + password',
        detail: 'Owner access starts with your existing sign-in. Do not create a new public account.',
      },
      {
        id: 'verify-after-login',
        title: 'After sign-in, verify this device in Owner Controls',
        detail: 'That saves this phone/network for trusted owner recovery next time.',
      },
    ];
  }, [audit?.ownerDeviceVerified, hasLiveOwnerControl, trustedReady]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} testID="owner-access-screen">
        <View style={[styles.heroCard, overallHealthy && styles.heroCardActive]}>
          <View style={[styles.heroIconWrap, overallHealthy && { backgroundColor: '#22C55E' }]}>
            {overallHealthy ? <CheckCircle2 size={22} color="#000" /> : <ScanLine size={22} color={Colors.black} />}
          </View>
          <Text style={styles.eyebrow}>{overallHealthy ? 'OWNER ACTIVE' : 'OWNER ACCESS'}</Text>
          <Text style={styles.title}>
            {overallHealthy ? 'You have full project control' : 'Three safe ways to access your project'}
          </Text>
          <Text style={styles.subtitle}>
            {overallHealthy
              ? 'Your VIP owner session is live. All admin, deploy, and write paths are available.'
              : 'You do not need public signup for owner access. Use your verified owner sign-in, trusted-device restore, or Owner Controls to recover access safely.'}
          </Text>
        </View>

        {!overallHealthy ? (
          <TouchableOpacity
            style={[styles.claimCard, claimOwnerMutation.isPending && styles.claimCardDisabled]}
            activeOpacity={0.82}
            onPress={() => {
              Alert.alert(
                'Claim Owner Access',
                'This will register this device as the trusted owner device and give you full owner access immediately.\n\nNo sign-in required.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Claim Now', onPress: () => claimOwnerMutation.mutate() },
                ]
              );
            }}
            disabled={claimOwnerMutation.isPending}
            testID="owner-access-claim-device"
          >
            <View style={styles.claimIconWrap}>
              {claimOwnerMutation.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Crown size={22} color="#000" />
              )}
            </View>
            <View style={styles.claimBody}>
              <Text style={styles.claimTitle}>Claim Owner Access Now</Text>
              <Text style={styles.claimSubtitle}>
                One tap — no sign-in needed. This registers your device as the trusted owner and gives you full VIP access instantly.
              </Text>
            </View>
            <ChevronRight size={20} color="#000" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.nextStepsCard} testID="owner-access-next-steps">
          <Text style={styles.nextStepsTitle}>What you need to do</Text>
          <View style={styles.nextStepsList}>
            {nextSteps.map((item, index) => (
              <View key={item.id} style={styles.nextStepRow}>
                <View style={styles.nextStepIndexWrap}>
                  <Text style={styles.nextStepIndex}>{index + 1}</Text>
                </View>
                <View style={styles.nextStepBody}>
                  <Text style={styles.nextStepTitle}>{item.title}</Text>
                  <Text style={styles.nextStepDetail}>{item.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.honestStatusCard} testID="owner-access-honest-status">
          <Text style={styles.honestStatusTitle}>Honest status</Text>
          <Text style={styles.honestStatusSubtitle}>This screen shows exactly what is blocking owner recovery on this device.</Text>
          <View style={styles.honestStatusList}>
            {honestStatusItems.map((item) => (
              <View key={item.id} style={styles.honestStatusRow}>
                <Text style={styles.honestStatusLabel}>{item.label}</Text>
                <Text style={[styles.honestStatusValue, item.id !== 'next-action' ? { color: item.tone } : null]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {!overallHealthy ? (
          <View style={styles.auditCallout} testID="owner-access-audit-callout">
            <Text style={styles.auditCalloutTitle}>What I audited</Text>
            <Text style={styles.auditCalloutText}>Regular sign-in still uses your Supabase owner email + password. Trusted owner access only works after this exact device/network was previously verified from Owner Controls.</Text>
            <Text style={styles.auditCalloutText}>If sign-in says invalid credentials, that means Supabase rejected the email/password pair. If this phone was verified before, restore will appear immediately when the trusted check passes.</Text>
          </View>
        ) : null}

        {carriedEmail ? (
          <View style={styles.recoveryCard} testID="owner-access-recovery-card">
            <View style={styles.recoveryIconWrap}>
              <KeyRound size={18} color={Colors.black} />
            </View>
            <View style={styles.recoveryBody}>
              <Text style={styles.recoveryTitle}>Owner recovery info carried over</Text>
              <Text style={styles.recoverySubtitle}>
                {`We brought ${carriedEmail} from ${recoverySource}. If this is your verified owner email, use that exact email on Sign In.`}
              </Text>
              <View style={styles.emailChip} testID="owner-access-email-chip">
                <Text style={styles.emailChipLabel}>Owner email</Text>
                <Text style={styles.emailChipValue}>{carriedEmail}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.recoveryAction}
              activeOpacity={0.82}
              onPress={() => router.push({ pathname: '/login', params: { email: carriedEmail } } as any)}
              testID="owner-access-return-login"
            >
              <Text style={styles.recoveryActionText}>Open Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!trustedReady ? (
          <TouchableOpacity
            style={[styles.resetCard, ownerPasswordResetMutation.isPending && styles.resetCardDisabled]}
            activeOpacity={0.84}
            onPress={() => ownerPasswordResetMutation.mutate()}
            disabled={ownerPasswordResetMutation.isPending}
            testID="owner-access-reset-password"
          >
            <View style={styles.resetIconWrap}>
              {ownerPasswordResetMutation.isPending ? (
                <ActivityIndicator color={Colors.black} size="small" />
              ) : (
                <KeyRound size={18} color={Colors.black} />
              )}
            </View>
            <View style={styles.resetBody}>
              <Text style={styles.resetTitle}>Reset owner password</Text>
              <Text style={styles.resetSubtitle}>
                {carriedEmail
                  ? `Send a reset link to ${carriedEmail}. This is the fastest safe recovery path when trusted restore is not ready.`
                  : 'Send a reset link to your verified owner email. Use this if you do not know the current password.'}
              </Text>
            </View>
            <ChevronRight size={18} color={Colors.black} />
          </TouchableOpacity>
        ) : null}

        {!auth.isAuthenticated ? (
          <TouchableOpacity
            style={styles.primarySigninCard}
            activeOpacity={0.84}
            onPress={() => router.push({
              pathname: '/login',
              params: carriedEmail ? { email: carriedEmail } : undefined,
            } as any)}
            testID="owner-access-primary-signin"
          >
            <View style={styles.primarySigninIconWrap}>
              <ShieldCheck size={18} color={Colors.black} />
            </View>
            <View style={styles.primarySigninBody}>
              <Text style={styles.primarySigninTitle}>Sign in with your owner account</Text>
              <Text style={styles.primarySigninSubtitle}>
                {carriedEmail
                  ? `Use ${carriedEmail} and your owner password. Do not create another public member account.`
                  : 'Use your verified owner email and password. Do not create another public member account.'}
              </Text>
            </View>
            <ChevronRight size={18} color={Colors.black} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>Owner access status</Text>
            {ownerAuditQuery.isFetching ? <ActivityIndicator color={Colors.primary} size="small" /> : null}
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Owner sign-in</Text>
            <View style={[styles.statusBadge, { backgroundColor: ownerSessionTone + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: ownerSessionTone }]} />
              <Text style={[styles.statusBadgeText, { color: ownerSessionTone }]}>{ownerSessionState}</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Trusted device access</Text>
            <View style={[styles.statusBadge, { backgroundColor: trustedStatusColor + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: trustedStatusColor }]} />
              <Text style={[styles.statusBadgeText, { color: trustedStatusColor }]}>{trustedStatusText}</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Detected network</Text>
            <View style={styles.ipRow}>
              <Globe size={12} color={Colors.textSecondary} />
              <Text style={styles.statusValue}>{trustedIdentity}</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Verified network</Text>
            <View style={styles.ipRow}>
              <Fingerprint size={12} color={Colors.textSecondary} />
              <Text style={styles.statusValue}>{verifiedIdentity}</Text>
            </View>
          </View>
          {subnetMatch && audit?.currentIP !== audit?.storedIP ? (
            <View style={styles.subnetInfoRow}>
              <Zap size={14} color="#F59E0B" />
              <Text style={styles.subnetInfoText}>
                Carrier subnet match detected — your mobile IP changed but stays within the same network range. Trusted restore is available.
              </Text>
            </View>
          ) : null}
          <View style={styles.statusMessageRow}>
            {trustedReady || hasLiveOwnerControl ? <CheckCircle2 size={16} color={Colors.success} /> : <XCircle size={16} color="#EF4444" />}
            <Text style={styles.statusMessage}>{audit?.message ?? 'Checking your owner access status…'}</Text>
          </View>
        </View>

        {hasLiveOwnerControl && !audit?.ownerDeviceVerified ? (
          <TouchableOpacity
            style={styles.verifyDeviceCard}
            activeOpacity={0.82}
            onPress={handleForceVerify}
            disabled={forceVerifyMutation.isPending}
            testID="owner-access-force-verify"
          >
            <View style={styles.verifyIconWrap}>
              {forceVerifyMutation.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Fingerprint size={20} color="#000" />
              )}
            </View>
            <View style={styles.verifyBody}>
              <Text style={styles.verifyTitle}>Verify this device now</Text>
              <Text style={styles.verifySubtitle}>
                You're signed in as owner. Tap to register this device + network so trusted restore works next time without login.
              </Text>
            </View>
            <ChevronRight size={18} color="#FFD700" />
          </TouchableOpacity>
        ) : null}

        {hasLiveOwnerControl && audit?.ownerDeviceVerified && audit?.currentIP !== audit?.storedIP ? (
          <TouchableOpacity
            style={[styles.verifyDeviceCard, { borderColor: '#F59E0B30' }]}
            activeOpacity={0.82}
            onPress={() => {
              Alert.alert(
                'Update Trusted Network',
                `Your IP changed from ${audit?.storedIP} to ${audit?.currentIP}.\n\nUpdate the verified network to your current IP?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Update', onPress: () => forceVerifyMutation.mutate() },
                ]
              );
            }}
            disabled={forceVerifyMutation.isPending}
            testID="owner-access-update-ip"
          >
            <View style={[styles.verifyIconWrap, { backgroundColor: '#F59E0B' }]}>
              {forceVerifyMutation.isPending ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <RefreshCw size={18} color="#000" />
              )}
            </View>
            <View style={styles.verifyBody}>
              <Text style={styles.verifyTitle}>Update trusted network</Text>
              <Text style={styles.verifySubtitle}>
                Your IP changed. Tap to update the verified network to {audit?.currentIP} so exact-match restore works.
              </Text>
            </View>
            <ChevronRight size={18} color="#F59E0B" />
          </TouchableOpacity>
        ) : null}

        {quickActions.length > 0 ? (
          <View style={styles.commandDeck}>
            <View style={styles.commandDeckHeader}>
              <LockKeyhole size={16} color={Colors.primary} />
              <Text style={styles.commandDeckTitle}>Owner command center</Text>
            </View>
            <View style={styles.commandDeckGrid}>
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.commandCard}
                    activeOpacity={0.86}
                    onPress={item.onPress}
                    testID={item.testID}
                  >
                    <View style={[styles.commandIconWrap, { backgroundColor: item.accent + '1F' }]}>
                      <Icon size={18} color={item.accent} />
                    </View>
                    <Text style={styles.commandTitle}>{item.title}</Text>
                    <Text style={styles.commandSubtitle}>{item.subtitle}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {ACCESS_ROUTES.map((item) => {
          const Icon = item.mode === 'signin' ? KeyRound : item.mode === 'restore' ? Wifi : Crown;
          const loading = item.mode === 'restore' && ownerRestoreMutation.isPending;
          const disabled = loading;
          const isRestoreReady = item.mode === 'restore' && trustedReady;
          const isSessionActive = item.mode === 'signin' && auth.isAuthenticated;
          const routeBorderColor = isRestoreReady ? '#22C55E30' : isSessionActive ? '#FFD70030' : '#232323';
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.routeCard, { borderColor: routeBorderColor }]}
              activeOpacity={0.86}
              onPress={() => handleRoutePress(item.mode)}
              disabled={disabled}
              testID={`owner-access-${item.id}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={[styles.routeIconWrap, { backgroundColor: item.accent + '22' }]}>
                  <Icon size={20} color={item.accent} />
                </View>
                {isRestoreReady ? (
                  <View style={styles.readyBadge}>
                    <View style={styles.readyDot} />
                    <Text style={styles.readyText}>READY</Text>
                  </View>
                ) : isSessionActive ? (
                  <View style={[styles.readyBadge, { backgroundColor: '#FFD70018' }]}>
                    <View style={[styles.readyDot, { backgroundColor: '#FFD700' }]} />
                    <Text style={[styles.readyText, { color: '#FFD700' }]}>ACTIVE</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.routeBody}>
                <Text style={styles.routeTitle}>{item.title}</Text>
                <Text style={styles.routeDescription}>{item.mode === 'signin' ? ownerSigninDescription : item.description}</Text>
                <Text style={styles.routeDetail}>{item.mode === 'signin' ? ownerSigninDetail : item.detail}</Text>
              </View>
              <View style={styles.routeAction}>
                {loading ? (
                  <ActivityIndicator color={item.accent} size="small" />
                ) : (
                  <>
                    <Text style={[styles.routeActionText, { color: item.accent }]}>{item.mode === 'signin' ? ownerSigninCta : item.cta}</Text>
                    <ChevronRight size={16} color={item.accent} />
                  </>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.82}
          onPress={() => void ownerAuditQuery.refetch()}
          testID="owner-access-refresh"
        >
          <ShieldCheck size={16} color={Colors.primary} />
          <Text style={styles.secondaryButtonText}>Refresh owner status</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#101010',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262626',
  },
  heroCardActive: {
    borderColor: '#22C55E30',
    backgroundColor: '#081208',
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginBottom: 14,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900' as const,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  nextStepsCard: {
    backgroundColor: '#111111',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#252525',
    gap: 12,
  },
  honestStatusCard: {
    backgroundColor: '#0E1621',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#203148',
    gap: 12,
  },
  honestStatusTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  honestStatusSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  honestStatusList: {
    gap: 2,
  },
  honestStatusRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#203148',
    gap: 6,
  },
  honestStatusLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  honestStatusValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 20,
  },
  nextStepsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  nextStepsList: {
    gap: 12,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  nextStepIndexWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  nextStepIndex: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  nextStepBody: {
    flex: 1,
    gap: 4,
  },
  nextStepTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  nextStepDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  auditCallout: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E3A5F',
    gap: 8,
  },
  auditCalloutTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  auditCalloutText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  recoveryCard: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F3A5F',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  recoveryIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryBody: {
    flex: 1,
    gap: 4,
  },
  recoveryTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  recoverySubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  recoveryAction: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF10',
    borderWidth: 1,
    borderColor: '#FFFFFF14',
  },
  recoveryActionText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  resetCard: {
    backgroundColor: '#FFD700',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resetCardDisabled: {
    opacity: 0.7,
  },
  resetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#00000012',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBody: {
    flex: 1,
    gap: 4,
  },
  resetTitle: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '900' as const,
  },
  resetSubtitle: {
    color: '#312600',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  claimCard: {
    backgroundColor: '#22C55E',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  claimCardDisabled: {
    opacity: 0.7,
  },
  claimIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#00000018',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBody: {
    flex: 1,
    gap: 4,
  },
  claimTitle: {
    color: '#000',
    fontSize: 17,
    fontWeight: '900' as const,
  },
  claimSubtitle: {
    color: '#0A3D1A',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600' as const,
  },
  emailChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#22324F',
    gap: 2,
  },
  emailChipLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
  },
  emailChipValue: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800' as const,
  },
  primarySigninCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primarySigninIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#00000012',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySigninBody: {
    flex: 1,
    gap: 4,
  },
  primarySigninTitle: {
    color: Colors.black,
    fontSize: 15,
    fontWeight: '900' as const,
  },
  primarySigninSubtitle: {
    color: '#312600',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  statusValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subnetInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F59E0B10',
    borderRadius: 10,
    padding: 10,
  },
  subnetInfoText: {
    flex: 1,
    color: '#F59E0B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  statusMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
  },
  statusMessage: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  verifyDeviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A00',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFD70030',
    gap: 12,
  },
  verifyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFD700',
  },
  verifyBody: {
    flex: 1,
    gap: 4,
  },
  verifyTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  verifySubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  commandDeck: {
    backgroundColor: '#0B0B0B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#232323',
    gap: 14,
  },
  commandDeckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commandDeckTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  commandDeckGrid: {
    gap: 10,
  },
  commandCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#212121',
    gap: 8,
  },
  commandIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  commandSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  routeCard: {
    backgroundColor: '#0F0F0F',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#232323',
  },
  routeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#22C55E18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  readyText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  routeBody: {
    gap: 6,
  },
  routeTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
  },
  routeDescription: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  routeDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  routeAction: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeActionText: {
    fontSize: 13,
    fontWeight: '800' as const,
  },
  secondaryButton: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    backgroundColor: Colors.primary + '10',
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800' as const,
  },
});
