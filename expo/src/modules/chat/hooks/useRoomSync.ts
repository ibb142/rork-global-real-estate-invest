import { useCallback, useEffect, useState } from 'react';
import {
  type RoomStateSnapshot,
  type RoomSyncPhase,
  getAuthorativeRoomStatus,
  getRoomPhase,
  getRoomStateSnapshot,
  initRoomStateManager,
  isRoomShared,
  requestRoomRedetection,
  subscribeToRoomState,
} from '../services/roomStateManager';
import type { ChatRoomStatus } from '../types/chat';

type UseRoomSyncOptions = {
  apiBase: string;
  roomId: string;
  enabled?: boolean;
};

type UseRoomSyncResult = {
  syncStatus: RoomSyncPhase;
  roomStatus: ChatRoomStatus | null;
  queuedCount: number;
  sendViaSync: (text: string) => Promise<{ savedLocally: boolean }>;
  reconnect: () => void;
};

export function useRoomSync({
  apiBase,
  roomId,
  enabled = true,
}: UseRoomSyncOptions): UseRoomSyncResult {
  const [snapshot, setSnapshot] = useState<RoomStateSnapshot>(() => getRoomStateSnapshot());

  useEffect(() => {
    if (!enabled || !roomId) {
      return;
    }

    initRoomStateManager();

    setSnapshot(getRoomStateSnapshot());

    const unsubscribe = subscribeToRoomState((next) => {
      setSnapshot(next);
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, roomId]);

  const sendViaSync = useCallback(async (_text: string) => {
    return { savedLocally: !isRoomShared() };
  }, []);

  const reconnect = useCallback(() => {
    console.log('[useRoomSync] Manual reconnect via RoomStateManager');
    requestRoomRedetection();
  }, []);

  const roomStatus: ChatRoomStatus | null = isRoomShared()
    ? getAuthorativeRoomStatus()
    : null;

  return {
    syncStatus: snapshot.phase,
    roomStatus,
    queuedCount: 0,
    sendViaSync,
    reconnect,
  };
}
