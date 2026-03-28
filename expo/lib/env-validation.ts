interface EnvVar {
  name: string;
  required: boolean;
  isPublic: boolean;
}

const ENV_VARS: EnvVar[] = [
  { name: 'EXPO_PUBLIC_SUPABASE_URL', required: true, isPublic: true },
  { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', required: true, isPublic: true },
  { name: 'EXPO_PUBLIC_API_BASE_URL', required: false, isPublic: true },
  { name: 'AWS_ACCESS_KEY_ID', required: false, isPublic: false },
  { name: 'AWS_SECRET_ACCESS_KEY', required: false, isPublic: false },
  { name: 'AWS_REGION', required: false, isPublic: false },
  { name: 'EXPO_PUBLIC_GOOGLE_ADS_API_KEY', required: false, isPublic: true },
];

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
  present: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const present: string[] = [];

  for (const env of ENV_VARS) {
    const value = (process.env[env.name] || '').trim();

    if (!value) {
      if (env.required) {
        missing.push(env.name);
      } else {
        warnings.push(`${env.name} not set (optional)`);
      }
    } else {
      present.push(env.name);

      if (value === 'undefined' || value === 'null' || value === 'your-key-here') {
        warnings.push(`${env.name} has placeholder value`);
      }

      if (env.name.includes('KEY') || env.name.includes('SECRET') || env.name.includes('TOKEN')) {
        if (value.length < 10) {
          warnings.push(`${env.name} value looks too short (${value.length} chars)`);
        }
      }

      if (env.name.includes('URL') && !value.startsWith('http://') && !value.startsWith('https://')) {
        warnings.push(`${env.name} doesn't look like a valid URL`);
      }
    }
  }

  const valid = missing.length === 0;

  return { valid, missing, warnings, present };
}

interface DepCompatWarning {
  package: string;
  issue: string;
  severity: 'info' | 'warn' | 'error';
}

export function checkDependencyCompatibility(): DepCompatWarning[] {
  const warnings: DepCompatWarning[] = [];

  try {
    const pkg = require('../package.json');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const reactVersion = deps['react'] || '';
    const rnWebVersion = deps['react-native-web'] || '';
    if (reactVersion.includes('19') && rnWebVersion.includes('0.21')) {
      warnings.push({
        package: 'react-native-web',
        issue: `v${rnWebVersion} may have issues with React 19. Monitor for hydration warnings on web.`,
        severity: 'warn',
      });
    }

    const expoVersion = deps['expo'] || '';
    if (expoVersion.includes('54')) {
      const rnVersion = deps['react-native'] || '';
      if (!rnVersion.includes('0.81')) {
        warnings.push({
          package: 'react-native',
          issue: `Expo SDK 54 expects RN 0.81.x but found ${rnVersion}`,
          severity: 'error',
        });
      }
    }
  } catch {
    // package.json read failed — skip compat checks
  }

  return warnings;
}

export function logEnvValidation(): void {
  const result = validateEnvironment();

  if (result.missing.length > 0) {
    console.error(`[ENV] Missing required env vars: ${result.missing.join(', ')}`);
  }

  if (result.warnings.length > 0) {
    console.warn(`[ENV] Warnings: ${result.warnings.join('; ')}`);
  }

  console.log(`[ENV] ${result.present.length}/${ENV_VARS.length} env vars configured`);

  const depWarnings = checkDependencyCompatibility();
  if (depWarnings.length > 0) {
    for (const w of depWarnings) {
      if (w.severity === 'error') {
        console.error(`[DepCompat] ${w.package}: ${w.issue}`);
      } else {
        console.warn(`[DepCompat] ${w.package}: ${w.issue}`);
      }
    }
  }
}
