import { getApiBaseUrl } from '@/lib/api-base';

export type OwnerRepairReadinessStatus = 'ready' | 'missing' | 'matches_anon' | 'unexpected_jwt_role' | 'unreachable';
export type RepairIssueTone = 'critical' | 'warning' | 'success';
export type OwnerRepairReadinessSource = 'server_api' | 'local_env';

interface OwnerRepairDiagnosticsPayload {
  success?: boolean;
  hasUrl?: boolean;
  hasAnonKey?: boolean;
  hasServiceRoleKey?: boolean;
  serviceRoleStatus?: 'ready' | 'missing' | 'matches_anon' | 'unexpected_jwt_role';
  serviceRoleJwtRole?: string | null;
  hasRealServiceRole?: boolean;
  canRepairExistingOwner?: boolean;
  message?: string;
  warnings?: string[];
}

export interface OwnerRepairReadiness {
  status: OwnerRepairReadinessStatus;
  source: OwnerRepairReadinessSource;
  hasVerifiedServerState: boolean;
  hasSupabaseUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  hasRealServiceRole: boolean;
  serviceRoleJwtRole: string | null;
  title: string;
  detail: string;
  nextAction: string;
  warnings: string[];
}

export interface RepairIssueItem {
  id: string;
  title: string;
  detail: string;
  tone: RepairIssueTone;
}

function buildPublicAuthMissingReadiness(hasSupabaseUrl: boolean, hasAnonKey: boolean): OwnerRepairReadiness {
  return {
    status: 'missing',
    source: 'local_env',
    hasVerifiedServerState: true,
    hasSupabaseUrl,
    hasAnonKey,
    hasServiceRoleKey: false,
    hasRealServiceRole: false,
    serviceRoleJwtRole: null,
    title: 'Public Supabase auth is not fully configured',
    detail: 'Without the public Supabase URL and anon key, normal live email/password sign-in cannot complete cleanly. This is separate from any server-side repair key.',
    nextAction: 'Restore the public Supabase environment first, then retry normal owner sign-in or password reset.',
    warnings: [],
  };
}

function buildLocalServerUnknownReadiness(hasSupabaseUrl: boolean, hasAnonKey: boolean): OwnerRepairReadiness {
  return {
    status: 'unreachable',
    source: 'local_env',
    hasVerifiedServerState: false,
    hasSupabaseUrl,
    hasAnonKey,
    hasServiceRoleKey: false,
    hasRealServiceRole: false,
    serviceRoleJwtRole: null,
    title: 'Admin-side owner repair is not verified from the client',
    detail: 'The service-role key is server-only. Client env inspection cannot prove whether backend admin repair is configured for an existing owner auth account, but normal owner email/password sign-in does not use that key at all.',
    nextAction: 'Use normal owner sign-in first. If the password is lost or rejected and support needs to inspect or rewrite the existing auth user directly, the backend must confirm a real service_role key. Until then, use password reset.',
    warnings: [
      'Client-side code cannot safely verify SUPABASE_SERVICE_ROLE_KEY because that key is server-only.',
    ],
  };
}

function buildServerBackedReadiness(payload: OwnerRepairDiagnosticsPayload): OwnerRepairReadiness {
  const hasSupabaseUrl = payload.hasUrl === true;
  const hasAnonKey = payload.hasAnonKey === true;
  const hasServiceRoleKey = payload.hasServiceRoleKey === true;
  const hasRealServiceRole = payload.hasRealServiceRole === true && payload.canRepairExistingOwner === true;
  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
    : [];
  const serviceRoleJwtRole = typeof payload.serviceRoleJwtRole === 'string' && payload.serviceRoleJwtRole.trim()
    ? payload.serviceRoleJwtRole.trim()
    : null;

  if (!hasSupabaseUrl || !hasAnonKey) {
    return {
      status: 'missing',
      source: 'server_api',
      hasVerifiedServerState: true,
      hasSupabaseUrl,
      hasAnonKey,
      hasServiceRoleKey,
      hasRealServiceRole: false,
      serviceRoleJwtRole,
      title: 'Public Supabase auth is not fully configured',
      detail: payload.message?.trim() || 'The backend reported that public Supabase auth is incomplete, so live owner sign-in cannot be verified cleanly.',
      nextAction: 'Restore the public Supabase URL and anon key first, then retry owner sign-in or password reset.',
      warnings,
    };
  }

  const status = payload.serviceRoleStatus ?? (hasRealServiceRole ? 'ready' : 'unreachable');

  if (status === 'ready' && hasRealServiceRole) {
    return {
      status: 'ready',
      source: 'server_api',
      hasVerifiedServerState: true,
      hasSupabaseUrl,
      hasAnonKey,
      hasServiceRoleKey,
      hasRealServiceRole: true,
      serviceRoleJwtRole,
      title: 'Admin-side owner repair is ready',
      detail: payload.message?.trim() || 'Live backend diagnostics confirmed that a real service-role key is available for backend-only Supabase admin repair. Normal owner sign-in still uses only the public email/password auth path instead.',
      nextAction: 'Use normal owner sign-in first. If live sign-in still fails because the existing auth user needs admin-side inspection, confirmation, or password repair, run the owner bootstrap or repair flow safely.',
      warnings,
    };
  }

  if (status === 'matches_anon') {
    return {
      status: 'matches_anon',
      source: 'server_api',
      hasVerifiedServerState: true,
      hasSupabaseUrl,
      hasAnonKey,
      hasServiceRoleKey,
      hasRealServiceRole: false,
      serviceRoleJwtRole,
      title: 'Admin-side owner repair is blocked',
      detail: payload.message?.trim() || 'The backend reported that SUPABASE_SERVICE_ROLE_KEY matches the public anon key, so admin endpoints such as /auth/v1/admin/users do not have admin authority to inspect or update an existing owner auth user. Normal owner sign-in itself does not need this key.',
      nextAction: 'Normal owner sign-in can still use the public auth path. If support needs to inspect, confirm, or repair the existing owner auth account directly, replace SUPABASE_SERVICE_ROLE_KEY on the server with the real service_role key. Until then, use password reset.',
      warnings,
    };
  }

  if (status === 'unexpected_jwt_role') {
    return {
      status: 'unexpected_jwt_role',
      source: 'server_api',
      hasVerifiedServerState: true,
      hasSupabaseUrl,
      hasAnonKey,
      hasServiceRoleKey,
      hasRealServiceRole: false,
      serviceRoleJwtRole,
      title: 'Admin-side owner repair key is invalid',
      detail: payload.message?.trim() || `The backend reported a non-admin service-role token (${serviceRoleJwtRole ?? 'unknown'}), so backend-only Supabase admin inspection and repair are still blocked. Normal owner sign-in does not depend on this token.`,
      nextAction: 'Use normal owner sign-in first. If backend support needs to inspect or repair the existing owner auth account directly, replace SUPABASE_SERVICE_ROLE_KEY on the server with the real Supabase service_role key, then retry owner repair.',
      warnings,
    };
  }

  if (status === 'missing') {
    return {
      status: 'missing',
      source: 'server_api',
      hasVerifiedServerState: true,
      hasSupabaseUrl,
      hasAnonKey,
      hasServiceRoleKey,
      hasRealServiceRole: false,
      serviceRoleJwtRole,
      title: 'Admin-side owner repair is not configured',
      detail: payload.message?.trim() || 'The backend reported that the service-role key is missing, so it cannot use Supabase admin APIs to inspect an existing owner auth user, confirm identity server-side, or repair a broken owner password programmatically. Normal owner sign-in does not require this key.',
      nextAction: 'Use normal owner sign-in first. If the existing owner auth account needs backend-side inspection or password repair, use password reset or add the real Supabase service_role key on the server to enable programmatic repair.',
      warnings,
    };
  }

  return {
    status: 'unreachable',
    source: 'server_api',
    hasVerifiedServerState: false,
    hasSupabaseUrl,
    hasAnonKey,
    hasServiceRoleKey,
    hasRealServiceRole: false,
    serviceRoleJwtRole,
    title: 'Admin-side owner repair could not be verified',
    detail: payload.message?.trim() || 'The backend owner-repair diagnostics did not return a trusted verification result. Normal owner sign-in remains a separate public auth path.',
    nextAction: 'Retry the backend diagnostics. Use normal owner sign-in first, and if the password is still blocked now, use password reset while the admin-side repair path is being verified.',
    warnings,
  };
}

export function getOwnerRepairReadiness(): OwnerRepairReadiness {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  const hasSupabaseUrl = supabaseUrl.length > 0;
  const hasAnonKey = anonKey.length > 0;

  if (!hasSupabaseUrl || !hasAnonKey) {
    return buildPublicAuthMissingReadiness(hasSupabaseUrl, hasAnonKey);
  }

  return buildLocalServerUnknownReadiness(hasSupabaseUrl, hasAnonKey);
}

export async function fetchOwnerRepairReadiness(): Promise<OwnerRepairReadiness> {
  const fallback = getOwnerRepairReadiness();
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    console.log('[OwnerRepairReadiness] No API base URL configured. Using local fallback diagnostics.');
    return fallback;
  }

  const diagnosticsUrl = `${apiBaseUrl}/api/owner-bootstrap`;
  console.log('[OwnerRepairReadiness] Fetching live server diagnostics from:', diagnosticsUrl);

  try {
    const response = await fetch(diagnosticsUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-store',
      },
    });

    const payload = await response.json().catch(() => null) as OwnerRepairDiagnosticsPayload | null;
    if (!response.ok || !payload) {
      const responseMessage = payload && typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : `Diagnostics request failed with status ${response.status}.`;
      throw new Error(responseMessage);
    }

    const readiness = buildServerBackedReadiness(payload);
    console.log('[OwnerRepairReadiness] Live server diagnostics:', JSON.stringify(readiness));
    return readiness;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown diagnostics error';
    console.log('[OwnerRepairReadiness] Live diagnostics failed. Falling back to local readiness:', message);
    return {
      ...fallback,
      status: fallback.status === 'missing' ? 'missing' : 'unreachable',
      title: 'Server owner repair could not be verified',
      detail: `The live backend owner-repair diagnostics could not be reached: ${message}`,
      nextAction: 'Retry the backend diagnostics. If password sign-in is blocked now, use password reset while verifying the server service_role configuration.',
      warnings: Array.from(new Set([...fallback.warnings, message])),
    };
  }
}

export function buildRepairIssueItems(readiness: OwnerRepairReadiness): RepairIssueItem[] {
  const items: RepairIssueItem[] = [];

  if (readiness.hasSupabaseUrl && readiness.hasAnonKey) {
    items.push({
      id: 'public-auth-ready',
      title: 'Public Supabase sign-in path is configured',
      detail: 'The app can submit the entered owner email and password to live Supabase Auth. Normal owner sign-in uses this path and does not need the service-role key. That key is only for backend-only admin APIs against an existing auth user.',
      tone: 'success',
    });
  } else {
    items.push({
      id: 'public-auth-missing',
      title: 'Public Supabase sign-in path is incomplete',
      detail: 'The app is missing the public Supabase URL or anon key, so live sign-in cannot work reliably.',
      tone: 'critical',
    });
  }

  if (readiness.status === 'missing' && readiness.hasSupabaseUrl && readiness.hasAnonKey) {
    items.push({
      id: 'service-role-missing',
      title: 'Server repair key is missing',
      detail: readiness.detail,
      tone: 'critical',
    });
  }

  if (readiness.status === 'matches_anon') {
    items.push({
      id: 'service-role-equals-anon',
      title: 'Server repair key equals the public anon key',
      detail: readiness.detail,
      tone: 'critical',
    });
  }

  if (readiness.status === 'unexpected_jwt_role') {
    items.push({
      id: 'service-role-invalid-jwt',
      title: 'Server repair key does not carry Supabase admin authority',
      detail: readiness.detail,
      tone: 'critical',
    });
  }

  if (readiness.status === 'unreachable') {
    items.push({
      id: 'service-role-unverified',
      title: readiness.source === 'local_env'
        ? 'Server repair path is not verified from client code'
        : 'Server repair diagnostics could not be reached',
      detail: readiness.detail,
      tone: 'warning',
    });
  }

  if (!readiness.hasRealServiceRole) {
    items.push({
      id: 'existing-owner-warning',
      title: readiness.hasVerifiedServerState
        ? 'Existing owner password repair is separate from normal sign-in'
        : 'Existing owner repair cannot be confirmed yet',
      detail: readiness.hasVerifiedServerState
        ? 'Normal owner sign-in does not need the service-role key. That key is only required when the backend must call Supabase admin APIs to inspect, confirm, repair, or rewrite the password for an existing owner auth account.'
        : 'The client can prove the public sign-in path, but admin-side owner repair still needs live backend diagnostics because the service_role key stays server-only.',
      tone: 'warning',
    });
    items.push({
      id: 'password-reset-fallback',
      title: 'Password reset is the safe fallback when password repair is needed',
      detail: readiness.nextAction,
      tone: 'warning',
    });
  } else {
    items.push({
      id: 'existing-owner-repair-ready',
      title: 'Existing owner accounts can be repaired server-side',
      detail: readiness.nextAction,
      tone: 'success',
    });
  }

  return items;
}
