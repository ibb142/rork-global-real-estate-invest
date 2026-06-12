import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

export function readTrimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeJsonParse(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const SENSITIVE_REPORT_KEY_PATTERN = /password|accessToken|access_token|refreshToken|refresh_token|idToken|id_token|authorization|apiKey|api_key|anonKey|serviceRoleKey|service_role_key|secret|jwt/i;
const SENSITIVE_TEXT_VALUE_PATTERN = /access_token|refresh_token|id_token|Authorization|Bearer\s+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i;
const JWT_TEXT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g;
const BEARER_TEXT_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;

export function redactSensitiveValue(value, key = '') {
  if (SENSITIVE_REPORT_KEY_PATTERN.test(key)) {
    return value ? '[redacted]' : value;
  }

  if (typeof value === 'string') {
    if (key === 'text' && SENSITIVE_TEXT_VALUE_PATTERN.test(value)) {
      return '[redacted]';
    }

    return value
      .replace(JWT_TEXT_PATTERN, '[redacted-jwt]')
      .replace(BEARER_TEXT_PATTERN, 'Bearer [redacted]');
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactSensitiveValue(entryValue, entryKey),
    ]));
  }

  return value;
}

export function sanitizeOwnerSessionForReport(ownerSession) {
  return redactSensitiveValue(ownerSession);
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function requestJson(url, options = {}, timeoutMs = 15000) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      text,
      json: safeJsonParse(text),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      text: null,
      json: null,
      error: error instanceof Error ? error.message : 'request failed',
    };
  }
}

function buildSupabaseAnonHeaders(anonKey, accessToken = '') {
  const trimmedAnonKey = readTrimmed(anonKey);
  const trimmedAccessToken = readTrimmed(accessToken);
  return {
    'Content-Type': 'application/json',
    apikey: trimmedAnonKey,
    Authorization: `Bearer ${trimmedAccessToken || trimmedAnonKey}`,
  };
}

function getOwnerProofEmailDomain() {
  return readTrimmed(process.env.IVX_OWNER_PROOF_EMAIL_DOMAIN) || 'gmail.com';
}

function getStableOwnerProofSeed() {
  const explicitProjectId = readTrimmed(process.env.EXPO_PUBLIC_PROJECT_ID).toLowerCase();
  if (explicitProjectId) {
    return explicitProjectId;
  }

  const supabaseUrl = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL).toLowerCase();
  if (!supabaseUrl) {
    return 'default';
  }

  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    return hostname.split('.')[0] || 'default';
  } catch {
    return 'default';
  }
}

function buildStableOwnerIdentity(label = 'ivx-owner-proof') {
  const domain = getOwnerProofEmailDomain();
  const normalizedLabel = readTrimmed(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ivx-owner-proof';
  const stableSeed = getStableOwnerProofSeed().replace(/[^a-z0-9]+/g, '-') || 'default';
  const localPart = `${normalizedLabel}-${stableSeed}`.slice(0, 54).replace(/-+$/g, '') || 'ivx-owner-proof';
  return {
    email: `${localPart}@${domain}`,
    password: `OwnerProof!${stableSeed.slice(0, 12) || 'Stable'}Aa`,
    firstName: 'IVX',
    lastName: 'Owner',
    mode: 'generated_service_role_bootstrap',
  };
}

function buildGeneratedOwnerIdentity(label = 'ivx-owner-proof') {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const domain = getOwnerProofEmailDomain();
  return {
    email: `${label}-${timestamp}-${suffix}@${domain}`,
    password: `OwnerProof!${timestamp}Aa`,
    firstName: 'IVX',
    lastName: 'Owner',
    mode: 'generated_signup',
  };
}

function decodeJwtRole(token) {
  const normalized = readTrimmed(token);
  const payloadSegment = normalized.split('.')[1] ?? '';
  if (!payloadSegment) {
    return null;
  }

  try {
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function getServiceRoleKey() {
  return readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_KEY);
}

function hasRealServiceRole(supabaseUrl, anonKey) {
  const serviceRoleKey = getServiceRoleKey();
  const role = decodeJwtRole(serviceRoleKey);
  return Boolean(readTrimmed(supabaseUrl) && serviceRoleKey && serviceRoleKey !== readTrimmed(anonKey) && (role === 'service_role' || role === 'supabase_admin'));
}

function createServiceRoleClient(supabaseUrl) {
  const normalizedSupabaseUrl = readTrimmed(supabaseUrl);
  const serviceRoleKey = getServiceRoleKey();
  if (!normalizedSupabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(normalizedSupabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function listAuthUsersByEmail(params) {
  const serviceClient = createServiceRoleClient(params.supabaseUrl);
  if (!serviceClient) {
    return {
      ok: false,
      users: [],
      error: 'Real service-role Supabase client is unavailable.',
    };
  }

  const listUsersResult = await serviceClient.auth.admin.listUsers();
  if (listUsersResult.error) {
    return {
      ok: false,
      users: [],
      error: listUsersResult.error.message,
    };
  }

  const users = Array.isArray(listUsersResult.data?.users)
    ? listUsersResult.data.users.filter((user) => readTrimmed(user?.email).toLowerCase() === readTrimmed(params.email).toLowerCase())
    : [];

  return {
    ok: true,
    users,
    error: null,
  };
}

async function ensureOwnerUserViaServiceRole(params) {
  const serviceClient = createServiceRoleClient(params.supabaseUrl);
  if (!serviceClient) {
    return {
      ok: false,
      action: 'skipped',
      error: 'Real service-role Supabase client is unavailable.',
    };
  }

  const normalizedEmail = readTrimmed(params.email).toLowerCase();
  const password = readTrimmed(params.password);
  const firstName = readTrimmed(params.firstName) || 'IVX';
  const lastName = readTrimmed(params.lastName) || 'Owner';
  const metadata = {
    firstName,
    lastName,
    role: 'owner',
    kycStatus: 'approved',
  };

  const existingUsersResult = await listAuthUsersByEmail({
    supabaseUrl: params.supabaseUrl,
    email: normalizedEmail,
  });
  if (!existingUsersResult.ok) {
    return {
      ok: false,
      action: 'lookup_failed',
      error: existingUsersResult.error,
    };
  }

  const existingUser = existingUsersResult.users[0] ?? null;
  if (existingUser) {
    const updateResult = await serviceClient.auth.admin.updateUserById(existingUser.id, {
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata ?? {}),
        ...metadata,
      },
      app_metadata: {
        ...(existingUser.app_metadata ?? {}),
        role: 'owner',
      },
    });

    return {
      ok: !updateResult.error,
      action: 'updated_existing_user',
      userId: existingUser.id,
      error: updateResult.error?.message ?? null,
      data: updateResult.data ?? null,
    };
  }

  const createResult = await serviceClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: {
      role: 'owner',
    },
  });

  return {
    ok: !createResult.error,
    action: 'created_user',
    userId: createResult.data?.user?.id ?? null,
    error: createResult.error?.message ?? null,
    data: createResult.data ?? null,
  };
}

async function upsertOwnerProfileAsServiceRole(params) {
  const serviceClient = createServiceRoleClient(params.supabaseUrl);
  if (!serviceClient) {
    return {
      ok: false,
      status: 0,
      error: 'Real service-role Supabase client is unavailable.',
      data: null,
    };
  }

  const upsertResult = await serviceClient
    .from('profiles')
    .upsert([{
      id: readTrimmed(params.userId),
      email: readTrimmed(params.email).toLowerCase(),
      first_name: readTrimmed(params.firstName) || 'IVX',
      last_name: readTrimmed(params.lastName) || 'Owner',
      role: 'owner',
      kyc_status: 'approved',
      updated_at: nowIso(),
    }], {
      onConflict: 'id',
    })
    .select('*');

  return {
    ok: !upsertResult.error,
    status: upsertResult.error ? 400 : 200,
    error: upsertResult.error?.message ?? null,
    data: upsertResult.data ?? null,
  };
}

export async function signInOwnerSession(params) {
  const supabaseUrl = readTrimmed(params.supabaseUrl);
  const anonKey = readTrimmed(params.anonKey);
  const email = readTrimmed(params.email).toLowerCase();
  const password = readTrimmed(params.password);
  const timeoutMs = Number.isFinite(params.timeoutMs) ? params.timeoutMs : 15000;

  const signInResult = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: buildSupabaseAnonHeaders(anonKey),
    body: JSON.stringify({
      email,
      password,
    }),
  }, timeoutMs);

  const accessToken = typeof signInResult.json?.access_token === 'string' ? signInResult.json.access_token : '';
  const user = signInResult.json?.user && typeof signInResult.json.user === 'object' ? signInResult.json.user : null;
  const userId = typeof user?.id === 'string' ? user.id : null;

  return {
    ...signInResult,
    accessToken: accessToken || null,
    userId,
  };
}

export async function signUpOwnerSession(params) {
  const supabaseUrl = readTrimmed(params.supabaseUrl);
  const anonKey = readTrimmed(params.anonKey);
  const email = readTrimmed(params.email).toLowerCase();
  const password = readTrimmed(params.password);
  const firstName = readTrimmed(params.firstName) || 'IVX';
  const lastName = readTrimmed(params.lastName) || 'Owner';
  const timeoutMs = Number.isFinite(params.timeoutMs) ? params.timeoutMs : 15000;

  const signUpResult = await requestJson(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: buildSupabaseAnonHeaders(anonKey),
    body: JSON.stringify({
      email,
      password,
      options: {
        data: {
          firstName,
          lastName,
          role: 'owner',
          kycStatus: 'approved',
        },
      },
    }),
  }, timeoutMs);

  const accessToken = typeof signUpResult.json?.session?.access_token === 'string'
    ? signUpResult.json.session.access_token
    : typeof signUpResult.json?.access_token === 'string'
      ? signUpResult.json.access_token
      : '';
  const user = signUpResult.json?.user && typeof signUpResult.json.user === 'object' ? signUpResult.json.user : null;
  const userId = typeof user?.id === 'string' ? user.id : null;

  return {
    ...signUpResult,
    accessToken: accessToken || null,
    userId,
  };
}

export async function upsertOwnerProfile(params) {
  const supabaseUrl = readTrimmed(params.supabaseUrl);
  const anonKey = readTrimmed(params.anonKey);
  const accessToken = readTrimmed(params.accessToken);
  const userId = readTrimmed(params.userId);
  const email = readTrimmed(params.email).toLowerCase();
  const firstName = readTrimmed(params.firstName) || 'IVX';
  const lastName = readTrimmed(params.lastName) || 'Owner';
  const timeoutMs = Number.isFinite(params.timeoutMs) ? params.timeoutMs : 15000;

  return await requestJson(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      ...buildSupabaseAnonHeaders(anonKey, accessToken),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([{
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'owner',
      kyc_status: 'approved',
      updated_at: nowIso(),
    }]),
  }, timeoutMs);
}

export async function querySupabaseRestAsOwner(params) {
  const supabaseUrl = readTrimmed(params.supabaseUrl);
  const anonKey = readTrimmed(params.anonKey);
  const accessToken = readTrimmed(params.accessToken);
  const timeoutMs = Number.isFinite(params.timeoutMs) ? params.timeoutMs : 15000;

  return await requestJson(`${supabaseUrl}${params.path}`, {
    method: params.method ?? 'GET',
    headers: {
      ...buildSupabaseAnonHeaders(anonKey, accessToken),
      Accept: 'application/json',
      ...(params.headers ?? {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  }, timeoutMs);
}

export async function querySupabaseRestAsServiceRole(params) {
  const supabaseUrl = readTrimmed(params.supabaseUrl);
  const serviceRoleKey = readTrimmed(params.serviceRoleKey);
  const timeoutMs = Number.isFinite(params.timeoutMs) ? params.timeoutMs : 15000;

  return await requestJson(`${supabaseUrl}${params.path}`, {
    method: params.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(params.headers ?? {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  }, timeoutMs);
}

function readDollarQuoteTag(sql, index) {
  const rest = sql.slice(index);
  const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
  return match?.[0] ?? null;
}

export function splitSupabaseSqlStatements(sql) {
  const statements = [];
  let current = '';
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag = null;

  while (index < sql.length) {
    const char = sql[index] ?? '';
    const nextChar = sql[index + 1] ?? '';

    if (inLineComment) {
      current += char;
      index += 1;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        current += '*/';
        index += 2;
        inBlockComment = false;
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length;
        dollarQuoteTag = null;
        continue;
      }

      current += char;
      index += 1;
      continue;
    }

    if (inSingleQuote) {
      current += char;
      index += 1;

      if (char === "'" && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }

      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += char;
      index += 1;
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === '-' && nextChar === '-') {
      current += '--';
      index += 2;
      inLineComment = true;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      current += '/*';
      index += 2;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      current += char;
      index += 1;
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      current += char;
      index += 1;
      inDoubleQuote = true;
      continue;
    }

    if (char === '$') {
      const nextDollarQuoteTag = readDollarQuoteTag(sql, index);
      if (nextDollarQuoteTag) {
        current += nextDollarQuoteTag;
        index += nextDollarQuoteTag.length;
        dollarQuoteTag = nextDollarQuoteTag;
        continue;
      }
    }

    if (char === ';') {
      const trimmedStatement = current.trim();
      if (trimmedStatement.length > 0) {
        statements.push(trimmedStatement);
      }
      current = '';
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }

  const finalStatement = current.trim();
  if (finalStatement.length > 0) {
    statements.push(finalStatement);
  }

  return statements;
}

async function executeSupabaseSqlStatements(params) {
  const statements = splitSupabaseSqlStatements(params.sql);
  const steps = [];

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index] ?? '';
    const stepResult = await params.requestStep(statement);

    steps.push({
      step: index + 1,
      totalSteps: statements.length,
      ok: stepResult.ok,
      status: stepResult.status,
      durationMs: stepResult.durationMs,
      error: stepResult.error ?? (!stepResult.ok ? stepResult.text : null),
      statementPreview: statement.slice(0, 160),
    });

    if (!stepResult.ok) {
      const detail = stepResult.error ?? stepResult.text ?? `HTTP ${stepResult.status}`;
      throw new Error(`Owner SQL step ${index + 1}/${statements.length} failed: ${detail}`);
    }
  }

  return {
    ok: true,
    totalSteps: statements.length,
    steps,
  };
}

export async function executeSupabaseSqlScriptAsOwner(params) {
  const sql = 'sql' in params && typeof params.sql === 'string'
    ? params.sql
    : await readFile(params.filePath, 'utf8');

  return await executeSupabaseSqlStatements({
    sql,
    requestStep: async (statement) => await querySupabaseRestAsOwner({
      supabaseUrl: params.supabaseUrl,
      anonKey: params.anonKey,
      accessToken: params.accessToken,
      timeoutMs: params.timeoutMs,
      path: '/rest/v1/rpc/ivx_exec_sql',
      method: 'POST',
      body: {
        sql_text: statement,
      },
    }),
  });
}

export async function executeSupabaseSqlScriptAsServiceRole(params) {
  const sql = 'sql' in params && typeof params.sql === 'string'
    ? params.sql
    : await readFile(params.filePath, 'utf8');

  return await executeSupabaseSqlStatements({
    sql,
    requestStep: async (statement) => await querySupabaseRestAsServiceRole({
      supabaseUrl: params.supabaseUrl,
      serviceRoleKey: params.serviceRoleKey,
      timeoutMs: params.timeoutMs,
      path: '/rest/v1/rpc/ivx_exec_sql',
      method: 'POST',
      body: {
        sql_text: statement,
      },
    }),
  });
}

export async function ensureOwnerSession(params) {
  const supabaseUrl = readTrimmed(params.supabaseUrl);
  const anonKey = readTrimmed(params.anonKey);
  const timeoutMs = Number.isFinite(params.timeoutMs) ? params.timeoutMs : 15000;
  const explicitEmail = readTrimmed(params.email).toLowerCase();
  const explicitPassword = readTrimmed(params.password);
  const explicitFirstName = readTrimmed(params.firstName) || 'IVX';
  const explicitLastName = readTrimmed(params.lastName) || 'Owner';
  const generatedIdentity = (!explicitEmail || !explicitPassword)
    ? buildStableOwnerIdentity(params.label)
    : null;
  const identity = {
    email: explicitEmail || generatedIdentity?.email || '',
    password: explicitPassword || generatedIdentity?.password || '',
    firstName: explicitFirstName || generatedIdentity?.firstName || 'IVX',
    lastName: explicitLastName || generatedIdentity?.lastName || 'Owner',
    mode: generatedIdentity ? generatedIdentity.mode : 'configured_credentials',
  };

  const signInFirst = explicitEmail && explicitPassword;
  const attemptLog = [];
  let sessionResult = null;

  if (signInFirst) {
    const existingSignIn = await signInOwnerSession({
      supabaseUrl,
      anonKey,
      email: identity.email,
      password: identity.password,
      timeoutMs,
    });
    attemptLog.push({ phase: 'sign_in_first', ...existingSignIn, text: existingSignIn.text?.slice(0, 300) ?? null });
    if (existingSignIn.ok && existingSignIn.accessToken && existingSignIn.userId) {
      sessionResult = { source: 'sign_in', ...existingSignIn };
    }
  }

  if (!sessionResult && hasRealServiceRole(supabaseUrl, anonKey)) {
    const serviceRoleBootstrap = await ensureOwnerUserViaServiceRole({
      supabaseUrl,
      email: identity.email,
      password: identity.password,
      firstName: identity.firstName,
      lastName: identity.lastName,
    });
    attemptLog.push({
      phase: 'service_role_bootstrap',
      ok: serviceRoleBootstrap.ok,
      status: serviceRoleBootstrap.ok ? 200 : 400,
      durationMs: 0,
      text: serviceRoleBootstrap.error ?? serviceRoleBootstrap.action ?? null,
      json: serviceRoleBootstrap.data ?? null,
      error: serviceRoleBootstrap.error ?? null,
      accessToken: null,
      userId: serviceRoleBootstrap.userId ?? null,
    });
  }

  if (!sessionResult && !hasRealServiceRole(supabaseUrl, anonKey)) {
    const signUp = await signUpOwnerSession({
      supabaseUrl,
      anonKey,
      email: identity.email,
      password: identity.password,
      firstName: identity.firstName,
      lastName: identity.lastName,
      timeoutMs,
    });
    attemptLog.push({ phase: 'sign_up', ...signUp, text: signUp.text?.slice(0, 300) ?? null });
    if (signUp.ok && signUp.accessToken && signUp.userId) {
      sessionResult = { source: 'sign_up', ...signUp };
    }
  }

  if (!sessionResult) {
    const signIn = await signInOwnerSession({
      supabaseUrl,
      anonKey,
      email: identity.email,
      password: identity.password,
      timeoutMs,
    });
    attemptLog.push({ phase: hasRealServiceRole(supabaseUrl, anonKey) ? 'sign_in_after_service_bootstrap' : 'sign_in_after_signup', ...signIn, text: signIn.text?.slice(0, 300) ?? null });
    if (signIn.ok && signIn.accessToken && signIn.userId) {
      sessionResult = { source: hasRealServiceRole(supabaseUrl, anonKey) ? 'sign_in_after_service_bootstrap' : 'sign_in_after_signup', ...signIn };
    }
  }

  if (!sessionResult || !sessionResult.accessToken || !sessionResult.userId) {
    return {
      ok: false,
      identity,
      attempts: attemptLog,
      accessToken: null,
      userId: null,
      profileUpsert: null,
      profileReadback: null,
      error: 'Unable to obtain an authenticated owner session.',
    };
  }

  let profileUpsert = await upsertOwnerProfile({
    supabaseUrl,
    anonKey,
    accessToken: sessionResult.accessToken,
    userId: sessionResult.userId,
    email: identity.email,
    firstName: identity.firstName,
    lastName: identity.lastName,
    timeoutMs,
  });

  if (!profileUpsert.ok && hasRealServiceRole(supabaseUrl, anonKey)) {
    const serviceRoleProfileUpsert = await upsertOwnerProfileAsServiceRole({
      supabaseUrl,
      userId: sessionResult.userId,
      email: identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
    });
    attemptLog.push({
      phase: 'service_role_profile_upsert',
      ok: serviceRoleProfileUpsert.ok,
      status: serviceRoleProfileUpsert.status,
      durationMs: 0,
      text: serviceRoleProfileUpsert.error ?? null,
      json: serviceRoleProfileUpsert.data,
      error: serviceRoleProfileUpsert.error,
      accessToken: null,
      userId: sessionResult.userId,
    });
    if (serviceRoleProfileUpsert.ok) {
      profileUpsert = {
        ok: true,
        status: serviceRoleProfileUpsert.status,
        durationMs: 0,
        text: null,
        json: serviceRoleProfileUpsert.data,
        error: null,
      };
    }
  }

  const profileReadback = await querySupabaseRestAsOwner({
    supabaseUrl,
    anonKey,
    accessToken: sessionResult.accessToken,
    timeoutMs,
    path: `/rest/v1/profiles?select=id,email,role&id=eq.${encodeURIComponent(sessionResult.userId)}&limit=1`,
  });

  return {
    ok: true,
    identity,
    attempts: attemptLog,
    accessToken: sessionResult.accessToken,
    userId: sessionResult.userId,
    profileUpsert: {
      ok: profileUpsert.ok,
      status: profileUpsert.status,
      error: profileUpsert.error ?? (!profileUpsert.ok ? profileUpsert.text : null),
      data: profileUpsert.json,
    },
    profileReadback: {
      ok: profileReadback.ok,
      status: profileReadback.status,
      error: profileReadback.error ?? (!profileReadback.ok ? profileReadback.text : null),
      data: profileReadback.json,
    },
    error: null,
  };
}
