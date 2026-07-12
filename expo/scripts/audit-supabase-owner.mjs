/**
 * Supabase owner user existence + confirmation status audit.
 *
 * Uses the service role key to query auth.users via the GoTrue admin API.
 * Prints sanitized results (no secrets, no tokens).
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://kvclcdjmjghndxsngfzb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const OWNER_EMAIL = (process.env.IVX_OWNER_EMAIL ?? '').trim().toLowerCase();

async function listGoTrueAdminUsers() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  const text = await response.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    httpStatus: response.status,
    body,
  };
}

async function queryProfiles() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(OWNER_EMAIL)}&select=id,email,role,created_at`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  const text = await response.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    httpStatus: response.status,
    body,
  };
}

async function testPasswordSignIn() {
  const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const OWNER_PASSWORD = process.env.IVX_OWNER_PASSWORD ?? '';
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  const text = await response.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return {
    httpStatus: response.status,
    rawHeaders: Object.fromEntries(response.headers.entries()),
    body,
  };
}

async function main() {
  const users = await listGoTrueAdminUsers();
  const profiles = await queryProfiles();
  const signIn = await testPasswordSignIn();

  const allUsers = Array.isArray(users.body?.users) ? users.body.users : [];
  const ownerAuthUser = allUsers.find((u) => (u.email ?? '').toLowerCase() === OWNER_EMAIL);

  const evidence = {
    auditId: `supabase-owner-${Date.now()}`,
    auditedAt: new Date().toISOString(),
    supabaseProject: SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    ownerEmail: OWNER_EMAIL,
    goTrueAdminHttpStatus: users.httpStatus,
    totalAuthUsers: allUsers.length,
    ownerAuthUserFound: Boolean(ownerAuthUser),
    ownerAuthUser: ownerAuthUser
      ? {
          id: ownerAuthUser.id,
          email: ownerAuthUser.email,
          emailConfirmedAt: ownerAuthUser.email_confirmed_at,
          createdAt: ownerAuthUser.created_at,
          lastSignInAt: ownerAuthUser.last_sign_in_at,
          appRole: ownerAuthUser.raw_app_meta_data?.role ?? null,
          userRole: ownerAuthUser.raw_user_meta_data?.role ?? null,
          confirmationSentAt: ownerAuthUser.confirmation_sent_at,
          confirmedAt: ownerAuthUser.confirmed_at,
        }
      : null,
    otherAuthUserEmails: allUsers.map((u) => u.email),
    profilesHttpStatus: profiles.httpStatus,
    profilesFound: Array.isArray(profiles.body) ? profiles.body.length : null,
    profiles: Array.isArray(profiles.body)
      ? profiles.body.map((p) => ({
          id: p.id,
          email: p.email,
          role: p.role,
          createdAt: p.created_at,
        }))
      : profiles.body,
    passwordSignInHttpStatus: signIn.httpStatus,
    passwordSignInRawBody: signIn.body,
  };

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
