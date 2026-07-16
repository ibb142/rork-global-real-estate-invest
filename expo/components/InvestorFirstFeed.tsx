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

  /** Mixed-feed layout: first 3 deal blocks become regular cards, next video block is a reel. */
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
    const regularDeals = regular.filter((b): b is { position: number; type: 'deal'; display_type: 'investment_card'; deal: HomeFeedDeal } => b.type === 'deal');
    const videoReels = reels.filter((b): b is { position: number; type: 'video'; display_type: 'reel'; video: FeedVideo } => b.type === 'video');
    return { regular: regularDeals, reels: videoReels };
  }, [blocks]);

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

  const isLoading = (homeFeedQuery.isLoading && jvDealsLoading) || (homeFeedQuery.isLoading && blocks.length === 0);

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
