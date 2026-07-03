import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'IVX Holdings SDK54',
  slug: 'ivx-holdings-sdk54',
  version: '1.2.1',
  extra: {
    buildMarker: 'IVX_BUNDLE_2026_07_02_OWNER_LOGIN_V12_LIVE_EVIDENCE',
    buildTimestamp: '2026-07-02T00:00:00Z',
    watchdogPatchVersion: 'owner-login-v12-live-evidence',
    frontendDeployMarker: 'ivx-frontend-2026-07-02-owner-login-v12-live-evidence',
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
