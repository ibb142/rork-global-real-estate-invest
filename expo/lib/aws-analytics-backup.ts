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
const AWS_BACKUP_DEBUG = process.env.EXPO_PUBLIC_ANALYTICS_DEBUG === 'true';
const RORK_APP_KEY = (process.env.EXPO_PUBLIC_RORK_APP_KEY || '').trim();
const PROJECT_ID = (process.env.EXPO_PUBLIC_PROJECT_ID || '').trim();
const TEAM_ID = (process.env.EXPO_PUBLIC_TEAM_ID || '').trim();

function backupLog(...args: unknown[]): void {
  if (__DEV__ && AWS_BACKUP_DEBUG) {
    console.log(...args);
  }
}

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
type SendBatchResult = 'success' | 'retry' | 'disabled';

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
    const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (apiBase) {
      return `${apiBase}/analytics/aws-backup`;
    }
    if (S3_BUCKET && AWS_REGION) {
      backupLog('[AWSBackup] S3 bucket detected but direct unsigned uploads are disabled; backend proxy is required');
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
          backupLog('[AWSBackup] Loaded', parsed.length, 'queued events from storage');
        }
      }
    } catch (err) {
      backupLog('[AWSBackup] Load queue error:', (err as Error)?.message);
    }

    try {
      const storedEvents = await AsyncStorage.getItem(AWS_EVENTS_STORE_KEY);
      if (storedEvents) {
        const parsed = JSON.parse(storedEvents);
        if (Array.isArray(parsed)) {
          this.localEventStore = parsed;
          this.totalStoredLocally = parsed.length;
          backupLog('[AWSBackup] Loaded', parsed.length, 'local backup events');
        }
      }
    } catch (err) {
      backupLog('[AWSBackup] Load local events error:', (err as Error)?.message);
    }

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, AWS_FLUSH_INTERVAL);

    const hasConfig = !!this.apiEndpoint;
    this.status = hasConfig ? 'idle' : 'disabled';
    backupLog('[AWSBackup] Initialized | endpoint:', this.apiEndpoint ? this.apiEndpoint.substring(0, 50) : 'LOCAL_ONLY', '| status:', this.status, '| local events:', this.localEventStore.length);
  }

  isConfigured(): boolean {
    return !!this.apiEndpoint;
  }

  enqueue(event: AWSAnalyticsEvent): void {
    if (!this.initialized) {
      void this.init();
    }

    this.storeLocally(event);

    if (!this.apiEndpoint || this.status === 'disabled') {
      return;
    }

    this.queue.push(event);

    if (this.queue.length > AWS_MAX_QUEUE) {
      const dropped = this.queue.length - AWS_MAX_QUEUE;
      this.queue = this.queue.slice(-AWS_MAX_QUEUE);
      this.totalFailed += dropped;
      backupLog('[AWSBackup] Queue overflow - rotated', dropped, 'oldest events');
    }

    void this.saveQueue();

    if (this.queue.length >= AWS_BATCH_SIZE) {
      void this.flush();
    }
  }

  enqueueSupabaseFailover(events: AWSAnalyticsEvent[]): void {
    if (!this.initialized) {
      void this.init();
    }

    this.supabaseFailoverActive = true;
    this.supabaseFailoverCount += events.length;
    backupLog('[AWSBackup] Supabase failover — receiving', events.length, 'events (total failover:', this.supabaseFailoverCount, ')');
    for (const event of events) {
      this.storeLocally(event);
      if (this.apiEndpoint && this.status !== 'disabled') {
        this.queue.push(event);
      }
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
    if (this.queue.length === 0 || this.status === 'syncing' || this.status === 'disabled') return;
    if (!this.apiEndpoint) {
      this.status = 'disabled';
      this.queue = [];
      void this.saveQueue();
      return;
    }

    this.status = 'syncing';
    const batch = this.queue.splice(0, AWS_BATCH_SIZE);

    try {
      const result = await this.sendBatch(batch);

      if (result === 'success') {
        this.totalSynced += batch.length;
        this.retryCount = 0;
        this.lastError = null;
        this.status = 'idle';
        backupLog(`[AWSBackup] Synced ${batch.length} events (total: ${this.totalSynced}, remaining: ${this.queue.length})`);
      } else if (result === 'disabled') {
        this.retryCount = 0;
        this.status = 'disabled';
      } else {
        this.queue.unshift(...batch);
        this.retryCount++;
        this.status = 'error';

        if (this.retryCount >= AWS_MAX_RETRIES) {
          this.totalFailed += batch.length;
          this.queue.splice(0, batch.length);
          this.retryCount = 0;
          this.disableRemoteSync('max_retries');
        } else {
          const backoff = AWS_RETRY_BACKOFF_BASE * Math.pow(2, this.retryCount - 1);
          setTimeout(() => void this.flush(), backoff);
        }
      }
    } catch (err) {
      this.queue.unshift(...batch);
      this.lastError = (err as Error)?.message ?? 'Unknown error';
      this.status = 'error';
      backupLog('[AWSBackup] Flush exception — events kept locally');
    }

    await this.saveQueue();
  }

  private async sendBatch(batch: AWSAnalyticsEvent[]): Promise<SendBatchResult> {
    if (!this.apiEndpoint) {
      return 'disabled';
    }

    if (this.useDirectApi) {
      this.disableRemoteSync('direct_api_requires_signing');
      return 'disabled';
    }

    return this.sendToBackendProxy(batch);
  }

  private async sendToBackendProxy(batch: AWSAnalyticsEvent[]): Promise<SendBatchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (RORK_APP_KEY) {
        headers['x-rork-app-key'] = RORK_APP_KEY;
      }
      if (PROJECT_ID) {
        headers['x-rork-project-id'] = PROJECT_ID;
      }
      if (TEAM_ID) {
        headers['x-rork-team-id'] = TEAM_ID;
      }

      const resp = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          events: batch,
          source: 'aws_backup',
          timestamp: new Date().toISOString(),
          platform: Platform.OS,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        this.lastError = `Backend proxy: ${resp.status} ${body.substring(0, 200)}`;

        if ((resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) || resp.status === 502 || resp.status === 503 || resp.status === 504) {
          this.disableRemoteSync(`backend_${resp.status}`);
          return 'disabled';
        }

        backupLog('[AWSBackup] Backend proxy failed:', resp.status);
        return 'retry';
      }

      return 'success';
    } catch (err) {
      this.lastError = (err as Error)?.message ?? 'Network error';
      if (this.retryCount === 0) {
        backupLog('[AWSBackup] Backend proxy unreachable — events stored locally');
      }
      return 'retry';
    } finally {
      clearTimeout(timeout);
    }
  }

  private disableRemoteSync(reason?: string): void {
    this.apiEndpoint = '';
    this.useDirectApi = false;
    this.retryCount = 0;
    this.status = 'disabled';
    this.queue = [];
    void this.saveQueue();
    if (reason) {
      this.lastError = reason;
    }
    backupLog('[AWSBackup] Remote sync disabled — all events stored locally only');
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
        backupLog('[AWSBackup] S3 direct upload failed:', resp.status);
        return false;
      }

      backupLog('[AWSBackup] S3 direct upload success:', key);
      return true;
    } catch (err) {
      this.lastError = (err as Error)?.message ?? 'S3 error';
      backupLog('[AWSBackup] S3 direct error:', this.lastError);
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
    backupLog('[AWSBackup] Force sync requested');
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
