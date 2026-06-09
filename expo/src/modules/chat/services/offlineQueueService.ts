/**
 * Offline queue + reconnect recovery for IVX chat sends.
 *
 * Pending sends (text + small metadata) are persisted to AsyncStorage so they
 * survive app reloads. When the runtime detects connectivity recovery
 * (`AppState` returning to `active` or the periodic probe succeeding) the
 * queue is flushed sequentially through the active chat provider.
 *
 * Design constraints:
 *   - No NetInfo dependency (not installed in this project). Online state is
 *     inferred from successful chat sends + a lightweight probe.
 *   - Failed network sends are classified by error message keywords so we do
 *     not mistake auth / validation failures for offline conditions.
 *   - File uploads are NOT queued — Supabase uploads require live access. We
 *     still queue the surrounding text payload so the owner does not lose
 *     context.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import type { ChatMessage, SendMessageInput } from '../types/chat';
import { chatService } from './chatService';

const STORAGE_KEY = 'ivx.chat.offline-queue.v1';
const MAX_QUEUE_LENGTH = 200;
const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 6_000;

type QueuedSend = {
  id: string;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
  payload: Omit<SendMessageInput, 'upload'>;
};

type QueueListener = (snapshot: OfflineQueueSnapshot) => void;

export type OfflineQueueSnapshot = {
  size: number;
  online: boolean;
  lastFlushAt: number | null;
  lastError: string | null;
  flushing: boolean;
};

const listeners = new Set<QueueListener>();
let queue: QueuedSend[] = [];
let loaded = false;
let online = true;
let flushing = false;
let lastFlushAt: number | null = null;
let lastError: string | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

function snapshot(): OfflineQueueSnapshot {
  return {
    size: queue.length,
    online,
    lastFlushAt,
    lastError,
    flushing,
  };
}

function notify(): void {
  const snap = snapshot();
  listeners.forEach((listener) => {
    try {
      listener(snap);
    } catch (err) {
      console.log('[OfflineQueue] listener error:', (err as Error)?.message ?? 'unknown');
    }
  });
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.log('[OfflineQueue] persist failed:', (err as Error)?.message ?? 'unknown');
  }
}

async function loadFromStorage(): Promise<void> {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as QueuedSend[];
    if (Array.isArray(parsed)) {
      queue = parsed.filter((item) => item && typeof item === 'object' && item.payload);
      console.log('[OfflineQueue] restored queue size:', queue.length);
      notify();
    }
  } catch (err) {
    console.log('[OfflineQueue] load failed:', (err as Error)?.message ?? 'unknown');
  }
}

/**
 * Classify an error as offline/network-recoverable. Auth/validation/
 * permission errors are NOT treated as offline conditions.
 */
export function isOfflineError(error: unknown): boolean {
  if (!error) return false;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (!message) return false;
  if (message.includes('network request failed')) return true;
  if (message.includes('failed to fetch')) return true;
  if (message.includes('networkerror')) return true;
  if (message.includes('the internet connection appears to be offline')) return true;
  if (message.includes('econnreset')) return true;
  if (message.includes('econnrefused')) return true;
  if (message.includes('enotfound')) return true;
  if (message.includes('etimedout')) return true;
  if (message.includes('aborted') && message.includes('network')) return true;
  return false;
}

function generateQueueId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `q-${cryptoRef.randomUUID()}`;
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueSend(input: SendMessageInput): Promise<QueuedSend> {
  await loadFromStorage();
  if (input.upload) {
    console.log('[OfflineQueue] skip upload queueing (file payload not persisted):', input.upload.name);
  }
  const { upload: _upload, ...rest } = input;
  void _upload;
  const entry: QueuedSend = {
    id: generateQueueId(),
    enqueuedAt: Date.now(),
    attempts: 0,
    payload: { ...rest, clientMessageId: rest.clientMessageId ?? generateQueueId() },
  };
  queue.push(entry);
  if (queue.length > MAX_QUEUE_LENGTH) {
    const dropped = queue.length - MAX_QUEUE_LENGTH;
    queue.splice(0, dropped);
    console.log('[OfflineQueue] trimmed oldest entries:', dropped);
  }
  online = false;
  await persist();
  notify();
  return entry;
}

export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  await loadFromStorage();
  if (flushing) {
    return { sent: 0, remaining: queue.length };
  }
  if (queue.length === 0) {
    return { sent: 0, remaining: 0 };
  }
  flushing = true;
  lastError = null;
  notify();

  let sent = 0;
  try {
    while (queue.length > 0) {
      const next = queue[0];
      next.attempts += 1;
      try {
        await chatService.sendMessage(next.payload);
        queue.shift();
        sent += 1;
        online = true;
        await persist();
        notify();
      } catch (err) {
        const message = (err as Error)?.message ?? 'unknown error';
        next.lastError = message;
        if (isOfflineError(err)) {
          online = false;
          lastError = message;
          console.log('[OfflineQueue] still offline, will retry later:', message);
          break;
        }
        // Non-offline error — drop this entry to avoid blocking the queue.
        console.log('[OfflineQueue] dropping non-recoverable entry:', message);
        queue.shift();
        lastError = message;
        await persist();
        notify();
      }
    }
  } finally {
    flushing = false;
    lastFlushAt = Date.now();
    await persist();
    notify();
  }

  return { sent, remaining: queue.length };
}

export function getOfflineQueueSnapshot(): OfflineQueueSnapshot {
  return snapshot();
}

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function markOnline(): void {
  if (!online) {
    online = true;
    notify();
    void flushQueue();
  }
}

export function markOffline(reason?: string): void {
  if (online) {
    online = false;
    lastError = reason ?? lastError;
    notify();
  }
}

/**
 * Send a message with automatic offline queueing.
 * - On success, returns the sent ChatMessage.
 * - On offline failure, enqueues the payload and rethrows so the caller can
 *   update its optimistic UI (the queue will flush automatically on
 *   reconnect).
 */
export async function sendWithOfflineQueue(input: SendMessageInput): Promise<ChatMessage> {
  await loadFromStorage();
  try {
    const result = await chatService.sendMessage(input);
    markOnline();
    return result;
  } catch (err) {
    if (isOfflineError(err) && !input.upload) {
      console.log('[OfflineQueue] enqueueing offline send:', input.conversationId);
      await enqueueSend(input);
    }
    throw err;
  }
}

async function probeReconnect(): Promise<void> {
  if (queue.length === 0 || flushing) {
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    // Lightweight no-cors HEAD probe against the device-facing public CDN.
    await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    markOnline();
  } catch (err) {
    // probe failure is expected when truly offline
    void err;
  }
}

function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'active' && queue.length > 0) {
    console.log('[OfflineQueue] app active — attempting flush');
    void flushQueue();
  }
}

let initialized = false;

export function initOfflineQueue(): void {
  if (initialized) return;
  initialized = true;
  void loadFromStorage();
  appStateSub = AppState.addEventListener('change', handleAppStateChange);
  probeTimer = setInterval(() => {
    void probeReconnect();
  }, PROBE_INTERVAL_MS);
  console.log('[OfflineQueue] initialized');
}

export function shutdownOfflineQueue(): void {
  initialized = false;
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

/** Test-only reset hook. */
export function __resetOfflineQueueForTests(): void {
  queue = [];
  loaded = false;
  online = true;
  flushing = false;
  lastFlushAt = null;
  lastError = null;
  listeners.clear();
  initialized = false;
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}
