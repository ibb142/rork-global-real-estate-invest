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
type IVXOwnerAIRoutingPolicy = 'production_explicit' | 'production_blocked' | 'development_explicit' | 'development_fallback' | 'development_unconfigured';

export type IVXOwnerAIConfigAudit = {
  currentEnvironment: IVXOwnerAIRuntimeEnvironment;
  configuredBaseUrl: string | null;
  configuredFrom: 'EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL' | 'EXPO_PUBLIC_RORK_API_BASE_URL' | null;
  devFallbackBaseUrl: string | null;
  projectApiBaseUrl: string | null;
  webPreviewBaseUrl: string | null;
  canonicalBaseUrl: string;
  activeBaseUrl: string | null;
  explicitProductionPinApplied: boolean;
  activeEndpoint: string | null;
  candidateEndpoints: string[];
  routingPolicy: IVXOwnerAIRoutingPolicy;
  selectionReason: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  productionReady: boolean;
  blocksRemoteRequests: boolean;
  configurationError: string | null;
  pointsToDevHost: boolean;
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

  return `https://dev-${projectId}.rorktest.dev`;
}

function getConfiguredProjectApiBaseUrl(): string {
  return normalizeBaseUrl(readTrimmedEnv('EXPO_PUBLIC_RORK_API_BASE_URL'));
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
      configuredFrom: 'EXPO_PUBLIC_RORK_API_BASE_URL',
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

  return normalized.includes('rorktest.dev')
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
  const webPreviewBaseUrl = getWebPreviewBaseUrl();
  const candidateEndpoints: string[] = [];

  let activeBaseUrl: string | null = null;
  let routingPolicy: IVXOwnerAIRoutingPolicy = 'development_unconfigured';
  let selectionReason = 'Owner AI routing is not configured yet.';
  let fallbackUsed = false;
  let fallbackReason: string | null = null;
  let configurationError: string | null = null;
  let blocksRemoteRequests = false;

  if (currentEnvironment === 'production') {
    if (!envConfiguredBaseUrl) {
      routingPolicy = 'production_blocked';
      configurationError = 'Production build requires EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL or EXPO_PUBLIC_RORK_API_BASE_URL.';
      selectionReason = 'Remote Owner AI routing is blocked because production no longer allows implicit fallback routing without a public base URL.';
      blocksRemoteRequests = true;
    } else if (isDevLikeBaseUrl(envConfiguredBaseUrl)) {
      routingPolicy = 'production_blocked';
      activeBaseUrl = envConfiguredBaseUrl;
      configurationError = `Production build cannot target a development Owner AI host: ${envConfiguredBaseUrl}.`;
      selectionReason = 'Remote Owner AI routing is blocked because the configured production base URL points to a development-like host.';
      blocksRemoteRequests = true;
    } else {
      routingPolicy = 'production_explicit';
      activeBaseUrl = envConfiguredBaseUrl;
      selectionReason = 'Production Owner AI routing is explicitly pinned by EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL.';
    }
  } else if (envConfiguredBaseUrl) {
    routingPolicy = 'development_explicit';
    activeBaseUrl = envConfiguredBaseUrl;
    selectionReason = envConfiguredBaseUrl === IVX_CANONICAL_API_BASE_URL
      ? 'Development build is explicitly pinned to the canonical IVX API host.'
      : `Development build is explicitly pinned by ${configuredFrom ?? 'environment configuration'}.`;
  } else if (devFallbackBaseUrl) {
    routingPolicy = 'development_fallback';
    activeBaseUrl = devFallbackBaseUrl;
    fallbackUsed = true;
    fallbackReason = 'Development fallback derived from EXPO_PUBLIC_PROJECT_ID.';
    selectionReason = 'Development build is using the project-scoped fallback because no explicit owner AI base URL is configured.';
  } else {
    routingPolicy = 'development_unconfigured';
    configurationError = 'Development build has no explicit EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL, no EXPO_PUBLIC_RORK_API_BASE_URL, and no EXPO_PUBLIC_PROJECT_ID-derived fallback.';
    selectionReason = 'Remote Owner AI routing is unavailable because neither an explicit base URL nor a dev fallback is configured.';
    blocksRemoteRequests = true;
  }

  if (activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(activeBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  if (currentEnvironment === 'development' && webPreviewBaseUrl && webPreviewBaseUrl !== activeBaseUrl) {
    for (const candidateUrl of buildOwnerAIUrls(webPreviewBaseUrl)) {
      pushUniqueUrl(candidateEndpoints, candidateUrl);
    }
  }

  const activeEndpoint = candidateEndpoints[0] ?? null;
  const pointsToDevHost = activeBaseUrl ? isDevLikeBaseUrl(activeBaseUrl) : false;
  const productionReady = currentEnvironment === 'production'
    ? !!envConfiguredBaseUrl && !blocksRemoteRequests && !pointsToDevHost
    : true;

  const audit: IVXOwnerAIConfigAudit = {
    currentEnvironment,
    configuredBaseUrl,
    configuredFrom,
    devFallbackBaseUrl: devFallbackBaseUrl || null,
    projectApiBaseUrl: projectApiBaseUrl || null,
    webPreviewBaseUrl: webPreviewBaseUrl || null,
    canonicalBaseUrl: IVX_CANONICAL_API_BASE_URL,
    activeBaseUrl,
    activeEndpoint,
    explicitProductionPinApplied,
    candidateEndpoints,
    routingPolicy,
    selectionReason,
    fallbackUsed,
    fallbackReason,
    productionReady,
    blocksRemoteRequests,
    configurationError,
    pointsToDevHost,
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

export async function getIVXAccessToken(): Promise<string | null> {
  const accessConfig = getIVXAccessControlConfig();
  if (accessConfig.ownerBypassEnabled) {
    console.log('[IVXSupabaseClient] Access token resolved: forcing explicit test/open-access owner token');
    return IVX_OPEN_ACCESS_OWNER_TOKEN;
  }

  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token ?? null;
  if (accessToken) {
    console.log('[IVXSupabaseClient] Access token resolved: present');
    return accessToken;
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
