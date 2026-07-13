/**
 * IVX Video Pipeline API — Instagram-grade video module.
 *
 * Routes (registered in hono.ts):
 *   GET  /api/ivx/video-pipeline/config          — max size, ladder, ffmpeg status
 *   POST /api/ivx/video-pipeline/upload          — multipart file OR JSON { sourceUrl }
 *   GET  /api/ivx/video-pipeline/videos          — playback index (all pipeline videos)
 *   GET  /api/ivx/video-pipeline/:videoId        — full metadata record + status
 *   POST /api/ivx/video-pipeline/:videoId/retry  — re-run transcoding after failure
 */

import {
  VIDEO_PIPELINE_MARKER,
  canRetry,
  createVideo,
  getVideoRecord,
  listVideoRecords,
  processVideo,
  reconcileVideoRecord,
  validateVideoFile,
  videoPipelineConfig,
} from '../services/ivx-video-pipeline';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://ivxholding.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Range',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

export const videoPipelineOptions = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

/** GET /api/ivx/video-pipeline/config */
export async function handleVideoPipelineConfig(): Promise<Response> {
  const cfg = videoPipelineConfig();
  let ffmpeg: unknown = null;
  try {
    const { detectMediaTooling } = await import('../services/ivx-video-worker');
    ffmpeg = await detectMediaTooling();
  } catch (error) {
    ffmpeg = { error: error instanceof Error ? error.message : 'tooling detection failed' };
  }
  return json({ ok: true, ...cfg, ffmpeg });
}

function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

/** POST /api/ivx/video-pipeline/upload — multipart (field "file") or JSON { sourceUrl }. */
export async function handleVideoPipelineUpload(req: Request): Promise<Response> {
  try {
    const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
    let bytes: Uint8Array | null = null;
    let fileName = 'upload.mp4';
    let mimeType: string | null = null;
    let userId: string | null = null;
    let projectId: string | null = null;
    let title: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return json({ ok: false, error: 'multipart field "file" is required', marker: VIDEO_PIPELINE_MARKER }, 400);
      }
      fileName = file.name || fileName;
      mimeType = file.type || null;
      bytes = new Uint8Array(await file.arrayBuffer());
      userId = trimmed(form.get('userId'));
      projectId = trimmed(form.get('projectId'));
      title = trimmed(form.get('title'));
    } else {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      const sourceUrl = trimmed(body?.sourceUrl);
      if (!body || !sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
        return json({
          ok: false,
          error: 'Send multipart/form-data with a "file" field, or JSON { "sourceUrl": "https://..." }.',
          marker: VIDEO_PIPELINE_MARKER,
        }, 400);
      }
      const upstream = await fetch(sourceUrl);
      if (!upstream.ok) {
        return json({ ok: false, error: `sourceUrl responded ${upstream.status}`, marker: VIDEO_PIPELINE_MARKER }, 400);
      }
      bytes = new Uint8Array(await upstream.arrayBuffer());
      mimeType = upstream.headers.get('content-type');
      const urlName = sourceUrl.split('/').pop()?.split('?')[0] ?? '';
      fileName = trimmed(body.fileName) ?? (urlName || 'source.mp4');
      userId = trimmed(body.userId);
      projectId = trimmed(body.projectId);
      title = trimmed(body.title);
    }

    const invalid = validateVideoFile(fileName, mimeType, bytes.byteLength);
    if (invalid) return json({ ok: false, error: invalid, marker: VIDEO_PIPELINE_MARKER }, 400);

    const record = await createVideo({ bytes, fileName, mimeType, userId, projectId, title });
    return json({
      ok: true,
      videoId: record.video_id,
      status: record.status,
      originalUrl: record.original_url,
      storagePath: record.storage_path,
      fileSize: record.file_size,
      statusUrl: `/api/ivx/video-pipeline/${record.video_id}`,
      marker: VIDEO_PIPELINE_MARKER,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'upload failed';
    return json({ ok: false, error: message, marker: VIDEO_PIPELINE_MARKER }, 500);
  }
}

/** GET /api/ivx/video-pipeline/videos */
export async function handleVideoPipelineList(): Promise<Response> {
  try {
    const index = await listVideoRecords();
    return json({ ok: true, count: Object.keys(index).length, videos: index, marker: VIDEO_PIPELINE_MARKER });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'list failed', marker: VIDEO_PIPELINE_MARKER }, 500);
  }
}

/** GET /api/ivx/video-pipeline/:videoId */
export async function handleVideoPipelineGet(videoId: string): Promise<Response> {
  try {
    let record = await getVideoRecord(videoId);
    if (!record) return json({ ok: false, error: 'video not found', marker: VIDEO_PIPELINE_MARKER }, 404);
    record = await reconcileVideoRecord(record);
    return json({ ok: true, video: record, marker: VIDEO_PIPELINE_MARKER });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'lookup failed', marker: VIDEO_PIPELINE_MARKER }, 500);
  }
}

/** POST /api/ivx/video-pipeline/:videoId/retry */
export async function handleVideoPipelineRetry(videoId: string): Promise<Response> {
  try {
    let record = await getVideoRecord(videoId);
    if (!record) return json({ ok: false, error: 'video not found', marker: VIDEO_PIPELINE_MARKER }, 404);
    record = await reconcileVideoRecord(record);
    const eligibility = canRetry(record);
    if (!eligibility.ok) {
      return json({ ok: false, error: `retry not allowed: ${eligibility.reason}`, status: record.status, marker: VIDEO_PIPELINE_MARKER }, 409);
    }
    void processVideo(videoId).catch(() => {});
    return json({ ok: true, videoId, status: 'processing', reason: eligibility.reason, statusUrl: `/api/ivx/video-pipeline/${videoId}`, marker: VIDEO_PIPELINE_MARKER }, 202);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'retry failed', marker: VIDEO_PIPELINE_MARKER }, 500);
  }
}
