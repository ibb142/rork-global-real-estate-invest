import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const PRESENCE_CHANNEL = 'ivx-presence-v1';
const HEARTBEAT_INTERVAL = 6_000;
const BROADCAST_INTERVAL = 15_000;
const PRESENCE_STALE_THRESHOLD = 45_000;

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
      console.log('[PresenceMgr] Filtering stale user:', p.sessionId, 'last seen', Math.round((now - lastSeenTs) / 1000), 's ago');
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
  private channel: RealtimeChannel | null = null;
  private isSubscribed = false;
  private isSubscribing = false;
  private listeners = new Set<PresenceListener>();
  private broadcastData: PresenceUser | null = null;
  private broadcastInterval: ReturnType<typeof setInterval> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private lastState: LivePresenceState = EMPTY_STATE;
  private subscribePromise: Promise<void> | null = null;

  private ensureChannel(): RealtimeChannel | null {
    if (!isSupabaseConfigured()) {
      console.log('[PresenceMgr] Supabase not configured');
      return null;
    }

    if (this.channel) return this.channel;

    const presenceKey = this.broadcastData?.sessionId || ('tracker-' + Math.random().toString(36).slice(2, 8));

    this.channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: presenceKey } },
    });

    console.log('[PresenceMgr] Channel created with key:', presenceKey);
    return this.channel;
  }

  private syncPresence() {
    if (!this.channel) return;
    try {
      const presenceState = this.channel.presenceState();
      const allUsers: PresenceUser[] = [];

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

      const aggregated = aggregatePresence(allUsers);
      this.lastState = aggregated;

      console.log(`[PresenceMgr] Synced: ${aggregated.totalOnline} online (${aggregated.landingOnline} landing, ${aggregated.appOnline} app)`);

      for (const listener of this.listeners) {
        try { listener(aggregated); } catch {}
      }
    } catch (err) {
      console.log('[PresenceMgr] Sync error:', (err as Error)?.message);
    }
  }

  private async subscribe(): Promise<void> {
    if (this.isSubscribed || this.isSubscribing) return;

    const channel = this.ensureChannel();
    if (!channel) return;

    this.isSubscribing = true;

    return new Promise<void>((resolve) => {
      channel
        .on('presence', { event: 'sync' }, () => {
          console.log('[PresenceMgr] Presence sync event');
          this.syncPresence();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('[PresenceMgr] Join:', key, newPresences?.length, 'new');
          this.syncPresence();
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('[PresenceMgr] Leave:', key, leftPresences?.length, 'left');
          this.syncPresence();
        })
        .subscribe(async (status) => {
          console.log('[PresenceMgr] Channel status:', status);
          if (status === 'SUBSCRIBED') {
            this.isSubscribed = true;
            this.isSubscribing = false;

            if (this.broadcastData) {
              try {
                await channel.track({
                  ...this.broadcastData,
                  lastSeen: new Date().toISOString(),
                  online_at: new Date().toISOString(),
                });
                console.log('[PresenceMgr] Initial presence tracked for:', this.broadcastData.sessionId);
              } catch (err) {
                console.log('[PresenceMgr] Initial track error:', (err as Error)?.message);
              }
            }

            this.startPolling();
            this.syncPresence();
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.isSubscribed = false;
            this.isSubscribing = false;
            console.log('[PresenceMgr] Channel error/timeout — will retry in 3s');
            this.lastState = { ...EMPTY_STATE, isConnected: false };
            for (const listener of this.listeners) {
              try { listener(this.lastState); } catch {}
            }
            setTimeout(() => { void this.reconnect(); }, 3000);
            resolve();
          } else if (status === 'CLOSED') {
            this.isSubscribed = false;
            this.isSubscribing = false;
            console.log('[PresenceMgr] Channel closed — will retry in 2s');
            setTimeout(() => { void this.reconnect(); }, 2000);
            resolve();
          }
        });
    });
  }

  private async reconnect() {
    console.log('[PresenceMgr] Reconnecting...');
    this.cleanup(true);
    await this.subscribe();
    if (this.isSubscribed && this.broadcastData && this.channel) {
      try {
        await this.channel.track({
          ...this.broadcastData,
          lastSeen: new Date().toISOString(),
          online_at: new Date().toISOString(),
        });
        console.log('[PresenceMgr] Reconnect track successful');
      } catch (err) {
        console.log('[PresenceMgr] Reconnect track failed:', (err as Error)?.message);
      }
    }
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(() => {
      this.syncPresence();
    }, HEARTBEAT_INTERVAL);

    if (this.appStateSub) this.appStateSub.remove();
    this.appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        console.log('[PresenceMgr] App became active — syncing');
        this.syncPresence();
        if (this.broadcastData && this.channel && this.isSubscribed) {
          void this.channel.track({
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
      if (!this.broadcastData || !this.channel || !this.isSubscribed) return;
      try {
        await this.channel.track({
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
    this.broadcastData = {
      ...data,
      startedAt: now,
      lastSeen: now,
      online_at: now,
    };
    console.log('[PresenceMgr] Broadcasting as:', data.sessionId, 'source:', data.source);

    if (!this.subscribePromise) {
      this.subscribePromise = this.subscribe();
    }
    await this.subscribePromise;

    if (this.isSubscribed && this.channel) {
      try {
        await this.channel.track({
          ...this.broadcastData,
          lastSeen: new Date().toISOString(),
          online_at: new Date().toISOString(),
        });
        console.log('[PresenceMgr] Presence tracked successfully');
      } catch (err) {
        console.log('[PresenceMgr] Track error:', (err as Error)?.message);
      }
    }

    this.startBroadcastHeartbeat();
  }

  async startTracking(listener: PresenceListener): Promise<() => void> {
    this.listeners.add(listener);
    console.log('[PresenceMgr] Tracker added (total listeners:', this.listeners.size, ')');

    if (this.lastState.isConnected) {
      listener(this.lastState);
    }

    if (!this.subscribePromise) {
      this.subscribePromise = this.subscribe();
    }
    await this.subscribePromise;

    if (this.isSubscribed) {
      listener({ ...this.lastState, isConnected: true });
      this.syncPresence();
    }

    return () => {
      this.listeners.delete(listener);
      console.log('[PresenceMgr] Tracker removed (remaining listeners:', this.listeners.size, ')');
    };
  }

  updatePage(page: string) {
    if (this.broadcastData) {
      this.broadcastData = { ...this.broadcastData, page };
      if (this.channel && this.isSubscribed) {
        void this.channel.track({
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
    if (this.channel && this.isSubscribed) {
      try { void this.channel.untrack(); } catch {}
    }
    this.broadcastData = null;
    console.log('[PresenceMgr] Broadcasting stopped');
  }

  getState(): LivePresenceState {
    return this.lastState;
  }

  private cleanup(removeChannel = true) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
    if (removeChannel && this.channel) {
      try { void supabase.removeChannel(this.channel); } catch {}
      this.channel = null;
    }
    this.isSubscribed = false;
    this.isSubscribing = false;
    this.subscribePromise = null;
  }

  destroy() {
    this.stopBroadcasting();
    this.listeners.clear();
    this.cleanup(true);
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
