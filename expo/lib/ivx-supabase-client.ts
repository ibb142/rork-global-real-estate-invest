import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { getConfiguredOwnerAdminEmail } from '@/lib/admin-access-lock';
import { getSupabaseClient, supabase } from '@/lib/supabase';
import {
  getIVXAccessControlConfig,
  IVX_OPEN_ACCESS_OWNER_TOKEN,
  IVX_OPEN_ACCESS_OWNER_USER_ID,
  IVX_OWNER_AI_API_PATH,
  resolveIVXRoleAudit,
  type IVXOwnerAuthContext,
} from '@/shared/ivx';

const IVX_OWNER_AI_LEGACY_API_PATH = IVX_OWNER_AI_API_PATH.replace(/^\/api/, '');
const IVX_CANONICAL_API_BASE_URL = 'https://api.ivxholding.com';

type IVXOwnerAIRuntimeEnvironment = 'development' | 'production';
type IVXOwnerAIRoutingPolicy = 'production_explicit' | 'production_canonical' | 'production_blocked' | 'development_explicit' | 'development_canonical' | 'development_fallback' | 'development_unconfigured';

export type IVXOwnerAIConfigAudit = {
  currentEnvironment: IVXOwnerAIRuntimeEnvironment;
  configuredBaseUrl: string | null;
  configuredFrom: 'EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL' | 'EXPO_PUBLIC_IVX_API_BASE_URL' | null;
  devFallbackBaseUrl: string | null;
  projectApiBaseUrl: string | null;
  directApiBaseUrl: string | null;
  webPreviewBaseUrl: string | null;
  canonicalBaseUrl: string;
  activeBaseUrl: string | null;
  activeHost: string | null;
  directApiHost: string | null;
  explicitProductionPinApplied: boolean;
  activeEndpoint: string | null;
  candidateEndpoints: string[];
  healthCheckUrl: string | null;
  route53AuditUrl: string | null;
  route53UpsertUrl: string | null;
  appApiHealthCheckUrl: string | null;
  appApiRoute53AuditUrl: string | null;
  routingPolicy: IVXOwnerAIRoutingPolicy;
  selectionReason: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  productionReady: boolean;
  blocksRemoteRequests: boolean;
  configurationError: string | null;
  pointsToDevHost: boolean;
  workflowTrace: string[];
  mismatchWarnings: string[];
};

function readTrimmedEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function getRuntimeEnvironment(): IVXOwnerAIRuntimeEnvironment {
  return __DEV__ ? 'development' : 'production';
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '');
}

function safeExtractHostname(value: string | null): string | null {
  const normalizedValue = normalizeBaseUrl(value ?? '');
  if (!normalizedValue) {
    return null;
  }

  try {
    return new URL(normalizedValue).hostname || null;
  } catch {
    return normalizedValue.replace(/^https?:\/\//i, '').split('/')[0]?.trim() || null;
  }
}

function buildAbsoluteUrl(baseUrl: string | null, path: string): string | null {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl ?? '');
  if (!normalizedBaseUrl) {
    return null;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function pushUniqueString(values: string[], value: string): void {
  const normalizedValue = value.trim();
  if (!normalizedValue || values.includes(normalizedValue)) {
    return;
  }

  values.push(normalizedValue);
}

function buildOwnerAIUrls(baseUrl: string): [string, string] {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return [
    `${normalizedBaseUrl}${IVX_OWNER_AI_API_PATH}`,
    `${normalizedBaseUrl}${IVX_OWNER_AI_LEGACY_API_PATH}`,
  ];
}

function getDefaultProjectApiBaseUrl(): string {
  const projectId = readTrimmedEnv('EXPO_PUBLIC_PROJECT_ID');
  if (!projectId) {
    return '';
  }

  return `https://dev-${projectId}.ivxtest.dev`;
}

function getConfiguredProjectApiBaseUrl(): string {
  return normalizeBaseUrl(readTrimmedEnv('EXPO_PUBLIC_IVX_API_BASE_URL'));
}

function getConfiguredDirectApiBaseUrl(): string {
  return normalizeBaseUrl(readTrimmedEnv('EXPO_PUBLIC_API_BASE_URL'));
}

function getConfiguredOwnerAIBaseUrl(): {
  configuredBaseUrl: string | null;
  configuredFrom: IVXOwnerAIConfigAudit['configuredFrom'];
} {
  const ownerAIBaseUrl = normalizeBaseUrl(readTrimmedEnv('EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL'));
  if (ownerAIBaseUrl) {
    return {
      configuredBaseUrl: ownerAIBaseUrl,
      configuredFrom: 'EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL',
    };
  }

  const projectApiBaseUrl = getConfiguredProjectApiBaseUrl();
  if (projectApiBaseUrl) {
    return {
      configuredBaseUrl: projectApiBaseUrl,
      configuredFrom: 'EXPO_PUBLIC_IVX_API_BASE_URL',
    };
  }

  return {
    configuredBaseUrl: null,
    configuredFrom: null,
  };
}

function getWebPreviewBaseUrl(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return '';
  }

  const origin = typeof window.location?.origin === 'string' ? window.location.origin : '';
  return normalizeBaseUrl(origin);
}

function isDevLikeBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl).toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.includes('ivxtest.dev')
    || normalized.includes('localhost')
    || normalized.includes('127.0.0.1')
    || normalized.includes('192.168.')
    || normalized.includes('10.')
    || normalized.includes('172.16.');
}

function pushUniqueUrl(urls: string[], value: string): void {
  const normalizedValue = value.trim();
  if (!normalizedValue || urls.includes(normalizedValue)) {
    return;
  }

  urls.push(normalizedValue);
}

export function getIVXSupabaseClient(): SupabaseClient {
  return getSupabaseClient();
}

export function getIVXOwnerAIConfigAudit(): IVXOwnerAIConfigAudit {
  const currentEnvironment = getRuntimeEnvironment();
  const configuredOwnerAIBaseUrl = getConfiguredOwnerAIBaseUrl();
  const envConfiguredBaseUrl = configuredOwnerAIBaseUrl.configuredBaseUrl ?? '';
  const explicitProductionPinApplied = !!envConfiguredBaseUrl;
  const configuredBaseUrl = configuredOwnerAIBaseUrl.configuredBaseUrl;
  const configuredFrom = configuredOwnerAIBaseUrl.configuredFrom;
  const devFallbackBaseUrl = normalizeBaseUrl(getDefaultProjectApiBaseUrl());
  const projectApiBaseUrl = getConfiguredProjectApiBaseUrl();
  const directApiBaseUrl = getConfiguredDirectApiBaseUrl();
  const webPreviewBaseUrl = getWebPreviewBaseUrl();
  const candidateEndpoints: string[] = [];
  const workflowTrace: string[] = [];
  const mismatchWarnings: string[] = [];

  let activeBaseUrl: string | null = null;
  let routingPolicy: IVXOwnerAIRoutingPolicy = 'development_unconfigured';
  let selectionReason = 'Owner AI routing is not configured yet.';
  let fallbackUsed = false;
  let fallbackReason: string | null = null;
  let configurationError: string | null = null;
  let blocksRemoteRequests = false;

  if (currentEnvironment === 'production') {
    if (envConfiguredBaseUrl && !isDevLikeBaseUrl(envConfiguredBaseUrl)) {
      routingPolicy = 'production_explicit';
      activeBaseUrl = envConfiguredBaseUrl;
      selectionReason = 'Production Owner AI routing is explicitly pinned by EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL.';
    } else {
      routingPolicy = 'production_canonical';
      activeBaseUrl = IVX_CANONICAL_API_BASE_URL;
      selectionReason = envConfiguredBaseUrl
        ? `Production Owner AI routing pinned to the canonical IVX API host because the configured override (${envConfiguredBaseUrl}) looks like a development host.`
        : 'Production Owner AI routing pinned to the canonical IVX API host (https://api.ivxholding.com).';
    }
  } else if (envConfiguredBaseUrl) {
    routingPolicy = 'development_explicit';
    activeBaseUrl = envConfiguredBaseUrl;
    selectionReason = envConfiguredBaseUrl === IVX_CANONICAL_API_BASE_URL
      ? 'Development build is explicitly pinned to the canonical IVX API host.'
      : `Development build is explicitly pinned by ${configuredFrom ?? 'environment configuration'}.`;
  } else if (projectApiBaseUrl) {
    routingPolicy = 'development_fallback';
    activeBaseUrl = projectApiBaseUrl;
    fallbackUsed = true;
    fallbackReason = 'Using EXPO_PUBLIC_IVX_API_BASE_URL for internal owner-room testing.';
    selectionReason = 'Development build uses the configured project API host for internal owner-room testing.';
  } else if (directApiBaseUrl) {
    routingPolicy = 'development_fallback';
    activeBaseUrl = directApiBaseUrl;
    fallbackUsed = true;
    fallbackReason = 'Using EXPO_PUBLIC_API_BASE_URL for internal owner-room testing.';
    selectionReason = 'Development build uses the app-wide API host for internal owner-room testing.';
  } else if (devFallbackBaseUrl) {
    routingPolicy = 'development_fallback';
    activeBaseUrl = devFallbackBaseUrl;
    fallbackUsed = true;
    fallbackReason = 'Using the derived IVX project API host for internal owner-room testing.';
    selectionReason = 'Development build uses the derived IVX project API host for internal owner-room testing.';
  } else if (webPreviewBaseUrl) {
    routingPolicy = 'development_fallback';
    activeBaseUrl = webPreviewBaseUrl;
    fallbackUsed = true;
    fallbackReason = 'Using the current web preview origin for internal owner-room testing.';
    selectionReason = 'Development build uses the current web preview origin for internal owner-room testing.';
  } else {
    routingPolicy = 'development_canonical';
    activeBaseUrl = IVX_CANONICAL_API_BASE_URL;
    fallbackUsed = true;
    fallbackReason = 'No internal testing API host was configured, so the canonical host remains the last-resort fallback.';
    selectionReason = 'Development build fell back to the canonical IVX API host because no internal testing API host is configured.';
  }

  if (activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(activeBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  if (currentEnvironment === 'development' && projectApiBaseUrl && projectApiBaseUrl !== activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(projectApiBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  if (currentEnvironment === 'development' && directApiBaseUrl && directApiBaseUrl !== activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(directApiBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  if (currentEnvironment === 'development' && devFallbackBaseUrl && devFallbackBaseUrl !== activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(devFallbackBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  if (currentEnvironment === 'development' && webPreviewBaseUrl && webPreviewBaseUrl !== activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(webPreviewBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  if (currentEnvironment === 'development' && IVX_CANONICAL_API_BASE_URL !== activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(IVX_CANONICAL_API_BASE_URL)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  const activeEndpoint = candidateEndpoints[0] ?? null;
  const activeHost = safeExtractHostname(activeBaseUrl);
  const directApiHost = safeExtractHostname(directApiBaseUrl || null);
  const healthCheckUrl = buildAbsoluteUrl(activeBaseUrl, '/health');
  const route53AuditUrl = buildAbsoluteUrl(activeBaseUrl, '/api/aws/route53/audit');
  const route53UpsertUrl = buildAbsoluteUrl(activeBaseUrl, '/api/aws/route53/upsert');
  const appApiHealthCheckUrl = buildAbsoluteUrl(directApiBaseUrl || null, '/health');
  const appApiRoute53AuditUrl = buildAbsoluteUrl(directApiBaseUrl || null, '/api/aws/route53/audit');
  const pointsToDevHost = activeBaseUrl ? isDevLikeBaseUrl(activeBaseUrl) : false;
  const productionReady = currentEnvironment === 'production'
    ? !!envConfiguredBaseUrl && !blocksRemoteRequests && !pointsToDevHost
    : true;

  pushUniqueString(
    workflowTrace,
    `Owner AI explicit base: ${configuredBaseUrl ?? 'not set'}${configuredFrom ? ` (${configuredFrom})` : ''}`,
  );
  pushUniqueString(
    workflowTrace,
    `IVX API base: ${projectApiBaseUrl || 'not set'}${projectApiBaseUrl ? ' (EXPO_PUBLIC_IVX_API_BASE_URL)' : ''}`,
  );
  pushUniqueString(
    workflowTrace,
    `App-wide API base: ${directApiBaseUrl || 'not set'}${directApiBaseUrl ? ' (EXPO_PUBLIC_API_BASE_URL, not consumed by Owner AI routing)' : ''}`,
  );
  pushUniqueString(
    workflowTrace,
    `Web preview origin: ${webPreviewBaseUrl || 'not set'}`,
  );
  pushUniqueString(
    workflowTrace,
    `Project fallback base: ${devFallbackBaseUrl || 'not set'}${devFallbackBaseUrl ? ' (derived from EXPO_PUBLIC_PROJECT_ID)' : ''}`,
  );
  pushUniqueString(
    workflowTrace,
    `Fallback reason: ${fallbackReason ?? 'none'}`,
  );
  pushUniqueString(
    workflowTrace,
    `Selected Owner AI base: ${activeBaseUrl ?? 'blocked'} via ${selectionReason}`,
  );
  pushUniqueString(
    workflowTrace,
    `Selected Owner AI endpoint: ${activeEndpoint ?? 'unconfigured'}`,
  );
  pushUniqueString(
    workflowTrace,
    `Owner AI health URL: ${healthCheckUrl ?? 'unconfigured'}`,
  );
  pushUniqueString(
    workflowTrace,
    `Owner Route53 audit URL: ${route53AuditUrl ?? 'unconfigured'}`,
  );

  if (directApiBaseUrl && !configuredBaseUrl && currentEnvironment === 'production') {
    pushUniqueString(
      mismatchWarnings,
      `EXPO_PUBLIC_API_BASE_URL points to ${directApiBaseUrl}, but production Owner AI routing does not read that variable unless EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL is also set.`,
    );
  }

  if (directApiBaseUrl && activeBaseUrl && normalizeBaseUrl(directApiBaseUrl) !== normalizeBaseUrl(activeBaseUrl)) {
    pushUniqueString(
      mismatchWarnings,
      `App-wide API traffic points to ${directApiBaseUrl}, while Owner AI resolves through ${activeBaseUrl}. This split host path can hide the real failing backend.`,
    );
  }

  if (currentEnvironment === 'production' && directApiBaseUrl && isDevLikeBaseUrl(directApiBaseUrl)) {
    pushUniqueString(
      mismatchWarnings,
      `EXPO_PUBLIC_API_BASE_URL still points to a development-like host in production: ${directApiBaseUrl}.`,
    );
  }

  if (currentEnvironment === 'production' && !configuredBaseUrl && directApiBaseUrl) {
    pushUniqueString(
      mismatchWarnings,
      'Production Owner AI routing stays pinned to the canonical IVX API host unless EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL or EXPO_PUBLIC_IVX_API_BASE_URL is set explicitly.',
    );
  }

  if (route53AuditUrl && appApiRoute53AuditUrl && route53AuditUrl !== appApiRoute53AuditUrl) {
    pushUniqueString(
      mismatchWarnings,
      `Route53 diagnostics differ by host: owner path ${route53AuditUrl} vs app API path ${appApiRoute53AuditUrl}.`,
    );
  }

  const audit: IVXOwnerAIConfigAudit = {
    currentEnvironment,
    configuredBaseUrl,
    configuredFrom,
    devFallbackBaseUrl: devFallbackBaseUrl || null,
    projectApiBaseUrl: projectApiBaseUrl || null,
    directApiBaseUrl: directApiBaseUrl || null,
    webPreviewBaseUrl: webPreviewBaseUrl || null,
    canonicalBaseUrl: IVX_CANONICAL_API_BASE_URL,
    activeBaseUrl,
    activeHost,
    directApiHost,
    activeEndpoint,
    explicitProductionPinApplied,
    candidateEndpoints,
    healthCheckUrl,
    route53AuditUrl,
    route53UpsertUrl,
    appApiHealthCheckUrl,
    appApiRoute53AuditUrl,
    routingPolicy,
    selectionReason,
    fallbackUsed,
    fallbackReason,
    productionReady,
    blocksRemoteRequests,
    configurationError,
    pointsToDevHost,
    workflowTrace,
    mismatchWarnings,
  };

  console.log('[IVXSupabaseClient] Owner AI config audit:', audit);

  return audit;
}

export function getIVXOwnerAICandidateEndpoints(): string[] {
  return getIVXOwnerAIConfigAudit().candidateEndpoints;
}

export function getIVXOwnerAIResolvedEndpoint(): string | null {
  return getIVXOwnerAIConfigAudit().activeEndpoint;
}

export function getIVXOwnerAIEndpoint(): string {
  const audit = getIVXOwnerAIConfigAudit();
  if (audit.activeEndpoint) {
    return audit.activeEndpoint;
  }

  throw new Error(audit.configurationError ?? 'Owner AI endpoint is not configured for this environment.');
}

type IVXAccessTokenOptions = {
  forceRefresh?: boolean;
};

async function refreshIVXSessionToken(reason: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    const refreshedToken = data.session?.access_token ?? null;
    if (refreshedToken) {
      console.log('[IVXSupabaseClient] Access token refreshed:', { reason });
      return refreshedToken;
    }
    if (error) {
      console.log('[IVXSupabaseClient] Access token refresh failed:', { reason, message: error.message });
    }
  } catch (error) {
    console.log('[IVXSupabaseClient] Access token refresh threw:', { reason, message: error instanceof Error ? error.message : 'unknown' });
  }
  return null;
}

export async function getIVXAccessToken(options: IVXAccessTokenOptions = {}): Promise<string | null> {
  const accessConfig = getIVXAccessControlConfig();
  const sessionResult = await supabase.auth.getSession();
  const session = sessionResult.data.session;
  const accessToken = session?.access_token ?? null;
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const isExpiringSoon = expiresAtMs > 0 && expiresAtMs - Date.now() < 120_000;

  if ((options.forceRefresh || isExpiringSoon) && session?.refresh_token) {
    const refreshedToken = await refreshIVXSessionToken(options.forceRefresh ? 'forced_retry_after_auth_rejection' : 'token_expiring_soon');
    if (refreshedToken) {
      return refreshedToken;
    }
  }

  if (accessToken) {
    console.log('[IVXSupabaseClient] Access token resolved: using hydrated Supabase session token', {
      securityMode: accessConfig.securityMode,
      ownerBypassEnabled: accessConfig.ownerBypassEnabled,
      expiringSoon: isExpiringSoon,
    });
    return accessToken;
  }

  const recoveredToken = await refreshIVXSessionToken('missing_session_recovery');
  if (recoveredToken) {
    return recoveredToken;
  }

  if (accessConfig.ownerBypassEnabled) {
    console.log('[IVXSupabaseClient] Access token resolved: no session token available, falling back to explicit test/open-access owner token');
    return IVX_OPEN_ACCESS_OWNER_TOKEN;
  }

  console.log('[IVXSupabaseClient] Access token resolved: missing', {
    securityMode: accessConfig.securityMode,
    openAccessEnabled: accessConfig.openAccessEnabled,
    devTestModeEnabled: accessConfig.devTestModeEnabled,
  });
  return null;
}

export async function getIVXOwnerAuthContext(): Promise<IVXOwnerAuthContext> {
  const accessConfig = getIVXAccessControlConfig();
  const sessionResult = await supabase.auth.getSession();
  const session = sessionResult.data.session;
  const user = session?.user ?? null;
  const accessToken = session?.access_token ?? null;

  if (!user || !accessToken) {
    if (accessConfig.ownerBypassEnabled) {
      const ownerEmail = getConfiguredOwnerAdminEmail() ?? 'owner@ivx.dev';
      console.log('[IVXSupabaseClient] Missing owner session in explicit test/open-access mode, using owner bypass context:', {
        email: ownerEmail,
        securityMode: accessConfig.securityMode,
      });
      return {
        userId: IVX_OPEN_ACCESS_OWNER_USER_ID,
        email: ownerEmail,
        role: 'owner',
        accessToken: IVX_OPEN_ACCESS_OWNER_TOKEN,
      };
    }

    console.log('[IVXSupabaseClient] Missing owner session', {
      securityMode: accessConfig.securityMode,
    });
    throw new Error('IVX client auth guard failed: no hydrated Supabase session is available yet.');
  }

  const profileResult = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  const roleAudit = resolveIVXRoleAudit(user, profileResult.data as Record<string, unknown> | null | undefined, profileResult.error?.message ?? null);

  console.log('[IVXSupabaseClient] Role resolution result:', {
    userId: user.id,
    email: user.email ?? null,
    securityMode: accessConfig.securityMode,
    roleAudit,
  });

  if (roleAudit.normalizedRole === 'investor') {
    if (accessConfig.ownerBypassEnabled) {
      console.log('[IVXSupabaseClient] Non-privileged session promoted by explicit test/open-access bypass:', {
        userId: user.id,
        email: user.email ?? null,
        roleAudit,
      });
      return {
        userId: user.id,
        email: user.email ?? getConfiguredOwnerAdminEmail() ?? 'owner@ivx.dev',
        role: 'owner',
        accessToken,
      };
    }

    console.log('[IVXSupabaseClient] Blocked non-privileged session:', {
      userId: user.id,
      email: user.email ?? null,
      roleAudit,
    });
    throw new Error('IVX client role guard failed: privileged IVX access is required.');
  }

  const ownerContext: IVXOwnerAuthContext = {
    userId: user.id,
    email: user.email ?? null,
    role: roleAudit.normalizedRole,
    accessToken,
  };

  console.log('[IVXSupabaseClient] Owner auth context ready:', {
    userId: ownerContext.userId,
    email: ownerContext.email,
    role: ownerContext.role,
    securityMode: accessConfig.securityMode,
    rawRole: roleAudit.rawRole,
  });

  return ownerContext;
}

export function createIVXServerSupabaseClient(): SupabaseClient {
  const supabaseUrl = readTrimmedEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readTrimmedEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server-side Supabase environment variables are missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
