import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { supabase } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth-store';
import { scopedKey } from '@/lib/project-storage';
import { useRealtimeTable } from '@/lib/realtime';

const EARN_DATA_KEY = scopedKey('earn_data');

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

function accrueEarnings(currentData: EarnData): EarnData {
  if (currentData.totalDeposited <= 0) return currentData;

  const lastDate = new Date(currentData.lastAccrualDate);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return currentData;

  const safeIdx = typeof currentData.currentTierIndex === 'number' && !isNaN(currentData.currentTierIndex)
    ? Math.min(Math.max(0, currentData.currentTierIndex), PROFIT_TIERS.length - 1) : 0;
  const tier = PROFIT_TIERS[safeIdx];
  const dailyRate = tier.apyRate / 365;
  const earned = currentData.totalDeposited * dailyRate * diffDays;

  return {
    ...currentData,
    totalEarnings: currentData.totalEarnings + earned,
    lastAccrualDate: now.toISOString(),
  };
}

async function loadLocalEarnData(): Promise<EarnData> {
  try {
    const stored = await AsyncStorage.getItem(EARN_DATA_KEY);
    if (stored) {
      const parsed: EarnData = JSON.parse(stored);
      if (typeof parsed.currentTierIndex !== 'number' || isNaN(parsed.currentTierIndex)) {
        parsed.currentTierIndex = 0;
      }
      return accrueEarnings(parsed);
    }
  } catch (error) {
    console.log('[Earn] Error loading local data:', error);
  }
  return defaultData;
}

async function saveLocalEarnData(data: EarnData) {
  try {
    await AsyncStorage.setItem(EARN_DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.log('[Earn] Error saving local data:', error);
  }
}

async function syncToSupabase(data: EarnData, userId: string) {
  try {
    await supabase.from('earn_accounts').upsert({
      user_id: userId,
      total_deposited: data.totalDeposited,
      total_earned: data.totalEarnings,
      current_apy: PROFIT_TIERS[Math.min(Math.max(0, data.currentTierIndex), PROFIT_TIERS.length - 1)].apyRate * 100,
      status: 'active',
      updated_at: new Date().toISOString(),
    });
    console.log('[Earn] Synced to Supabase');
  } catch (error) {
    console.log('[Earn] Supabase sync failed:', error);
  }
}

export const [EarnProvider, useEarn] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [data, setData] = useState<EarnData>(defaultData);

  const earnQueryKeys = useMemo(() => [['earn-data']], []);
  useRealtimeTable('earn_accounts', earnQueryKeys);
  useRealtimeTable('earn_deposits', earnQueryKeys);
  useRealtimeTable('earn_payouts', earnQueryKeys);

  const earnQuery = useQuery({
    queryKey: ['earn-data'],
    queryFn: async () => {
      const userId = getAuthUserId();
      if (!userId) return loadLocalEarnData();

      try {
        const [accountRes, depositsRes, payoutsRes] = await Promise.all([
          supabase.from('earn_accounts').select('*').eq('user_id', userId).single(),
          supabase.from('earn_deposits').select('*').eq('user_id', userId).order('deposited_at', { ascending: false }),
          supabase.from('earn_payouts').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        ]);

        if (accountRes.data) {
          console.log('[Earn] Loaded from Supabase');
          const acc = accountRes.data as any;
          const deposits: EarnDeposit[] = (depositsRes.data || []).map((d: any) => ({
            id: d.id,
            amount: d.amount ?? 0,
            depositedAt: d.deposited_at || d.created_at || new Date().toISOString(),
            status: 'active' as const,
          }));
          const payouts: EarnPayout[] = (payoutsRes.data || []).map((p: any) => ({
            id: p.id,
            amount: p.amount ?? 0,
            type: (p.type as EarnPayout['type']) || 'interest',
            description: `${p.type || 'interest'} — ${(p.amount ?? 0).toFixed(2)}`,
            createdAt: p.created_at || new Date().toISOString(),
          }));

          const currentApy = acc.current_apy ?? 10;
          const tierIdx = PROFIT_TIERS.findIndex(t => Math.abs(t.apyRate * 100 - currentApy) < 1);

          const sbData: EarnData = {
            deposits,
            payouts,
            totalDeposited: acc.total_deposited || 0,
            totalEarnings: acc.total_earned || 0,
            lastAccrualDate: acc.updated_at || new Date().toISOString(),
            currentQuarterProfit: 750000,
            currentTierIndex: tierIdx >= 0 ? tierIdx : 1,
          };
          const accrued = accrueEarnings(sbData);
          await saveLocalEarnData(accrued);
          return accrued;
        }
      } catch (error) {
        console.log('[Earn] Supabase load failed, using local:', error);
      }

      return loadLocalEarnData();
    },
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (earnQuery.data) {
      setData(earnQuery.data);
    }
  }, [earnQuery.data]);

  const getCurrentTier = useCallback((tierIndex: number): ProfitTier => {
    const safeIndex = typeof tierIndex === 'number' && !isNaN(tierIndex) ? Math.min(Math.max(0, tierIndex), PROFIT_TIERS.length - 1) : 0;
    return PROFIT_TIERS[safeIndex];
  }, []);

  const currentApyRate = useMemo(() => {
    return getCurrentTier(data.currentTierIndex).apyRate;
  }, [data.currentTierIndex, getCurrentTier]);

  const depositMutation = useMutation({
    mutationFn: async (amount: number) => {
      const userId = getAuthUserId();
      if (!userId) throw new Error('You must be logged in to deposit');

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
        description: `Deposited ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)} to IVXHOLDINGS Earn`,
        createdAt: new Date().toISOString(),
      };

      let updated: EarnData;
      setData(prev => {
        updated = {
          ...prev,
          deposits: [newDeposit, ...prev.deposits],
          payouts: [newPayout, ...prev.payouts],
          totalDeposited: prev.totalDeposited + amount,
        };
        return updated;
      });

      await saveLocalEarnData(updated!);

      try {
        await supabase.from('earn_deposits').insert({
          user_id: userId,
          amount: newDeposit.amount,
          source: 'wallet',
          status: 'completed',
        });
        await supabase.from('earn_payouts').insert({
          user_id: userId,
          amount: newPayout.amount,
          type: newPayout.type,
          status: 'completed',
        });
        await syncToSupabase(updated!, userId);
        console.log('[Earn] Deposit saved to Supabase');
      } catch (error) {
        console.log('[Earn] Supabase deposit save failed:', error);
      }

      return updated!;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['earn-data'] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amount: number) => {
      const userId = getAuthUserId();
      if (!userId) throw new Error('You must be logged in to withdraw');

      const newPayout: EarnPayout = {
        id: `earn-pay-${Date.now()}`,
        amount: -amount,
        type: 'withdrawal',
        description: `Withdrew ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)} from IVXHOLDINGS Earn`,
        createdAt: new Date().toISOString(),
      };

      let updated: EarnData;
      setData(prev => {
        let remainingWithdraw = amount;
        let earningsDeducted = 0;
        let depositDeducted = 0;

        if (prev.totalEarnings > 0) {
          const fromEarnings = Math.min(prev.totalEarnings, remainingWithdraw);
          earningsDeducted = fromEarnings;
          remainingWithdraw -= fromEarnings;
        }

        if (remainingWithdraw > 0) {
          depositDeducted = remainingWithdraw;
        }

        updated = {
          ...prev,
          payouts: [newPayout, ...prev.payouts],
          totalDeposited: prev.totalDeposited - depositDeducted,
          totalEarnings: prev.totalEarnings - earningsDeducted,
        };
        return updated;
      });

      await saveLocalEarnData(updated!);

      try {
        await supabase.from('earn_payouts').insert({
          user_id: userId,
          amount: newPayout.amount,
          type: newPayout.type,
          status: 'completed',
        });
        await syncToSupabase(updated!, userId);
        console.log('[Earn] Withdrawal saved to Supabase');
      } catch (error) {
        console.log('[Earn] Supabase withdrawal save failed:', error);
      }

      return updated!;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['earn-data'] });
    },
  });

  const deposit = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' };
    if (amount < 100) return { success: false, error: 'Minimum deposit is $100' };
    try {
      await depositMutation.mutateAsync(amount);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Deposit failed' };
    }
  }, [depositMutation]);

  const withdraw = useCallback(async (amount: number): Promise<{ success: boolean; error?: string }> => {
    if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' };
    const totalAvailable = data.totalDeposited + data.totalEarnings;
    if (amount > totalAvailable) return { success: false, error: 'Insufficient balance in Earn account' };
    try {
      await withdrawMutation.mutateAsync(amount);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Withdrawal failed' };
    }
  }, [withdrawMutation, data.totalDeposited, data.totalEarnings]);

  const totalBalance = useMemo(() => data.totalDeposited + data.totalEarnings, [data.totalDeposited, data.totalEarnings]);
  const projectedMonthly = useMemo(() => data.totalDeposited * (currentApyRate / 12), [data.totalDeposited, currentApyRate]);
  const projectedYearly = useMemo(() => data.totalDeposited * currentApyRate, [data.totalDeposited, currentApyRate]);
  const currentTier = useMemo(() => getCurrentTier(data.currentTierIndex), [data.currentTierIndex, getCurrentTier]);
  const nextTier = useMemo(() => {
    if (data.currentTierIndex < PROFIT_TIERS.length - 1) return PROFIT_TIERS[data.currentTierIndex + 1];
    return null;
  }, [data.currentTierIndex]);

  const quarterProgress = useMemo(() => {
    const tier = getCurrentTier(data.currentTierIndex);
    const max = tier.maxProfit === Infinity ? tier.minProfit * 2 : tier.maxProfit;
    return Math.min((data.currentQuarterProfit - tier.minProfit) / (max - tier.minProfit), 1);
  }, [data.currentQuarterProfit, data.currentTierIndex, getCurrentTier]);

  return useMemo(() => ({
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
    isLoading: earnQuery.isLoading,
    deposit,
    withdraw,
  }), [data, totalBalance, projectedMonthly, projectedYearly, currentApyRate, currentTier, nextTier, quarterProgress, earnQuery.isLoading, deposit, withdraw]);
});
