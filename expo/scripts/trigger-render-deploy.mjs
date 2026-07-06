// Trigger a new deploy on Render for the IVX backend service.
// Run: node expo/scripts/trigger-render-deploy.mjs <commit-sha>
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
const commitSha = process.argv[2] || '';

if (!RENDER_KEY || !SERVICE_ID) {
  console.error('Missing RENDER_API_KEY or RENDER_SERVICE_ID');
  process.exit(1);
}

async function main() {
  const url = `https://api.render.com/v1/services/${SERVICE_ID}/deploys`;
  const body = commitSha ? { commitId: commitSha } : {};
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RENDER_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  console.log({ ok: r.ok, status: r.status, payload: j });
  if (!r.ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
