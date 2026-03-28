#!/usr/bin/env node
/**
 * IVX Holdings — GitHub Sync (Git Tree API)
 * 
 * Pushes all local files to GitHub in a single atomic commit.
 * Uses the Git Tree API for speed (1 API call vs N file-by-file calls).
 * 
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node sync-github.mjs
 *   GITHUB_TOKEN=ghp_xxx node sync-github.mjs --dry-run
 *   GITHUB_TOKEN=ghp_xxx node sync-github.mjs --message "feat: add new screen"
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'ibb142/rork-global-real-estate-invest';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com';
const PROJECT_ROOT = process.env.SYNC_ROOT || '/home/user/rork-app';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const msgIdx = args.indexOf('--message');
const COMMIT_MESSAGE = msgIdx !== -1 && args[msgIdx + 1]
  ? args[msgIdx + 1]
  : `sync: auto-sync ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', '.rork',
  '.DS_Store', '__pycache__', 'tmp', 'core',
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

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB GitHub limit for blobs

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

async function githubFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });

  if (!res.ok && res.status !== 404 && res.status !== 422) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function ensureBranch() {
  const ref = await githubFetch(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  if (ref) return ref.object.sha;

  console.log(`  Branch "${BRANCH}" not found, creating from default...`);
  const repo = await githubFetch(`/repos/${REPO}`);
  const defaultRef = await githubFetch(`/repos/${REPO}/git/ref/heads/${repo.default_branch}`);
  if (!defaultRef) throw new Error('Cannot find default branch');

  await githubFetch(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: defaultRef.object.sha }),
  });
  return defaultRef.object.sha;
}

async function getRemoteTree(commitSha) {
  const commit = await githubFetch(`/repos/${REPO}/git/commits/${commitSha}`);
  if (!commit) return { treeSha: null, files: new Map() };

  const tree = await githubFetch(`/repos/${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  const files = new Map();
  if (tree?.tree) {
    for (const item of tree.tree) {
      if (item.type === 'blob') {
        files.set(item.path, item.sha);
      }
    }
  }
  return { treeSha: commit.tree.sha, files };
}

async function createBlob(content) {
  const result = await githubFetch(`/repos/${REPO}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    }),
  });
  return result.sha;
}

async function createTree(baseTreeSha, treeItems) {
  const result = await githubFetch(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  });
  return result.sha;
}

async function createCommit(treeSha, parentSha, message) {
  const result = await githubFetch(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
    }),
  });
  return result.sha;
}

async function updateRef(commitSha) {
  await githubFetch(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: false }),
  });
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is not set');
    process.exit(1);
  }

  const startTime = Date.now();
  console.log(`\n========================================`);
  console.log(`  IVX Holdings — GitHub Sync`);
  console.log(`  Repo: ${REPO} (${BRANCH})`);
  console.log(`  ${DRY_RUN ? 'DRY RUN — no changes will be made' : 'LIVE — changes will be pushed'}`);
  console.log(`========================================\n`);

  console.log('[1/6] Verifying branch...');
  const headSha = await ensureBranch();
  console.log(`  HEAD: ${headSha.slice(0, 7)}`);

  console.log('[2/6] Scanning local files...');
  const localFiles = getAllFiles(PROJECT_ROOT);
  console.log(`  Found ${localFiles.length} files locally`);

  console.log('[3/6] Fetching remote tree...');
  const { treeSha: baseTreeSha, files: remoteFiles } = await getRemoteTree(headSha);
  console.log(`  Remote has ${remoteFiles.size} files`);

  console.log('[4/6] Computing diff...');
  const toUpload = [];
  const unchanged = [];
  const deleted = [];

  for (const file of localFiles) {
    const content = readFileSync(file.fullPath);
    const localSha = gitBlobSha(content);
    const remoteSha = remoteFiles.get(file.path);

    if (remoteSha === localSha) {
      unchanged.push(file.path);
    } else {
      toUpload.push({ ...file, content, localSha, isNew: !remoteSha });
    }
  }

  const localPaths = new Set(localFiles.map(f => f.path));
  for (const [remotePath] of remoteFiles) {
    if (!localPaths.has(remotePath)) {
      deleted.push(remotePath);
    }
  }

  console.log(`  Changed/New: ${toUpload.length}`);
  console.log(`  Unchanged:   ${unchanged.length}`);
  console.log(`  Deleted:     ${deleted.length}`);

  if (toUpload.length === 0 && deleted.length === 0) {
    console.log('\n  Everything is in sync. Nothing to push.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN REPORT ---');
    for (const f of toUpload) {
      console.log(`  ${f.isNew ? 'ADD' : 'MOD'} ${f.path} (${(f.size / 1024).toFixed(1)}KB)`);
    }
    for (const p of deleted) {
      console.log(`  DEL ${p}`);
    }
    console.log(`\nTotal: ${toUpload.length} uploads, ${deleted.length} deletes`);
    return;
  }

  console.log('[5/6] Uploading blobs & building tree...');
  const treeItems = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
    const batch = toUpload.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const blobSha = await createBlob(file.content);
        process.stdout.write(`  + ${file.path} (${file.isNew ? 'new' : 'updated'})\n`);
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobSha,
        };
      })
    );
    treeItems.push(...results);
  }

  for (const deletedPath of deleted) {
    treeItems.push({
      path: deletedPath,
      mode: '100644',
      type: 'blob',
      sha: null,
    });
    console.log(`  - ${deletedPath} (deleted)`);
  }

  console.log('[6/6] Creating commit & updating ref...');
  const newTreeSha = await createTree(baseTreeSha, treeItems);
  const newCommitSha = await createCommit(newTreeSha, headSha, COMMIT_MESSAGE);
  await updateRef(newCommitSha);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n========================================`);
  console.log(`  Sync Complete`);
  console.log(`  Commit: ${newCommitSha.slice(0, 7)}`);
  console.log(`  Files:  +${toUpload.filter(f => f.isNew).length} new, ~${toUpload.filter(f => !f.isNew).length} modified, -${deleted.length} deleted`);
  console.log(`  Time:   ${elapsed}s`);
  console.log(`  URL:    https://github.com/${REPO}/commit/${newCommitSha}`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
