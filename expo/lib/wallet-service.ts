import { supabase } from './supabase';
import type { WalletRow } from '@/types/database';
import { rpcAtomicWalletOp } from '@/lib/stored-procedures';

export type WalletTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'investment'
  | 'sale_proceeds'
  | 'dividend'
  | 'refund'
  | 'fee'
  | 'resale_purchase'
  | 'resale_sale';

export type WalletTransactionDirection = 'credit' | 'debit';

export type WalletTransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface WalletTransaction {
  id: string;
  wallet_id?: string;
  user_id: string;
  type: WalletTransactionType;
  amount: number;
  direction: WalletTransactionDirection;
  status: WalletTransactionStatus;
  reference_id?: string;
  reference_type?: string;
  description: string;
  fee?: number;
  net_amount?: number;
  payment_method?: string;
  created_at: string;
}

export interface WalletBalance {
  available: number;
  pending: number;
  invested: number;
  total: number;
  currency: string;
}

const DEFAULT_BALANCE: WalletBalance = {
  available: 0,
  pending: 0,
  invested: 0,
  total: 0,
  currency: 'USD',
};

async function getAuthUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function fetchWalletBalance(userId?: string): Promise<WalletBalance> {
  try {
    const uid = userId || (await getAuthUser())?.id;
    if (!uid) {
      console.log('[WalletService] No user ID for balance fetch');
      return DEFAULT_BALANCE;
    }

    const { data, error } = await supabase
      .from('wallets')
      .select('available,pending,invested,total,currency')
      .eq('user_id', uid)
      .single();

    if (error || !data) {
      console.log('[WalletService] No wallet found, returning defaults');
      return DEFAULT_BALANCE;
    }

    const wallet = data as unknown as WalletRow;
    return {
      available: wallet.available ?? 0,
      pending: wallet.pending ?? 0,
      invested: wallet.invested ?? 0,
      total: wallet.total ?? (wallet.available ?? 0) + (wallet.invested ?? 0),
      currency: wallet.currency ?? 'USD',
    };
  } catch (err) {
    console.log('[WalletService] fetchWalletBalance error:', (err as Error)?.message);
    return DEFAULT_BALANCE;
  }
}

export async function ensureWallet(userId: string): Promise<WalletBalance> {
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (wallet) {
    const w = wallet as unknown as WalletRow;
    return {
      available: w.available ?? 0,
      pending: w.pending ?? 0,
      invested: w.invested ?? 0,
      total: w.total ?? 0,
      currency: w.currency ?? 'USD',
    };
  }

  const { error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      available: 0,
      pending: 0,
      invested: 0,
      total: 0,
      currency: 'USD',
    });

  if (error) {
    console.log('[WalletService] Failed to create wallet:', error?.message);
  }

  return DEFAULT_BALANCE;
}

export async function recordWalletTransaction(tx: Omit<WalletTransaction, 'id' | 'created_at'>): Promise<string | null> {
  const txId = `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  try {
    const { error } = await supabase
      .from('wallet_transactions')
      .insert({
        id: txId,
        wallet_id: tx.wallet_id,
        user_id: tx.user_id,
        type: tx.type,
        amount: tx.amount,
        direction: tx.direction,
        status: tx.status,
        reference_id: tx.reference_id,
        reference_type: tx.reference_type,
        description: tx.description,
        fee: tx.fee ?? 0,
        net_amount: tx.net_amount ?? tx.amount,
        payment_method: tx.payment_method,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.log('[WalletService] wallet_transactions insert failed (using transactions fallback):', error?.message);
      await supabase.from('transactions').insert({
        id: txId,
        user_id: tx.user_id,
        type: tx.type,
        amount: tx.direction === 'debit' ? -tx.amount : tx.amount,
        status: tx.status,
        description: tx.description,
        created_at: new Date().toISOString(),
      });
    }

    console.log('[WalletService] Transaction recorded:', txId, tx.type, tx.direction, tx.amount);
    return txId;
  } catch (err) {
    console.log('[WalletService] recordWalletTransaction error:', (err as Error)?.message);
    return null;
  }
}

export async function fetchWalletTransactions(
  userId: string,
  limit: number = 30,
  offset: number = 0
): Promise<WalletTransaction[]> {
  try {
    const { data: wtxData, error: wtxError } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!wtxError && wtxData && wtxData.length > 0) {
      console.log('[WalletService] Loaded wallet_transactions:', wtxData.length);
      return (wtxData as unknown as WalletTransaction[]);
    }

    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('id,type,amount,status,description,property_id,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (txError || !txData) return [];

    return (txData as any[]).map((tx: any): WalletTransaction => ({
      id: tx.id,
      user_id: userId,
      type: tx.type as WalletTransactionType,
      amount: Math.abs(tx.amount ?? 0),
      direction: (tx.amount ?? 0) >= 0 ? 'credit' as const : 'debit' as const,
      status: (tx.status as WalletTransactionStatus) || 'completed',
      reference_id: tx.property_id,
      reference_type: tx.property_id ? 'property' : undefined,
      description: tx.description || '',
      created_at: tx.created_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.log('[WalletService] fetchWalletTransactions error:', (err as Error)?.message);
    return [];
  }
}

export async function creditWallet(
  userId: string,
  amount: number,
  reason: WalletTransactionType,
  description: string,
  referenceId?: string,
  referenceType?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // --- TRY ATOMIC RPC FIRST ---
    try {
      console.log('[WalletService] Attempting atomic RPC credit...');
      const rpcResult = await rpcAtomicWalletOp({
        p_user_id: userId,
        p_amount: amount,
        p_operation: 'credit',
        p_reason: reason,
        p_description: description,
        p_reference_id: referenceId,
        p_reference_type: referenceType,
      });
      if (rpcResult.success) {
        console.log('[WalletService] Atomic RPC credit SUCCESS:', amount, reason);
        return { success: true };
      }
      if (rpcResult.message && !rpcResult.message.includes('does not exist')) {
        console.log('[WalletService] Atomic RPC credit business error:', rpcResult.message);
        return { success: false, error: rpcResult.message };
      }
      console.log('[WalletService] Atomic RPC not available, falling back');
    } catch (rpcErr) {
      console.log('[WalletService] Atomic RPC credit exception, falling back:', (rpcErr as Error)?.message);
    }

    // --- FALLBACK: Client-side logic ---
    const { data: currentWallet, error: fetchErr } = await supabase
      .from('wallets')
      .select('available, invested, total, updated_at')
      .eq('user_id', userId)
      .single();

    if (fetchErr || !currentWallet) {
      await ensureWallet(userId);
      return creditWallet(userId, amount, reason, description, referenceId, referenceType);
    }

    const typed = currentWallet as unknown as WalletRow;
    const newAvailable = (typed.available ?? 0) + amount;
    const newTotal = (typed.total ?? 0) + amount;

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        available: newAvailable,
        total: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      console.log('[WalletService] creditWallet update failed:', updateErr?.message);
      return { success: false, error: updateErr.message };
    }

    await recordWalletTransaction({
      user_id: userId,
      type: reason,
      amount,
      direction: 'credit',
      status: 'completed',
      reference_id: referenceId,
      reference_type: referenceType,
      description,
    });

    console.log('[WalletService] Wallet credited:', amount, reason, '| method: client_fallback');
    return { success: true };
  } catch (err) {
    console.log('[WalletService] creditWallet error:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export async function debitWallet(
  userId: string,
  amount: number,
  reason: WalletTransactionType,
  description: string,
  referenceId?: string,
  referenceType?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // --- TRY ATOMIC RPC FIRST ---
    try {
      console.log('[WalletService] Attempting atomic RPC debit...');
      const rpcResult = await rpcAtomicWalletOp({
        p_user_id: userId,
        p_amount: amount,
        p_operation: 'debit',
        p_reason: reason,
        p_description: description,
        p_reference_id: referenceId,
        p_reference_type: referenceType,
      });
      if (rpcResult.success) {
        console.log('[WalletService] Atomic RPC debit SUCCESS:', amount, reason);
        return { success: true };
      }
      if (rpcResult.message && !rpcResult.message.includes('does not exist')) {
        console.log('[WalletService] Atomic RPC debit business error:', rpcResult.message);
        return { success: false, error: rpcResult.message };
      }
      console.log('[WalletService] Atomic RPC not available, falling back');
    } catch (rpcErr) {
      console.log('[WalletService] Atomic RPC debit exception, falling back:', (rpcErr as Error)?.message);
    }

    // --- FALLBACK: Client-side logic ---
    const { data: currentWallet, error: fetchErr } = await supabase
      .from('wallets')
      .select('available, invested, total, updated_at')
      .eq('user_id', userId)
      .single();

    if (fetchErr || !currentWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const typed = currentWallet as unknown as WalletRow;
    if ((typed.available ?? 0) < amount) {
      return {
        success: false,
        error: `Insufficient balance: ${(typed.available ?? 0).toFixed(2)} available, ${amount.toFixed(2)} required`,
      };
    }

    const newAvailable = Math.max(0, (typed.available ?? 0) - amount);
    const isInvestment = reason === 'investment' || reason === 'resale_purchase';
    const newInvested = isInvestment ? (typed.invested ?? 0) + amount : (typed.invested ?? 0);

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        available: newAvailable,
        invested: newInvested,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('available', typed.available);

    if (updateErr) {
      console.log('[WalletService] debitWallet atomic update failed:', updateErr?.message);
      return { success: false, error: 'Wallet update failed — possible concurrent modification. Please retry.' };
    }

    await recordWalletTransaction({
      user_id: userId,
      type: reason,
      amount,
      direction: 'debit',
      status: 'completed',
      reference_id: referenceId,
      reference_type: referenceType,
      description,
    });

    console.log('[WalletService] Wallet debited:', amount, reason, '| new available:', newAvailable, '| method: client_fallback');
    return { success: true };
  } catch (err) {
    console.log('[WalletService] debitWallet error:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export async function processInvestmentDebit(
  userId: string,
  amount: number,
  propertyName: string,
  propertyId: string,
): Promise<{ success: boolean; error?: string }> {
  return debitWallet(
    userId,
    amount,
    'investment',
    `Investment in ${propertyName}`,
    propertyId,
    'property',
  );
}

export async function processSaleCredit(
  userId: string,
  netProceeds: number,
  investedReduction: number,
  propertyName: string,
  propertyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: currentWallet, error: fetchErr } = await supabase
      .from('wallets')
      .select('available, invested, total, updated_at')
      .eq('user_id', userId)
      .single();

    if (fetchErr || !currentWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const typed = currentWallet as unknown as WalletRow;
    const newAvailable = (typed.available ?? 0) + netProceeds;
    const newInvested = Math.max(0, (typed.invested ?? 0) - investedReduction);

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        available: newAvailable,
        invested: newInvested,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      console.log('[WalletService] processSaleCredit update failed:', updateErr?.message);
      return { success: false, error: updateErr.message };
    }

    await recordWalletTransaction({
      user_id: userId,
      type: 'sale_proceeds',
      amount: netProceeds,
      direction: 'credit',
      status: 'completed',
      reference_id: propertyId,
      reference_type: 'property',
      description: `Sale proceeds from ${propertyName}`,
    });

    console.log('[WalletService] Sale credit processed:', netProceeds, '| invested reduced by:', investedReduction);
    return { success: true };
  } catch (err) {
    console.log('[WalletService] processSaleCredit error:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export async function processDepositCredit(
  userId: string,
  amount: number,
  fee: number,
  paymentMethod: string,
  transactionId: string,
): Promise<{ success: boolean; error?: string }> {
  const netAmount = amount - fee;
  try {
    const result = await creditWallet(
      userId,
      netAmount,
      'deposit',
      `Deposit via ${paymentMethod}`,
      transactionId,
      'deposit',
    );

    if (result.success && fee > 0) {
      await recordWalletTransaction({
        user_id: userId,
        type: 'fee',
        amount: fee,
        direction: 'debit',
        status: 'completed',
        reference_id: transactionId,
        reference_type: 'deposit_fee',
        description: `Processing fee for deposit via ${paymentMethod}`,
        fee,
        net_amount: 0,
        payment_method: paymentMethod,
      });
    }

    return result;
  } catch (err) {
    console.log('[WalletService] processDepositCredit error:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export async function processWithdrawalDebit(
  userId: string,
  amount: number,
  fee: number,
  withdrawMethod: string,
  withdrawalId: string,
): Promise<{ success: boolean; error?: string }> {
  const totalDebit = amount;
  try {
    const { data: currentWallet, error: fetchErr } = await supabase
      .from('wallets')
      .select('available, invested, total, updated_at')
      .eq('user_id', userId)
      .single();

    if (fetchErr || !currentWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    const typed = currentWallet as unknown as WalletRow;
    if ((typed.available ?? 0) < totalDebit) {
      return { success: false, error: 'Insufficient balance for withdrawal' };
    }

    const newAvailable = Math.max(0, (typed.available ?? 0) - totalDebit);

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({
        available: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('available', typed.available);

    if (updateErr) {
      return { success: false, error: 'Wallet update failed. Please retry.' };
    }

    await recordWalletTransaction({
      user_id: userId,
      type: 'withdrawal',
      amount,
      direction: 'debit',
      status: 'completed',
      reference_id: withdrawalId,
      reference_type: 'withdrawal',
      description: `Withdrawal via ${withdrawMethod}`,
      fee,
      net_amount: amount - fee,
      payment_method: withdrawMethod,
    });

    console.log('[WalletService] Withdrawal processed:', amount, '| fee:', fee, '| method:', withdrawMethod);
    return { success: true };
  } catch (err) {
    console.log('[WalletService] processWithdrawalDebit error:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}
