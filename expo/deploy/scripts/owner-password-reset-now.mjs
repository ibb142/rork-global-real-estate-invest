import { loadProjectEnv } from './aws-runtime.mjs';
const r = loadProjectEnv(import.meta.url);
console.log('envFilesLoaded=', r?.loadedFiles?.length ?? 'n/a');

const SUPA_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEW_PW = process.env.OWNER_NEW_PASSWORD;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const OE = (process.env.OWNER_EMAIL || process.env.IVX_OWNER_REGISTRATION_EMAILS || process.env.EXPO_PUBLIC_OWNER_EMAIL || 'iperez4242@gmail.com').toString().split(',')[0].trim().toLowerCase();
console.log('hasUrl=', !!SUPA_URL, 'hasSR=', !!SR, 'hasPW=', !!NEW_PW, 'hasAnon=', !!ANON, 'email=', OE.replace(/(.).+(@.+)/,'$1***$2'));
if (!SUPA_URL || !SR || !NEW_PW) { console.error('missing_required'); process.exit(2); }

let user = null;
let totalScanned = 0;
const ownerLikeSample = [];
const ownerRoleCandidates = [];
for (let page=1; page<=20 && !user; page++) {
  const res = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=1000&page=${page}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
  const j = await res.json();
  const arr = Array.isArray(j?.users) ? j.users : (Array.isArray(j) ? j : []);
  if (!arr.length) break;
  totalScanned += arr.length;
  for (const u of arr) {
    const e = (u.email || '').toLowerCase();
    const meta = u.user_metadata || {}; const app = u.app_metadata || {};
    const role = meta.role || app.role || meta.accountType || app.accountType;
    if (e === OE) { user = u; break; }
    if (e.includes('iperez') || e.includes('ivxholding') || e.includes('owner')) ownerLikeSample.push({ id6: String(u.id).slice(-6), em: e.replace(/(.{2}).+(@.+)/,'$1***$2'), role });
    if (role === 'owner' || meta.requestedRole === 'owner') ownerRoleCandidates.push({ id6: String(u.id).slice(-6), em: e.replace(/(.{2}).+(@.+)/,'$1***$2'), role });
  }
}
console.log('scanned=', totalScanned, 'ownerLikeSample=', ownerLikeSample.slice(0,15), 'ownerRoleCount=', ownerRoleCandidates.length, 'ownerRoleSample=', ownerRoleCandidates.slice(0,15));
if (!user && ownerRoleCandidates.length === 1) {
  console.log('using_sole_owner_role_candidate');
  // refetch full user record by id from page scan: just pick from ownerRoleCandidates by re-listing
}
if (!user) { console.error('owner_user_not_found'); process.exit(3); }
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
const updTxt = await upd.text();
let updJ = {}; try { updJ = JSON.parse(updTxt); } catch {}
console.log('password_update_status=', upd.status, 'err=', updJ.error_description || updJ.msg || updJ.message || (upd.ok ? 'none' : updTxt.slice(0,160)));
if (!upd.ok) process.exit(4);

if (ANON) {
  const g = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OE, password: NEW_PW }),
  });
  const gj = await g.json().catch(() => ({}));
  console.log('login_verify_status=', g.status, 'sessionReturned=', !!gj.access_token, 'errCode=', gj.error_code || gj.error || 'none');
  if (!g.ok) process.exit(5);
}
console.log('OWNER_PASSWORD_RESET=ok secretValuesReturned=false');
