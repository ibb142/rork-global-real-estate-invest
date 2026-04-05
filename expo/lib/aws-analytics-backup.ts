import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
const AWS_QUEUE_KEY = '@ivx_aws_analytics_queue';
const AWS_EVENTS_STORE_KEY = '@ivx_aws_analytics_events';
const AWS_BATCH_SIZE = 100;
const AWS_FLUSH_INTERVAL = 60_000;
const AWS_MAX_QUEUE = 5000;
const AWS_MAX_STORED_EVENTS = 10000;
const AWS_RETRY_BACKOFF_BASE = 5_000;
const AWS_MAX_RETRIES = 5;

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET_NAME || '';

export interface AWSAnalyticsEvent {
  id: string;
  event: string;
  session_id: string;
  properties?: Record<string, unknown>;
  geo?: Record<string, unknown>;
  ip_address?: string;
  platform: string;
  source: 'landing' | 'app' | 'waitlist' | 'chat';
  timestamp: string;
  created_at: string;
}

type BackupStatus = 'idle' | 'syncing' | 'error' | 'disabled';

class AWSAnalyticsBackup {
  private queue: AWSAnalyticsEvent[] = [];
  private localEventStore: AWSAnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private status: BackupStatus = 'idle';
  private totalSynced = 0;
  private totalFailed = 0;
  private totalStoredLocally = 0;
  private retryCount = 0;
  private lastError: string | null = null;
  private apiEndpoint: string;
  private useDirectApi = false;
  private supabaseFailoverActive = false;
  private supabaseFailoverCount = 0;

  constructor() {
    this.apiEndpoint = this.buildEndpoint();
  }

  private buildEndpoint(): string {
    const apiBase = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (apiBase) {
      return `${apiBase}/analytics/aws-backup`;
    }
    if (S3_BUCKET && AWS_REGION) {
      this.useDirectApi = true;
      return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/analytics`;
    }
    return '';
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const stored = await AsyncStorage.getItem(AWS_QUEUE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
          console.log('[AWSBackup] Loaded', parsed.length, 'queued events from storage');
        }
      }
    } catch (err) {
      console.log('[AWSBackup] Load queue error:', (err as Error)?.message);
    }

    try {
      const storedEvents = await AsyncStorage.getItem(AWS_EVENTS_STORE_KEY);
      if (storedEvents) {
        const parsed = JSON.parse(storedEvents);
        if (Array.isArray(parsed)) {
          this.localEventStore = parsed;
          this.totalStoredLocally = parsed.length;
          console.log('[AWSBackup] Loaded', parsed.length, 'local backup events');
        }
      }
    } catch (err) {
      console.log('[AWSBackup] Load local events error:', (err as Error)?.message);
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, AWS_FLUSH_INTERVAL);

    const hasConfig = !!(this.apiEndpoint);
    this.status = hasConfig ? 'idle' : 'idle';
    console.log('[AWSBackup] Initialized | endpoint:', this.apiEndpoint ? this.apiEndpoint.substring(0, 50) : 'LOCAL_ONLY', '| status:', this.status, '| local events:', this.localEventStore.length);
  }

  isConfigured(): boolean {
    return !!this.apiEndpoint;
  }

  enqueue(event: AWSAnalyticsEvent): void {
    this.queue.push(event);
    this.storeLocally(event);

    if (this.queue.length > AWS_MAX_QUEUE) {
      const dropped = this.queue.length - AWS_MAX_QUEUE;
      this.queue = this.queue.slice(-AWS_MAX_QUEUE);
      this.totalFailed += dropped;
      console.log('[AWSBackup] Queue overflow - rotated', dropped, 'oldest events');
    }

    void this.saveQueue();

    if (this.queue.length >= AWS_BATCH_SIZE) {
      void this.flush();
    }
  }

  enqueueSupabaseFailover(events: AWSAnalyticsEvent[]): void {
    this.supabaseFailoverActive = true;
    this.supabaseFailoverCount += events.length;
    console.log('[AWSBackup] Supabase failover — receiving', events.length, 'events (total failover:', this.supabaseFailoverCount, ')');
    for (const event of events) {
      this.storeLocally(event);
      this.queue.push(event);
    }
    void this.saveQueue();
    if (this.queue.length >= AWS_BATCH_SIZE) {
      void this.flush();
    }
  }

  private storeLocally(event: AWSAnalyticsEvent): void {
    this.localEventStore.push(event);
    this.totalStoredLocally++;
    if (this.localEventStore.length > AWS_MAX_STORED_EVENTS) {
      this.localEventStore = this.localEventStore.slice(-AWS_MAX_STORED_EVENTS);
    }
    void this.saveLocalEvents();
  }

  private async saveLocalEvents(): Promise<void> {
    try {
      await AsyncStorage.setItem(AWS_EVENTS_STORE_KEY, JSON.stringify(this.localEventStore.slice(-AWS_MAX_STORED_EVENTS)));
    } catch {}
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.status === 'syncing') return;
    if (!this.apiEndpoint) {
      console.log('[AWSBackup] No remote endpoint — events stored locally only (' + this.localEventStore.length + ' events)');
      this.queue = [];
      void this.saveQueue();
      return;
    }

    this.status = 'syncing';
    const batch = this.queue.splice(0, AWS_BATCH_SIZE);

    try {
      const success = await this.sendBatch(batch);

      if (success) {
        this.totalSynced += batch.length;
        this.retryCount = 0;
        this.lastError = null;
        this.status = 'idle';
        console.log(`[AWSBackup] Synced ${batch.length} events (total: ${this.totalSynced}, remaining: ${this.queue.length})`);
      } else {
        this.queue.unshift(...batch);
        this.retryCount++;
        this.status = 'error';

        if (this.retryCount >= AWS_MAX_RETRIES) {
          this.totalFailed += batch.length;
          this.queue.splice(0, batch.length);
          console.log(`[AWSBackup] Max retries reached — ${batch.length} events kept locally, remote sync paused`);
          this.retryCount = 0;
          this.disableRemoteSync();
        } else {
          const backoff = AWS_RETRY_BACKOFF_BASE * Math.pow(2, this.retryCount - 1);
          setTimeout(() => void this.flush(), backoff);
        }
      }
    } catch (err) {
      this.queue.unshift(...batch);
      this.lastError = (err as Error)?.message ?? 'Unknown error';
      this.status = 'error';
      console.log('[AWSBackup] Flush exception — events kept locally');
    }

    await this.saveQueue();
  }

  private async sendBatch(batch: AWSAnalyticsEvent[]): Promise<boolean> {
    if (!this.apiEndpoint) return false;

    if (this.useDirectApi) {
      console.log('[AWSBackup] Direct S3 uploads require server-side signing — storing locally instead');
      return false;
    }

    return this.sendToBackendProxy(batch);
  }

  private async sendToBackendProxy(batch: AWSAnalyticsEvent[]): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const resp = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: batch,
          source: 'aws_backup',
          timestamp: new Date().toISOString(),
          platform: Platform.OS,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        this.lastError = `Backend proxy: ${resp.status} ${body.substring(0, 200)}`;
        if (resp.status === 404 || resp.status === 502 || resp.status === 503) {
          console.log('[AWSBackup] Endpoint unavailable (' + resp.status + ') — events kept locally');
          this.disableRemoteSync();
          return false;
        }
        console.warn('[AWSBackup] Backend proxy failed:', resp.status);
        return false;
      }

      return true;
    } catch (err) {
      this.lastError = (err as Error)?.message ?? 'Network error';
      if (this.retryCount === 0) {
        console.log('[AWSBackup] Backend proxy unreachable — events stored locally');
      }
      return false;
    }
  }

  private disableRemoteSync(): void {
    this.apiEndpoint = '';
    this.useDirectApi = false;
    this.retryCount = 0;
    this.status = 'idle';
    this.queue = [];
    void this.saveQueue();
    console.log('[AWSBackup] Remote sync disabled — all events stored locally only');
  }

  private async sendToS3Direct(batch: AWSAnalyticsEvent[]): Promise<boolean> {
    try {
      const now = new Date();
      const datePrefix = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const key = `analytics/${datePrefix}/${now.getTime()}_${Math.random().toString(36).substring(2, 8)}.json`;

      const payload = JSON.stringify({
        events: batch,
        metadata: {
          count: batch.length,
          platform: Platform.OS,
          uploadedAt: now.toISOString(),
          source: 'aws_backup_direct',
        },
      });

      const url = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;

      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-amz-acl': 'private',
        },
        body: payload,
      });

      if (!resp.ok) {
        this.lastError = `S3 direct: ${resp.status}`;
        console.error('[AWSBackup] S3 direct upload failed:', resp.status);
        return false;
      }

      console.log('[AWSBackup] S3 direct upload success:', key);
      return true;
    } catch (err) {
      this.lastError = (err as Error)?.message ?? 'S3 error';
      console.error('[AWSBackup] S3 direct error:', this.lastError);
      return false;
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(AWS_QUEUE_KEY, JSON.stringify(this.queue.slice(-AWS_MAX_QUEUE)));
    } catch {}
  }

  getHealth(): {
    status: BackupStatus;
    queueSize: number;
    totalSynced: number;
    totalFailed: number;
    totalStoredLocally: number;
    retryCount: number;
    lastError: string | null;
    isConfigured: boolean;
    endpoint: string;
    supabaseFailoverActive: boolean;
    supabaseFailoverCount: number;
  } {
    return {
      status: this.status,
      queueSize: this.queue.length,
      totalSynced: this.totalSynced,
      totalFailed: this.totalFailed,
      totalStoredLocally: this.totalStoredLocally,
      retryCount: this.retryCount,
      lastError: this.lastError,
      isConfigured: this.isConfigured(),
      endpoint: this.apiEndpoint ? this.apiEndpoint.substring(0, 50) : 'LOCAL_ONLY',
      supabaseFailoverActive: this.supabaseFailoverActive,
      supabaseFailoverCount: this.supabaseFailoverCount,
    };
  }

  async forceSyncNow(): Promise<void> {
    console.log('[AWSBackup] Force sync requested');
    await this.flush();
  }

  async getLocalEvents(period?: string): Promise<AWSAnalyticsEvent[]> {
    if (this.localEventStore.length > 0) {
      if (!period) return [...this.localEventStore];
      const cutoff = this.getPeriodCutoff(period);
      return this.localEventStore.filter(e => new Date(e.created_at).getTime() >= cutoff.getTime());
    }
    try {
      const stored = await AsyncStorage.getItem(AWS_EVENTS_STORE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          if (!period) return parsed;
          const cutoff = this.getPeriodCutoff(period);
          return parsed.filter((e: AWSAnalyticsEvent) => new Date(e.created_at).getTime() >= cutoff.getTime());
        }
      }
    } catch {}
    return [];
  }

  getLocalEventCount(): number {
    return this.localEventStore.length;
  }

  isFailoverActive(): boolean {
    return this.supabaseFailoverActive;
  }

  private getPeriodCutoff(period: string): Date {
    const now = new Date();
    switch (period) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default: return new Date(0);
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }
}

export const awsAnalyticsBackup = new AWSAnalyticsBackup();
export default awsAnalyticsBackup;
