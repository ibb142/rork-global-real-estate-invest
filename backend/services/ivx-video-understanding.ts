/**
 * IVX video understanding.
 *
 * HONEST SCOPE (grounded in the live runtime):
 * - The production backend runs in `node:22-alpine` with NO ffmpeg, so the
 *   backend CANNOT decode a video container into frames itself. That path is a
 *   real, named blocker — never faked.
 * - What IS supported today: analyze owner/client-supplied FRAME images
 *   (extracted on-device or uploaded as a sequence) on a timeline via the same
 *   vision model the rest of the stack uses. This delivers timeline analysis,
 *   bug detection from recordings, and user-flow analysis from real frames.
 *
 * The vision analyzer is INJECTABLE so the timeline assembly, frame ordering,
 * and labeling are unit-testable without the AI gateway / network.
 */

import { resolveMediaProvenance, type MediaProvenance } from './ivx-media-labels';
import { selectMediaProvider, estimateMediaCostUsd, type MediaProviderSelection } from './ivx-media-providers';

export type VideoFrame = {
  /** Frame image URL (http(s) or data: URI the vision model can fetch). */
  url: string;
  /** Timestamp in seconds within the recording (for the timeline). */
  timestampSeconds?: number;
  mimeType?: string | null;
};

export type VideoUnderstandingGoal = 'describe' | 'bug_detection' | 'user_flow' | 'ui_review';

export type FrameVisionAnalyzer = (input: {
  frames: { url: string; label: string }[];
  instruction: string;
}) => Promise<string>;

export type VideoUnderstandingRequest = {
  frames: VideoFrame[];
  goal?: VideoUnderstandingGoal;
  /** Optional extra context (what the recording shows / repro steps). */
  context?: string;
};

export type VideoUnderstandingResult = {
  ok: boolean;
  analysis: string | null;
  /** Ordered timeline the model was given. */
  timeline: { index: number; timestampSeconds: number | null; url: string }[];
  frameCount: number;
  provenance: MediaProvenance;
  provider: MediaProviderSelection;
  estimatedCostUsd: number | null;
  /** Named blocker when no frames are provided (server-side extraction). */
  blocker: string | null;
  error: string | null;
  generatedAt: string;
};

const MAX_FRAMES = 16;

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const SERVER_EXTRACTION_BLOCKER =
  'Server-side video frame extraction is not available (the backend runtime has no ffmpeg). '
  + 'Supply frames extracted on-device or an image sequence; each frame is then analyzed on a timeline.';

const GOAL_INSTRUCTIONS: Record<VideoUnderstandingGoal, string> = {
  describe:
    'Describe what happens across these video frames in chronological order. Note scene/screen changes and any visible text.',
  bug_detection:
    'These are frames from a screen/app recording. Identify visual bugs, crashes, error states, broken layouts, frozen UI, or unexpected transitions. Cite the frame index where each issue appears.',
  user_flow:
    'These are frames from a user-session recording. Reconstruct the user flow step by step (screen → action → result), citing frame indices, and flag drop-off or confusion points.',
  ui_review:
    'These are UI frames. Review layout, spacing, hierarchy, and consistency across the timeline; cite the frame index for each observation.',
};

/** Normalize + order frames into a bounded, timestamp-sorted timeline. */
type OrderedVideoFrame = { url: string; timestampSeconds: number | null; mimeType: string | null };

export function buildVideoTimeline(frames: VideoFrame[]): {
  ordered: OrderedVideoFrame[];
  timeline: { index: number; timestampSeconds: number | null; url: string }[];
} {
  const valid = (frames ?? [])
    .map((frame) => ({
      url: readTrimmed(frame.url),
      timestampSeconds:
        typeof frame.timestampSeconds === 'number' && Number.isFinite(frame.timestampSeconds) && frame.timestampSeconds >= 0
          ? frame.timestampSeconds
          : null,
      mimeType: frame.mimeType ?? null,
    }))
    .filter((frame) => frame.url.length > 0);

  // Stable sort: timestamped frames in order first (by time), untimed keep input order after.
  const indexed = valid.map((frame, inputIndex) => ({ frame, inputIndex }));
  indexed.sort((a, b) => {
    const at = a.frame.timestampSeconds;
    const bt = b.frame.timestampSeconds;
    if (at !== null && bt !== null && at !== bt) return at - bt;
    if (at !== null && bt === null) return -1;
    if (at === null && bt !== null) return 1;
    return a.inputIndex - b.inputIndex;
  });

  const ordered = indexed.map((entry) => entry.frame).slice(0, MAX_FRAMES);
  const timeline = ordered.map((frame, index) => ({
    index,
    timestampSeconds: frame.timestampSeconds,
    url: frame.url,
  }));
  return { ordered, timeline };
}

/**
 * Analyze a video as a timeline of frames. Never throws — returns `ok:false`
 * with the exact blocker/reason. Output is labeled ANALYZED (no asset is
 * synthesized).
 */
export async function understandIVXVideo(
  request: VideoUnderstandingRequest,
  analyzer: FrameVisionAnalyzer,
): Promise<VideoUnderstandingResult> {
  const generatedAt = new Date().toISOString();
  const goal: VideoUnderstandingGoal = request.goal ?? 'describe';
  const provenance = resolveMediaProvenance({ kind: 'analysis' });
  const provider = selectMediaProvider('video_understanding');
  const { ordered, timeline } = buildVideoTimeline(request.frames ?? []);
  const estimatedCostUsd = estimateMediaCostUsd('video_understanding', Math.max(1, Math.ceil(ordered.length / 8)));

  if (ordered.length === 0) {
    return {
      ok: false,
      analysis: null,
      timeline: [],
      frameCount: 0,
      provenance,
      provider,
      estimatedCostUsd,
      blocker: SERVER_EXTRACTION_BLOCKER,
      error: 'No video frames were provided to analyze.',
      generatedAt,
    };
  }

  const context = readTrimmed(request.context);
  const instruction = [
    GOAL_INSTRUCTIONS[goal],
    'Frames are provided in chronological order and labeled with their index and timestamp.',
    context ? `Context from the owner: ${context}` : null,
    'Never invent content that is not visible in a frame.',
  ]
    .filter(Boolean)
    .join('\n');

  const labeledFrames = ordered.map((frame, index) => ({
    url: frame.url,
    label:
      frame.timestampSeconds !== null
        ? `Frame ${index} @ ${frame.timestampSeconds.toFixed(2)}s`
        : `Frame ${index}`,
  }));

  try {
    const analysis = readTrimmed(await analyzer({ frames: labeledFrames, instruction }));
    if (!analysis) {
      return {
        ok: false,
        analysis: null,
        timeline,
        frameCount: ordered.length,
        provenance,
        provider,
        estimatedCostUsd,
        blocker: null,
        error: 'The vision model returned an empty analysis.',
        generatedAt,
      };
    }
    return {
      ok: true,
      analysis,
      timeline,
      frameCount: ordered.length,
      provenance,
      provider,
      estimatedCostUsd,
      blocker: null,
      error: null,
      generatedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video frame analysis failed.';
    return {
      ok: false,
      analysis: null,
      timeline,
      frameCount: ordered.length,
      provenance,
      provider,
      estimatedCostUsd,
      blocker: null,
      error: message.slice(0, 400),
      generatedAt,
    };
  }
}

/**
 * Default analyzer backed by the proven `requestIVXAIText` vision path (lazy
 * imported so this module loads without the heavy AI runtime). Sends the
 * ordered frames as image attachments to the video-capable vision model.
 */
export const defaultFrameVisionAnalyzer: FrameVisionAnalyzer = async ({ frames, instruction }) => {
  const { requestIVXAIText } = await import('../ivx-ai-runtime');
  const prompt = [instruction, '', ...frames.map((frame) => `- ${frame.label}: ${frame.url}`)].join('\n');
  const result = await requestIVXAIText({
    module: 'video-understanding',
    model: selectMediaProvider('video_understanding').modelId,
    prompt,
    images: frames.map((frame) => ({ url: frame.url, mimeType: 'image/*' })),
    maxOutputTokens: 1200,
  });
  return result.text;
};
