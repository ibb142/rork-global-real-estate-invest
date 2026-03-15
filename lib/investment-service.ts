import { supabase } from './supabase';
import { logAudit } from '@/lib/audit-trail';
import type { WalletRow, HoldingRow, ProfileRow } from '@/types/database';

export interface InvestmentRequest {
  propertyId: string;
  propertyName: string;
  shares: number;
  pricePerShare: number;
  subtotal: number;
  platformFee: number;
  paymentFee: number;
  totalCost: number;
  paymentMethod: 'wallet' | 'bank' | 'card' | 'wire';
  investmentType: 'property_shares' | 'jv_direct' | 'jv_token_shares';
  jvDealId?: string;
  equityPercent?: number;
  expectedROI?: number;
}

export interface InvestmentResult {
  success: boolean;
  transactionId: string;
  holdingId: string;
  confirmationNumber: string;
  message: string;
  error?: string;
}

async function getAuthUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    console.log('[InvestmentService] No authenticated user found');
    return null;
  }
  return user;
}

async function ensureWalletExists(userId: string): Promise<number> {
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (wallet) {
    const typedWallet = wallet as unknown as WalletRow;
    return typedWallet.available ?? 0;
  }

  const { error: insertError } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      available: 0,
      pending: 0,
      invested: 0,
      total: 0,
      currency: 'USD',
    });

  if (insertError) {
    console.log('[InvestmentService] Failed to create wallet:', insertError?.message);
  }
  return 0;
}

async function atomicWalletDebit(userId: string, amount: number): Promise<{ success: boolean; error?: string }> {
  const { data: currentWallet, error: fetchErr } = await supabase
    .from('wallets')
    .select('available, invested, updated_at')
    .eq('user_id', userId)
    .single();

  if (fetchErr || !currentWallet) {
    return { success: false, error: 'Could not read wallet balance' };
  }

  const typed = currentWallet as unknown as WalletRow;
  if (typed.available < amount) {
    return { success: false, error: `Insufficient balance: $${typed.available.toFixed(2)} available, $${amount.toFixed(2)} required` };
  }

  const newAvailable = Math.max(0, typed.available - amount);
  const newInvested = (typed.invested ?? 0) + amount;

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
    console.log('[InvestmentService] Atomic wallet debit failed:', updateErr?.message);
    return { success: false, error: 'Wallet update failed — possible concurrent modification. Please retry.' };
  }

  console.log('[InvestmentService] Atomic wallet debit SUCCESS:', amount, '| new available:', newAvailable, '| new invested:', newInvested);
  return { success: true };
}

async function rollbackTransaction(transactionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('transactions')
      .update({ status: 'failed', description: 'Rolled back due to downstream failure' })
      .eq('id', transactionId);
    if (error) {
      console.log('[InvestmentService] Rollback transaction failed:', error?.message);
    } else {
      console.log('[InvestmentService] Transaction rolled back:', transactionId);
    }
  } catch (err) {
    console.log('[InvestmentService] Rollback exception:', (err as Error)?.message);
  }
}

export async function purchaseShares(request: InvestmentRequest): Promise<InvestmentResult> {
  const confirmationNumber = `IVX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const holdingId = `hold_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  console.log('[InvestmentService] Starting purchase:', {
    propertyId: request.propertyId,
    shares: request.shares,
    totalCost: request.totalCost,
    paymentMethod: request.paymentMethod,
    investmentType: request.investmentType,
  });

  try {
    const user = await getAuthUser();
    if (!user) {
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Please log in to make a purchase.',
        error: 'not_authenticated',
      };
    }

    const walletBalance = await ensureWalletExists(user.id);
    console.log('[InvestmentService] Wallet balance:', walletBalance);

    if (request.paymentMethod === 'wallet' && walletBalance < request.totalCost) {
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: `Insufficient wallet balance. You have $${walletBalance.toFixed(2)} but need $${request.totalCost.toFixed(2)}.`,
        error: 'insufficient_funds',
      };
    }

    if (request.paymentMethod === 'wallet') {
      const debitResult = await atomicWalletDebit(user.id, request.totalCost);
      if (!debitResult.success) {
        return {
          success: false,
          transactionId: '',
          holdingId: '',
          confirmationNumber: '',
          message: debitResult.error || 'Wallet debit failed.',
          error: 'wallet_debit_failed',
        };
      }
    }

    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        user_id: user.id,
        type: 'buy',
        amount: request.totalCost,
        status: 'completed',
        description: `Purchased ${request.shares} shares of ${request.propertyName} (${request.investmentType}) — Confirmation: ${confirmationNumber}`,
        property_id: request.propertyId,
        property_name: request.propertyName,
        created_at: new Date().toISOString(),
      });

    if (txError) {
      console.log('[InvestmentService] Transaction insert failed:', txError?.message);
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Failed to record transaction. Please try again.',
        error: txError.message,
      };
    }
    console.log('[InvestmentService] Transaction recorded:', transactionId);

    const { data: existingHolding } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('property_id', request.propertyId)
      .single();

    let finalHoldingId = holdingId;

    if (existingHolding) {
      const existing = existingHolding as unknown as HoldingRow;
      finalHoldingId = existing.id;
      const newShares = (existing.shares || 0) + request.shares;
      const oldCostBasis = (existing.avg_cost_basis || 0) * (existing.shares || 0);
      const newCostBasis = (oldCostBasis + request.subtotal) / newShares;
      const newCurrentValue = newShares * request.pricePerShare;

      const { error: updateError } = await supabase
        .from('holdings')
        .update({
          shares: newShares,
          avg_cost_basis: Math.round(newCostBasis * 100) / 100,
          current_value: Math.round(newCurrentValue * 100) / 100,
          total_return: Math.round((newCurrentValue - (newCostBasis * newShares)) * 100) / 100,
          total_return_percent: newCostBasis > 0 ? Math.round(((request.pricePerShare - newCostBasis) / newCostBasis) * 10000) / 100 : 0,
          unrealized_pnl: Math.round((newCurrentValue - (newCostBasis * newShares)) * 100) / 100,
          unrealized_pnl_percent: newCostBasis > 0 ? Math.round(((request.pricePerShare - newCostBasis) / newCostBasis) * 10000) / 100 : 0,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.log('[InvestmentService] Holding update failed:', updateError?.message);
        await rollbackTransaction(transactionId);
        return {
          success: false,
          transactionId: '',
          holdingId: '',
          confirmationNumber: '',
          message: 'Failed to update holding. Transaction has been rolled back.',
          error: updateError.message,
        };
      }
      console.log('[InvestmentService] Holding updated:', existing.id);
    } else {
      const { error: holdError } = await supabase
        .from('holdings')
        .insert({
          id: holdingId,
          user_id: user.id,
          property_id: request.propertyId,
          shares: request.shares,
          avg_cost_basis: request.pricePerShare,
          current_value: Math.round(request.subtotal * 100) / 100,
          total_return: 0,
          total_return_percent: 0,
          unrealized_pnl: 0,
          unrealized_pnl_percent: 0,
          purchase_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

      if (holdError) {
        console.log('[InvestmentService] Holding insert failed:', holdError?.message);
        await rollbackTransaction(transactionId);
        return {
          success: false,
          transactionId: '',
          holdingId: '',
          confirmationNumber: '',
          message: 'Failed to create holding. Transaction has been rolled back.',
          error: holdError.message,
        };
      }
      console.log('[InvestmentService] New holding created:', holdingId);
    }

    if (request.platformFee > 0) {
      const { error: feeError } = await supabase
        .from('transactions')
        .insert({
          id: `fee_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          user_id: user.id,
          type: 'fee',
          amount: request.platformFee,
          status: 'completed',
          description: `Platform fee for ${request.propertyName} purchase`,
          property_id: request.propertyId,
          property_name: request.propertyName,
          created_at: new Date().toISOString(),
        });
      if (feeError) {
        console.log('[InvestmentService] Platform fee insert failed (non-critical):', feeError?.message);
      } else {
        console.log('[InvestmentService] Platform fee recorded:', request.platformFee);
      }
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id,
        type: 'transaction',
        title: 'Investment Confirmed',
        message: `You purchased ${request.shares} shares of ${request.propertyName} for $${request.totalCost.toFixed(2)}. Confirmation: ${confirmationNumber}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    if (notifError) {
      console.log('[InvestmentService] Notification insert failed (non-critical):', notifError.message);
    }

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('total_invested')
      .eq('id', user.id)
      .single();
    const typedProfile = currentProfile as unknown as ProfileRow | null;
    const existingTotalInvested = typedProfile?.total_invested ?? 0;

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        total_invested: existingTotalInvested + request.totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileError) {
      console.log('[InvestmentService] Profile update skipped:', profileError.message);
    }

    console.log('[InvestmentService] Purchase completed successfully:', confirmationNumber);

    try {
      await logAudit({
        entityType: 'transaction',
        entityId: transactionId,
        entityTitle: `Purchase: ${request.shares} shares of ${request.propertyName}`,
        action: 'PURCHASE',
        source: 'app',
        details: {
          propertyId: request.propertyId,
          propertyName: request.propertyName,
          shares: request.shares,
          totalCost: request.totalCost,
          paymentMethod: request.paymentMethod,
          investmentType: request.investmentType,
          confirmationNumber,
          holdingId: finalHoldingId,
        },
      });

      await logAudit({
        entityType: 'holding',
        entityId: finalHoldingId,
        entityTitle: `Holding: ${request.propertyName}`,
        action: existingHolding ? 'UPDATE' : 'CREATE',
        source: 'app',
        details: {
          shares: request.shares,
          totalCost: request.totalCost,
          transactionId,
        },
      });
    } catch (auditErr) {
      console.log('[InvestmentService] Audit log failed (non-critical):', (auditErr as Error)?.message);
    }

    return {
      success: true,
      transactionId,
      holdingId: finalHoldingId,
      confirmationNumber,
      message: `Successfully purchased ${request.shares} shares of ${request.propertyName}.`,
    };

  } catch (error) {
    console.log('[InvestmentService] Unexpected error:', (error as Error)?.message);
    return {
      success: false,
      transactionId: '',
      holdingId: '',
      confirmationNumber: '',
      message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
      error: 'unknown',
    };
  }
}

export async function purchaseJVInvestment(params: {
  jvDealId: string;
  jvTitle: string;
  jvProjectName: string;
  investmentPool: 'jv_direct' | 'token_shares';
  amount: number;
  equityPercent: number;
  expectedROI: number;
  paymentMethod: 'wallet' | 'bank' | 'wire';
}): Promise<InvestmentResult> {
  const confirmationNumber = `JV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const transactionId = `txn_jv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const holdingId = `hold_jv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  console.log('[InvestmentService] Starting JV investment:', {
    jvDealId: params.jvDealId,
    amount: params.amount,
    pool: params.investmentPool,
    paymentMethod: params.paymentMethod,
  });

  try {
    const user = await getAuthUser();
    if (!user) {
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Please log in to invest.',
        error: 'not_authenticated',
      };
    }

    const walletBalance = await ensureWalletExists(user.id);

    if (params.paymentMethod === 'wallet' && walletBalance < params.amount) {
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: `Insufficient wallet balance. You have $${walletBalance.toFixed(2)} but need $${params.amount.toFixed(2)}.`,
        error: 'insufficient_funds',
      };
    }

    if (params.paymentMethod === 'wallet') {
      const debitResult = await atomicWalletDebit(user.id, params.amount);
      if (!debitResult.success) {
        return {
          success: false,
          transactionId: '',
          holdingId: '',
          confirmationNumber: '',
          message: debitResult.error || 'Wallet debit failed.',
          error: 'wallet_debit_failed',
        };
      }
    }

    const investType = params.investmentPool === 'jv_direct' ? 'JV Direct Investment' : 'Token Shares';

    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        user_id: user.id,
        type: 'buy',
        amount: params.amount,
        status: 'completed',
        description: `${investType} in ${params.jvTitle} — ${params.equityPercent.toFixed(2)}% equity — Confirmation: ${confirmationNumber}`,
        property_id: params.jvDealId,
        property_name: params.jvProjectName,
        created_at: new Date().toISOString(),
      });

    if (txError) {
      console.log('[InvestmentService] JV transaction insert failed:', txError?.message);
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Failed to record investment. Please try again.',
        error: txError.message,
      };
    }
    console.log('[InvestmentService] JV transaction recorded:', transactionId);

    const { data: existingJVHolding } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('property_id', params.jvDealId)
      .single();

    let finalHoldingId = holdingId;

    if (existingJVHolding) {
      const existing = existingJVHolding as unknown as HoldingRow;
      finalHoldingId = existing.id;
      const newShares = (existing.shares || 0) + (params.investmentPool === 'token_shares' ? Math.floor(params.amount / 10) : 1);
      const newValue = (existing.current_value || 0) + params.amount;
      const oldCostBasis = (existing.avg_cost_basis || 0) * (existing.shares || 0);
      const newCostBasis = newShares > 0 ? (oldCostBasis + params.amount) / newShares : params.amount;

      const { error: updateError } = await supabase
        .from('holdings')
        .update({
          shares: newShares,
          avg_cost_basis: Math.round(newCostBasis * 100) / 100,
          current_value: Math.round(newValue * 100) / 100,
          total_return: 0,
          total_return_percent: 0,
          unrealized_pnl: 0,
          unrealized_pnl_percent: 0,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.log('[InvestmentService] JV holding update failed:', updateError?.message);
        await rollbackTransaction(transactionId);
        return {
          success: false,
          transactionId: '',
          holdingId: '',
          confirmationNumber: '',
          message: 'Failed to update JV holding. Transaction rolled back.',
          error: updateError.message,
        };
      }
      console.log('[InvestmentService] JV holding updated (added to existing):', existing.id, '| new shares:', newShares, '| new value:', newValue);
    } else {
      const { error: holdError } = await supabase
        .from('holdings')
        .insert({
          id: holdingId,
          user_id: user.id,
          property_id: params.jvDealId,
          shares: params.investmentPool === 'token_shares' ? Math.floor(params.amount / 10) : 1,
          avg_cost_basis: params.amount,
          current_value: params.amount,
          total_return: 0,
          total_return_percent: 0,
          unrealized_pnl: 0,
          unrealized_pnl_percent: 0,
          purchase_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

      if (holdError) {
        console.log('[InvestmentService] JV holding insert failed:', holdError?.message);
        await rollbackTransaction(transactionId);
        return {
          success: false,
          transactionId: '',
          holdingId: '',
          confirmationNumber: '',
          message: 'Failed to create JV holding. Transaction rolled back.',
          error: holdError.message,
        };
      }
      console.log('[InvestmentService] JV holding created:', holdingId);
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        id: `notif_jv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id,
        type: 'transaction',
        title: 'JV Investment Confirmed',
        message: `You invested $${params.amount.toLocaleString()} in ${params.jvProjectName} (${investType}). Equity: ${params.equityPercent.toFixed(2)}%. Confirmation: ${confirmationNumber}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    if (notifError) {
      console.log('[InvestmentService] JV notification failed (non-critical):', notifError.message);
    }

    console.log('[InvestmentService] JV purchase completed:', confirmationNumber);

    try {
      await logAudit({
        entityType: 'transaction',
        entityId: transactionId,
        entityTitle: `JV Investment: ${params.jvProjectName}`,
        action: 'PURCHASE',
        source: 'app',
        details: {
          jvDealId: params.jvDealId,
          jvTitle: params.jvTitle,
          jvProjectName: params.jvProjectName,
          amount: params.amount,
          equityPercent: params.equityPercent,
          expectedROI: params.expectedROI,
          investmentPool: params.investmentPool,
          paymentMethod: params.paymentMethod,
          confirmationNumber,
        },
      });

      await logAudit({
        entityType: 'holding',
        entityId: finalHoldingId,
        entityTitle: `JV Holding: ${params.jvProjectName}`,
        action: existingJVHolding ? 'UPDATE' : 'CREATE',
        source: 'app',
        details: {
          jvDealId: params.jvDealId,
          amount: params.amount,
          transactionId,
        },
      });
    } catch (auditErr) {
      console.log('[InvestmentService] JV audit log failed (non-critical):', (auditErr as Error)?.message);
    }

    return {
      success: true,
      transactionId,
      holdingId: finalHoldingId,
      confirmationNumber,
      message: `Successfully invested ${params.amount.toLocaleString()} in ${params.jvProjectName}.`,
    };

  } catch (error) {
    console.log('[InvestmentService] JV investment error:', (error as Error)?.message);
    return {
      success: false,
      transactionId: '',
      holdingId: '',
      confirmationNumber: '',
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
      error: 'unknown',
    };
  }
}
