/**
 * IVX Reels — full-screen vertical video feed matching ivxholding.com exactly.
 *
 * Same backend the landing page uses:
 *   feed      → GET /api/ivx/video-platform/feed
 *   like      → POST /api/projects/:id/like
 *   save      → POST /api/projects/:id/save
 *   share     → POST /api/projects/:id/share
 *   follow    → POST /api/ivx/video-platform/follow
 *   report    → POST /api/ivx/video-platform/videos/:id/report
 *   comments  → GET/POST /api/projects/:id/comments
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
  X,
  Heart,
  MessageCircle,
  Share2,
  Volume2,
  VolumeX,
  Play,
  Bookmark,
  MoreHorizontal,
  Hexagon,
  Users,
  Home,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';

import Colors from '@/constants/colors';
import { fetchVideoFeed, fetchProjectReels, type FeedVideo } from '@/lib/video-feed';
import {
  toggleProjectLike,
  trackProjectShare,
  fetchProjectComments,
  addProjectComment,
  deleteProjectComment,
  type ProjectComment,
} from '@/lib/project-engagement';
import {
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

const GOLD = Colors.primary;
const LIKE_RED = Colors.error;

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
  const tokenized = { id: 'tokenized', label: 'Tokenized', icon: <Hexagon size={16} color={GOLD} />, tint: GOLD };
  const jvDeals = { id: 'jvDeals', label: 'JV Deal', icon: <Users size={16} color={Colors.blue} />, tint: Colors.blue };
  const buyers = { id: 'buyers', label: 'Buyer', icon: <Home size={16} color={Colors.green} />, tint: Colors.green };
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
      return [tokenized, jvDeals, buyers];
  }
}

type ReelChannel = 'all' | 'investment' | 'buyer' | 'seller';

const CHANNELS: { id: ReelChannel; label: string }[] = [
  { id: 'all', label: 'Deals' },
  { id: 'investment', label: 'Investments' },
  { id: 'buyer', label: 'Buyers' },
  { id: 'seller', label: 'Sellers' },
];

interface FeedItemProps {
  video: FeedVideo;
  isActive: boolean;
  height: number;
  muted: boolean;
  engagement: EngagementState;
  onToggleMute: () => void;
  onLike: (video: FeedVideo) => void;
  onDoubleTapLike: (video: FeedVideo) => void;
  onComment: (video: FeedVideo) => void;
  onShare: (video: FeedVideo) => void;
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
  onToggleMute,
  onLike,
  onDoubleTapLike,
  onComment,
  onShare,
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

  const badges: string[] = [];
  if (video.is_featured) badges.push('FEATURED');
  if (video.video_type === 'reel') badges.push('PROJECT REEL');
  if (deal) badges.push('INVESTMENT');

  return (
    <View style={[styles.item, { height }]}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
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
          <Heart size={96} color={LIKE_RED} fill={LIKE_RED} />
        </View>
      )}

      {/* Right action rail */}
      <View style={[styles.rail, { bottom: insets.bottom + 96 }]}>
        <TouchableOpacity
          style={styles.railBtn}
          onPress={() => onLike(video)}
          testID={`video-like-${video.id}`}
        >
          <Heart
            size={30}
            color={engagement.liked ? LIKE_RED : '#fff'}
            fill={engagement.liked ? LIKE_RED : 'transparent'}
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
          {badges.map((b) => (
            <Text
              key={b}
              style={[
                styles.badge,
                b === 'FEATURED' && styles.badgeGold,
                b === 'PROJECT REEL' && styles.badgeReel,
                b === 'INVESTMENT' && styles.badgeInvestment,
              ]}
            >
              {b}
            </Text>
          ))}
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
              <Text style={styles.metricValue}>{((deal.min_investment ?? 0) / deal.price * 100).toFixed(4)}%</Text>
              <Text style={styles.metricLabel}>MIN OWNERSHIP</Text>
            </View>
          ) : null}
        </View>

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

      {/* CTA buttons */}
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
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<Record<string, EngagementState>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [channel, setChannel] = useState<ReelChannel>('all');

  const [commentsVideo, setCommentsVideo] = useState<FeedVideo | null>(null);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState<number>(0);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [shareVideo, setShareVideo] = useState<FeedVideo | null>(null);

  const feedQuery = useQuery({
    queryKey: ['ivx-video-feed'],
    queryFn: () => fetchVideoFeed(24),
    staleTime: 60_000,
  });

  const allVideos: FeedVideo[] = useMemo(() => feedQuery.data ?? [], [feedQuery.data]);

  const filteredVideos = useMemo(() => {
    if (channel === 'all') return allVideos;
    if (channel === 'investment') return allVideos.filter(v => v.deal && v.video_type !== 'reel');
    if (channel === 'buyer') {
      return allVideos.filter(
        v =>
          (v.deal?.deal_type ?? '').toLowerCase().includes('buy') ||
          v.title?.toLowerCase().includes('buy') ||
          v.title?.toLowerCase().includes('buyer')
      );
    }
    if (channel === 'seller') {
      return allVideos.filter(
        v =>
          (v.deal?.deal_type ?? '').toLowerCase().includes('sell') ||
          v.title?.toLowerCase().includes('sell') ||
          v.title?.toLowerCase().includes('seller')
      );
    }
    return allVideos;
  }, [allVideos, channel]);

  const counts = useMemo(() => {
    const all = allVideos.length;
    const investment = allVideos.filter(v => v.deal && v.video_type !== 'reel').length;
    const buyer = allVideos.filter(
      v =>
        (v.deal?.deal_type ?? '').toLowerCase().includes('buy') ||
        v.title?.toLowerCase().includes('buy') ||
        v.title?.toLowerCase().includes('buyer')
    ).length;
    const seller = allVideos.filter(
      v =>
        (v.deal?.deal_type ?? '').toLowerCase().includes('sell') ||
        v.title?.toLowerCase().includes('sell') ||
        v.title?.toLowerCase().includes('seller')
    ).length;
    return { all, investment, buyer, seller };
  }, [allVideos]);

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

  useEffect(() => {
    if (allVideos.length === 0) return;
    setEngagements(prev => {
      const next = { ...prev };
      for (const v of allVideos) {
        if (!next[v.id]) {
          next[v.id] = {
            likeCount: v.like_count ?? 0,
            commentCount: v.comment_count ?? 0,
            shareCount: v.share_count ?? 0,
            saveCount: v.save_count ?? 0,
            liked: false,
            saved: false,
            following: false,
          };
        }
      }
      return next;
    });
  }, [allVideos]);

  useEffect(() => {
    const activeVideo = filteredVideos[activeIndex];
    if (!activeVideo) return;
    void trackVideoEvent('view', activeVideo.id);
  }, [activeIndex, filteredVideos]);

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
      const cur = prev[video.id] ?? { likeCount: video.like_count ?? 0, commentCount: video.comment_count ?? 0, shareCount: video.share_count ?? 0, saveCount: video.save_count ?? 0, liked: false, saved: false, following: false };
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

  const handleSave = useCallback(async (video: FeedVideo) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEngagements(prev => {
      const cur = prev[video.id] ?? { likeCount: video.like_count ?? 0, commentCount: video.comment_count ?? 0, shareCount: video.share_count ?? 0, saveCount: video.save_count ?? 0, liked: false, saved: false, following: false };
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
    const creatorId = video.creator_id ?? 'ivx-owner';
    setEngagements(prev => {
      const cur = prev[video.id] ?? { likeCount: video.like_count ?? 0, commentCount: video.comment_count ?? 0, shareCount: video.share_count ?? 0, saveCount: video.save_count ?? 0, liked: false, saved: false, following: false };
      return { ...prev, [video.id]: { ...cur, following: !cur.following } };
    });
    try {
      const result = await toggleVideoFollow(creatorId, viewerId);
      setEngagements(prev => ({
        ...prev,
        [video.id]: { ...(prev[video.id] as EngagementState), following: result.following },
      }));
      showToast(result.following ? 'Following creator' : 'Unfollowed');
    } catch {}
  }, [viewerId, showToast]);

  const handleReport = useCallback((video: FeedVideo) => {
    if (Platform.OS === 'web') {
      const reason = window.prompt('Report this video — reason:');
      if (!reason) return;
      void reportVideo(video.id, reason, viewerId).then(() => showToast('Report submitted to moderation')).catch(() => showToast('Report failed'));
      return;
    }
    Alert.prompt('Report this video', 'Reason:', async (reason) => {
      if (!reason) return;
      try {
        await reportVideo(video.id, reason, viewerId);
        showToast('Report submitted to moderation');
      } catch {
        showToast('Report failed');
      }
    });
  }, [viewerId, showToast]);

  const handleViewDeal = useCallback((video: FeedVideo) => {
    if (video.deal?.url) {
      router.push(video.deal.url as any);
    } else if (video.deal?.id) {
      router.push({ pathname: '/jv-invest', params: { jvId: video.deal.id } } as any);
    }
  }, [router]);

  const handleInvestNow = useCallback((video: FeedVideo) => {
    if (video.deal?.id) {
      router.push({ pathname: '/jv-invest', params: { jvId: video.deal.id } } as any);
    }
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: FeedVideo; index: number }) => (
      <FeedItem
        video={item}
        isActive={index === activeIndex}
        height={windowHeight}
        muted={muted}
        engagement={engagements[item.id] ?? {
          likeCount: item.like_count ?? 0,
          commentCount: item.comment_count ?? 0,
          shareCount: item.share_count ?? 0,
          saveCount: item.save_count ?? 0,
          liked: false,
          saved: false,
          following: false,
        }}
        onToggleMute={() => setMuted(m => !m)}
        onLike={handleLike}
        onDoubleTapLike={handleDoubleTapLike}
        onComment={handleComment}
        onShare={handleShare}
        onSave={handleSave}
        onFollow={handleFollow}
        onReport={handleReport}
        onViewDeal={handleViewDeal}
        onInvestNow={handleInvestNow}
      />
    ),
    [activeIndex, windowHeight, muted, engagements, handleLike, handleDoubleTapLike, handleComment, handleShare, handleSave, handleFollow, handleReport, handleViewDeal, handleInvestNow]
  );

  const itemHeight = windowHeight;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} testID="reels-close">
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.tabs}>
            {CHANNELS.map((ch) => (
              <TouchableOpacity
                key={ch.id}
                style={[styles.tab, channel === ch.id && styles.tabActive]}
                onPress={() => setChannel(ch.id)}
                testID={`reels-channel-${ch.id}`}
              >
                <Text style={[styles.tabText, channel === ch.id && styles.tabTextActive]}>
                  {ch.label} {counts[ch.id] > 0 ? counts[ch.id] : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {feedQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <FlatList
          data={filteredVideos}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={itemHeight}
          snapToAlignment="start"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews
          getItemLayout={(_data, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
          contentContainerStyle={{ paddingTop: 0 }}
        />
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {commentsVideo && (
        <ProjectCommentsSheet
          visible={commentsVideo !== null}
          projectId={commentsVideo.id}
          comments={comments}
          totalComments={commentsTotal}
          isLoading={commentsLoading}
          onClose={() => setCommentsVideo(null)}
          onAddComment={handleAddComment}
          onDeleteComment={handleDeleteComment}
        />
      )}

      {shareVideo && (
        <ProjectShareSheet
          visible={shareVideo !== null}
          projectId={shareVideo.id}
          projectTitle={shareVideo.title ?? 'IVX Property'}
          projectUrl={buildVideoShareUrl(shareVideo.id)}
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
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
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
  centerPlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
  },
  centerPlayCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstHeart: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -48,
    marginTop: -48,
    zIndex: 26,
  },
  rail: {
    position: 'absolute',
    right: 8,
    zIndex: 20,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  railBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  railCount: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  followBtn: {
    backgroundColor: GOLD,
    color: '#000',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  followBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
  },
  info: {
    position: 'absolute',
    left: 14,
    right: 84,
    zIndex: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  badge: {
    backgroundColor: 'rgba(218,165,32,0.9)',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 7,
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  badgeGold: {
    backgroundColor: GOLD,
  },
  badgeReel: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    color: '#fff',
  },
  badgeInvestment: {
    backgroundColor: 'rgba(0,196,140,0.85)',
    color: '#000',
  },
  infoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  infoSubtitle: {
    color: '#fff',
    fontSize: 12.5,
    opacity: 0.9,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  metric: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 80,
  },
  metricValue: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 5,
    textTransform: 'uppercase' as const,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
  },
  optionIcon: {
    alignItems: 'center',
  },
  optionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  optionIconLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 22,
    flexDirection: 'row',
    gap: 10,
  },
  viewDealBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewDealText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '700',
  },
  investNowBtn: {
    flex: 1,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  investNowText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
  },
  toastText: {
    backgroundColor: 'rgba(20,20,20,0.92)',
    color: '#fff',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    fontSize: 13,
    fontWeight: '600',
  },
});
