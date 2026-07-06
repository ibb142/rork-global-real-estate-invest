import { createClient } from '@supabase/supabase-js';

const url = process.env.IVX_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!url || !anonKey) { console.error('Missing Supabase env vars'); process.exit(1); }

const memoryStorage = new Map();
const storage = {
  getItem: async (key) => memoryStorage.get(key) ?? null,
  setItem: async (key, value) => { memoryStorage.set(key, value); },
  removeItem: async (key) => { memoryStorage.delete(key); },
};

const client = createClient(url, anonKey, {
  auth: { storage, autoRefreshToken: true, persistSession: true },
});

async function main() {
  const loginRes = await fetch('https://api.ivxholding.com/api/ivx/owner-passwordless-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'iperez4242@gmail.com' }),
  });
  const login = await loginRes.json();
  console.log('login success:', login.success, 'token length:', login.accessToken?.length, 'refresh length:', login.refreshToken?.length);
  if (!login.success) return;

  const { data: setData, error: setError } = await client.auth.setSession({
    access_token: login.accessToken,
    refresh_token: login.refreshToken,
  });
  console.log('setSession error:', setError?.message ?? null, 'session present:', !!setData.session);

  const { data: getData, error: getError } = await client.auth.getSession();
  console.log('getSession error:', getError?.message ?? null, 'session present:', !!getData.session);
  console.log('user email:', getData.session?.user?.email ?? 'none');
  console.log('access token segments:', getData.session?.access_token?.split('.').length ?? 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
