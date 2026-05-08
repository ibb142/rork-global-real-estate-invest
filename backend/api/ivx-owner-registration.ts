import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type OwnerRegistrationPayload = {
  email?: unknown;
  password?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  country?: unknown;
};

type OwnerRegistrationProof = {
  authUserCreated: boolean;
  emailConfirmed: boolean;
  profilePersisted: boolean;
  walletPersisted: boolean;
  role: 'owner';
  status: 'active';
  kycStatus: 'approved';
  accountType: 'owner';
  requestedRole: 'owner';
};

type OwnerEmailLookup = {
  requested: boolean;
  allowed: boolean;
  authUserExists: boolean | null;
  profileExists: boolean | null;
  walletExists: boolean | null;
  safeToSignup: boolean;
  action: 'signup' | 'sign_in' | 'not_allowed' | 'unavailable';
  message: string;
  secretValuesReturned: false;
};

const DEPLOYMENT_MARKER = 'ivx-owner-registration-2026-05-08t2245z-rate-limit-guard';

const OWNER_REGISTRATION_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
} as const;

const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 6;
const ownerRegistrationAttempts = new Map<string, { count: number; resetAt: number }>();

function nowIso(): string {
  return new Date().toISOString();
}

function json(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: OWNER_REGISTRATION_HEADERS,
  });
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeEmail(value: unknown): string {
  return readTrimmed(value).toLowerCase();
}

function normalizePhone(value: unknown): string {
  const raw = readTrimmed(value);
  if (!raw) {
    return '';
  }

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) {
    return '';
  }

  return `${hasPlus ? '+' : '+'}${digits}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseEmailList(value: string): string[] {
  return value
    .split(',')
    .map((item) => sanitizeEmail(item))
    .filter((item) => isValidEmail(item));
}

function getAllowedOwnerRegistrationEmails(): string[] {
  const values = [
    readTrimmed(process.env.IVX_OWNER_REGISTRATION_EMAILS),
    readTrimmed(process.env.EXPO_PUBLIC_OWNER_EMAIL),
    readTrimmed(process.env.NEXT_PUBLIC_OWNER_EMAIL),
    readTrimmed(process.env.OWNER_EMAIL),
  ].filter(Boolean);

  return Array.from(new Set(values.flatMap(parseEmailList)));
}

function assertOwnerRegistrationEmailAllowed(email: string): void {
  const allowedEmails = getAllowedOwnerRegistrationEmails();
  if (allowedEmails.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Owner registration is not configured. Set IVX_OWNER_REGISTRATION_EMAILS or EXPO_PUBLIC_OWNER_EMAIL on the backend.');
    }
    console.log('[IVXOwnerRegistration] No owner registration allowlist configured in non-production mode.');
    return;
  }

  if (!allowedEmails.includes(email)) {
    throw new Error('Owner registration is limited to the configured owner email. Use Owner Login or Owner Recovery for existing accounts.');
  }
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least 1 uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least 1 number.';
  }
  return null;
}

function decodeJwtRole(token: string): string | null {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

function getServiceRoleKey(): string {
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
  const role = decodeJwtRole(serviceKey);
  if (!serviceKey || serviceKey === anonKey || (role !== 'service_role' && role !== 'supabase_admin')) {
    throw new Error('A backend-only Supabase service-role key is required for owner registration repair.');
  }
  return serviceKey;
}

function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured on the backend.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function readClientIp(request: Request): string {
  const forwardedFor = readTrimmed(request.headers.get('x-forwarded-for')).split(',')[0]?.trim();
  return forwardedFor || readTrimmed(request.headers.get('cf-connecting-ip')) || readTrimmed(request.headers.get('x-real-ip')) || 'unknown';
}

function assertRateLimit(email: string, request: Request): void {
  const ip = readClientIp(request);
  const key = `${email}:${ip}`;
  const now = Date.now();
  const current = ownerRegistrationAttempts.get(key);
  if (!current || current.resetAt <= now) {
    ownerRegistrationAttempts.set(key, { count: 1, resetAt: now + REQUEST_WINDOW_MS });
    return;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    throw new Error('Owner registration repair is temporarily rate limited. Please wait one minute and try again.');
  }

  current.count += 1;
}

async function findAuthUserByEmail(client: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.log('[IVXOwnerRegistration] Existing-user lookup skipped:', error.message);
      return null;
    }

    const found = data.users.find((user) => sanitizeEmail(user.email ?? '') === email) ?? null;
    if (found) {
      return found;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

async function inspectOwnerPersistence(client: SupabaseClient, userId: string): Promise<{ profileExists: boolean | null; walletExists: boolean | null }> {
  const [profileResult, walletResult] = await Promise.allSettled([
    client.from('profiles').select('id', { count: 'exact', head: true }).eq('id', userId),
    client.from('wallets').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  const profileExists = profileResult.status === 'fulfilled'
    ? profileResult.value.error ? null : (profileResult.value.count ?? 0) > 0
    : null;
  const walletExists = walletResult.status === 'fulfilled'
    ? walletResult.value.error ? null : (walletResult.value.count ?? 0) > 0
    : null;

  return { profileExists, walletExists };
}

function isOwnerLikeUser(user: User, email: string): boolean {
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    appMetadata.role,
    appMetadata.accountType,
    appMetadata.account_type,
    appMetadata.requestedRole,
    appMetadata.requested_role,
    userMetadata.role,
    userMetadata.accountType,
    userMetadata.account_type,
    userMetadata.requestedRole,
    userMetadata.requested_role,
  ].map((value) => readTrimmed(value).toLowerCase());

  return getAllowedOwnerRegistrationEmails().includes(email)
    || candidates.some((candidate) => ['owner', 'admin', 'super_admin'].includes(candidate));
}

function readBearerToken(request: Request): string {
  const authorization = readTrimmed(request.headers.get('authorization'));
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function getUserName(user: User, key: 'firstName' | 'lastName', fallback: string): string {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const snakeKey = key === 'firstName' ? 'first_name' : 'last_name';
  return readTrimmed(metadata[key]) || readTrimmed(metadata[snakeKey]) || fallback;
}

async function buildOwnerEmailLookup(email: string): Promise<OwnerEmailLookup> {
  if (!email) {
    return {
      requested: false,
      allowed: false,
      authUserExists: null,
      profileExists: null,
      walletExists: null,
      safeToSignup: false,
      action: 'unavailable',
      message: 'No owner email lookup was requested.',
      secretValuesReturned: false,
    };
  }

  if (!isValidEmail(email)) {
    return {
      requested: true,
      allowed: false,
      authUserExists: null,
      profileExists: null,
      walletExists: null,
      safeToSignup: false,
      action: 'not_allowed',
      message: 'A valid owner email is required before signup.',
      secretValuesReturned: false,
    };
  }

  try {
    assertOwnerRegistrationEmailAllowed(email);
  } catch (error) {
    return {
      requested: true,
      allowed: false,
      authUserExists: null,
      profileExists: null,
      walletExists: null,
      safeToSignup: false,
      action: 'not_allowed',
      message: error instanceof Error ? error.message : 'Owner registration is limited to the configured owner email.',
      secretValuesReturned: false,
    };
  }

  try {
    const client = createSupabaseAdminClient();
    const existingUser = await findAuthUserByEmail(client, email);
    if (!existingUser) {
      return {
        requested: true,
        allowed: true,
        authUserExists: false,
        profileExists: false,
        walletExists: false,
        safeToSignup: true,
        action: 'signup',
        message: 'Owner email is allowlisted and no existing auth user was found. A single backend signup attempt is allowed.',
        secretValuesReturned: false,
      };
    }

    const persistence = await inspectOwnerPersistence(client, existingUser.id);
    return {
      requested: true,
      allowed: true,
      authUserExists: true,
      profileExists: persistence.profileExists,
      walletExists: persistence.walletExists,
      safeToSignup: false,
      action: 'sign_in',
      message: 'Owner auth user already exists. Route to Owner Login instead of calling signup again.',
      secretValuesReturned: false,
    };
  } catch (error) {
    console.log('[IVXOwnerRegistration] Owner email lookup unavailable:', error instanceof Error ? error.message : 'unknown');
    return {
      requested: true,
      allowed: true,
      authUserExists: null,
      profileExists: null,
      walletExists: null,
      safeToSignup: false,
      action: 'unavailable',
      message: 'Owner email lookup is unavailable because backend Supabase admin credentials are not ready.',
      secretValuesReturned: false,
    };
  }
}

async function ensureOwnerProfile(client: SupabaseClient, input: {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  timestamp: string;
}): Promise<boolean> {
  /**
   * Production profiles schema (see expo/scripts/supabase-full-schema.sql) does NOT
   * include a `status` column. Sending it caused PostgREST to reject the upsert with
   * `column profiles.status does not exist`, so the row was never written.
   * Owner active-status is already proven via auth.users + role='owner' + kyc_status='approved'.
   */
  const basePayload: Record<string, unknown> = {
    id: input.userId,
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    country: input.country,
    role: 'owner',
    avatar: '',
    kyc_status: 'approved',
    total_invested: 0,
    total_returns: 0,
    created_at: input.timestamp,
    updated_at: input.timestamp,
  };

  const { error } = await client
    .from('profiles')
    .upsert(basePayload, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });

  if (error) {
    const message = error.message || '';
    const lower = message.toLowerCase();
    // Defensive: if the production schema is missing another optional column
    // (e.g. country/avatar) drop it and retry once with the minimum owner row.
    const missingColumnMatch = lower.match(/column "?([a-z_]+)"? .*does not exist/);
    const missingColumn = missingColumnMatch?.[1];
    if (missingColumn && missingColumn in basePayload) {
      console.log('[IVXOwnerRegistration] Owner profile upsert dropping missing column and retrying:', missingColumn);
      const retryPayload = { ...basePayload };
      delete retryPayload[missingColumn];
      const retry = await client
        .from('profiles')
        .upsert(retryPayload, { onConflict: 'id', ignoreDuplicates: false });
      if (!retry.error) {
        return true;
      }
      console.log('[IVXOwnerRegistration] Owner profile retry upsert failed:', retry.error.message);
      return false;
    }
    console.log('[IVXOwnerRegistration] Owner profile upsert failed:', message);
    return false;
  }

  return true;
}

async function ensureOwnerWallet(client: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await client
    .from('wallets')
    .upsert({
      user_id: userId,
      available: 0,
      pending: 0,
      invested: 0,
      total: 0,
      currency: 'USD',
    }, {
      onConflict: 'user_id',
      ignoreDuplicates: true,
    });

  if (error) {
    console.log('[IVXOwnerRegistration] Owner wallet ensure skipped:', error.message);
    return false;
  }

  return true;
}

function buildProof(input: { authUserCreated: boolean; profilePersisted: boolean; walletPersisted: boolean }): OwnerRegistrationProof {
  return {
    authUserCreated: input.authUserCreated,
    emailConfirmed: true,
    profilePersisted: input.profilePersisted,
    walletPersisted: input.walletPersisted,
    role: 'owner',
    status: 'active',
    kycStatus: 'approved',
    accountType: 'owner',
    requestedRole: 'owner',
  };
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: OWNER_REGISTRATION_HEADERS,
  });
}

export async function handleIVXOwnerRegistrationStatusRequest(request?: Request): Promise<Response> {
  const url = request ? new URL(request.url) : null;
  const lookupEmail = sanitizeEmail(url?.searchParams.get('email') ?? '');
  const ownerEmailLookup = lookupEmail ? await buildOwnerEmailLookup(lookupEmail) : null;

  return json({
    ok: true,
    routeRegistered: true,
    route: 'POST /api/ivx/owner-registration',
    statusRoute: 'GET /api/ivx/owner-registration/status',
    repairRoute: 'POST /api/ivx/owner-registration/repair',
    deploymentMarker: DEPLOYMENT_MARKER,
    supabaseUrlConfigured: Boolean(readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL)),
    serviceRoleConfigured: Boolean(readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY)),
    ownerEmailAllowlistConfigured: getAllowedOwnerRegistrationEmails().length > 0,
    ...(ownerEmailLookup ? { ownerEmailLookup } : {}),
    secretValuesReturned: false,
    timestamp: nowIso(),
  });
}

export async function handleIVXOwnerRegistrationRequest(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({})) as OwnerRegistrationPayload;
    const email = sanitizeEmail(body.email);
    const password = readTrimmed(body.password);
    const firstName = readTrimmed(body.firstName);
    const lastName = readTrimmed(body.lastName);
    const phone = normalizePhone(body.phone);
    const country = readTrimmed(body.country) || 'United States';

    if (!firstName || !lastName) {
      return json({ success: false, message: 'First and last name are required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
    }
    if (!isValidEmail(email)) {
      return json({ success: false, message: 'A valid email is required.', deploymentMarker: DEPLOYMENT_MARKER }, 400);
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return json({ success: false, message: passwordError, deploymentMarker: DEPLOYMENT_MARKER }, 400);
    }

    assertOwnerRegistrationEmailAllowed(email);

    const client = createSupabaseAdminClient();
    const existingUser = await findAuthUserByEmail(client, email);
    if (existingUser) {
      console.log('[IVXOwnerRegistration] Existing auth user found; owner signup must use login/recovery:', existingUser.id);
      const persistence = await inspectOwnerPersistence(client, existingUser.id);
      return json({
        success: false,
        alreadyExists: true,
        requiresLogin: true,
        email,
        userId: existingUser.id,
        ownerEmailLookup: {
          requested: true,
          allowed: true,
          authUserExists: true,
          profileExists: persistence.profileExists,
          walletExists: persistence.walletExists,
          safeToSignup: false,
          action: 'sign_in',
          message: 'Owner auth user already exists. Route to Owner Login instead of calling signup again.',
          secretValuesReturned: false,
        },
        message: 'This owner email already exists in Supabase Auth. Use Owner Login instead of creating a duplicate. After login, backend repair can create any missing profile or wallet rows without calling signup.',
        deploymentMarker: DEPLOYMENT_MARKER,
        secretValuesReturned: false,
      }, 409);
    }

    assertRateLimit(email, request);

    const timestamp = nowIso();
    const metadata = {
      firstName,
      lastName,
      phone,
      country,
      referralCode: '',
      accountType: 'owner',
      requestedRole: 'owner',
      ownerSignupApprovedAt: timestamp,
      role: 'owner',
      status: 'active',
      kycStatus: 'approved',
    };

    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      ...(phone ? { phone, phone_confirm: true } : {}),
      user_metadata: metadata,
      app_metadata: {
        accountType: 'owner',
        requestedRole: 'owner',
        role: 'owner',
      },
    });

    if (error || !data.user) {
      const message = error?.message || 'Supabase did not return a created owner user.';
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('already') || lowerMessage.includes('duplicate') || lowerMessage.includes('registered')) {
        return json({
          success: false,
          alreadyExists: true,
          requiresLogin: true,
          email,
          message: 'This owner email already exists in Supabase Auth. Use Owner Login instead of creating a duplicate.',
          deploymentMarker: DEPLOYMENT_MARKER,
          secretValuesReturned: false,
        }, 409);
      }

      console.log('[IVXOwnerRegistration] Supabase admin createUser failed:', message);
      return json({ success: false, email, message, deploymentMarker: DEPLOYMENT_MARKER }, 502);
    }

    const profilePersisted = await ensureOwnerProfile(client, {
      userId: data.user.id,
      email,
      firstName,
      lastName,
      phone,
      country,
      timestamp,
    });
    const walletPersisted = await ensureOwnerWallet(client, data.user.id);
    const proof = buildProof({ authUserCreated: true, profilePersisted, walletPersisted });

    console.log('[IVXOwnerRegistration] Owner registration saved:', {
      userId: data.user.id,
      email,
      profilePersisted,
      walletPersisted,
      timestamp,
    });

    return json({
      success: true,
      email,
      userId: data.user.id,
      requiresLogin: true,
      message: 'Owner registration saved with backend Supabase service-role repair. Email is already confirmed; sign in with the password you entered.',
      proof,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner registration repair failed.';
    const lowerMessage = message.toLowerCase();
    const status = lowerMessage.includes('rate limited')
      ? 429
      : lowerMessage.includes('service-role') || lowerMessage.includes('not configured')
        ? 503
        : lowerMessage.includes('limited to the configured owner email')
          ? 403
          : 500;
    console.log('[IVXOwnerRegistration] Request failed:', message);
    return json({
      success: false,
      message,
      deploymentMarker: DEPLOYMENT_MARKER,
      ...(status === 429 ? { rateLimited: true, cooldownSeconds: Math.ceil(REQUEST_WINDOW_MS / 1000) } : {}),
      secretValuesReturned: false,
    }, status);
  }
}

export async function handleIVXOwnerRegistrationRepairRequest(request: Request): Promise<Response> {
  try {
    const bearerToken = readBearerToken(request);
    if (!bearerToken) {
      return json({ success: false, message: 'Owner login is required before repair.', deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false }, 401);
    }

    const client = createSupabaseAdminClient();
    const { data, error } = await client.auth.getUser(bearerToken);
    const authUser = data.user;
    const email = sanitizeEmail(authUser?.email ?? '');

    if (error || !authUser || !email) {
      return json({ success: false, message: 'Owner session could not be verified for repair.', deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false }, 401);
    }

    try {
      assertOwnerRegistrationEmailAllowed(email);
    } catch (allowlistError) {
      if (!isOwnerLikeUser(authUser, email)) {
        return json({
          success: false,
          message: allowlistError instanceof Error ? allowlistError.message : 'Owner repair is limited to verified owner accounts.',
          deploymentMarker: DEPLOYMENT_MARKER,
          secretValuesReturned: false,
        }, 403);
      }
    }

    const timestamp = nowIso();
    const firstName = getUserName(authUser, 'firstName', 'Owner');
    const lastName = getUserName(authUser, 'lastName', '');
    const phone = normalizePhone((authUser.user_metadata ?? {}).phone);
    const country = readTrimmed((authUser.user_metadata ?? {}).country) || 'United States';
    const profilePersisted = await ensureOwnerProfile(client, {
      userId: authUser.id,
      email,
      firstName,
      lastName,
      phone,
      country,
      timestamp,
    });
    const walletPersisted = await ensureOwnerWallet(client, authUser.id);
    const proof = buildProof({ authUserCreated: false, profilePersisted, walletPersisted });

    console.log('[IVXOwnerRegistration] Owner post-login repair completed:', {
      userId: authUser.id,
      email,
      profilePersisted,
      walletPersisted,
      timestamp,
    });

    return json({
      success: true,
      email,
      userId: authUser.id,
      requiresLogin: false,
      message: 'Owner profile and wallet repair completed after login without calling signup.',
      proof,
      deploymentMarker: DEPLOYMENT_MARKER,
      secretValuesReturned: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner post-login repair failed.';
    console.log('[IVXOwnerRegistration] Repair request failed:', message);
    return json({ success: false, message, deploymentMarker: DEPLOYMENT_MARKER, secretValuesReturned: false }, 500);
  }
}
