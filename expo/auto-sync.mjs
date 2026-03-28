#!/usr/bin/env node
/**
 * IVX Holdings — Auto Sync Watcher
 * 
 * Watches for file changes and automatically syncs to GitHub.
 * Batches changes over a configurable interval to avoid excessive commits.
 * 
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node auto-sync.mjs
 *   GITHUB_TOKEN=ghp_xxx node auto-sync.mjs --interval 120
 *   GITHUB_TOKEN=ghp_xxx node auto-sync.mjs --once
 */

import { watch, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const PROJECT_ROOT = process.env.SYNC_ROOT || '/home/user/rork-app';
const SYNC_SCRIPT = join(PROJECT_ROOT, 'expo', 'sync-github.mjs');
const STATE_DIR = join(PROJECT_ROOT, 'expo', 'tmp');
const STATE_FILE = join(STATE_DIR, 'sync-state.json');

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const intervalIdx = args.indexOf('--interval');
const INTERVAL_SECONDS = intervalIdx !== -1 && args[intervalIdx + 1]
  ? parseInt(args[intervalIdx + 1], 10)
  : 60;

const WATCH_DIRS = ['app', 'components', 'lib', 'constants', 'types', 'mocks', 'deploy', 'ivxholding-landing'];

const IGNORE = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', '.rork',
  'tmp', 'core', '.DS_Store',
]);

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return { lastSync: null, syncCount: 0, errors: [] };
}

function saveState(state) {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getChangeSummary(changedFiles) {
  const categories = { app: 0, lib: 0, components: 0, deploy: 0, other: 0 };
  for (const f of changedFiles) {
    if (f.startsWith('app/')) categories.app++;
    else if (f.startsWith('lib/')) categories.lib++;
    else if (f.startsWith('components/')) categories.components++;
    else if (f.startsWith('deploy/') || f.startsWith('ivxholding-landing/')) categories.deploy++;
    else categories.other++;
  }

  const parts = [];
  if (categories.app > 0) parts.push(`${categories.app} screen${categories.app > 1 ? 's' : ''}`);
  if (categories.lib > 0) parts.push(`${categories.lib} lib`);
  if (categories.components > 0) parts.push(`${categories.components} component${categories.components > 1 ? 's' : ''}`);
  if (categories.deploy > 0) parts.push(`${categories.deploy} deploy`);
  if (categories.other > 0) parts.push(`${categories.other} other`);

  return parts.join(', ') || 'misc changes';
}

async function runSync(changedFiles = []) {
  const state = loadState();
  const summary = changedFiles.length > 0
    ? getChangeSummary(changedFiles)
    : 'full sync';

  const message = `auto-sync: ${summary} [${new Date().toISOString().slice(0, 16).replace('T', ' ')}]`;

  console.log(`\n[sync] Starting: ${message}`);
  console.log(`[sync] Changed files: ${changedFiles.length || 'all'}`);

  try {
    execSync(
      `node "${SYNC_SCRIPT}" --message "${message}"`,
      {
        env: { ...process.env, GITHUB_TOKEN },
        stdio: 'inherit',
        cwd: dirname(SYNC_SCRIPT),
        timeout: 120_000,
      }
    );

    state.lastSync = new Date().toISOString();
    state.syncCount++;
    state.lastError = null;
    saveState(state);
    console.log(`[sync] Complete. Total syncs: ${state.syncCount}`);
    return true;
  } catch (err) {
    state.lastError = { time: new Date().toISOString(), message: err.message };
    state.errors.push(state.lastError);
    if (state.errors.length > 20) state.errors = state.errors.slice(-20);
    saveState(state);
    console.error(`[sync] Failed: ${err.message}`);
    return false;
  }
}

async function watchAndSync() {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN is not set');
    process.exit(1);
  }

  if (ONCE) {
    console.log('Running one-time sync...');
    const ok = await runSync();
    process.exit(ok ? 0 : 1);
  }

  console.log(`\n========================================`);
  console.log(`  IVX Holdings — Auto Sync Watcher`);
  console.log(`  Interval: ${INTERVAL_SECONDS}s`);
  console.log(`  Watching: ${WATCH_DIRS.join(', ')}`);
  console.log(`========================================\n`);

  console.log('Running initial sync...');
  await runSync();

  let pendingChanges = new Set();
  let syncTimer = null;

  function schedulSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(async () => {
      const files = [...pendingChanges];
      pendingChanges.clear();
      syncTimer = null;
      await runSync(files);
    }, INTERVAL_SECONDS * 1000);
  }

  for (const dir of WATCH_DIRS) {
    const fullDir = join(PROJECT_ROOT, 'expo', dir);
    if (!existsSync(fullDir)) continue;

    try {
      watch(fullDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const parts = filename.split('/');
        if (parts.some(p => IGNORE.has(p))) return;
        if (filename.endsWith('.lock') || filename.endsWith('.DS_Store')) return;

        const relPath = join(dir, filename);
        console.log(`[watch] ${eventType}: ${relPath}`);
        pendingChanges.add(relPath);
        schedulSync();
      });
      console.log(`[watch] Watching: expo/${dir}/`);
    } catch (err) {
      console.warn(`[watch] Cannot watch ${dir}: ${err.message}`);
    }
  }

  const rootFiles = ['package.json', 'app.json', 'tsconfig.json', 'Dockerfile'];
  try {
    watch(join(PROJECT_ROOT, 'expo'), { recursive: false }, (eventType, filename) => {
      if (filename && rootFiles.includes(filename)) {
        console.log(`[watch] ${eventType}: ${filename}`);
        pendingChanges.add(filename);
        schedulSync();
      }
    });
  } catch {}

  console.log('\n[watch] Ready. Waiting for changes...\n');

  process.on('SIGINT', () => {
    console.log('\n[watch] Shutting down...');
    if (pendingChanges.size > 0) {
      console.log(`[watch] ${pendingChanges.size} unsaved changes — running final sync...`);
      void runSync([...pendingChanges]).then(() => process.exit(0));
    } else {
      process.exit(0);
    }
  });
}

void watchAndSync();
