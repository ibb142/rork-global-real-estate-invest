import { afterEach, beforeEach, expect, test } from 'bun:test';
import { ivxAIWatchdog } from './ivxAIWatchdog';

/**
 * BLOCK — Chat reliability verification.
 *
 * Reproduces the "Cannot update a component (IVXWatchdog…) while rendering a
 * different component" warning condition and proves the fix: watchdog
 * checkpoint reporting from the render path (FlatList renderMessage, message
 * merge) must NOT synchronously invoke subscriber setState. The store now
 * emits on a microtask, so a burst of checkpoints during a simulated render
 * never calls a listener synchronously, and all updates coalesce into a
 * single deferred flush on the next tick.
 */

const flushMicrotasks = (): Promise<void> => new Promise<void>((resolve) => { queueMicrotask(resolve); });

let unsubscribe: (() => void) | null = null;

beforeEach(() => {
  unsubscribe = null;
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
});

test('20-message streaming burst never calls a watchdog listener synchronously (no setState during render)', async () => {
  let synchronousCalls = 0;
  let deferredCalls = 0;
  let insideRender = true;

  // subscribe() invokes the listener once immediately with the initial snapshot.
  let initialSnapshotEmitted = false;
  unsubscribe = ivxAIWatchdog.subscribe(() => {
    if (!initialSnapshotEmitted) {
      initialSnapshotEmitted = true;
      return;
    }
    if (insideRender) synchronousCalls += 1;
    else deferredCalls += 1;
  });

  // Simulate React's render phase: create a trace and fire 20 streaming
  // checkpoints synchronously (one per "rendered message"), exactly like
  // renderMessage()/message-merge reporting during a 20-message stream.
  const trace = ivxAIWatchdog.createTrace({
    userMessageId: 'verify-stream',
    userText: 'streaming verification',
    conversationId: 'verify-convo',
    timeoutMs: 5000,
  });

  for (let i = 0; i < 20; i += 1) {
    trace.pass('RENDER_MESSAGE_CALLED', `streamed message ${i + 1}`);
  }

  // Still synchronously inside the simulated render: ZERO listener calls allowed.
  expect(synchronousCalls).toBe(0);

  // Render phase ends; React flushes microtasks.
  insideRender = false;
  await flushMicrotasks();

  // The coalesced update fires exactly once after render (bounded, not 20x).
  expect(deferredCalls).toBeGreaterThan(0);
  expect(deferredCalls).toBeLessThanOrEqual(2);
  trace.complete('SUCCESS');
});

test('rapid mutations coalesce — a 21-mutation burst flushes a bounded number of times', async () => {
  let flushes = 0;
  let initial = false;
  unsubscribe = ivxAIWatchdog.subscribe(() => {
    if (!initial) { initial = true; return; }
    flushes += 1;
  });

  const trace = ivxAIWatchdog.createTrace({
    userMessageId: 'verify-coalesce',
    userText: 'coalesce verification',
    conversationId: 'verify-convo-2',
    timeoutMs: 5000,
  });
  for (let i = 0; i < 20; i += 1) {
    trace.heartbeat(`stream-${i}`);
  }

  await flushMicrotasks();
  // 21 synchronous mutations (createTrace + 20 heartbeats) collapse to a
  // single coalesced flush rather than 21 separate setState calls.
  expect(flushes).toBeGreaterThan(0);
  expect(flushes).toBeLessThanOrEqual(2);
  trace.complete('SUCCESS');
});
