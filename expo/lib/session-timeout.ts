import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ACTIVE_KEY = '@ivx_last_active';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

let _lastActiveTimestamp = Date.now();
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let _activityInterval: ReturnType<typeof setInterval> | null = null;

export function startSessionMonitor(onTimeout: () => void): () => void {
  _lastActiveTimestamp = Date.now();

  const saveActivity = async () => {
    _lastActiveTimestamp = Date.now();
    try {
      await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(_lastActiveTimestamp));
    } catch {}
  };

  void saveActivity();

  const handleAppState = async (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      try {
        const stored = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
        const lastActive = stored ? parseInt(stored, 10) : _lastActiveTimestamp;
        const elapsed = Date.now() - lastActive;

        if (elapsed > SESSION_TIMEOUT_MS) {
          console.log('[Session] Timed out after', Math.round(elapsed / 60000), 'minutes');
          onTimeout();
          return;
        }
      } catch {}
      void saveActivity();
    } else if (nextState === 'background') {
      void saveActivity();
    }
  };

  _appStateSubscription = AppState.addEventListener('change', handleAppState);

  _activityInterval = setInterval(() => {
    void saveActivity();
  }, 60000);

  console.log('[Session] Monitor started — timeout:', SESSION_TIMEOUT_MS / 60000, 'minutes');

  return () => {
    if (_appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }
    if (_activityInterval) {
      clearInterval(_activityInterval);
      _activityInterval = null;
    }
    console.log('[Session] Monitor stopped');
  };
}

export function recordActivity() {
  _lastActiveTimestamp = Date.now();
}

export function getSessionTimeoutMs(): number {
  return SESSION_TIMEOUT_MS;
}
