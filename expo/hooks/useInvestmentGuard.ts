import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type InvestmentBlockReason =
  | 'not_authenticated'
  | 'email_not_verified'
  | 'kyc_pending'
  | 'kyc_rejected'
  | 'not_approved'
  | 'account_suspended'
  | null;

interface InvestmentGuardResult {
  canInvest: boolean;
  blockReason: InvestmentBlockReason;
  isLoading: boolean;
  checkAndProceed: (onAllowed: () => void) => void;
}

export function useInvestmentGuard(): InvestmentGuardResult {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const router = useRouter();

  const profileQuery = useQuery({
    queryKey: ['investment-guard-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('kyc_status, role, account_status')
        .eq('id', user.id)
        .single();

      if (error) {
        console.log('[InvestmentGuard] Profile fetch error:', error.message);
        return null;
      }
      return data as { kyc_status?: string; role?: string; account_status?: string } | null;
    },
    enabled: !!user?.id && isAuthenticated,
    staleTime: 30000,
  });

  const profile = profileQuery.data;
  const isLoading = authLoading || profileQuery.isLoading;

  let blockReason: InvestmentBlockReason = null;

  if (!isAuthenticated) {
    blockReason = 'not_authenticated';
  } else if (user && !user.emailVerified) {
    blockReason = 'email_not_verified';
  } else if (profile?.account_status === 'suspended') {
    blockReason = 'account_suspended';
  } else if (profile?.kyc_status === 'rejected') {
    blockReason = 'kyc_rejected';
  } else if (!profile?.kyc_status || profile.kyc_status === 'pending' || profile.kyc_status === 'not_started') {
    blockReason = 'kyc_pending';
  }

  const canInvest = blockReason === null;

  const checkAndProceed = useCallback((onAllowed: () => void) => {
    if (!isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'You need to sign in before making any investments.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/login' as any) },
        ]
      );
      return;
    }

    if (blockReason === 'email_not_verified') {
      Alert.alert(
        'Email Verification Required',
        'Please verify your email address before making investments. Check your inbox for the verification link.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (blockReason === 'account_suspended') {
      Alert.alert(
        'Account Suspended',
        'Your account has been suspended. Please contact support@ivxholdings.com for assistance.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (blockReason === 'kyc_rejected') {
      Alert.alert(
        'Verification Required',
        'Your identity verification was not approved. Please resubmit your documents to continue investing.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify Now', onPress: () => router.push('/kyc-verification' as any) },
        ]
      );
      return;
    }

    if (blockReason === 'kyc_pending') {
      Alert.alert(
        'Verification Required',
        'To protect your investment and comply with regulations, you must complete identity verification (KYC) before making any transactions.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify Now', onPress: () => router.push('/kyc-verification' as any) },
        ]
      );
      return;
    }

    onAllowed();
  }, [isAuthenticated, blockReason, router]);

  return {
    canInvest,
    blockReason,
    isLoading,
    checkAndProceed,
  };
}
