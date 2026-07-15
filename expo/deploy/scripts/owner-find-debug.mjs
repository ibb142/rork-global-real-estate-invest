import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);
const SUPA_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('hasUrl=', !!SUPA_URL, 'hasSR=', !!SR);
const r = await fetch(`${SUPA_URL}/auth/v1/admin/users?per_page=10&page=1`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
const txt = await r.text();
console.log('status=', r.status);
console.log('body_first_400=', txt.slice(0, 400));
let j; try { j = JSON.parse(txt); } catch {}
if (j) {
  const keys = Object.keys(j);
  console.log('keys=', keys);
  const arr = Array.isArray(j.users) ? j.users : (Array.isArray(j) ? j : []);
  console.log('users_arr_len=', arr.length, 'sample_emails=', arr.slice(0,5).map(u => (u.email||'').replace(/(.{2}).+(@.+)/,'$1***$2')));
}
