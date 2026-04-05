import { supabase, isSupabaseConfigured } from './supabase';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IntakeProofOfFundsFile } from '@/lib/investor-intake';
import {
  INVESTOR_MEMBER_AGREEMENT_VERSION,
  parseRangeMidpoint,
  parseReturnMidpoint,
} from '@/lib/investor-intake';

export interface WaitlistFormData {
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone: string;
  accredited_status: 'accredited' | 'non_accredited' | 'unsure' | null;
  consent: boolean;
  agreement_accepted?: boolean;
  agreement_version?: string;
  signature_name?: string;
  investment_range?: string;
  return_expectation?: string;
  preferred_call_time?: string;
  best_time_for_call?: string;
  investment_timeline?: string;
  membership_interest?: 'waitlist' | 'member_signup' | 'investor_onboarding';
  proof_of_funds_url?: string | null;
  proof_of_funds_name?: string | null;
  proof_of_funds_storage_path?: string | null;
  source: string;
  page_path: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  referrer: string;
}

export interface WaitlistEntry {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  phone: string;
  email_normalized: string;
  phone_e164: string;
  phone_verified: boolean;
  accredited_status: string | null;
  consent_sms: boolean;
  consent_email: boolean;
  agreement_accepted?: boolean | null;
  agreement_version?: string | null;
  signature_name?: string | null;
  investment_range?: string | null;
  return_expectation?: string | null;
  preferred_call_time?: string | null;
  best_time_for_call?: string | null;
  investment_timeline?: string | null;
  membership_interest?: string | null;
  proof_of_funds_url?: string | null;
  proof_of_funds_name?: string | null;
  proof_of_funds_storage_path?: string | null;
  source: string;
  page_path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  submitted_at: string;
}

export type WaitlistErrorCode =
  | 'invalid_email'
  | 'invalid_phone'
  | 'otp_send_failed'
  | 'otp_invalid'
  | 'otp_expired'
  | 'duplicate_email'
  | 'duplicate_phone'
  | 'rate_limited'
  | 'submission_failed'
  | 'network_error';

const ERROR_MESSAGES: Record<WaitlistErrorCode, string> = {
  invalid_email: 'Please enter a valid email address.',
  invalid_phone: 'Please enter a valid phone number with country code.',
  otp_send_failed: 'We couldn\'t send the verification code. Please try again.',
  otp_invalid: 'The code you entered is incorrect. Please check and try again.',
  otp_expired: 'Your verification code has expired. Please request a new one.',
  duplicate_email: 'This email is already on our waitlist.',
  duplicate_phone: 'This phone number is already on our waitlist.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  submission_failed: 'We couldn\'t process your submission. Please try again.',
  network_error: 'Connection issue. Please check your internet and try again.',
};

export function getErrorMessage(code: WaitlistErrorCode): string {
  return ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

export function validateFullName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 120;
}

export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()./]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned.length >= 10 && cleaned.length <= 16 && /^\+\d+$/.test(cleaned);
  }
  return cleaned.length >= 10 && cleaned.length <= 15 && /^\d+$/.test(cleaned);
}

export function normalizePhoneE164(phone: string): string {
  let cleaned = phone.replace(/[\s\-()./]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  return cleaned;
}

export function isFormValid(
  fullName: string,
  email: string,
  phone: string,
  phoneVerified: boolean,
  consent: boolean
): boolean {
  return (
    validateFullName(fullName) &&
    validateEmail(email) &&
    validatePhone(phone) &&
    phoneVerified &&
    consent
  );
}

const OTP_SEND_COUNT_KEY = '@ivx_otp_send_counts';
const _OTP_VERIFY_COUNT_KEY = '@ivx_otp_verify_counts';

async function getOtpSendCount(phone: string): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(OTP_SEND_COUNT_KEY);
    if (!stored) return 0;
    const counts = JSON.parse(stored) as Record<string, { count: number; resetAt: number }>;
    const entry = counts[phone];
    if (!entry) return 0;
    if (Date.now() > entry.resetAt) return 0;
    return entry.count;
  } catch { return 0; }
}

async function incrementOtpSendCount(phone: string): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(OTP_SEND_COUNT_KEY);
    const counts = stored ? JSON.parse(stored) as Record<string, { count: number; resetAt: number }> : {};
    const entry = counts[phone];
    const oneHour = 60 * 60 * 1000;
    if (!entry || Date.now() > entry.resetAt) {
      counts[phone] = { count: 1, resetAt: Date.now() + oneHour };
    } else {
      counts[phone] = { count: entry.count + 1, resetAt: entry.resetAt };
    }
    await AsyncStorage.setItem(OTP_SEND_COUNT_KEY, JSON.stringify(counts));
  } catch {}
}

export async function sendOtp(phone: string): Promise<{ success: boolean; error?: WaitlistErrorCode; cooldown?: number }> {
  console.log('[WaitlistOTP] Sending OTP to:', phone);

  if (!validatePhone(phone)) {
    return { success: false, error: 'invalid_phone' };
  }

  const phoneE164 = normalizePhoneE164(phone);
  const sendCount = await getOtpSendCount(phoneE164);
  if (sendCount >= 5) {
    console.log('[WaitlistOTP] Rate limited — too many sends for:', phoneE164);
    logOtpEvent(phoneE164, 'rate_limited');
    return { success: false, error: 'rate_limited' };
  }

  if (!isSupabaseConfigured()) {
    console.log('[WaitlistOTP] Supabase not configured — cannot send real OTP');
    return { success: false, error: 'otp_send_failed' };
  }

  try {
    logOtpEvent(phoneE164, 'send_requested');

    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
    });

    if (error) {
      console.log('[WaitlistOTP] Supabase OTP send error:', error.message);
      logOtpEvent(phoneE164, 'send_failed');

      if (error.message?.toLowerCase().includes('rate') || error.message?.toLowerCase().includes('limit')) {
        return { success: false, error: 'rate_limited' };
      }
      return { success: false, error: 'otp_send_failed' };
    }

    await incrementOtpSendCount(phoneE164);
    logOtpEvent(phoneE164, 'send_success');
    console.log('[WaitlistOTP] OTP sent successfully to:', phoneE164);
    return { success: true, cooldown: 30 };
  } catch (err) {
    console.log('[WaitlistOTP] Send exception:', (err as Error)?.message);
    logOtpEvent(phoneE164, 'send_failed');
    return { success: false, error: 'otp_send_failed' };
  }
}

export async function verifyOtp(phone: string, code: string): Promise<{ success: boolean; error?: WaitlistErrorCode }> {
  console.log('[WaitlistOTP] Verifying OTP for:', phone);

  const phoneE164 = normalizePhoneE164(phone);

  if (!code || code.length !== 6) {
    return { success: false, error: 'otp_invalid' };
  }

  if (!isSupabaseConfigured()) {
    console.log('[WaitlistOTP] Supabase not configured — cannot verify OTP');
    return { success: false, error: 'otp_invalid' };
  }

  try {
    const { error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: code,
      type: 'sms',
    });

    if (error) {
      console.log('[WaitlistOTP] Verify error:', error.message);
      logOtpEvent(phoneE164, 'verify_failed');

      if (error.message?.toLowerCase().includes('expired')) {
        return { success: false, error: 'otp_expired' };
      }
      if (error.message?.toLowerCase().includes('rate') || error.message?.toLowerCase().includes('limit')) {
        return { success: false, error: 'rate_limited' };
      }
      return { success: false, error: 'otp_invalid' };
    }

    logOtpEvent(phoneE164, 'verify_success');
    console.log('[WaitlistOTP] OTP verified successfully for:', phoneE164);

    try {
      await supabase.auth.signOut();
    } catch {}

    return { success: true };
  } catch (err) {
    console.log('[WaitlistOTP] Verify exception:', (err as Error)?.message);
    logOtpEvent(phoneE164, 'verify_failed');
    return { success: false, error: 'otp_invalid' };
  }
}

function logOtpEvent(phoneE164: string, eventType: string): void {
  if (!isSupabaseConfigured()) return;
  supabase.from('waitlist_otp_events').insert({
    phone_e164: phoneE164,
    event_type: eventType,
  }).then(({ error }) => {
    if (error) {
      console.log('[WaitlistOTP] Audit log insert error:', error.message);
    }
  });
}

const INVESTOR_INTAKE_BUCKET = 'investor-intake';

export async function uploadProofOfFundsFile(file: IntakeProofOfFundsFile): Promise<IntakeProofOfFundsFile> {
  console.log('[WaitlistService] Uploading proof of funds:', file.name);

  if (!isSupabaseConfigured()) {
    console.log('[WaitlistService] Supabase not configured — returning local proof-of-funds metadata only');
    return file;
  }

  try {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `proof-of-funds/${Date.now()}_${safeName}`;
    const contentType = file.mimeType ?? blob.type ?? 'application/octet-stream';

    const { error } = await supabase.storage.from(INVESTOR_INTAKE_BUCKET).upload(storagePath, blob, {
      contentType,
      upsert: false,
    });

    if (error) {
      console.log('[WaitlistService] Proof-of-funds upload failed:', error.message);
      return file;
    }

    const { data } = supabase.storage.from(INVESTOR_INTAKE_BUCKET).getPublicUrl(storagePath);
    console.log('[WaitlistService] Proof-of-funds upload success:', storagePath);

    return {
      ...file,
      storagePath,
      publicUrl: data.publicUrl,
    };
  } catch (err) {
    console.log('[WaitlistService] Proof-of-funds upload exception:', (err as Error)?.message);
    return file;
  }
}

async function syncLandingSubmission(data: WaitlistFormData & { phone_verified: boolean }, submittedAt: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const investmentAmount = data.investment_range ? parseRangeMidpoint(data.investment_range) : 0;
  const expectedRoi = data.return_expectation ? parseReturnMidpoint(data.return_expectation) : 0;
  const bestTimeForCall = data.best_time_for_call || data.preferred_call_time || null;
  const notesPayload = {
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    investment_range: data.investment_range ?? null,
    return_expectation: data.return_expectation ?? null,
    preferred_call_time: bestTimeForCall,
    investment_timeline: data.investment_timeline ?? null,
    accredited_status: data.accredited_status ?? null,
    membership_interest: data.membership_interest ?? 'waitlist',
    agreement_accepted: data.agreement_accepted ?? data.consent,
    agreement_version: data.agreement_version ?? INVESTOR_MEMBER_AGREEMENT_VERSION,
    signature_name: data.signature_name ?? data.full_name,
    proof_of_funds_name: data.proof_of_funds_name ?? null,
    proof_of_funds_url: data.proof_of_funds_url ?? null,
    proof_of_funds_storage_path: data.proof_of_funds_storage_path ?? null,
    phone_verified: data.phone_verified,
    utm_source: data.utm_source || null,
    utm_medium: data.utm_medium || null,
    utm_campaign: data.utm_campaign || null,
    utm_content: data.utm_content || null,
    utm_term: data.utm_term || null,
    referrer: data.referrer || null,
  };

  try {
    const { error } = await supabase.from('landing_submissions').insert({
      source: data.source || 'landing_page',
      type: 'registration',
      investment_type: data.membership_interest || 'waitlist',
      investment_amount: investmentAmount > 0 ? investmentAmount : null,
      expected_roi: expectedRoi > 0 ? expectedRoi : null,
      full_name: data.full_name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      status: 'pending',
      submitted_at: submittedAt,
      notes: JSON.stringify(notesPayload),
    });

    if (error) {
      console.log('[WaitlistService] landing_submissions sync failed:', error.message);
    } else {
      console.log('[WaitlistService] landing_submissions sync success');
    }
  } catch (err) {
    console.log('[WaitlistService] landing_submissions sync exception:', (err as Error)?.message);
  }
}

export async function sendConfirmationEmail(fullName: string, email: string): Promise<boolean> {
  console.log('[WaitlistEmail] Sending confirmation to:', email);

  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !supabaseKey) {
    console.log('[WaitlistEmail] No Supabase config — skipping email');
    return false;
  }

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-waitlist-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        subject: 'Welcome to the IVX waitlist',
      }),
    });

    if (resp.ok) {
      console.log('[WaitlistEmail] Confirmation email sent successfully');
      return true;
    }

    const body = await resp.text().catch(() => '');
    console.log('[WaitlistEmail] Edge function returned:', resp.status, body.substring(0, 200));

    if (resp.status === 404) {
      console.log('[WaitlistEmail] Edge function not deployed — attempting direct Supabase email insert');
      return await sendEmailViaNotificationTable(fullName, email);
    }

    return false;
  } catch (err) {
    console.log('[WaitlistEmail] Exception:', (err as Error)?.message);
    return await sendEmailViaNotificationTable(fullName, email);
  }
}

async function sendEmailViaNotificationTable(fullName: string, email: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { error } = await supabase.from('email_notifications_queue').insert({
      to_email: email.trim().toLowerCase(),
      to_name: fullName.trim(),
      subject: 'Welcome to the IVX waitlist',
      body: `Hi ${fullName.trim()},\n\nYou're officially on the IVX waitlist.\nWe'll notify you when access opens and keep you updated on launch progress.\n\n— IVX Team`,
      status: 'pending',
      source: 'waitlist',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.log('[WaitlistEmail] Queue insert error:', error.message);
      return false;
    }

    console.log('[WaitlistEmail] Email queued in notification table');
    return true;
  } catch (err) {
    console.log('[WaitlistEmail] Queue exception:', (err as Error)?.message);
    return false;
  }
}

export async function submitWaitlistEntry(data: WaitlistFormData & { phone_verified: boolean }): Promise<{ success: boolean; error?: WaitlistErrorCode }> {
  console.log('[WaitlistService] Submitting entry...');

  if (!validateFullName(data.full_name)) {
    return { success: false, error: 'submission_failed' };
  }
  if (!validateEmail(data.email)) {
    return { success: false, error: 'invalid_email' };
  }
  if (!validatePhone(data.phone)) {
    return { success: false, error: 'invalid_phone' };
  }
  if (!data.phone_verified) {
    return { success: false, error: 'otp_invalid' };
  }

  if (!isSupabaseConfigured()) {
    console.log('[WaitlistService] Supabase not configured');
    return { success: false, error: 'network_error' };
  }

  const emailNormalized = normalizeEmail(data.email);
  const phoneE164 = normalizePhoneE164(data.phone);
  const now = new Date().toISOString();
  const firstName = data.first_name?.trim() || data.full_name.trim().split(' ')[0] || '';
  const lastName = data.last_name?.trim() || data.full_name.trim().split(' ').slice(1).join(' ') || '';
  const agreementAccepted = data.agreement_accepted ?? data.consent;
  const agreementVersion = data.agreement_version ?? INVESTOR_MEMBER_AGREEMENT_VERSION;
  const signatureName = data.signature_name?.trim() || data.full_name.trim();
  const bestTimeForCall = data.best_time_for_call || data.preferred_call_time || null;

  const entry = {
    full_name: data.full_name.trim(),
    first_name: firstName || null,
    last_name: lastName || null,
    email: data.email.trim(),
    email_normalized: emailNormalized,
    phone: data.phone.trim(),
    phone_e164: phoneE164,
    phone_verified: data.phone_verified,
    accredited_status: data.accredited_status,
    consent_sms: data.consent,
    consent_email: data.consent,
    agreement_accepted: agreementAccepted,
    agreement_version: agreementVersion,
    signature_name: signatureName,
    investment_range: data.investment_range || null,
    return_expectation: data.return_expectation || null,
    preferred_call_time: bestTimeForCall,
    best_time_for_call: bestTimeForCall,
    investment_timeline: data.investment_timeline || null,
    membership_interest: data.membership_interest || 'waitlist',
    proof_of_funds_url: data.proof_of_funds_url || null,
    proof_of_funds_name: data.proof_of_funds_name || null,
    proof_of_funds_storage_path: data.proof_of_funds_storage_path || null,
    source: data.source || 'landing_page',
    page_path: data.page_path || '/',
    referrer: data.referrer || null,
    utm_source: data.utm_source || null,
    utm_medium: data.utm_medium || null,
    utm_campaign: data.utm_campaign || null,
    utm_content: data.utm_content || null,
    utm_term: data.utm_term || null,
    user_agent: Platform.OS === 'web' ? (typeof navigator !== 'undefined' ? navigator.userAgent : null) : `IVX-App/${Platform.OS}`,
    status: 'pending',
    verified_at: data.phone_verified ? now : null,
    submitted_at: now,
  };

  const legacyPayload = {
    first_name: firstName,
    last_name: lastName,
    email: emailNormalized,
    phone: phoneE164,
    goal: [data.investment_range, data.return_expectation].filter(Boolean).join(' · '),
    created_at: now,
  };

  try {
    const { error } = await supabase.from('waitlist_entries').insert(entry);

    if (error) {
      console.log('[WaitlistService] Supabase insert error:', error.message, error.code);

      if (error.message?.includes('waitlist_entries_email_normalized_key') || error.code === '23505' && error.message?.includes('email')) {
        return { success: false, error: 'duplicate_email' };
      }
      if (error.message?.includes('waitlist_entries_phone_e164_key') || error.code === '23505' && error.message?.includes('phone')) {
        return { success: false, error: 'duplicate_phone' };
      }
      if (error.code === '23505') {
        return { success: false, error: 'duplicate_email' };
      }

      const missingColumns = error.message?.includes('column') || error.message?.includes('schema cache');
      if (missingColumns) {
        console.log('[WaitlistService] Rich columns not available yet — retrying with legacy waitlist payload');
        const legacyResult = await submitToLegacyWaitlist(data, legacyPayload, now);
        if (!legacyResult.success) {
          return legacyResult;
        }
      } else if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        console.log('[WaitlistService] Table does not exist — falling back to legacy waitlist table');
        return await submitToLegacyWaitlist(data, legacyPayload, now);
      } else {
        return { success: false, error: 'submission_failed' };
      }
    }

    await syncLandingSubmission(data, now);

    console.log('[WaitlistService] Entry submitted successfully');

    void sendConfirmationEmail(data.full_name, data.email).then((emailSent) => {
      console.log('[WaitlistService] Confirmation email sent:', emailSent);
    });

    return { success: true };
  } catch (err) {
    console.log('[WaitlistService] Exception:', (err as Error)?.message);
    return { success: false, error: 'network_error' };
  }
}

async function submitToLegacyWaitlist(
  data: WaitlistFormData & { phone_verified: boolean },
  legacyPayload?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    goal: string;
    created_at: string;
  },
  submittedAt?: string,
): Promise<{ success: boolean; error?: WaitlistErrorCode }> {
  try {
    const fallbackSubmittedAt = submittedAt ?? new Date().toISOString();
    const nameParts = data.full_name.trim().split(' ');
    const firstName = legacyPayload?.first_name || nameParts[0] || '';
    const lastName = legacyPayload?.last_name || nameParts.slice(1).join(' ') || '';

    const { error } = await supabase.from('waitlist').insert({
      first_name: firstName,
      last_name: lastName,
      email: legacyPayload?.email || normalizeEmail(data.email),
      phone: legacyPayload?.phone || normalizePhoneE164(data.phone),
      goal: legacyPayload?.goal || [data.investment_range, data.return_expectation].filter(Boolean).join(' · '),
      status: 'pending',
      created_at: fallbackSubmittedAt,
    });

    if (error) {
      console.log('[WaitlistService] Legacy insert error:', error.message);
      return { success: false, error: 'submission_failed' };
    }

    await syncLandingSubmission(data, fallbackSubmittedAt);
    console.log('[WaitlistService] Saved to legacy waitlist table');
    return { success: true };
  } catch (err) {
    console.log('[WaitlistService] Legacy exception:', (err as Error)?.message);
    return { success: false, error: 'network_error' };
  }
}

export async function fetchWaitlistStats(): Promise<{
  total: number;
  today: number;
  verified: number;
  unverified: number;
  topCampaigns: { campaign: string; count: number }[];
}> {
  if (!isSupabaseConfigured()) {
    return { total: 0, today: 0, verified: 0, unverified: 0, topCampaigns: [] };
  }

  try {
    const { count: total } = await supabase
      .from('waitlist_entries')
      .select('*', { count: 'exact', head: true });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: today } = await supabase
      .from('waitlist_entries')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString());

    const { count: verified } = await supabase
      .from('waitlist_entries')
      .select('*', { count: 'exact', head: true })
      .eq('phone_verified', true);

    const { count: unverified } = await supabase
      .from('waitlist_entries')
      .select('*', { count: 'exact', head: true })
      .eq('phone_verified', false);

    const { data: campaignData } = await supabase
      .from('waitlist_entries')
      .select('utm_campaign')
      .not('utm_campaign', 'is', null);

    const campaignCounts: Record<string, number> = {};
    (campaignData ?? []).forEach((row: { utm_campaign: string | null }) => {
      const c = row.utm_campaign;
      if (c) {
        campaignCounts[c] = (campaignCounts[c] || 0) + 1;
      }
    });

    const topCampaigns = Object.entries(campaignCounts)
      .map(([campaign, count]) => ({ campaign, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: total ?? 0,
      today: today ?? 0,
      verified: verified ?? 0,
      unverified: unverified ?? 0,
      topCampaigns,
    };
  } catch (err) {
    console.log('[WaitlistService] Stats fetch error:', (err as Error)?.message);

    try {
      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true });

      return {
        total: count ?? 0,
        today: 0,
        verified: 0,
        unverified: 0,
        topCampaigns: [],
      };
    } catch {
      return { total: 0, today: 0, verified: 0, unverified: 0, topCampaigns: [] };
    }
  }
}

export async function fetchWaitlistEntries(options: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: WaitlistEntry[]; total: number }> {
  if (!isSupabaseConfigured()) {
    return { entries: [], total: 0 };
  }

  const { search, status, limit = 50, offset = 0 } = options;

  try {
    let query = supabase
      .from('waitlist_entries')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%,phone_e164.ilike.%${s}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.log('[WaitlistService] Entries fetch error:', error.message);

      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        return await fetchLegacyEntries(options);
      }
      return { entries: [], total: 0 };
    }

    return {
      entries: (data ?? []) as WaitlistEntry[],
      total: count ?? 0,
    };
  } catch (err) {
    console.log('[WaitlistService] Entries exception:', (err as Error)?.message);
    return { entries: [], total: 0 };
  }
}

async function fetchLegacyEntries(options: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: WaitlistEntry[]; total: number }> {
  try {
    const { limit = 50, offset = 0 } = options;
    const { data, count, error } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return { entries: [], total: 0 };
    }

    const mapped = (data ?? []).map((row: Record<string, unknown>) => ({
      id: (row.id as string) || '',
      full_name: `${String(row['first_name'] as string ?? '')} ${String(row['last_name'] as string ?? '')}`.trim(),
      email: (row.email as string) || '',
      phone: (row.phone as string) || '',
      email_normalized: ((row.email as string) || '').toLowerCase(),
      phone_e164: (row.phone as string) || '',
      phone_verified: false,
      accredited_status: null,
      consent_sms: true,
      consent_email: true,
      source: 'landing_page',
      page_path: null,
      referrer: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      ip_hash: null,
      user_agent: null,
      status: (row.status as string) || 'pending',
      created_at: (row.created_at as string) || new Date().toISOString(),
      updated_at: (row.updated_at as string) || new Date().toISOString(),
      verified_at: null,
      submitted_at: (row.created_at as string) || new Date().toISOString(),
    }));

    return { entries: mapped, total: count ?? 0 };
  } catch {
    return { entries: [], total: 0 };
  }
}

export const WAITLIST_ENTRIES_MIGRATION = `-- IVX Waitlist Entries Production Table
-- Run in Supabase SQL Editor

-- 1. Create waitlist_entries table
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  accredited_status TEXT NULL,
  consent_sms BOOLEAN NOT NULL DEFAULT true,
  consent_email BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'landing_page',
  page_path TEXT NULL,
  referrer TEXT NULL,
  utm_source TEXT NULL,
  utm_medium TEXT NULL,
  utm_campaign TEXT NULL,
  utm_content TEXT NULL,
  utm_term TEXT NULL,
  ip_hash TEXT NULL,
  user_agent TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT waitlist_entries_email_normalized_key UNIQUE (email_normalized),
  CONSTRAINT waitlist_entries_phone_e164_key UNIQUE (phone_e164),
  CONSTRAINT waitlist_entries_status_check CHECK (status IN ('pending', 'verified', 'contacted', 'removed')),
  CONSTRAINT waitlist_entries_accredited_check CHECK (accredited_status IS NULL OR accredited_status IN ('accredited', 'non_accredited', 'unsure'))
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_we_created_at ON public.waitlist_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_we_source ON public.waitlist_entries (source);
CREATE INDEX IF NOT EXISTS idx_we_status ON public.waitlist_entries (status);
CREATE INDEX IF NOT EXISTS idx_we_utm_campaign ON public.waitlist_entries (utm_campaign);
CREATE INDEX IF NOT EXISTS idx_we_email_normalized ON public.waitlist_entries (email_normalized);
CREATE INDEX IF NOT EXISTS idx_we_phone_e164 ON public.waitlist_entries (phone_e164);

-- 3. Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_waitlist_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waitlist_entries_updated_at ON public.waitlist_entries;
CREATE TRIGGER waitlist_entries_updated_at
  BEFORE UPDATE ON public.waitlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_waitlist_entries_updated_at();

-- 4. Enable RLS
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_entries_anon_insert') THEN
    CREATE POLICY "waitlist_entries_anon_insert" ON public.waitlist_entries FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_entries_auth_select') THEN
    CREATE POLICY "waitlist_entries_auth_select" ON public.waitlist_entries FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_entries_auth_update') THEN
    CREATE POLICY "waitlist_entries_auth_update" ON public.waitlist_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Enable Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. OTP Audit Table (optional)
CREATE TABLE IF NOT EXISTS public.waitlist_otp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ip_hash TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT otp_event_type_check CHECK (event_type IN ('send_requested', 'send_success', 'send_failed', 'verify_success', 'verify_failed', 'rate_limited'))
);

CREATE INDEX IF NOT EXISTS idx_otp_events_phone ON public.waitlist_otp_events (phone_e164);
CREATE INDEX IF NOT EXISTS idx_otp_events_created ON public.waitlist_otp_events (created_at DESC);

ALTER TABLE public.waitlist_otp_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'otp_events_auth_select') THEN
    CREATE POLICY "otp_events_auth_select" ON public.waitlist_otp_events FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'otp_events_anon_insert') THEN
    CREATE POLICY "otp_events_anon_insert" ON public.waitlist_otp_events FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

-- 8. Email Notification Queue Table
CREATE TABLE IF NOT EXISTS public.email_notifications_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  to_name TEXT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NULL DEFAULT 'waitlist',
  sent_at TIMESTAMPTZ NULL,
  error_message TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_notifications_queue (status);
CREATE INDEX IF NOT EXISTS idx_email_queue_created ON public.email_notifications_queue (created_at DESC);

ALTER TABLE public.email_notifications_queue ENABLE ROW LEVEL SECURITY;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'email_queue_anon_insert') THEN
    CREATE POLICY "email_queue_anon_insert" ON public.email_notifications_queue FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'email_queue_auth_select') THEN
    CREATE POLICY "email_queue_auth_select" ON public.email_notifications_queue FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'email_queue_auth_update') THEN
    CREATE POLICY "email_queue_auth_update" ON public.email_notifications_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $;

SELECT 'Waitlist + Email queue tables created successfully' as result;
`;
