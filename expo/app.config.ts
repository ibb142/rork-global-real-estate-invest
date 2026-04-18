import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'RealVest',
  slug: 'jh1qrutuhy6vu1bkysoln',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'rork-app',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
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
    softwareKeyboardLayoutMode: 'resize',
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

export default config;
