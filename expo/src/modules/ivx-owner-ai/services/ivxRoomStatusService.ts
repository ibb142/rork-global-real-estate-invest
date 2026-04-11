import { getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
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

async function verifyRealtimeChannel(): Promise<boolean> {
  try {
    const client = getIVXSupabaseClient();
    const testChannel = client.channel('ivx-realtime-probe');
    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        void client.removeChannel(testChannel);
        console.log('[IVXRoomStatus] Realtime probe: timed out, assuming capable');
        resolve(true);
      }, 3000);

      testChannel.subscribe((status) => {
        clearTimeout(timeout);
        const isSubscribed = status === 'SUBSCRIBED';
        console.log('[IVXRoomStatus] Realtime probe status:', status, 'subscribed:', isSubscribed);
        void client.removeChannel(testChannel);
        resolve(isSubscribed || status === 'CHANNEL_ERROR' ? false : true);
      });
    });
  } catch (err) {
    console.log('[IVXRoomStatus] Realtime probe exception:', err instanceof Error ? err.message : 'unknown');
    return true;
  }
}

export async function detectIVXRoomStatus(): Promise<ChatRoomStatus> {
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
