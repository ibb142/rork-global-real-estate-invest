#!/usr/bin/env node
/**
 * IVX — GitHub / Deploy credential & repo diagnostic.
 *
 * Run this where your secrets live (local machine with .env, Render shell, etc.):
 *
 *   GITHUB_TOKEN=ghp_xxx node expo/deploy/scripts/diagnose-github-deploy.mjs
 *
 * This script:
 *   1. Validates GITHUB_REPO_URL against the canonical IVX repo.
 *   2. Tests GitHub authentication without printing the token.
 *   3. Tests push permission to the canonical repo.
 *   4. Tests git remote/fetch against the canonical repo.
 *   5. Reports exactly which secrets are missing or invalid.
 *
 * It does NOT push code or deploy — it only reports readiness.
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepoUrl, CANONICAL_GITHUB_REPO_URL, CANONICAL_GITHUB_REPO_SLUG } from '../../lib/canonical-repo.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function log(msg) { console.log(`${CYAN}[diagnose]${RESET} ${msg}`); }
function ok(msg) { console.log(`${GREEN}[OK]${RESET} ${msg}`); }
function warn(msg) { console.log(`${YELLOW}[WARN]${RESET} ${msg}`); }
function fail(msg) { console.log(`${RED}[FAIL]${RESET} ${msg}`); }

function mask(value) {
  if (!value || typeof value !== 'string') return '(empty)';
  return value.length <= 8 ? '***' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

function run(cmd, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

async function githubApi(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, ok: res.ok, json, text };
}

async function main() {
  console.log('');
  console.log(`${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}${CYAN}  IVX GitHub / Deploy Diagnostic${RESET}`);
  console.log(`${BOLD}${CYAN}  Canonical repo: ${CANONICAL_GITHUB_REPO_SLUG}${RESET}`);
  console.log(`${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log('');

  const report = {
    canonicalRepo: CANONICAL_GITHUB_REPO_URL,
    repoUrlStatus: 'UNKNOWN',
    tokenStatus: 'UNKNOWN',
    authStatus: 'UNKNOWN',
    pushPermission: 'UNKNOWN',
    gitRemoteStatus: 'UNKNOWN',
    gitFetchStatus: 'UNKNOWN',
    blockers: [] as string[],
  };

  // 1. Repo URL validation
  const repoUrl = env('GITHUB_REPO_URL') || env('GITHUB_REPO') || CANONICAL_GITHUB_REPO_URL;
  const repoValidation = validateRepoUrl(repoUrl);
  log(`GITHUB_REPO_URL resolved: ${repoValidation.resolved}`);
  if (repoValidation.error) {
    report.repoUrlStatus = 'MALFORMED';
    report.blockers.push(repoValidation.error);
    fail(`GITHUB_REPO_URL malformed: ${repoValidation.error}`);
  } else if (repoValidation.wasMalformed) {
    report.repoUrlStatus = 'FIXED_TO_CANONICAL';
    warn(`GITHUB_REPO_URL was malformed/placeholder — fixed to canonical repo.`);
  } else {
    report.repoUrlStatus = 'VALID';
    ok('GITHUB_REPO_URL points to canonical IVX repo.');
  }

  // 2. Token presence
  const token = env('GITHUB_TOKEN');
  if (!token) {
    report.tokenStatus = 'MISSING';
    report.blockers.push('GITHUB_TOKEN is not set');
    fail('GITHUB_TOKEN is missing.');
  } else {
    report.tokenStatus = 'PRESENT';
    ok(`GITHUB_TOKEN present (masked: ${mask(token)}).`);
  }

  // 3. GitHub auth test
  if (token) {
    log('Testing GitHub authentication...');
    const auth = await githubApi('/user', token);
    if (auth.ok && auth.json?.login) {
      report.authStatus = 'OK';
      ok(`GitHub auth OK — authenticated as ${auth.json.login}.`);
    } else if (auth.status === 401) {
      report.authStatus = '401_UNAUTHORIZED';
      report.blockers.push('GITHUB_TOKEN is invalid or revoked (401)');
      fail('GitHub token rejected — 401 Unauthorized. Token is dead/revoked.');
    } else if (auth.status === 403) {
      report.authStatus = '403_FORBIDDEN';
      report.blockers.push(`GitHub API returned 403: ${auth.json?.message || auth.text}`);
      fail(`GitHub API forbidden — 403: ${auth.json?.message || auth.text}`);
    } else {
      report.authStatus = `HTTP_${auth.status}`;
      report.blockers.push(`GitHub auth test failed: HTTP ${auth.status}`);
      fail(`GitHub auth test failed: HTTP ${auth.status}.`);
    }
  }

  // 4. Push permission test
  if (token && report.authStatus === 'OK') {
    log('Testing push permission to canonical repo...');
    const perms = await githubApi(`/repos/${CANONICAL_GITHUB_REPO_SLUG}`, token);
    if (perms.ok) {
      const permissions = perms.json?.permissions || {};
      if (permissions.push || permissions.admin || perms.json?.permissions?.maintain) {
        report.pushPermission = 'OK';
        ok('GitHub token has push permission to canonical repo.');
      } else {
        report.pushPermission = 'NO_PUSH';
        report.blockers.push('GITHUB_TOKEN has no push permission to canonical repo');
        fail('GitHub token authenticated but lacks push permission to canonical repo.');
      }
    } else {
      report.pushPermission = `HTTP_${perms.status}`;
      report.blockers.push(`Repo permission check failed: HTTP ${perms.status}`);
      fail(`Repo permission check failed: HTTP ${perms.status}.`);
    }
  }

  // 5. Git remote/fetch test
  log('Testing local git remote...');
  const remote = await run('git', ['remote', '-v']);
  if (remote.stdout) {
    console.log(remote.stdout.split('\n').map(l => `  ${l}`).join('\n'));
  }
  const fetchTest = await run('git', ['fetch', 'origin', '--dry-run']);
  if (fetchTest.code === 0) {
    report.gitFetchStatus = 'OK';
    ok('Git fetch test passed.');
  } else {
    report.gitFetchStatus = 'FAILED';
    report.blockers.push(`git fetch failed: ${fetchTest.stderr || fetchTest.stdout}`);
    fail(`git fetch test failed: ${fetchTest.stderr || fetchTest.stdout}`);
  }

  // Summary
  console.log('');
  console.log(`${BOLD}${report.blockers.length === 0 ? GREEN : RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}  DIAGNOSTIC SUMMARY${RESET}`);
  console.log(`${BOLD}${report.blockers.length === 0 ? GREEN : RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`  CANONICAL_REPO:        ${CANONICAL_GITHUB_REPO_URL}`);
  console.log(`  GITHUB_REPO_URL:       ${repoValidation.resolved}`);
  console.log(`  GITHUB_REPO_URL_STATUS: ${report.repoUrlStatus}`);
  console.log(`  GITHUB_TOKEN_STATUS:   ${report.tokenStatus}`);
  console.log(`  GITHUB_AUTH_STATUS:    ${report.authStatus}`);
  console.log(`  PUSH_PERMISSION:       ${report.pushPermission}`);
  console.log(`  GIT_FETCH_STATUS:      ${report.gitFetchStatus}`);
  if (report.blockers.length > 0) {
    console.log(`  BLOCKERS:`);
    for (const b of report.blockers) {
      console.log(`    - ${b}`);
    }
  }
  console.log(`${BOLD}${report.blockers.length === 0 ? GREEN : RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log('');
  process.exit(report.blockers.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
