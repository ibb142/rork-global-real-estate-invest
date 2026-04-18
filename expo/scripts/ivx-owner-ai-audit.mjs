import { createClient } from '@supabase/supabase-js';

const ROOM_ID = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
const ROOM_SLUG = 'ivx-owner-room';
const API_PATH = '/api/ivx/owner-ai';
const LEGACY_API_PATH = '/ivx/owner-ai';
const CANONICAL_API_BASE_URL = 'https://api.ivxholding.com';
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.IVX_OWNER_AI_AUDIT_TIMEOUT_MS || '20000', 10);
const AUDIT_MARKER = `ivx-owner-ai-audit-${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;

function readEnv(name) {
  return String(process.env[name] || '').trim();
}

function sanitizeUrl(url) {
  return url.trim().replace(/\/$/, '');
}

function getDefaultProjectApiBaseUrl() {
  const projectId = readEnv('EXPO_PUBLIC_PROJECT_ID');
  if (!projectId) {
    return '';
  }
  return `https://dev-${projectId}.rorktest.dev`;
}

function buildCandidateEndpoints() {
  const configuredBaseUrl = sanitizeUrl(readEnv('EXPO_PUBLIC_RORK_API_BASE_URL'));
  const projectBaseUrl = sanitizeUrl(getDefaultProjectApiBaseUrl());
  const candidates = [];

  const pushPair = (baseUrl) => {
    if (!baseUrl) return;
    const primary = `${baseUrl}${API_PATH}`;
    const legacy = `${baseUrl}${LEGACY_API_PATH}`;
    if (!candidates.includes(primary)) candidates.push(primary);
    if (!candidates.includes(legacy)) candidates.push(legacy);
  };

  pushPair(configuredBaseUrl);
  pushPair(projectBaseUrl);
  pushPair(CANONICAL_API_BASE_URL);

  return {
    configuredBaseUrl: configuredBaseUrl || null,
    projectBaseUrl: projectBaseUrl || null,
    canonicalBaseUrl: CANONICAL_API_BASE_URL,
    candidates,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    ok: response.ok,
    headers: {
      contentType: response.headers.get('content-type'),
      accessControlAllowOrigin: response.headers.get('access-control-allow-origin'),
    },
    bodyTextPreview: text.slice(0, 500),
    bodyJson: json,
  };
}

async function inspectEndpoint(url) {
  const result = { url };
  try {
    const optionsResponse = await fetchWithTimeout(url, { method: 'OPTIONS' });
    result.options = await readResponse(optionsResponse);
  } catch (error) {
    result.options = { error: error instanceof Error ? error.message : 'OPTIONS failed' };
  }

  try {
    const postResponse = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'health_probe', mode: 'chat' }),
    });
    result.unauthorizedPost = await readResponse(postResponse);
  } catch (error) {
    result.unauthorizedPost = { error: error instanceof Error ? error.message : 'POST failed' };
  }

  return result;
}

function getSupabaseConfig() {
  return {
    url: sanitizeUrl(readEnv('EXPO_PUBLIC_SUPABASE_URL')),
    anonKey: readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

function requireSupabaseConfig(config) {
  if (!config.url || !config.anonKey || !config.serviceRoleKey) {
    throw new Error('Missing Supabase envs: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  }
}

function createAdminClient(config) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createAnonClient(config) {
  return createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function ensureOwnerUser(adminClient, probeEmail, probePassword) {
  const createResult = await adminClient.auth.admin.createUser({
    email: probeEmail,
    password: probePassword,
    email_confirm: true,
    user_metadata: { source: 'ivx-owner-ai-audit', marker: AUDIT_MARKER },
  });

  if (createResult.error || !createResult.data.user) {
    throw new Error(createResult.error?.message || 'Failed to create probe user');
  }

  const user = createResult.data.user;
  const profileResult = await adminClient.from('profiles').upsert({
    id: user.id,
    email: probeEmail,
    role: 'owner',
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'id',
  });

  if (profileResult.error) {
    throw new Error(`Failed to upsert owner profile: ${profileResult.error.message}`);
  }

  return user;
}

async function signInProbeUser(anonClient, probeEmail, probePassword) {
  const signInResult = await anonClient.auth.signInWithPassword({
    email: probeEmail,
    password: probePassword,
  });

  if (signInResult.error || !signInResult.data.session) {
    throw new Error(signInResult.error?.message || 'Failed to sign in probe user');
  }

  return signInResult.data.session;
}

async function getLatestSingle(adminClient, table, filters, orderColumn = 'created_at') {
  let query = adminClient.from(table).select('*').limit(1).order(orderColumn, { ascending: false });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const result = await query.maybeSingle();
  if (result.error) {
    throw new Error(`${table} query failed: ${result.error.message}`);
  }
  return result.data;
}

async function listTableReachability(adminClient) {
  const tables = ['ivx_conversations', 'ivx_messages', 'ivx_inbox_state', 'ivx_ai_requests'];
  const reachability = [];
  for (const table of tables) {
    const probe = await adminClient.from(table).select('id', { count: 'exact', head: true });
    reachability.push({
      table,
      reachable: !probe.error,
      error: probe.error?.message || null,
      count: probe.count ?? null,
    });
  }
  return reachability;
}

async function waitForRealtimeInsert(client, timeoutMs) {
  return await new Promise((resolve) => {
    const startedAt = Date.now();
    const channel = client.channel(`ivx-owner-ai-audit-${AUDIT_MARKER}`);

    const finish = (payload) => {
      clearTimeout(timer);
      channel.unsubscribe();
      resolve(payload);
    };

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'ivx_messages',
      filter: `conversation_id=eq.${ROOM_ID}`,
    }, (payload) => {
      const senderRole = payload.new?.sender_role ?? null;
      const body = payload.new?.body ?? null;
      if (senderRole === 'assistant' && typeof body === 'string' && body.length > 0) {
        finish({
          received: true,
          latencyMs: Date.now() - startedAt,
          senderRole,
          messageId: payload.new?.id ?? null,
          bodyPreview: body.slice(0, 160),
        });
      }
    }).subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        finish({ received: false, status, latencyMs: Date.now() - startedAt });
      }
    });

    const timer = setTimeout(() => {
      finish({ received: false, status: 'timeout', latencyMs: Date.now() - startedAt });
    }, timeoutMs);
  });
}

async function deleteProbeUser(adminClient, userId) {
  const deleteResult = await adminClient.auth.admin.deleteUser(userId);
  if (deleteResult.error) {
    return { ok: false, error: deleteResult.error.message };
  }
  return { ok: true, error: null };
}

async function runAuthenticatedAudit(endpoint) {
  const config = getSupabaseConfig();
  requireSupabaseConfig(config);

  const adminClient = createAdminClient(config);
  const anonClient = createAnonClient(config);
  const probeEmail = `ivx-owner-ai-audit-${Date.now()}@example.com`;
  const probePassword = `Audit-${Math.random().toString(36).slice(2)}-A1!`;

  let probeUserId = null;

  try {
    const tableReachability = await listTableReachability(adminClient);
    const probeUser = await ensureOwnerUser(adminClient, probeEmail, probePassword);
    probeUserId = probeUser.id;
    const session = await signInProbeUser(anonClient, probeEmail, probePassword);

    const beforeAiRequest = await getLatestSingle(adminClient, 'ivx_ai_requests', { user_id: probeUser.id });
    const beforeAssistantMessage = await getLatestSingle(adminClient, 'ivx_messages', { conversation_id: ROOM_ID, sender_role: 'assistant' });

    const realtimeClient = createAnonClient(config);
    await realtimeClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const realtimePromise = waitForRealtimeInsert(realtimeClient, 25000);

    const postResponse = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        conversationId: ROOM_ID,
        senderLabel: 'IVX Owner Audit',
        message: `Audit ping ${AUDIT_MARKER}`,
        mode: 'chat',
      }),
    });

    const postPayload = await readResponse(postResponse);
    const realtimeResult = await realtimePromise;

    const aiRequestRow = await getLatestSingle(adminClient, 'ivx_ai_requests', { user_id: probeUser.id });
    const assistantMessageRow = await getLatestSingle(adminClient, 'ivx_messages', { conversation_id: ROOM_ID, sender_role: 'assistant' });
    const conversationRow = await getLatestSingle(adminClient, 'ivx_conversations', { id: ROOM_ID }, 'updated_at');
    const inboxRow = await getLatestSingle(adminClient, 'ivx_inbox_state', { conversation_id: ROOM_ID, user_id: probeUser.id }, 'updated_at');

    return {
      endpoint,
      authenticatedPost: postPayload,
      serverLogMarkerExpected: AUDIT_MARKER,
      probeUser: {
        id: probeUser.id,
        email: probeEmail,
      },
      before: {
        aiRequestId: beforeAiRequest?.id ?? null,
        assistantMessageId: beforeAssistantMessage?.id ?? null,
      },
      after: {
        aiRequestRow: aiRequestRow ? {
          id: aiRequestRow.id ?? null,
          conversation_id: aiRequestRow.conversation_id ?? null,
          user_id: aiRequestRow.user_id ?? null,
          prompt: String(aiRequestRow.prompt ?? '').slice(0, 160),
          status: aiRequestRow.status ?? null,
          model: aiRequestRow.model ?? null,
        } : null,
        assistantMessageRow: assistantMessageRow ? {
          id: assistantMessageRow.id ?? null,
          conversation_id: assistantMessageRow.conversation_id ?? null,
          sender_role: assistantMessageRow.sender_role ?? null,
          sender_label: assistantMessageRow.sender_label ?? null,
          bodyPreview: String(assistantMessageRow.body ?? '').slice(0, 160),
          created_at: assistantMessageRow.created_at ?? null,
        } : null,
        conversationRow: conversationRow ? {
          id: conversationRow.id ?? null,
          slug: conversationRow.slug ?? null,
          last_message_text: conversationRow.last_message_text ?? null,
          last_message_at: conversationRow.last_message_at ?? null,
          updated_at: conversationRow.updated_at ?? null,
        } : null,
        inboxRow: inboxRow ? {
          conversation_id: inboxRow.conversation_id ?? null,
          user_id: inboxRow.user_id ?? null,
          unread_count: inboxRow.unread_count ?? null,
          last_read_at: inboxRow.last_read_at ?? null,
        } : null,
      },
      realtime: realtimeResult,
      tables: tableReachability,
    };
  } finally {
    if (probeUserId) {
      try {
        await deleteProbeUser(adminClient, probeUserId);
      } catch {
      }
    }
  }
}

async function main() {
  const endpointInfo = buildCandidateEndpoints();
  const routeChecks = [];

  for (const endpoint of endpointInfo.candidates) {
    routeChecks.push(await inspectEndpoint(endpoint));
  }

  const firstHealthyEndpoint = routeChecks.find((entry) => entry.unauthorizedPost?.status === 401 || entry.unauthorizedPost?.status === 200);
  let authenticatedAudit = null;
  let authenticatedAuditError = null;

  if (firstHealthyEndpoint) {
    try {
      authenticatedAudit = await runAuthenticatedAudit(firstHealthyEndpoint.url);
    } catch (error) {
      authenticatedAuditError = error instanceof Error ? error.message : 'Authenticated audit failed';
    }
  }

  const result = {
    marker: AUDIT_MARKER,
    room: {
      id: ROOM_ID,
      slug: ROOM_SLUG,
    },
    endpointInfo,
    routeChecks,
    authenticatedAudit,
    authenticatedAuditError,
  };

  console.log(JSON.stringify(result, null, 2));

  const hasHealthyRoute = routeChecks.some((entry) => entry.unauthorizedPost?.status === 401 || entry.unauthorizedPost?.status === 200);
  if (!hasHealthyRoute || authenticatedAuditError) {
    process.exitCode = 1;
  }
}

await main();
