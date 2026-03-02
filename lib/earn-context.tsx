import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth-context';

const EARN_DATA_KEY = '@ipx_earn_data';

export interface EarnDeposit {
  id: string;
  amount: number;
  depositedAt: string;
  status: 'active' | 'withdrawn';
  withdrawnAt?: string;
}

export interface EarnPayout {
  id: string;
  amount: number;
  type: 'interest' | 'deposit' | 'withdrawal';
  description: string;
  createdAt: string;
}

interface EarnData {
  deposits: EarnDeposit[];
  payouts: EarnPayout[];
  totalDeposited: number;
  totalEarnings: number;
  lastAccrualDate: string;
  currentQuarterProfit: number;
  currentTierIndex: number;
}

export interface ProfitTier {
  label: string;
  minProfit: number;
  maxProfit: number;
  apyRate: number;
  description: string;
}

export const PROFIT_TIERS: ProfitTier[] = [
  { label: 'Base', minProfit: 0, maxProfit: 500000, apyRate: 0.10, description: 'Standard profit sharing' },
  { label: 'Growth', minProfit: 500000, maxProfit: 2000000, apyRate: 0.12, description: 'Increased returns from growing portfolio' },
  { label: 'Premium', minProfit: 2000000, maxProfit: 5000000, apyRate: 0.13, description: 'Higher share from premium deals' },
  { label: 'Elite', minProfit: 5000000, maxProfit: Infinity, apyRate: 0.15, description: 'Maximum profit sharing tier' },
];

const BASE_APY_RATE = 0.10;

const defaultData: EarnData = {
  deposits: [],
  payouts: [],
  totalDeposited: 0,
  totalEarnings: 0,
  lastAccrualDate: new Date().toISOString(),
  currentQuarterProfit: 750000,
  currentTierIndex: 1,
};

export const [EarnProvider, useEarn] = createContextHook(() => {
  const [data, setData] = useState<EarnData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);

  const { isAuthenticated } = useAuth();

  const balanceQuery = trpc.wallet.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 60000,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (balanceQuery.data) {
      console.log('[Earn] Backend balance synced:', balanceQuery.data.available);
    }
  }, [balanceQuery.data]);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(EARN_DATA_KEY);
      if (stored) {
        const parsed: EarnData = JSON.parse(stored);
        if (typeof parsed.currentTierIndex !== 'number' || isNaN(parsed.currentTierIndex)) {
          parsed.currentTierIndex = 0;
        }
        const accrued = accrueEarnings(parsed);
        setData(accrued);
        await AsyncStorage.setItem(EARN_DATA_KEY, JSON.stringify(accrued));
      }
    } catch (error) {
      console.log('[Earn] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (newData: EarnData) => {
    try {
      await AsyncStorage.setItem(EARN_DATA_KEY, JSON.stringify(newData));
    } catch (error) {
      console.log('[Earn] Error saving data:', error);
    }
  };

  const getCurrentTier = useCallback((tierIndex: number): ProfitTier => {
    const safeIndex = typeof tierIndex === 'number' && !isNaN(tierIndex) ? Math.min(Math.max(0, tierIndex), PROFIT_TIERS.length - 1) : 0;
    return PROFIT_TIERS[safeIndex];
  }, []);

  const currentApyRate = useMemo(() => {
    return getCurrentTier(data.currentTierIndex).apyRate;
  }, [data.currentTierIndex, getCurrentTier]);

  const accrueEarnings = (currentData: EarnData): EarnData => {
    if (currentData.totalDeposited <= 0) return currentData;

    const lastDate = new Date(currentData.lastAccrualDate);
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return currentData;

    const safeIdx = typeof currentData.currentTierIndex === 'number' && !isNaN(currentData.currentTierIndex) ? Math.min(Math.max(0, currentData.currentTierIndex), PROFIT_TIERS.length - 1) : 0;
    const tier = PROFIT_TIERS[safeIdx];
    const dailyRate = tier.apyRate / 365;
    const earned = currentData.totalDeposited * dailyRate * diffDays;

    return {
      ...currentData,
      totalEarnings: currentData.totalEarnings + earned,
      lastAccrualDate: now.toISOString(),
    };
  };

  const deposit = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' };
    }
    if (amount < 100) {
      return { success: false, error: 'Minimum deposit is $100' };
    }

    const newDeposit: EarnDeposit = {
      id: `earn-dep-${Date.now()}`,
      amount,
      depositedAt: new Date().toISOString(),
      status: 'active',
    };

    const newPayout: EarnPayout = {
      id: `earn-pay-${Date.now()}`,
      amount,
      type: 'deposit',
      description: `Deposited $${amount.toLocaleString()} to IVXHOLDINGS Earn`,
      createdAt: new Date().toISOString(),
    };

    const updated: EarnData = {
      ...data,
      deposits: [newDeposit, ...data.deposits],
      payouts: [newPayout, ...data.payouts],
      totalDeposited: data.totalDeposited + amount,
    };

    setData(updated);
    await saveData(updated);

    console.log('[Earn] Deposit successful:', { amount, total: updated.totalDeposited });
    balanceQuery.refetch();
    return { success: true };
  }, [data]);

  const withdraw = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero' };
    }

    const totalAvailable = data.totalDeposited + data.totalEarnings;
    if (amount > totalAvailable) {
      return { success: false, error: 'Insufficient balance in Earn account' };
    }

    const newPayout: EarnPayout = {
      id: `earn-pay-${Date.now()}`,
      amount: -amount,
      type: 'withdrawal',
      description: `Withdrew $${amount.toLocaleString()} from IVXHOLDINGS Earn`,
      createdAt: new Date().toISOString(),
    };

    let remainingWithdraw = amount;
    let earningsDeducted = 0;
    let depositDeducted = 0;

    if (data.totalEarnings > 0) {
      const fromEarnings = Math.min(data.totalEarnings, remainingWithdraw);
      earningsDeducted = fromEarnings;
      remainingWithdraw -= fromEarnings;
    }

    if (remainingWithdraw > 0) {
      depositDeducted = remainingWithdraw;
    }

    const updated: EarnData = {
      ...data,
      payouts: [newPayout, ...data.payouts],
      totalDeposited: data.totalDeposited - depositDeducted,
      totalEarnings: data.totalEarnings - earningsDeducted,
    };

    setData(updated);
    await saveData(updated);

    console.log('[Earn] Withdrawal successful:', { amount, earningsDeducted, depositDeducted });
    balanceQuery.refetch();
    return { success: true };
  }, [data]);

  const totalBalance = useMemo(() => {
    return data.totalDeposited + data.totalEarnings;
  }, [data.totalDeposited, data.totalEarnings]);

  const projectedMonthly = useMemo(() => {
    return data.totalDeposited * (currentApyRate / 12);
  }, [data.totalDeposited, currentApyRate]);

  const projectedYearly = useMemo(() => {
    return data.totalDeposited * currentApyRate;
  }, [data.totalDeposited, currentApyRate]);

  const currentTier = useMemo(() => getCurrentTier(data.currentTierIndex), [data.currentTierIndex, getCurrentTier]);
  const nextTier = useMemo(() => {
    if (data.currentTierIndex < PROFIT_TIERS.length - 1) {
      return PROFIT_TIERS[data.currentTierIndex + 1];
    }
    return null;
  }, [data.currentTierIndex]);

  const quarterProgress = useMemo(() => {
    const tier = getCurrentTier(data.currentTierIndex);
    const max = tier.maxProfit === Infinity ? tier.minProfit * 2 : tier.maxProfit;
    return Math.min((data.currentQuarterProfit - tier.minProfit) / (max - tier.minProfit), 1);
  }, [data.currentQuarterProfit, data.currentTierIndex, getCurrentTier]);

  return {
    deposits: data.deposits,
    payouts: data.payouts,
    totalDeposited: data.totalDeposited,
    totalEarnings: data.totalEarnings,
    totalBalance,
    projectedMonthly,
    projectedYearly,
    apyRate: currentApyRate,
    baseApyRate: BASE_APY_RATE,
    currentTier,
    nextTier,
    currentQuarterProfit: data.currentQuarterProfit,
    quarterProgress,
    allTiers: PROFIT_TIERS,
    isLoading,
    deposit,
    withdraw,
  };
});
