/**
 * useAppForeground — tracks whether the app is in the foreground.
 *
 * Playback must pause immediately when the app goes to background and
 * resume only when it returns to the foreground. This prevents audio
 * bleed, battery drain, and native player corruption on Android.
 */
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

export function useAppForeground(): boolean {
  const [isForeground, setIsForeground] = useState<boolean>(
    AppState.currentState === 'active',
  );

  useEffect(() => {
    let cancelled = false;

    const handleChange = (nextState: AppStateStatus) => {
      if (cancelled) return;
      setIsForeground(nextState === 'active');
    };

    const subscription = AppState.addEventListener('change', handleChange);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return isForeground;
}
