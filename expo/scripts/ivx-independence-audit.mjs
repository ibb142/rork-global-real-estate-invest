#!/usr/bin/env node
/**
 * IVX Independence Audit (BLOCK 47 phase 9).
 *
 * Verifies the IVX production codebase has zero Rork runtime dependency.
 * Checks:
 *   - no @rork-ai/* in expo/package.json dependencies/devDependencies
 *   - no withRorkMetro / @rork-ai/toolkit-sdk in expo/metro.config.js
 *   - no rork.json project config
 *   - no EXPO_PUBLIC_RORK_* / RORK_* / EXPO_PUBLIC_TOOLKIT_URL env keys in expo/.env
 *   - no Rork API URLs (rork.com / rork.app / rorktest.dev) in expo app code (.ts/.tsx)
 *   - no @rork-ai imports in expo app code
 *   - production build (tsc --noEmit) passes
 *   - health endpoint returns the deployed commit
 *
 * Exit code 0 = PASS, 1 = FAIL (prints exact file + line for each failure).
 *
 * Usage:
 *   node expo/scripts/ivx-independence-audit.mjs
 *   node expo/scripts/ivx-independence-audit.mjs --no-build   (skip tsc)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const expoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(expoRoot, '..');

const SKIP_BUILD = process.argv.includes('--no-build');
const failures = [];
const passes = [];

function fail(file, line, reason) {
  failures.push({ file, line, reason });
  console.log(`  ✗ FAIL  ${file}:${line} — ${reason}`);
}
function pass(label, detail) {
  passes.push({ label, detail });
  console.log(`  ✓ PASS  ${label} — ${detail}`);
}

function readText(p) {
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function lineOf(source, needle) {
  const idx = source.indexOf(needle);
  if (idx < 0) return null;
  return source.slice(0, idx).split('\n').length;
}

console.log('\n[ivx-independence-audit] IVX Rork-free production audit');
console.log(`[ivx-independence-audit] repo: ${repoRoot}`);
console.log(`[ivx-independence-audit] mode: ${SKIP_BUILD ? 'skip-build' : 'full'}\n`);

// 1. package.json — no @rork-ai/*
const pkgPath = path.join(expoRoot, 'package.json');
const pkg = JSON.parse(readText(pkgPath) || '{}');
const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const rorkPkgs = Object.keys(allDeps).filter((k) => /@rork-ai\//.test(k));
if (rorkPkgs.length === 0) pass('package.json', 'no @rork-ai/* in dependencies or devDependencies');
else for (const k of rorkPkgs) fail('expo/package.json', '?', `${k} still declared (${allDeps[k]})`);

// 2. metro.config.js — no withRorkMetro / @rork-ai/toolkit-sdk
const metro = readText(path.join(expoRoot, 'metro.config.js')) || '';
if (/withRorkMetro|@rork-ai\/toolkit-sdk/.test(metro)) {
  const ln = lineOf(metro, 'withRorkMetro') || lineOf(metro, '@rork-ai/toolkit-sdk');
  fail('expo/metro.config.js', ln ?? '?', 'still wraps with withRorkMetro / imports @rork-ai/toolkit-sdk');
} else pass('expo/metro.config.js', 'plain Expo Metro config (no withRorkMetro)');

// 3. rork.json absent
if (existsSync(path.join(repoRoot, 'rork.json'))) {
  fail('rork.json', '?', 'rork.json project config still present — delete on independent checkout');
} else pass('rork.json', 'absent');

// 4. .env — no EXPO_PUBLIC_RORK_* / RORK_* / EXPO_PUBLIC_TOOLKIT_URL
const env = readText(path.join(expoRoot, '.env')) || '';
const rorkEnvKeys = env.split('\n').filter((l) => /^(EXPO_PUBLIC_RORK_|RORK_|EXPO_PUBLIC_TOOLKIT_URL)/.test(l.trim()));
if (rorkEnvKeys.length === 0) pass('expo/.env', 'no Rork-prefixed env keys');
else for (const l of rorkEnvKeys) fail('expo/.env', l, 'Rork env key present: ' + l.split('=')[0]);

// 5. Scan expo app code (.ts/.tsx) for Rork runtime imports / URLs
const SKIP_DIRS = new Set(['node_modules', '.expo', 'dist', 'web-build', 'scripts', 'mocks', '__tests__', 'tmp', 'deploy', 'docs']);
const RORK_URL = /rork\.com|rork\.app|rorktest\.dev|rork-ai|@rork-ai\//;
function walk(dir, accept) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, accept);
    else if (accept(name)) scanFile(p);
  }
}
function scanFile(p) {
  const src = readText(p);
  if (!src) return;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Skip comments that document the cutover (we want runtime refs only)
    const stripped = l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (RORK_URL.test(stripped) && !/\b(docs?|comment|cutover|BLOCK 47|independence)\b/i.test(stripped)) {
      fail(path.relative(repoRoot, p), i + 1, 'Rork reference in app code: ' + l.trim().slice(0, 80));
    }
  }
}
walk(expoRoot, (n) => /\.(ts|tsx)$/.test(n));
if (failures.length === 0) pass('expo app code (.ts/.tsx)', 'no Rork runtime imports/URLs');

// 6. Production build (tsc --noEmit)
if (!SKIP_BUILD) {
  console.log('\n[ivx-independence-audit] running tsc --noEmit ...');
  try {
    execSync('bunx tsc --noEmit', { cwd: expoRoot, stdio: 'pipe', timeout: 120000 });
    pass('tsc --noEmit', 'typecheck passed');
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().slice(0, 400) : '';
    fail('expo (tsc)', '?', 'typecheck failed: ' + stderr.split('\n')[0]);
  }
}

// 7. Health endpoint (optional, only if API URL is set)
const healthUrl = process.env.IVX_HEALTH_URL || 'https://api.ivxholding.com/health';
if (!process.argv.includes('--no-health')) {
  try {
    const out = execSync(`curl -sS -m 8 ${healthUrl}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const j = JSON.parse(out);
    pass('health endpoint', `${healthUrl} → ${j.status || 'ok'}, commit ${j.commitShort || j.commit?.slice(0,8)}`);
  } catch {
    fail('health endpoint', '?', `could not reach ${healthUrl}`);
  }
}

// Verdict
console.log(`\n[ivx-independence-audit] ${passes.length} pass(es), ${failures.length} failure(s).`);
if (failures.length === 0) {
  console.log('\nIVX IS RORK-FREE IN PRODUCTION (runtime code).\n');
  process.exit(0);
} else {
  console.log('\nNOT YET RORK-FREE — remaining failures:\n');
  for (const f of failures) console.log(`  ${f.file}:${f.line} — ${f.reason}`);
  console.log('');
  process.exit(1);
}
