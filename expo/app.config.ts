import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'IVX Holdings',
  slug: 'ivx-holdings',
  owner: 'ivx-holdings',
  version: '1.3.0',
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    buildMarker: 'IVX_BUNDLE_2026_07_13_ICON_UPDATE',
    buildTimestamp: '2026-07-13T12:30:02.587742+00:00',
    sourceCommitSha: '039a064',
    watchdogPatchVersion: 'ota-repair-v1',
    frontendDeployMarker: 'ivx-frontend-2026-07-13-ota-repair',
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || '00000000-0000-0000-0000-000000000000',
    },
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
    buildNumber: '1',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#000000',
    },
    package: 'com.ivxholdings.app',
    versionCode: 3,
    softwareKeyboardLayoutMode: 'resize',
  },
  web: {
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
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
