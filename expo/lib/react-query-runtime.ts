import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus, Platform } from 'react-native';

let isConfigured = false;

function getWebOnlineState(): boolean {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine;
}

function getWebFocusedState(): boolean {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible';
}

export function configureReactQueryLifecycle(): () => void {
  if (isConfigured) {
    return () => {};
  }

  isConfigured = true;

  const handleAppStateChange = (nextState: AppStateStatus) => {
    const isActive = nextState === 'active';
    focusManager.setFocused(isActive);

    if (Platform.OS !== 'web') {
      onlineManager.setOnline(isActive);
    }
  };

  const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  let cleanupWebListeners = () => {};

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const handleVisibilityChange = () => {
      focusManager.setFocused(getWebFocusedState());
    };

    const handleOnline = () => {
      onlineManager.setOnline(true);
    };

    const handleOffline = () => {
      onlineManager.setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    focusManager.setFocused(getWebFocusedState());
    onlineManager.setOnline(getWebOnlineState());

    cleanupWebListeners = () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  } else {
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
  }

  return () => {
    appStateSubscription.remove();
    cleanupWebListeners();
    isConfigured = false;
  };
}
