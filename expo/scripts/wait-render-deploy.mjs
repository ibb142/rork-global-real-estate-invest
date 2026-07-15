/**
 * Poll a Render deploy until it reaches a terminal state.
 */
import { readFileSync } from 'node:fs';

function loadEnv() {
  const path = new URL('../../expo/.env', import.meta.url);
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).replace(/^['"]/, '').replace(/['"]$/, '');
  }
  return env;
}

const env = loadEnv();
const RENDER_API_KEY = env.RENDER_API_KEY ?? '';
const SERVICE_ID = env.RENDER_SERVICE_ID ?? 'srv-d7t9ivreo5us73ftose0';
const API_BASE = 'https://api.ivxholding.com';

async function getLatestDeploy() {
  const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=1`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${RENDER_API_KEY}` },
  });
  const data = await res.json().catch(() => []);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function getLiveCommit() {
  try {
    const res = await fetch(`${API_BASE}/health`, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    return data.commit ?? null;
  } catch {
    return null;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const targetCommit = process.argv[2];
  if (!targetCommit) {
    console.error('Usage: node wait-render-deploy.mjs <target-commit-sha>');
    process.exit(1);
  }

  console.log(`Waiting for Render deploy to reach commit ${targetCommit.slice(0, 8)}...`);
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    attempts++;
    const deploy = await getLatestDeploy();
    const liveCommit = await getLiveCommit();
    const deployStatus = deploy?.deploy?.status ?? deploy?.status ?? 'unknown';
    const deployId = deploy?.id ?? deploy?.deploy?.id ?? 'unknown';

    console.log(`[${attempts}] deploy=${deployId} status=${deployStatus} liveCommit=${liveCommit?.slice(0, 8) ?? 'unknown'}`);

    if (liveCommit && liveCommit.startsWith(targetCommit)) {
      console.log(JSON.stringify({ ok: true, liveCommit, deployId, deployStatus }, null, 2));
      process.exit(0);
    }

    if (['live', 'deactivated', 'build_failed', 'canceled'].includes(deployStatus) && attempts > 5) {
      if (deployStatus !== 'live') {
        console.log(JSON.stringify({ ok: false, deployId, deployStatus, liveCommit }, null, 2));
        process.exit(1);
      }
    }

    await sleep(15_000);
  }

  console.log(JSON.stringify({ ok: false, reason: 'timeout waiting for deploy' }, null, 2));
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
