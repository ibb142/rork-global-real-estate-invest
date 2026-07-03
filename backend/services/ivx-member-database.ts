/**
 * IVX Member Database Service
 *
 * Database operations for member registration, profile management,
 * and KYC status tracking. Uses Supabase with service_role.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEPLOYMENT_MARKER = 'ivx-member-database-v1';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  // Service-role key first; anon key as a working fallback (service key was rotated).
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function hasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export interface MemberRegistrationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  zipCode?: string;
  roles?: string[];
  acceptTerms: boolean;
}

export interface MemberRegistrationResult {
  success: boolean;
  message: string;
  userId?: string;
  email?: string;
  requiresVerification: boolean;
  deploymentMarker: string;
}

export async function registerMember(input: MemberRegistrationInput): Promise<MemberRegistrationResult> {
  const supabase = getSupabaseAdmin();

  const userMetadata = {
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    country: input.country,
    zip_code: input.zipCode ?? '',
    role_interests: input.roles ?? [],
    member_status: 'free_member',
  };

  try {
    // 1. Create Supabase Auth user — admin API when a service-role key exists,
    //    otherwise public signUp with the anon key (admin API requires service role).
    let authUserId: string | undefined;
    let authError: { message: string } | null = null;

    if (hasServiceRoleKey()) {
      const { data: authData, error } = await supabase.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: false, // We handle verification ourselves
        user_metadata: userMetadata,
      });
      authUserId = authData.user?.id;
      authError = error ? { message: error.message } : null;
    } else {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: userMetadata },
      });
      authUserId = signUpData.user?.id;
      authError = error ? { message: error.message } : null;
      // Supabase returns an obfuscated user with empty identities for existing emails.
      if (!authError && signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
        authError = { message: 'User already registered' };
      }
    }

    if (authError) {
      console.error('[MemberDB] Auth user creation failed:', authError.message);
      if (authError.message.toLowerCase().includes('already') || authError.message.toLowerCase().includes('duplicate')) {
        return {
          success: false,
          message: 'An account with this email already exists. Please sign in instead.',
          requiresVerification: false,
          deploymentMarker: DEPLOYMENT_MARKER,
        };
      }
      return {
        success: false,
        message: `Account creation failed: ${authError.message}`,
        requiresVerification: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    const userId = authUserId;
    if (!userId) {
      return {
        success: false,
        message: 'Account created but user ID not returned',
        requiresVerification: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    // 2. Create profile record
    const now = new Date().toISOString();
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        country: input.country,
        role: 'investor',
        status: 'active',
        kyc_status: 'not_started',
        email_verified: false,
        phone_verified: false,
        total_invested: 0,
        total_returns: 0,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      console.error('[MemberDB] Profile creation failed:', profileError.message);
    }

    // 3. Create wallet record
    try {
      const { error: walletError } = await supabase.from('wallets').insert({
        user_id: userId,
        available: 0,
        pending: 0,
        invested: 0,
        total: 0,
        currency: 'USD',
      });
      if (walletError && !walletError.message.toLowerCase().includes('duplicate')) {
        console.error('[MemberDB] Wallet creation failed:', walletError.message);
      }
    } catch (walletErr) {
      console.error('[MemberDB] Wallet creation exception:', walletErr);
    }

    // 4. Log audit
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'member_registered',
        details: JSON.stringify({
          email: input.email,
          country: input.country,
          acceptTerms: input.acceptTerms,
        }),
        created_at: now,
      });
    } catch {
      // non-critical
    }

    console.log('[MemberDB] Member registered:', userId, input.email);
    return {
      success: true,
      message: 'Account created successfully. Please verify your email and phone.',
      userId,
      email: input.email,
      requiresVerification: true,
      deploymentMarker: DEPLOYMENT_MARKER,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MemberDB] Registration exception:', message);
    return {
      success: false,
      message: 'Registration failed due to an internal error',
      requiresVerification: false,
      deploymentMarker: DEPLOYMENT_MARKER,
    };
  }
}

export interface MemberProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  role: string;
  status: string;
  kycStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  totalInvested: number;
  totalReturns: number;
  createdAt: string;
  updatedAt: string;
}

export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    const p = data as any;
    return {
      id: p.id,
      email: p.email ?? '',
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      phone: p.phone ?? '',
      country: p.country ?? '',
      role: p.role ?? 'investor',
      status: p.status ?? 'active',
      kycStatus: p.kyc_status ?? 'not_started',
      emailVerified: !!(p.email_verified),
      phoneVerified: !!(p.phone_verified),
      totalInvested: Number(p.total_invested ?? 0),
      totalReturns: Number(p.total_returns ?? 0),
      createdAt: p.created_at ?? '',
      updatedAt: p.updated_at ?? '',
    };
  } catch (err) {
    console.error('[MemberDB] Profile fetch error:', err);
    return null;
  }
}

export async function updateMemberKYCStatus(
  userId: string,
  status: 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ kyc_status: status, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('[MemberDB] KYC status update failed:', error.message);
      return false;
    }

    // Audit log
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'kyc_status_changed',
        details: JSON.stringify({ newStatus: status }),
        created_at: new Date().toISOString(),
      });
    } catch {
      // non-critical
    }

    return true;
  } catch (err) {
    console.error('[MemberDB] KYC update exception:', err);
    return false;
  }
}

export async function updateMemberLastLogin(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  try {
    await supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    // non-critical
  }
}
