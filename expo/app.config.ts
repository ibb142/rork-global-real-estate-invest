import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'IVX Holdings SDK54',
  slug: 'ivx-holdings-sdk54',
  version: '1.2.0',
  extra: {
    buildMarker: 'IVX_BUNDLE_2026_06_06_WATCHDOG_BANNER_FIELDS',
    buildTimestamp: '2026-06-06T00:00:00Z',
    watchdogPatchVersion: 'watchdog-banner-fields-v2',
    frontendDeployMarker: 'ivx-frontend-2026-06-06-live-bundle-verify',
  },
  sdkVersion: '54.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'ivx-app',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  updates: {
    enabled: false,
    checkAutomatically: 'NEVER',
    fallbackToCacheTimeout: 0,
  },
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.ivxholdings.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.ivxholdings.app',
    softwareKeyboardLayoutMode: 'resize',
  },
  web: {
    favicon: './assets/images/favicon.png',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-web-browser',
    'expo-secure-store',
    [
      'expo-audio',
      {
        microphonePermission: 'Allow IVX Holdings to capture voice prompts for transcription.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
