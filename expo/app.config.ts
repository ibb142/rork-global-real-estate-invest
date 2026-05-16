import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'IVX Holdings',
  slug: 'ivx-holdings',
  version: '1.1.2',
  extra: {
    buildMarker: 'FORCE_EXPO_GO_RELOAD_2026_05_12',
    buildTimestamp: '2026-05-12T00:00:00Z',
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
