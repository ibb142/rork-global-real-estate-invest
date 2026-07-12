/**
 * IVX Reels — full-screen vertical video feed matching ivxholding.com.
 *
 * Same backend the landing page uses:
 *   feed      → GET /api/ivx/video-platform/feed
 *   download  → GET /api/ivx/videos/:id/download
 *   engagement → /api/projects/:id/like, /api/projects/:id/save, /share
 *   platform  → /api/ivx/video-platform/follow, /report, /events
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
  Alert,
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
  Bookmark,
  MoreHorizontal,
  Plus,
  Hexagon,
  Users,
  Home,
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
import {
  CHANNELS,
  type VideoChannel,
  toggleVideoSave,
  toggleVideoFollow,
  reportVideo,
  trackVideoEvent,
  getViewerId,
  buildVideoShareUrl,
} from '@/lib/video-platform';
import ProjectCommentsSheet from '@/components/ProjectCommentsSheet';
import ProjectShareSheet from '@/components/ProjectShareSheet';
import { supabase } from '@/lib/supabase';

const GOLD = '#FFD700';

interface EngagementState {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function compactCurrency(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${Math.round(value)}`;
}

function useInvestmentOptions(dealType: string | null | undefined) {
  const t = (dealType ?? '').toLowerCase();
  const tokenized = { id: 'tokenized', label: 'Tokenized', icon: <Hexagon size={18} color={GOLD} />, tint: GOLD };
  const jvDeals = { id: 'jvDeals', label: 'JV Deal', icon: <Users size={18} color='#448AFF' />, tint: '#448AFF' };
  const buyers = { id: 'buyers', label: 'Buyer', icon: <Home size={18} color='#00C48C' />, tint: '#00C48C' };
  switch (t) {
    case 'jv':
    case 'equity_split':
    case 'hybrid':
      return [tokenized, jvDeals, buyers];
    case 'development':
    case 'new_construction':
    case 'rehab_construction':
      return [jvDeals, tokenized, buyers];
    case 'profit_sharing':
      return [tokenized, buyers, jvDeals];
    default:
      return [jvDeals, tokenized, buyers];
  }
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
  onDoubleTapLike: (video: FeedVideo) => void;
  onComment: (video: FeedVideo) => void;
  onShare: (video: FeedVideo) => void;
  onDownload: (video: FeedVideo) => void;
  onSave: (video: FeedVideo) => void;
  onFollow: (video: FeedVideo) => void;
  onReport: (video: FeedVideo) => void;
  onViewDeal: (video: FeedVideo) => void;
  onInvestNow: (video: FeedVideo) => void;
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
  onDoubleTapLike,
  onComment,
  onShare,
  onDownload,
  onSave,
  onFollow,
  onReport,
  onViewDeal,
  onInvestNow,
}: FeedItemProps) {
  const [paused, setPaused] = useState<boolean>(false);
  const [showHeart, setShowHeart] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const insets = useSafeAreaInsets();
  const lastTapRef = useRef<number>(0);
  const shouldPlay = isActive && !paused;

  const deal = video.deal ?? null;
  const investmentOptions = useInvestmentOptions(deal?.deal_type);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
      onDoubleTapLike(video);
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current === now) {
          setPaused(p => !p);
        }
      }, 330);
    }
  };

  return (
    <View style={[styles.item, { height }]}>
      <TouchableOpacity
        style={styles.videoTouch}
        activeOpacity={1}
        onPress={handleTap}
        testID={`video-item-${video.id}`}
      >
        <Video
          source={{ uri: video.hls_url ?? video.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={shouldPlay}
          isLooping
          isMuted={muted}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.durationMillis) {
              setProgress(status.positionMillis / status.durationMillis);
            }
          }}
          posterSource={
            video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url
              ? { uri: (video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url) as string }
              : undefined
          }
          usePoster={!!(video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url)}
        />
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {!shouldPlay && (
        <View pointerEvents="none" style={styles.centerPlay}>
          <View style={styles.centerPlayCircle}>
            <Play size={30} color="#000" fill="#000" />
          </View>
        </View>
      )}

      {showHeart && (
        <View pointerEvents="none" style={styles.burstHeart}>
          <Heart size={96} color="#FF3B5C" fill="#FF3B5C" />
        </View>
      )}

      {/* Top filter strip placeholder — rendered at screen level */}
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
          onPress={() => onSave(video)}
          testID={`video-save-${video.id}`}
        >
          <Bookmark
            size={30}
            color={engagement.saved ? GOLD : '#fff'}
            fill={engagement.saved ? GOLD : 'transparent'}
          />
          <Text style={styles.railCount}>{formatCount(engagement.saveCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onFollow(video)}
          testID={`video-follow-${video.id}`}
        >
          <Text style={[styles.followBtn, engagement.following && styles.followBtnActive]}>
            {engagement.following ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onReport(video)}
          testID={`video-report-${video.id}`}
        >
          <MoreHorizontal size={30} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.railBtn} onPress={onToggleMute} testID={`video-mute-${video.id}`}>
          {muted ? <VolumeX size={26} color="#fff" /> : <Volume2 size={26} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View pointerEvents="none" style={[styles.info, { bottom: insets.bottom + 32 }]}>
        <View style={styles.badgeRow}>
          {video.is_pinned && <Text style={styles.badge}>FEATURED</Text>}
          {video.video_type === 'reel' && <Text style={[styles.badge, styles.badgeReel]}>PROJECT REEL</Text>}
          {deal && <Text style={[styles.badge, styles.badgeInvestment]}>INVESTMENT</Text>}
        </View>
        <Text style={styles.infoTitle} numberOfLines={2}>
          {video.title || 'IVX Holdings'}
        </Text>
        {deal?.title && (
          <Text style={styles.infoSubtitle} numberOfLines={1}>
            {deal.title}
          </Text>
        )}
        <View style={styles.metricRow}>
          {deal?.expected_roi ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{deal.expected_roi}%</Text>
              <Text style={styles.metricLabel}>ROI</Text>
            </View>
          ) : null}
          {deal?.min_investment && deal.min_investment > 0 ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{compactCurrency(deal.min_investment)}</Text>
              <Text style={styles.metricLabel}>MIN INVEST</Text>
            </View>
          ) : null}
          {deal?.price && deal.price > 0 ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{compactCurrency(deal.price)}</Text>
              <Text style={styles.metricLabel}>VALUE</Text>
            </View>
          ) : null}
        </View>

        {/* Investment options */}
        <View style={styles.optionsRow} pointerEvents="box-none">
          {investmentOptions.map((option) => (
            <View key={option.id} style={styles.optionIcon}>
              <View style={[styles.optionIconCircle, { borderColor: `${option.tint}66` }]}>
                {option.icon}
              </View>
              <Text style={styles.optionIconLabel}>{option.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA buttons (must be tappable, not pointer-events-none) */}
      <View style={[styles.ctaRow, { bottom: insets.bottom + 32 }]}>
        {deal?.url ? (
          <TouchableOpacity
            style={styles.viewDealBtn}
            onPress={() => onViewDeal(video)}
            activeOpacity={0.85}
            testID={`video-view-deal-${video.id}`}
          >
            <Text style={styles.viewDealText}>View Deal</Text>
          </TouchableOpacity>
        ) : null}
        {deal?.id ? (
          <TouchableOpacity
            style={styles.investNowBtn}
            onPress={() => onInvestNow(video)}
            activeOpacity={0.85}
            testID={`video-invest-${video.id}`}
          >
            <Text style={styles.investNowText}>Invest Now</Text>
          </TouchableOpacity>
        ) : null}
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
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<Record<string, EngagementState>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [channel, setChannel] = useState<VideoChannel>(isReelsMode ? 'reel' : 'all');

  // Sheets
  const [commentsVideo, setCommentsVideo] = useState<FeedVideo | null>(null);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState<number>(0);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [shareVideo, setShareVideo] = useState<FeedVideo | null>(null);

  const feedQuery = useQuery({
    queryKey: isReelsMode ? ['ivx-project-reels'] : ['ivx-video-feed', channel],
    queryFn: () => (isReelsMode ? fetchProjectReels(24) : fetchVideoFeed(24)),
    staleTime: 60_000,
  });

  const videos: FeedVideo[] = useMemo(() => feedQuery.data ?? [], [feedQuery.data]);

  useEffect(() => {
    let cancelled = false;
    void getViewerId().then((id) => {
      if (!cancelled) setViewerId(id);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.user?.id) setUserId(data.session.user.id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Seed engagement counts from feed + track active video view
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
            saveCount: v.save_count ?? 0,
            liked: false,
            saved: false,
            following: false,
          };
        }
      }
      return next;
    });
  }, [videos]);

  useEffect(() => {
    const activeVideo = videos[activeIndex];
    if (!activeVideo) return;
    void trackVideoEvent('view', activeVideo.id);
  }, [activeIndex, videos]);

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
    setEngagements(prev => {
      const cur = prev[video.id] ?? { likeCount: video.like_count, commentCount: video.comment_count, shareCount: video.share_count, saveCount: video.save_count ?? 0, liked: false, saved: false, following: false };
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

  const handleDoubleTapLike = useCallback((video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void trackVideoEvent('double_tap_like', video.id);
    const cur = engagements[video.id];
    if (!cur || !cur.liked) {
      void handleLike(video);
    }
  }, [engagements, handleLike]);

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

  const handleSave = useCallback(async (video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEngagements(prev => {
      const cur = prev[video.id] ?? { likeCount: video.like_count, commentCount: video.comment_count, shareCount: video.share_count, saveCount: video.save_count ?? 0, liked: false, saved: false, following: false };
      return { ...prev, [video.id]: { ...cur, saved: !cur.saved, saveCount: cur.saveCount + (cur.saved ? -1 : 1) } };
    });
    try {
      const result = await toggleVideoSave(video.id, viewerId);
      setEngagements(prev => ({
        ...prev,
        [video.id]: { ...(prev[video.id] as EngagementState), saved: result.saved, saveCount: result.saveCount },
      }));
      showToast(result.saved ? 'Saved' : 'Removed from saved');
    } catch {}
  }, [viewerId, showToast]);

  const handleFollow = useCallback(async (video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await toggleVideoFollow(video.creator_id ?? 'ivx-owner', viewerId);
      setEngagements(prev => {
        const cur = prev[video.id] ?? { likeCount: video.like_count, commentCount: video.comment_count, shareCount: video.share_count, saveCount: video.save_count ?? 0, liked: false, saved: false, following: false };
        return { ...prev, [video.id]: { ...cur, following: result.following } };
      });
      showToast(result.following ? 'Following creator' : 'Unfollowed');
    } catch {}
  }, [viewerId, showToast]);

  const handleReport = useCallback((video: FeedVideo) => {
    Alert.prompt('Report this video', 'Reason:', async (reason) => {
      if (!reason) return;
      const result = await reportVideo(video.id, reason, viewerId);
      showToast(result.ok ? 'Report submitted to moderation' : 'Report failed');
    });
  }, [viewerId, showToast]);

  const handleViewDeal = useCallback((video: FeedVideo) => {
    const dealId = video.deal?.id;
    if (dealId) {
      router.push({ pathname: '/jv-invest', params: { jvId: dealId } } as any);
    }
  }, [router]);

  const handleInvestNow = useCallback((video: FeedVideo) => {
    const dealId = video.deal?.id;
    if (dealId) {
      router.push({ pathname: '/jv-invest', params: { jvId: dealId } } as any);
    }
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: FeedVideo; index: number }) => (
    <FeedItem
      video={item}
      isActive={index === activeIndex}
      height={windowHeight}
      muted={muted}
      engagement={engagements[item.id] ?? { likeCount: item.like_count, commentCount: item.comment_count, shareCount: item.share_count, saveCount: item.save_count ?? 0, liked: false, saved: false, following: false }}
      downloading={downloadingId === item.id}
      onToggleMute={() => setMuted(prev => !prev)}
      onLike={handleLike}
      onDoubleTapLike={handleDoubleTapLike}
      onComment={handleComment}
      onShare={handleShare}
      onDownload={handleDownload}
      onSave={handleSave}
      onFollow={handleFollow}
      onReport={handleReport}
      onViewDeal={handleViewDeal}
      onInvestNow={handleInvestNow}
    />
  ), [activeIndex, windowHeight, muted, engagements, downloadingId, handleLike, handleDoubleTapLike, handleComment, handleShare, handleDownload, handleSave, handleFollow, handleReport, handleViewDeal, handleInvestNow]);

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

      {/* Channel filter chips */}
      {!isReelsMode && (
        <View style={[styles.filterStrip, { top: insets.top + 52 }]}>
          {CHANNELS.map((ch) => {
            const active = channel === ch.id;
            return (
              <TouchableOpacity
                key={ch.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setChannel(ch.id)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {ch.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View pointerEvents="none" style={[styles.headerTitleWrap, { top: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>{isReelsMode ? 'Project Reels' : 'IVX Reels'}</Text>
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
          projectUrl={buildVideoShareUrl(shareVideo.id)}
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
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 21,
  },
  progressFill: {
    height: '100%',
    backgroundColor: GOLD,
  },
  burstHeart: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -48,
    marginTop: -48,
    zIndex: 25,
  },
  rail: {
    position: 'absolute',
    right: 10,
    alignItems: 'center',
    gap: 16,
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
  followBtn: {
    backgroundColor: GOLD,
    color: '#000',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '700' as const,
    overflow: 'hidden' as const,
  },
  followBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
  },
  info: {
    position: 'absolute',
    left: 16,
    right: 90,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: 'rgba(218,165,32,0.9)',
    color: '#000',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  badgeReel: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    color: '#fff',
  },
  badgeInvestment: {
    backgroundColor: GOLD,
    color: '#000',
  },
  infoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800' as const,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  infoSubtitle: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '800' as const,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metricLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600' as const,
    opacity: 0.9,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  optionIcon: {
    alignItems: 'center',
    gap: 4,
  },
  optionIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  optionIconLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600' as const,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaRow: {
    position: 'absolute',
    left: 16,
    right: 90,
    flexDirection: 'row',
    gap: 10,
  },
  viewDealBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: GOLD,
  },
  viewDealText: {
    color: GOLD,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  investNowBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 12,
  },
  investNowText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  centerText: {
    color: '#aaa',
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center' as const,
    paddingHorizontal: 32,
  },
  centerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700' as const,
  },
  retryBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryBtnText: {
    color: '#000',
    fontWeight: '700' as const,
  },
  backBtn: {
    position: 'absolute',
    left: 12,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  filterStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 26,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  filterChip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: GOLD,
  },
  filterChipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  filterChipTextActive: {
    color: '#000',
  },
  toast: {
    position: 'absolute',
    left: '50%',
    bottom: 100,
    transform: [{ translateX: -50 }],
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 60,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
});
