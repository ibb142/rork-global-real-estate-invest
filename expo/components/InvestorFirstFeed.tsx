/**
 * Investor-first home feed — mixed layout per approved P0 design:
 *   3 regular investment cards (compact, horizontal gallery, metrics)
 *   followed by 1 featured project video reel.
 *
 * Regular cards use TrustDealCard. Reels use CanonicalInvestmentReelCard.
 * This is the Main/Home module, not the Reels module.
 */
import React, { Component, useCallback, useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Landmark, Sparkles, TrendingUp } from 'lucide-react-native';
import Colors from '@/constants/colors';
import CanonicalInvestmentReelCard, {
  feedVideoToReelData,
  type CanonicalReelData,
} from '@/components/CanonicalInvestmentReelCard';
import TrustDealCard from '@/components/TrustDealCard';
import { fetchHomeFeed, type HomeFeedBlock, type HomeFeedDeal, type FeedVideo } from '@/lib/video-feed';
import { parseDeal } from '@/lib/parse-deal';
import type { ParsedJVDeal } from '@/lib/parse-deal';
import type { JVAgreement } from '@/types/jv';
import { toggleProjectLike, trackProjectShare } from '@/lib/project-engagement';
import { toggleVideoSave, getViewerId, buildVideoShareUrl } from '@/lib/video-platform';
import { CANONICAL_MIN_INVESTMENT } from '@/lib/published-deal-card-model';
import { supabase } from '@/lib/supabase';

/** Per-card error boundary so one bad reel never crashes the home feed */
class VideoCardBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.warn('[InvestorFirstFeed] Card crashed:', err.message); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Content temporarily unavailable</Text>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

export default function InvestorFirstFeed({ jvDeals, jvDealsLoading, isXs, cardWidth, openQuickBuy }: {
  jvDeals: JVAgreement[];
  jvDealsLoading: boolean;
  isXs: boolean;
  cardWidth: number;
  openQuickBuy: (deal: JVAgreement) => void;
}) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [muted, setMuted] = React.useState<boolean>(true);
  const padH = isXs ? 16 : 20;
  const feedHeight = Math.min(screenWidth - padH * 2, 520);

  const homeFeedQuery = useQuery({
    queryKey: ['ivx-home-feed'],
    queryFn: () => fetchHomeFeed(60),
    retry: 1,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  /** Direct Supabase query for approved project videos — bypasses backend API CORS. */
  const supabaseVideosQuery = useQuery<FeedVideo[]>({
    queryKey: ['ivx-supabase-videos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_videos')
        .select('id,project_id,title,video_url,thumbnail_url,duration_sec,width,height,orientation,is_pinned,created_at')
        .eq('is_approved', true)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);
      if (error || !data) return [];
      return data.map((v: Record<string, unknown>): FeedVideo => ({
        id: String(v.id),
        project_id: v.project_id ? String(v.project_id) : null,
        video_url: (v.video_url as string) || '',
        hls_url: null,
        poster_url: null,
        preview_blur_url: null,
        playback_status: null,
        thumbnail_url: (v.thumbnail_url as string) || null,
        title: (v.title as string) || null,
        duration_sec: (v.duration_sec as number) ?? 0,
        width: (v.width as number) ?? null,
        height: (v.height as number) ?? null,
        orientation: (v.orientation as string) || 'landscape',
        is_pinned: v.is_pinned === true,
        created_at: (v.created_at as string) || '',
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        save_count: 0,
        view_count: 0,
        video_type: 'deal',
        is_featured: v.is_pinned === true,
        property_id: null,
        deal: null,
        status: 'published',
      }));
    },
    retry: 1,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const localById = useMemo(() => {
    const map = new Map<string, JVAgreement>();
    for (const d of jvDeals) if (d?.id) map.set(String(d.id), d);
    return map;
  }, [jvDeals]);

  /** Maps a HomeFeedDeal to a ParsedJVDeal for TrustDealCard rendering. */
  const homeFeedDealToParsed = useCallback((deal: HomeFeedDeal): ParsedJVDeal | null => {
    const local = localById.get(deal.id);
    if (local) return local as unknown as ParsedJVDeal;
    return parseDeal({
      id: deal.id,
      title: deal.name || undefined,
      projectName: deal.name || undefined,
      propertyAddress: deal.city || undefined,
      status: deal.status || undefined,
      type: deal.deal_type || undefined,
      totalInvestment: deal.investment_amount || undefined,
      expectedROI: deal.expected_roi ? Number(deal.expected_roi) : undefined,
      minInvestment: deal.min_investment ?? CANONICAL_MIN_INVESTMENT,
      publishedAt: deal.created_at || undefined,
      created_at: deal.created_at || undefined,
      photos: deal.photo_url ? [deal.photo_url] : undefined,
    } as Record<string, unknown>);
  }, [localById]);

  /** Canonical blocks from the backend; local-only fallback keeps the page alive offline. */
  const blocks = useMemo<HomeFeedBlock[]>(() => {
    const remote = homeFeedQuery.data?.blocks ?? [];
    if (remote.length > 0) return remote;
    return jvDeals.map((d, i): HomeFeedBlock => ({
      position: i,
      type: 'deal' as const,
      display_type: 'investment_card' as const,
      deal: {
        id: String(d.id),
        name: d.projectName || d.title || null,
        city: d.propertyAddress ?? null,
        phase: null,
        status: d.status ?? null,
        deal_type: d.type ?? null,
        investment_amount: d.totalInvestment ?? null,
        expected_roi: d.expectedROI != null ? String(d.expectedROI) : null,
        min_investment: null,
        progress_percent: null,
        photo_url: null,
        url: `https://ivxholding.com/?deal=${d.id}#deals`,
        is_featured: false,
        priority: 0,
        display_order: null,
        created_at: d.createdAt ?? null,
      },
    }));
  }, [homeFeedQuery.data?.blocks, jvDeals]);

  /** Mixed-feed layout: first 3 deal blocks become regular cards, then 1 video reel. */
  const visibleBlocks = useMemo(() => {
    const regular: HomeFeedBlock[] = [];
    const reels: HomeFeedBlock[] = [];
    for (const b of blocks) {
      if (b.type === 'deal') {
        if (regular.length < 3) regular.push(b);
        else reels.push(b);
      } else if (b.type === 'video') {
        reels.push(b);
      }
    }

    // If the backend API didn't return any video blocks (CORS blocked),
    // inject videos from the direct Supabase query.
    if (reels.length === 0 && supabaseVideosQuery.data && supabaseVideosQuery.data.length > 0) {
      // Match videos to deals by title for enrichment
      const titleToDealMap = new Map<string, HomeFeedDeal>();
      const regularDealsTyped = regular.filter((b): b is { position: number; type: 'deal'; display_type: 'investment_card'; deal: HomeFeedDeal } => b.type === 'deal');
      for (const b of regularDealsTyped) {
        const name = (b.deal.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (name) titleToDealMap.set(name, b.deal);
      }
      for (const v of supabaseVideosQuery.data) {
        const cleanTitle = (v.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        let matchedDeal: HomeFeedDeal | null = null;
        for (const [name, deal] of titleToDealMap) {
          if (cleanTitle.includes(name) || name.includes(cleanTitle)) {
            matchedDeal = deal;
            break;
          }
        }
        const enrichedVideo: FeedVideo = matchedDeal
          ? { ...v, property_id: matchedDeal.id, deal: { id: matchedDeal.id, title: matchedDeal.name, price: matchedDeal.investment_amount, min_investment: matchedDeal.min_investment, expected_roi: matchedDeal.expected_roi, deal_type: matchedDeal.deal_type, url: matchedDeal.url } }
          : v;
        reels.push({
          position: 999,
          type: 'video' as const,
          display_type: 'reel' as const,
          video: enrichedVideo,
        });
      }
    }

    const regularDeals = regular.filter((b): b is { position: number; type: 'deal'; display_type: 'investment_card'; deal: HomeFeedDeal } => b.type === 'deal');
    const videoReels = reels.filter((b): b is { position: number; type: 'video'; display_type: 'reel'; video: FeedVideo } => b.type === 'video');
    return { regular: regularDeals, reels: videoReels };
  }, [blocks, supabaseVideosQuery.data]);

  const goToDeal = useCallback((dealId: string) => {
    router.push({ pathname: '/jv-invest', params: { jvId: dealId } } as any);
  }, [router]);

  const handleReelLike = useCallback(async (data: CanonicalReelData) => {
    const id = data.dealId ?? data.reelId;
    void toggleProjectLike(id, null).catch(() => {});
  }, []);

  const handleReelSave = useCallback(async (data: CanonicalReelData) => {
    const viewerId = await getViewerId().catch(() => null);
    void toggleVideoSave(data.reelId, viewerId).catch(() => {});
  }, []);

  const handleReelShare = useCallback(async (data: CanonicalReelData) => {
    const url = data.dealUrl ?? buildVideoShareUrl(data.reelId);
    try {
      await Share.share({ message: `${data.title} — ${url}` });
      void trackProjectShare(data.reelId, 'social', null);
    } catch {}
  }, []);

  const handleReelComment = useCallback((data: CanonicalReelData) => {
    router.push({ pathname: '/videos', params: { type: 'reel', focus: data.reelId } } as any);
  }, [router]);

  const isLoading = jvDealsLoading && blocks.length === 0;

  return (
    <View style={styles.section}>
      <View style={[styles.header, { paddingHorizontal: padH }]}>
        <View style={styles.titleRow}>
          <Sparkles size={isXs ? 16 : 18} color={Colors.primary} />
          <Text style={[styles.title, { fontSize: isXs ? 16 : 18 }]}>Featured Deals</Text>
        </View>
        <View style={styles.liveBadge}>
          <TrendingUp size={11} color={Colors.success} />
          <Text style={styles.liveBadgeText}>Investor First</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={[styles.loadingBox, { marginHorizontal: padH }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Syncing live deals...</Text>
        </View>
      ) : blocks.length === 0 ? (
        <View style={styles.emptyBox}>
          <Landmark size={32} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No deals available yet</Text>
          <Text style={styles.emptySubtitle}>Check back soon for new opportunities</Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: padH, gap: 14 }}>
          {visibleBlocks.regular.map((block) => {
            const parsed = homeFeedDealToParsed(block.deal);
            if (!parsed) return null;
            return (
              <TrustDealCard
                key={`regular-deal-${block.deal.id}`}
                deal={parsed}
                onInvestNow={() => openQuickBuy(parsed as unknown as JVAgreement)}
                onViewDetails={() => goToDeal(block.deal.id)}
                galleryWidth={cardWidth - 32}
              />
            );
          })}
          {visibleBlocks.reels.slice(0, 1).map((block) => {
            if (block.type !== 'video') return null;
            const reelData = feedVideoToReelData(block.video);
            return (
              <VideoCardBoundary key={`video-${block.video.id}`}>
                <CanonicalInvestmentReelCard
                  data={reelData}
                  mode="feed"
                  isActive={false}
                  shouldMountVideo={false}
                  isMuted={muted}
                  feedHeight={feedHeight}
                  onToggleMute={() => setMuted(m => !m)}
                  onLike={handleReelLike}
                  onComment={handleReelComment}
                  onSave={handleReelSave}
                  onShare={handleReelShare}
                  onOpenDeal={(d) => goToDeal(d.dealId ?? d.reelId)}
                  onInvest={(d) => goToDeal(d.dealId ?? d.reelId)}
                  testIDPrefix="home-reel"
                />
              </VideoCardBoundary>
            );
          })}
          {visibleBlocks.reels.length > 1 && (
            <View style={styles.moreReelsHint}>
              <TouchableOpacity onPress={() => router.push('/videos')}>
                <Text style={styles.moreReelsHintText}>More reels in IVX Reels</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontWeight: '700' as const,
    color: Colors.text,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  loadingBox: {
    height: 200,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 10,
  },
  emptyBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 10,
  },
  emptySubtitle: {
    color: Colors.textTertiary,
    fontSize: 12,
    marginTop: 4,
  },
  moreReelsHint: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  moreReelsHintText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
});
