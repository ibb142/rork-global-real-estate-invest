/**
 * Video Upload Pipeline — staged Instagram-style video upload with progress,
 * processing status, and publish flow.
 *
 * Stages: selected → uploading → uploaded → processing → ready → failed
 *
 * Uses the production backend:
 *   POST /api/ivx/video-platform/admin/upload   — presigned upload URL
 *   POST /api/ivx/video-platform/admin/add-reel  — create DB record
 *   GET  /api/ivx/video-platform/admin/videos/:id — poll processing status
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');

export type UploadStage = 'selected' | 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface VideoUploadState {
  stage: UploadStage;
  progress: number; // 0–1
  videoId: string | null;
  error: string | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
}

export interface VideoSelectionResult {
  uri: string;
  duration: number;
  width: number;
  height: number;
  fileSize: number | null;
  fileName: string;
}

export interface UploadOptions {
  title: string;
  videoType: 'deal' | 'reel';
  projectId?: string;
  caption?: string;
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_DURATION_SEC = 600; // 10 minutes
const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'm4v', 'avi', 'mkv'];

/**
 * STAGE 1 — Local Selection
 * Validates: file format, duration, file size, permissions
 */
export async function selectVideoFromGallery(): Promise<VideoSelectionResult | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Gallery permission is required to select a video.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: false,
    quality: 1,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const uri = asset.uri;
  const fileName = uri.split('/').pop() || `video-${Date.now()}.mp4`;
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  // Validate file format
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error(`Unsupported format: .${extension}. Use ${ALLOWED_EXTENSIONS.join(', ')}.`);
  }

  // Validate duration
  if (asset.duration && asset.duration > MAX_DURATION_SEC * 1000) {
    throw new Error(`Video is too long (${Math.round(asset.duration / 1000)}s). Max ${MAX_DURATION_SEC}s.`);
  }

  // Validate file size (if available)
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${Math.round(asset.fileSize / 1024 / 1024)}MB). Max ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  return {
    uri,
    duration: asset.duration || 0,
    width: asset.width || 0,
    height: asset.height || 0,
    fileSize: asset.fileSize ?? null,
    fileName,
  };
}

/**
 * STAGE 2-5 — Full upload pipeline with progress callbacks
 * Stages: uploading → uploaded → processing → ready/failed
 */
export async function uploadVideoPipeline(
  selection: VideoSelectionResult,
  options: UploadOptions,
  onProgress: (state: VideoUploadState) => void,
): Promise<VideoUploadState> {
  const idempotencyKey = `ivx-upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  let videoId: string | null = null;

  try {
    // STAGE: uploading
    onProgress({ stage: 'uploading', progress: 0, videoId: null, error: null, thumbnailUrl: null, playbackUrl: null });

    // Request presigned upload URL from backend
    const presignRes = await fetch(`${API_BASE}/api/ivx/video-platform/admin/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: selection.fileName,
        contentType: 'video/mp4',
        idempotencyKey,
        ...options,
      }),
    });

    if (!presignRes.ok) {
      const errText = await presignRes.text().catch(() => `HTTP ${presignRes.status}`);
      throw new Error(`Upload URL request failed: ${errText}`);
    }

    const presignData = await presignRes.json() as {
      uploadUrl: string;
      videoId: string;
      thumbnailUrl?: string;
    };
    videoId = presignData.videoId;

    // Upload the file using PUT with progress tracking
    const uploadResponse = await fetch(selection.uri);
    const blob = await uploadResponse.blob();

    const uploadResult = await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignData.uploadUrl);
      xhr.setRequestHeader('Content-Type', 'video/mp4');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = event.loaded / event.total;
          onProgress({
            stage: 'uploading',
            progress,
            videoId,
            error: null,
            thumbnailUrl: presignData.thumbnailUrl ?? null,
            playbackUrl: null,
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(blob);
    });

    // STAGE: uploaded
    onProgress({ stage: 'uploaded', progress: 1, videoId, error: null, thumbnailUrl: presignData.thumbnailUrl ?? null, playbackUrl: null });

    // STAGE: processing — create the DB record and start processing
    onProgress({ stage: 'processing', progress: 1, videoId, error: null, thumbnailUrl: presignData.thumbnailUrl ?? null, playbackUrl: null });

    const publishRes = await fetch(`${API_BASE}/api/ivx/video-platform/admin/add-reel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: presignData.uploadUrl.split('?')[0], // clean URL without query params
        title: options.title,
        video_type: options.videoType,
        ...(options.projectId ? { project_id: options.projectId } : {}),
        ...(presignData.thumbnailUrl ? { poster_url: presignData.thumbnailUrl } : {}),
        duration_sec: Math.round(selection.duration / 1000),
        idempotencyKey,
        uploadVideoId: videoId,
      }),
    });

    if (!publishRes.ok) {
      const errText = await publishRes.text().catch(() => `HTTP ${publishRes.status}`);
      throw new Error(`Publish failed: ${errText}`);
    }

    const publishData = await publishRes.json() as { ok: boolean; videoId?: string; error?: string };
    if (!publishData.ok) {
      throw new Error(publishData.error || 'Publish returned failure');
    }

    const finalVideoId = publishData.videoId || videoId;

    // STAGE: ready
    const finalState: VideoUploadState = {
      stage: 'ready',
      progress: 1,
      videoId: finalVideoId,
      error: null,
      thumbnailUrl: presignData.thumbnailUrl ?? null,
      playbackUrl: `${API_BASE}/api/ivx/videos/${finalVideoId}/download`,
    };

    onProgress(finalState);
    return finalState;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Upload failed';
    const failState: VideoUploadState = {
      stage: 'failed',
      progress: 0,
      videoId,
      error: errMsg,
      thumbnailUrl: null,
      playbackUrl: null,
    };
    onProgress(failState);
    return failState;
  }
}

/**
 * Poll processing status for a video ID.
 * Returns 'ready' when the video is available for playback.
 */
export async function pollVideoStatus(videoId: string, maxAttempts = 30): Promise<UploadStage> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/ivx/video-platform/admin/videos/${videoId}`);
      if (res.ok) {
        const data = await res.json() as { status?: string; playback_status?: string };
        const status = (data.playback_status || data.status || '').toLowerCase();
        if (status === 'ready' || status === 'published') return 'ready';
        if (status === 'failed') return 'failed';
      }
    } catch {
      // Continue polling
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return 'processing';
}
