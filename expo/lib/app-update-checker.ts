import { Platform } from 'react-native';

export async function checkForUpdates(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Updates] Skipping on web');
    return;
  }

  console.log('[Updates] Update check skipped — expo-updates not available in Expo Go');
}
