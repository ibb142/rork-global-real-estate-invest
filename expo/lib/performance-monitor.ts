import { Platform } from 'react-native';

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  metadata?: Record<string, string | number>;
}

export interface PerformanceSnapshot {
  metrics: PerformanceMetric[];
  apiLatencies: Record<string, number[]>;
  screenLoadTimes: Record<string, number>;
  memoryWarnings: number;
  timestamp: string;
  platform: string;
}

const MAX_METRICS = 200;
const MAX_LATENCY_SAMPLES = 50;

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private apiLatencies: Record<string, number[]> = {};
  private screenLoadTimes: Record<string, number> = {};
  private memoryWarnings = 0;
  private activeTimers = new Map<string, number>();

  startTimer(name: string): void {
    this.activeTimers.set(name, Date.now());
  }

  endTimer(name: string, metadata?: Record<string, string | number>): number {
    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      console.log('[PerfMon] Timer not found:', name);
      return 0;
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    this.activeTimers.delete(name);

    const metric: PerformanceMetric = {
      name,
      startTime,
      endTime,
      durationMs,
      metadata,
    };

    this.metrics.push(metric);
    if (this.metrics.length > MAX_METRICS) {
      this.metrics = this.metrics.slice(-MAX_METRICS);
    }

    console.log(`[PerfMon] ${name}: ${durationMs}ms`, metadata ? JSON.stringify(metadata) : '');
    return durationMs;
  }

  recordApiLatency(endpoint: string, latencyMs: number): void {
    if (!this.apiLatencies[endpoint]) {
      this.apiLatencies[endpoint] = [];
    }
    this.apiLatencies[endpoint].push(latencyMs);
    if (this.apiLatencies[endpoint].length > MAX_LATENCY_SAMPLES) {
      this.apiLatencies[endpoint] = this.apiLatencies[endpoint].slice(-MAX_LATENCY_SAMPLES);
    }
  }

  recordScreenLoad(screenName: string, loadTimeMs: number): void {
    this.screenLoadTimes[screenName] = loadTimeMs;
    console.log(`[PerfMon] Screen ${screenName} loaded in ${loadTimeMs}ms`);
  }

  recordMemoryWarning(): void {
    this.memoryWarnings++;
    console.log('[PerfMon] Memory warning #' + this.memoryWarnings);
  }

  getApiLatencyStats(endpoint: string): {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
    min: number;
    max: number;
  } | null {
    const samples = this.apiLatencies[endpoint];
    if (!samples || samples.length === 0) return null;

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      p50: sorted[Math.floor(count * 0.5)] ?? 0,
      p95: sorted[Math.floor(count * 0.95)] ?? 0,
      p99: sorted[Math.floor(count * 0.99)] ?? 0,
      avg: Math.round(sum / count),
      count,
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
    };
  }

  getAllApiStats(): Record<string, ReturnType<typeof this.getApiLatencyStats>> {
    const stats: Record<string, ReturnType<typeof this.getApiLatencyStats>> = {};
    for (const endpoint of Object.keys(this.apiLatencies)) {
      stats[endpoint] = this.getApiLatencyStats(endpoint);
    }
    return stats;
  }

  getSnapshot(): PerformanceSnapshot {
    return {
      metrics: [...this.metrics],
      apiLatencies: { ...this.apiLatencies },
      screenLoadTimes: { ...this.screenLoadTimes },
      memoryWarnings: this.memoryWarnings,
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
    };
  }

  getSummary(): {
    totalMetrics: number;
    trackedEndpoints: number;
    trackedScreens: number;
    memoryWarnings: number;
    slowestApi: { endpoint: string; avgMs: number } | null;
    slowestScreen: { screen: string; loadMs: number } | null;
  } {
    let slowestApi: { endpoint: string; avgMs: number } | null = null;
    for (const [endpoint, samples] of Object.entries(this.apiLatencies)) {
      if (samples.length === 0) continue;
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      if (!slowestApi || avg > slowestApi.avgMs) {
        slowestApi = { endpoint, avgMs: avg };
      }
    }

    let slowestScreen: { screen: string; loadMs: number } | null = null;
    for (const [screen, loadMs] of Object.entries(this.screenLoadTimes)) {
      if (!slowestScreen || loadMs > slowestScreen.loadMs) {
        slowestScreen = { screen, loadMs };
      }
    }

    return {
      totalMetrics: this.metrics.length,
      trackedEndpoints: Object.keys(this.apiLatencies).length,
      trackedScreens: Object.keys(this.screenLoadTimes).length,
      memoryWarnings: this.memoryWarnings,
      slowestApi,
      slowestScreen,
    };
  }

  reset(): void {
    this.metrics = [];
    this.apiLatencies = {};
    this.screenLoadTimes = {};
    this.memoryWarnings = 0;
    this.activeTimers.clear();
    console.log('[PerfMon] Reset all metrics');
  }
}

export const performanceMonitor = new PerformanceMonitor();

export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, string | number>,
): Promise<T> {
  performanceMonitor.startTimer(name);
  try {
    const result = await fn();
    performanceMonitor.endTimer(name, metadata);
    return result;
  } catch (err) {
    performanceMonitor.endTimer(name, { ...metadata, error: (err as Error)?.message ?? 'unknown' });
    throw err;
  }
}
