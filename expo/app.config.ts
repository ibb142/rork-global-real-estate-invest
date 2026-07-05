import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'IVX Holdings SDK54',
  slug: 'ivx-holdings-sdk54',
  version: '1.2.1',
  extra: {
    buildMarker: 'IVX_BUNDLE_2026_07_04_OWNER_LOGIN_V15_GUARD',
    buildTimestamp: '2026-07-04T22:30:00Z',
    watchdogPatchVersion: 'owner-login-v15-guard',
    frontendDeployMarker: 'ivx-frontend-2026-07-04-owner-login-v15-guard',
  },
  sdkVersion: '54.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'ivx-app',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  newArchEnabled: false,
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
      backgroundColor: '#000000',
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
