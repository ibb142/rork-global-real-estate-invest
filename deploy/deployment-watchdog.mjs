#!/usr/bin/env node
// Optional: load a local .env if dotenv is available. Never required.
try { await import('dotenv/config'); } catch { /* dotenv not installed — rely on process env */ }

/**
 * IVX Deployment Watchdog
 *
 * Closes the deployment chain end-to-end and writes machine-readable proof:
 *
 *   Rork Sandbox  ->  GitHub (main)  ->  Render deploy  ->  Production API (/version)
 *
 * For each run it:
 *   1. Reads the local commit (git HEAD).
 *   2. Pushes the working tree to GitHub via expo/sync-github.mjs (single atomic commit).
 *   3. Reads back the GitHub `main` head commit (Git Refs API).
 *   4. Triggers a Render deploy and polls until it is live (or reuses the latest deploy).
 *   5. Reads the production commit from `${PRODUCTION_BASE_URL}/version`.
 *   6. Compares every node and writes DEPLOYMENT_PROOF.json at the repo root.
 *
 * It NEVER fabricates a match. If a node cannot be reached or a credential is
 * missing, it records the EXACT failing node + the EXACT missing permission,
 * sets `match:false`, and exits non-zero.
 *
 * Usage:
 *   node deploy/deployment-watchdog.mjs              # verify-only (no push/deploy)
 *   node deploy/deployment-watchdog.mjs --deploy     # push + deploy + verify
 *   node deploy/deployment-watchdog.mjs --deploy --wait 600
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PROOF_PATH = join(REPO_ROOT, 'DEPLOYMENT_PROOF.json');

const args = process.argv.slice(2);
const DO_DEPLOY = args.includes('--deploy');
const waitIdx = args.indexOf('--wait');
const MAX_WAIT_SECONDS = waitIdx !== -1 && args[waitIdx + 1] ? parseInt(args[waitIdx + 1], 10) : 480;

const GITHUB_API = 'https://api.github.com';
const RENDER_API = 'https://api.render.com/v1';

const env = process.env;
const GITHUB_TOKEN = env.GITHUB_TOKEN;
const GITHUB_BRANCH = env.GITHUB_BRANCH || 'main';
const RENDER_API_KEY = env.RENDER_API_KEY;
const RENDER_SERVICE_ID = env.RENDER_SERVICE_ID;
const PRODUCTION_BASE_URL = (env.PRODUCTION_BASE_URL || env.EXPO_PUBLIC_IVX_API_BASE_URL || '').replace(/\/$/, '');

/** @returns {string} owner/repo slug or '' */
function parseRepoSlug(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^[^/\s]+\/[^/\s]+$/.test(v)) return v.replace(/\.git$/i, '');
  const m = v.match(/github\.com[/:]([^/\s]+)\/([^/.\s]+)(?:\.git)?/i);
  return m ? `${m[1]}/${m[2]}` : '';
}
const REPO_SLUG = parseRepoSlug(env.GITHUB_REPO) || parseRepoSlug(env.GITHUB_REPO_URL);

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return '';
  }
}

function short(sha) {
  return sha ? String(sha).slice(0, 8) : '';
}

const proof = {
  generatedBy: 'deploy/deployment-watchdog.mjs',
  verificationTimestamp: new Date().toISOString(),
  mode: DO_DEPLOY ? 'deploy+verify' : 'verify-only',
  localCommit: '',
  syncedCommit: '',
  githubCommit: '',
  renderCommit: '',
  productionCommit: '',
  match: false,
  failingNode: null,
  missingPermission: null,
  nodes: {
    sandbox: { ok: false, detail: '' },
    githubPush: { ok: false, detail: '' },
    github: { ok: false, detail: '' },
    render: { ok: false, detail: '' },
    production: { ok: false, detail: '' },
  },
};

/** Records a failing node + missing permission, writes proof, and exits 1. */
function fail(node, missingPermission, detail) {
  proof.failingNode = node;
  proof.missingPermission = missingPermission;
  if (proof.nodes[node]) proof.nodes[node].detail = detail;
  flush();
  console.error(`\nFAILING NODE: ${node}`);
  console.error(`MISSING PERMISSION: ${missingPermission}`);
  console.error(`DETAIL: ${detail}`);
  process.exit(1);
}

function flush() {
  writeFileSync(PROOF_PATH, JSON.stringify(proof, null, 2) + '\n');
}

async function ghFetch(path) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ivx-deployment-watchdog',
    },
  });
  return res;
}

async function renderFetch(path, init = {}) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res;
}

async function main() {
  // ── Node 1: sandbox ────────────────────────────────────────────────────
  proof.localCommit = gitHead();
  if (!proof.localCommit) {
    fail('sandbox', 'git access in sandbox', 'Could not read git HEAD from the sandbox.');
  }
  proof.nodes.sandbox.ok = true;
  proof.nodes.sandbox.detail = `local HEAD ${short(proof.localCommit)}`;
  console.log(`[watchdog] local commit: ${short(proof.localCommit)}`);

  // ── Node 2: Rork Sandbox -> GitHub (push) ──────────────────────────────
  if (DO_DEPLOY) {
    if (!GITHUB_TOKEN) {
      fail('githubPush', 'GITHUB_TOKEN injected into the deploy process env',
        'GITHUB_TOKEN is not present in this process environment, so the sandbox cannot push to GitHub.');
    }
    if (!REPO_SLUG) {
      fail('githubPush', 'GITHUB_REPO_URL injected into the deploy process env',
        'GITHUB_REPO / GITHUB_REPO_URL is not present, so the target GitHub repository is unknown.');
    }
    try {
      console.log('[watchdog] pushing working tree to GitHub via expo/sync-github.mjs ...');
      execFileSync(process.execPath, [join(REPO_ROOT, 'expo', 'sync-github.mjs'),
        '--message', `watchdog deploy ${short(proof.localCommit)} ${new Date().toISOString()}`],
        { cwd: join(REPO_ROOT, 'expo'), env: { ...env }, stdio: 'inherit', timeout: 180_000 });
      proof.nodes.githubPush.ok = true;
      proof.nodes.githubPush.detail = 'sync-github.mjs completed';
    } catch (err) {
      fail('githubPush', 'valid GITHUB_TOKEN with push scope on the target repo',
        `sync-github.mjs failed: ${err.message}`);
    }
  } else {
    proof.nodes.githubPush.detail = 'skipped (verify-only mode; pass --deploy to push)';
  }

  // ── Node 3: GitHub head commit ─────────────────────────────────────────
  if (GITHUB_TOKEN && REPO_SLUG) {
    try {
      const res = await ghFetch(`/repos/${REPO_SLUG}/git/refs/heads/${GITHUB_BRANCH}`);
      if (!res.ok) {
        fail('github', 'GITHUB_TOKEN with repo read access',
          `GitHub refs API returned HTTP ${res.status} for ${REPO_SLUG}@${GITHUB_BRANCH}.`);
      }
      const data = await res.json();
      proof.githubCommit = data?.object?.sha || '';
      proof.syncedCommit = proof.githubCommit;
      proof.nodes.github.ok = !!proof.githubCommit;
      proof.nodes.github.detail = `${REPO_SLUG}@${GITHUB_BRANCH} head ${short(proof.githubCommit)}`;
      console.log(`[watchdog] github commit: ${short(proof.githubCommit)}`);
    } catch (err) {
      fail('github', 'network egress + GITHUB_TOKEN', `GitHub API request failed: ${err.message}`);
    }
  } else {
    proof.nodes.github.detail = !GITHUB_TOKEN
      ? 'GITHUB_TOKEN missing from process env'
      : 'GITHUB_REPO_URL missing from process env';
  }

  // ── Node 4: Render deploy ──────────────────────────────────────────────
  if (RENDER_API_KEY && RENDER_SERVICE_ID) {
    try {
      if (DO_DEPLOY) {
        console.log('[watchdog] triggering Render deploy ...');
        const trig = await renderFetch(`/services/${RENDER_SERVICE_ID}/deploys`, {
          method: 'POST',
          body: JSON.stringify({ clearCache: 'do_not_clear' }),
        });
        if (!trig.ok) {
          fail('render', 'RENDER_API_KEY with deploy permission on RENDER_SERVICE_ID',
            `Render deploy trigger returned HTTP ${trig.status}.`);
        }
      }
      const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;
      let live = null;
      do {
        const res = await renderFetch(`/services/${RENDER_SERVICE_ID}/deploys?limit=1`);
        if (!res.ok) {
          fail('render', 'RENDER_API_KEY with read access on RENDER_SERVICE_ID',
            `Render deploys API returned HTTP ${res.status}.`);
        }
        const list = await res.json();
        const d = Array.isArray(list) ? list[0]?.deploy : null;
        if (d) {
          if (d.status === 'live') { live = d; break; }
          if (['build_failed', 'update_failed', 'canceled', 'deactivated'].includes(d.status)) {
            fail('render', 'a successful Render build',
              `Latest Render deploy ended with status "${d.status}" (commit ${short(d.commit?.id)}).`);
          }
          if (!DO_DEPLOY) { live = d; break; }
        }
        await new Promise((r) => setTimeout(r, 10_000));
      } while (Date.now() < deadline);

      if (!live && DO_DEPLOY) {
        fail('render', 'a faster/successful Render build', `Render deploy did not reach "live" within ${MAX_WAIT_SECONDS}s.`);
      }
      proof.renderCommit = live?.commit?.id || '';
      proof.nodes.render.ok = !!proof.renderCommit;
      proof.nodes.render.detail = live ? `deploy ${live.id} status ${live.status} commit ${short(proof.renderCommit)}` : 'no deploy info';
      console.log(`[watchdog] render commit: ${short(proof.renderCommit)}`);
    } catch (err) {
      fail('render', 'network egress + RENDER_API_KEY', `Render API request failed: ${err.message}`);
    }
  } else {
    proof.nodes.render.detail = !RENDER_API_KEY
      ? 'RENDER_API_KEY missing from process env'
      : 'RENDER_SERVICE_ID missing from process env';
  }

  // ── Node 5: Production /version ────────────────────────────────────────
  if (PRODUCTION_BASE_URL) {
    try {
      const res = await fetch(`${PRODUCTION_BASE_URL}/version`, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        fail('production', 'reachable production /version endpoint',
          `${PRODUCTION_BASE_URL}/version returned HTTP ${res.status}.`);
      }
      const data = await res.json();
      proof.productionCommit = data?.commit || data?.commitShort || '';
      proof.nodes.production.ok = !!proof.productionCommit;
      proof.nodes.production.detail = `version commit ${short(proof.productionCommit)} marker ${data?.deploymentMarker || 'n/a'}`;
      console.log(`[watchdog] production commit: ${short(proof.productionCommit)}`);
    } catch (err) {
      fail('production', 'network egress to PRODUCTION_BASE_URL', `Production /version request failed: ${err.message}`);
    }
  } else {
    proof.nodes.production.detail = 'PRODUCTION_BASE_URL missing from process env';
  }

  // ── Match evaluation (never fabricated) ────────────────────────────────
  const local = proof.localCommit;
  const gh = proof.githubCommit;
  const prod = proof.productionCommit;
  proof.match = !!(local && gh && prod && local === gh && short(gh) === short(prod));

  if (!proof.match) {
    if (!gh) proof.failingNode = proof.failingNode || 'github';
    else if (local !== gh) proof.failingNode = 'githubPush';
    else if (!prod) proof.failingNode = 'production';
    else if (short(gh) !== short(prod)) proof.failingNode = 'render';
    proof.missingPermission = proof.missingPermission ||
      'credentials (GITHUB_TOKEN / GITHUB_REPO_URL / RENDER_API_KEY / RENDER_SERVICE_ID / PRODUCTION_BASE_URL) injected into the deploy process env';
  }

  flush();
  console.log(`\n[watchdog] match=${proof.match} -> proof written to ${PROOF_PATH}`);
  process.exit(proof.match ? 0 : 1);
}

main().catch((err) => {
  proof.failingNode = proof.failingNode || 'sandbox';
  proof.missingPermission = proof.missingPermission || 'unexpected watchdog error';
  proof.nodes.sandbox.detail = `watchdog crashed: ${err?.message || err}`;
  flush();
  console.error(`[watchdog] crashed: ${err?.message || err}`);
  process.exit(1);
});
