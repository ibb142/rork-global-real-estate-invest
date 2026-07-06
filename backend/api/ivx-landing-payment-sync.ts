/**
 * IVX Landing Payment Sync API
 *
 * POST /api/ivx/payments/landing-intent
 *   Creates a real payment transaction from a landing-page investment intent.
 *
 * POST /api/ivx/payments/landing-confirm
 *   Owner/admin confirmation that real funds were received.
 */

import {
  createLandingPaymentTransaction,
  confirmLandingPaymentTransaction,
  type LandingPaymentInput,
} from '../services/ivx-landing-payment-sync';
import { createClient } from '@supabase/supabase-js';

function getString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (typeof value === 'string') return value;
  return undefined;
}

function getNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function getBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  return false;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
}

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function getSupabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

async function verifyInvestorAuth(request: Request): Promise<{ userId: string; email: string } | null> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) return null;

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return { userId: data.user.id, email: data.user.email || '' };
  } catch {
    return null;
  }
}

export async function handleLandingPaymentOptionsRequest(): Promise<Response> {
  return corsOptionsResponse();
}

export async function handleLandingPaymentCreateRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return handleLandingPaymentOptionsRequest();

  try {
    const body = (await request.json()) as Record<string, unknown>;

    const dealId = getString(body, 'dealId');
    const dealTitle = getString(body, 'dealTitle') || 'Untitled Deal';
    const investmentType = getString(body, 'investmentType') || 'jv_direct';
    const amount = getNumber(body, 'amount');
    const expectedRoi = getNumber(body, 'expectedRoi') ?? getNumber(body, 'expected_roi') ?? 0;
    const ownershipPct = getNumber(body, 'ownershipPct') ?? getNumber(body, 'ownership_pct') ?? 0;
    const paymentMethod = getString(body, 'paymentMethod') || 'bank';
    const investorEmail = getString(body, 'investorEmail');
    const investorId = getString(body, 'investorId') || null;
    const investorName = getString(body, 'investorName') || '';
    const termsAccepted = getBoolean(body, 'termsAccepted');
    const source = getString(body, 'source') || 'landing_page';

    if (!dealId) return jsonResponse({ ok: false, error: 'Missing dealId.' }, 400);
    if (amount === undefined || amount <= 0) {
      return jsonResponse({ ok: false, error: 'Missing or invalid amount.' }, 400);
    }
    if (!investorEmail) {
      return jsonResponse({ ok: false, error: 'Missing investorEmail.' }, 400);
    }

    // Real payment transactions require a verified investor. If the request supplies
    // a valid Supabase access token, use the authenticated user's identity.
    const auth = await verifyInvestorAuth(request);
    if (!auth) {
      return jsonResponse({ ok: false, error: 'Investor must be authenticated before creating a real payment transaction.' }, 401);
    }
    const verifiedInvestorId = auth.userId;
    const verifiedInvestorEmail = auth.email || investorEmail;

    const input: LandingPaymentInput = {
      dealId,
      dealTitle,
      investmentType,
      amount,
      expectedRoi,
      ownershipPct,
      paymentMethod,
      investorEmail: verifiedInvestorEmail,
      investorId: verifiedInvestorId,
      investorName,
      termsAccepted,
      source,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
    };

    const result = await createLandingPaymentTransaction(input);

    return jsonResponse(
      {
        ok: result.success,
        transactionId: result.transactionId,
        landingInvestmentId: result.landingInvestmentId,
        intentId: result.intentId,
        status: result.status,
        message: result.message,
        providerConfigured: result.providerConfigured,
        providerMode: result.providerMode,
        auditLogged: result.auditLogged,
        error: result.error,
      },
      result.success ? 200 : 500
    );
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Request processing failed.' },
      500
    );
  }
}

export async function handleLandingPaymentConfirmRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return handleLandingPaymentOptionsRequest();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const transactionId = getString(body, 'transactionId');
    const confirmedBy = getString(body, 'confirmedBy') || 'owner';
    const confirmationMethod = getString(body, 'confirmationMethod') || 'wire_receipt';
    const notes = getString(body, 'notes') || '';

    if (!transactionId) {
      return jsonResponse({ ok: false, error: 'Missing transactionId.' }, 400);
    }

    const result = await confirmLandingPaymentTransaction(
      transactionId,
      confirmedBy,
      confirmationMethod,
      notes
    );

    return jsonResponse(
      { ok: result.success, error: result.error },
      result.success ? 200 : 400
    );
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : 'Confirmation failed.' },
      500
    );
  }
}
