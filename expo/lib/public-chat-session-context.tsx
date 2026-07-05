import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useState } from 'react';

const PUBLIC_CHAT_SESSION_STORAGE_KEY = 'ivx.public-chat.session.v1';
const PUBLIC_CHAT_CLIENT_STORAGE_KEY = 'ivx.public-chat.client.v1';
const SESSION_PREFIX = 'public-session';
const CLIENT_PREFIX = 'public-client';

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

async function persistClientId(clientId: string): Promise<void> {
  await AsyncStorage.setItem(PUBLIC_CHAT_CLIENT_STORAGE_KEY, clientId);
}

/**
 * Public chat session state. AsyncStorage is intentionally encapsulated here so
 * UI code never talks to persistent storage directly.
 */
export type PublicChatSessionContextValue = {
  sessionId: string;
  /**
   * Stable per-device identifier. Persisted once and reused across reloads and
   * network changes so the backend can authorize chat history without relying
   * on the volatile request IP (the cause of the "disappearing chat" bug).
   */
  clientId: string;
  isHydrated: boolean;
  setActiveSession: (sessionId: string) => Promise<void>;
  startNewSession: () => Promise<string>;
};

export const [PublicChatSessionProvider, usePublicChatSession] = createContextHook((): PublicChatSessionContextValue => {
  const [sessionId, setSessionId] = useState<string>(() => createId(SESSION_PREFIX));
  const [clientId, setClientId] = useState<string>(() => createId(CLIENT_PREFIX));
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const [storedSession, storedClient] = await Promise.all([
          AsyncStorage.getItem(PUBLIC_CHAT_SESSION_STORAGE_KEY),
          AsyncStorage.getItem(PUBLIC_CHAT_CLIENT_STORAGE_KEY),
        ]);
        const stored = sanitizeSessionId(storedSession);
        const nextSessionId = stored || createId(SESSION_PREFIX);
        if (!stored) {
          await persistSessionId(nextSessionId);
        }

        const storedClientId = sanitizeSessionId(storedClient);
        const nextClientId = storedClientId || createId(CLIENT_PREFIX);
        if (!storedClientId) {
          await persistClientId(nextClientId);
        }

        if (!cancelled) {
          setSessionId(nextSessionId);
          setClientId(nextClientId);
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
    clientId,
    isHydrated,
    setActiveSession,
    startNewSession,
  };
});
