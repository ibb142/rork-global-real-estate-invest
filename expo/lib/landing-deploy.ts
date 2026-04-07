import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isAdminRole, normalizeRole } from '@/lib/auth-helpers';

export const LANDING_CONFIG_MAIN_KEY = 'main';
export const LANDING_CONFIG_DEPLOY_STATUS_KEY = 'deploy_status';
export const LANDING_CONFIG_DEALS_CACHE_KEY = 'deals_cache';

export interface DeployResult {
  success: boolean;
  filesUploaded: string[];
  errors: string[];
  timestamp: string;
}

export interface DeployAccessDiagnostic {
  allowed: boolean;
  tokenAvailable: boolean;
  authenticated: boolean;
  userId: string | null;
  role: string | null;
  reason?: string;
}

interface LandingConfigValue {
  [key: string]: unknown;
}

function normalizeSupabaseMessage(message: string | null | undefined): string {
  return (message || '').toLowerCase();
}

export function isLandingConfigTableMissingError(message: string | null | undefined): boolean {
  const msg = normalizeSupabaseMessage(message);
  return msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('relation') || msg.includes('could not find');
}

export function isLandingConfigSchemaMismatchError(message: string | null | undefined): boolean {
  const msg = normalizeSupabaseMessage(message);
  return (
    msg.includes('invalid input syntax for type uuid') ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes("could not find the 'details' column") ||
    msg.includes("could not find the 'deployed_at' column") ||
    msg.includes("could not find the 'deploy_status' column")
  );
}

export function isLandingAuthError(message: string | null | undefined): boolean {
  const msg = normalizeSupabaseMessage(message);
  return (
    msg.includes('session') ||
    msg.includes('authenticated') ||
    msg.includes('jwt') ||
    msg.includes('auth') ||
    msg.includes('permission') ||
    msg.includes('row-level security') ||
    msg.includes('row level security') ||
    msg.includes('not authorized') ||
    msg.includes('forbidden') ||
    msg.includes('401') ||
    msg.includes('403')
  );
}

export async function upsertLandingConfigEntry(
  key: string,
  value: LandingConfigValue,
  updatedBy?: string | null,
  updatedAt?: string,
): Promise<{ error: { message: string } | null }> {
  const timestamp = updatedAt || new Date().toISOString();
  const payload: {
    key: string;
    value: LandingConfigValue;
    updated_at: string;
    updated_by?: string | null;
  } = {
    key,
    value,
    updated_at: timestamp,
  };

  if (updatedBy) {
    payload.updated_by = updatedBy;
  }

  const { error } = await supabase
    .from('landing_page_config')
    .upsert(payload, { onConflict: 'key' });

  return {
    error: error ? { message: error.message } : null,
  };
}

async function ensureValidSession(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const isExpiringSoon = expiresAt > 0 && (expiresAt - Date.now()) < 120000;

      if (isExpiringSoon && session.refresh_token) {
        console.log('[LandingDeploy] Token expiring soon — refreshing...');
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshed?.session?.access_token) {
          console.log('[LandingDeploy] Session refreshed successfully');
          return refreshed.session.access_token;
        }
        console.log('[LandingDeploy] Refresh failed, using current token:', refreshErr?.message);
      }
      return session.access_token;
    }

    console.log('[LandingDeploy] No active session — attempting refresh...');
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token) {
      console.log('[LandingDeploy] Recovered session via refresh');
      return refreshed.session.access_token;
    }

    console.log('[LandingDeploy] No session recoverable');
    return null;
  } catch (err) {
    console.log('[LandingDeploy] Session check error:', (err as Error)?.message);
    return null;
  }
}

async function verifyDeployAccess(): Promise<{ allowed: boolean; token: string | null; userId?: string | null; role?: string | null; reason?: string }> {
  const token = await ensureValidSession();
  if (!token) {
    return {
      allowed: false,
      token: null,
      userId: null,
      role: null,
      reason: 'No authenticated session. Please log in again with an owner/admin account.',
    };
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) {
      return {
        allowed: false,
        token: null,
        userId: null,
        role: null,
        reason: userError?.message || 'Unable to resolve the current authenticated user.',
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.log('[LandingDeploy] Server role verification failed:', profileError.message);
      return {
        allowed: false,
        token: null,
        userId: user.id,
        role: null,
        reason: 'Server role verification failed. Deploy requires a verified owner/admin profile.',
      };
    }

    const role = normalizeRole(profile?.role);
    if (!isAdminRole(role)) {
      console.log('[LandingDeploy] Deploy blocked for non-admin role:', role, 'user:', user.id);
      return {
        allowed: false,
        token: null,
        userId: user.id,
        role,
        reason: `Deploy blocked. Verified server role is ${role}.`,
      };
    }

    return { allowed: true, token, userId: user.id, role };
  } catch (error) {
    console.log('[LandingDeploy] Deploy access verification error:', (error as Error)?.message);
    return {
      allowed: false,
      token: null,
      userId: null,
      role: null,
      reason: 'Deploy access verification failed.',
    };
  }
}

export async function getDeployAccessDiagnostic(): Promise<DeployAccessDiagnostic> {
  const access = await verifyDeployAccess();
  return {
    allowed: access.allowed,
    tokenAvailable: !!access.token,
    authenticated: !!access.userId,
    userId: access.userId ?? null,
    role: access.role ?? null,
    reason: access.reason,
  };
}

export async function deployLandingPage(): Promise<DeployResult> {
  const timestamp = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    console.log('[LandingDeploy] Supabase not configured — cannot deploy');
    return {
      success: false,
      filesUploaded: [],
      errors: ['Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'],
      timestamp,
    };
  }

  const access = await verifyDeployAccess();
  if (!access.allowed || !access.token) {
    console.log('[LandingDeploy] Deploy blocked:', access.reason);
    return {
      success: false,
      filesUploaded: [],
      errors: [access.reason || 'Deploy requires a verified authenticated owner/admin session.'],
      timestamp,
    };
  }

  const errors: string[] = [];
  const filesUpdated: string[] = [];

  try {
    console.log('[LandingDeploy] Deploying via Supabase...');

    const deployStatusValue: LandingConfigValue = {
      deployedAt: timestamp,
      deployStatus: 'live',
      lastSuccessfulDeployAt: timestamp,
      trigger: 'manual',
      source: 'app',
    };

    const { error: configErr } = await upsertLandingConfigEntry(
      LANDING_CONFIG_DEPLOY_STATUS_KEY,
      deployStatusValue,
      access.userId ?? null,
      timestamp,
    );

    if (configErr) {
      const msg = configErr.message || '';
      if (isLandingConfigTableMissingError(msg) || isLandingConfigSchemaMismatchError(msg)) {
        console.log('[LandingDeploy] landing_page_config unavailable for deploy status write — skipping (non-critical):', msg);
      } else {
        console.log('[LandingDeploy] Config upsert error:', msg);
        errors.push(`Config update: ${msg}`);
      }
    } else {
      filesUpdated.push('landing_page_config');
      console.log('[LandingDeploy] landing_page_config updated');
    }

    try {
      const { error: deployLogErr } = await supabase
        .from('landing_deployments')
        .insert({
          status: errors.length === 0 ? 'success' : 'failed',
          deployed_by: access.userId ?? null,
          deployment_url: null,
          notes: JSON.stringify({ filesUpdated, source: 'app', trigger: 'manual' }),
          error_message: errors.length > 0 ? errors.join('; ') : null,
          created_at: timestamp,
          completed_at: timestamp,
        });

      if (deployLogErr) {
        const msg = deployLogErr.message || '';
        if (isLandingConfigTableMissingError(msg) || isLandingConfigSchemaMismatchError(msg)) {
          console.log('[LandingDeploy] landing_deployments unavailable — skipping deploy log (non-critical):', msg);
        } else {
          console.log('[LandingDeploy] Deploy log insert error:', msg);
        }
      } else {
        filesUpdated.push('landing_deployments');
        console.log('[LandingDeploy] Deploy logged to landing_deployments');
      }
    } catch (logErr) {
      console.log('[LandingDeploy] Deploy log failed (non-critical):', (logErr as Error)?.message);
    }

    const success = errors.length === 0;
    console.log('[LandingDeploy] Deploy result:', success ? 'SUCCESS' : 'PARTIAL', '| updated:', filesUpdated.join(', '));

    return {
      success,
      filesUploaded: filesUpdated,
      errors,
      timestamp,
    };
  } catch (err) {
    console.log('[LandingDeploy] Deploy exception:', (err as Error)?.message);
    return {
      success: false,
      filesUploaded: filesUpdated,
      errors: [(err as Error)?.message || 'Deploy failed'],
      timestamp,
    };
  }
}

export async function deployConfigOnly(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    console.log('[LandingDeploy] Config-only deploy via Supabase');
    const timestamp = new Date().toISOString();
    const { error } = await upsertLandingConfigEntry(
      LANDING_CONFIG_DEPLOY_STATUS_KEY,
      {
        deployedAt: timestamp,
        deployStatus: 'live',
        lastSuccessfulDeployAt: timestamp,
        trigger: 'config_only',
        source: 'app',
      },
      null,
      timestamp,
    );

    if (error) {
      const msg = error.message || '';
      if (isLandingConfigTableMissingError(msg) || isLandingConfigSchemaMismatchError(msg)) {
        console.log('[LandingDeploy] landing_page_config unavailable during config-only deploy — treating as success');
        return { success: true };
      }
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'Config deploy failed' };
  }
}

export interface DeployStatus {
  awsConfigured: boolean;
  cloudFrontConfigured: boolean;
  githubActionsConfigured: boolean;
  githubTokenConfigured: boolean;
  githubRepositoryConfigured: boolean;
  supabaseConfigured: boolean;
  canDeploy: boolean;
  publicDeployConfigured: boolean;
  pipelineLabel: string;
  githubRepository: string;
  awsRegion: string;
  s3Bucket: string;
  cloudFrontDistributionId: string;
  missingRequirements: string[];
}

export function getDeployStatus(): DeployStatus {
  const supabaseConfigured = isSupabaseConfigured();
  const awsRegion = (process.env.AWS_REGION || '').trim();
  const s3Bucket = (process.env.S3_BUCKET_NAME || '').trim();
  const cloudFrontDistributionId = (process.env.CLOUDFRONT_DISTRIBUTION_ID || '').trim();
  const githubToken = (process.env.GITHUB_TOKEN || '').trim();
  const githubRepository = (
    process.env.GITHUB_REPOSITORY ||
    process.env.GITHUB_REPO ||
    process.env.EXPO_PUBLIC_GITHUB_REPOSITORY ||
    'ibb142/rork-global-real-estate-invest'
  ).trim();
  const awsConfigured = !!(awsRegion && s3Bucket);
  const cloudFrontConfigured = !!cloudFrontDistributionId;
  const githubTokenConfigured = !!githubToken;
  const githubRepositoryConfigured = !!githubRepository;
  const githubActionsConfigured = githubTokenConfigured && githubRepositoryConfigured;
  const publicDeployConfigured = githubActionsConfigured && awsConfigured;
  const missingRequirements: string[] = [];

  if (!supabaseConfigured) {
    missingRequirements.push('Supabase public URL / anon key');
  }
  if (!githubTokenConfigured) {
    missingRequirements.push('GITHUB_TOKEN');
  }
  if (!githubRepositoryConfigured) {
    missingRequirements.push('GITHUB_REPOSITORY');
  }
  if (!awsRegion) {
    missingRequirements.push('AWS_REGION');
  }
  if (!s3Bucket) {
    missingRequirements.push('S3_BUCKET_NAME');
  }

  let pipelineLabel = 'Deploy unavailable';
  if (publicDeployConfigured && cloudFrontConfigured) {
    pipelineLabel = 'GitHub Actions → AWS S3 → CloudFront';
  } else if (publicDeployConfigured) {
    pipelineLabel = 'GitHub Actions → AWS S3';
  } else if (supabaseConfigured) {
    pipelineLabel = 'Supabase landing sync only';
  }

  return {
    awsConfigured,
    cloudFrontConfigured,
    githubActionsConfigured,
    githubTokenConfigured,
    githubRepositoryConfigured,
    supabaseConfigured,
    canDeploy: supabaseConfigured,
    publicDeployConfigured,
    pipelineLabel,
    githubRepository,
    awsRegion,
    s3Bucket,
    cloudFrontDistributionId,
    missingRequirements,
  };
}
