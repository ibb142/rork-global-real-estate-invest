import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const appJsonPath = path.join(projectRoot, 'app.json');

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
const configuredSdkVersion = appJson?.expo?.sdkVersion ?? null;

console.log(`[sdk-audit] expo dependency version: ${expoVersion ?? 'missing'}`);
console.log(`[sdk-audit] derived sdk version: ${derivedSdkVersion ?? 'unknown'}`);
console.log(`[sdk-audit] static app.json sdkVersion: ${configuredSdkVersion ?? 'missing'}`);

if (!expoVersion || !derivedSdkVersion) {
  console.error('[sdk-audit] Expo dependency is missing or invalid. Refusing to start the project.');
  process.exit(1);
}

if (configuredSdkVersion && configuredSdkVersion !== derivedSdkVersion) {
  console.error(
    `[sdk-audit] app.json sdkVersion ${configuredSdkVersion} does not match expo dependency ${expoVersion} -> ${derivedSdkVersion}`
  );
  process.exit(1);
}

console.log('[sdk-audit] Expo SDK configuration is aligned for Expo Go.');
