import { readFileSync } from 'node:fs';
const rawEnv = readFileSync(new URL('../.env', import.meta.url).pathname, 'utf8');
const env = {};
for (const line of rawEnv.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const KEY = env.RENDER_API_KEY;
const SID = env.RENDER_SERVICE_ID;
async function getLatestDeploy() {
  const r = await fetch(`https://api.render.com/v1/services/${SID}/deploys?limit=1`, { headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  const first = Array.isArray(j) ? j[0] : null;
  return first?.deploy || first;
}
async function getHealth() {
  try {
    const r = await fetch('https://api.ivxholding.com/health');
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: j.status, commit: j.commit, bootTime: j.bootTime };
  } catch (e) { return { ok: false, error: String(e) }; }
}
const [deploy, health] = await Promise.all([getLatestDeploy(), getHealth()]);
console.log(JSON.stringify({ deployStatus: deploy?.status, deployCommit: deploy?.commit?.id, health }, null, 2));
