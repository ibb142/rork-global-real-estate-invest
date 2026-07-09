#!/usr/bin/env node
/**
 * IVX → Rork Independence Cutover v2 (Production-Grade).
 *
 * Safest one-command removal of every Rork build dependency so the Expo app
 * builds + runs on an owner-controlled pipeline (GitHub + Render + Supabase +
 * AWS/S3/CloudFront + IVX backend) with NO Rork toolkit in the bundle.
 *
 * SAFETY FEATURES:
 *   - Dry-run by default (must pass --apply to make changes)
 *   - Automatic backup of every file before modification
 *   - Full audit log written to logs/ivx-cutover-<timestamp>.log
 *   - Rollback instructions printed on any failure
 *   - No secret values ever printed or logged
 *   - Success/failure summary at the end
 *
 * WHAT IT DOES:
 *   1. Backs up package.json, metro.config.js, rork.json, .rorkignore
 *   2. Removes @rork-ai/toolkit-sdk from package.json
 *   3. Rewrites metro.config.js to plain Expo config (drops withRorkMetro)
 *   4. Removes verify-expo-sdk.mjs Rork-presence assertions
 *   5. Deletes rork.json + .rorkignore
 *   6. Reports EXPO_PUBLIC_RORK_* env keys to delete from Render/Expo dashboards
 *   7. Prints rollback instructions
 *   8. Writes full audit log
 *
 * GUARD: This script refuses to run in APPLY mode if rork.json is present
 * AND IVX_ALLOW_RORK_CUTOVER=1 is not set, to prevent bricking the
 * Rork-managed sandbox preview (the SDK is auto-restored there).
 *
 * Usage (on the independent checkout, NOT in the Rork sandbox):
 *   node expo/scripts/ivx-independence-cutover.mjs              # dry-run (safe)
 *   node expo/scripts/ivx-independence-cutover.mjs --apply      # execute changes
 *   IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/ivx-independence-cutover.mjs --apply
 *
 * Rollback:
 *   node expo/scripts/ivx-independence-cutover.mjs --rollback
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const expoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(expoRoot, '..');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const APPLY = args.includes('--apply');
const ROLLBACK = args.includes('--rollback');
const ALLOWED = process.env.IVX_ALLOW_RORK_CUTOVER === '1';

const RORK_SDK = '@rork-ai/toolkit-sdk';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP_DIR = path.join(expoRoot, 'logs', `ivx-cutover-backup-${TIMESTAMP}`);
const LOG_FILE = path.join(expoRoot, 'logs', `ivx-cutover-${TIMESTAMP}.log`);

const PLAIN_METRO_CONFIG = `const { getDefaultConfig } = require("expo/metro-config");

// IVX build independence: plain Expo Metro config — no Rork toolkit.
const config = getDefaultConfig(__dirname);

module.exports = config;
`;

const RORK_ENV_KEYS = [
  'EXPO_PUBLIC_RORK_API_BASE_URL',
  'EXPO_PUBLIC_RORK_APP_KEY',
  'EXPO_PUBLIC_RORK_AUTH_URL',
  'EXPO_PUBLIC_RORK_FUNCTIONS_URL',
  'EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY',
  'EXPO_PUBLIC_TOOLKIT_URL',
  'EXPO_PUBLIC_PROJECT_ID',
  'EXPO_PUBLIC_TEAM_ID',
];

// --- Logging ---
const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}
function logOnly(msg) {
  logLines.push(msg);
}

function flushLog() {
  const logsDir = path.join(expoRoot, 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  writeFileSync(LOG_FILE, logLines.join('\n') + '\n', 'utf8');
  log(`\n[cutover] Full audit log saved: ${LOG_FILE}`);
}

// --- Change tracking ---
const changes = [];
const errors = [];
function record(step, status, detail) {
  const entry = { step, status, detail, timestamp: new Date().toISOString() };
  changes.push(entry);
  const icon =
    status === 'changed' ? '✓' :
    status === 'already' ? '·' :
    status === 'manual' ? '→' : '!';
  log(`  ${icon} [${step}] ${detail}`);
  if (status === 'error') errors.push(entry);
}

function fail(message) {
  log(`\n[cutover] ABORTED: ${message}`);
  log(`[cutover] To rollback: node expo/scripts/ivx-independence-cutover.mjs --rollback`);
  flushLog();
  process.exit(1);
}

function backupFile(filePath) {
  if (!existsSync(filePath)) return null;
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const rel = path.relative(repoRoot, filePath);
  const backupPath = path.join(BACKUP_DIR, rel.replace(/\//g, '_'));
  copyFileSync(filePath, backupPath);
  logOnly(`  [backup] ${rel} → ${path.relative(repoRoot, backupPath)}`);
  return backupPath;
}

// --- Cutover steps ---
function removeSdkFromPackageJson() {
  const pkgPath = path.join(expoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    record('package.json', 'error', 'expo/package.json not found');
    return;
  }
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const inDeps = pkg.dependencies?.[RORK_SDK] != null;
  const inDev = pkg.devDependencies?.[RORK_SDK] != null;
  if (!inDeps && !inDev) {
    record('package.json', 'already', `${RORK_SDK} is not declared`);
    return;
  }
  if (APPLY) {
    backupFile(pkgPath);
    if (inDeps) delete pkg.dependencies[RORK_SDK];
    if (inDev) delete pkg.devDependencies[RORK_SDK];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }
  record('package.json', 'changed', `removed ${RORK_SDK} (run \`bun install\` to refresh the lockfile)`);
}

function rewriteMetroConfig() {
  const metroPath = path.join(expoRoot, 'metro.config.js');
  if (!existsSync(metroPath)) {
    record('metro.config.js', 'error', 'expo/metro.config.js not found');
    return;
  }
  const current = readFileSync(metroPath, 'utf8');
  if (!/withRorkMetro|@rork-ai\/toolkit-sdk/.test(current)) {
    record('metro.config.js', 'already', 'already a plain Expo config (no withRorkMetro)');
    return;
  }
  if (APPLY) {
    backupFile(metroPath);
    writeFileSync(metroPath, PLAIN_METRO_CONFIG, 'utf8');
  }
  record('metro.config.js', 'changed', 'rewrote to plain Expo getDefaultConfig (dropped withRorkMetro)');
}

function removeVerifySdkRorkAssertions() {
  const verifyPath = path.join(expoRoot, 'scripts', 'verify-expo-sdk.mjs');
  if (!existsSync(verifyPath)) {
    record('verify-expo-sdk', 'already', 'verify-expo-sdk.mjs not found');
    return;
  }
  const current = readFileSync(verifyPath, 'utf8');
  if (!/@rork-ai\/toolkit-sdk|withRorkMetro/.test(current)) {
    record('verify-expo-sdk', 'already', 'no Rork assertions in verify-expo-sdk.mjs');
    return;
  }
  if (APPLY) {
    backupFile(verifyPath);
    // Remove the Rork-presence warnings entirely; keep the Expo SDK checks.
    let updated = current
      .replace(/\/\/ Phase 4f[\s\S]*?(?=if \(warnings)/, '')
      .replace(/if \(!activeDependencies\['@rork-ai\/toolkit-sdk'\]\)[\s\S]*?\n}/, '')
      .replace(/if \(!\/withRorkMetro\/[\s\S]*?\n}/, '');
    writeFileSync(verifyPath, updated, 'utf8');
  }
  record('verify-expo-sdk', 'changed', 'removed Rork-presence assertions (kept Expo SDK checks)');
}

function deleteRorkConfigFiles() {
  for (const rel of ['rork.json', '.rorkignore']) {
    const target = path.join(repoRoot, rel);
    if (!existsSync(target)) {
      record(rel, 'already', `${rel} already removed`);
      continue;
    }
    if (APPLY) {
      backupFile(target);
      rmSync(target);
    }
    record(rel, 'changed', `deleted ${rel}`);
  }
}

function reportEnvKeys() {
  record(
    'envs',
    'manual',
    `Delete these from Render/Expo dashboards (script never edits secrets): ${RORK_ENV_KEYS.join(', ')} — and rotate the toolkit secret upstream.`,
  );
}

function reportGitRemote() {
  const target = 'https://github.com/ibb142/rork-global-real-estate-invest';
  record(
    'git-remote',
    'manual',
    `After cutover, set git remote: \`git remote set-url origin ${target}.git\` (replace the Rork router URL)`,
  );
}

// --- Rollback ---
function findLatestBackup() {
  const logsDir = path.join(expoRoot, 'logs');
  if (!existsSync(logsDir)) return null;
  const backups = readdirSync(logsDir)
    .filter((d) => d.startsWith('ivx-cutover-backup-'))
    .sort()
    .reverse();
  if (backups.length === 0) return null;
  return path.join(logsDir, backups[0]);
}

function doRollback() {
  log('\n[cutover] ROLLBACK MODE');
  const backupDir = findLatestBackup();
  if (!backupDir) {
    log('[cutover] No backup found. Nothing to rollback.');
    flushLog();
    return;
  }
  log(`[cutover] Restoring from: ${path.relative(repoRoot, backupDir)}`);
  const files = readdirSync(backupDir);
  let restored = 0;
  for (const f of files) {
    const parts = f.split('_');
    // Reconstruct path: first part could be 'expo' or 'rork.json'
    if (f === 'rork.json') {
      copyFileSync(path.join(backupDir, f), path.join(repoRoot, 'rork.json'));
      log(`  ✓ restored rork.json`);
      restored++;
    } else if (f === '.rorkignore') {
      copyFileSync(path.join(backupDir, f), path.join(repoRoot, '.rorkignore'));
      log(`  ✓ restored .rorkignore`);
      restored++;
    } else if (f.startsWith('expo_')) {
      const rel = f.replace(/^expo_/, '');
      const target = path.join(expoRoot, rel);
      copyFileSync(path.join(backupDir, f), target);
      log(`  ✓ restored expo/${rel}`);
      restored++;
    }
  }
  log(`\n[cutover] Rollback complete: ${restored} file(s) restored.`);
  log('[cutover] NEXT: run `bun install` to restore the SDK in the lockfile.');
  flushLog();
}

// --- Main ---
function main() {
  log('\n══════════════════════════════════════════════════════════════════');
  log('  IVX → RORK INDEPENDENCE CUTOVER v2');
  log('  Removing all Rork build dependencies for IVX ownership');
  log('══════════════════════════════════════════════════════════════════');

  if (ROLLBACK) {
    doRollback();
    process.exit(0);
  }

  log(`\n[cutover] mode: ${APPLY ? 'APPLY (files will be modified)' : 'DRY-RUN (no files written)'}`);
  log(`[cutover] backup dir: ${APPLY ? path.relative(repoRoot, BACKUP_DIR) : '(created on --apply)'}`);
  log(`[cutover] log file: ${path.relative(repoRoot, LOG_FILE)}`);

  // Guard: prevent bricking the Rork sandbox
  if (APPLY && existsSync(path.join(repoRoot, 'rork.json')) && !ALLOWED) {
    fail(
      'rork.json is present and IVX_ALLOW_RORK_CUTOVER is not set.\n' +
      '  This guard prevents bricking the Rork-managed preview (the SDK is auto-restored there).\n' +
      '  Run this on your independent GitHub/Render checkout with:\n' +
      '    IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/ivx-independence-cutover.mjs --apply\n' +
      '  Or use --dry-run to preview changes here.',
    );
  }

  log('\n[cutover] Changes:');
  removeSdkFromPackageJson();
  rewriteMetroConfig();
  removeVerifySdkRorkAssertions();
  deleteRorkConfigFiles();
  reportEnvKeys();
  reportGitRemote();

  const changed = changes.filter((c) => c.status === 'changed').length;
  const manual = changes.filter((c) => c.status === 'manual').length;
  const already = changes.filter((c) => c.status === 'already').length;

  log('\n──────────────────────────────────────────────────────────────────');
  log('  CUTOVER SUMMARY');
  log('──────────────────────────────────────────────────────────────────');
  log(`  Files changed:  ${changed}`);
  log(`  Already clean:  ${already}`);
  log(`  Manual steps:   ${manual}`);
  log(`  Errors:         ${errors.length}`);

  if (errors.length > 0) {
    log('\n[cutover] ERRORS:');
    for (const e of errors) log(`  ! [${e.step}] ${e.detail}`);
  }

  if (APPLY && changed > 0) {
    log('\n[cutover] NEXT STEPS (run in order):');
    log('  1. cd expo && bun install          (drops SDK from lockfile)');
    log('  2. bunx expo start                 (verify app launches on plain Metro)');
    log('  3. git remote set-url origin https://github.com/ibb142/rork-global-real-estate-invest.git');
    log('  4. git add -A && git commit -m "ivx: remove Rork dependency — independence cutover"');
    log('  5. git push origin main            (triggers Render + GitHub Actions)');
    log('  6. Delete EXPO_PUBLIC_RORK_* envs from Render/Expo dashboards');
    log('\n[cutover] ROLLBACK (if needed):');
    log(`  node expo/scripts/ivx-independence-cutover.mjs --rollback`);
  } else if (DRY_RUN) {
    log('\n[cutover] Dry-run only. To apply changes, run:');
    log('  IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/ivx-independence-cutover.mjs --apply');
  } else if (changed === 0 && errors.length === 0) {
    log('\n[cutover] All clean — no Rork dependencies found. IVX is already independent.');
  }

  log('\n══════════════════════════════════════════════════════════════════');
  flushLog();
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
