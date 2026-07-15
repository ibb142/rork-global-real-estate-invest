/**
 * IVX Owner AI Watchdog.
 *
 * Produces a structured, per-message diagnostic report covering 14 checkpoints
 * from the user tapping Send to the assistant bubble being rendered.
 *
 * Goals:
 * - Eliminate silent failures: if any checkpoint fails or the trace times out
 *   after 10s without reaching SUCCESS, a BLOCKED report is emitted.
 * - Make failures observable from inside the app: subscribers (the chat UI)
 *   re-render a red banner showing failedCheckpoint / lastSuccessfulCheckpoint
 *   / fileLine / nextFix.
 * - Persist the last 20 reports to AsyncStorage so they survive reloads and
 *   can be screenshot from the in-app debug drawer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  analyzeBackendPostFailures,
  type AnalyzableWatchdogReport,
  type BackendPostFailureAnalysis,
} from './ivxBackendPostFailureAnalyzer';

export type CheckpointName =
  | 'SEND_TAP'
  | 'USER_ROW_INSERTED'
  | 'AI_TRIGGER_DECISION'
  | 'AI_MUTATION_STARTED'
  | 'BACKEND_POST_STARTED'
  | 'BACKEND_POST_FINISHED'
  | 'ASSISTANT_TEXT_PRESENT'
  | 'ASSISTANT_TRANSIENT_CREATED'
  | 'MESSAGE_ARRAY_MERGED'
  | 'FILTER_VISIBLE_PASSED'
  | 'DEDUP_PASSED'
  | 'SEARCH_PIN_FILTER_PASSED'
  | 'RENDER_MESSAGE_CALLED'
  | 'ASSISTANT_BUBBLE_VISIBLE';

export const CHECKPOINT_ORDER: CheckpointName[] = [
  'SEND_TAP',
  'USER_ROW_INSERTED',
  'AI_TRIGGER_DECISION',
  'AI_MUTATION_STARTED',
  'BACKEND_POST_STARTED',
  'BACKEND_POST_FINISHED',
  'ASSISTANT_TEXT_PRESENT',
  'ASSISTANT_TRANSIENT_CREATED',
  'MESSAGE_ARRAY_MERGED',
  'FILTER_VISIBLE_PASSED',
  'DEDUP_PASSED',
  'SEARCH_PIN_FILTER_PASSED',
  'RENDER_MESSAGE_CALLED',
  'ASSISTANT_BUBBLE_VISIBLE',
];

/** Each checkpoint owns a file:line so failures map straight to source. */
export const CHECKPOINT_OWNER: Record<CheckpointName, string> = {
  SEND_TAP: 'expo/app/ivx/chat.tsx:handleSend',
  USER_ROW_INSERTED: 'expo/app/ivx/chat.tsx:handleSend (setPendingOwnerMessages)',
  AI_TRIGGER_DECISION: 'expo/app/ivx/chat.tsx:sendMessageMutation (auto-trigger branch)',
  AI_MUTATION_STARTED: 'expo/app/ivx/chat.tsx:assistantReplyMutation.mutationFn',
  BACKEND_POST_STARTED: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts:requestOwnerAI',
  BACKEND_POST_FINISHED: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts:requestOwnerAI',
  ASSISTANT_TEXT_PRESENT: 'expo/app/ivx/chat.tsx:assistantReplyMutation (normalizedAnswer guard)',
  ASSISTANT_TRANSIENT_CREATED: 'expo/app/ivx/chat.tsx:assistantReplyMutation (setTransientAssistantMessages)',
  MESSAGE_ARRAY_MERGED: 'expo/app/ivx/chat.tsx:allMessages useMemo',
  FILTER_VISIBLE_PASSED: 'expo/app/ivx/chat.tsx:isInternalTranscriptMessage',
  DEDUP_PASSED: 'expo/app/ivx/chat.tsx:allMessages (transient/persistent dedup)',
  SEARCH_PIN_FILTER_PASSED: 'expo/app/ivx/chat.tsx:displayedMessages',
  RENDER_MESSAGE_CALLED: 'expo/app/ivx/chat.tsx:renderMessage',
  ASSISTANT_BUBBLE_VISIBLE: 'expo/app/ivx/chat.tsx:FlatList onViewableItemsChanged',
};

export const CHECKPOINT_FIX_HINT: Record<CheckpointName, string> = {
  SEND_TAP: 'Send handler never fired. Check composer guards and isPending flags.',
  USER_ROW_INSERTED: 'pendingOwnerMessages was not updated. Verify normalizeComposerText and setPendingOwnerMessages.',
  AI_TRIGGER_DECISION: 'send_and_ai branch did not run. Check command prefix, localFirstChatMode, elevated confirmation early-return.',
  AI_MUTATION_STARTED: 'assistantReplyMutation.mutate() not invoked. Check sendMessageMutation success path / swallowed rejection.',
  BACKEND_POST_STARTED: 'No HTTP request issued. Verify base URL resolver and auth token retrieval.',
  BACKEND_POST_FINISHED: 'Backend never responded or threw before parsing. Check network, status code, reliability wrapper timeout.',
  ASSISTANT_TEXT_PRESENT: 'Backend returned empty answer. Check provider output and assertCleanOwnerAIResponseText.',
  ASSISTANT_TRANSIENT_CREATED: 'setTransientAssistantMessages never ran. Check exceptions between BACKEND_POST_FINISHED and the setter.',
  MESSAGE_ARRAY_MERGED: 'allMessages useMemo did not include the assistant message. Check dedup map and dependency array.',
  FILTER_VISIBLE_PASSED: 'isInternalTranscriptMessage hid the assistant message. Verify senderRole is "assistant", not "system".',
  DEDUP_PASSED: 'Dedup logic dropped both transient and persistent rows. Inspect bodies / ids.',
  SEARCH_PIN_FILTER_PASSED: 'Active search or pin-only mode is filtering this message. Clear search or exit pin view.',
  RENDER_MESSAGE_CALLED: 'FlatList never asked renderMessage for this id. Check displayedMessages and key extractor.',
  ASSISTANT_BUBBLE_VISIBLE: 'Bubble rendered but never became viewable. Try scrolling or check container height.',
};

export type CheckpointStatus = 'pending' | 'pass' | 'fail';

export interface CheckpointSnapshot {
  name: CheckpointName;
  status: CheckpointStatus;
  expected: string;
  actual: string | null;
  fileLine: string;
  at: string | null;
  data: Record<string, unknown>;
}

export type FinalStatus = 'PENDING' | 'SUCCESS' | 'DEGRADED' | 'VISIBLE_ERROR' | 'SILENT_FAILURE' | 'BLOCKED';

export interface WatchdogReport {
  traceId: string;
  conversationId: string | null;
  userMessageId: string;
  userText: string;
  startedAt: string;
  endedAt: string | null;
  finalStatus: FinalStatus;
  lastSuccessfulCheckpoint: CheckpointName | null;
  failedCheckpoint: CheckpointName | null;
  failureReason: string | null;
  fileLine: string | null;
  fixHint: string | null;
  /** HTTP status code of the failing backend call, when known. */
  statusCode: number | null;
  /** Raw backend response body/preview captured at the point of failure. */
  backendResponse: string | null;
  /**
   * Recovery metadata for a DEGRADED (recovered-via-fallback) finalization.
   * Populated from the BACKEND_POST_FINISHED checkpoint data so a yellow
   * DEGRADED_RECOVERY banner shows the REAL degraded route + status +
   * classification instead of blank "—" fields. Null on non-degraded reports.
   */
  recovery: WatchdogRecoveryInfo | null;
  checkpoints: CheckpointSnapshot[];
  assistantTransientIds: string[];
}

/** Structured recovery context surfaced on a DEGRADED report. */
export interface WatchdogRecoveryInfo {
  recoveredViaFallback: boolean;
  /** The privileged route that degraded (e.g. /api/ivx/owner-ai). */
  degradedRoute: string | null;
  /** The route the answer was actually recovered through. */
  recoveredRoute: string | null;
  /** HTTP status of the degraded privileged route, when known. */
  statusCode: number | null;
  /** Failure classification of the degraded route (auth/network/etc.). */
  classification: string | null;
  /** Human-readable reason the privileged route degraded. */
  reason: string | null;
}

const CHECKPOINT_EXPECTED: Record<CheckpointName, string> = {
  SEND_TAP: 'send handler called',
  USER_ROW_INSERTED: 'user message persisted or local row added',
  AI_TRIGGER_DECISION: 'Owner AI branch selected',
  AI_MUTATION_STARTED: 'assistantReplyMutation.mutationFn starts',
  BACKEND_POST_STARTED: 'POST /api/ivx/owner-ai sent',
  BACKEND_POST_FINISHED: 'HTTP response received',
  ASSISTANT_TEXT_PRESENT: 'non-empty assistant text',
  ASSISTANT_TRANSIENT_CREATED: 'visible assistant transient created',
  MESSAGE_ARRAY_MERGED: 'assistant message exists in allMessages before filters',
  FILTER_VISIBLE_PASSED: 'assistant message not removed by system/internal filters',
  DEDUP_PASSED: 'assistant message not removed by dedup',
  SEARCH_PIN_FILTER_PASSED: 'assistant message not hidden by search/pin filters',
  RENDER_MESSAGE_CALLED: 'renderMessage called for assistant id',
  ASSISTANT_BUBBLE_VISIBLE: 'visible assistant bubble on screen',
};

const STORAGE_KEY = 'ivx.owner-ai.watchdog.reports.v1';
const MAX_REPORTS = 20;
/**
 * Watchdog ceiling. Audit-class prompts ("audit end to end…", senior-developer
 * reports, landing-page review, etc.) legitimately run many backend tool calls
 * and can take 60–90s server-side. A 10s ceiling produced false-positive
 * SILENT_FAILUREs while the real fetch was still in-flight. We now use 90s as
 * the default ceiling and let callers extend further for heavy audits.
 */
const DEFAULT_TIMEOUT_MS = 90_000;
const HEAVY_AUDIT_TIMEOUT_MS = 180_000;

const HEAVY_AUDIT_PATTERN = /\b(audit|end[-\s]?to[-\s]?end|senior\s+developer|full\s+report|landing\s+page|inspect.*(?:project|app|backend)|deep\s+(?:scan|inspection)|complete\s+(?:report|audit))\b/i;

function resolveAdaptiveTimeoutMs(userText: string): number {
  if (typeof userText === 'string' && HEAVY_AUDIT_PATTERN.test(userText)) {
    return HEAVY_AUDIT_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

export interface TapEvent {
  at: string;
  blocked: boolean;
  reason: string | null;
  details: Record<string, unknown>;
}

export interface WatchdogSnapshot {
  finalized: WatchdogReport[];
  active: WatchdogReport[];
  lastTap: TapEvent | null;
  tapCount: number;
  blockedTapCount: number;
}

type Listener = (snapshot: WatchdogSnapshot) => void;

class WatchdogStore {
  private reports: WatchdogReport[] = [];
  private listeners = new Set<Listener>();
  private active = new Map<string, ActiveTrace>();
  private byTransientId = new Map<string, string>();
  private hydrated = false;
  private lastTap: TapEvent | null = null;
  private tapCount = 0;
  private blockedTapCount = 0;
  /**
   * Coalesced, deferred-emit guard. Watchdog checkpoints (pass/fail/heartbeat)
   * are reported from render-path code (FlatList renderMessage, message-merge
   * memos). If emit() called subscriber setState synchronously, React threw
   * "Cannot update a component (IVXWatchdog…) while rendering a different
   * component." Emitting on a microtask moves every subscriber update OUT of
   * the render phase, so the warning is impossible while still updating the UI
   * on the very next tick.
   */
  private flushScheduled = false;

  private buildSnapshot(): WatchdogSnapshot {
    return {
      finalized: this.reports.slice(),
      active: Array.from(this.active.values()).map((t) => ({ ...t.report, checkpoints: t.report.checkpoints.map((cp) => ({ ...cp })) })),
      lastTap: this.lastTap,
      tapCount: this.tapCount,
      blockedTapCount: this.blockedTapCount,
    };
  }

  recordTap(at: string): void {
    this.tapCount += 1;
    this.lastTap = { at, blocked: false, reason: null, details: {} };
    this.emit();
  }

  recordTapBlocked(at: string, reason: string, details: Record<string, unknown>): void {
    this.tapCount += 1;
    this.blockedTapCount += 1;
    this.lastTap = { at, blocked: true, reason, details };
    this.emit();
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WatchdogReport[];
        if (Array.isArray(parsed)) {
          this.reports = parsed.slice(0, MAX_REPORTS);
          this.emit();
        }

      }
    } catch (err) {
      console.log('[IVXWatchdog] hydrate failed:', err instanceof Error ? err.message : 'unknown');
    }
  }

  getReports(): WatchdogReport[] {
    return this.reports;
  }

  getSnapshot(): WatchdogSnapshot {
    return this.buildSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.buildSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  register(trace: ActiveTrace): void {
    this.active.set(trace.report.traceId, trace);
  }

  bindTransient(traceId: string, transientId: string): void {
    this.byTransientId.set(transientId, traceId);
    const trace = this.active.get(traceId);
    if (trace) {
      trace.report.assistantTransientIds.push(transientId);
    }
  }

  getActive(traceId: string): ActiveTrace | undefined {
    return this.active.get(traceId);
  }

  getTraceForTransient(transientId: string): ActiveTrace | undefined {
    const traceId = this.byTransientId.get(transientId);
    if (!traceId) return undefined;
    return this.active.get(traceId);
  }

  finalize(trace: ActiveTrace): void {
    this.active.delete(trace.report.traceId);
    for (const id of trace.report.assistantTransientIds) {
      this.byTransientId.delete(id);
    }
    this.reports = [trace.report, ...this.reports].slice(0, MAX_REPORTS);
    this.emit();
    void this.persist();
  }

  getActiveCount(): number {
    return this.active.size;
  }

  async clear(): Promise<void> {
    this.reports = [];
    this.emit();
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.log('[IVXWatchdog] clear failed:', err instanceof Error ? err.message : 'unknown');
    }
  }

  notifyMutation(): void {
    this.emit();
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
        } catch (err) {
          console.log('[IVXWatchdog] listener error:', err instanceof Error ? err.message : 'unknown');
        }
      }
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(flush);
    } else {
      setTimeout(flush, 0);
    }
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports));
    } catch (err) {
      console.log('[IVXWatchdog] persist failed:', err instanceof Error ? err.message : 'unknown');
    }
  }
}

const store = new WatchdogStore();

class ActiveTrace {
  report: WatchdogReport;
  heartbeats: { at: string; stage: string }[] = [];
  private finished = false;
  private timeoutHandle: ReturnType<typeof setTimeout> | null;
  private readonly timeoutMs: number;

  constructor(input: { userMessageId: string; userText: string; conversationId: string | null; timeoutMs: number }) {
    this.timeoutMs = input.timeoutMs;
    const traceId = `ivx-watchdog-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.report = {
      traceId,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      userText: input.userText.slice(0, 200),
      startedAt: new Date().toISOString(),
      endedAt: null,
      finalStatus: 'PENDING',
      lastSuccessfulCheckpoint: null,
      failedCheckpoint: null,
      failureReason: null,
      fileLine: null,
      fixHint: null,
      statusCode: null,
      backendResponse: null,
      recovery: null,
      checkpoints: CHECKPOINT_ORDER.map((name) => ({
        name,
        status: 'pending' as CheckpointStatus,
        expected: CHECKPOINT_EXPECTED[name],
        actual: null,
        fileLine: CHECKPOINT_OWNER[name],
        at: null,
        data: {},
      })),
      assistantTransientIds: [],
    };
    this.timeoutHandle = setTimeout(() => this.timeout(), input.timeoutMs);
  }

  /**
   * Heartbeat: a backend SSE event arrived (start/stage/heartbeat). The trace
   * is still healthy, so reset the timeout window. This is what turns the real
   * SSE stream into a watchdog signal that BACKEND_POST_FINISHED is NOT silent.
   */
  heartbeat(stage: string): void {
    if (this.finished) return;
    this.heartbeats.push({ at: new Date().toISOString(), stage: typeof stage === 'string' ? stage.slice(0, 80) : 'heartbeat' });
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.timeoutHandle = setTimeout(() => this.timeout(), this.timeoutMs);
    store.notifyMutation();
  }

  pass(name: CheckpointName, actual: string | null, data: Record<string, unknown> = {}): void {
    if (this.finished) return;
    const cp = this.findCheckpoint(name);
    if (!cp) return;
    cp.status = 'pass';
    cp.actual = actual;
    cp.at = new Date().toISOString();
    cp.data = { ...cp.data, ...data };
    this.report.lastSuccessfulCheckpoint = name;
    store.notifyMutation();
  }

  fail(name: CheckpointName, reason: string, data: Record<string, unknown> = {}): void {
    if (this.finished) return;
    const cp = this.findCheckpoint(name);
    if (cp) {
      cp.status = 'fail';
      cp.actual = reason;
      cp.at = new Date().toISOString();
      cp.data = { ...cp.data, ...data };
    }
    this.report.failedCheckpoint = name;
    this.report.failureReason = reason;
    this.report.fileLine = CHECKPOINT_OWNER[name];
    this.report.fixHint = CHECKPOINT_FIX_HINT[name];
    const statusCode = data.statusCode;
    if (statusCode === null || typeof statusCode === 'number') {
      this.report.statusCode = statusCode;
    }
    const backendResponse = data.backendResponse;
    if (backendResponse === null || typeof backendResponse === 'string') {
      this.report.backendResponse = backendResponse;
    }
    this.finishWith('BLOCKED');
  }

  complete(status: 'SUCCESS' | 'DEGRADED' | 'VISIBLE_ERROR'): void {
    if (this.finished) return;
    this.finishWith(status);
  }

  private timeout(): void {
    if (this.finished) return;
    const lastPassed = this.report.lastSuccessfulCheckpoint;
    const nextIdx = lastPassed ? CHECKPOINT_ORDER.indexOf(lastPassed) + 1 : 0;
    const stalled = CHECKPOINT_ORDER[Math.min(nextIdx, CHECKPOINT_ORDER.length - 1)];
    this.report.failedCheckpoint = stalled;
    this.report.failureReason = `Timed out after ${this.timeoutMs}ms — no progress past ${lastPassed ?? 'start'}.`;
    this.report.fileLine = CHECKPOINT_OWNER[stalled];
    this.report.fixHint = CHECKPOINT_FIX_HINT[stalled];
    const cp = this.findCheckpoint(stalled);
    if (cp && cp.status === 'pending') {
      cp.status = 'fail';
      cp.actual = 'TIMEOUT';
      cp.at = new Date().toISOString();
    }
    this.finishWith('SILENT_FAILURE');
  }

  private finishWith(status: FinalStatus): void {
    this.finished = true;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.report.finalStatus = status;
    this.report.endedAt = new Date().toISOString();
    // SUCCESS and DEGRADED are both non-failure terminal states: the round trip
    // completed and the user received a real answer. DEGRADED means a privileged
    // route was bypassed (recovered via fallback) — surfaced as a yellow warning,
    // never a red failed checkpoint. Clear the failure fields for both.
    if (status === 'SUCCESS' || status === 'DEGRADED') {
      this.report.failedCheckpoint = null;
      this.report.failureReason = null;
      this.report.fileLine = null;
      this.report.fixHint = null;
    }
    // DEGRADED = recovered via fallback. Promote the recovery diagnostics from
    // the BACKEND_POST_FINISHED checkpoint data so the yellow banner shows the
    // REAL degraded route + status + classification instead of blank "—".
    if (status === 'DEGRADED') {
      const backendCp = this.findCheckpoint('BACKEND_POST_FINISHED');
      const data = backendCp?.data ?? {};
      const recoveredStatus = typeof data.statusCode === 'number' ? data.statusCode : null;
      // Defensive defaults: a DEGRADED finalization must NEVER leave the recovery
      // diagnostics fully null — that produced the blank/UNKNOWN "degraded" banner
      // the owner reported. When the BACKEND_POST_FINISHED checkpoint did not carry
      // a field, synthesize a truthful value: the privileged owner route is the
      // only route that degrades to /public/chat, the classification is derived
      // from the HTTP status, and the reason falls back to the recorded failure.
      const degradedRoute = typeof data.degradedRoute === 'string' && data.degradedRoute.length > 0
        ? data.degradedRoute
        : '/api/ivx/owner-ai';
      const classification = typeof data.classification === 'string' && data.classification.length > 0
        ? data.classification
        : (recoveredStatus === 401 || recoveredStatus === 403
          ? 'owner_route_auth'
          : 'owner_route_degraded');
      const reason = typeof data.degradedReason === 'string' && data.degradedReason.length > 0
        ? data.degradedReason
        : (this.report.failureReason
          ?? 'Privileged owner route degraded; the answer was recovered via the public fallback.');
      this.report.recovery = {
        recoveredViaFallback: data.recoveredViaFallback === true,
        degradedRoute,
        recoveredRoute: '/public/chat',
        statusCode: recoveredStatus,
        classification,
        reason,
      };
      // Surface the degraded route's HTTP status on the report too, so the
      // panel's statusCode line is real (not blank) for a recovery.
      if (this.report.statusCode === null && recoveredStatus !== null) {
        this.report.statusCode = recoveredStatus;
      }
    }
    store.finalize(this);
    console.log('[IVXWatchdog] report_finalized', {
      traceId: this.report.traceId,
      finalStatus: this.report.finalStatus,
      failedCheckpoint: this.report.failedCheckpoint,
      lastSuccessfulCheckpoint: this.report.lastSuccessfulCheckpoint,
      fileLine: this.report.fileLine,
    });
  }

  private findCheckpoint(name: CheckpointName): CheckpointSnapshot | undefined {
    return this.report.checkpoints.find((cp) => cp.name === name);
  }
}

export interface WatchdogTraceHandle {
  readonly traceId: string;
  pass: (name: CheckpointName, actual?: string | null, data?: Record<string, unknown>) => void;
  fail: (name: CheckpointName, reason: string, data?: Record<string, unknown>) => void;
  heartbeat: (stage: string) => void;
  bindTransient: (transientId: string) => void;
  complete: (status: 'SUCCESS' | 'DEGRADED' | 'VISIBLE_ERROR') => void;
  getReport: () => WatchdogReport;
}

function toHandle(active: ActiveTrace): WatchdogTraceHandle {
  return {
    traceId: active.report.traceId,
    pass: (name, actual = null, data) => active.pass(name, actual, data ?? {}),
    fail: (name, reason, data) => active.fail(name, reason, data ?? {}),
    heartbeat: (stage: string) => active.heartbeat(stage),
    bindTransient: (transientId: string) => store.bindTransient(active.report.traceId, transientId),
    complete: (status) => active.complete(status),
    getReport: () => active.report,
  };
}

export const ivxAIWatchdog = {
  recordTap(input: { tapAt: string }): void {
    store.recordTap(input.tapAt);
  },
  recordTapBlocked(reason: string, details: Record<string, unknown>): void {
    store.recordTapBlocked(new Date().toISOString(), reason, details);
  },
  createTrace(input: { userMessageId: string; userText: string; conversationId: string | null; timeoutMs?: number }): WatchdogTraceHandle {
    const resolvedTimeout = typeof input.timeoutMs === 'number' && input.timeoutMs > 0
      ? input.timeoutMs
      : resolveAdaptiveTimeoutMs(input.userText);
    const trace = new ActiveTrace({
      userMessageId: input.userMessageId,
      userText: input.userText,
      conversationId: input.conversationId,
      timeoutMs: resolvedTimeout,
    });
    store.register(trace);
    store.notifyMutation();
    return toHandle(trace);
  },
  getTraceForTransient(transientId: string): WatchdogTraceHandle | null {
    const active = store.getTraceForTransient(transientId);
    return active ? toHandle(active) : null;
  },
  getTrace(traceId: string): WatchdogTraceHandle | null {
    const active = store.getActive(traceId);
    return active ? toHandle(active) : null;
  },
  getReports(): WatchdogReport[] {
    return store.getReports();
  },
  getSnapshot(): WatchdogSnapshot {
    return store.getSnapshot();
  },
  subscribe(listener: Listener): () => void {
    return store.subscribe(listener);
  },
  hydrate(): Promise<void> {
    return store.hydrate();
  },
  clear(): Promise<void> {
    return store.clear();
  },
  /**
   * Root-cause investigation: trace every BACKEND_POST_FINISHED failure across
   * the persisted reports (last 20, survives reloads), group by cause, and rank
   * the top causes by frequency with evidence (counts, traceIds, requestIds,
   * status codes, timestamps). This is the durable, cross-session grouping the
   * owner asked for — no silent failures slip through unclassified.
   */
  analyzeBackendPostFailures(): BackendPostFailureAnalysis {
    const reports = store.getReports() as unknown as AnalyzableWatchdogReport[];
    return analyzeBackendPostFailures(reports);
  },
};

export type IvxAIWatchdog = typeof ivxAIWatchdog;
