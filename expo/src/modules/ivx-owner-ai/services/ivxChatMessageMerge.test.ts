import { describe, expect, it } from 'bun:test';
import {
  mergeOwnerMessages,
  capOwnerMessages,
  buildOwnerMessageContentKey,
  type MergeableOwnerMessage,
} from './ivxChatMessageMerge';

function makeMessage(overrides: Partial<MergeableOwnerMessage> & { id: string; createdAt: string }): MergeableOwnerMessage {
  return {
    conversationId: 'ivx-owner-room',
    senderUserId: null,
    senderRole: 'owner',
    body: null,
    attachmentUrl: null,
    attachmentName: null,
    ...overrides,
  };
}

describe('mergeOwnerMessages', () => {
  it('returns remote messages sorted chronologically when there is no local shadow', () => {
    const remote = [
      makeMessage({ id: 'b', body: 'second', createdAt: '2026-05-31T00:00:02Z' }),
      makeMessage({ id: 'a', body: 'first', createdAt: '2026-05-31T00:00:01Z' }),
    ];
    const merged = mergeOwnerMessages(remote, []);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('preserves local-only messages that were never persisted remotely (offline / auth-degraded sends)', () => {
    const remote = [makeMessage({ id: 'r1', body: 'remote', createdAt: '2026-05-31T00:00:01Z' })];
    const local = [
      makeMessage({ id: 'r1', body: 'remote', createdAt: '2026-05-31T00:00:01Z' }),
      makeMessage({ id: 'l1', body: 'offline owner turn', createdAt: '2026-05-31T00:00:03Z' }),
    ];
    const merged = mergeOwnerMessages(remote, local);
    expect(merged.map((m) => m.id)).toEqual(['r1', 'l1']);
  });

  it('drops the stale local copy of a turn that was re-persisted remotely with a new id + timestamp (no duplicate after reload)', () => {
    const local = [
      makeMessage({ id: 'ivx-local-1', senderRole: 'assistant', body: 'Here is your ranking.', createdAt: '2026-05-31T00:00:05Z' }),
    ];
    const remote = [
      makeMessage({ id: 'server-uuid', senderRole: 'assistant', body: 'Here is your ranking.', createdAt: '2026-05-31T00:00:06Z' }),
    ];
    const merged = mergeOwnerMessages(remote, local);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('server-uuid');
  });

  it('does not collapse two distinct turns with different bodies', () => {
    const remote = [makeMessage({ id: 'r1', body: 'one', createdAt: '2026-05-31T00:00:01Z' })];
    const local = [makeMessage({ id: 'l1', body: 'two', createdAt: '2026-05-31T00:00:02Z' })];
    const merged = mergeOwnerMessages(remote, local);
    expect(merged).toHaveLength(2);
  });

  it('keeps distinct attachment-only messages (no body) instead of collapsing them', () => {
    const remote = [
      makeMessage({ id: 'r1', attachmentUrl: 'https://x/a.png', attachmentName: 'a.png', createdAt: '2026-05-31T00:00:01Z' }),
    ];
    const local = [
      makeMessage({ id: 'l1', attachmentUrl: 'https://x/b.png', attachmentName: 'b.png', createdAt: '2026-05-31T00:00:02Z' }),
    ];
    const merged = mergeOwnerMessages(remote, local);
    expect(merged).toHaveLength(2);
  });
});

describe('buildOwnerMessageContentKey', () => {
  it('returns null for attachment-only messages so uploads are never deduped by content', () => {
    const key = buildOwnerMessageContentKey(makeMessage({ id: 'x', attachmentUrl: 'https://x/a.png', createdAt: '2026-05-31T00:00:01Z' }));
    expect(key).toBeNull();
  });

  it('builds a conversation+role+body key for text messages', () => {
    const key = buildOwnerMessageContentKey(makeMessage({ id: 'x', body: 'Hello', senderRole: 'owner', createdAt: '2026-05-31T00:00:01Z' }));
    expect(key).toBe('ivx-owner-room::owner::hello');
  });
});

describe('capOwnerMessages', () => {
  it('keeps the most recent N messages chronologically', () => {
    const messages = Array.from({ length: 10 }, (_, index) =>
      makeMessage({ id: `m${index}`, body: `m${index}`, createdAt: `2026-05-31T00:00:${String(index).padStart(2, '0')}Z` }),
    );
    const capped = capOwnerMessages(messages, 3);
    expect(capped.map((m) => m.id)).toEqual(['m7', 'm8', 'm9']);
  });

  it('returns everything (sorted) when under the cap', () => {
    const messages = [
      makeMessage({ id: 'b', createdAt: '2026-05-31T00:00:02Z' }),
      makeMessage({ id: 'a', createdAt: '2026-05-31T00:00:01Z' }),
    ];
    expect(capOwnerMessages(messages, 50).map((m) => m.id)).toEqual(['a', 'b']);
  });
});
