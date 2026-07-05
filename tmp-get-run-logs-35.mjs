import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repo = 'ibb142/rork-global-real-estate-invest';
const runId = 28752303202;

const remoteUrl = execSync('git remote get-url github', { encoding: 'utf-8', timeout: 10000 }).trim();
const tokenMatch = remoteUrl.match(/^(https?:\/\/)([^@]+)@github\.com/);
const token = tokenMatch ? tokenMatch[2] : '';

const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'ivx-deploy-agent',
};

const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/logs`, { headers, redirect: 'manual' });
if (res.status !== 302 && res.status !== 301) {
  console.error('Expected redirect, got', res.status, await res.text());
  process.exit(1);
}
const location = res.headers.get('location');
if (!location) {
  console.error('No location header');
  process.exit(1);
}

const zipPath = '/tmp/ivx-run-logs-35.zip';
const logRes = await fetch(location);
const buffer = Buffer.from(await logRes.arrayBuffer());
require('node:fs').writeFileSync(zipPath, buffer);

const extractDir = '/tmp/ivx-run-logs-35';
if (!existsSync(extractDir)) mkdirSync(extractDir, { recursive: true });
execSync(`unzip -o ${zipPath} -d ${extractDir}`, { stdio: 'ignore' });

const file = 'Build + upload landing to S3 + invalidate CloudFront/5_Deploy landing page (build + upload + CloudFront invalidation).txt';
const path = join(extractDir, file);
console.log(`\n=== ${file} ===\n`);
console.log(readFileSync(path, 'utf-8'));
