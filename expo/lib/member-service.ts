/**
 * IVX Member Service — Client-Side API
 *
 * Communicates with the backend member registration and verification API.
 * Used by member-register, member-verify, and member-dashboard screens.
 */

const API_BASE = process.env.EXPO_PUBLIC_RORK_API_BASE_URL
  ? process.env.EXPO_PUBLIC_RORK_API_BASE_URL.replace(/\/+$/, '')
  : 'https://api.ivxholding.com';

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  acceptTerms: boolean;
}

export interface RegisterResult {
  success: boolean;
  message: string;
  userId?: string;
  email?: string;
  requiresVerification: boolean;
}

export interface VerifyResult {
  success: boolean;
  message: string;
  verified: boolean;
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

export interface ProfileResult {
  success: boolean;
  profile?: MemberProfile;
}

export interface VerificationStatusResult {
  success: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  bothVerified: boolean;
}

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    return { success: false, message: (errorBody as any)?.message || `Request failed (${response.status})` } as unknown as T;
  }
  return response.json() as Promise<T>;
}

async function apiGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const search = new URLSearchParams(params).toString();
  const url = `${API_BASE}${path}${search ? `?${search}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    return { success: false, message: `Request failed (${response.status})` } as unknown as T;
  }
  return response.json() as Promise<T>;
}

export async function registerMember(payload: RegisterPayload): Promise<RegisterResult> {
  return apiPost<RegisterResult>('/api/members/register', payload as unknown as Record<string, unknown>);
}

export async function sendEmailCode(userId: string): Promise<VerifyResult> {
  return apiPost<VerifyResult>('/api/members/send-email-code', { userId });
}

export async function verifyEmail(userId: string, code: string): Promise<VerifyResult> {
  return apiPost<VerifyResult>('/api/members/verify-email', { userId, code });
}

export async function sendPhoneCode(userId: string): Promise<VerifyResult> {
  return apiPost<VerifyResult>('/api/members/send-phone-code', { userId });
}

export async function verifyPhone(userId: string, code: string): Promise<VerifyResult> {
  return apiPost<VerifyResult>('/api/members/verify-phone', { userId, code });
}

export async function getMemberProfile(userId: string): Promise<ProfileResult> {
  return apiGet<ProfileResult>('/api/members/me', { userId });
}

export async function getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
  return apiGet<VerificationStatusResult>('/api/members/verification-status', { userId });
}

export async function startKYC(userId: string): Promise<{ success: boolean; message: string; kycStatus?: string }> {
  return apiPost('/api/members/start-kyc', { userId });
}
