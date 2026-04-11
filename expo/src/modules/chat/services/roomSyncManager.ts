import { AppState, type AppStateStatus } from 'react-native';
import type { ChatRoomStatus, DeliveryMode, StorageMode } from '../types/chat';
import { detectRoomStatus } from './ivxChat';

export type RoomSyncStatus = 'connecting' | 'shared' | 'local_fallback' | 'blocked';

type SyncChatMessage = {
  id: string;
  roomId: string;
  text: string;
  createdAt: number;
  senderId: string;
  pending?: boolean;
};

type StatusListener = (status: RoomSyncStatus) => void;

function generateUuid(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function mapSyncStatusToRoomStatus(syncStatus: RoomSyncStatus): ChatRoomStatus {
  switch (syncStatus) {
    case 'shared':
      return {
        storageMode: 'primary_supabase_tables' as StorageMode,
        visibility: 'shared',
        deliveryMethod: 'primary_realtime' as DeliveryMode,
      };
    case 'connecting':
      return {
        storageMode: 'primary_supabase_tables' as StorageMode,
        visibility: 'shared',
        deliveryMethod: 'primary_polling' as DeliveryMode,
        warning: 'Connecting to shared room backend.',
      };
    case 'local_fallback':
      return {
        storageMode: 'local_device_only' as StorageMode,
        visibility: 'local_only',
        deliveryMethod: 'local_only' as DeliveryMode,
        warning: 'Messages are only stored on this device and are not shared.',
      };
    case 'blocked':
      return {
        storageMode: 'local_device_only' as StorageMode,
        visibility: 'local_only',
        deliveryMethod: 'local_only' as DeliveryMode,
        warning: 'Room access is blocked. Messages are local only.',
      };
    default:
      return {
        storageMode: 'local_device_only' as StorageMode,
        visibility: 'local_only',
        deliveryMethod: 'local_only' as DeliveryMode,
      };
  }
}

class RoomSyncManager {
  private apiBase: string;
  private roomId: string;
  private userId: string | null = null;
  private status: RoomSyncStatus = 'connecting';
  private localQueue: SyncChatMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: StatusListener[] = [];
  private destroyed = false;
  private appStateSubscription: { remove: () => void } | null = null;
  private lastBackgroundTime: number | null = null;

  constructor(apiBase: string, roomId: string) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.roomId = roomId;
    console.log('[RoomSyncManager] Created for room:', roomId);
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private setStatus(nextStatus: RoomSyncStatus) {
    if (this.destroyed) return;
    const prev = this.status;
    this.status = nextStatus;
    console.log('[RoomSyncManager] Status changed:', prev, '->', nextStatus);
    for (const listener of this.listeners) {
      try {
        listener(nextStatus);
      } catch (err) {
        console.log('[RoomSyncManager] Listener error:', err instanceof Error ? err.message : 'unknown');
      }
    }
  }

  async init() {
    if (this.destroyed) return;
    try {
      this.setStatus('connecting');
      const roomStatus = await this.checkSupabaseHealth();

      if (!roomStatus) {
        console.log('[RoomSyncManager] Supabase health check returned no status');
        this.setStatus('local_fallback');
        this.scheduleReconnect();
        return;
      }

      const isShared = roomStatus.storageMode !== 'local_device_only';

      if (!isShared) {
        console.log('[RoomSyncManager] No shared tables reachable, local fallback');
        this.setStatus('local_fallback');
        this.scheduleReconnect();
        return;
      }

      console.log('[RoomSyncManager] Shared tables reachable, mode:', roomStatus.storageMode);
      this.setStatus('shared');
    } catch (error) {
      console.log('[RoomSyncManager] Init failed:', error instanceof Error ? error.message : 'unknown');
      this.setStatus('local_fallback');
      this.scheduleReconnect();
    }
  }

  private async checkSupabaseHealth(): Promise<ChatRoomStatus | null> {
    console.log('[RoomSyncManager] Running Supabase detectRoomStatus() for room:', this.roomId);
    try {
      const status = await detectRoomStatus();
      console.log('[RoomSyncManager] detectRoomStatus result:', status.storageMode, status.deliveryMethod);
      return status;
    } catch (error) {
      console.log('[RoomSyncManager] detectRoomStatus failed:', error instanceof Error ? error.message : 'unknown');
      return null;
    }
  }

  async sendMessage(text: string): Promise<{ savedLocally: boolean; message: SyncChatMessage }> {
    const message: SyncChatMessage = {
      id: generateUuid(),
      roomId: this.roomId,
      text,
      createdAt: Date.now(),
      senderId: this.userId || 'unknown',
      pending: true,
    };

    if (this.status !== 'shared') {
      this.localQueue.push(message);
      console.log('[RoomSyncManager] Saved locally, queue size:', this.localQueue.length);
      return { savedLocally: true, message };
    }

    console.log('[RoomSyncManager] Message accepted in shared mode');
    return { savedLocally: false, message: { ...message, pending: false } };
  }

  async flushLocalQueue() {
    if (this.status !== 'shared') return;
    if (this.localQueue.length === 0) return;

    console.log('[RoomSyncManager] Flushing local queue, size:', this.localQueue.length);
    this.localQueue = [];
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;

    console.log('[RoomSyncManager] Scheduling reconnect in 10s');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.destroyed) return;

      try {
        const roomStatus = await this.checkSupabaseHealth();
        const isShared = roomStatus ? roomStatus.storageMode !== 'local_device_only' : false;

        if (isShared) {
          console.log('[RoomSyncManager] Reconnect: shared tables reachable again');
          this.setStatus('shared');
          await this.flushLocalQueue();
        } else {
          console.log('[RoomSyncManager] Reconnect: still no shared tables');
          this.setStatus('blocked');
          this.scheduleReconnect();
        }
      } catch (error) {
        console.log('[RoomSyncManager] Reconnect failed:', error instanceof Error ? error.message : 'unknown');
        this.setStatus('local_fallback');
        this.scheduleReconnect();
      }
    }, 10000);
  }

  startAppStateListener() {
    if (this.appStateSubscription) return;

    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (this.destroyed) return;

      if (nextState === 'background' || nextState === 'inactive') {
        this.lastBackgroundTime = Date.now();
        console.log('[RoomSyncManager] App moved to background');
        return;
      }

      if (nextState === 'active') {
        const elapsed = this.lastBackgroundTime ? Date.now() - this.lastBackgroundTime : 0;
        this.lastBackgroundTime = null;
        console.log('[RoomSyncManager] App resumed, was background for', elapsed, 'ms');

        if (this.status === 'shared' && elapsed < 3000) {
          console.log('[RoomSyncManager] Short background, skipping reconnect');
          return;
        }

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        void this.reconnectNow();
      }
    });

    console.log('[RoomSyncManager] AppState listener started');
  }

  async reconnectNow() {
    if (this.destroyed) return;

    console.log('[RoomSyncManager] Immediate reconnect triggered');
    this.setStatus('connecting');

    try {
      const roomStatus = await this.checkSupabaseHealth();
      const isShared = roomStatus ? roomStatus.storageMode !== 'local_device_only' : false;

      if (isShared) {
        console.log('[RoomSyncManager] Reconnect succeeded, shared mode restored');
        this.setStatus('shared');
        await this.flushLocalQueue();
      } else {
        console.log('[RoomSyncManager] Reconnect: no shared tables reachable');
        this.setStatus('local_fallback');
        this.scheduleReconnect();
      }
    } catch (error) {
      console.log('[RoomSyncManager] Reconnect failed:', error instanceof Error ? error.message : 'unknown');
      this.setStatus('local_fallback');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.destroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.listeners = [];
    console.log('[RoomSyncManager] Disconnected');
  }

  getStatus(): RoomSyncStatus {
    return this.status;
  }

  getQueuedMessages(): SyncChatMessage[] {
    return [...this.localQueue];
  }

  getRoomId(): string {
    return this.roomId;
  }

  getUserId(): string | null {
    return this.userId;
  }
}

export default RoomSyncManager;
