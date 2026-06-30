import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  extractIVXRoleCandidate,
  isPrivilegedIVXRole,
  readIVXTrimmedString,
  resolveIVXRoleContext,
  type AllowedIVXRole,
} from './access';
import type { IVXOwnerRole } from './types';

const DEFAULT_OPEN_ACCESS_MODE_ENABLED = true;
const DEFAULT_DEV_TEST_MODE_ENABLED = true;

export const IVX_OPEN_ACCESS_OWNER_TOKEN = 'dev-open-access-token';
export const IVX_OPEN_ACCESS_OWNER_USER_ID = '00000000-0000-4000-8000-000000000001';
export const IVX_OWNER_SERVICE_USER_ID = '00000000-0000-4000-8000-000000000002';

/**
 * The configured static owner/service token (`IVX_OWNER_TOKEN`).
 * Accepted as a privileged owner bearer for service-to-service calls in any runtime
 * (including production) so the owner can drive autonomous-core endpoints without a
 * live Supabase browser session. Returns an empty string when not configured.
 */
export function getIVXOwnerServiceToken(): string {
  return readIVXTrimmedString(process.env.IVX_OWNER_TOKEN);
}

/**
 * Baseline owner email(s) pinned at the code level so the owner allowlist can NEVER
 * be silently emptied by a drifting/missing Render env var (`IVX_OWNER_REGISTRATION_EMAILS`).
 * This was the exact `owner_route_auth_401` failing branch: a valid Supabase session
 * whose email was not promoted to `owner` because the env-sourced allowlist was empty
 * on the live service. These are already-public owner emails (the value of
 * `EXPO_PUBLIC_OWNER_EMAIL`, shipped in the client bundle) — never secrets.
 */
export const IVX_BASELINE_OWNER_EMAILS = ['iperez4242@gmail.com'] as const;

/**
 * The configured owner-email allowlist. An authenticated Supabase user whose email
 * matches one of these is treated as a privileged `owner` even when their
 * `profiles.role` (or auth metadata role) is not yet set — so a logged-in owner is
 * recognized without manual DB role editing. Sourced (in priority order) from
 * the pinned baseline (`IVX_BASELINE_OWNER_EMAILS`),
 * `IVX_OWNER_REGISTRATION_EMAILS` (comma list), `EXPO_PUBLIC_OWNER_EMAIL`,
 * `OWNER_REPAIR_EMAIL`, and `NEXT_PUBLIC_OWNER_EMAIL`/`OWNER_EMAIL` fallbacks.
 */
export function getIVXOwnerEmailAllowlist(): string[] {
  const sources = [
    ...IVX_BASELINE_OWNER_EMAILS,
    process.env.IVX_OWNER_REGISTRATION_EMAILS,
    process.env.EXPO_PUBLIC_OWNER_EMAIL,
    process.env.OWNER_REPAIR_EMAIL,
    process.env.NEXT_PUBLIC_OWNER_EMAIL,
    process.env.OWNER_EMAIL,
  ];

  const emails = sources
    .flatMap((value) => readIVXTrimmedString(value).split(','))
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  return Array.from(new Set(emails));
}

/** True when the supplied email is in the configured owner-email allowlist. */
export function isIVXOwnerAllowlistedEmail(email: string | null | undefined): boolean {
  const normalized = readIVXTrimmedString(email).toLowerCase();
  if (!normalized) {
    return false;
  }
  return getIVXOwnerEmailAllowlist().includes(normalized);
}

export type IVXAccessRuntime = 'development' | 'production';
export type IVXAccessSecurityMode = 'strict' | 'test_open_access' | 'system_bypass';
export type IVXGuardFailureStage = 'token' | 'session' | 'profile' | 'role' | 'config';

type IVXOwnerProfileRow = Record<string, unknown> & {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

export type IVXAccessControlConfig = {
  runtime: IVXAccessRuntime;
  securityMode: IVXAccessSecurityMode;
  openAccessEnabled: boolean;
  devTestModeEnabled: boolean;
  ownerBypassEnabled: boolean;
  openAccessSource: 'env' | 'development_default' | 'production_lockdown';
  devTestModeSource: 'env' | 'development_default' | 'production_lockdown';
  hasSupabaseUrl: boolean;
  hasSupabaseAnonKey: boolean;
  hasSupabaseServiceRoleKey: boolean;
};

export type IVXRoleAudit = {
  profileRoleRaw: string | null;
  profileRole: string | null;
  appMetadataRole: string | null;
  userMetadataRole: string | null;
  rawRole: string | null;
  normalizedRole: AllowedIVXRole;
  profileFound: boolean;
  profileLookupError: string | null;
};

export type IVXAuthenticatedRequestContext = {
  client: SupabaseClient;
  userId: string;
  email: string | null;
  role: IVXOwnerRole;
  accessToken: string;
  guardMode: IVXAccessSecurityMode;
  roleAudit: IVXRoleAudit;
};

type IVXSupabaseServerConfig = {
  url: string;
  anonKey: string;
  dataKey: string;
  isServiceRole: boolean;
};

type JwtPayloadLike = {
  role?: unknown;
};

function readBooleanEnv(names: string[]): boolean | null {
  for (const name of names) {
    const rawValue = readIVXTrimmedString(process.env[name]);
    if (!rawValue) {
      continue;
    }

    const normalizedValue = rawValue.toLowerCase();
    if (normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes' || normalizedValue === 'on') {
      return true;
    }

    if (normalizedValue === '0' || normalizedValue === 'false' || normalizedValue === 'no' || normalizedValue === 'off') {
      return false;
    }
  }

  return null;
}

function getExpoDevFlag(): boolean | null {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __DEV__?: boolean;
  };

  return typeof runtimeGlobal.__DEV__ === 'boolean' ? runtimeGlobal.__DEV__ : null;
}

function getIVXAccessRuntime(): IVXAccessRuntime {
  const runtimeNodeEnv = readIVXTrimmedString(process.env.NODE_ENV).toLowerCase();
  const expoDevFlag = getExpoDevFlag();

  if (expoDevFlag === true) {
    return 'development';
  }

  if (expoDevFlag === false) {
    return 'production';
  }

  return runtimeNodeEnv === 'production' ? 'production' : 'development';
}

export function getIVXAccessControlConfig(): IVXAccessControlConfig {
  const runtime = getIVXAccessRuntime();
  const explicitOpenAccess = readBooleanEnv(['EXPO_PUBLIC_IVX_OPEN_ACCESS_MODE', 'IVX_OPEN_ACCESS_MODE']);
  const explicitDevTestMode = readBooleanEnv(['EXPO_PUBLIC_IVX_TEST_MODE', 'IVX_TEST_MODE']);

  const openAccessEnabled = explicitOpenAccess ?? (runtime === 'production' ? false : DEFAULT_OPEN_ACCESS_MODE_ENABLED);
  const devTestModeEnabled = explicitDevTestMode ?? (runtime === 'production' ? false : DEFAULT_DEV_TEST_MODE_ENABLED);
  const ownerBypassEnabled = openAccessEnabled && devTestModeEnabled;

  return {
    runtime,
    securityMode: ownerBypassEnabled ? 'test_open_access' : 'strict',
    openAccessEnabled,
    devTestModeEnabled,
    ownerBypassEnabled,
    openAccessSource: explicitOpenAccess !== null
      ? 'env'
      : runtime === 'production'
        ? 'production_lockdown'
        : 'development_default',
    devTestModeSource: explicitDevTestMode !== null
      ? 'env'
      : runtime === 'production'
        ? 'production_lockdown'
        : 'development_default',
    hasSupabaseUrl: readIVXTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_URL).length > 0,
    hasSupabaseAnonKey: readIVXTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).length > 0,
    hasSupabaseServiceRoleKey: readIVXTrimmedString(process.env.SUPABASE_SERVICE_ROLE_KEY).length > 0 || readIVXTrimmedString(process.env.SUPABASE_SERVICE_KEY).length > 0,
  };
}

export function isOpenAccessModeEnabled(): boolean {
  return getIVXAccessControlConfig().openAccessEnabled;
}

export function isIVXDevTestModeEnabled(): boolean {
  return getIVXAccessControlConfig().devTestModeEnabled;
}

export function shouldAcceptOpenAccessOwnerToken(): boolean {
  return getIVXAccessControlConfig().ownerBypassEnabled;
}

export function extractIVXBearerToken(request: Request): string | null {
  const authorizationHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') {
    return null;
  }

  const trimmedToken = readIVXTrimmedString(token);
  return trimmedToken.length > 0 ? trimmedToken : null;
}

function decodeIVXJwtPayload(token: string): JwtPayloadLike | null {
  const normalizedToken = readIVXTrimmedString(token);
  const payloadSegment = normalizedToken.split('.')[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    const paddedPayload = payloadSegment
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    const decodedPayload = globalThis.Buffer
      ? globalThis.Buffer.from(paddedPayload, 'base64').toString('utf8')
      : atob(paddedPayload);
    return JSON.parse(decodedPayload) as JwtPayloadLike;
  } catch {
    return null;
  }
}

function isRealSupabaseServiceRoleKey(candidate: string, anonKey: string): boolean {
  const normalizedCandidate = readIVXTrimmedString(candidate);
  if (!normalizedCandidate || normalizedCandidate === readIVXTrimmedString(anonKey)) {
    return false;
  }

  const roleClaim = readIVXTrimmedString(decodeIVXJwtPayload(normalizedCandidate)?.role);
  return roleClaim === 'service_role' || roleClaim === 'supabase_admin';
}

function resolveIVXServiceRoleKey(anonKey: string): string {
  const candidates = [
    readIVXTrimmedString(process.env.SUPABASE_SERVICE_ROLE_KEY),
    readIVXTrimmedString(process.env.SUPABASE_SERVICE_KEY),
  ];

  return candidates.find((candidate) => isRealSupabaseServiceRoleKey(candidate, anonKey)) ?? '';
}

function getIVXSupabaseServerConfig(): IVXSupabaseServerConfig {
  const supabaseUrl = readIVXTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = readIVXTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = resolveIVXServiceRoleKey(anonKey);
  const hasRealServiceRoleKey = serviceRoleKey.length > 0;
  const effectiveDataKey = hasRealServiceRoleKey ? serviceRoleKey : anonKey;

  if (!supabaseUrl) {
    throw new Error('IVX auth config failed: EXPO_PUBLIC_SUPABASE_URL is missing.');
  }

  if (!effectiveDataKey) {
    throw new Error('IVX auth config failed: no usable Supabase server key is configured.');
  }

  return {
    url: supabaseUrl,
    anonKey: anonKey || effectiveDataKey,
    dataKey: effectiveDataKey,
    isServiceRole: hasRealServiceRoleKey,
  };
}

export function createIVXServerClient(accessToken: string): SupabaseClient {
  const config = getIVXSupabaseServerConfig();
  const ownerBypassToken = shouldAcceptOpenAccessOwnerToken() && accessToken === IVX_OPEN_ACCESS_OWNER_TOKEN;

  if (config.isServiceRole || ownerBypassToken) {
    return createClient(config.url, config.dataKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return createClient(config.url, config.dataKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function loadIVXOwnerProfile(client: SupabaseClient, userId: string, logPrefix: string): Promise<{
  profile: IVXOwnerProfileRow | null;
  errorMessage: string | null;
}> {
  const profileResult = await client.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (profileResult.error) {
    console.log(`${logPrefix} Profile lookup failed:`, {
      userId,
      message: profileResult.error.message,
    });
    return {
      profile: null,
      errorMessage: profileResult.error.message,
    };
  }

  return {
    profile: (profileResult.data as IVXOwnerProfileRow | null) ?? null,
    errorMessage: null,
  };
}

export function resolveIVXRoleAudit(
  user: User,
  ownerProfile: Record<string, unknown> | null | undefined,
  profileLookupError: string | null,
): IVXRoleAudit {
  const profileRoleRaw = readIVXTrimmedString(ownerProfile?.role) || null;
  const profileRole = extractIVXRoleCandidate(ownerProfile);
  const appMetadataRole = extractIVXRoleCandidate(user.app_metadata as Record<string, unknown> | null | undefined);
  const userMetadataRole = extractIVXRoleCandidate(user.user_metadata as Record<string, unknown> | null | undefined);
  const roleContext = resolveIVXRoleContext([
    profileRole,
    appMetadataRole,
    userMetadataRole,
  ]);

  return {
    profileRoleRaw,
    profileRole,
    appMetadataRole,
    userMetadataRole,
    rawRole: roleContext.rawRole,
    normalizedRole: roleContext.normalizedRole,
    profileFound: !!ownerProfile,
    profileLookupError,
  };
}

function createOpenAccessRoleAudit(): IVXRoleAudit {
  return {
    profileRoleRaw: 'owner',
    profileRole: 'owner',
    appMetadataRole: null,
    userMetadataRole: null,
    rawRole: 'owner',
    normalizedRole: 'owner',
    profileFound: false,
    profileLookupError: null,
  };
}

function logGuardDecision(input: {
  logPrefix: string;
  stage: IVXGuardFailureStage | 'allow';
  config: IVXAccessControlConfig;
  userId: string | null;
  email: string | null;
  roleAudit: IVXRoleAudit | null;
  detail: string;
}): void {
  console.log(`${input.logPrefix} Auth audit:`, {
    stage: input.stage,
    detail: input.detail,
    runtime: input.config.runtime,
    securityMode: input.config.securityMode,
    openAccessEnabled: input.config.openAccessEnabled,
    devTestModeEnabled: input.config.devTestModeEnabled,
    ownerBypassEnabled: input.config.ownerBypassEnabled,
    userId: input.userId,
    email: input.email,
    roleAudit: input.roleAudit,
  });
}

export async function resolveIVXAuthenticatedRequest(
  request: Request,
  logPrefix: string,
): Promise<IVXAuthenticatedRequestContext> {
  const config = getIVXAccessControlConfig();
  const accessToken = extractIVXBearerToken(request);

  if (!accessToken) {
    logGuardDecision({
      logPrefix,
      stage: 'token',
      config,
      userId: null,
      email: null,
      roleAudit: null,
      detail: 'Missing bearer token.',
    });
    throw new Error('IVX auth guard failed: missing bearer token.');
  }

  const ownerServiceToken = getIVXOwnerServiceToken();
  if (ownerServiceToken && accessToken === ownerServiceToken) {
    const serviceAudit = createOpenAccessRoleAudit();
    logGuardDecision({
      logPrefix,
      stage: 'allow',
      config,
      userId: IVX_OWNER_SERVICE_USER_ID,
      email: 'owner@ivx.holdings',
      roleAudit: serviceAudit,
      detail: 'Accepted configured IVX_OWNER_TOKEN owner service token.',
    });

    return {
      client: createIVXServerClient(accessToken),
      userId: IVX_OWNER_SERVICE_USER_ID,
      email: 'owner@ivx.holdings',
      role: 'owner',
      accessToken,
      guardMode: config.securityMode,
      roleAudit: serviceAudit,
    };
  }

  if (config.ownerBypassEnabled && accessToken === IVX_OPEN_ACCESS_OWNER_TOKEN) {
    const bypassAudit = createOpenAccessRoleAudit();
    logGuardDecision({
      logPrefix,
      stage: 'allow',
      config,
      userId: IVX_OPEN_ACCESS_OWNER_USER_ID,
      email: 'owner@ivx.dev',
      roleAudit: bypassAudit,
      detail: 'Accepted explicit test/open-access owner bypass token.',
    });

    return {
      client: createIVXServerClient(accessToken),
      userId: IVX_OPEN_ACCESS_OWNER_USER_ID,
      email: 'owner@ivx.dev',
      role: 'owner',
      accessToken,
      guardMode: config.securityMode,
      roleAudit: bypassAudit,
    };
  }

  const client = createIVXServerClient(accessToken);
  const userResult = await client.auth.getUser(accessToken);

  if (userResult.error || !userResult.data.user) {
    logGuardDecision({
      logPrefix,
      stage: 'session',
      config,
      userId: null,
      email: null,
      roleAudit: null,
      detail: userResult.error?.message ?? 'Supabase user lookup returned no user.',
    });
    throw new Error('IVX auth guard failed: invalid or expired Supabase session.');
  }

  const user = userResult.data.user;
  const ownerProfileResult = await loadIVXOwnerProfile(client, user.id, logPrefix);
  const roleAudit = resolveIVXRoleAudit(user, ownerProfileResult.profile, ownerProfileResult.errorMessage);
  const resolvedEmail = readIVXTrimmedString(ownerProfileResult.profile?.email) || user.email || null;

  // Promote an authenticated user whose email is in the owner allowlist to `owner`,
  // even when their profiles.role / auth metadata role is unset — so a logged-in owner
  // is recognized without manual DB role editing.
  if (!isPrivilegedIVXRole(roleAudit.normalizedRole) && isIVXOwnerAllowlistedEmail(resolvedEmail)) {
    const promotedAudit: IVXRoleAudit = { ...roleAudit, rawRole: roleAudit.rawRole ?? 'owner', normalizedRole: 'owner' };
    logGuardDecision({
      logPrefix,
      stage: 'allow',
      config,
      userId: user.id,
      email: resolvedEmail,
      roleAudit: promotedAudit,
      detail: 'Authenticated user promoted to owner via owner-email allowlist match.',
    });

    return {
      client,
      userId: user.id,
      email: resolvedEmail,
      role: 'owner',
      accessToken,
      guardMode: config.securityMode,
      roleAudit: promotedAudit,
    };
  }

  if (!isPrivilegedIVXRole(roleAudit.normalizedRole)) {
    if (config.ownerBypassEnabled) {
      logGuardDecision({
        logPrefix,
        stage: 'allow',
        config,
        userId: user.id,
        email: user.email ?? null,
        roleAudit,
        detail: 'Authenticated session promoted by explicit test/open-access bypass after role resolution.',
      });

      return {
        client,
        userId: user.id,
        email: readIVXTrimmedString(ownerProfileResult.profile?.email) || user.email || null,
        role: 'owner',
        accessToken,
        guardMode: config.securityMode,
        roleAudit,
      };
    }

    logGuardDecision({
      logPrefix,
      stage: 'role',
      config,
      userId: user.id,
      email: user.email ?? null,
      roleAudit,
      detail: 'Authenticated user is not mapped to a privileged IVX role.',
    });
    throw new Error('IVX role guard failed: privileged IVX access is required.');
  }

  logGuardDecision({
    logPrefix,
    stage: 'allow',
    config,
    userId: user.id,
    email: user.email ?? null,
    roleAudit,
    detail: 'Authenticated privileged IVX request accepted.',
  });

  return {
    client,
    userId: user.id,
    email: readIVXTrimmedString(ownerProfileResult.profile?.email) || user.email || null,
    role: roleAudit.normalizedRole,
    accessToken,
    guardMode: config.securityMode,
    roleAudit,
  };
}
