import { getIVXAccessToken, getIVXOwnerAICandidateEndpoints, getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import type { IVXOwnerAIHealthProbeResponse } from '@/shared/ivx';
import type { ChatRoomStatus, DeliveryMode, StorageMode } from '@/src/modules/chat/types/chat';
import { resolveIVXTables, invalidateTableResolverCache } from './ivxTableResolver';

export type IVXRoomProbeResult = {
  tablesReachable: boolean;
  conversationsOk: boolean;
  messagesOk: boolean;
  realtimeCapable: boolean;
  error: string | null;
  resolvedSchema: string;
};

const PROBE_CACHE_TTL_MS = 25_000;
const API_PROBE_TIMEOUT_MS = 8_000;
let cachedResult: IVXRoomProbeResult | null = null;
let cachedAt = 0;

export async function probeIVXRoomTables(): Promise<IVXRoomProbeResult> {
  const now = Date.now();
  if (cachedResult && (now - cachedAt) < PROBE_CACHE_TTL_MS) {
    console.log('[IVXRoomStatus] Using cached probe result, age:', now - cachedAt, 'ms');
    return cachedResult;
  }

  console.log('[IVXRoomStatus] Probing tables via dynamic resolver (ivx_* then generic fallback)');

  const resolved = await resolveIVXTables();
  const tablesReachable = resolved.schema !== 'none';

  const result: IVXRoomProbeResult = {
    tablesReachable,
    conversationsOk: tablesReachable,
    messagesOk: tablesReachable,
    realtimeCapable: tablesReachable,
    error: tablesReachable ? null : 'No chat tables found. Run the IVX schema SQL in your Supabase SQL Editor.',
    resolvedSchema: resolved.schema,
  };

  cachedResult = result;
  cachedAt = Date.now();

  console.log('[IVXRoomStatus] Probe result:', {
    tablesReachable: result.tablesReachable,
    resolvedSchema: result.resolvedSchema,
    tables: `${resolved.conversations} / ${resolved.messages}`,
  });

  return result;
}

export function invalidateIVXRoomProbeCache(): void {
  cachedResult = null;
  cachedAt = 0;
  invalidateTableResolverCache();
  console.log('[IVXRoomStatus] Probe cache invalidated');
}

function isChatRoomStatus(value: unknown): value is ChatRoomStatus {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.storageMode === 'string'
    && typeof record.visibility === 'string'
    && typeof record.deliveryMethod === 'string';
}

async function probeRoomStatusViaOwnerAI(): Promise<ChatRoomStatus | null> {
  try {
    const accessToken = await getIVXAccessToken();
    if (!accessToken) {
      console.log('[IVXRoomStatus] Skipping API-backed room probe because no auth token is available yet');
      return null;
    }

    const endpoints = getIVXOwnerAICandidateEndpoints();

    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_PROBE_TIMEOUT_MS);

      try {
        console.log('[IVXRoomStatus] Trying API-backed room probe endpoint:', endpoint);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: 'health_probe',
            mode: 'chat',
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 404 || response.status === 405) {
          console.log('[IVXRoomStatus] API-backed room probe endpoint unavailable:', endpoint, 'status:', response.status);
          continue;
        }

        if (!response.ok) {
          console.log('[IVXRoomStatus] API-backed room probe failed with status:', response.status, 'endpoint:', endpoint);
          return null;
        }

        const payload = await response.json().catch(() => null) as IVXOwnerAIHealthProbeResponse | null;
        const roomStatus = payload?.roomStatus;

        if (!isChatRoomStatus(roomStatus)) {
          console.log('[IVXRoomStatus] API-backed room probe returned no usable room status');
          return null;
        }

        console.log('[IVXRoomStatus] API-backed room probe resolved:', {
          endpoint,
          storageMode: roomStatus.storageMode,
          deliveryMethod: roomStatus.deliveryMethod,
          resolvedSchema: payload?.resolvedSchema ?? 'unknown',
        });

        return roomStatus;
      } catch (endpointError) {
        clearTimeout(timeout);
        console.log('[IVXRoomStatus] API-backed room probe endpoint exception:', endpoint, endpointError instanceof Error ? endpointError.message : 'unknown');
      }
    }

    return null;
  } catch (error) {
    console.log('[IVXRoomStatus] API-backed room probe exception:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

async function verifyRealtimeChannel(): Promise<boolean> {
  try {
    const client = getIVXSupabaseClient();
    const testChannel = client.channel('ivx-realtime-probe');
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let unsubscribeStarted = false;
      let channelTerminated = false;

      const safeUnsubscribe = (): void => {
        if (unsubscribeStarted || channelTerminated) {
          return;
        }

        unsubscribeStarted = true;
        try {
          void testChannel.unsubscribe();
        } catch (error) {
          console.log('[IVXRoomStatus] Realtime probe unsubscribe note:', error instanceof Error ? error.message : 'unknown');
        }
      };

      const finish = (value: boolean, reason: string): void => {
        if (settled) {
          return;
        }

        settled = true;
        console.log('[IVXRoomStatus] Realtime probe finished:', reason, 'result:', value);
        safeUnsubscribe();
        resolve(value);
      };

      const timeout = setTimeout(() => {
        console.log('[IVXRoomStatus] Realtime probe: timed out, assuming capable');
        finish(true, 'timeout');
      }, 3000);

      testChannel.subscribe((status) => {
        const normalizedStatus = String(status ?? '').toUpperCase();
        if (normalizedStatus === 'CLOSED') {
          channelTerminated = true;
        }

        clearTimeout(timeout);
        const isSubscribed = normalizedStatus === 'SUBSCRIBED';
        console.log('[IVXRoomStatus] Realtime probe status:', normalizedStatus, 'subscribed:', isSubscribed);
        if (normalizedStatus === 'SUBSCRIBED' || normalizedStatus === 'CHANNEL_ERROR' || normalizedStatus === 'TIMED_OUT' || normalizedStatus === 'CLOSED') {
          finish(isSubscribed, `status:${normalizedStatus}`);
        }
      });
    });
  } catch (err) {
    console.log('[IVXRoomStatus] Realtime probe exception:', err instanceof Error ? err.message : 'unknown');
    return true;
  }
}

export async function detectIVXRoomStatus(): Promise<ChatRoomStatus> {
  const apiRoomStatus = await probeRoomStatusViaOwnerAI();
  if (apiRoomStatus) {
    return apiRoomStatus;
  }

  const probe = await probeIVXRoomTables();

  if (probe.tablesReachable) {
    const realtimeOk = await verifyRealtimeChannel();
    const deliveryMethod: DeliveryMode = realtimeOk ? 'primary_realtime' : 'primary_polling';
    const isGenericFallback = probe.resolvedSchema === 'generic';
    const storageMode: StorageMode = isGenericFallback ? 'alternate_room_schema' : 'primary_supabase_tables';
    console.log('[IVXRoomStatus] Room status: tables reachable, schema:', probe.resolvedSchema, 'realtime:', realtimeOk, 'delivery:', deliveryMethod);
    return {
      storageMode,
      visibility: 'shared',
      deliveryMethod,
    };
  }

  return {
    storageMode: 'local_device_only' as StorageMode,
    visibility: 'local_only',
    deliveryMethod: 'local_only' as DeliveryMode,
    warning: probe.error ?? 'No chat tables available. Messages are stored locally only.',
  };
}
