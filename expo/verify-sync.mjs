#!/usr/bin/env node
import 'dotenv/config';

/**
 * IVX Holdings — Sync Verification & Health Check
 * 
 * Compares local files against GitHub remote to verify sync integrity.
 * Reports drift, missing files, and pipeline status.
 * 
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node verify-sync.mjs
 *   GITHUB_TOKEN=ghp_xxx node verify-sync.mjs --fix   (auto-sync if drift found)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { getSyncPaths } from './sync-paths.mjs';

const { syncRoot: PROJECT_ROOT, appRoot: APP_ROOT } = getSyncPaths(import.meta.url);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'ibb142/rork-global-real-estate-invest';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com';

const FIX = process.argv.includes('--fix');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', '.rork',
  '.DS_Store', '__pycache__', 'tmp', 'core',
  'dist-audit-ios', 'dist-audit-ios-final', 'dist-audit-ios-postfix',
  'dist-audit-web', 'dist-audit-web-final', 'dist-audit-web-postfix',
]);

const IGNORE_FILES = new Set([
  '.env', '.env.production', '.env.staging', '.env.local',
  '.env.development', 'rork-eslint.config.js', 'bun.lock',
  'package-lock.json', 'yarn.lock',
]);

const IGNORE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.mp4', '.mov', '.avi', '.lock',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function getAllFiles(dir, base = dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry) || IGNORE_FILES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...getAllFiles(full, base));
    } else {
      const ext = entry.includes('.') ? '.' + entry.split('.').pop().toLowerCase() : '';
      if (!IGNORE_EXTENSIONS.has(ext) && stat.size <= MAX_FILE_SIZE) {
        files.push({
          path: relative(base, full),
          fullPath: full,
          size: stat.size,
        });
      }
    }
  }
  return files;
}

function gitBlobSha(content) {
  const header = `blob ${content.length}\0`;
  return createHash('sha1').update(Buffer.concat([Buffer.from(header), content])).digest('hex');
}

async function githubFetch(path) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function getRemoteTree() {
  const ref = await githubFetch(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  if (!ref) return { sha: null, files: new Map() };

  const commit = await githubFetch(`/repos/${REPO}/git/commits/${ref.object.sha}`);
  const tree = await githubFetch(`/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);

  const files = new Map();
  if (tree?.tree) {
    for (const item of tree.tree) {
      if (item.type === 'blob') files.set(item.path, item.sha);
    }
  }
  return { sha: ref.object.sha, files };
}

async function getLatestWorkflowRuns() {
  const runs = await githubFetch(`/repos/${REPO}/actions/runs?per_page=5&branch=${BRANCH}`);
  if (!runs?.workflow_runs) return [];
  return runs.workflow_runs.map(r => ({
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    started: r.run_started_at,
    url: r.html_url,
  }));
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is not set');
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`  IVX Holdings — Sync Verification`);
  console.log(`  Repo: ${REPO} (${BRANCH})`);
  console.log(`========================================\n`);

  console.log('[1/4] Scanning local files...');
  const localFiles = getAllFiles(PROJECT_ROOT);
  console.log(`  Local: ${localFiles.length} files`);

  console.log('[2/4] Fetching remote tree...');
  const { sha: remoteSha, files: remoteFiles } = await getRemoteTree();
  if (!remoteSha) {
    console.error('  Remote branch not found — nothing to verify');
    process.exit(1);
  }
  console.log(`  Remote: ${remoteFiles.size} files (HEAD: ${remoteSha.slice(0, 7)})`);

  console.log('[3/4] Computing drift...');
  const drift = { modified: [], localOnly: [], remoteOnly: [] };

  const localPaths = new Set();
  for (const file of localFiles) {
    localPaths.add(file.path);
    const content = readFileSync(file.fullPath);
    const localSha = gitBlobSha(content);
    const remoteBlobSha = remoteFiles.get(file.path);

    if (!remoteBlobSha) {
      drift.localOnly.push(file.path);
    } else if (localSha !== remoteBlobSha) {
      drift.modified.push(file.path);
    }
  }

  for (const [remotePath] of remoteFiles) {
    if (!localPaths.has(remotePath)) {
      drift.remoteOnly.push(remotePath);
    }
  }

  const totalDrift = drift.modified.length + drift.localOnly.length + drift.remoteOnly.length;
  const inSync = totalDrift === 0;

  console.log('[4/4] Checking pipeline status...');
  let pipelineRuns = [];
  try {
    pipelineRuns = await getLatestWorkflowRuns();
  } catch {
    console.log('  Could not fetch workflow runs');
  }

  console.log(`\n========================================`);
  console.log(`  VERIFICATION REPORT`);
  console.log(`========================================\n`);

  if (inSync) {
    console.log('  STATUS: IN SYNC');
    console.log(`  All ${localFiles.length} tracked files match remote.\n`);
  } else {
    console.log(`  STATUS: DRIFT DETECTED (${totalDrift} differences)\n`);

    if (drift.modified.length > 0) {
      console.log(`  Modified locally (${drift.modified.length}):`);
      for (const f of drift.modified.slice(0, 20)) console.log('    ~ ' + f);
      if (drift.modified.length > 20) console.log(`    ... and ${String(drift.modified.length - 20)} more`);
      console.log();
    }

    if (drift.localOnly.length > 0) {
      console.log(`  Local only — not on GitHub (${drift.localOnly.length}):`);
      for (const f of drift.localOnly.slice(0, 20)) console.log('    + ' + f);
      if (drift.localOnly.length > 20) console.log(`    ... and ${String(drift.localOnly.length - 20)} more`);
      console.log();
    }

    if (drift.remoteOnly.length > 0) {
      console.log(`  Remote only — not local (${drift.remoteOnly.length}):`);
      for (const f of drift.remoteOnly.slice(0, 20)) console.log('    - ' + f);
      if (drift.remoteOnly.length > 20) console.log(`    ... and ${String(drift.remoteOnly.length - 20)} more`);
      console.log();
    }
  }

  if (pipelineRuns.length > 0) {
    console.log('  PIPELINE STATUS:');
    for (const run of pipelineRuns) {
      const icon = run.conclusion === 'success' ? 'PASS'
        : run.conclusion === 'failure' ? 'FAIL'
        : run.status === 'in_progress' ? 'RUNNING'
        : run.conclusion || run.status;
      console.log(`    [${icon}] ${run.name} (${run.started?.slice(0, 16).replace('T', ' ') || 'unknown'})`);
    }
    console.log();
  }

  console.log('========================================\n');

  if (!inSync && FIX) {
    console.log('  --fix flag detected. Running sync now...\n');
    const { execFileSync } = await import('child_process');
    try {
      execFileSync(
        process.execPath,
        [join(APP_ROOT, 'sync-github.mjs'), '--message', `fix: resolve drift (${totalDrift} files)`],
        { env: { ...process.env, GITHUB_TOKEN, SYNC_ROOT: PROJECT_ROOT }, stdio: 'inherit', cwd: APP_ROOT, timeout: 120_000 }
      );
    } catch (err) {
      console.error(`Sync failed: ${err.message}`);
      process.exit(1);
    }
  }

  process.exit(inSync ? 0 : 1);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
