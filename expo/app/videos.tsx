/**
 * IVX Videos — full-screen Instagram Reels-style vertical video feed.
 *
 * Same backend the landing page uses:
 *   feed      → GET /api/ivx/videos/feed
 *   download  → GET /api/ivx/videos/:id/download (source-quality MP4)
 * Likes / comments / shares reuse the project_* engagement tables keyed
 * by the video id, identical to the landing page behaviour.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  type ViewToken,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Share2,
  Download,
  Volume2,
  VolumeX,
  Play,
  RefreshCw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';

import { fetchVideoFeed, fetchProjectReels, downloadFeedVideo, type FeedVideo } from '@/lib/video-feed';
import {
  toggleProjectLike,
  trackProjectShare,
  fetchProjectComments,
  addProjectComment,
  deleteProjectComment,
  type ProjectComment,
} from '@/lib/project-engagement';
import ProjectCommentsSheet from '@/components/ProjectCommentsSheet';
import ProjectShareSheet from '@/components/ProjectShareSheet';
import { supabase } from '@/lib/supabase';

const GOLD = '#FFD700';

interface EngagementState {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  liked: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

interface FeedItemProps {
  video: FeedVideo;
  isActive: boolean;
  height: number;
  muted: boolean;
  engagement: EngagementState;
  downloading: boolean;
  onToggleMute: () => void;
  onLike: (video: FeedVideo) => void;
  onComment: (video: FeedVideo) => void;
  onShare: (video: FeedVideo) => void;
  onDownload: (video: FeedVideo) => void;
}

const FeedItem = React.memo(function FeedItem({
  video,
  isActive,
  height,
  muted,
  engagement,
  downloading,
  onToggleMute,
  onLike,
  onComment,
  onShare,
  onDownload,
}: FeedItemProps) {
  const [paused, setPaused] = useState<boolean>(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isActive) setPaused(false);
  }, [isActive]);

  const shouldPlay = isActive && !paused;

  return (
    <View style={[styles.item, { height }]}>
      <TouchableOpacity
        style={styles.videoTouch}
        activeOpacity={1}
        onPress={() => setPaused(prev => !prev)}
        testID={`video-item-${video.id}`}
      >
        <Video
          source={{ uri: video.hls_url ?? video.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={shouldPlay}
          isLooping
          isMuted={muted}
          posterSource={
            video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url
              ? { uri: (video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url) as string }
              : undefined
          }
          usePoster={!!(video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url)}
        />
      </TouchableOpacity>

      {!shouldPlay && (
        <View pointerEvents="none" style={styles.centerPlay}>
          <View style={styles.centerPlayCircle}>
            <Play size={30} color="#000" fill="#000" />
          </View>
        </View>
      )}

      {/* Right action rail — Instagram style */}
      <View style={[styles.rail, { bottom: insets.bottom + 96 }]}>
        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onLike(video)}
          testID={`video-like-${video.id}`}
        >
          <Heart
            size={30}
            color={engagement.liked ? '#FF3B5C' : '#fff'}
            fill={engagement.liked ? '#FF3B5C' : 'transparent'}
          />
          <Text style={styles.railCount}>{formatCount(engagement.likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onComment(video)}
          testID={`video-comment-${video.id}`}
        >
          <MessageCircle size={30} color="#fff" />
          <Text style={styles.railCount}>{formatCount(engagement.commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onShare(video)}
          testID={`video-share-${video.id}`}
        >
          <Share2 size={30} color="#fff" />
          <Text style={styles.railCount}>{formatCount(engagement.shareCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onDownload(video)}
          disabled={downloading}
          testID={`video-download-${video.id}`}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={GOLD} />
          ) : (
            <Download size={30} color="#fff" />
          )}
          <Text style={styles.railCount}>HD</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.railBtn} onPress={onToggleMute} testID={`video-mute-${video.id}`}>
          {muted ? <VolumeX size={26} color="#fff" /> : <Volume2 size={26} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View pointerEvents="none" style={[styles.info, { bottom: insets.bottom + 32 }]}>
        {video.is_pinned && (
          <View style={styles.pinnedBadge}>
            <Text style={styles.pinnedBadgeText}>FEATURED</Text>
          </View>
        )}
        <Text style={styles.infoTitle} numberOfLines={2}>
          {video.title || 'IVX Holdings'}
        </Text>
        {video.duration_sec > 0 && (
          <Text style={styles.infoMeta}>
            {Math.floor(video.duration_sec / 60)}:{String(Math.floor(video.duration_sec % 60)).padStart(2, '0')}
          </Text>
        )}
      </View>
    </View>
  );
});

export default function VideosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ type?: string }>();
  const isReelsMode = params.type === 'reel';

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<Record<string, EngagementState>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Sheets
  const [commentsVideo, setCommentsVideo] = useState<FeedVideo | null>(null);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState<number>(0);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [shareVideo, setShareVideo] = useState<FeedVideo | null>(null);

  const feedQuery = useQuery({
    queryKey: isReelsMode ? ['ivx-project-reels'] : ['ivx-video-feed'],
    queryFn: () => (isReelsMode ? fetchProjectReels(24) : fetchVideoFeed(24)),
    staleTime: 60_000,
  });

  const videos: FeedVideo[] = useMemo(() => feedQuery.data ?? [], [feedQuery.data]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.user?.id) setUserId(data.session.user.id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Seed engagement counts from feed
  useEffect(() => {
    if (videos.length === 0) return;
    setEngagements(prev => {
      const next = { ...prev };
      for (const v of videos) {
        if (!next[v.id]) {
          next[v.id] = {
            likeCount: v.like_count,
            commentCount: v.comment_count,
            shareCount: v.share_count,
            liked: false,
          };
        }
      }
      return next;
    });
  }, [videos]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find(v => v.isViewable);
    if (first && typeof first.index === 'number') setActiveIndex(first.index);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const handleLike = useCallback(async (video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic flip
    setEngagements(prev => {
      const cur = prev[video.id] ?? { likeCount: video.like_count, commentCount: video.comment_count, shareCount: video.share_count, liked: false };
      return {
        ...prev,
        [video.id]: { ...cur, liked: !cur.liked, likeCount: cur.likeCount + (cur.liked ? -1 : 1) },
      };
    });
    try {
      const result = await toggleProjectLike(video.id, userId);
      setEngagements(prev => ({
        ...prev,
        [video.id]: { ...(prev[video.id] as EngagementState), liked: result.liked, likeCount: result.likeCount },
      }));
    } catch {}
  }, [userId]);

  const handleComment = useCallback(async (video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCommentsLoading(true);
    setCommentsVideo(video);
    try {
      const { comments: cmts, total } = await fetchProjectComments(video.id, 20, 0);
      setComments(cmts);
      setCommentsTotal(total);
    } catch {} finally {
      setCommentsLoading(false);
    }
  }, []);

  const handleAddComment = useCallback(async (projectId: string, body: string, parentId?: string) => {
    try {
      await addProjectComment(projectId, body, userId, undefined, parentId);
      const { comments: cmts, total } = await fetchProjectComments(projectId, 20, 0);
      setComments(cmts);
      setCommentsTotal(total);
      setEngagements(prev => {
        const cur = prev[projectId];
        return cur ? { ...prev, [projectId]: { ...cur, commentCount: total } } : prev;
      });
    } catch {}
  }, [userId]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!commentsVideo) return;
    try {
      await deleteProjectComment(commentId);
      const { comments: cmts, total } = await fetchProjectComments(commentsVideo.id, 20, 0);
      setComments(cmts);
      setCommentsTotal(total);
    } catch {}
  }, [commentsVideo]);

  const handleShare = useCallback((video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShareVideo(video);
  }, []);

  const handleShareTrack = useCallback(async (projectId: string, shareType: string) => {
    try {
      const result = await trackProjectShare(projectId, shareType as never, userId);
      setEngagements(prev => {
        const cur = prev[projectId];
        return cur ? { ...prev, [projectId]: { ...cur, shareCount: result.shareCount } } : prev;
      });
    } catch {}
  }, [userId]);

  const handleDownload = useCallback(async (video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDownloadingId(video.id);
    try {
      const result = await downloadFeedVideo(video.id, video.title);
      if (result.success) {
        showToast(Platform.OS === 'web' ? 'Download started' : 'Video ready — choose where to save');
      } else {
        showToast(result.error || 'Download failed');
      }
    } finally {
      setDownloadingId(null);
    }
  }, [showToast]);

  const renderItem = useCallback(({ item, index }: { item: FeedVideo; index: number }) => (
    <FeedItem
      video={item}
      isActive={index === activeIndex}
      height={windowHeight}
      muted={muted}
      engagement={engagements[item.id] ?? { likeCount: item.like_count, commentCount: item.comment_count, shareCount: item.share_count, liked: false }}
      downloading={downloadingId === item.id}
      onToggleMute={() => setMuted(prev => !prev)}
      onLike={handleLike}
      onComment={handleComment}
      onShare={handleShare}
      onDownload={handleDownload}
    />
  ), [activeIndex, windowHeight, muted, engagements, downloadingId, handleLike, handleComment, handleShare, handleDownload]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {feedQuery.isLoading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.centerText}>Loading videos…</Text>
        </View>
      ) : feedQuery.isError ? (
        <View style={styles.centerFill}>
          <Text style={styles.centerText}>Could not load the {isReelsMode ? 'project reels' : 'video feed'}.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => feedQuery.refetch()} testID="videos-retry">
            <RefreshCw size={16} color="#000" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.centerTitle}>No reels yet</Text>
          <Text style={styles.centerText}>New construction & progress reels will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v: FeedVideo) => v.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={windowHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: windowHeight, offset: windowHeight * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/landing' as never))}
        testID="videos-back"
      >
        <ArrowLeft size={22} color="#fff" />
      </TouchableOpacity>

      <View pointerEvents="none" style={[styles.headerTitleWrap, { top: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>{isReelsMode ? 'Project Reels' : 'IVX Videos'}</Text>
      </View>

      {toast && (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {commentsVideo && (
        <ProjectCommentsSheet
          projectId={commentsVideo.id}
          visible={!!commentsVideo}
          onClose={() => setCommentsVideo(null)}
          comments={comments}
          isLoading={commentsLoading}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
          totalComments={commentsTotal}
        />
      )}

      {shareVideo && (
        <ProjectShareSheet
          projectId={shareVideo.id}
          projectTitle={shareVideo.title || 'IVX Holdings video'}
          projectUrl={`https://ivxholding.com/?video=${shareVideo.id}`}
          visible={!!shareVideo}
          onClose={() => setShareVideo(null)}
          onShareTrack={handleShareTrack}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  item: {
    width: '100%',
    backgroundColor: '#000',
  },
  videoTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  centerPlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  rail: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 18,
  },
  railBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  railCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700' as const,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  info: {
    position: 'absolute',
    left: 16,
    right: 80,
  },
  pinnedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  pinnedBadgeText: {
    color: GOLD,
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800' as const,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  infoMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 4,
  },
  backBtn: {
    position: 'absolute',
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  centerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800' as const,
  },
  centerText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
});
