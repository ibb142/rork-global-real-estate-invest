import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

export type InvestmentBlockReason =
  | 'not_authenticated'
  | 'account_suspended'
  | null;

interface InvestmentGuardResult {
  canInvest: boolean;
  blockReason: InvestmentBlockReason;
  isLoading: boolean;
  checkAndProceed: (onAllowed: () => void) => void;
}

export function useInvestmentGuard(): InvestmentGuardResult {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const isLoading = authLoading;

  let blockReason: InvestmentBlockReason = null;

  if (!isAuthenticated) {
    blockReason = 'not_authenticated';
  }

  const canInvest = blockReason === null;

  const checkAndProceed = useCallback((onAllowed: () => void) => {
    if (!isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'Create a free account or sign in to start investing. No minimums, no restrictions.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/login' as any) },
          { text: 'Sign Up', onPress: () => router.push('/signup' as any) },
        ]
      );
      return;
    }

    onAllowed();
  }, [isAuthenticated, router]);

  return {
    canInvest,
    blockReason,
    isLoading,
    checkAndProceed,
  };
}
