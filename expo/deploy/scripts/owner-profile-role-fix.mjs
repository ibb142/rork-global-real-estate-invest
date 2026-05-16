// Update profiles.role = 'owner' for iperez4242@gmail.com.
// Does NOT touch auth password or login code. Idempotent.
import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);

const TARGET_EMAIL = 'iperez4242@gmail.com';

async function getEnvFromRender() {
  const KEY = process.env.RENDER_API_KEY;
  if (!KEY) return {};
  const id = 'srv-d7t9ivreo5us73ftose0';
  const evMap = {};
  let cursor = null; let pages = 0;
  do {
    const url = new URL(`https://api.render.com/v1/services/${id}/env-vars`);
    if (cursor) url.searchParams.set('cursor', cursor);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${KEY}` } });
    const arr = await r.json().catch(() => []);
    if (!Array.isArray(arr) || !arr.length) break;
    for (const item of arr) {
      const k = item.envVar?.key ?? item.key;
      const v = item.envVar?.value ?? item.value;
      if (k) evMap[k] = v;
    }
    cursor = arr[arr.length - 1]?.cursor || null;
    pages++;
  } while (cursor && pages < 10);
  return evMap;
}

const ev = await getEnvFromRender();
const SUPA_URL = ev.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SR = ev.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('presence=', { SUPA_URL: !!SUPA_URL, SR: !!SR });
if (!SUPA_URL || !SR) { console.error('missing required envs'); process.exit(2); }

// 1) Find auth user id by email (admin filter)
let user = null;
{
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?email=${encodeURIComponent(TARGET_EMAIL)}`, {
    headers: { apikey: SR, Authorization: `Bearer ${SR}` },
  });
  if (!r.ok) { console.error('search_status=', r.status); process.exit(3); }
  const j = await r.json();
  const arr = Array.isArray(j?.users) ? j.users : (Array.isArray(j) ? j : []);
  user = arr.find((u) => (u.email || '').toLowerCase() === TARGET_EMAIL) || null;
}
if (!user) { console.error('user_not_found'); process.exit(4); }
console.log('user_found id_suffix=', String(user.id).slice(-8));

// 2) Read existing profile (for reporting)
const beforeRes = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id,email,role,kyc_status&id=eq.${user.id}`, {
  headers: { apikey: SR, Authorization: `Bearer ${SR}` },
});
const beforeJ = await beforeRes.json().catch(() => []);
console.log('profile_before=', JSON.stringify(beforeJ?.[0] || null));

// 3) Upsert/patch role to owner (only columns that exist in schema)
const payload = {
  id: user.id,
  email: TARGET_EMAIL,
  role: 'owner',
  kyc_status: 'approved',
};
const upsert = await fetch(`${SUPA_URL}/rest/v1/profiles?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: SR,
    Authorization: `Bearer ${SR}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(payload),
});
const upsertText = await upsert.text();
console.log('profile_upsert_status=', upsert.status);
if (!upsert.ok) {
  // Fallback: PATCH by id
  const patch = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ role: 'owner', kyc_status: 'approved' }),
  });
  console.log('profile_patch_status=', patch.status);
  const patchText = await patch.text();
  if (!patch.ok) {
    console.error('upsert_body=', upsertText.slice(0, 400));
    console.error('patch_body=', patchText.slice(0, 400));
    process.exit(5);
  }
}

// 4) Also align auth metadata to owner (does not change password)
const meta = await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_metadata: { ...(user.user_metadata || {}), role: 'owner', accountType: 'owner', status: 'active', kycStatus: 'approved' },
    app_metadata: { ...(user.app_metadata || {}), role: 'owner', accountType: 'owner' },
  }),
});
console.log('auth_metadata_update_status=', meta.status);

// 5) Verify
const afterRes = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id,email,role,kyc_status&id=eq.${user.id}`, {
  headers: { apikey: SR, Authorization: `Bearer ${SR}` },
});
const afterJ = await afterRes.json().catch(() => []);
console.log('profile_after=', JSON.stringify(afterJ?.[0] || null));
console.log('done target=', TARGET_EMAIL, 'role=', afterJ?.[0]?.role);
