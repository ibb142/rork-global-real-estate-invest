/**
 * IVX multimodal stack API (owner-only).
 *
 *   GET  /api/ivx/multimodal/status            → capabilities + providers + costs + labels
 *   POST /api/ivx/multimodal/generate-image    → generate image (GENERATED/EDITED/REFERENCE_BASED)
 *   POST /api/ivx/multimodal/understand-video  → frame/timeline video analysis (ANALYZED)
 *   POST /api/ivx/multimodal/generate-3d       → owner Meshy/Tripo direct, else procedural preview
 *
 * Image understanding already ships via owner-multimodal + the public-chat vision
 * path; the status surface reports it. Every owner gate maps failures to 401/403.
 * 3D routes through owner-held keys only (MESHY_API_KEY / TRIPO_API_KEY) — no Rork toolkit.
 */

import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { buildMultimodalStackReport } from '../services/ivx-multimodal-stack';
import { generateIVXImage } from '../services/ivx-image-generation';
import { understandIVXVideo, defaultFrameVisionAnalyzer, type VideoFrame, type VideoUnderstandingGoal } from '../services/ivx-video-understanding';
import { generateIVX3DModel } from '../services/ivx-model3d-generation';

export const OPTIONS = (): Response => ownerOnlyOptions();

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function requireOwner(request: Request): Promise<Response | null> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401);
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication failed.';
    const status = /missing bearer/i.test(message) || /invalid or expired/i.test(message) ? 401 : 403;
    return ownerOnlyJson({ ok: false, error: message }, status);
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function handleMultimodalStatusRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  return ownerOnlyJson({ ok: true, stack: buildMultimodalStackReport() as unknown as Record<string, unknown> });
}

export async function handleMultimodalGenerateImageRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const prompt = readTrimmed(body.prompt);
  const sourceImages = Array.isArray(body.sourceImages)
    ? body.sourceImages.filter((s): s is string => typeof s === 'string')
    : [];
  const result = await generateIVXImage({
    prompt,
    sourceImages,
    edit: body.edit === true,
    modelId: readTrimmed(body.modelId) || undefined,
  });
  return ownerOnlyJson({ ok: result.ok, result: result as unknown as Record<string, unknown> }, result.ok ? 200 : 422);
}

export async function handleMultimodalUnderstandVideoRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const frames: VideoFrame[] = Array.isArray(body.frames)
    ? body.frames
        .map((frame): VideoFrame | null => {
          if (typeof frame === 'string') return { url: frame };
          if (frame && typeof frame === 'object') {
            const f = frame as Record<string, unknown>;
            const url = readTrimmed(f.url ?? f.uri ?? f.image);
            if (!url) return null;
            return {
              url,
              timestampSeconds: typeof f.timestampSeconds === 'number' ? f.timestampSeconds : undefined,
              mimeType: typeof f.mimeType === 'string' ? f.mimeType : null,
            };
          }
          return null;
        })
        .filter((f): f is VideoFrame => f !== null)
    : [];
  const goal = readTrimmed(body.goal) as VideoUnderstandingGoal;
  const result = await understandIVXVideo(
    { frames, goal: goal || undefined, context: readTrimmed(body.context) || undefined },
    defaultFrameVisionAnalyzer,
  );
  return ownerOnlyJson({ ok: result.ok, result: result as unknown as Record<string, unknown> }, result.ok ? 200 : 422);
}

export async function handleMultimodalGenerate3DRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const prompt = readTrimmed(body.prompt);
  const sourceImages = Array.isArray(body.sourceImages)
    ? body.sourceImages.filter((s): s is string => typeof s === 'string')
    : [];
  const result = await generateIVX3DModel({ prompt, sourceImages });
  // ok:true covers both a real GENERATED_3D submission and the PROCEDURAL_PREVIEW
  // fallback (which still carries a BLOCKED_MISSING_PROVIDER_KEY blocker note).
  return ownerOnlyJson(
    { ok: result.ok, status: result.label, result: result as unknown as Record<string, unknown> },
    result.ok ? 200 : 422,
  );
}
