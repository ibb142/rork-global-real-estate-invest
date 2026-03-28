#!/usr/bin/env node
/**
 * IVX Holdings — Unified Pipeline
 * 
 * Single command: sync to GitHub → trigger deploy → verify
 * GitHub Actions will auto-deploy to AWS when code lands on main.
 * 
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node pipeline.mjs
 *   GITHUB_TOKEN=ghp_xxx node pipeline.mjs --message "feat: new feature"
 *   GITHUB_TOKEN=ghp_xxx node pipeline.mjs --skip-verify
 *   GITHUB_TOKEN=ghp_xxx node pipeline.mjs --watch
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'ibb142/rork-global-real-estate-invest';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com';

const args = process.argv.slice(2);
const SKIP_VERIFY = args.includes('--skip-verify');
const WATCH_MODE = args.includes('--watch');
const msgIdx = args.indexOf('--message');
const CUSTOM_MESSAGE = msgIdx !== -1 && args[msgIdx + 1] ? args[msgIdx + 1] : null;

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg) { console.log(`${COLORS.blue}[pipeline]${COLORS.reset} ${msg}`); }
function ok(msg) { console.log(`${COLORS.green}[OK]${COLORS.reset} ${msg}`); }
function warn(msg) { console.log(`${COLORS.yellow}[WARN]${COLORS.reset} ${msg}`); }
function fail(msg) { console.error(`${COLORS.red}[FAIL]${COLORS.reset} ${msg}`); }

async function githubFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function waitForWorkflow(triggerTime, timeoutMs = 300000) {
  log('Waiting for GitHub Actions workflow to start...');
  const startWait = Date.now();
  let run = null;

  while (Date.now() - startWait < timeoutMs) {
    await new Promise(r => setTimeout(r, 10000));

    const runs = await githubFetch(`/repos/${REPO}/actions/runs?per_page=5&branch=${BRANCH}`);
    if (!runs?.workflow_runs?.length) continue;

    const recent = runs.workflow_runs.find(r => {
      const runTime = new Date(r.created_at).getTime();
      return runTime >= triggerTime - 30000;
    });

    if (recent) {
      run = recent;
      if (run.status === 'completed') {
        return run;
      }
      const elapsed = Math.round((Date.now() - startWait) / 1000);
      log(`Workflow "${run.name}" is ${run.status}... (${elapsed}s elapsed)`);
    }
  }

  return run;
}

function runCommand(script, extraArgs = []) {
  const allArgs = extraArgs.length > 0 ? ' ' + extraArgs.join(' ') : '';
  execSync(
    `node "${join(__dirname, script)}"${allArgs}`,
    {
      env: { ...process.env, GITHUB_TOKEN },
      stdio: 'inherit',
      cwd: __dirname,
      timeout: 120_000,
    }
  );
}

async function runPipeline() {
  if (!GITHUB_TOKEN) {
    fail('GITHUB_TOKEN is not set');
    process.exit(1);
  }

  const startTime = Date.now();

  console.log('');
  console.log(`${COLORS.bold}${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  IVX Holdings — Unified Pipeline${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  Repo: ${REPO} (${BRANCH})${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  Flow: Sync → GitHub Actions → AWS ECS${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  console.log('');

  // Step 1: Sync to GitHub
  console.log(`${COLORS.bold}[Step 1/3] Syncing code to GitHub...${COLORS.reset}`);
  const syncArgs = [];
  if (CUSTOM_MESSAGE) {
    syncArgs.push('--message', `"${CUSTOM_MESSAGE}"`);
  }
  
  const triggerTime = Date.now();
  try {
    runCommand('sync-github.mjs', syncArgs);
    ok('Code synced to GitHub');
  } catch (err) {
    fail(`Sync failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Monitor GitHub Actions
  console.log('');
  console.log(`${COLORS.bold}[Step 2/3] Monitoring GitHub Actions deployment...${COLORS.reset}`);

  try {
    const run = await waitForWorkflow(triggerTime, 300000);

    if (!run) {
      warn('No workflow run detected — GitHub Actions may not be configured yet');
      warn('Push the .github/workflows/ directory to enable auto-deploy');
      log('Your code IS on GitHub. Deploy manually or set up GitHub Actions secrets.');
    } else if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        ok(`Workflow "${run.name}" completed successfully`);
        ok(`URL: ${run.html_url}`);
      } else {
        warn(`Workflow "${run.name}" finished with: ${run.conclusion}`);
        warn(`Check: ${run.html_url}`);
      }
    } else {
      log(`Workflow "${run.name}" still running: ${run.status}`);
      log(`Track it at: ${run.html_url}`);
    }
  } catch (err) {
    warn(`Could not monitor workflow: ${err.message}`);
    log('Your code IS on GitHub — check Actions tab for deployment status');
  }

  // Step 3: Verify sync
  if (!SKIP_VERIFY) {
    console.log('');
    console.log(`${COLORS.bold}[Step 3/3] Verifying sync integrity...${COLORS.reset}`);
    try {
      runCommand('verify-sync.mjs');
      ok('Sync verified — local and remote are in sync');
    } catch {
      warn('Sync verification found drift — this may resolve after workflow completes');
    }
  } else {
    log('Skipping verification (--skip-verify)');
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`${COLORS.bold}${COLORS.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.green}  Pipeline Complete (${elapsed}s)${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
  console.log('');
  console.log(`  Code → GitHub:    ✓ Synced`);
  console.log(`  GitHub → AWS:     Auto-deploy via GitHub Actions`);
  console.log(`  AWS → Live:       ECS Fargate rolling deployment`);
  console.log('');
  console.log(`  GitHub:  https://github.com/${REPO}`);
  console.log(`  Actions: https://github.com/${REPO}/actions`);
  console.log(`  API:     https://api.ivxholding.com`);
  console.log('');
}

if (WATCH_MODE) {
  log('Starting in watch mode — will auto-sync on file changes');
  runCommand('auto-sync.mjs');
} else {
  runPipeline().catch(err => {
    fail(`Pipeline error: ${err.message}`);
    process.exit(1);
  });
}
