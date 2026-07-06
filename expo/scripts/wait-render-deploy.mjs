// Poll Render deploy status until the service is live on the target commit.
// Run: node expo/scripts/wait-render-deploy.mjs <commit-sha>
import { readFileSync } from 'node:fs';

const ENV_PATH = new URL('../.env', import.meta.url).pathname;
const rawEnv = readFileSync(ENV_PATH, 'utf8');
const env = {};
for (const line of rawEnv.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const RENDER_KEY = env.RENDER_API_KEY || '';
const SERVICE_ID = env.RENDER_SERVICE_ID || '';
const targetCommit = process.argv[2] || '';

if (!RENDER_KEY || !SERVICE_ID) {
  console.error('Missing RENDER_API_KEY or RENDER_SERVICE_ID');
  process.exit(1);
}

async function getLatestDeploy() {
  const r = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=1`, {
    headers: { Authorization: `Bearer ${RENDER_KEY}`, Accept: 'application/json' },
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  const first = Array.isArray(j) ? j[0] : null;
  const deploy = first?.deploy || first;
  return deploy || null;
}

async function getBackendHealth() {
  try {
    const r = await fetch('https://api.ivxholding.com/health');
    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, commit: j.commit, status2: j.status, bootTime: j.bootTime };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Waiting for Render service ${SERVICE_ID} to deploy commit ${targetCommit || 'latest'}`);
  const start = Date.now();
  const deadline = start + 300_000; // 5 minutes
  while (Date.now() < deadline) {
    const deploy = await getLatestDeploy();
    const health = await getBackendHealth();
    console.log({
      elapsed: Math.round((Date.now() - start) / 1000),
      deployStatus: deploy?.status || null,
      deployCommit: deploy?.commit?.id || null,
      backendCommit: health.commit || null,
      backendHealth: health.status2 || null,
    });
    if (health.ok && health.status2 === 'healthy' && (!targetCommit || health.commit === targetCommit)) {
      console.log('Deploy verified live.');
      process.exit(0);
    }
    await sleep(15_000);
  }
  console.error('Timeout waiting for deploy.');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
