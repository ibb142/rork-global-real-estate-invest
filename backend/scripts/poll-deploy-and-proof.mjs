import https from 'node:https';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

const RENDER_KEY = process.env.RENDER_API_KEY || 'RENDER_API_KEY_PLACEHOLDER';
const BACKEND_SVC = 'srv-d7t9ivreo5us73ftose0';
const FRONTEND_SVC = 'srv-d7t9j00sfn5c738a18j0';
const BACKEND_URL = 'https://api.ivxholding.com';
const FRONTEND_URL = 'https://chat.ivxholding.com';

// Use local HEAD as the expected deployed SHA. The script is run after pushing.
let EXPECTED_SHA;
try {
  EXPECTED_SHA = execSync('git rev-parse HEAD', { cwd: '.', encoding: 'utf8' }).trim();
} catch {
  EXPECTED_SHA = '';
}
const SHORT_SHA = EXPECTED_SHA.slice(0, 7);

function fetch(url, opts = {}, timeout = 15000) {
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function triggerDeploy(serviceId) {
  const r = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RENDER_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({}),
  });
  return { serviceId, status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function getDeploy(serviceId) {
  const r = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys?limit=1`, { headers: { Authorization: `Bearer ${RENDER_KEY}`, Accept: 'application/json' } });
  const arr = j(r.body || '[]');
  const first = Array.isArray(arr) && arr[0] ? arr[0] : null;
  const dep = first?.deploy || first;
  return dep ? { id: dep.id, status: dep.status, commit: dep.commit?.id, message: dep.commit?.message, createdAt: dep.createdAt, finishedAt: dep.finishedAt } : null;
}

async function getBackendHealth() {
  const r = await fetch(`${BACKEND_URL}/health`);
  return { status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function getBackendVersion() {
  const r = await fetch(`${BACKEND_URL}/api/ivx/version`);
  return { status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function getFrontendRoot() {
  const r = await fetch(`${FRONTEND_URL}/`);
  return { status: r.status, text: r.body?.slice(0, 120) };
}

async function getCounts() {
  const r = await fetch(`${BACKEND_URL}/api/ivx/counts`);
  return { status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function getRestoreCenter() {
  const r = await fetch(`${BACKEND_URL}/api/ivx/restore-center/overview`);
  return { status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function runDrill() {
  const r = await fetch(`${BACKEND_URL}/api/ivx/restore-center/drill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  return { status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function getProtectedTables() {
  const r = await fetch(`${BACKEND_URL}/api/ivx/restore-center/protected-tables`);
  return { status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function getGitHubCommit() {
  const r = await fetch('https://api.github.com/repos/ibb142/rork-global-real-estate-invest/commits?per_page=1', { headers: { Accept: 'application/json', 'User-Agent': 'rork-ivx-proof' } });
  return { status: r.status, body: j(r.body || '[]'), text: r.body?.slice(0, 200) };
}

async function main() {
  console.log('Expected SHA:', EXPECTED_SHA || 'unknown');
  console.log('Triggering backend deploy...');
  const backendTrigger = await triggerDeploy(BACKEND_SVC);
  console.log(JSON.stringify({ backendTrigger }, null, 2));
  console.log('Triggering frontend deploy...');
  const frontendTrigger = await triggerDeploy(FRONTEND_SVC);
  console.log(JSON.stringify({ frontendTrigger }, null, 2));

  const result = {
    timestamp: new Date().toISOString(),
    expectedSha: EXPECTED_SHA,
    github: await getGitHubCommit(),
    backendTrigger,
    frontendTrigger,
    polls: [],
    live: false,
  };

  let live = false;
  for (let i = 0; i < 30; i++) {
    const backendDeploy = await getDeploy(BACKEND_SVC);
    const frontendDeploy = await getDeploy(FRONTEND_SVC);
    const backendHealth = await getBackendHealth();
    const backendVersion = await getBackendVersion();
    const frontendRoot = await getFrontendRoot();

    const liveSha = backendVersion.body?.commit || backendHealth.body?.commit || backendDeploy?.commit || '';
    const backendCommitMatch = !!EXPECTED_SHA && (liveSha === EXPECTED_SHA || liveSha.startsWith(SHORT_SHA));
    const backendHealthy = backendHealth.status === 200;
    const backendDeployLive = backendDeploy?.status === 'live';
    const frontendDeployLive = frontendDeploy?.status === 'live';
    const frontendHealthy = frontendRoot.status === 200;

    const poll = {
      iteration: i,
      at: new Date().toISOString(),
      backendDeploy: { id: backendDeploy?.id, status: backendDeploy?.status, commit: backendDeploy?.commit },
      frontendDeploy: { id: frontendDeploy?.id, status: frontendDeploy?.status, commit: frontendDeploy?.commit },
      backendHealth: { status: backendHealth.status, sha: liveSha, commitMatch: backendCommitMatch },
      frontendRoot: { status: frontendRoot.status, healthy: frontendHealthy },
    };
    result.polls.push(poll);
    console.log(JSON.stringify(poll));

    if (backendDeployLive && frontendDeployLive && backendHealthy && frontendHealthy && backendCommitMatch) {
      result.live = true;
      result.backendDeploy = backendDeploy;
      result.frontendDeploy = frontendDeploy;
      result.backendHealth = backendHealth;
      result.backendVersion = backendVersion;
      result.frontendRoot = frontendRoot;
      live = true;
      break;
    }
    await sleep(5000);
  }

  if (live) {
    result.counts = await getCounts();
    result.restoreCenter = await getRestoreCenter();
    result.drill = await runDrill();
    result.protectedTables = await getProtectedTables();
  }

  const outPath = 'backend/verification-proof/ivx-final-live-proof-' + Date.now() + '.json';
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(live ? 'LIVE ✓' : 'NOT YET LIVE', 'Proof:', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
