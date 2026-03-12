import { supabase } from './supabase';

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
    return (wallet as any).available ?? 0;
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
    console.error('[InvestmentService] Failed to create wallet:', insertError);
  }
  return 0;
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
      console.error('[InvestmentService] Transaction insert failed:', txError);
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

    if (existingHolding) {
      const existing = existingHolding as any;
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
        console.error('[InvestmentService] Holding update failed:', updateError);
      } else {
        console.log('[InvestmentService] Holding updated:', existing.id);
      }
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
        console.error('[InvestmentService] Holding insert failed:', holdError);
      } else {
        console.log('[InvestmentService] New holding created:', holdingId);
      }
    }

    if (request.paymentMethod === 'wallet') {
      const { error: walletError } = await supabase
        .from('wallets')
        .update({
          available: Math.max(0, walletBalance - request.totalCost),
          invested: (walletBalance > 0 ? request.totalCost : 0),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (walletError) {
        console.error('[InvestmentService] Wallet update failed:', walletError);
      } else {
        console.log('[InvestmentService] Wallet debited:', request.totalCost);
      }
    }

    if (request.platformFee > 0) {
      await supabase
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
      console.log('[InvestmentService] Platform fee recorded:', request.platformFee);
    }

    await supabase
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

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        total_invested: walletBalance > 0 ? request.totalCost : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileError) {
      console.log('[InvestmentService] Profile update skipped:', profileError.message);
    }

    console.log('[InvestmentService] Purchase completed successfully:', confirmationNumber);

    return {
      success: true,
      transactionId,
      holdingId: existingHolding ? (existingHolding as any).id : holdingId,
      confirmationNumber,
      message: `Successfully purchased ${request.shares} shares of ${request.propertyName}.`,
    };

  } catch (error) {
    console.error('[InvestmentService] Unexpected error:', error);
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
      console.error('[InvestmentService] JV transaction insert failed:', txError);
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
      console.error('[InvestmentService] JV holding insert failed:', holdError);
    } else {
      console.log('[InvestmentService] JV holding created:', holdingId);
    }

    if (params.paymentMethod === 'wallet') {
      await supabase
        .from('wallets')
        .update({
          available: Math.max(0, walletBalance - params.amount),
          invested: params.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      console.log('[InvestmentService] Wallet debited for JV:', params.amount);
    }

    await supabase
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

    console.log('[InvestmentService] JV purchase completed:', confirmationNumber);

    return {
      success: true,
      transactionId,
      holdingId,
      confirmationNumber,
      message: `Successfully invested $${params.amount.toLocaleString()} in ${params.jvProjectName}.`,
    };

  } catch (error) {
    console.error('[InvestmentService] JV investment error:', error);
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
