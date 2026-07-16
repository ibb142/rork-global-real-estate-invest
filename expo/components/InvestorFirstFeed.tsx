/**
 * Investor-first home feed — renders the CANONICAL block sequence from
 * GET /api/ivx/video-platform/home-feed (same source of truth as the landing
 * page and iOS app):
 *
 *   Featured Deal 1–3 → 1 Featured Project Video → Deal 4–6 → 1 video → repeat.
 *
 * All blocks render the shared CanonicalInvestmentReelCard — the approved
 * full-screen immersive reel design — in feed mode. No old Instagram-style
 * cards are used.
 */
import React, { Component, useCallback, useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Landmark, Sparkles, TrendingUp } from 'lucide-react-native';
import Colors from '@/constants/colors';
import CanonicalInvestmentReelCard, {
  feedVideoToReelData,
  homeFeedDealToReelData,
  parsedDealToReelData,
  type CanonicalReelData,
} from '@/components/CanonicalInvestmentReelCard';
import { fetchHomeFeed, type HomeFeedBlock } from '@/lib/video-feed';
import type { ParsedJVDeal } from '@/lib/parse-deal';
import type { JVAgreement } from '@/types/jv';
import { toggleProjectLike, trackProjectShare } from '@/lib/project-engagement';
import { toggleVideoSave, getViewerId, buildVideoShareUrl } from '@/lib/video-platform';

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

  /** Canonical blocks from the backend; local-only fallback keeps the page alive offline. */
  const blocks = useMemo<HomeFeedBlock[]>(() => {
    const remote = homeFeedQuery.data?.blocks ?? [];
    if (remote.length > 0) return remote;
    return jvDeals.map((d, i) => ({
      position: i,
      type: 'deal' as const,
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
          {blocks.map((block) => {
            if (block.type === 'video') {
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
            }
            const local = localById.get(block.deal.id);
            let reelData: CanonicalReelData;
            if (local) {
              reelData = parsedDealToReelData(local as unknown as ParsedJVDeal);
            } else {
              reelData = homeFeedDealToReelData(block.deal);
            }
            return (
              <CanonicalInvestmentReelCard
                key={`deal-${block.deal.id}`}
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
                onInvest={(d) => {
                  if (local) {
                    openQuickBuy(local);
                  } else {
                    goToDeal(d.dealId ?? d.reelId);
                  }
                }}
                testIDPrefix="home-reel"
              />
            );
          })}
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
});
