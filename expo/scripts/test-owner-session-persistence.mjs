import { createClient } from '@supabase/supabase-js';

const url = 'https://kvclcdjmjghndxsngfzb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk';

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
