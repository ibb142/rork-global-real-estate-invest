import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);
const KEY = process.env.RENDER_API_KEY;
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
const SUPA_URL = evMap.EXPO_PUBLIC_SUPABASE_URL;
const SR = evMap.SUPABASE_SERVICE_ROLE_KEY;
const ANON = evMap.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const NEW_PW = evMap.OWNER_NEW_PASSWORD;
const OE = (evMap.IVX_OWNER_REGISTRATION_EMAILS || '').split(',')[0].trim().toLowerCase();
console.log('have ANON?', !!ANON, 'OE_masked=', OE.replace(/(.).+(@.+)/,'$1***$2'));

if (!ANON) {
  // Render only stored backend-only ANON name? Try EXPO_PUBLIC_SUPABASE_ANON_KEY by alternate key
  console.log('no anon in render env — public anon must come from frontend env. Trying owner-registration/status to confirm backend is healthy.');
}

const g = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON || SR, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: OE, password: NEW_PW }),
});
const txt = await g.text();
console.log('login_status=', g.status, 'body=', txt.slice(0, 400));
