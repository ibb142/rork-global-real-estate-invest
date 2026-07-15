/**
 * useMediaDiagnostics — development diagnostic panel for monitoring
 * video player health during the reels feed session.
 *
 * In development: shows mounted players, active reel, buffer state,
 * memory warnings, retry count, last error, and network type.
 * In production: logs diagnostics without exposing private information.
 */
import { useCallback, useRef, useState } from 'react';

export interface MediaDiagnostics {
  mountedPlayers: number;
  activePlayers: number;
  activeReelId: string | null;
  activeIndex: number;
  loadedSource: string | null;
  bufferState: 'idle' | 'buffering' | 'ready' | 'error';
  playbackState: 'stopped' | 'playing' | 'paused' | 'ended';
  memoryWarningCount: number;
  retryCount: number;
  lastError: string | null;
  networkType: string;
  update: (patch: Partial<Omit<MediaDiagnostics, 'update' | 'reset' | 'logSnapshot'>>) => void;
  reset: () => void;
  logSnapshot: () => void;
}

const INITIAL: Omit<MediaDiagnostics, 'update' | 'reset' | 'logSnapshot'> = {
  mountedPlayers: 0,
  activePlayers: 0,
  activeReelId: null,
  activeIndex: 0,
  loadedSource: null,
  bufferState: 'idle',
  playbackState: 'stopped',
  memoryWarningCount: 0,
  retryCount: 0,
  lastError: null,
  networkType: 'unknown',
};

export function useMediaDiagnostics(): MediaDiagnostics {
  const [state, setState] = useState<Omit<MediaDiagnostics, 'update' | 'reset' | 'logSnapshot'>>(INITIAL);
  const stateRef = useRef(state);

  const update = useCallback(
    (patch: Partial<Omit<MediaDiagnostics, 'update' | 'reset' | 'logSnapshot'>>) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setState(INITIAL);
    stateRef.current = INITIAL;
  }, []);

  const logSnapshot = useCallback(() => {
    const s = stateRef.current;
    // Production-safe: no URLs or user data, just counts and states
    console.log('[MediaDiagnostics]', {
      mounted: s.mountedPlayers,
      active: s.activePlayers,
      reelId: s.activeReelId?.slice(0, 8) ?? null,
      index: s.activeIndex,
      buffer: s.bufferState,
      playback: s.playbackState,
      memWarnings: s.memoryWarningCount,
      retries: s.retryCount,
      error: s.lastError?.slice(0, 100) ?? null,
      net: s.networkType,
    });
  }, []);

  return { ...state, update, reset, logSnapshot };
}
