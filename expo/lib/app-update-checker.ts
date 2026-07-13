import { Platform } from 'react-native';
import { safelyCheckForUpdates } from './ota-error-handler';

/**
 * Non-fatal update checker.
 *
 * This function NEVER throws and NEVER blocks app startup.
 * If expo-updates is unavailable or the update server is unreachable,
 * the app continues with the embedded or cached bundle.
 *
 * The native-level update check is DISABLED (updates.enabled: false in
 * app.config.ts) to prevent the fatal `java.io.IOException: Failed to
 * download remote update` crash. This JS-level check is optional and
 * fully wrapped in error boundaries.
 */
export async function checkForUpdates(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const diagnostics = await safelyCheckForUpdates();
    if (diagnostics.hasUpdate) {
      console.log('[Updates] Update available and downloading — will apply on next restart');
    } else if (diagnostics.error) {
      console.warn('[Updates] Update check failed (non-fatal):', diagnostics.error);
    } else {
      console.log('[Updates] No update available — app is up to date');
    }
  } catch (err) {
    // Never let update errors propagate to the app
    console.warn('[Updates] Unexpected error in checkForUpdates (non-fatal):', err);
  }
}
