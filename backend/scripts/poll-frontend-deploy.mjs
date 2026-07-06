import { readFileSync } from 'node:fs';

function loadEnv() {
  const text = readFileSync('expo/.env', 'utf8');
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
const KEY = env.RENDER_API_KEY;
const SID = 'srv-d7t9j00sfn5c738a18j0';
const URL = 'https://ivx-holdings-chat-frontend.onrender.com';

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  for (let i = 1; i <= 30; i++) {
    const res = await fetch(`https://api.render.com/v1/services/${SID}/deploys?limit=1`, {
      headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
    });
    const data = await res.json().catch(() => []);
    const deploy = data[0]?.deploy;
    const status = deploy?.status ?? 'unknown';
    const id = deploy?.id ?? 'unknown';
    const commit = deploy?.commit?.id?.slice(0, 8) ?? 'unknown';
    let siteStatus = 'unknown';
    try {
      const site = await fetch(URL, { method: 'HEAD' });
      siteStatus = `${site.status}`;
    } catch (e) { siteStatus = String(e.message); }
    console.log(JSON.stringify({ attempt: i, deployId: id, status, commit, siteStatus }, null, 2));
    if (status === 'live') {
      console.log('FRONTEND_LIVE');
      process.exit(0);
    }
    await sleep(10_000);
  }
  console.log('TIMEOUT');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
