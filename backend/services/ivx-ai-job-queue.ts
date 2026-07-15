/**
 * IVX AI background generation job queue.
 *
 * For very long analytical prompts that would otherwise time out client-side,
 * the caller starts a job, gets a `jobId`, and then polls or streams progress.
 * The job runs server-side using the same continuation engine that already
 * exists in `ivx-report-continuation.ts`, so partial sections can be served
 * progressively while the rest is still being generated.
 */
import { requestIVXAIText } from '../ivx-ai-runtime';
import {
  buildContinuationPrompt,
  buildReportParts,
  extractLastItemNumber,
  REPORT_CONTINUATION_MAX_CHARS_PER_PART,
} from './ivx-report-continuation';

export type IVXAIJobStatus = 'queued' | 'running' | 'partial' | 'completed' | 'failed';

export type IVXAIJobSection = {
  partNumber: number;
  text: string;
  itemRange: { start: number; end: number } | null;
  createdAt: string;
};

export type IVXAIJob = {
  id: string;
  module: string;
  conversationId: string | null;
  prompt: string;
  system: string | null;
  model: string | null;
  maxOutputTokens: number;
  maxParts: number;
  status: IVXAIJobStatus;
  sections: IVXAIJobSection[];
  accumulatedText: string;
  lastItemNumber: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, IVXAIJob>();
const TTL_MS = 30 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanup(): void {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - new Date(job.updatedAt).getTime() > TTL_MS) {
      jobs.delete(id);
    }
  }
}
setInterval(cleanup, 60_000).unref?.();

export function getAIJob(jobId: string): IVXAIJob | null {
  return jobs.get(jobId) ?? null;
}

export function listAIJobs(limit: number = 20): IVXAIJob[] {
  const all = Array.from(jobs.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return all.slice(0, Math.min(Math.max(limit, 1), 100));
}

export type StartAIJobInput = {
  module: string;
  conversationId?: string | null;
  prompt: string;
  system?: string | null;
  model?: string | null;
  maxOutputTokens?: number;
  maxParts?: number;
};

export function startAIJob(input: StartAIJobInput): IVXAIJob {
  const job: IVXAIJob = {
    id: createId(),
    module: input.module,
    conversationId: input.conversationId ?? null,
    prompt: input.prompt,
    system: input.system ?? null,
    model: input.model ?? null,
    maxOutputTokens: input.maxOutputTokens ?? 6000,
    maxParts: Math.min(Math.max(input.maxParts ?? 5, 1), 10),
    status: 'queued',
    sections: [],
    accumulatedText: '',
    lastItemNumber: 0,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  jobs.set(job.id, job);
  void runJob(job);
  return job;
}

function update(job: IVXAIJob, patch: Partial<IVXAIJob>): void {
  Object.assign(job, patch, { updatedAt: nowIso() });
}

async function runJob(job: IVXAIJob): Promise<void> {
  update(job, { status: 'running' });

  try {
    for (let partIndex = 0; partIndex < job.maxParts; partIndex += 1) {
      const isFirst = partIndex === 0;
      const prompt = isFirst
        ? job.prompt
        : buildContinuationPrompt(job.prompt, job.accumulatedText, job.lastItemNumber);

      const result = await requestIVXAIText({
        module: job.module,
        requestId: `${job.id}-part${partIndex + 1}`,
        model: job.model ?? undefined,
        system: job.system ?? undefined,
        prompt,
        maxOutputTokens: job.maxOutputTokens,
      });

      const text = result.text.trim();
      if (!text) break;

      const parts = buildReportParts(text, REPORT_CONTINUATION_MAX_CHARS_PER_PART);
      const previousPartCount = job.sections.length;
      const newSections: IVXAIJobSection[] = parts.map((part, idx) => ({
        partNumber: previousPartCount + idx + 1,
        text: part.text,
        itemRange: part.itemRange,
        createdAt: nowIso(),
      }));

      job.sections.push(...newSections);
      job.accumulatedText = `${job.accumulatedText}${job.accumulatedText ? '\n\n' : ''}${text}`;
      job.lastItemNumber = Math.max(job.lastItemNumber, extractLastItemNumber(job.accumulatedText));
      update(job, { status: 'partial' });

      // Continue only if the model signaled more content. If completion was
      // clean (no truncation marker, no big trailing numbered item), stop.
      const tail = text.slice(-200).toLowerCase();
      const looksTruncated = tail.endsWith('...') || tail.endsWith('…') || /to be continued|continued/i.test(tail);
      if (!looksTruncated) break;
    }

    update(job, { status: 'completed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'background job failed';
    update(job, { status: 'failed', error: message });
  }
}
