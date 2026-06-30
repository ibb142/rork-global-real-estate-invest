import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const expoRoot = path.resolve(__dirname, '..');
const appRoot = path.join(expoRoot, 'app');

const requiredRouteFiles = [
  'owner-login.tsx',
  'login.tsx',
  'signup.tsx',
  'owner-signup.tsx',
  '_layout.tsx',
  'admin/owner-controls.tsx',
  'ivx/variables.tsx',
  'ivx/independence.tsx',
];

const ownerFlowFiles = [
  'signup.tsx',
  'owner-signup.tsx',
  'landing.tsx',
  'owner-access.tsx',
  '(tabs)/(home)/index.tsx',
  '(tabs)/profile.tsx',
  '_layout.tsx',
];

const requiredStackScreens = [
  { file: '_layout.tsx', routeName: 'owner-login', label: 'Root stack' },
  { file: 'admin/_layout.tsx', routeName: 'owner-controls', label: 'Admin stack' },
  { file: 'ivx/_layout.tsx', routeName: 'variables', label: 'IVX owner stack' },
  { file: 'ivx/_layout.tsx', routeName: 'independence', label: 'IVX owner stack' },
];

const failures = [];

for (const relativePath of requiredRouteFiles) {
  const absolutePath = path.join(appRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing required owner-flow route file: app/${relativePath}`);
  }
}

for (const requiredScreen of requiredStackScreens) {
  const layoutPath = path.join(appRoot, requiredScreen.file);
  if (!existsSync(layoutPath)) {
    failures.push(`${requiredScreen.label} layout missing: app/${requiredScreen.file}`);
    continue;
  }

  const layoutSource = readFileSync(layoutPath, 'utf8');
  const screenPattern = new RegExp(`<Stack\\.Screen\\s+name=["']${requiredScreen.routeName}["']`);
  if (!screenPattern.test(layoutSource)) {
    failures.push(`${requiredScreen.label} does not register ${requiredScreen.routeName}.`);
  }
}

const unsafeOwnerLoginNavigationPatterns = [
  /router\.(push|replace)\(\s*["']\/owner-login["']/,
  /router\.(push|replace)\(\s*\{[\s\S]{0,180}?pathname:\s*["']\/owner-login["']/,
  /navigation\.(push|replace|navigate)\(\s*["']owner-login["']/,
];

const unsafeRenderRedirectPatterns = [
  /<Redirect\s+href=\{?\s*["']\/owner-login["']/,
  /return\s+<Redirect\s+href=\{?\s*["']\/owner-login["']/,
];

const unsafeAutomaticOwnerLoginPatterns = [
  /useEffect\s*\([\s\S]{0,900}?router\.(push|replace)\s*\([\s\S]{0,240}?pathname:\s*["']\/login["'][\s\S]{0,240}?ownerMode:\s*["']1["']/,
  /useEffect\s*\([\s\S]{0,900}?router\.(push|replace)\s*\([\s\S]{0,240}?["']\/owner-login["']/,
];

for (const relativePath of ownerFlowFiles) {
  const absolutePath = path.join(appRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`Owner-flow source file missing: app/${relativePath}`);
    continue;
  }

  const source = readFileSync(absolutePath, 'utf8');
  for (const pattern of unsafeOwnerLoginNavigationPatterns) {
    if (pattern.test(source)) {
      failures.push(`Unsafe direct owner-login navigation found in app/${relativePath}. Route owner entry through /login with ownerMode=1 so nested NativeStack navigators cannot dispatch an unhandled owner-login PUSH/REPLACE action.`);
      break;
    }
  }

  for (const pattern of unsafeRenderRedirectPatterns) {
    if (pattern.test(source)) {
      failures.push(`Unsafe render-time Redirect to /owner-login found in app/${relativePath}. Use a user-initiated owner login action or a guarded root-level navigation path so NativeStackNavigator cannot enter an update loop.`);
      break;
    }
  }

  for (const pattern of unsafeAutomaticOwnerLoginPatterns) {
    if (pattern.test(source)) {
      failures.push(`Unsafe automatic owner-login navigation found in app/${relativePath}. Do not call router.push/replace to owner login from an auth/bootstrap useEffect inside nested tab/native stacks; render a stable gate and navigate only from an explicit user action.`);
      break;
    }
  }
}

const homeSourcePath = path.join(appRoot, '(tabs)/(home)/index.tsx');
if (existsSync(homeSourcePath)) {
  const homeSource = readFileSync(homeSourcePath, 'utf8');
  if (!homeSource.includes('testID="home-owner-login-gate"')) {
    failures.push('Home unauthenticated owner gate is missing. Startup must render a stable gate instead of auto-navigating from the nested Home stack.');
  }
  if (homeSource.includes('testID="home-owner-login-redirecting"') || homeSource.includes('Opening Owner Login...')) {
    failures.push('Home still contains the old auto-redirecting owner login fallback. Replace it with the stable owner gate.');
  }

  const ownerGateButtonIndex = homeSource.indexOf('testID="home-owner-login-gate-button"');
  if (ownerGateButtonIndex < 0) {
    failures.push('Home unauthenticated owner gate primary button is missing.');
  } else {
    const ownerGateButtonWindow = homeSource.slice(Math.max(0, ownerGateButtonIndex - 700), ownerGateButtonIndex + 700);
    if (!homeSource.includes('const handleOpenOwnerLogin = useCallback((): void => {')) {
      failures.push('Home owner gate must declare a stable explicit tap handler for Open Owner Login.');
    }
    if (!homeSource.includes("router.push('/login?ownerMode=1' as any);")) {
      failures.push('Home owner gate tap handler must directly call router.push(\'/login?ownerMode=1\') so the button opens owner login.');
    }
    if (!ownerGateButtonWindow.includes('onPress={handleOpenOwnerLogin}')) {
      failures.push('Home owner gate primary button must wire onPress={handleOpenOwnerLogin}.');
    }
    if (/onPress=\{[\s\S]{0,220}?router\.(replace|navigate)/.test(ownerGateButtonWindow)) {
      failures.push('Home owner gate primary button must not use nested-stack replace/navigate for owner login. Use the explicit push handler for /login?ownerMode=1.');
    }
  }
}

const loginSourcePath = path.join(appRoot, 'login.tsx');
if (existsSync(loginSourcePath)) {
  const loginSource = readFileSync(loginSourcePath, 'utf8');
  if (!loginSource.includes('if (openAccessMode && !effectiveOwnerMode)')) {
    failures.push('/login?ownerMode=1 must render the owner login screen even when open-access mode is enabled. Guard the open-access shortcut with !effectiveOwnerMode.');
  }
  if (!loginSource.includes("const target = effectiveOwnerMode ? '/admin/owner-controls' : '/(tabs)'")) {
    failures.push('Owner-mode password/2FA sign-in must route to /admin/owner-controls after success.');
  }
  if (!loginSource.includes("router.replace((effectiveOwnerMode ? '/admin/owner-controls' : '/(tabs)') as any);")) {
    failures.push('Owner trusted restore from owner-mode login must route to /admin/owner-controls, not generic tabs.');
  }
}

if (failures.length > 0) {
  console.error('[owner-route-qa] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[owner-route-qa] PASS owner-login route exists for direct/backward-compatible loads, owner/admin/IVX stacks register the required owner flow screens, the Home gate has an explicit onPress handler calling router.push(\'/login?ownerMode=1\'), /login keeps owner mode out of open-access bypass, owner-mode success routes to /admin/owner-controls, and owner auth flow has no direct owner-login PUSH/REPLACE calls, no render-time owner-login Redirect loops, and no nested automatic owner-login startup navigation.');
