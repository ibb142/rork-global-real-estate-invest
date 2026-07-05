/**
 * IVX runtime diagnostics store.
 *
 * A tiny, dependency-free singleton that the one-tap Diagnostics screen reads to
 * surface real runtime signals during stream tests:
 * - scroll events (FlatList onScroll)
 * - auto-scroll triggers (jump-to-latest / new-message follow)
 * - render warnings (React "Cannot update a component…", react-native-web
 *   "Unexpected text node", list-key warnings, "Maximum update depth")
 *
 * FPS / JS FPS / memory are measured live inside the screen itself (they need a
 * mounted rAF loop), so they are NOT stored here.
 *
 * Emit is deferred to a microtask — render-warning interception runs while React
 * is rendering, so calling subscriber setState synchronously would reproduce the
 * exact "Cannot update a component while rendering a different component" warning
 * this screen exists to catch. Deferring moves every subscriber update out of the
 * render phase (same pattern as ivxAIWatchdog).
 */

export interface DiagnosticsEvent {
  at: string;
  kind: 'scroll' | 'auto-scroll' | 'render-warning' | 'content-height';
  detail: string;
}

export interface DiagnosticsSnapshot {
  scrollEvents: number;
  autoScrollTriggers: number;
  renderWarnings: number;
  /** Auto-scroll triggers broken down by reason. */
  autoScrollByReason: Record<string, number>;
  /** Render warnings broken down by detected category. */
  renderWarningsByType: Record<string, number>;
  /** Most recent events (newest first), bounded. */
  recentEvents: DiagnosticsEvent[];
  startedAt: string;
}

type Listener = (snapshot: DiagnosticsSnapshot) => void;

const MAX_RECENT_EVENTS = 60;

/** Known render-warning signatures we attribute to a readable category. */
const RENDER_WARNING_MATCHERS: { type: string; test: RegExp }[] = [
  { type: 'setState-during-render', test: /cannot update a component .* while rendering a different component/i },
  { type: 'unexpected-text-node', test: /unexpected text node/i },
  { type: 'list-key', test: /each child in a list should have a unique "?key"?/i },
  { type: 'max-update-depth', test: /maximum update depth exceeded/i },
  { type: 'virtualized-list', test: /virtualizedlist/i },
];

function classifyRenderWarning(message: string): string | null {
  for (const matcher of RENDER_WARNING_MATCHERS) {
    if (matcher.test.test(message)) {
      return matcher.type;
    }
  }
  return null;
}

class DiagnosticsStore {
  private scrollEvents = 0;
  private autoScrollTriggers = 0;
  private renderWarnings = 0;
  private autoScrollByReason: Record<string, number> = {};
  private renderWarningsByType: Record<string, number> = {};
  private recentEvents: DiagnosticsEvent[] = [];
  private readonly startedAt = new Date().toISOString();
  private listeners = new Set<Listener>();
  private flushScheduled = false;
  private consolePatched = false;

  private buildSnapshot(): DiagnosticsSnapshot {
    return {
      scrollEvents: this.scrollEvents,
      autoScrollTriggers: this.autoScrollTriggers,
      renderWarnings: this.renderWarnings,
      autoScrollByReason: { ...this.autoScrollByReason },
      renderWarningsByType: { ...this.renderWarningsByType },
      recentEvents: this.recentEvents.slice(0, MAX_RECENT_EVENTS),
      startedAt: this.startedAt,
    };
  }

  private pushEvent(event: DiagnosticsEvent): void {
    this.recentEvents = [event, ...this.recentEvents].slice(0, MAX_RECENT_EVENTS);
  }

  getSnapshot(): DiagnosticsSnapshot {
    return this.buildSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.buildSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  recordScroll(detail: string = 'message-list'): void {
    this.scrollEvents += 1;
    this.pushEvent({ at: new Date().toISOString(), kind: 'scroll', detail });
    this.emit();
  }

  recordAutoScroll(reason: string): void {
    this.autoScrollTriggers += 1;
    this.autoScrollByReason[reason] = (this.autoScrollByReason[reason] ?? 0) + 1;
    this.pushEvent({ at: new Date().toISOString(), kind: 'auto-scroll', detail: reason });
    this.emit();
  }

  recordContentHeight(detail: string): void {
    this.pushEvent({ at: new Date().toISOString(), kind: 'content-height', detail });
    this.emit();
  }

  private recordRenderWarning(type: string, message: string): void {
    this.renderWarnings += 1;
    this.renderWarningsByType[type] = (this.renderWarningsByType[type] ?? 0) + 1;
    this.pushEvent({ at: new Date().toISOString(), kind: 'render-warning', detail: `${type}: ${message.slice(0, 160)}` });
    this.emit();
  }

  reset(): void {
    this.scrollEvents = 0;
    this.autoScrollTriggers = 0;
    this.renderWarnings = 0;
    this.autoScrollByReason = {};
    this.renderWarningsByType = {};
    this.recentEvents = [];
    this.emit();
  }

  /**
   * Patch console.error / console.warn ONCE to detect render warnings. The
   * original methods are always called, so nothing is swallowed — we only count
   * and categorize known render-warning signatures.
   */
  installConsoleInterceptor(): void {
    if (this.consolePatched) return;
    this.consolePatched = true;
    const wrap = (original: (...args: unknown[]) => void) => {
      return (...args: unknown[]): void => {
        try {
          const message = args
            .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
            .join(' ');
          const type = classifyRenderWarning(message);
          if (type) {
            this.recordRenderWarning(type, message);
          }
        } catch {
          // Never let diagnostics interfere with the original log.
        }
        original(...args);
      };
    };
    try {
      console.error = wrap(console.error.bind(console)) as typeof console.error;
      console.warn = wrap(console.warn.bind(console)) as typeof console.warn;
    } catch {
      // Some environments freeze console; counting is best-effort.
    }
  }

  private emit(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    const flush = (): void => {
      this.flushScheduled = false;
      const snapshot = this.buildSnapshot();
      for (const listener of this.listeners) {
        try {
          listener(snapshot);
        } catch {
          // Ignore listener errors.
        }
      }
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(flush);
    } else {
      setTimeout(flush, 0);
    }
  }
}

const store = new DiagnosticsStore();

export const ivxDiagnostics = {
  getSnapshot(): DiagnosticsSnapshot {
    return store.getSnapshot();
  },
  subscribe(listener: Listener): () => void {
    return store.subscribe(listener);
  },
  recordScroll(detail?: string): void {
    store.recordScroll(detail);
  },
  recordAutoScroll(reason: string): void {
    store.recordAutoScroll(reason);
  },
  recordContentHeight(detail: string): void {
    store.recordContentHeight(detail);
  },
  reset(): void {
    store.reset();
  },
  installConsoleInterceptor(): void {
    store.installConsoleInterceptor();
  },
};

export type IvxDiagnostics = typeof ivxDiagnostics;
