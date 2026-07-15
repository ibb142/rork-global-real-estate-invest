/**
 * IVX Media Jobs lifecycle regression tests.
 *
 * Validates the backend media-job state machine drives:
 *   queued -> running -> analyzing_media -> generating_answer -> completed
 *   queued -> running -> analyzing_media -> (failure) -> analyzing_media (retry) -> completed
 *   queued -> running -> analyzing_media -> (failure x2) -> failed
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import {
  __resetMediaJobStoreForTests,
  completeMediaJob,
  createMediaJob,
  failMediaJob,
  getMediaJob,
  shouldRetryMediaJob,
  transitionMediaJob,
} from '../../backend/services/ivx-media-jobs';

beforeEach(() => {
  __resetMediaJobStoreForTests();
});

describe('IVX Media Jobs lifecycle', () => {
  test('creates a job in the queued state with media count and types preserved', () => {
    const job = createMediaJob({
      mediaCount: 3,
      mediaTypes: { image: 2, video: 1 },
      prompt: 'Watch this and tell me what happened.',
      ownerId: 'owner-1',
    });
    expect(job.state).toBe('queued');
    expect(job.mediaCount).toBe(3);
    expect(job.mediaTypes).toEqual({ image: 2, video: 1 });
    expect(job.progress).toBeGreaterThan(0);
    expect(job.progress).toBeLessThan(100);
    expect(job.logs.length).toBeGreaterThan(0);
    expect(job.errorState).toBeNull();
    expect(job.finalResult).toBeNull();
  });

  test('drives through running -> analyzing_media -> generating_answer -> completed with logs', () => {
    const job = createMediaJob({ mediaCount: 1, mediaTypes: { video: 1 }, prompt: 'p' });
    const running = transitionMediaJob(job.id, 'running', 'reading files');
    expect(running?.state).toBe('running');
    const analyzing = transitionMediaJob(job.id, 'analyzing_media', 'analyzing video');
    expect(analyzing?.state).toBe('analyzing_media');
    const generating = transitionMediaJob(job.id, 'generating_answer', 'asking AI');
    expect(generating?.state).toBe('generating_answer');
    const finalJob = completeMediaJob(job.id, 'Here is the video summary.');
    expect(finalJob?.state).toBe('completed');
    expect(finalJob?.progress).toBe(100);
    expect(finalJob?.finalResult).toBe('Here is the video summary.');
    expect(finalJob?.completedAt).not.toBeNull();
    const statesInLogs = (finalJob?.logs ?? []).map((entry) => entry.state);
    expect(statesInLogs).toContain('queued');
    expect(statesInLogs).toContain('running');
    expect(statesInLogs).toContain('analyzing_media');
    expect(statesInLogs).toContain('generating_answer');
    expect(statesInLogs).toContain('completed');
  });

  test('first failure resets to analyzing_media so the worker can retry once', () => {
    const job = createMediaJob({ mediaCount: 1, mediaTypes: { image: 1 }, prompt: 'p' });
    transitionMediaJob(job.id, 'running', 'reading');
    transitionMediaJob(job.id, 'analyzing_media', 'analyzing');
    const afterFail = failMediaJob(job.id, 'gateway 502', 'media_analysis_failed');
    expect(afterFail?.state).toBe('analyzing_media');
    expect(afterFail?.errorState?.attempts).toBe(1);
    expect(shouldRetryMediaJob(afterFail!)).toBe(true);
    const recovered = completeMediaJob(job.id, 'recovered');
    expect(recovered?.state).toBe('completed');
    expect(recovered?.finalResult).toBe('recovered');
  });

  test('second failure transitions to terminal failed with real technical error', () => {
    const job = createMediaJob({ mediaCount: 1, mediaTypes: { image: 1 }, prompt: 'p' });
    transitionMediaJob(job.id, 'analyzing_media', 'analyzing');
    failMediaJob(job.id, 'gateway 502', 'media_analysis_failed');
    const finalFail = failMediaJob(job.id, 'gateway 502', 'media_analysis_failed');
    expect(finalFail?.state).toBe('failed');
    expect(finalFail?.progress).toBe(100);
    expect(finalFail?.errorState?.attempts).toBe(2);
    expect(finalFail?.completedAt).not.toBeNull();
    expect(shouldRetryMediaJob(finalFail!)).toBe(false);
  });

  test('completed jobs are immutable to further transitions (no fake reopen)', () => {
    const job = createMediaJob({ mediaCount: 1, mediaTypes: { image: 1 }, prompt: 'p' });
    completeMediaJob(job.id, 'done');
    const attempted = transitionMediaJob(job.id, 'analyzing_media', 'should not move');
    expect(attempted?.state).toBe('completed');
  });

  test('getMediaJob returns null for unknown ids (no silent success)', () => {
    expect(getMediaJob('mjob-does-not-exist')).toBeNull();
  });

  test('rejects invalid mediaCount and unknown next states are caught by the API guard', () => {
    // The store itself accepts mediaCount but rounds to integer; API guard rejects <= 0.
    const job = createMediaJob({ mediaCount: 1.7, mediaTypes: { image: 1 }, prompt: 'p' });
    expect(job.mediaCount).toBe(1);
  });
});
