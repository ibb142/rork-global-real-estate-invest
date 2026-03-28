import { supabase } from './supabase';
import { logAudit } from '@/lib/audit-trail';
import type { WalletRow, HoldingRow, ProfileRow } from '@/types/database';

const API_BASE_URL = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');

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

async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    console.log('[InvestmentService] Failed to get auth token');
    return null;
  }
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
  console.log('[InvestmentService] Starting JV investment via backend API:', {
    jvDealId: params.jvDealId,
    amount: params.amount,
    pool: params.investmentPool,
    paymentMethod: params.paymentMethod,
  });

  try {
    const token = await getAuthToken();
    if (!token) {
      console.log('[InvestmentService] No auth token — user not logged in');
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Please log in to invest.',
        error: 'not_authenticated',
      };
    }

    if (API_BASE_URL) {
      try {
        const url = `${API_BASE_URL}/purchase-jv`;
        console.log('[InvestmentService] Calling backend:', url);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            jvDealId: params.jvDealId,
            jvTitle: params.jvTitle,
            jvProjectName: params.jvProjectName,
            investmentPool: params.investmentPool,
            amount: params.amount,
            equityPercent: params.equityPercent,
            expectedROI: params.expectedROI,
            paymentMethod: params.paymentMethod,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await response.json() as {
          success: boolean;
          transactionId?: string;
          holdingId?: string;
          confirmationNumber?: string;
          message?: string;
        };

        console.log('[InvestmentService] Backend response:', response.status, data.success, data.message);

        if (response.ok && data.success) {
          console.log('[InvestmentService] JV purchase SUCCESS via backend:', data.confirmationNumber);

          try {
            await logAudit({
              entityType: 'transaction',
              entityId: data.transactionId || '',
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
                confirmationNumber: data.confirmationNumber,
              },
            });
          } catch (auditErr) {
            console.log('[InvestmentService] Local audit log failed (non-critical):', (auditErr as Error)?.message);
          }

          return {
            success: true,
            transactionId: data.transactionId || '',
            holdingId: data.holdingId || '',
            confirmationNumber: data.confirmationNumber || '',
            message: data.message || `Successfully invested in ${params.jvProjectName}.`,
          };
        } else {
          const errorMessage = data.message || `Server error (${response.status})`;
          console.log('[InvestmentService] Backend purchase failed:', errorMessage, '— falling back to direct Supabase');
        }
      } catch (backendErr) {
        console.log('[InvestmentService] Backend API error:', (backendErr as Error)?.message, '— falling back to direct Supabase');
      }
    } else {
      console.log('[InvestmentService] No API_BASE_URL — using direct Supabase for JV purchase');
    }

    console.log('[InvestmentService] Executing JV purchase directly via Supabase...');
    const confirmationNumber = `IVX-JV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const transactionId = `jv_txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const holdingId = `jv_hold_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

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

    const { data: dealData } = await supabase
      .from('jv_deals')
      .select('id, title, project_name, status, published')
      .eq('id', params.jvDealId)
      .single();

    if (!dealData) {
      console.log('[InvestmentService] Deal not found in Supabase:', params.jvDealId);
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Deal not found. It may have been removed.',
        error: 'deal_not_found',
      };
    }

    console.log('[InvestmentService] Deal verified:', (dealData as Record<string, unknown>).title);

    if (params.paymentMethod === 'wallet') {
      await ensureWalletExists(user.id);
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

    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        user_id: user.id,
        type: 'buy',
        amount: params.amount,
        status: 'completed',
        description: `JV ${params.investmentPool === 'jv_direct' ? 'Direct' : 'Token Shares'} investment in ${params.jvProjectName} — ${params.equityPercent}% equity — Confirmation: ${confirmationNumber}`,
        property_id: params.jvDealId,
        property_name: params.jvProjectName,
        created_at: new Date().toISOString(),
      });

    if (txError) {
      console.log('[InvestmentService] Direct Supabase transaction insert failed:', txError?.message);
      return {
        success: false,
        transactionId: '',
        holdingId: '',
        confirmationNumber: '',
        message: 'Failed to record transaction. Please try again.',
        error: txError.message,
      };
    }

    const { data: existingHolding } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('property_id', params.jvDealId)
      .single();

    let finalHoldingId = holdingId;

    if (existingHolding) {
      const existing = existingHolding as unknown as HoldingRow;
      finalHoldingId = existing.id;
      const pricePerShare = params.investmentPool === 'token_shares' ? 50 : 1000;
      const newShares = (existing.shares || 0) + Math.max(1, Math.floor(params.amount / pricePerShare));
      const newCurrentValue = newShares * pricePerShare;

      const { error: updateError } = await supabase
        .from('holdings')
        .update({
          shares: newShares,
          current_value: Math.round(newCurrentValue * 100) / 100,
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
          message: 'Failed to update holding. Transaction rolled back.',
          error: updateError.message,
        };
      }
    } else {
      const pricePerShare = params.investmentPool === 'token_shares' ? 50 : 1000;
      const shares = Math.max(1, Math.floor(params.amount / pricePerShare));

      const { error: holdError } = await supabase
        .from('holdings')
        .insert({
          id: holdingId,
          user_id: user.id,
          property_id: params.jvDealId,
          shares,
          avg_cost_basis: pricePerShare,
          current_value: Math.round(params.amount * 100) / 100,
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
          message: 'Failed to create holding. Transaction rolled back.',
          error: holdError.message,
        };
      }
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id,
        type: 'transaction',
        title: 'JV Investment Confirmed',
        message: `You invested ${params.amount.toLocaleString()} in ${params.jvProjectName} (${params.investmentPool === 'jv_direct' ? 'JV Direct' : 'Token Shares'}). Confirmation: ${confirmationNumber}`,
        read: false,
        created_at: new Date().toISOString(),
      });
    if (notifError) {
      console.log('[InvestmentService] Notification insert failed (non-critical):', notifError.message);
    }

    console.log('[InvestmentService] JV purchase SUCCESS via direct Supabase:', confirmationNumber);

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
          method: 'direct_supabase',
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
      message: `Successfully invested ${params.amount.toLocaleString()} in ${params.jvProjectName}.`,
    };

  } catch (error) {
    console.log('[InvestmentService] JV investment error:', (error as Error)?.message);
    return {
      success: false,
      transactionId: '',
      holdingId: '',
      confirmationNumber: '',
      message: error instanceof Error ? error.message : 'An unexpected error occurred. Please check your connection and try again.',
      error: 'unknown',
    };
  }
}
