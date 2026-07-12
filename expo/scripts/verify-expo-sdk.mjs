import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const appJsonPath = path.join(projectRoot, 'app.json');
const appConfigPath = path.join(projectRoot, 'app.config.ts');
const metroConfigPath = path.join(projectRoot, 'metro.config.js');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveSdkVersion(expoVersion) {
  if (!expoVersion || typeof expoVersion !== 'string') {
    return null;
  }

  const normalizedVersion = expoVersion.replace(/^[^0-9]*/, '');
  const [major, minor] = normalizedVersion.split('.');

  if (!major || !minor) {
    return null;
  }

  return `${major}.${minor}.0`;
}

const packageJson = readJson(packageJsonPath);
const expoVersion = packageJson?.dependencies?.expo;
const derivedSdkVersion = resolveSdkVersion(expoVersion);
const appJson = existsSync(appJsonPath) ? readJson(appJsonPath) : null;
const appConfigSource = existsSync(appConfigPath) ? readFileSync(appConfigPath, 'utf8') : '';
const metroConfigSource = existsSync(metroConfigPath) ? readFileSync(metroConfigPath, 'utf8') : '';
const configuredSdkVersion = appJson?.expo?.sdkVersion ?? /sdkVersion:\s*['"]([^'"]+)['"]/.exec(appConfigSource)?.[1] ?? null;
const activeDependencies = {
  ...(packageJson?.dependencies ?? {}),
  ...(packageJson?.devDependencies ?? {}),
};

console.log(`[sdk-audit] expo dependency version: ${expoVersion ?? 'missing'}`);
console.log(`[sdk-audit] derived sdk version: ${derivedSdkVersion ?? 'unknown'}`);
console.log(`[sdk-audit] configured sdkVersion: ${configuredSdkVersion ?? 'missing'}`);

// Phase 4g (2026-05-28): guard is now WARN-ONLY. Hard exits here were
// blocking `bunx expo start` whenever Rork-managed sync briefly diverged
// from one of the asserts, leaving Expo Go stuck on a blank loading
// spinner. We still print every diagnostic, but we never exit non-zero.
const warnings = [];
if (!expoVersion || !derivedSdkVersion) {
  warnings.push('Expo dependency is missing or invalid.');
}
if (configuredSdkVersion && derivedSdkVersion && configuredSdkVersion !== derivedSdkVersion) {
  warnings.push(`configured sdkVersion ${configuredSdkVersion} does not match expo dependency ${expoVersion} -> ${derivedSdkVersion}`);
}
if (derivedSdkVersion && derivedSdkVersion !== '54.0.0') {
  warnings.push(`Expo Go currently requires SDK 54 for this app, but project resolves to ${derivedSdkVersion}.`);
}

// Rork independence cutover (2026-07-07): @rork-ai/toolkit-sdk and
// withRorkMetro have been removed. The IVX app now uses the plain Expo
// default Metro config. These checks are intentionally removed — the SDK
// absence is the desired state, not a regression.
if (/runtimeVersion\s*:/.test(appConfigSource)) {
  warnings.push('runtimeVersion found in app config. Expo Go expects the local SDK 54 Metro bundle.');
}
if (!/updates:\s*\{[\s\S]*enabled:\s*false/.test(appConfigSource)) {
  warnings.push('Expo updates are not disabled for Expo Go local QR testing.');
}

if (warnings.length === 0) {
  console.log('[sdk-audit] Expo SDK 54 configuration is aligned for Expo Go.');
} else {
  console.warn('[sdk-audit] WARNINGS (non-blocking):');
  for (const w of warnings) console.warn('  - ' + w);
  console.warn('[sdk-audit] Continuing start anyway (warn-only mode, Phase 4g).');
}
