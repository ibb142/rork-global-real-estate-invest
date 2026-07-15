#!/usr/bin/env node
/**
 * IVX — One-Command Ship & Prove runner.
 *
 * Does the FULL end-to-end production workflow that cannot run from the Rork
 * build sandbox (no deploy credentials there). Run this where your secrets
 * live (locally with a populated .env, or in the Render Shell):
 *
 *     node expo/deploy/scripts/ivx-ship.mjs
 *
 * Steps:
 *   1. Push current commit to GitHub `main` (triggers Render auto-deploy).
 *   2. Trigger an explicit Render deploy (deterministic) and capture deploy ID.
 *   3. Poll the Render deploy until it goes `live` (or fails).
 *   4. Poll GET /health until the running commit == the commit we shipped.
 *   5. Run the existing feature proof script (ivx-live-proof.mjs).
 *   6. Print the final DEPLOYED / VERIFIED proof table.
 *
 * Required env (read from process.env or any loaded .env):
 *   GITHUB_TOKEN, GITHUB_REPO_URL   — to push to GitHub
 *   RENDER_API_KEY, RENDER_SERVICE_ID — to trigger/poll the deploy
 * Optional env:
 *   PRODUCTION_BASE_URL (default https://api.ivxholding.com)
 *   IVX_SHIP_BRANCH (default main)
 *   IVX_SHIP_SKIP_PUSH=1   — skip git push (deploy already pushed)
 *   IVX_SHIP_SKIP_PROOF=1  — skip the feature proof script
 *   plus the IVX_OWNER_PROOF_* / SUPABASE_* vars used by ivx-live-proof.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const LIVE_PROOF_SCRIPT = resolve(SCRIPT_DIR, 'ivx-live-proof.mjs');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function log(msg) {
  console.log(`${CYAN}[ivx-ship]${RESET} ${msg}`);
}
function ok(msg) {
  console.log(`${GREEN}[ok]${RESET} ${msg}`);
}
function warn(msg) {
  console.log(`${YELLOW}[warn]${RESET} ${msg}`);
}
function fail(msg) {
  console.log(`${RED}[error]${RESET} ${msg}`);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lightweight .env loader so the runner is self-contained. */
function loadDotEnvFiles() {
  const candidates = [
    resolve(PROJECT_ROOT, '.env'),
    resolve(PROJECT_ROOT, '.env.local'),
    resolve(PROJECT_ROOT, '.env.production'),
    resolve(PROJECT_ROOT, 'expo/.env'),
    resolve(PROJECT_ROOT, 'expo/.env.local'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
      const eq = normalized.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = normalized.slice(0, eq).trim();
      let value = normalized.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function maskSecret(value) {
  if (!value) {
    return '(empty)';
  }
  return value.length <= 8 ? '***' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function runGit(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function buildAuthenticatedRemote(repoUrl, token) {
  // Accept https://github.com/owner/repo(.git) and inject the token.
  const cleaned = repoUrl.replace(/^https?:\/\//, '').replace(/^[^@]*@/, '');
  return `https://x-access-token:${token}@${cleaned}`;
}

async function getLocalHeadCommit() {
  const res = await runGit(['rev-parse', 'HEAD']);
  if (res.code !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${res.stderr}`);
  }
  return res.stdout;
}

async function pushToGitHub(branch) {
  const token = env('GITHUB_TOKEN');
  const repoUrl = env('GITHUB_REPO_URL');
  if (!token || !repoUrl) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO_URL are required to push (set them in your env).');
  }

  // Commit any pending working-tree changes so the deploy ships them.
  const status = await runGit(['status', '--porcelain']);
  if (status.stdout) {
    log('Working tree has changes — committing before push.');
    await runGit(['add', '-A']);
    const commit = await runGit(['commit', '-m', 'IVX ship: deploy + proof runner', '--no-verify']);
    if (commit.code !== 0 && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
      warn(`git commit reported: ${commit.stderr || commit.stdout}`);
    }
  }

  const remote = buildAuthenticatedRemote(repoUrl, token);
  log(`Pushing HEAD → ${repoUrl} (${branch})`);
  const push = await runGit(['push', remote, `HEAD:${branch}`]);
  if (push.code !== 0) {
    throw new Error(`git push failed: ${push.stderr || push.stdout}`);
  }
  ok('Pushed to GitHub.');
}

async function renderApi(path, options = {}) {
  const key = env('RENDER_API_KEY');
  if (!key) {
    throw new Error('RENDER_API_KEY is required.');
  }
  const res = await fetch(`https://api.render.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.ok, json, text };
}

async function triggerRenderDeploy() {
  const serviceId = env('RENDER_SERVICE_ID');
  if (!serviceId) {
    throw new Error('RENDER_SERVICE_ID is required.');
  }
  log('Triggering Render deploy…');
  const res = await renderApi(`/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  if (!res.ok) {
    throw new Error(`Render deploy trigger failed (HTTP ${res.status}): ${res.text}`);
  }
  const deployId = res.json?.id ?? res.json?.deploy?.id ?? null;
  if (!deployId) {
    throw new Error(`Render deploy trigger returned no deploy id: ${res.text}`);
  }
  ok(`Render deploy created: ${deployId}`);
  return deployId;
}

async function waitForRenderDeploy(deployId, { timeoutMs = 15 * 60 * 1000, intervalMs = 10000 } = {}) {
  const serviceId = env('RENDER_SERVICE_ID');
  const deadline = Date.now() + timeoutMs;
  const liveStatuses = new Set(['live']);
  const failStatuses = new Set(['build_failed', 'update_failed', 'canceled', 'deactivated', 'pre_deploy_failed']);
  let lastStatus = '';
  while (Date.now() < deadline) {
    const res = await renderApi(`/v1/services/${serviceId}/deploys/${deployId}`);
    const status = res.json?.status ?? res.json?.deploy?.status ?? 'unknown';
    if (status !== lastStatus) {
      log(`Render deploy status: ${status}`);
      lastStatus = status;
    }
    if (liveStatuses.has(status)) {
      ok('Render deploy is LIVE.');
      return { status, commit: res.json?.commit?.id ?? res.json?.deploy?.commit?.id ?? null };
    }
    if (failStatuses.has(status)) {
      throw new Error(`Render deploy ended with status: ${status}`);
    }
    await delay(intervalMs);
  }
  throw new Error('Timed out waiting for Render deploy to go live.');
}

async function fetchHealth(baseUrl) {
  const res = await fetch(`${baseUrl}/health`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function waitForLiveCommit(baseUrl, expectedCommit, { timeoutMs = 10 * 60 * 1000, intervalMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const health = await fetchHealth(baseUrl);
      const liveCommit = health.json?.commit ?? '';
      if (liveCommit !== last) {
        log(`Live /health commit: ${liveCommit?.slice(0, 8) || 'unknown'} (HTTP ${health.status})`);
        last = liveCommit;
      }
      if (health.status === 200 && expectedCommit && liveCommit && liveCommit.startsWith(expectedCommit.slice(0, 12))) {
        return health;
      }
      if (health.status === 200 && !expectedCommit) {
        return health;
      }
    } catch (err) {
      warn(`health poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
    await delay(intervalMs);
  }
  throw new Error('Timed out waiting for the live commit to match the shipped commit.');
}

function runLiveProof() {
  return new Promise((resolvePromise) => {
    if (!existsSync(LIVE_PROOF_SCRIPT)) {
      warn('ivx-live-proof.mjs not found — skipping feature proof.');
      resolvePromise({ code: 0, skipped: true });
      return;
    }
    log('Running feature proof: ivx-live-proof.mjs (target=public)…');
    const child = spawn(process.execPath, [LIVE_PROOF_SCRIPT], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: { ...process.env, IVX_PROOF_TARGET: process.env.IVX_PROOF_TARGET ?? 'public' },
    });
    child.on('close', (code) => resolvePromise({ code: code ?? 1, skipped: false }));
    child.on('error', () => resolvePromise({ code: 1, skipped: false }));
  });
}

function printTable(rows) {
  const label = (s) => s.padEnd(34, ' ');
  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━ IVX SHIP & PROOF REPORT ━━━━━━━━━━━━━━━━━━${RESET}`);
  for (const [k, v] of rows) {
    console.log(`  ${label(k)} ${v}`);
  }
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);
}

async function main() {
  loadDotEnvFiles();
  const baseUrl = env('PRODUCTION_BASE_URL') || 'https://api.ivxholding.com';
  const branch = env('IVX_SHIP_BRANCH') || 'main';
  const skipPush = env('IVX_SHIP_SKIP_PUSH') === '1';
  const skipProof = env('IVX_SHIP_SKIP_PROOF') === '1';

  console.log(`\n${BOLD}IVX — One-Command Ship & Prove${RESET}`);
  log(`Base URL:        ${baseUrl}`);
  log(`Branch:          ${branch}`);
  log(`GITHUB_TOKEN:    ${maskSecret(env('GITHUB_TOKEN'))}`);
  log(`RENDER_API_KEY:  ${maskSecret(env('RENDER_API_KEY'))}`);
  log(`RENDER_SERVICE:  ${env('RENDER_SERVICE_ID') || '(empty)'}`);

  const report = [];
  let deployed = false;
  let verified = false;
  let blocker = '';

  try {
    const localCommit = await getLocalHeadCommit();
    log(`Local HEAD commit: ${localCommit.slice(0, 8)}`);
    report.push(['Shipped commit', localCommit.slice(0, 8)]);

    if (!skipPush) {
      await pushToGitHub(branch);
    } else {
      warn('IVX_SHIP_SKIP_PUSH=1 — skipping git push.');
    }

    const deployId = await triggerRenderDeploy();
    report.push(['Deploy ID', deployId]);

    const deployResult = await waitForRenderDeploy(deployId);
    report.push(['Render deploy status', deployResult.status]);

    const health = await waitForLiveCommit(baseUrl, localCommit);
    deployed = true;
    report.push(['Live URL', baseUrl]);
    report.push(['GET /health', `${health.status} (${health.json?.status ?? 'unknown'})`]);
    report.push(['Running commit', (health.json?.commit ?? 'unknown').slice(0, 8)]);
    report.push(['Active model', health.json?.openAIModel ?? 'unknown']);
    report.push(['Boot time', health.json?.bootTime ?? 'unknown']);

    if (!skipProof) {
      const proof = await runLiveProof();
      verified = !proof.skipped && proof.code === 0;
      report.push(['Feature proof script', proof.skipped ? 'SKIPPED' : proof.code === 0 ? 'PASSED' : `FAILED (exit ${proof.code})`]);
    } else {
      warn('IVX_SHIP_SKIP_PROOF=1 — skipping feature proof.');
      report.push(['Feature proof script', 'SKIPPED']);
    }
  } catch (err) {
    blocker = err instanceof Error ? err.message : String(err);
    fail(blocker);
  }

  report.unshift(['VERIFIED', verified ? 'VERIFIED ✅' : 'NOT VERIFIED ❌']);
  report.unshift(['DEPLOYED', deployed ? 'DEPLOYED ✅' : 'NOT DEPLOYED ❌']);
  if (blocker) {
    report.push(['Blocker', blocker]);
  }
  printTable(report);
  process.exit(deployed && verified ? 0 : 1);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
