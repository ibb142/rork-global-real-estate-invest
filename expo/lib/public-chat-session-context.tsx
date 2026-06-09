import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useState } from 'react';

const PUBLIC_CHAT_SESSION_STORAGE_KEY = 'ivx.public-chat.session.v1';
const SESSION_PREFIX = 'public-session';

function createId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeSessionId(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.replace(/[^A-Za-z0-9_:-]/g, '-').slice(0, 80);
}

async function persistSessionId(sessionId: string): Promise<void> {
  await AsyncStorage.setItem(PUBLIC_CHAT_SESSION_STORAGE_KEY, sessionId);
}

/**
 * Public chat session state. AsyncStorage is intentionally encapsulated here so
 * UI code never talks to persistent storage directly.
 */
export type PublicChatSessionContextValue = {
  sessionId: string;
  isHydrated: boolean;
  setActiveSession: (sessionId: string) => Promise<void>;
  startNewSession: () => Promise<string>;
};

export const [PublicChatSessionProvider, usePublicChatSession] = createContextHook((): PublicChatSessionContextValue => {
  const [sessionId, setSessionId] = useState<string>(() => createId(SESSION_PREFIX));
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const stored = sanitizeSessionId(await AsyncStorage.getItem(PUBLIC_CHAT_SESSION_STORAGE_KEY));
        const nextSessionId = stored || createId(SESSION_PREFIX);
        if (!stored) {
          await persistSessionId(nextSessionId);
        }
        if (!cancelled) {
          setSessionId(nextSessionId);
        }
      } catch (error) {
        console.log('[PublicChatSession] Hydration failed; using ephemeral session', error instanceof Error ? error.message : 'unknown');
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveSession = useCallback(async (nextSessionId: string): Promise<void> => {
    const sanitized = sanitizeSessionId(nextSessionId) || createId(SESSION_PREFIX);
    setSessionId(sanitized);
    await persistSessionId(sanitized);
  }, []);

  const startNewSession = useCallback(async (): Promise<string> => {
    const nextSessionId = createId(SESSION_PREFIX);
    setSessionId(nextSessionId);
    await persistSessionId(nextSessionId);
    return nextSessionId;
  }, []);

  return {
    sessionId,
    isHydrated,
    setActiveSession,
    startNewSession,
  };
});
