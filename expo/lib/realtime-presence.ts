import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const PRESENCE_CHANNEL_PREFIX = 'ivx-presence-v3-';
const NUM_SHARDS = 3;
const BROADCAST_INTERVAL = 120_000;
const PRESENCE_STALE_THRESHOLD = 180_000;
const PRESENCE_CLEANUP_INTERVAL = 120_000;
const MAX_PRESENCE_AGE = 300_000;
const TRACKER_POLL_INTERVAL = 120_000;
const AGGREGATE_DEBOUNCE = 10_000;
const MAX_TRACKER_SHARDS = 2;
const TRACKER_SHARD_ROTATION_INTERVAL = 180_000;

export interface PresenceUser {
  sessionId: string;
  source: 'landing' | 'app';
  device: string;
  os: string;
  browser: string;
  geo?: { city?: string; country?: string; region?: string };
  currentStep?: number;
  page?: string;
  startedAt: string;
  lastSeen: string;
  engagementScore?: number;
  online_at: string;
}

export interface LivePresenceState {
  totalOnline: number;
  landingOnline: number;
  appOnline: number;
  users: PresenceUser[];
  byCountry: Array<{ country: string; count: number }>;
  byDevice: Array<{ device: string; count: number }>;
  byPage: Array<{ page: string; count: number }>;
  isConnected: boolean;
  lastSync: string;
}

const EMPTY_STATE: LivePresenceState = {
  totalOnline: 0,
  landingOnline: 0,
  appOnline: 0,
  users: [],
  byCountry: [],
  byDevice: [],
  byPage: [],
  isConnected: false,
  lastSync: '',
};

function getShardIndex(sessionId: string): number {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) % NUM_SHARDS;
}

function getShardChannelName(shardIndex: number): string {
  return `${PRESENCE_CHANNEL_PREFIX}${shardIndex}`;
}

function aggregatePresence(presences: PresenceUser[]): LivePresenceState {
  const countryMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const pageMap = new Map<string, number>();
  let landingCount = 0;
  let appCount = 0;

  const now = Date.now();
  const uniqueMap = new Map<string, PresenceUser>();
  for (const p of presences) {
    if (!p.sessionId) continue;
    const lastSeenTs = new Date(p.lastSeen || p.online_at).getTime();
    if (now - lastSeenTs > PRESENCE_STALE_THRESHOLD) {
      continue;
    }
    const existing = uniqueMap.get(p.sessionId);
    if (!existing || new Date(p.lastSeen).getTime() > new Date(existing.lastSeen).getTime()) {
      uniqueMap.set(p.sessionId, p);
    }
  }

  const unique = Array.from(uniqueMap.values());

  for (const u of unique) {
    if (u.source === 'landing') landingCount++;
    else appCount++;

    if (u.geo?.country) {
      countryMap.set(u.geo.country, (countryMap.get(u.geo.country) || 0) + 1);
    }
    if (u.device) {
      deviceMap.set(u.device, (deviceMap.get(u.device) || 0) + 1);
    }
    const page = u.page || (u.source === 'landing' ? 'Landing Page' : 'App');
    pageMap.set(page, (pageMap.get(page) || 0) + 1);
  }

  return {
    totalOnline: unique.length,
    landingOnline: landingCount,
    appOnline: appCount,
    users: unique.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()),
    byCountry: Array.from(countryMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    byDevice: Array.from(deviceMap.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count),
    byPage: Array.from(pageMap.entries())
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count),
    isConnected: true,
    lastSync: new Date().toISOString(),
  };
}

type PresenceListener = (state: LivePresenceState) => void;

class PresenceManager {
  private broadcastChannel: RealtimeChannel | null = null;
  private trackerChannels: RealtimeChannel[] = [];
  private isSubscribed = false;
  private isSubscribing = false;
  private isBroadcasting = false;
  private isBroadcastChannelBound = false;
  private isBroadcastChannelSubscribing = false;
  private listeners = new Set<PresenceListener>();
  private broadcastData: PresenceUser | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private lastState: LivePresenceState = EMPTY_STATE;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private staleSessionCount = 0;
  private totalPresenceSyncs = 0;
  private aggregateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private broadcastShardIndex = -1;

  private getOrCreateBroadcastChannel(sessionId: string): RealtimeChannel | null {
    if (!isSupabaseConfigured()) {
      console.log('[PresenceMgr] Supabase not configured');
      return null;
    }

    this.broadcastShardIndex = getShardIndex(sessionId);
    const channelName = getShardChannelName(this.broadcastShardIndex);

    if (this.broadcastChannel) {
      return this.broadcastChannel;
    }

    this.broadcastChannel = supabase.channel(channelName, {
      config: { presence: { key: sessionId } },
    });
    this.isBroadcastChannelBound = false;
    this.isBroadcastChannelSubscribing = false;
    this.bindBroadcastChannel(this.broadcastChannel);

    console.log('[PresenceMgr] Broadcast channel created on shard:', this.broadcastShardIndex, 'key:', sessionId);
    return this.broadcastChannel;
  }

  private bindBroadcastChannel(channel: RealtimeChannel) {
    if (this.isBroadcastChannelBound) {
      return;
    }

    try {
      channel.on('presence', { event: 'sync' }, () => {
        this.debouncedSync();
      });
      this.isBroadcastChannelBound = true;
    } catch (error) {
      console.log('[PresenceMgr] Presence sync binding skipped:', (error as Error)?.message ?? 'unknown');
    }
  }

  private syncAllShards() {
    const allUsers: PresenceUser[] = [];

    for (const channel of this.trackerChannels) {
      try {
        const presenceState = channel.presenceState();
        for (const key of Object.keys(presenceState)) {
          const entries = presenceState[key];
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              const user = entry as unknown as PresenceUser;
              if (user && user.sessionId) {
                allUsers.push(user);
              }
            }
          }
        }
      } catch (err) {
        console.log('[PresenceMgr] Shard sync error:', (err as Error)?.message);
      }
    }

    if (this.broadcastChannel && !this.trackerChannels.includes(this.broadcastChannel)) {
      try {
        const presenceState = this.broadcastChannel.presenceState();
        for (const key of Object.keys(presenceState)) {
          const entries = presenceState[key];
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              const user = entry as unknown as PresenceUser;
              if (user && user.sessionId) {
                allUsers.push(user);
              }
            }
          }
        }
      } catch {}
    }

    const aggregated = aggregatePresence(allUsers);
    this.totalPresenceSyncs++;
    this.lastState = aggregated;

    console.log(`[PresenceMgr] Synced ${NUM_SHARDS} shards: ${aggregated.totalOnline} online (${aggregated.landingOnline} landing, ${aggregated.appOnline} app) | syncs: ${this.totalPresenceSyncs}`);

    for (const listener of this.listeners) {
      try { listener(aggregated); } catch {}
    }
  }

  private debouncedSync() {
    if (this.aggregateDebounceTimer) clearTimeout(this.aggregateDebounceTimer);
    this.aggregateDebounceTimer = setTimeout(() => {
      this.syncAllShards();
    }, AGGREGATE_DEBOUNCE);
  }

  private startCleanupInterval() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cleanupInterval = setInterval(() => {
      this.runStaleCleanup();
    }, PRESENCE_CLEANUP_INTERVAL);
  }

  private runStaleCleanup() {
    if (!this.lastState.isConnected || this.lastState.users.length === 0) return;

    const now = Date.now();
    const beforeCount = this.lastState.users.length;
    const freshUsers = this.lastState.users.filter(u => {
      const lastSeenTs = new Date(u.lastSeen || u.online_at).getTime();
      const age = now - lastSeenTs;
      if (isNaN(lastSeenTs) || age > MAX_PRESENCE_AGE) {
        return false;
      }
      return true;
    });

    if (freshUsers.length < beforeCount) {
      const removed = beforeCount - freshUsers.length;
      this.staleSessionCount += removed;
      console.log('[PresenceMgr] Cleanup removed', removed, 'stale sessions. Total stale:', this.staleSessionCount);

      const updatedState = aggregatePresence(freshUsers);
      this.lastState = updatedState;
      for (const listener of this.listeners) {
        try { listener(updatedState); } catch {}
      }
    }
  }

  private trackerShardOffset = 0;
  private trackerRotationInterval: ReturnType<typeof setInterval> | null = null;

  private async subscribeTrackerToAllShards(): Promise<void> {
    if (this.isSubscribed || this.isSubscribing) return;
    if (!isSupabaseConfigured()) return;

    this.isSubscribing = true;
    await this.subscribeTrackerBatch(0);

    this.isSubscribed = true;
    this.isSubscribing = false;
    this.startPolling();
    this.startCleanupInterval();
    this.startTrackerRotation();

    setTimeout(() => {
      this.syncAllShards();
    }, 4000);

    console.log('[PresenceMgr] Tracker subscribed to first', MAX_TRACKER_SHARDS, 'of', NUM_SHARDS, 'shards (rotating)');
  }

  private async subscribeTrackerBatch(offset: number): Promise<void> {
    for (const ch of this.trackerChannels) {
      if (ch !== this.broadcastChannel) {
        try { void supabase.removeChannel(ch); } catch {}
      }
    }
    this.trackerChannels = [];

    let subscribedCount = 0;
    const shardsToSubscribe: number[] = [];
    for (let j = 0; j < MAX_TRACKER_SHARDS; j++) {
      shardsToSubscribe.push((offset + j) % NUM_SHARDS);
    }

    if (this.broadcastChannel && this.broadcastShardIndex >= 0 && !shardsToSubscribe.includes(this.broadcastShardIndex)) {
      this.trackerChannels.push(this.broadcastChannel);
    }

    for (const i of shardsToSubscribe) {
      if (this.broadcastChannel && this.broadcastShardIndex === i) {
        this.trackerChannels.push(this.broadcastChannel);
        subscribedCount++;
        continue;
      }

      const channelName = getShardChannelName(i);
      const channel = supabase.channel(channelName + '-tracker-' + Math.random().toString(36).slice(2, 5), {
        config: { presence: { key: 'tracker-' + Math.random().toString(36).slice(2, 6) } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          this.debouncedSync();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            subscribedCount++;
            console.log('[PresenceMgr] Tracker shard', i, 'subscribed (', subscribedCount, '/', MAX_TRACKER_SHARDS, ')');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('[PresenceMgr] Tracker shard', i, 'error:', status);
          }
        });

      this.trackerChannels.push(channel);
    }
  }

  private startTrackerRotation() {
    if (this.trackerRotationInterval) clearInterval(this.trackerRotationInterval);
    this.trackerRotationInterval = setInterval(() => {
      this.trackerShardOffset = (this.trackerShardOffset + MAX_TRACKER_SHARDS) % NUM_SHARDS;
      console.log('[PresenceMgr] Rotating tracker to shards starting at:', this.trackerShardOffset);
      void this.subscribeTrackerBatch(this.trackerShardOffset);
    }, TRACKER_SHARD_ROTATION_INTERVAL);
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.syncAllShards();
    }, TRACKER_POLL_INTERVAL);

    if (this.appStateSub) this.appStateSub.remove();
    this.appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        console.log('[PresenceMgr] App became active — syncing');
        this.syncAllShards();
        if (this.broadcastData && this.broadcastChannel && this.isBroadcasting) {
          void this.broadcastChannel.track({
            ...this.broadcastData,
            lastSeen: new Date().toISOString(),
            online_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    });
  }

  private startBroadcastHeartbeat() {
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.broadcastInterval = setInterval(async () => {
      if (!this.broadcastData || !this.broadcastChannel || !this.isBroadcasting) return;
      try {
        await this.broadcastChannel.track({
          ...this.broadcastData,
          lastSeen: new Date().toISOString(),
          online_at: new Date().toISOString(),
        });
      } catch (err) {
        console.log('[PresenceMgr] Heartbeat track error:', (err as Error)?.message);
      }
    }, BROADCAST_INTERVAL);
  }

  async startBroadcasting(data: Omit<PresenceUser, 'startedAt' | 'lastSeen' | 'online_at'>) {
    const now = new Date().toISOString();
    const existingStartedAt = this.broadcastData?.startedAt ?? now;
    this.broadcastData = {
      ...data,
      startedAt: existingStartedAt,
      lastSeen: now,
      online_at: now,
    };
    console.log('[PresenceMgr] Broadcasting as:', data.sessionId, 'source:', data.source, 'shard:', getShardIndex(data.sessionId));

    const channel = this.getOrCreateBroadcastChannel(data.sessionId);
    if (!channel) {
      return;
    }

    if (this.isBroadcasting) {
      try {
        await channel.track({
          ...this.broadcastData,
          lastSeen: new Date().toISOString(),
          online_at: new Date().toISOString(),
        });
        console.log('[PresenceMgr] Broadcast channel already active, refreshed tracked payload for:', data.sessionId);
      } catch (err) {
        console.log('[PresenceMgr] Refresh track error:', (err as Error)?.message);
      }
      this.startBroadcastHeartbeat();
      return;
    }

    if (this.isBroadcastChannelSubscribing) {
      console.log('[PresenceMgr] Broadcast channel subscribe already in progress for:', data.sessionId);
      return;
    }

    this.isBroadcastChannelSubscribing = true;

    return new Promise<void>((resolve) => {
      channel.subscribe(async (status) => {
        console.log('[PresenceMgr] Broadcast channel status:', status);
        if (status === 'SUBSCRIBED') {
          this.isBroadcastChannelSubscribing = false;
          this.isBroadcasting = true;
          try {
            await channel.track({
              ...this.broadcastData!,
              lastSeen: new Date().toISOString(),
              online_at: new Date().toISOString(),
            });
            console.log('[PresenceMgr] Initial presence tracked for:', data.sessionId);
          } catch (err) {
            console.log('[PresenceMgr] Initial track error:', (err as Error)?.message);
          }
          this.startBroadcastHeartbeat();
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.isBroadcastChannelSubscribing = false;
          this.isBroadcasting = false;
          console.log('[PresenceMgr] Broadcast channel error:', status);
          setTimeout(() => { void this.reconnectBroadcast(); }, 5000);
          resolve();
        } else if (status === 'CLOSED') {
          this.isBroadcastChannelSubscribing = false;
          this.isBroadcasting = false;
          setTimeout(() => { void this.reconnectBroadcast(); }, 3000);
          resolve();
        }
      });
    });
  }

  private async reconnectBroadcast() {
    if (!this.broadcastData) return;
    console.log('[PresenceMgr] Reconnecting broadcast...');
    if (this.broadcastChannel) {
      try { void supabase.removeChannel(this.broadcastChannel); } catch {}
      this.broadcastChannel = null;
      this.isBroadcastChannelBound = false;
      this.isBroadcastChannelSubscribing = false;
    }
    const data = this.broadcastData;
    this.broadcastData = null;
    this.isBroadcasting = false;
    await this.startBroadcasting({
      sessionId: data.sessionId,
      source: data.source,
      device: data.device,
      os: data.os,
      browser: data.browser,
      geo: data.geo,
      currentStep: data.currentStep,
      page: data.page,
      engagementScore: data.engagementScore,
    });
  }

  async startTracking(listener: PresenceListener): Promise<() => void> {
    this.listeners.add(listener);
    console.log('[PresenceMgr] Tracker added (total listeners:', this.listeners.size, ')');

    if (this.lastState.isConnected) {
      listener(this.lastState);
    }

    await this.subscribeTrackerToAllShards();

    if (this.isSubscribed) {
      listener({ ...this.lastState, isConnected: true });
    }

    return () => {
      this.listeners.delete(listener);
      console.log('[PresenceMgr] Tracker removed (remaining listeners:', this.listeners.size, ')');
    };
  }

  updatePage(page: string) {
    if (this.broadcastData) {
      this.broadcastData = { ...this.broadcastData, page };
      if (this.broadcastChannel && this.isBroadcasting) {
        void this.broadcastChannel.track({
          ...this.broadcastData,
          lastSeen: new Date().toISOString(),
          online_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  }

  stopBroadcasting() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    if (this.broadcastChannel && this.isBroadcasting) {
      try { void this.broadcastChannel.untrack(); } catch {}
    }
    this.broadcastData = null;
    this.isBroadcasting = false;
    this.isBroadcastChannelSubscribing = false;
    console.log('[PresenceMgr] Broadcasting stopped');
  }

  getState(): LivePresenceState {
    return this.lastState;
  }

  getPresenceHealth(): { totalSyncs: number; staleRemoved: number; currentOnline: number; shardCount: number } {
    return {
      totalSyncs: this.totalPresenceSyncs,
      staleRemoved: this.staleSessionCount,
      currentOnline: this.lastState.totalOnline,
      shardCount: NUM_SHARDS,
    };
  }

  destroy() {
    this.stopBroadcasting();
    this.listeners.clear();

    if (this.aggregateDebounceTimer) {
      clearTimeout(this.aggregateDebounceTimer);
      this.aggregateDebounceTimer = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }

    if (this.trackerRotationInterval) {
      clearInterval(this.trackerRotationInterval);
      this.trackerRotationInterval = null;
    }

    if (this.broadcastChannel) {
      try { void supabase.removeChannel(this.broadcastChannel); } catch {}
      this.broadcastChannel = null;
      this.isBroadcastChannelBound = false;
      this.isBroadcastChannelSubscribing = false;
    }
    for (const ch of this.trackerChannels) {
      if (ch !== this.broadcastChannel) {
        try { void supabase.removeChannel(ch); } catch {}
      }
    }
    this.trackerChannels = [];

    this.isSubscribed = false;
    this.isSubscribing = false;
    this.isBroadcasting = false;
    this.lastState = EMPTY_STATE;
    console.log('[PresenceMgr] Destroyed');
  }
}

export const presenceManager = new PresenceManager();

export function usePresenceTracker(): LivePresenceState {
  const [state, setState] = useState<LivePresenceState>(EMPTY_STATE);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!isSupabaseConfigured()) {
      console.log('[Presence] Supabase not configured — presence tracking disabled');
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const setup = async () => {
      try {
        unsubscribe = await presenceManager.startTracking((newState) => {
          if (mountedRef.current) {
            setState(newState);
          }
        });
      } catch (err) {
        console.log('[Presence] Tracker setup error:', (err as Error)?.message);
      }
    };

    void setup();

    return () => {
      mountedRef.current = false;
      if (unsubscribe) unsubscribe();
      console.log('[Presence] Tracker cleaned up');
    };
  }, []);

  return state;
}

export function usePresenceBroadcast(userInfo: {
  sessionId: string;
  source: 'app';
  page?: string;
}) {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!userInfo.sessionId) return;

    void presenceManager.startBroadcasting({
      sessionId: userInfo.sessionId,
      source: 'app',
      device: Platform.OS === 'web' ? 'Desktop' : Platform.OS === 'ios' ? 'Mobile' : 'Mobile',
      os: Platform.OS,
      browser: Platform.OS === 'web' ? 'Browser' : 'App',
      page: userInfo.page || 'App',
    });

    return () => {
      presenceManager.stopBroadcasting();
    };
  }, [userInfo.sessionId, userInfo.source, userInfo.page]);
}
