import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'IVX Holdings',
  slug: 'ivx-holdings',
  owner: 'ivx-holdings',
  version: '1.4.3',
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    buildMarker: 'IVX_BUNDLE_2026_07_15_BUILD_22_MODULE_COMPLETION_REELS_RECOVERY',
    buildTimestamp: '2026-07-15T18:00:00.000000+00:00',
    sourceCommitSha: 'build-22-module-completion-reels-recovery',
    watchdogPatchVersion: 'ai-mutation-watchdog-fix-v10-module-completion',
    frontendDeployMarker: 'ivx-frontend-2026-07-15-module-completion-reels-recovery',
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
    versionCode: 22,
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
