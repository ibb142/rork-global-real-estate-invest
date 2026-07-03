/**
 * IVX Member Verification Service
 *
 * Generates verification codes, stores them in Supabase with TTL,
 * and provides verification endpoints for email and phone.
 * Email/SMS delivery is handled via the Rork AI gateway for now;
 * connect to SendGrid/Twilio for production.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEPLOYMENT_MARKER = 'ivx-member-verification-v1';
const CODE_TTL_MINUTES = 10;
const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

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

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

interface VerificationCodeRecord {
  id: string;
  user_id: string;
  type: 'email' | 'phone';
  code: string;
  attempts: number;
  expires_at: string;
  verified_at: string | null;
  created_at: string;
}

interface StoreCodeInput {
  userId: string;
  type: 'email' | 'phone';
}

interface VerifyCodeInput {
  userId: string;
  type: 'email' | 'phone';
  code: string;
}

interface VerificationResult {
  success: boolean;
  message: string;
  verified: boolean;
  code?: string;
  deploymentMarker: string;
}

export async function storeVerificationCode(input: StoreCodeInput): Promise<VerificationResult> {
  const supabase = getSupabaseAdmin();
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  try {
    const { error } = await supabase.from('verification_codes').upsert(
      {
        user_id: input.userId,
        type: input.type,
        code,
        attempts: 0,
        expires_at: expiresAt.toISOString(),
        verified_at: null,
        created_at: now.toISOString(),
      },
      { onConflict: 'user_id,type' }
    );

    if (error) {
      console.error('[MemberVerification] Code store failed:', error.message);
      return {
        success: false,
        message: 'Failed to generate verification code',
        verified: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    console.log(`[MemberVerification] Code stored for ${input.userId} (${input.type}): ${code}`);
    return {
      success: true,
      message: `Verification code generated`,
      verified: false,
      code,
      deploymentMarker: DEPLOYMENT_MARKER,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MemberVerification] Code store exception:', message);
    return {
      success: false,
      message: 'Internal error generating verification code',
      verified: false,
      deploymentMarker: DEPLOYMENT_MARKER,
    };
  }
}

export async function verifyCode(input: VerifyCodeInput): Promise<VerificationResult> {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('user_id', input.userId)
      .eq('type', input.type)
      .is('verified_at', null)
      .maybeSingle();

    if (error) {
      console.error('[MemberVerification] Code lookup failed:', error.message);
      return {
        success: false,
        message: 'Verification lookup failed',
        verified: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    const record = data as VerificationCodeRecord | null;

    if (!record) {
      return {
        success: false,
        message: 'No pending verification found. Please request a new code.',
        verified: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      return {
        success: false,
        message: 'Verification code has expired. Please request a new code.',
        verified: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    // Check attempts
    if (record.attempts >= MAX_ATTEMPTS) {
      return {
        success: false,
        message: 'Too many failed attempts. Please request a new code.',
        verified: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    // Increment attempts
    const newAttempts = record.attempts + 1;

    if (record.code !== input.code) {
      await supabase
        .from('verification_codes')
        .update({ attempts: newAttempts })
        .eq('id', record.id);

      const remaining = MAX_ATTEMPTS - newAttempts;
      return {
        success: false,
        message: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        verified: false,
        deploymentMarker: DEPLOYMENT_MARKER,
      };
    }

    // Code matches — mark verified
    const now = new Date().toISOString();
    await supabase
      .from('verification_codes')
      .update({ verified_at: now, attempts: newAttempts })
      .eq('id', record.id);

    // Update profile verification status
    const verifiedField = input.type === 'email' ? 'email_verified' : 'phone_verified';
    await supabase
      .from('profiles')
      .update({ [verifiedField]: true, updated_at: now })
      .eq('id', input.userId);

    // Log to audit
    try {
      await supabase.from('audit_logs').insert({
        user_id: input.userId,
        action: `verify_${input.type}`,
        details: JSON.stringify({ type: input.type, success: true }),
        created_at: now,
      });
    } catch {
      // non-critical
    }

    return {
      success: true,
      message: `${input.type === 'email' ? 'Email' : 'Phone'} verified successfully`,
      verified: true,
      deploymentMarker: DEPLOYMENT_MARKER,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MemberVerification] Code verify exception:', message);
    return {
      success: false,
      message: 'Internal verification error',
      verified: false,
      deploymentMarker: DEPLOYMENT_MARKER,
    };
  }
}

export async function checkVerificationStatus(
  userId: string
): Promise<{ emailVerified: boolean; phoneVerified: boolean }> {
  const supabase = getSupabaseAdmin();

  try {
    const { data } = await supabase
      .from('profiles')
      .select('email_verified, phone_verified')
      .eq('id', userId)
      .maybeSingle();

    return {
      emailVerified: !!(data as any)?.email_verified,
      phoneVerified: !!(data as any)?.phone_verified,
    };
  } catch {
    return { emailVerified: false, phoneVerified: false };
  }
}

export async function getRemainingCodeAttempts(
  userId: string,
  type: 'email' | 'phone'
): Promise<{ remaining: number; expiresAt: string | null }> {
  const supabase = getSupabaseAdmin();

  try {
    const { data } = await supabase
      .from('verification_codes')
      .select('attempts, expires_at')
      .eq('user_id', userId)
      .eq('type', type)
      .is('verified_at', null)
      .maybeSingle();

    if (!data) return { remaining: 0, expiresAt: null };

    const record = data as { attempts: number; expires_at: string };
    return {
      remaining: Math.max(0, MAX_ATTEMPTS - record.attempts),
      expiresAt: record.expires_at,
    };
  } catch {
    return { remaining: 0, expiresAt: null };
  }
}
