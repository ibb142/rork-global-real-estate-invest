import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);
const KEY = process.env.RENDER_API_KEY;
if (!KEY) { console.error('no RENDER_API_KEY'); process.exit(2); }

const svcRes = await fetch('https://api.render.com/v1/services?limit=50', { headers: { Authorization: `Bearer ${KEY}` } });
const list = await svcRes.json();
const backend = (Array.isArray(list) ? list : []).find(s => s.service?.name === 'ivx-holdings-platform');
const id = backend?.service?.id;
console.log('backend_id_suffix=', id?.slice(-8));

const evRes = await fetch(`https://api.render.com/v1/services/${id}/env-vars?limit=200`, { headers: { Authorization: `Bearer ${KEY}` } });
const evRaw = await evRes.text();
let evArr; try { evArr = JSON.parse(evRaw); } catch { evArr = []; }
console.log('env_vars_count=', Array.isArray(evArr) ? evArr.length : 'n/a', 'first_keys_sample=', Array.isArray(evArr) ? evArr.slice(0,3).map(x => Object.keys(x)) : 'n/a');
const evMap = {};
for (const item of (Array.isArray(evArr) ? evArr : [])) {
  // Render env-vars API shape: { envVar: { key, value } } OR { key, value }
  const k = item.envVar?.key ?? item.key;
  const v = item.envVar?.value ?? item.value;
  if (k) evMap[k] = v;
}
const wantedNames = ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','OWNER_NEW_PASSWORD','IVX_OWNER_REGISTRATION_EMAILS','EXPO_PUBLIC_OWNER_EMAIL','OWNER_EMAIL'];
console.log('render_env_presence=', Object.fromEntries(wantedNames.map(k => [k, !!evMap[k]])));

const SUPA_URL = evMap.EXPO_PUBLIC_SUPABASE_URL;
const SR = evMap.SUPABASE_SERVICE_ROLE_KEY;
const ANON = evMap.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const NEW_PW = evMap.OWNER_NEW_PASSWORD;
const OE = (evMap.IVX_OWNER_REGISTRATION_EMAILS || evMap.EXPO_PUBLIC_OWNER_EMAIL || evMap.OWNER_EMAIL || '').toString().split(',')[0].trim().toLowerCase();
if (!SUPA_URL || !SR || !NEW_PW || !OE) {
  console.error('missing_one_of', { hasUrl: !!SUPA_URL, hasSR: !!SR, hasPW: !!NEW_PW, hasEmail: !!OE });
  process.exit(3);
}
console.log('owner_email_masked=', OE.replace(/(.).+(@.+)/, '$1***$2'));

let user = null; let scanned = 0;
for (let page=1; page<=20 && !user; page++) {
  const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
  if (!r.ok) { console.error('list_status=', r.status, (await r.text()).slice(0,160)); process.exit(4); }
  const j = await r.json();
  const arr = Array.isArray(j?.users) ? j.users : (Array.isArray(j) ? j : []);
  if (!arr.length) break;
  scanned += arr.length;
  user = arr.find(u => (u.email || '').toLowerCase() === OE) || null;
}
console.log('users_scanned=', scanned, 'found=', !!user);
if (!user) { console.error('owner_user_not_found in supabase'); process.exit(5); }
console.log('owner_id_suffix=', String(user.id).slice(-8), 'emailConfirmed=', !!user.email_confirmed_at, 'banned_until=', user.banned_until || 'none');

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
const updJ = await upd.json().catch(() => ({}));
console.log('password_update_status=', upd.status, 'err=', updJ.error_description || updJ.msg || updJ.message || (upd.ok ? 'none' : '[unknown]'));
if (!upd.ok) process.exit(6);

const g = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: OE, password: NEW_PW }),
});
const gj = await g.json().catch(() => ({}));
console.log('login_verify_status=', g.status, 'sessionReturned=', !!gj.access_token, 'errCode=', gj.error_code || gj.error || 'none');
if (!g.ok) process.exit(7);

console.log('OWNER_PASSWORD_RESET=ok secretValuesReturned=false');
