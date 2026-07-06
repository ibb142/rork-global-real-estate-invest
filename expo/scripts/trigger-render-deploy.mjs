/**
 * Trigger a Render deploy for the IVX backend service.
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

async function main() {
  const res = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${RENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify({ status: res.status, data }, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
