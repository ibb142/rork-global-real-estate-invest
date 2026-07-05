import { readFileSync } from 'node:fs';

const repo = 'ibb142/rork-global-real-estate-invest';
const filePath = '.github/workflows/deploy-landing.yml';
const branch = 'main';

const { execSync } = await import('node:child_process');
const remoteUrl = execSync('git remote get-url github', { encoding: 'utf-8', timeout: 10000 }).trim();
const tokenMatch = remoteUrl.match(/^(https?:\/\/)([^@]+)@github\.com/);
const token = tokenMatch ? tokenMatch[2] : '';
if (!token) throw new Error('No GitHub token');

const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'ivx-deploy-agent',
};

const metaRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, { headers });
const meta = await metaRes.json();
if (!metaRes.ok) throw new Error(`Failed to fetch workflow metadata: ${metaRes.status} ${JSON.stringify(meta)}`);

const content = readFileSync(filePath, 'utf-8');
const base64 = Buffer.from(content).toString('base64');

const updateRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    message: 'ci(landing): add pre-deploy debug log to diagnose index.html source drift',
    content: base64,
    sha: meta.sha,
    branch,
  }),
});
const updateJson = await updateRes.json();
if (!updateRes.ok) throw new Error(`Failed to update workflow: ${updateRes.status} ${JSON.stringify(updateJson)}`);

console.log('✅ Committed workflow debug step:', updateJson.commit?.html_url);
