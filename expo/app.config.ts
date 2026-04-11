import type { ExpoConfig } from 'expo/config';

type PackageJson = {
  dependencies?: Record<string, string | undefined>;
};

const packageJson = require('./package.json') as PackageJson;

function resolveSdkVersion(expoVersion: string | undefined): string | undefined {
  if (!expoVersion) {
    console.warn('[expo-config] Missing expo dependency while resolving sdkVersion');
    return undefined;
  }

  const normalizedVersion = expoVersion.replace(/^[^0-9]*/, '');
  const [major, minor] = normalizedVersion.split('.');

  if (!major || !minor) {
    console.warn(`[expo-config] Unable to derive sdkVersion from expo dependency ${expoVersion}`);
    return undefined;
  }

  const sdkVersion = `${major}.${minor}.0`;
  console.log(`[expo-config] Derived sdkVersion ${sdkVersion} from expo dependency ${expoVersion}`);
  return sdkVersion;
}

const sdkVersion = resolveSdkVersion(packageJson.dependencies?.expo);
const baseConfig: ExpoConfig = {
  name: 'RealVest',
  slug: 'jh1qrutuhy6vu1bkysoln',
  version: '1.0.0',
  sdkVersion: '54.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'rork-app',
  userInterfaceStyle: 'automatic',
  newArchEnabled: false,
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.rork.jh1qrutuhy6vu1bkysoln',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'app.rork.jh1qrutuhy6vu1bkysoln',
  },
  web: {
    favicon: './assets/images/favicon.png',
    output: 'server',
  },
  plugins: [
    [
      'expo-router',
      {
        origin: 'https://rork.com/',
      },
    ],
    'expo-font',
    'expo-web-browser',
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default (): ExpoConfig => ({
  ...baseConfig,
  sdkVersion: sdkVersion ?? baseConfig.sdkVersion,
});
