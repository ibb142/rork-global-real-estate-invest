/**
 * IVX Member Registration API Handlers
 *
 * Endpoints:
 *   POST /api/members/register         - Create free account
 *   POST /api/members/send-email-code  - Generate + send email verification code
 *   POST /api/members/verify-email     - Verify email code
 *   POST /api/members/send-phone-code  - Generate + send phone verification code
 *   POST /api/members/verify-phone     - Verify phone code
 *   GET  /api/members/me               - Get current member profile
 *   POST /api/members/start-kyc        - Initiate KYC process
 */

import {
  registerMember,
  getMemberProfile,
  updateMemberKYCStatus,
  updateMemberLastLogin,
  loginMember,
  requestMemberPasswordReset,
  resetMemberPasswordWithToken,
  updateMemberProfile,
} from '../services/ivx-member-database';
import { storeVerificationCode, verifyCode, checkVerificationStatus } from '../services/ivx-member-verification';
import { onboardNewMember, VALID_ROLE_INTERESTS, type MemberRoleInterest } from '../services/ivx-member-investor-system';
import { upsertCanonicalMember, markCanonicalMemberVerified } from '../services/ivx-canonical-members';

const DEPLOYMENT_MARKER = 'ivx-members-api-v1';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://ivxholding.com',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  return fallback;
}

function getAuthUserId(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate date of birth: required, ISO YYYY-MM-DD, real calendar date, age 18-120
function validateDateOfBirth(dateOfBirth: string): { valid: boolean; reason?: string } {
  if (!dateOfBirth) return { valid: false, reason: 'Date of birth is required.' };
  const match = dateOfBirth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { valid: false, reason: 'Date of birth must be in YYYY-MM-DD format.' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return { valid: false, reason: 'Please enter a valid date of birth.' };
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return { valid: false, reason: 'Please enter a valid date of birth.' };
  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const hadBirthdayThisYear =
    now.getUTCMonth() + 1 > month || (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;
  if (age < 18) return { valid: false, reason: 'You must be at least 18 years old to create an account.' };
  if (age > 120) return { valid: false, reason: 'Please enter a valid date of birth.' };
  return { valid: true };
}

const VALID_GENDERS = new Set(['male', 'female', 'prefer_not_to_say']);

// Validate gender: required, must be one of the allowed values
function validateGender(gender: string): { valid: boolean; reason?: string } {
  if (!gender) return { valid: false, reason: 'Gender is required.' };
  if (!VALID_GENDERS.has(gender)) {
    return { valid: false, reason: 'Please select a valid gender option.' };
  }
  return { valid: true };
}

// Validate password strength
function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: 'Password must be at least 8 characters.' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Password must contain at least 1 uppercase letter.' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Password must contain at least 1 number.' };
  return { valid: true };
}

export function membersOptions(): Response {
  return jsonResponse({ deploymentMarker: DEPLOYMENT_MARKER }, 204);
}

// POST /api/members/register
export async function handleMemberRegister(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const email = asString(body.email).toLowerCase();
  const password = asString(body.password);
  const firstName = asString(body.firstName);
  const lastName = asString(body.lastName);
  const phone = asString(body.phone);
  const country = asString(body.country);
  const zipCode = asString(body.zipCode);
  const roles: MemberRoleInterest[] = Array.isArray(body.roles)
    ? (body.roles.filter(
        (r): r is MemberRoleInterest => typeof r === 'string' && VALID_ROLE_INTERESTS.has(r as MemberRoleInterest)
      ))
    : [];
  const acceptTerms = !!body.acceptTerms;
  const pictureUrl = asString(body.pictureUrl);
  const dateOfBirth = asString(body.dateOfBirth);
  const gender = asString(body.gender).toLowerCase();

  // Validation
  if (!firstName || !lastName) {
    return jsonResponse({ success: false, message: 'First name and last name are required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  if (!isValidEmail(email)) {
    return jsonResponse({ success: false, message: 'Please enter a valid email address.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) {
    return jsonResponse({ success: false, message: pwCheck.reason || 'Password does not meet requirements.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return jsonResponse({ success: false, message: 'Please enter a valid phone number.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  if (!acceptTerms) {
    return jsonResponse({ success: false, message: 'You must accept the Terms of Service.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const dobCheck = validateDateOfBirth(dateOfBirth);
  if (!dobCheck.valid) {
    return jsonResponse({ success: false, message: dobCheck.reason || 'Please enter a valid date of birth.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const genderCheck = validateGender(gender);
  if (!genderCheck.valid) {
    return jsonResponse({ success: false, message: genderCheck.reason || 'Gender is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  if (roles.length === 0) {
    return jsonResponse({ success: false, message: 'Please select at least one role to continue.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const result = await registerMember({
    email,
    password,
    firstName,
    lastName,
    dateOfBirth,
    gender,
    phone,
    country,
    zipCode,
    roles,
    acceptTerms,
    pictureUrl,
  });

  if (result.success && result.userId) {
    // Auto-send verification codes
    await storeVerificationCode({ userId: result.userId, type: 'email' });
    await storeVerificationCode({ userId: result.userId, type: 'phone' });

    // Onboarding fanout: member profile + CRM lead + marketing profile +
    // AI profile + newsletter + app account → status FREE MEMBER.
    try {
      await onboardNewMember({
        userId: result.userId,
        firstName,
        lastName,
        email,
        phone,
        country,
        zipCode,
        roles,
        pictureUrl,
      });
    } catch (fanoutErr) {
      console.error('[Members] Onboarding fanout failed (non-fatal):', fanoutErr);
    }

    // Canonical Members sync — every landing registration lands in public.members.
    try {
      await upsertCanonicalMember({
        fullName: `${firstName} ${lastName}`.trim(),
        email,
        phone,
        memberType: roles[0] || 'member',
        source: 'landing_page',
        sourceDetail: 'members/register',
        investorInterest: roles.join(', '),
        preferredZipcode: zipCode,
        pictureUrl,
        authUserId: result.userId,
      });
    } catch (syncErr) {
      console.error('[Members] Canonical member sync failed (non-fatal):', syncErr);
    }

    return jsonResponse({
      success: true,
      message: result.message,
      userId: result.userId,
      email: result.email,
      requiresVerification: true,
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  }

  return jsonResponse(
    { success: false, message: result.message, deploymentMarker: DEPLOYMENT_MARKER },
    result.message.includes('already exists') ? 409 : 400
  );
}

// POST /api/members/send-email-code
export async function handleSendEmailCode(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const userId = asString(body.userId) || getAuthUserId(request) || '';

  if (!userId) {
    return jsonResponse({ success: false, message: 'User ID is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const result = await storeVerificationCode({ userId, type: 'email' });
  return jsonResponse({
    success: result.success,
    message: result.success ? 'Verification code sent to your email.' : result.message,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

// POST /api/members/verify-email
export async function handleVerifyEmail(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const userId = asString(body.userId) || getAuthUserId(request) || '';
  const code = asString(body.code);

  if (!userId || !code) {
    return jsonResponse({ success: false, message: 'User ID and code are required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ success: false, message: 'Please enter a valid 6-digit code.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const result = await verifyCode({ userId, type: 'email', code });
  if ((result as { success?: boolean; verified?: boolean }).success || (result as { verified?: boolean }).verified) {
    try {
      await markCanonicalMemberVerified({ authUserId: userId }, { emailVerified: true });
    } catch (syncErr) {
      console.error('[Members] Canonical email-verified sync failed (non-fatal):', syncErr);
    }
  }
  return jsonResponse(result);
}

// POST /api/members/send-phone-code
export async function handleSendPhoneCode(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const userId = asString(body.userId) || getAuthUserId(request) || '';

  if (!userId) {
    return jsonResponse({ success: false, message: 'User ID is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const result = await storeVerificationCode({ userId, type: 'phone' });
  return jsonResponse({
    success: result.success,
    message: result.success ? 'Verification code sent to your phone.' : result.message,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

// POST /api/members/verify-phone
export async function handleVerifyPhone(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const userId = asString(body.userId) || getAuthUserId(request) || '';
  const code = asString(body.code);

  if (!userId || !code) {
    return jsonResponse({ success: false, message: 'User ID and code are required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ success: false, message: 'Please enter a valid 6-digit code.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const result = await verifyCode({ userId, type: 'phone', code });
  if ((result as { success?: boolean; verified?: boolean }).success || (result as { verified?: boolean }).verified) {
    try {
      await markCanonicalMemberVerified({ authUserId: userId }, { smsVerified: true });
    } catch (syncErr) {
      console.error('[Members] Canonical SMS-verified sync failed (non-fatal):', syncErr);
    }
  }
  return jsonResponse(result);
}

// GET /api/members/me
export async function handleGetMemberProfile(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || getAuthUserId(request) || '';

  if (!userId) {
    return jsonResponse({ success: false, message: 'User ID is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const profile = await getMemberProfile(userId);
  if (!profile) {
    return jsonResponse({ success: false, message: 'Member not found.', deploymentMarker: DEPLOYMENT_MARKER }, 404);
  }

  const verification = await checkVerificationStatus(userId);

  return jsonResponse({
    success: true,
    profile: {
      ...profile,
      emailVerified: verification.emailVerified,
      phoneVerified: verification.phoneVerified,
    },
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

// POST /api/members/start-kyc
export async function handleStartKYC(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const userId = asString(body.userId) || getAuthUserId(request) || '';

  if (!userId) {
    return jsonResponse({ success: false, message: 'User ID is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  // Check verification status first
  const verification = await checkVerificationStatus(userId);
  if (!verification.emailVerified || !verification.phoneVerified) {
    return jsonResponse({
      success: false,
      message: 'Email and phone must be verified before starting KYC.',
      requiresVerification: true,
      deploymentMarker: DEPLOYMENT_MARKER,
    }, 400);
  }

  const updated = await updateMemberKYCStatus(userId, 'in_progress');
  if (!updated) {
    return jsonResponse({ success: false, message: 'Failed to start KYC process.', deploymentMarker: DEPLOYMENT_MARKER }, 500);
  }

  return jsonResponse({
    success: true,
    message: 'KYC process initiated. Please upload your documents.',
    kycStatus: 'in_progress',
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

// GET /api/members/verification-status
export async function handleVerificationStatus(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || getAuthUserId(request) || '';

  if (!userId) {
    return jsonResponse({ success: false, message: 'User ID is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }

  const verification = await checkVerificationStatus(userId);

  return jsonResponse({
    success: true,
    emailVerified: verification.emailVerified,
    phoneVerified: verification.phoneVerified,
    bothVerified: verification.emailVerified && verification.phoneVerified,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

// ---------------------------------------------------------------------------
// Member login, password reset, profile update (BLOCK: IVX business workflows)
// ---------------------------------------------------------------------------

// POST /api/members/login
export async function handleMemberLogin(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const email = asString(body.email).toLowerCase();
  const password = asString(body.password);
  if (!email || !password) {
    return jsonResponse({ success: false, message: 'Email and password are required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const result = await loginMember(email, password);
  return jsonResponse(result, result.success ? 200 : (result.requiresVerification ? 403 : 401));
}

// POST /api/members/forgot-password
export async function handleMemberForgotPassword(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const email = asString(body.email).toLowerCase();
  if (!email) {
    return jsonResponse({ success: false, message: 'Email is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const result = await requestMemberPasswordReset(email);
  return jsonResponse(result, result.success ? 200 : 400);
}

// POST /api/members/reset-password
export async function handleMemberResetPassword(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const email = asString(body.email).toLowerCase();
  const token = asString(body.token);
  const newPassword = asString(body.newPassword);
  if (!email || !token || !newPassword) {
    return jsonResponse({ success: false, message: 'Email, token, and newPassword are required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const result = await resetMemberPasswordWithToken(email, token, newPassword);
  return jsonResponse(result, result.success ? 200 : 400);
}

// PUT /api/members/me  (profile update — never deletes fields the caller omits)
export async function handleUpdateMemberProfile(request: Request): Promise<Response> {
  const body = await parseBody(request);
  const userId = asString(body.userId) || getAuthUserId(request) || '';
  if (!userId) {
    return jsonResponse({ success: false, message: 'User ID is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
  }
  const result = await updateMemberProfile({
    userId,
    firstName: asString(body.firstName) || undefined,
    lastName: asString(body.lastName) || undefined,
    phone: asString(body.phone) || undefined,
    country: asString(body.country) || undefined,
    zipCode: typeof body.zipCode === 'string' ? asString(body.zipCode) : undefined,
    pictureUrl: asString(body.pictureUrl) || undefined,
  });
  return jsonResponse(result, result.success ? 200 : 400);
}
