/**
 * Admin Reels API client — owner management of project reels and deal videos.
 * Migrated from ios-ivx/Ivx/Services/AdminReelsService.swift
 *
 * Backend endpoints:
 *   GET  /api/ivx/video-platform/admin/videos        — list all (including hidden)
 *   POST /api/ivx/video-platform/admin/add-reel       — add new video by URL
 *   POST /api/ivx/video-platform/admin/videos/:id     — update/hide/feature/delete
 */

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');

export interface AdminVideo {
  id: string;
  project_id: string | null;
  video_url: string;
  hls_url: string | null;
  poster_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  orientation: string | null;
  is_approved: boolean;
  is_pinned: boolean;
  created_at: string;
  video_type: 'deal' | 'reel';
  is_featured: boolean;
  is_hidden: boolean;
  status: string | null;
  display_order: number | null;
}

export interface AdminVideosResponse {
  videos: AdminVideo[];
  count: number;
  total?: number;
}

export interface AddReelResponse {
  ok: boolean;
  videoId?: string;
  title?: string;
  videoType?: string;
  videoUrl?: string;
  error?: string;
}

/**
 * List all videos for admin management (includes hidden/draft).
 */
export async function fetchAllVideos(type?: string): Promise<AdminVideo[]> {
  const path = type && type !== 'all'
    ? `/api/ivx/video-platform/admin/videos?type=${type}`
    : `/api/ivx/video-platform/admin/videos`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Admin videos request failed (${res.status})`);
  const data = (await res.json()) as AdminVideosResponse;
  return Array.isArray(data.videos) ? data.videos : [];
}

/**
 * Add a new reel/deal video by URL — no developer needed.
 */
export async function addVideo(params: {
  videoUrl: string;
  title: string;
  videoType: string;
  projectId?: string;
  posterUrl?: string;
  durationSec?: number;
}): Promise<AddReelResponse> {
  const res = await fetch(`${API_BASE}/api/ivx/video-platform/admin/add-reel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      video_url: params.videoUrl,
      title: params.title,
      video_type: params.videoType,
      ...(params.projectId ? { project_id: params.projectId } : {}),
      ...(params.posterUrl ? { poster_url: params.posterUrl } : {}),
      ...(params.durationSec ? { duration_sec: params.durationSec } : {}),
    }),
  });
  const data = (await res.json()) as AddReelResponse;
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Update a video: hide/show, change type, set display order, feature, or delete.
 */
export async function updateVideo(params: {
  videoId: string;
  action: string;
  videoType?: string;
  isHidden?: boolean;
  isFeatured?: boolean;
  displayOrder?: number;
  title?: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/ivx/video-platform/admin/videos/${params.videoId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      action: params.action,
      ...(params.videoType ? { video_type: params.videoType } : {}),
      ...(params.isHidden !== undefined ? { is_hidden: params.isHidden } : {}),
      ...(params.isFeatured !== undefined ? { is_featured: params.isFeatured } : {}),
      ...(params.displayOrder !== undefined ? { display_order: params.displayOrder } : {}),
      ...(params.title ? { title: params.title } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text);
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  await updateVideo({ videoId, action: 'delete' });
}

export async function toggleVideoVisibility(videoId: string, isHidden: boolean): Promise<void> {
  await updateVideo({ videoId, action: 'toggle_visibility', isHidden: !isHidden });
}

export async function toggleVideoFeatured(videoId: string, isFeatured: boolean): Promise<void> {
  await updateVideo({ videoId, action: 'toggle_featured', isFeatured: !isFeatured });
}

export async function reorderVideo(videoId: string, displayOrder: number): Promise<void> {
  await updateVideo({ videoId, action: 'reorder', displayOrder });
}
