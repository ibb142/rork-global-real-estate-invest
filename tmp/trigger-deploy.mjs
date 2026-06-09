import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync('expo/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const GH_TOKEN = env.GITHUB_TOKEN;
const REPO_URL = env.GITHUB_REPO_URL;
const RENDER_KEY = env.RENDER_API_KEY;
const SERVICE_ID = env.RENDER_SERVICE_ID.trim().split(/\s+/)[0];
const m = REPO_URL.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
const owner = m[1], repo = m[2];
const log = (...a) => console.log(...a);

async function main() {
  // 1) GitHub main HEAD
  const ghHeaders = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const ref = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`, { headers: ghHeaders });
  const refData = await ref.json();
  const ghHead = refData.object?.sha;
  log('=== GitHub repo ===', `${owner}/${repo}`);
  log('GitHub main HEAD:', ghHead, '| ref HTTP', ref.status);

  // 2) Render service id
  log('\n=== Render service ===', SERVICE_ID);
  const rHeaders = { Accept: 'application/json', Authorization: `Bearer ${RENDER_KEY}`, 'Content-Type': 'application/json' };
  const svc = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}`, { headers: rHeaders });
  const svcData = await svc.json().catch(() => ({}));
  log('service HTTP', svc.status, '| name:', svcData.name, '| branch:', svcData.branch);

  // 3) trigger deploy of latest commit (clear cache to ensure fresh build)
  log('\n=== Triggering Render deploy (latest commit on branch) ===');
  const dep = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: 'POST', headers: rHeaders, body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const depData = await dep.json().catch(() => ({}));
  log('deploy trigger HTTP', dep.status);
  log('deployId:', depData.id);
  log('deploy status:', depData.status);
  log('deploy commit:', depData.commit?.id, '|', depData.commit?.message?.slice(0, 80));
}
main().catch(e => log('FATAL', String(e)));
