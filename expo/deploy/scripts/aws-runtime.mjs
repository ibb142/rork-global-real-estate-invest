import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readTrimmedEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function parseEnvFile(filePath) {
  const parsed = {};
  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadEnvFile(filePath) {
  const parsed = parseEnvFile(filePath);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return parsed;
}

function maskValue(value, visibleStart = 4, visibleEnd = 4) {
  if (!value) {
    return null;
  }

  if (value.length <= visibleStart + visibleEnd) {
    return `${value.slice(0, 1)}***${value.slice(-1)}`;
  }

  return `${value.slice(0, visibleStart)}…${value.slice(-visibleEnd)}`;
}

function readBooleanLike(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ['1', 'true', 'yes', 'on', 'local'].includes(normalized);
}

function decodeJwtPayload(value) {
  const token = String(value ?? '').trim();
  const payloadSegment = token.split('.')[1] || '';
  if (!payloadSegment) {
    return null;
  }

  try {
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function projectRefFromUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return null;
  }

  try {
    return new URL(text).hostname.split('.')[0] || null;
  } catch {
    return text.replace(/^https?:\/\//i, '').split('.')[0] || null;
  }
}

function isRealServiceRoleKey(value, expectedProjectRef = null) {
  const payload = decodeJwtPayload(value);
  const role = typeof payload?.role === 'string' ? payload.role : null;
  const ref = typeof payload?.ref === 'string' ? payload.ref : null;
  return Boolean(value && (role === 'service_role' || role === 'supabase_admin') && (!expectedProjectRef || ref === expectedProjectRef));
}

function repairSupabaseServiceRoleFromLoadedFiles(envFileValues) {
  const expectedProjectRef = projectRefFromUrl(process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '');
  const anonKey = readTrimmedEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const currentServiceKey = readTrimmedEnv('SUPABASE_SERVICE_ROLE_KEY') || readTrimmedEnv('SUPABASE_SERVICE_KEY');
  const currentIsReal = isRealServiceRoleKey(currentServiceKey, expectedProjectRef) && currentServiceKey !== anonKey;
  if (currentIsReal) {
    return { applied: false, reason: 'active_service_role_already_valid' };
  }

  const candidates = envFileValues
    .flatMap((values) => [values.SUPABASE_SERVICE_ROLE_KEY, values.SUPABASE_SERVICE_KEY, values.IVX_HOSTED_SUPABASE_SERVICE_ROLE_KEY])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const validCandidate = candidates.find((value) => value !== anonKey && isRealServiceRoleKey(value, expectedProjectRef));
  if (!validCandidate) {
    return { applied: false, reason: 'no_valid_loaded_service_role_candidate' };
  }

  process.env.SUPABASE_SERVICE_ROLE_KEY = validCandidate;
  process.env.SUPABASE_SERVICE_KEY = validCandidate;
  return { applied: true, reason: 'repaired_from_loaded_env_file' };
}

function setEnvIfPresent(targetName, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return false;
  }
  process.env[targetName] = normalized;
  return true;
}

function applyAIGatewayAlias() {
  const directKey = readTrimmedEnv('AI_GATEWAY_API_KEY');
  if (directKey) {
    return { applied: false, source: 'AI_GATEWAY_API_KEY' };
  }

  return { applied: false, source: 'missing' };
}

function readTrimmedEnvValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function applyLocalSupabaseOverride() {
  if (!readBooleanLike(process.env.IVX_USE_LOCAL_SUPABASE)) {
    return {
      enabled: false,
      applied: [],
    };
  }

  const applied = [];
  const mappings = [
    ['EXPO_PUBLIC_SUPABASE_URL', process.env.IVX_LOCAL_SUPABASE_URL],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.IVX_LOCAL_SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.IVX_LOCAL_SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_SERVICE_KEY', process.env.IVX_LOCAL_SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_DB_URL', process.env.IVX_LOCAL_SUPABASE_DB_URL],
    ['DATABASE_URL', process.env.IVX_LOCAL_SUPABASE_DB_URL],
    ['SUPABASE_DB_PASSWORD', process.env.IVX_LOCAL_SUPABASE_DB_PASSWORD],
    ['JWT_SECRET', process.env.IVX_LOCAL_SUPABASE_JWT_SECRET],
    ['EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL', process.env.IVX_LOCAL_OWNER_AI_BASE_URL],
    ['EXPO_PUBLIC_API_BASE_URL', process.env.IVX_LOCAL_OWNER_AI_BASE_URL],
  ];

  for (const [targetName, value] of mappings) {
    if (setEnvIfPresent(targetName, value)) {
      applied.push(targetName);
    }
  }

  return {
    enabled: true,
    applied,
  };
}

export function loadProjectEnv(importMetaUrl) {
  const scriptDir = dirname(fileURLToPath(importMetaUrl));
  const candidatePaths = uniquePaths([
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.bak'),
    resolve(scriptDir, '.env.local'),
    resolve(scriptDir, '.env'),
    resolve(scriptDir, '.env.bak'),
    resolve(scriptDir, '../.env.local'),
    resolve(scriptDir, '../.env'),
    resolve(scriptDir, '../.env.bak'),
    resolve(scriptDir, '../../.env.local'),
    resolve(scriptDir, '../../.env'),
    resolve(scriptDir, '../../.env.bak'),
    resolve(scriptDir, '../../../.env.local'),
    resolve(scriptDir, '../../../.env'),
    resolve(scriptDir, '../../../.env.bak'),
  ]);
  const loadedEnvFiles = [];
  const loadedEnvFileValues = [];

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue;
    }

    try {
      const parsed = loadEnvFile(candidatePath);
      loadedEnvFiles.push(candidatePath);
      loadedEnvFileValues.push(parsed);
    } catch {
    }
  }

  const supabaseServiceRoleRepair = repairSupabaseServiceRoleFromLoadedFiles(loadedEnvFileValues);
  const aiGatewayAlias = applyAIGatewayAlias();
  const localSupabaseOverride = applyLocalSupabaseOverride();

  return {
    scriptDir,
    loadedEnvFiles,
    loadedEnvFilesRelative: loadedEnvFiles.map((filePath) => relative(process.cwd(), filePath) || filePath),
    localSupabaseOverride,
    supabaseServiceRoleRepair,
    aiGatewayAlias,
  };
}

export function getAwsCredentialDiagnostics(envLoadResult, regionOverride = '') {
  const accessKeyId = readTrimmedEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = readTrimmedEnv('AWS_SECRET_ACCESS_KEY');
  const sessionToken = readTrimmedEnv('AWS_SESSION_TOKEN');
  const region = regionOverride || readTrimmedEnv('AWS_REGION') || 'us-east-1';
  const missingEnvNames = [];

  if (!accessKeyId) {
    missingEnvNames.push('AWS_ACCESS_KEY_ID');
  }

  if (!secretAccessKey) {
    missingEnvNames.push('AWS_SECRET_ACCESS_KEY');
  }

  return {
    region,
    credentialSource: accessKeyId && secretAccessKey ? 'environment' : 'default_provider_chain',
    hasAccessKeyId: Boolean(accessKeyId),
    hasSecretAccessKey: Boolean(secretAccessKey),
    hasSessionToken: Boolean(sessionToken),
    accessKeyIdPreview: maskValue(accessKeyId),
    missingEnvNames,
    loadedEnvFiles: envLoadResult?.loadedEnvFilesRelative ?? [],
  };
}

export function createAwsRuntime(importMetaUrl, regionOverride = '') {
  const envLoadResult = loadProjectEnv(importMetaUrl);
  const diagnostics = getAwsCredentialDiagnostics(envLoadResult, regionOverride);
  const accessKeyId = readTrimmedEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = readTrimmedEnv('AWS_SECRET_ACCESS_KEY');
  const sessionToken = readTrimmedEnv('AWS_SESSION_TOKEN');
  const clientConfig = {
    region: diagnostics.region,
  };

  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  return {
    envLoadResult,
    diagnostics,
    clientConfig,
  };
}

export function formatAwsCredentialError(error, diagnostics) {
  const message = error instanceof Error ? error.message : String(error);
  const parts = [message];

  if (Array.isArray(diagnostics?.missingEnvNames) && diagnostics.missingEnvNames.length > 0) {
    parts.push(`missing ${diagnostics.missingEnvNames.join(', ')}`);
  }

  if (Array.isArray(diagnostics?.loadedEnvFiles) && diagnostics.loadedEnvFiles.length > 0) {
    parts.push(`loaded ${diagnostics.loadedEnvFiles.join(', ')}`);
  } else {
    parts.push('loaded no .env files');
  }

  if (diagnostics?.accessKeyIdPreview) {
    parts.push(`access key ${diagnostics.accessKeyIdPreview}`);
  }

  if (diagnostics?.hasSessionToken) {
    parts.push('AWS_SESSION_TOKEN present');
  }

  return parts.join(' | ');
}
