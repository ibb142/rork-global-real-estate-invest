/**
 * IVX Video Feed client — same backend the landing page uses.
 *
 *   GET /api/ivx/videos/feed                 — approved videos + engagement counts
 *   GET /api/ivx/videos/:videoId/download    — source-quality progressive MP4
 *                                              (Instagram-style direct download)
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const API_BASE = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');

export interface FeedVideo {
  id: string;
  project_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  cover_url: string | null;
  title: string | null;
  duration_sec: number;
  width: number | null;
  height: number | null;
  orientation: string;
  is_pinned: boolean;
  created_at: string;
  like_count: number;
  comment_count: number;
  share_count: number;
}

/** Fetches the approved video feed (pinned first, newest first). */
export async function fetchVideoFeed(limit = 24): Promise<FeedVideo[]> {
  const res = await fetch(`${API_BASE}/api/ivx/videos/feed?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Feed request failed (${res.status})`);
  }
  const data = (await res.json()) as { videos?: FeedVideo[] };
  return Array.isArray(data.videos) ? data.videos : [];
}

/** Direct high-quality download URL for a feed video. */
export function getVideoDownloadUrl(videoId: string): string {
  return `${API_BASE}/api/ivx/videos/${encodeURIComponent(videoId)}/download`;
}

function safeFileName(title: string | null): string {
  const base = (title || 'ivx-video').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
  return `${base || 'ivx-video'}.mp4`;
}

/**
 * Downloads the source-quality MP4 (resumable Range-enabled endpoint) and
 * opens the native share sheet so the user can save it to Photos/Files —
 * the same flow Instagram uses for saved reels.
 */
export async function downloadFeedVideo(
  videoId: string,
  title: string | null,
): Promise<{ success: boolean; uri?: string; error?: string }> {
  const url = getVideoDownloadUrl(videoId);

  if (Platform.OS === 'web') {
    try {
      const w = (globalThis as { window?: { open?: (u: string, t: string) => unknown } }).window;
      w?.open?.(url, '_blank');
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  try {
    const dest = `${FileSystem.cacheDirectory}${safeFileName(title)}`;
    const result = await FileSystem.downloadAsync(url, dest);
    if (result.status !== 200 && result.status !== 206) {
      return { success: false, error: `Download failed (${result.status})` };
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(result.uri, { mimeType: 'video/mp4', dialogTitle: 'Save video' });
    }
    return { success: true, uri: result.uri };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
