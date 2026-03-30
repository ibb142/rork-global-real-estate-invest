import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { supabase } from '@/lib/supabase';
import { getAuthUserId } from '@/lib/auth-store';
import { useRealtimeTable } from '@/lib/realtime';
import {
  fetchWalletBalance,
  fetchWalletTransactions,
  processDepositCredit,
  processWithdrawalDebit,
  processInvestmentDebit,
  processSaleCredit,
  ensureWallet,
  type WalletBalance,
  type WalletTransaction,
} from '@/lib/wallet-service';

const DEFAULT_BALANCE: WalletBalance = {
  available: 0,
  pending: 0,
  invested: 0,
  total: 0,
  currency: 'USD',
};

export const [WalletProvider, useWallet] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [balance, setBalance] = useState<WalletBalance>(DEFAULT_BALANCE);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  const walletQueryKeys = useMemo(() => [['wallet-balance'], ['wallet-transactions']], []);
  useRealtimeTable('wallets', walletQueryKeys);
  useRealtimeTable('wallet_transactions', walletQueryKeys);
  useRealtimeTable('transactions', walletQueryKeys);

  const balanceQuery = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const userId = getAuthUserId();
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return DEFAULT_BALANCE;
        return fetchWalletBalance(user.id);
      }
      return fetchWalletBalance(userId);
    },
    staleTime: 1000 * 60 * 2,
  });

  const transactionsQuery = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: async () => {
      const userId = getAuthUserId();
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!uid) return [];
      return fetchWalletTransactions(uid, 50, 0);
    },
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (balanceQuery.data) {
      setBalance(balanceQuery.data);
      console.log('[WalletContext] Balance updated:', balanceQuery.data.available);
    }
  }, [balanceQuery.data]);

  useEffect(() => {
    if (transactionsQuery.data) {
      setTransactions(transactionsQuery.data);
      console.log('[WalletContext] Transactions loaded:', transactionsQuery.data.length);
    }
  }, [transactionsQuery.data]);

  const refreshWallet = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['holdings'] });
    console.log('[WalletContext] Wallet refreshed');
  }, [queryClient]);

  const depositMutation = useMutation({
    mutationFn: async (params: {
      amount: number;
      fee: number;
      paymentMethod: string;
      transactionId: string;
    }) => {
      const userId = getAuthUserId();
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!uid) throw new Error('Not authenticated');
      await ensureWallet(uid);
      const result = await processDepositCredit(
        uid,
        params.amount,
        params.fee,
        params.paymentMethod,
        params.transactionId,
      );
      if (!result.success) throw new Error(result.error || 'Deposit failed');
      return result;
    },
    onSuccess: () => {
      refreshWallet();
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (params: {
      amount: number;
      fee: number;
      withdrawMethod: string;
      withdrawalId: string;
    }) => {
      const userId = getAuthUserId();
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!uid) throw new Error('Not authenticated');
      const result = await processWithdrawalDebit(
        uid,
        params.amount,
        params.fee,
        params.withdrawMethod,
        params.withdrawalId,
      );
      if (!result.success) throw new Error(result.error || 'Withdrawal failed');
      return result;
    },
    onSuccess: () => {
      refreshWallet();
    },
  });

  const investMutation = useMutation({
    mutationFn: async (params: {
      amount: number;
      propertyName: string;
      propertyId: string;
    }) => {
      const userId = getAuthUserId();
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!uid) throw new Error('Not authenticated');
      const result = await processInvestmentDebit(
        uid,
        params.amount,
        params.propertyName,
        params.propertyId,
      );
      if (!result.success) throw new Error(result.error || 'Investment debit failed');
      return result;
    },
    onSuccess: () => {
      refreshWallet();
    },
  });

  const saleCreditMutation = useMutation({
    mutationFn: async (params: {
      netProceeds: number;
      investedReduction: number;
      propertyName: string;
      propertyId: string;
    }) => {
      const userId = getAuthUserId();
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
      }
      if (!uid) throw new Error('Not authenticated');
      const result = await processSaleCredit(
        uid,
        params.netProceeds,
        params.investedReduction,
        params.propertyName,
        params.propertyId,
      );
      if (!result.success) throw new Error(result.error || 'Sale credit failed');
      return result;
    },
    onSuccess: () => {
      refreshWallet();
    },
  });

  const deposit = useCallback(async (
    amount: number,
    fee: number,
    paymentMethod: string,
    transactionId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await depositMutation.mutateAsync({ amount, fee, paymentMethod, transactionId });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Deposit failed' };
    }
  }, [depositMutation]);

  const withdraw = useCallback(async (
    amount: number,
    fee: number,
    withdrawMethod: string,
    withdrawalId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await withdrawMutation.mutateAsync({ amount, fee, withdrawMethod, withdrawalId });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Withdrawal failed' };
    }
  }, [withdrawMutation]);

  const invest = useCallback(async (
    amount: number,
    propertyName: string,
    propertyId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await investMutation.mutateAsync({ amount, propertyName, propertyId });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Investment failed' };
    }
  }, [investMutation]);

  const creditSale = useCallback(async (
    netProceeds: number,
    investedReduction: number,
    propertyName: string,
    propertyId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await saleCreditMutation.mutateAsync({ netProceeds, investedReduction, propertyName, propertyId });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Sale credit failed' };
    }
  }, [saleCreditMutation]);

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 10);
  }, [transactions]);

  const depositWithdrawTransactions = useMemo(() => {
    return transactions.filter(
      tx => tx.type === 'deposit' || tx.type === 'withdrawal'
    ).slice(0, 10);
  }, [transactions]);

  const investmentTransactions = useMemo(() => {
    return transactions.filter(
      tx => tx.type === 'investment' || tx.type === 'sale_proceeds' || tx.type === 'resale_purchase' || tx.type === 'resale_sale'
    ).slice(0, 10);
  }, [transactions]);

  return useMemo(() => ({
    balance,
    available: balance.available,
    pending: balance.pending,
    invested: balance.invested,
    total: balance.total,
    currency: balance.currency,

    transactions,
    recentTransactions,
    depositWithdrawTransactions,
    investmentTransactions,

    isLoading: balanceQuery.isLoading,
    isFromAPI: !!balanceQuery.data && balanceQuery.data.available !== undefined,
    isTransactionsLoading: transactionsQuery.isLoading,

    deposit,
    withdraw,
    invest,
    creditSale,
    refreshWallet,

    isDepositing: depositMutation.isPending,
    isWithdrawing: withdrawMutation.isPending,
    isInvesting: investMutation.isPending,
  }), [
    balance,
    transactions,
    recentTransactions,
    depositWithdrawTransactions,
    investmentTransactions,
    balanceQuery.isLoading,
    balanceQuery.data,
    transactionsQuery.isLoading,
    deposit,
    withdraw,
    invest,
    creditSale,
    refreshWallet,
    depositMutation.isPending,
    withdrawMutation.isPending,
    investMutation.isPending,
  ]);
});

export function useWalletBalance() {
  const { available, pending, invested, total } = useWallet();
  return useMemo(() => ({ available, pending, invested, total }), [available, pending, invested, total]);
}

export function useWalletTransactions(type?: 'all' | 'deposits' | 'investments') {
  const { transactions, depositWithdrawTransactions, investmentTransactions } = useWallet();
  return useMemo(() => {
    switch (type) {
      case 'deposits': return depositWithdrawTransactions;
      case 'investments': return investmentTransactions;
      default: return transactions;
    }
  }, [type, transactions, depositWithdrawTransactions, investmentTransactions]);
}
