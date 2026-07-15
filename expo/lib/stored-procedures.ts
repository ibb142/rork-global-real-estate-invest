import { supabase } from './supabase';

export interface AtomicPurchaseParams {
  p_user_id: string;
  p_property_id: string;
  p_property_name: string;
  p_shares: number;
  p_price_per_share: number;
  p_subtotal: number;
  p_platform_fee: number;
  p_total_cost: number;
  p_payment_method: string;
  p_investment_type: string;
  p_transaction_id: string;
  p_holding_id: string;
  p_confirmation_number: string;
}

export interface AtomicPurchaseResult {
  success: boolean;
  transaction_id: string;
  holding_id: string;
  confirmation_number: string;
  message: string;
  new_balance: number;
}

export interface AtomicSellParams {
  p_user_id: string;
  p_property_id: string;
  p_property_name: string;
  p_shares: number;
  p_price_per_share: number;
  p_subtotal: number;
  p_platform_fee: number;
  p_net_proceeds: number;
  p_transaction_id: string;
  p_confirmation_number: string;
}

export interface AtomicSellResult {
  success: boolean;
  transaction_id: string;
  holding_id: string;
  confirmation_number: string;
  message: string;
  new_balance: number;
  remaining_shares: number;
}

export interface AtomicWalletOpParams {
  p_user_id: string;
  p_amount: number;
  p_operation: 'credit' | 'debit';
  p_reason: string;
  p_description: string;
  p_reference_id?: string;
  p_reference_type?: string;
  p_fee?: number;
}

export interface AtomicWalletOpResult {
  success: boolean;
  new_available: number;
  new_invested: number;
  new_total: number;
  message: string;
  transaction_id: string;
}

export async function rpcAtomicPurchase(params: AtomicPurchaseParams): Promise<AtomicPurchaseResult> {
  console.log('[StoredProc] Calling atomic_purchase_shares RPC:', params.p_property_id, params.p_shares);
  try {
    const { data, error } = await supabase.rpc('atomic_purchase_shares', params);
    if (error) {
      console.log('[StoredProc] atomic_purchase_shares RPC error:', error.message);
      return {
        success: false,
        transaction_id: '',
        holding_id: '',
        confirmation_number: '',
        message: error.message || 'Database operation failed',
        new_balance: 0,
      };
    }
    const result = (data as unknown as AtomicPurchaseResult[])?.[0] ?? data as unknown as AtomicPurchaseResult;
    console.log('[StoredProc] atomic_purchase_shares result:', result?.success, result?.message);
    return result;
  } catch (err) {
    console.log('[StoredProc] atomic_purchase_shares exception:', (err as Error)?.message);
    return {
      success: false,
      transaction_id: '',
      holding_id: '',
      confirmation_number: '',
      message: (err as Error)?.message || 'Unexpected error',
      new_balance: 0,
    };
  }
}

export async function rpcAtomicSell(params: AtomicSellParams): Promise<AtomicSellResult> {
  console.log('[StoredProc] Calling atomic_sell_shares RPC:', params.p_property_id, params.p_shares);
  try {
    const { data, error } = await supabase.rpc('atomic_sell_shares', params);
    if (error) {
      console.log('[StoredProc] atomic_sell_shares RPC error:', error.message);
      return {
        success: false,
        transaction_id: '',
        holding_id: '',
        confirmation_number: '',
        message: error.message || 'Database operation failed',
        new_balance: 0,
        remaining_shares: 0,
      };
    }
    const result = (data as unknown as AtomicSellResult[])?.[0] ?? data as unknown as AtomicSellResult;
    console.log('[StoredProc] atomic_sell_shares result:', result?.success, result?.message);
    return result;
  } catch (err) {
    console.log('[StoredProc] atomic_sell_shares exception:', (err as Error)?.message);
    return {
      success: false,
      transaction_id: '',
      holding_id: '',
      confirmation_number: '',
      message: (err as Error)?.message || 'Unexpected error',
      new_balance: 0,
      remaining_shares: 0,
    };
  }
}

export async function rpcAtomicWalletOp(params: AtomicWalletOpParams): Promise<AtomicWalletOpResult> {
  console.log('[StoredProc] Calling atomic_wallet_operation RPC:', params.p_operation, params.p_amount);
  try {
    const { data, error } = await supabase.rpc('atomic_wallet_operation', {
      p_user_id: params.p_user_id,
      p_amount: params.p_amount,
      p_operation: params.p_operation,
      p_reason: params.p_reason,
      p_description: params.p_description,
      p_reference_id: params.p_reference_id ?? null,
      p_reference_type: params.p_reference_type ?? null,
      p_fee: params.p_fee ?? 0,
    });
    if (error) {
      console.log('[StoredProc] atomic_wallet_operation RPC error:', error.message);
      return {
        success: false,
        new_available: 0,
        new_invested: 0,
        new_total: 0,
        message: error.message || 'Database operation failed',
        transaction_id: '',
      };
    }
    const result = (data as unknown as AtomicWalletOpResult[])?.[0] ?? data as unknown as AtomicWalletOpResult;
    console.log('[StoredProc] atomic_wallet_operation result:', result?.success, result?.message);
    return result;
  } catch (err) {
    console.log('[StoredProc] atomic_wallet_operation exception:', (err as Error)?.message);
    return {
      success: false,
      new_available: 0,
      new_invested: 0,
      new_total: 0,
      message: (err as Error)?.message || 'Unexpected error',
      transaction_id: '',
    };
  }
}

export async function checkStoredProceduresExist(): Promise<{
  available: boolean;
  procedures: Record<string, boolean>;
}> {
  const procs = ['atomic_purchase_shares', 'atomic_sell_shares', 'atomic_wallet_operation'];
  const results: Record<string, boolean> = {};

  for (const proc of procs) {
    try {
      const { error } = await supabase.rpc(proc, {});
      const msg = error?.message ?? '';
      if (msg.includes('does not exist') || msg.includes('could not find')) {
        results[proc] = false;
      } else {
        results[proc] = true;
      }
    } catch {
      results[proc] = false;
    }
  }

  const available = Object.values(results).every(Boolean);
  console.log('[StoredProc] Procedure availability:', results, '| all available:', available);
  return { available, procedures: results };
}
