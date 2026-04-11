import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

export function useScreenFocusState(initialValue: boolean = false): boolean {
  const [isFocused, setIsFocused] = useState<boolean>(initialValue);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);

      return () => {
        setIsFocused(false);
      };
    }, [])
  );

  return isFocused;
}
