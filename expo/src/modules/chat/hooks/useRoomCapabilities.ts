import { useEffect, useMemo, useState } from 'react';
import type { ChatRoomRuntimeSignals, ChatRoomStatus } from '../types/chat';
import {
  getDefaultRoomRuntimeSignals,
  resolveRoomCapabilityState,
  type RoomCapabilityResolution,
} from '../services/roomCapabilityResolver';
import {
  type RoomStateSnapshot,
  getAuthorativeRoomStatus,
  getRoomStateSnapshot,
  initRoomStateManager,
  subscribeToRoomState,
} from '../services/roomStateManager';

export function useRoomCapabilities(
  runtimeSignals?: ChatRoomRuntimeSignals,
  _syncRoomStatusOverride?: ChatRoomStatus | null,
): {
  resolution: RoomCapabilityResolution;
  roomStatus: ChatRoomStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const [snapshot, setSnapshot] = useState<RoomStateSnapshot>(() => getRoomStateSnapshot());

  useEffect(() => {
    initRoomStateManager();
    const unsubscribe = subscribeToRoomState((next) => {
      setSnapshot(next);
    });
    return unsubscribe;
  }, []);

  const signals = runtimeSignals ?? getDefaultRoomRuntimeSignals();
  const roomStatus = snapshot.status;
  const isLoading = snapshot.phase === 'initializing' || snapshot.phase === 'detecting';

  const resolution = useMemo<RoomCapabilityResolution>(() => {
    console.log('[useRoomCapabilities] Resolving from RoomStateManager:', {
      phase: snapshot.phase,
      storageMode: roomStatus?.storageMode ?? 'unknown',
      deliveryMethod: roomStatus?.deliveryMethod ?? 'unknown',
      cid: snapshot.correlationId,
    });
    return resolveRoomCapabilityState(roomStatus ?? null, signals);
  }, [roomStatus, signals, snapshot.phase, snapshot.correlationId]);

  return {
    resolution,
    roomStatus: roomStatus ?? null,
    isLoading,
    error: null,
    refetch: () => {
      const { requestRoomRedetection } = require('../services/roomStateManager');
      requestRoomRedetection();
    },
  };
}
