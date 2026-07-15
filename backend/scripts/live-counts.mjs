import https from 'node:https';
import fs from 'node:fs/promises';

const SUPABASE_URL = 'https://kvclcdjmjghndxsngfzb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BACKEND_URL = 'https://api.ivxholding.com';
const OWNER_TOKEN = process.env.IVX_OWNER_TOKEN || '';

function fetch(url, opts = {}, timeout = 20000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET', headers: opts.headers || {}, timeout }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
    });
    req.on('error', (e) => resolve({ status: 0, error: String(e.message || e), body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', body: '' }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };
const supaHeaders = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function count(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count&limit=1`, { headers: { ...supaHeaders, Range: '0-0', Prefer: 'count=exact' } });
  const range = r.headers['content-range'] || r.headers['Content-Range'] || '';
  const m = range.match(/\/(\d+)/);
  return m ? parseInt(m[1], 10) : (r.status === 200 ? 0 : `ERR:${r.status}`);
}

async function getOwnerEndpoint(path) {
  const r = await fetch(`${BACKEND_URL}${path}`, { headers: { 'x-ivx-owner-token': OWNER_TOKEN } });
  const data = j(r.body || '{}');
  return { status: r.status, data, text: r.body?.slice(0, 200) };
}

async function main() {
  const tables = ['members', 'investors', 'buyers', 'waitlist', 'wallets', 'transactions', 'ledger', 'treasury', 'data_vault', 'snapshots', 'deletion_requests', 'jv_deals', 'profiles', 'lenders', 'private_lenders', 'properties', 'analytics_events', 'messages', 'conversations'];
  const counts = {};
  await Promise.all(tables.map(async (t) => { counts[t] = await count(t); }));

  const auth = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: supaHeaders });
  const authData = j(auth.body || '{}');
  const authUsers = Array.isArray(authData?.users) ? authData.users : (Array.isArray(authData) ? authData : []);

  const health = await fetch(`${BACKEND_URL}/health`);
  const version = await fetch(`${BACKEND_URL}/api/ivx/version`);
  const ownerAi = await fetch(`${BACKEND_URL}/api/ivx/owner-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ivx-owner-token': OWNER_TOKEN }, body: JSON.stringify({ message: 'hello' }) });
  const restoreCenter = await getOwnerEndpoint('/api/ivx/restore-center');
  const dataVault = await getOwnerEndpoint('/api/ivx/data-vault');
  const dangerBlocker = await getOwnerEndpoint('/api/ivx/danger-blocker');
  const recoveryDrill = await getOwnerEndpoint('/api/ivx/recovery-drill');

  const result = {
    timestamp: new Date().toISOString(),
    commit: j(version.body || '{}')?.commit || version.body?.slice(0, 40),
    health: { status: health.status, body: j(health.body || '{}') },
    version: { status: version.status, body: j(version.body || '{}') },
    counts,
    authUsers: { total: authUsers.length, emails: authUsers.map((u) => u.email) },
    ownerAI: { status: ownerAi.status, body: j(ownerAi.body || '{}')?.source || j(ownerAi.body || '{}')?.answer?.slice(0, 80) || ownerAi.body?.slice(0, 80) },
    restoreCenter: { status: restoreCenter.status, summary: restoreCenter.data },
    dataVault: { status: dataVault.status, summary: dataVault.data },
    dangerBlocker: { status: dangerBlocker.status, summary: dangerBlocker.data },
    recoveryDrill: { status: recoveryDrill.status, summary: recoveryDrill.data },
  };

  const outPath = 'backend/verification-proof/ivx-live-final-counts-' + Date.now() + '.json';
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log('\nProof:', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
