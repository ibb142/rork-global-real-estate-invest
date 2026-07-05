/**
 * IVX Project Engagement API — Instagram-Style Cards
 *
 * Handles media, likes, comments, shares, saves, and analytics
 * for project cards on both landing page and app.
 */
import { supabase } from '../lib/supabase';

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProjectMedia {
  id: string;
  project_id: string;
  media_type: 'image' | 'video';
  url: string;
  thumbnail_url: string | null;
  cover_image_url: string | null;
  title: string | null;
  description: string | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  position: number;
  is_pinned: boolean;
  is_approved: boolean;
  created_at: string;
}

export interface ProjectVideo {
  id: string;
  project_id: string;
  media_id: string | null;
  title: string | null;
  video_url: string;
  thumbnail_url: string | null;
  cover_url: string | null;
  duration_sec: number;
  width: number | null;
  height: number | null;
  orientation: 'portrait' | 'landscape' | 'square';
  is_pinned: boolean;
  is_approved: boolean;
  view_count: number;
  created_at: string;
}

export interface ProjectLike {
  id: string;
  project_id: string;
  user_id: string | null;
  guest_id: string | null;
  created_at: string;
}

export interface ProjectComment {
  id: string;
  project_id: string;
  user_id: string | null;
  guest_name: string | null;
  parent_id: string | null;
  body: string;
  is_approved: boolean;
  is_owner_reply: boolean;
  deleted_at: string | null;
  created_at: string;
  replies?: ProjectComment[];
  user_name?: string;
}

export interface ProjectShare {
  id: string;
  project_id: string;
  share_type: 'copy_link' | 'whatsapp' | 'sms' | 'email' | 'social' | 'referral' | 'other';
  created_at: string;
}

export interface ProjectSave {
  id: string;
  project_id: string;
  created_at: string;
}

export interface ProjectEngagement {
  like_count: number;
  comment_count: number;
  share_count: number;
  save_count: number;
  user_liked: boolean;
  user_saved: boolean;
}

export interface ProjectAnalytics {
  project_id: string;
  date: string;
  video_views: number;
  total_watch_sec: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  save_count: number;
  invest_clicks: number;
  lead_conversions: number;
  detail_views: number;
}

export interface MediaUploadResult {
  success: boolean;
  media?: ProjectMedia;
  video?: ProjectVideo;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Media ──────────────────────────────────────────────────────────────────

export async function fetchProjectMedia(projectId: string): Promise<{ images: ProjectMedia[]; videos: ProjectVideo[] }> {
  const { data: media } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_approved', true)
    .order('position', { ascending: true });

  const { data: videos } = await supabase
    .from('project_videos')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_approved', true)
    .order('is_pinned', { ascending: false });

  const images = (media || []).filter((m: ProjectMedia) => m.media_type === 'image');
  const allVideos = (videos || []) as ProjectVideo[];

  return { images, videos: allVideos };
}

export async function uploadProjectMedia(
  projectId: string,
  fileUri: string,
  mediaType: 'image' | 'video',
  title?: string,
): Promise<MediaUploadResult> {
  try {
    const fileName = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
    const bucket = mediaType === 'video' ? 'project-videos' : 'project-photos';

    // Upload to Supabase Storage
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, {
        contentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    // Create media record
    const { data: mediaRecord, error: mediaError } = await supabase
      .from('project_media')
      .insert({
        project_id: projectId,
        media_type: mediaType,
        url: publicUrl,
        thumbnail_url: mediaType === 'image' ? publicUrl : null,
        title: title || null,
        position: 0,
      })
      .select()
      .single();

    if (mediaError) throw new Error(mediaError.message);

    const result: MediaUploadResult = { success: true, media: mediaRecord as ProjectMedia };

    if (mediaType === 'video') {
      const { data: videoRecord, error: videoError } = await supabase
        .from('project_videos')
        .insert({
          project_id: projectId,
          media_id: mediaRecord.id,
          video_url: publicUrl,
          title: title || null,
          duration_sec: 0,
        })
        .select()
        .single();

      if (videoError) throw new Error(videoError.message);
      result.video = videoRecord as ProjectVideo;
    }

    return result;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteProjectMedia(mediaId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('project_media').delete().eq('id', mediaId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function pinProjectVideo(videoId: string, projectId: string): Promise<{ success: boolean; error?: string }> {
  // Unpin all first
  await supabase.from('project_videos').update({ is_pinned: false }).eq('project_id', projectId);
  const { error } = await supabase.from('project_videos').update({ is_pinned: true }).eq('id', videoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Likes ──────────────────────────────────────────────────────────────────

export async function toggleProjectLike(projectId: string, userId?: string | null): Promise<{ liked: boolean; likeCount: number }> {
  if (userId) {
    // Check if already liked
    const { data: existing } = await supabase
      .from('project_likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('project_likes').delete().eq('id', existing.id);
    } else {
      await supabase.from('project_likes').insert({ project_id: projectId, user_id: userId });
    }
  }

  const { count } = await supabase
    .from('project_likes')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const liked = userId
    ? !!(await supabase.from('project_likes').select('id').eq('project_id', projectId).eq('user_id', userId).maybeSingle()).data
    : false;

  return { liked, likeCount: count ?? 0 };
}

export async function getProjectLikeCount(projectId: string): Promise<number> {
  const { count } = await supabase
    .from('project_likes')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);
  return count ?? 0;
}

// ── Comments ───────────────────────────────────────────────────────────────

export async function fetchProjectComments(
  projectId: string,
  limit = 20,
  offset = 0,
): Promise<{ comments: ProjectComment[]; total: number }> {
  const { data, count } = await supabase
    .from('project_comments')
    .select('*', { count: 'exact' })
    .eq('project_id', projectId)
    .eq('is_approved', true)
    .is('deleted_at', null)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Fetch replies for each comment
  const comments = await Promise.all(
    (data || []).map(async (comment: ProjectComment) => {
      const { data: replies } = await supabase
        .from('project_comments')
        .select('*')
        .eq('parent_id', comment.id)
        .eq('is_approved', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      // Get user name if available
      let userName = comment.guest_name || 'Investor';
      if (comment.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', comment.user_id)
          .maybeSingle();
        if (profile) {
          userName = `${(profile as any).first_name || ''} ${(profile as any).last_name || ''}`.trim() || 'Investor';
        }
      }

      return {
        ...comment,
        user_name: comment.is_owner_reply ? 'IVX Team' : userName,
        replies: (replies || []).map((r: ProjectComment) => ({
          ...r,
          user_name: r.is_owner_reply ? 'IVX Team' : (r.guest_name || 'Investor'),
        })),
      };
    }),
  );

  return { comments, total: count ?? 0 };
}

export async function addProjectComment(
  projectId: string,
  body: string,
  userId?: string | null,
  guestName?: string,
  parentId?: string,
): Promise<{ success: boolean; comment?: ProjectComment; error?: string }> {
  const { data, error } = await supabase
    .from('project_comments')
    .insert({
      project_id: projectId,
      user_id: userId || null,
      guest_name: guestName || null,
      parent_id: parentId || null,
      body,
      is_owner_reply: false,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, comment: data as ProjectComment };
}

export async function deleteProjectComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('project_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function approveProjectComment(commentId: string, approved: boolean): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('project_comments')
    .update({ is_approved: approved })
    .eq('id', commentId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Shares ─────────────────────────────────────────────────────────────────

export async function trackProjectShare(
  projectId: string,
  shareType: ProjectShare['share_type'],
  userId?: string | null,
): Promise<{ success: boolean; shareCount: number }> {
  await supabase.from('project_shares').insert({
    project_id: projectId,
    user_id: userId || null,
    share_type: shareType,
  });

  const { count } = await supabase
    .from('project_shares')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  return { success: true, shareCount: count ?? 0 };
}

// ── Saves ──────────────────────────────────────────────────────────────────

export async function toggleProjectSave(projectId: string, userId: string): Promise<{ saved: boolean; saveCount: number }> {
  const { data: existing } = await supabase
    .from('project_saves')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('project_saves').delete().eq('id', existing.id);
  } else {
    await supabase.from('project_saves').insert({ project_id: projectId, user_id: userId });
  }

  const { count } = await supabase
    .from('project_saves')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  const saved = !existing;
  return { saved, saveCount: count ?? 0 };
}

// ── Engagement Summary ─────────────────────────────────────────────────────

export async function getProjectEngagement(projectId: string, userId?: string | null): Promise<ProjectEngagement> {
  const [likes, comments, shares, saves] = await Promise.all([
    supabase.from('project_likes').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('project_comments').select('*', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_approved', true).is('deleted_at', null),
    supabase.from('project_shares').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('project_saves').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
  ]);

  let userLiked = false;
  let userSaved = false;

  if (userId) {
    const [likedResult, savedResult] = await Promise.all([
      supabase.from('project_likes').select('id').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
      supabase.from('project_saves').select('id').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
    ]);
    userLiked = !!likedResult.data;
    userSaved = !!savedResult.data;
  }

  return {
    like_count: likes.count ?? 0,
    comment_count: comments.count ?? 0,
    share_count: shares.count ?? 0,
    save_count: saves.count ?? 0,
    user_liked: userLiked,
    user_saved: userSaved,
  };
}

// ── Analytics ──────────────────────────────────────────────────────────────

export async function trackVideoView(projectId: string, watchSeconds: number): Promise<void> {
  try {
    await supabase.rpc('increment_video_view', {
      p_project_id: projectId,
      p_watch_sec: watchSeconds,
    });
  } catch { /* non-critical */ }
}

export async function trackInvestClick(projectId: string): Promise<void> {
  try {
    await supabase.from('project_analytics')
      .upsert({
        project_id: projectId,
        date: new Date().toISOString().split('T')[0],
        invest_clicks: 1,
      }, { onConflict: 'project_id,date', ignoreDuplicates: false });
  } catch { /* non-critical */ }
}

export async function getProjectAnalytics(projectId: string, days = 30): Promise<ProjectAnalytics[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from('project_analytics')
    .select('*')
    .eq('project_id', projectId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: false });

  return (data || []) as ProjectAnalytics[];
}

export async function getAllProjectsAnalytics(): Promise<Record<string, ProjectEngagement>> {
  const { data } = await supabase.from('project_engagement').select('*');
  const result: Record<string, ProjectEngagement> = {};
  for (const row of (data || [])) {
    result[row.project_id] = {
      like_count: row.like_count || 0,
      comment_count: row.comment_count || 0,
      share_count: row.share_count || 0,
      save_count: row.save_count || 0,
      user_liked: false,
      user_saved: false,
    };
  }
  return result;
}

// ── Referral Links ─────────────────────────────────────────────────────────

export async function createReferralLink(projectId: string): Promise<{ shortCode: string; url: string } | null> {
  const shortCode = Math.random().toString(36).slice(2, 10);
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase
    .from('project_referral_links')
    .insert({
      project_id: projectId,
      referrer_id: session?.user?.id || null,
      short_code: shortCode,
    })
    .select()
    .single();

  if (error) return null;
  return { shortCode: data.short_code, url: `https://ivxholding.com/invest/${data.short_code}` };
}
