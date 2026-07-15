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
const TARGET = process.argv[2];
const MAX_ATTEMPTS = Number(process.argv[3] ?? '12');
async function getLatestDeploy() {
  const r = await fetch(`https://api.render.com/v1/services/${SID}/deploys?limit=5`, { headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' } });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}
async function getHealth() {
  try {
    const r = await fetch('https://api.ivxholding.com/health');
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: j.status, commit: j.commit, bootTime: j.bootTime };
  } catch (e) { return { ok: false, error: String(e) }; }
}
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function main() {
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const deploys = await getLatestDeploy();
    const health = await getHealth();
    const latest = deploys[0]?.deploy || deploys[0] || {};
    console.log(JSON.stringify({
      attempt: i,
      deployStatus: latest.status,
      deployCommit: latest.commit?.id,
      deployId: latest.id,
      healthCommit: health.commit,
      healthBootTime: health.bootTime,
      target: TARGET,
      targetMatch: health.commit?.startsWith(TARGET),
    }, null, 2));
    if (health.commit?.startsWith(TARGET)) {
      console.log('TARGET_DEPLOYED');
      process.exit(0);
    }
    await sleep(10_000);
  }
  console.log('TIMEOUT');
  process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
