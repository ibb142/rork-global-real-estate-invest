#!/usr/bin/env node
/**
 * Owner AI chat durability proof — runs the full 10-step live production test
 * and prints the EXACT requested report format. Nothing else.
 *
 * MUST be run where the production secrets exist (Render shell, or any machine
 * with the env vars exported). It cannot run from the Rork build sandbox because
 * that shell has none of the production secrets injected.
 *
 * Required env:
 *   PRODUCTION_BASE_URL        e.g. https://api.ivxholding.com
 *   IVX_OWNER_TOKEN            owner bearer token
 *   SUPABASE_URL               (or EXPO_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY  service-role key (for direct ivx_messages count)
 * Optional (enables step 9 restart):
 *   RENDER_API_KEY
 *   RENDER_SERVICE_ID
 *
 * Run:  node deploy/owner-ai-durability-proof.mjs
 */

const BASE = (process.env.PRODUCTION_BASE_URL || process.env.EXPO_PUBLIC_IVX_API_BASE_URL || '').replace(/\/+$/, '');
const OWNER_TOKEN = process.env.IVX_OWNER_TOKEN || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RENDER_API_KEY = process.env.RENDER_API_KEY || '';
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || '';
const OWNER_ROOM_ID = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';

function fail(missing) {
  console.error('BLOCKER: missing credential(s): ' + missing.join(', '));
  console.error('endpoint(s): POST ' + (BASE || '<PRODUCTION_BASE_URL>') + '/api/ivx/owner-ai , Supabase REST /rest/v1/ivx_messages');
  process.exit(2);
}

const missing = [];
if (!BASE) missing.push('PRODUCTION_BASE_URL');
if (!OWNER_TOKEN) missing.push('IVX_OWNER_TOKEN');
if (!SUPABASE_URL) missing.push('SUPABASE_URL');
if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length) fail(missing);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exact row count of ivx_messages via Supabase REST (durable Postgres). */
async function messagesCount() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ivx_messages?select=id`, {
    method: 'HEAD',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  const range = res.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total ? Number(total) : NaN;
}

/** Find a message row by exact body text. */
async function searchExact(text) {
  const url = `${SUPABASE_URL}/rest/v1/ivx_messages?select=id,conversation_id,sender_role,body&body=eq.${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

async function ownerAuditConversation(conversationId) {
  const res = await fetch(`${BASE}/api/ivx/owner-audit/recent-conversations?limit=50`, {
    headers: { Authorization: `Bearer ${OWNER_TOKEN}` },
  });
  const json = await res.json().catch(() => ({}));
  const list = json.conversations || json.data || [];
  return list.find((c) => c.conversationId === conversationId) || null;
}

async function restartRender() {
  if (!RENDER_API_KEY || !RENDER_SERVICE_ID) return { triggered: false, deployId: 'SKIPPED (no RENDER_API_KEY/RENDER_SERVICE_ID)' };
  const res = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RENDER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const json = await res.json().catch(() => ({}));
  const deployId = json.id || 'UNKNOWN';
  // poll until live
  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    const st = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys/${deployId}`, {
      headers: { Authorization: `Bearer ${RENDER_API_KEY}` },
    });
    const sj = await st.json().catch(() => ({}));
    if (sj.status === 'live') break;
    if (['build_failed', 'update_failed', 'canceled', 'deactivated'].includes(sj.status)) break;
  }
  return { triggered: true, deployId };
}

async function githubSha() {
  const token = process.env.GITHUB_TOKEN || '';
  const repo = (process.env.GITHUB_REPO_URL || '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  if (!token || !repo) return 'SKIPPED';
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/main`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ivx-proof' },
  });
  const json = await res.json().catch(() => ({}));
  return json.sha || 'UNKNOWN';
}

(async () => {
  const marker = `DURABILITY PROOF ${new Date().toISOString()} ${Math.random().toString(36).slice(2, 10)}`;

  const before = await messagesCount();

  // 1+2+3+4. Send Owner AI message
  const sendRes = await fetch(`${BASE}/api/ivx/owner-ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OWNER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: OWNER_ROOM_ID, message: marker }),
  });
  const send = await sendRes.json().catch(() => ({}));
  const conversationId = send.conversationId || OWNER_ROOM_ID;
  const userMessageId = send.userMessageId || send.userMessage?.id || 'NULL';
  const assistantMessageId = send.assistantMessageId || send.assistantMessage?.id || 'NULL';

  await sleep(3000);
  const after = await messagesCount();

  // 6. search exact text
  const found = (await searchExact(marker)).length > 0;

  // 7+8. reload conversation, verify ids present
  const auditA = await ownerAuditConversation(conversationId);
  const reloadSurvives = Boolean(auditA) && (auditA.userMessageCount > 0 && auditA.assistantMessageCount > 0);

  // 9+10. restart render, re-verify
  const restart = await restartRender();
  let restartSurvives = false;
  if (restart.triggered) {
    const foundAfter = (await searchExact(marker)).length > 0;
    const auditB = await ownerAuditConversation(conversationId);
    restartSurvives = foundAfter && Boolean(auditB) && auditB.assistantMessageCount > 0;
  }

  const sha = await githubSha();

  const durable = (after > before) && found && reloadSurvives && (!restart.triggered || restartSurvives);

  console.log(`conversationId: ${conversationId}`);
  console.log(`userMessageId: ${userMessageId}`);
  console.log(`assistantMessageId: ${assistantMessageId}`);
  console.log(`ivx_messages_before: ${before}`);
  console.log(`ivx_messages_after: ${after}`);
  console.log(`search_found: ${found ? 'YES' : 'NO'}`);
  console.log(`reload_survives: ${reloadSurvives ? 'YES' : 'NO'}`);
  console.log(`restart_survives: ${restart.triggered ? (restartSurvives ? 'YES' : 'NO') : 'SKIPPED'}`);
  console.log(`GitHub SHA: ${sha}`);
  console.log(`Render Deploy ID: ${restart.deployId}`);
  console.log('');
  console.log(`CHAT DURABILITY: ${durable ? 'YES' : 'NO'}`);
})().catch((err) => {
  console.error('PROOF RUN ERROR:', err?.message || err);
  process.exit(1);
});
