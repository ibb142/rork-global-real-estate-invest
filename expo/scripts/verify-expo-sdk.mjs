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

if (!expoVersion || !derivedSdkVersion) {
  console.error('[sdk-audit] Expo dependency is missing or invalid. Refusing to start the project.');
  process.exit(1);
}

if (configuredSdkVersion && configuredSdkVersion !== derivedSdkVersion) {
  console.error(
    `[sdk-audit] configured sdkVersion ${configuredSdkVersion} does not match expo dependency ${expoVersion} -> ${derivedSdkVersion}`
  );
  process.exit(1);
}

if (derivedSdkVersion !== '54.0.0') {
  console.error(`[sdk-audit] Expo Go currently requires SDK 54 for this app, but project resolves to ${derivedSdkVersion}.`);
  process.exit(1);
}

// Phase 4e (2026-05-12): @rork-ai/toolkit-sdk and withRorkMetro have been
// removed. IVX IA is now 100% brain-free from Rork at runtime and bundler.
// We assert their absence to prevent regressions.
if (activeDependencies['@rork-ai/toolkit-sdk']) {
  console.error('[sdk-audit] @rork-ai/toolkit-sdk must not be a dependency. IVX IA is brain-free from Rork.');
  process.exit(1);
}
if (/withRorkMetro|@rork-ai\/toolkit-sdk/.test(metroConfigSource)) {
  console.error('[sdk-audit] metro.config.js still references the Rork toolkit. Must use default Expo Metro config.');
  process.exit(1);
}
console.log('[sdk-audit] Rork bundler dependency: absent (Phase 4e complete).');

if (/runtimeVersion\s*:/.test(appConfigSource) || /url\s*:/.test(appConfigSource)) {
  console.error('[sdk-audit] runtimeVersion/updates.url found in app config. Expo Go must use the local SDK 54 Metro bundle.');
  process.exit(1);
}

if (!/updates:\s*\{[\s\S]*enabled:\s*false/.test(appConfigSource)) {
  console.error('[sdk-audit] Expo updates must stay disabled for Expo Go local QR testing.');
  process.exit(1);
}

console.log('[sdk-audit] Expo SDK 54 configuration is aligned for Expo Go.');
