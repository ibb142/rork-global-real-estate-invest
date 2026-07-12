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
  primary_id_upload_url?: string | null;
  primary_id_upload_name?: string | null;
  primary_id_upload_storage_path?: string | null;
  secondary_id_upload_url?: string | null;
  secondary_id_upload_name?: string | null;
  secondary_id_upload_storage_path?: string | null;
  tax_document_upload_url?: string | null;
  tax_document_upload_name?: string | null;
  tax_document_upload_storage_path?: string | null;
  investor_type?: 'individual' | 'corporate';
  primary_id_type?: 'drivers_license' | 'passport' | 'national_id' | 'tax_id';
  primary_id_reference?: string;
  secondary_id_type?: 'drivers_license' | 'passport' | 'national_id' | 'tax_id';
  secondary_id_reference?: string;
  document_issuing_country?: string;
  tax_residency_country?: string;
  tax_id_reference?: string;
  company_name?: string;
  company_role?: string;
  company_ein?: string;
  company_tax_id?: string;
  company_registration_country?: string;
  beneficial_owner_name?: string;
  legal_ack_tax_reporting?: boolean;
  legal_ack_identity_review?: boolean;
  legal_ack_entity_authority?: boolean;
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
  primary_id_upload_url?: string | null;
  primary_id_upload_name?: string | null;
  primary_id_upload_storage_path?: string | null;
  secondary_id_upload_url?: string | null;
  secondary_id_upload_name?: string | null;
  secondary_id_upload_storage_path?: string | null;
  tax_document_upload_url?: string | null;
  tax_document_upload_name?: string | null;
  tax_document_upload_storage_path?: string | null;
  investor_type?: string | null;
  primary_id_type?: string | null;
  primary_id_reference?: string | null;
  secondary_id_type?: string | null;
  secondary_id_reference?: string | null;
  document_issuing_country?: string | null;
  tax_residency_country?: string | null;
  tax_id_reference?: string | null;
  company_name?: string | null;
  company_role?: string | null;
  company_ein?: string | null;
  company_tax_id?: string | null;
  company_registration_country?: string | null;
  beneficial_owner_name?: string | null;
  legal_ack_tax_reporting?: boolean | null;
  legal_ack_identity_review?: boolean | null;
  legal_ack_entity_authority?: boolean | null;
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

export interface WaitlistSubmissionResult {
  success: boolean;
  error?: WaitlistErrorCode;
  confirmedWrite?: boolean;
  persistedTable?: 'waitlist_entries' | 'waitlist';
  persistedId?: string | null;
}

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

function sanitizeUploadFileName(value: string, fallback: string): string {
  const trimmed = value.trim();
  const safeName = (trimmed || fallback).replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeName.length > 0 ? safeName : fallback;
}

function formatUploadedDocumentFallback(reference: string | null, fileName: string | null, fileUrl: string | null): string | null {
  const trimmedReference = reference?.trim() ?? '';
  const trimmedName = fileName?.trim() ?? '';
  const trimmedUrl = fileUrl?.trim() ?? '';

  if (!trimmedName && !trimmedUrl) {
    return trimmedReference || null;
  }

  const uploadSummary = [
    trimmedName ? `Upload: ${trimmedName}` : 'Upload: Document attached',
    trimmedUrl ? `URL: ${trimmedUrl}` : '',
  ].filter(Boolean).join(' · ');

  return trimmedReference ? `${trimmedReference}\n${uploadSummary}` : uploadSummary;
}

export async function uploadInvestorIntakeFile(file: IntakeProofOfFundsFile, folder: string): Promise<IntakeProofOfFundsFile> {
  console.log('[WaitlistService] Uploading investor intake file:', folder, file.name);

  if (!isSupabaseConfigured()) {
    console.log('[WaitlistService] Supabase not configured — returning local file metadata only');
    return file;
  }

  try {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '_') || 'general';
    const safeName = sanitizeUploadFileName(file.name, `${safeFolder}_${Date.now()}`);
    const storagePath = `${safeFolder}/${Date.now()}_${safeName}`;
    const contentType = file.mimeType ?? blob.type ?? 'application/octet-stream';

    const { error } = await supabase.storage.from(INVESTOR_INTAKE_BUCKET).upload(storagePath, blob, {
      contentType,
      upsert: false,
    });

    if (error) {
      console.log('[WaitlistService] Investor intake upload failed:', error.message);
      return file;
    }

    const { data } = supabase.storage.from(INVESTOR_INTAKE_BUCKET).getPublicUrl(storagePath);
    console.log('[WaitlistService] Investor intake upload success:', storagePath);

    return {
      ...file,
      storagePath,
      publicUrl: data.publicUrl,
    };
  } catch (err) {
    console.log('[WaitlistService] Investor intake upload exception:', (err as Error)?.message);
    return file;
  }
}

export async function uploadProofOfFundsFile(file: IntakeProofOfFundsFile): Promise<IntakeProofOfFundsFile> {
  return uploadInvestorIntakeFile(file, 'proof-of-funds');
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
    primary_id_upload_name: data.primary_id_upload_name ?? null,
    primary_id_upload_url: data.primary_id_upload_url ?? null,
    primary_id_upload_storage_path: data.primary_id_upload_storage_path ?? null,
    secondary_id_upload_name: data.secondary_id_upload_name ?? null,
    secondary_id_upload_url: data.secondary_id_upload_url ?? null,
    secondary_id_upload_storage_path: data.secondary_id_upload_storage_path ?? null,
    tax_document_upload_name: data.tax_document_upload_name ?? null,
    tax_document_upload_url: data.tax_document_upload_url ?? null,
    tax_document_upload_storage_path: data.tax_document_upload_storage_path ?? null,
    investor_type: data.investor_type ?? 'individual',
    primary_id_type: data.primary_id_type ?? null,
    primary_id_reference: data.primary_id_reference ?? null,
    secondary_id_type: data.secondary_id_type ?? null,
    secondary_id_reference: data.secondary_id_reference ?? null,
    document_issuing_country: data.document_issuing_country ?? null,
    tax_residency_country: data.tax_residency_country ?? null,
    tax_id_reference: data.tax_id_reference ?? null,
    company_name: data.company_name ?? null,
    company_role: data.company_role ?? null,
    company_ein: data.company_ein ?? null,
    company_tax_id: data.company_tax_id ?? null,
    company_registration_country: data.company_registration_country ?? null,
    beneficial_owner_name: data.beneficial_owner_name ?? null,
    legal_ack_tax_reporting: data.legal_ack_tax_reporting ?? false,
    legal_ack_identity_review: data.legal_ack_identity_review ?? false,
    legal_ack_entity_authority: data.legal_ack_entity_authority ?? false,
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

export async function submitWaitlistEntry(data: WaitlistFormData & { phone_verified: boolean }): Promise<WaitlistSubmissionResult> {
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
  const investorType = data.investor_type ?? 'individual';
  const primaryIdType = data.primary_id_type ?? null;
  const primaryIdReference = data.primary_id_reference?.trim() || null;
  const secondaryIdType = data.secondary_id_type ?? null;
  const secondaryIdReference = data.secondary_id_reference?.trim() || null;
  const documentIssuingCountry = data.document_issuing_country?.trim() || null;
  const taxResidencyCountry = data.tax_residency_country?.trim() || null;
  const taxIdReference = data.tax_id_reference?.trim() || null;
  const companyName = data.company_name?.trim() || null;
  const companyRole = data.company_role?.trim() || null;
  const companyEin = data.company_ein?.trim() || null;
  const companyTaxId = data.company_tax_id?.trim() || null;
  const companyRegistrationCountry = data.company_registration_country?.trim() || null;
  const beneficialOwnerName = data.beneficial_owner_name?.trim() || null;
  const legalAckTaxReporting = data.legal_ack_tax_reporting ?? false;
  const legalAckIdentityReview = data.legal_ack_identity_review ?? false;
  const legalAckEntityAuthority = data.legal_ack_entity_authority ?? false;
  const primaryIdUploadUrl = data.primary_id_upload_url?.trim() || null;
  const primaryIdUploadName = data.primary_id_upload_name?.trim() || null;
  const primaryIdUploadStoragePath = data.primary_id_upload_storage_path?.trim() || null;
  const secondaryIdUploadUrl = data.secondary_id_upload_url?.trim() || null;
  const secondaryIdUploadName = data.secondary_id_upload_name?.trim() || null;
  const secondaryIdUploadStoragePath = data.secondary_id_upload_storage_path?.trim() || null;
  const taxDocumentUploadUrl = data.tax_document_upload_url?.trim() || null;
  const taxDocumentUploadName = data.tax_document_upload_name?.trim() || null;
  const taxDocumentUploadStoragePath = data.tax_document_upload_storage_path?.trim() || null;

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
    investor_type: investorType,
    primary_id_type: primaryIdType,
    primary_id_reference: primaryIdReference,
    secondary_id_type: secondaryIdType,
    secondary_id_reference: secondaryIdReference,
    document_issuing_country: documentIssuingCountry,
    tax_residency_country: taxResidencyCountry,
    tax_id_reference: taxIdReference,
    company_name: companyName,
    company_role: companyRole,
    company_ein: companyEin,
    company_tax_id: companyTaxId,
    company_registration_country: companyRegistrationCountry,
    beneficial_owner_name: beneficialOwnerName,
    legal_ack_tax_reporting: legalAckTaxReporting,
    legal_ack_identity_review: legalAckIdentityReview,
    legal_ack_entity_authority: legalAckEntityAuthority,
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
    primary_id_upload_url: primaryIdUploadUrl,
    primary_id_upload_name: primaryIdUploadName,
    primary_id_upload_storage_path: primaryIdUploadStoragePath,
    secondary_id_upload_url: secondaryIdUploadUrl,
    secondary_id_upload_name: secondaryIdUploadName,
    secondary_id_upload_storage_path: secondaryIdUploadStoragePath,
    tax_document_upload_url: taxDocumentUploadUrl,
    tax_document_upload_name: taxDocumentUploadName,
    tax_document_upload_storage_path: taxDocumentUploadStoragePath,
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
    const { data: insertedEntry, error } = await supabase
      .from('waitlist_entries')
      .insert(entry)
      .select('id')
      .maybeSingle();

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
        console.log('[WaitlistService] Rich upload columns not available yet — retrying without upload-specific columns');

        const {
          primary_id_upload_url: _primaryIdUploadUrl,
          primary_id_upload_name: _primaryIdUploadName,
          primary_id_upload_storage_path: _primaryIdUploadStoragePath,
          secondary_id_upload_url: _secondaryIdUploadUrl,
          secondary_id_upload_name: _secondaryIdUploadName,
          secondary_id_upload_storage_path: _secondaryIdUploadStoragePath,
          tax_document_upload_url: _taxDocumentUploadUrl,
          tax_document_upload_name: _taxDocumentUploadName,
          tax_document_upload_storage_path: _taxDocumentUploadStoragePath,
          ...fallbackEntryBase
        } = entry;

        const fallbackEntry = {
          ...fallbackEntryBase,
          primary_id_reference: formatUploadedDocumentFallback(primaryIdReference, primaryIdUploadName, primaryIdUploadUrl),
          secondary_id_reference: formatUploadedDocumentFallback(secondaryIdReference, secondaryIdUploadName, secondaryIdUploadUrl),
          tax_id_reference: formatUploadedDocumentFallback(taxIdReference, taxDocumentUploadName, taxDocumentUploadUrl),
        };

        const { data: fallbackInsertedEntry, error: retryError } = await supabase
          .from('waitlist_entries')
          .insert(fallbackEntry)
          .select('id')
          .maybeSingle();

        if (retryError) {
          console.log('[WaitlistService] Retry insert without upload columns failed:', retryError.message, retryError.code);

          if (retryError.message?.includes('does not exist') || retryError.message?.includes('relation')) {
            console.log('[WaitlistService] Table does not exist after upload-column retry — falling back to legacy waitlist table');
            return await submitToLegacyWaitlist(data, legacyPayload, now);
          }

          return { success: false, error: 'submission_failed', confirmedWrite: false };
        }

        if (!fallbackInsertedEntry?.id) {
          console.log('[WaitlistService] Retry insert returned no persisted row id');
          return { success: false, error: 'submission_failed', confirmedWrite: false };
        }

        await syncLandingSubmission(data, now);

        console.log('[WaitlistService] Entry submitted successfully after schema-safe retry:', fallbackInsertedEntry.id);

        void sendConfirmationEmail(data.full_name, data.email).then((emailSent) => {
          console.log('[WaitlistService] Confirmation email sent:', emailSent);
        });

        return {
          success: true,
          confirmedWrite: true,
          persistedTable: 'waitlist_entries',
          persistedId: fallbackInsertedEntry.id,
        };
      } else if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        console.log('[WaitlistService] Table does not exist — falling back to legacy waitlist table');
        return await submitToLegacyWaitlist(data, legacyPayload, now);
      } else {
        return { success: false, error: 'submission_failed', confirmedWrite: false };
      }
    }

    if (!insertedEntry?.id) {
      console.log('[WaitlistService] Insert returned no persisted row id');
      return { success: false, error: 'submission_failed', confirmedWrite: false };
    }

    await syncLandingSubmission(data, now);

    console.log('[WaitlistService] Entry submitted successfully:', insertedEntry.id);

    void sendConfirmationEmail(data.full_name, data.email).then((emailSent) => {
      console.log('[WaitlistService] Confirmation email sent:', emailSent);
    });

    return {
      success: true,
      confirmedWrite: true,
      persistedTable: 'waitlist_entries',
      persistedId: insertedEntry.id,
    };
  } catch (err) {
    console.log('[WaitlistService] Exception:', (err as Error)?.message);
    return { success: false, error: 'network_error', confirmedWrite: false };
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
): Promise<WaitlistSubmissionResult> {
  try {
    const fallbackSubmittedAt = submittedAt ?? new Date().toISOString();
    const nameParts = data.full_name.trim().split(' ');
    const firstName = legacyPayload?.first_name || nameParts[0] || '';
    const lastName = legacyPayload?.last_name || nameParts.slice(1).join(' ') || '';

    const primaryLegacyPayload = {
      first_name: firstName,
      last_name: lastName,
      email: legacyPayload?.email || normalizeEmail(data.email),
      phone: legacyPayload?.phone || normalizePhoneE164(data.phone),
      goal: legacyPayload?.goal || [data.investment_range, data.return_expectation].filter(Boolean).join(' · '),
      status: 'pending',
      created_at: fallbackSubmittedAt,
    };

    const { data: insertedLegacyRow, error } = await supabase
      .from('waitlist')
      .insert(primaryLegacyPayload)
      .select('id')
      .maybeSingle();

    if (error) {
      console.log('[WaitlistService] Legacy insert error:', error.message);

      const lowerMessage = error.message.toLowerCase();
      const hasSchemaMismatch = lowerMessage.includes('column') || lowerMessage.includes('schema cache');
      if (hasSchemaMismatch) {
        console.log('[WaitlistService] Legacy waitlist schema is older than expected — retrying minimal payload');
        const minimalLegacyPayload = {
          email: primaryLegacyPayload.email,
          created_at: fallbackSubmittedAt,
        };
        const { data: minimalInsertedLegacyRow, error: minimalError } = await supabase
          .from('waitlist')
          .insert(minimalLegacyPayload)
          .select('id')
          .maybeSingle();
        if (minimalError) {
          console.log('[WaitlistService] Minimal legacy insert error:', minimalError.message);
          return { success: false, error: 'submission_failed', confirmedWrite: false };
        }
        if (!minimalInsertedLegacyRow?.id) {
          console.log('[WaitlistService] Minimal legacy insert returned no persisted row id');
          return { success: false, error: 'submission_failed', confirmedWrite: false };
        }

        await syncLandingSubmission(data, fallbackSubmittedAt);
        console.log('[WaitlistService] Saved to legacy waitlist table via minimal payload:', minimalInsertedLegacyRow.id);
        return {
          success: true,
          confirmedWrite: true,
          persistedTable: 'waitlist',
          persistedId: minimalInsertedLegacyRow.id,
        };
      } else {
        return { success: false, error: 'submission_failed', confirmedWrite: false };
      }
    }

    if (!insertedLegacyRow?.id) {
      console.log('[WaitlistService] Legacy insert returned no persisted row id');
      return { success: false, error: 'submission_failed', confirmedWrite: false };
    }

    await syncLandingSubmission(data, fallbackSubmittedAt);
    console.log('[WaitlistService] Saved to legacy waitlist table:', insertedLegacyRow.id);
    return {
      success: true,
      confirmedWrite: true,
      persistedTable: 'waitlist',
      persistedId: insertedLegacyRow.id,
    };
  } catch (err) {
    console.log('[WaitlistService] Legacy exception:', (err as Error)?.message);
    return { success: false, error: 'network_error', confirmedWrite: false };
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
  investor_type TEXT NULL,
  primary_id_type TEXT NULL,
  primary_id_reference TEXT NULL,
  secondary_id_type TEXT NULL,
  secondary_id_reference TEXT NULL,
  document_issuing_country TEXT NULL,
  tax_residency_country TEXT NULL,
  tax_id_reference TEXT NULL,
  company_name TEXT NULL,
  company_role TEXT NULL,
  company_ein TEXT NULL,
  company_tax_id TEXT NULL,
  company_registration_country TEXT NULL,
  beneficial_owner_name TEXT NULL,
  legal_ack_tax_reporting BOOLEAN NOT NULL DEFAULT false,
  legal_ack_identity_review BOOLEAN NOT NULL DEFAULT false,
  legal_ack_entity_authority BOOLEAN NOT NULL DEFAULT false,
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
  CONSTRAINT waitlist_entries_investor_type_check CHECK (investor_type IS NULL OR investor_type IN ('individual', 'corporate')),
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
