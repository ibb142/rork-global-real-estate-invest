#!/usr/bin/env node
/**
 * IVX → Rork Build Independence Cutover (BLOCK 47).
 *
 * Executes the one-time removal of every remaining Rork build dependency so the
 * Expo app builds + runs on an owner-controlled pipeline (GitHub + Render +
 * Supabase + OpenAI/provider + IVX backend) with NO Rork toolkit in the bundle:
 *
 *   1. Remove `@rork-ai/toolkit-sdk` from expo/package.json
 *   2. Rewrite expo/metro.config.js to the plain Expo config (drop withRorkMetro)
 *   3. Delete rork.json (+ .rorkignore) project config
 *   4. Report the EXPO_PUBLIC_RORK_* / EXPO_PUBLIC_TOOLKIT_URL envs to delete
 *      from the Render/Expo dashboards (this script never touches secrets)
 *   5. Print a proof report of every change
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SCRIPT AND NOT AN IN-SANDBOX EDIT (read before running):
 *
 * Inside the Rork-managed sandbox the cloud bundler/preview REQUIRES
 * `@rork-ai/toolkit-sdk` + `withRorkMetro`, and Rork's auto-sync RESTORES the
 * SDK if it is removed (documented in expo/scripts/verify-expo-sdk.mjs:63-74,
 * from the reverted Phase 4e/4f attempt). So removing it there breaks the live
 * preview AND gets reverted — it achieves nothing.
 *
 * This cutover therefore runs on the OWNER'S INDEPENDENT checkout (the GitHub
 * repo Render watches), OFF Rork, where withRorkMetro is not needed. It refuses
 * to run unless IVX_ALLOW_RORK_CUTOVER=1 is set, so it can never accidentally
 * brick the sandbox preview.
 *
 * Usage (on the independent checkout, NOT in the Rork sandbox):
 *   IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/rork-independence-cutover.mjs
 *   IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/rork-independence-cutover.mjs --dry-run
 *
 * After running: `bun install` in expo/ (refreshes the lockfile without the SDK),
 * `bunx expo start` to verify the app launches on the plain Metro config, then
 * commit + push → Render auto-deploy.
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const expoRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(expoRoot, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALLOWED = process.env.IVX_ALLOW_RORK_CUTOVER === '1';

const RORK_SDK = '@rork-ai/toolkit-sdk';
const PLAIN_METRO_CONFIG = `const { getDefaultConfig } = require("expo/metro-config");

// IVX build independence (BLOCK 47): plain Expo Metro config — no Rork toolkit.
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
];

/** Collected change records for the final proof report. */
const changes = [];
function record(step, status, detail) {
  changes.push({ step, status, detail });
  const icon = status === 'changed' ? '✓' : status === 'already' ? '·' : status === 'manual' ? '→' : '!';
  console.log(`  ${icon} [${step}] ${detail}`);
}

function fail(message) {
  console.error(`\n[rork-cutover] ABORTED: ${message}\n`);
  process.exit(1);
}

function removeSdkFromPackageJson() {
  const pkgPath = path.join(expoRoot, 'package.json');
  if (!existsSync(pkgPath)) return record('package.json', 'error', 'expo/package.json not found');
  const raw = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  const inDeps = pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, RORK_SDK);
  const inDev = pkg.devDependencies && Object.prototype.hasOwnProperty.call(pkg.devDependencies, RORK_SDK);
  if (!inDeps && !inDev) return record('package.json', 'already', `${RORK_SDK} is not declared`);
  if (inDeps) delete pkg.dependencies[RORK_SDK];
  if (inDev) delete pkg.devDependencies[RORK_SDK];
  if (!DRY_RUN) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  record('package.json', 'changed', `removed ${RORK_SDK} (run \`bun install\` to refresh the lockfile)`);
}

function rewriteMetroConfig() {
  const metroPath = path.join(expoRoot, 'metro.config.js');
  if (!existsSync(metroPath)) return record('metro.config.js', 'error', 'expo/metro.config.js not found');
  const current = readFileSync(metroPath, 'utf8');
  if (!/withRorkMetro|@rork-ai\/toolkit-sdk/.test(current)) {
    return record('metro.config.js', 'already', 'already a plain Expo config (no withRorkMetro)');
  }
  if (!DRY_RUN) writeFileSync(metroPath, PLAIN_METRO_CONFIG, 'utf8');
  record('metro.config.js', 'changed', 'rewrote to plain Expo getDefaultConfig (dropped withRorkMetro)');
}

function deleteRorkConfigFiles() {
  for (const rel of ['rork.json', '.rorkignore']) {
    const target = path.join(repoRoot, rel);
    if (!existsSync(target)) {
      record(rel, 'already', `${rel} already removed`);
      continue;
    }
    if (!DRY_RUN) rmSync(target);
    record(rel, 'changed', `deleted ${rel}`);
  }
}

function reportEnvKeys() {
  record(
    'envs',
    'manual',
    `delete these from Render/Expo dashboards (this script never edits secrets): ${RORK_ENV_KEYS.join(', ')} — and rotate the toolkit secret upstream.`,
  );
}

function main() {
  console.log('\n[rork-cutover] IVX → Rork Build Independence Cutover (BLOCK 47)');
  console.log(`[rork-cutover] mode: ${DRY_RUN ? 'DRY-RUN (no files written)' : 'APPLY'}`);

  if (existsSync(path.join(repoRoot, 'rork.json')) && !DRY_RUN && !ALLOWED) {
    fail(
      'rork.json is present and IVX_ALLOW_RORK_CUTOVER is not set. ' +
        'This guard prevents bricking the Rork-managed preview (the SDK is auto-restored there). ' +
        'Run this on your independent GitHub/Render checkout with IVX_ALLOW_RORK_CUTOVER=1, or use --dry-run to preview here.',
    );
  }

  console.log('\n[rork-cutover] changes:');
  removeSdkFromPackageJson();
  rewriteMetroConfig();
  deleteRorkConfigFiles();
  reportEnvKeys();

  const changed = changes.filter((c) => c.status === 'changed').length;
  const errors = changes.filter((c) => c.status === 'error').length;
  console.log(`\n[rork-cutover] summary: ${changed} file change(s), ${errors} error(s).`);
  if (DRY_RUN) {
    console.log('[rork-cutover] dry-run only — re-run without --dry-run on the independent checkout to apply.');
  } else if (changed > 0) {
    console.log('[rork-cutover] NEXT: `cd expo && bun install` (drops the SDK from the lockfile) → `bunx expo start` to verify launch → commit + push → Render auto-deploy.');
  }
  process.exit(errors > 0 ? 1 : 0);
}

main();
