import type { CTEvent, CTEventType, CTModuleId, CTFlowStep } from './types';

let eventIdCounter = 0;

function generateEventId(): string {
  eventIdCounter++;
  return `ct_${Date.now()}_${eventIdCounter}`;
}

const MAX_EVENT_BUFFER = 500;
const EVENT_RETENTION_MS = 3600_000;

type CTEventListener = (event: CTEvent) => void;

class ControlTowerEventEmitter {
  private listeners = new Set<CTEventListener>();
  private eventBuffer: CTEvent[] = [];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.pruneStaleEvents(), 60_000);
  }

  emit(
    type: CTEventType,
    module: CTModuleId,
    sessionId: string,
    options?: {
      step?: CTFlowStep;
      userId?: string;
      metadata?: Record<string, string | number | boolean>;
    },
  ): CTEvent {
    const event: CTEvent = {
      id: generateEventId(),
      type,
      module,
      step: options?.step,
      sessionId,
      userId: options?.userId,
      timestamp: new Date().toISOString(),
      metadata: options?.metadata,
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > MAX_EVENT_BUFFER) {
      this.eventBuffer = this.eventBuffer.slice(-MAX_EVENT_BUFFER);
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.log('[ControlTower] Listener error:', (err as Error)?.message);
      }
    }

    console.log(`[ControlTower] Event: ${type} | ${module}${options?.step ? ` | ${options.step}` : ''} | session=${sessionId.slice(0, 8)}`);
    return event;
  }

  subscribe(listener: CTEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRecentEvents(since?: string): CTEvent[] {
    if (!since) return [...this.eventBuffer];
    const sinceTs = new Date(since).getTime();
    return this.eventBuffer.filter((e) => new Date(e.timestamp).getTime() >= sinceTs);
  }

  getEventsByModule(module: CTModuleId): CTEvent[] {
    return this.eventBuffer.filter((e) => e.module === module);
  }

  getEventsBySession(sessionId: string): CTEvent[] {
    return this.eventBuffer.filter((e) => e.sessionId === sessionId);
  }

  getActiveSessionsByModule(): Map<CTModuleId, Set<string>> {
    const now = Date.now();
    const activeThreshold = 300_000;
    const map = new Map<CTModuleId, Set<string>>();

    for (const event of this.eventBuffer) {
      const age = now - new Date(event.timestamp).getTime();
      if (age > activeThreshold) continue;
      if (event.type === 'exit_module') continue;

      if (!map.has(event.module)) {
        map.set(event.module, new Set());
      }
      map.get(event.module)!.add(event.sessionId);
    }

    return map;
  }

  private pruneStaleEvents(): void {
    const cutoff = Date.now() - EVENT_RETENTION_MS;
    const before = this.eventBuffer.length;
    this.eventBuffer = this.eventBuffer.filter(
      (e) => new Date(e.timestamp).getTime() > cutoff,
    );
    const removed = before - this.eventBuffer.length;
    if (removed > 0) {
      console.log(`[ControlTower] Pruned ${removed} stale events`);
    }
  }

  getBufferSize(): number {
    return this.eventBuffer.length;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.listeners.clear();
    this.eventBuffer = [];
  }
}

export const controlTowerEmitter = new ControlTowerEventEmitter();
