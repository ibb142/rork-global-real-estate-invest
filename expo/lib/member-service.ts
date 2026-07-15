/**
 * IVX Member Service — Client-Side API
 *
 * Communicates with the backend member registration and verification API.
 * Used by member-register, member-verify, and member-dashboard screens.
 */

const API_BASE = process.env.EXPO_PUBLIC_IVX_API_BASE_URL
  ? process.env.EXPO_PUBLIC_IVX_API_BASE_URL.replace(/\/+$/, '')
  : 'https://api.ivxholding.com';

export type MemberRoleInterest =
  | 'buyer'
  | 'investor'
  | 'jv_partner'
  | 'broker'
  | 'agent'
  | 'land_owner'
  | 'jv_deals'
  | 'tokenized';

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Date of birth in ISO format (YYYY-MM-DD). Required. */
  dateOfBirth: string;
  /** Gender: 'male' | 'female' | 'prefer_not_to_say'. Required. */
  gender: string;
  phone: string;
  country: string;
  zipCode: string;
  roles: MemberRoleInterest[];
  acceptTerms: boolean;
  pictureUrl?: string;
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

// ---------------------------------------------------------------------------
// PHASE 2 — Real Investor Activation
// ---------------------------------------------------------------------------

export type InvestmentRange =
  | '10k' | '25k' | '50k' | '100k' | '250k' | '500k' | '1m' | '5m' | '10m_plus';

export type PropertyInterest =
  | 'multifamily' | 'luxury' | 'land' | 'commercial' | 'hotels' | 'industrial' | 'development';

export type InvestmentGoal =
  | 'cash_flow' | 'appreciation' | 'development' | 'tokenized_assets' | 'jv_deals';

export interface InvestorApplicationPayload {
  userId: string;
  address: string;
  dateOfBirth: string;
  entityName: string;
  taxCountry: string;
  netWorthRange: string;
  accreditedInvestor: boolean;
  investmentRange: InvestmentRange;
  interests: PropertyInterest[];
  countries: string[];
  states: string[];
  cities: string[];
  zipCodes: string[];
  radiusMiles: number;
  goals: InvestmentGoal[];
  governmentIdProvided: boolean;
  kycConsent: boolean;
  amlConsent: boolean;
  entityDocsProvided: boolean;
}

export interface AIReview {
  score: number;
  decision: string;
  reasons: string[];
  reviewedAt: string;
}

export interface MatchCandidate {
  matchId: string;
  matchedName: string;
  matchedPartyType: string;
  matchType: string;
  score: number;
  evidence: string[];
}

export interface AlertSubscription {
  alertId: string;
  kind: string;
  target: string;
  active: boolean;
}

export interface InvestorApplication extends InvestorApplicationPayload {
  applicationId: string;
  status: 'investor_pending' | 'investor_verified' | 'manual_review' | 'investor_rejected';
  aiReview: AIReview | null;
  matches: MatchCandidate[];
  alerts: AlertSubscription[];
  submittedAt: string;
  updatedAt: string;
}

export interface ApplicationResult {
  success: boolean;
  message?: string;
  memberStatus?: string;
  application?: InvestorApplication | null;
}

export async function submitInvestorApplication(payload: InvestorApplicationPayload): Promise<ApplicationResult> {
  return apiPost<ApplicationResult>('/api/members/investor-application', payload as unknown as Record<string, unknown>);
}

export async function getInvestorApplication(userId: string): Promise<ApplicationResult> {
  return apiGet<ApplicationResult>('/api/members/investor-application', { userId });
}

export async function rerunInvestorReview(userId: string): Promise<ApplicationResult> {
  return apiPost<ApplicationResult>('/api/members/investor-application/review', { userId });
}

export async function recordFunnelVisitor(source: string): Promise<void> {
  try {
    await apiPost('/api/members/funnel/visitor', { source });
  } catch {
    // analytics only — never block UX
  }
}
