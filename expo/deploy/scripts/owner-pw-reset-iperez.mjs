import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);
const KEY = process.env.RENDER_API_KEY;
if (!KEY) { console.error('no RENDER_API_KEY'); process.exit(2); }
const id = 'srv-d7t9ivreo5us73ftose0';

// Pull encrypted env from Render
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
console.log('env_pages=', pages, 'keys_count=', Object.keys(evMap).length);

const SUPA_URL = evMap.EXPO_PUBLIC_SUPABASE_URL;
const SR = evMap.SUPABASE_SERVICE_ROLE_KEY;
const ANON = evMap.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const NEW_PW = evMap.OWNER_NEW_PASSWORD;
const TARGET_EMAIL = 'iperez4242@gmail.com';
console.log('presence=', { SUPA_URL: !!SUPA_URL, SR: !!SR, ANON: !!ANON, NEW_PW: !!NEW_PW });
if (!SUPA_URL || !SR || !NEW_PW) { console.error('missing required'); process.exit(3); }

// Find user by email
let user = null;
for (let page = 1; page <= 20 && !user; page++) {
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
  if (!r.ok) { console.error('list_status=', r.status); process.exit(4); }
  const j = await r.json();
  const arr = Array.isArray(j?.users) ? j.users : (Array.isArray(j) ? j : []);
  if (!arr.length) break;
  user = arr.find(u => (u.email || '').toLowerCase() === TARGET_EMAIL) || null;
}

if (!user) {
  console.log('user_not_found_creating_new');
  const cr = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TARGET_EMAIL,
      password: NEW_PW,
      email_confirm: true,
      user_metadata: { role: 'owner', accountType: 'owner', status: 'active', kycStatus: 'approved' },
      app_metadata: { role: 'owner', accountType: 'owner' },
    }),
  });
  const crJ = await cr.json().catch(() => ({}));
  console.log('create_status=', cr.status, 'id_suffix=', String(crJ?.id || '').slice(-8));
  if (!cr.ok) { console.error('create_failed:', JSON.stringify(crJ).slice(0, 300)); process.exit(5); }
  user = crJ;
} else {
  console.log('user_found id_suffix=', String(user.id).slice(-8), 'emailConfirmed=', !!user.email_confirmed_at);
  const upd = await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: NEW_PW,
      email_confirm: true,
      ban_duration: 'none',
      user_metadata: { ...(user.user_metadata || {}), role: 'owner', accountType: 'owner', status: 'active', kycStatus: 'approved', ownerPasswordResetAt: new Date().toISOString() },
      app_metadata: { ...(user.app_metadata || {}), role: 'owner', accountType: 'owner' },
    }),
  });
  console.log('update_status=', upd.status);
  if (!upd.ok) { const t = await upd.text(); console.error('update_failed:', t.slice(0, 300)); process.exit(6); }
}

// Ensure profile row
const profilePayload = { id: user.id, email: TARGET_EMAIL, role: 'owner', account_type: 'owner', status: 'active', kyc_status: 'approved' };
const pr = await fetch(`${SUPA_URL}/rest/v1/profiles?on_conflict=id`, {
  method: 'POST',
  headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(profilePayload),
});
console.log('profile_upsert_status=', pr.status);

// Verify login via password grant
if (ANON) {
  const g = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TARGET_EMAIL, password: NEW_PW }),
  });
  const txt = await g.text();
  let parsed = {}; try { parsed = JSON.parse(txt); } catch {}
  console.log('login_verify_status=', g.status, 'session_token_present=', !!parsed.access_token, 'user_id_suffix=', String(parsed.user?.id || '').slice(-8));
}
console.log('done secretValuesReturned=false target=iperez4242@gmail.com');
