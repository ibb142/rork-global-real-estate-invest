/**
 * Investor-first home feed — renders the CANONICAL block sequence from
 * GET /api/ivx/video-platform/home-feed (same source of truth as the landing
 * page and iOS app):
 *
 *   Featured Deal 1–3 → 1 Featured Project Video → Deal 4–6 → 1 video → repeat.
 *
 * Deal blocks render the rich TrustDealCard when the deal exists in the local
 * jv_deals cache; otherwise a compact card built from the canonical payload
 * (name, city, phase, investment, ROI, min investment, progress %, View Deal
 * + Invest Now). Video blocks are Instagram-style DealVideoCards attached to
 * a real project — never random videos.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Landmark, MapPin, Sparkles, TrendingUp } from 'lucide-react-native';
import Colors from '@/constants/colors';
import TrustDealCard from '@/components/TrustDealCard';
import DealVideoCard from '@/components/DealVideoCard';
import { fetchHomeFeed, type HomeFeedBlock, type HomeFeedDeal } from '@/lib/video-feed';
import { formatCurrencyCompact } from '@/lib/formatters';
import type { ParsedJVDeal } from '@/lib/parse-deal';
import type { JVAgreement } from '@/types/jv';

function RemoteDealCard({ deal, onView, onInvest }: { deal: HomeFeedDeal; onView: () => void; onInvest: () => void }) {
  return (
    <View style={styles.remoteCard} testID={`home-feed-deal-${deal.id}`}>
      {deal.photo_url ? (
        <Image source={{ uri: deal.photo_url }} style={styles.remotePhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.remotePhoto, styles.remotePhotoFallback]}>
          <Landmark size={32} color={Colors.primary} />
        </View>
      )}
      <View style={styles.remoteBody}>
        <Text style={styles.remoteName} numberOfLines={1}>{deal.name ?? 'Investment Opportunity'}</Text>
        {deal.city ? (
          <View style={styles.remoteLocationRow}>
            <MapPin size={11} color={Colors.textTertiary} />
            <Text style={styles.remoteLocation} numberOfLines={1}>{deal.city}</Text>
          </View>
        ) : null}
        {deal.phase ? <Text style={styles.remotePhase}>{deal.phase}</Text> : null}
        <View style={styles.remoteStats}>
          {deal.investment_amount != null ? (
            <View style={styles.remoteStat}>
              <Text style={styles.remoteStatVal}>{formatCurrencyCompact(deal.investment_amount)}</Text>
              <Text style={styles.remoteStatLbl}>Investment</Text>
            </View>
          ) : null}
          {deal.expected_roi ? (
            <View style={styles.remoteStat}>
              <Text style={[styles.remoteStatVal, { color: Colors.success }]}>{deal.expected_roi}%</Text>
              <Text style={styles.remoteStatLbl}>ROI</Text>
            </View>
          ) : null}
          {deal.min_investment != null ? (
            <View style={styles.remoteStat}>
              <Text style={styles.remoteStatVal}>{formatCurrencyCompact(deal.min_investment)}</Text>
              <Text style={styles.remoteStatLbl}>Minimum</Text>
            </View>
          ) : null}
        </View>
        {deal.progress_percent != null ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, deal.progress_percent))}%` }]} />
            </View>
            <Text style={styles.progressText}>{deal.progress_percent}%</Text>
          </View>
        ) : null}
        <View style={styles.remoteBtnRow}>
          <TouchableOpacity style={styles.viewBtn} onPress={onView} activeOpacity={0.8} testID={`home-feed-view-${deal.id}`}>
            <Text style={styles.viewBtnText}>View Deal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.investBtn} onPress={onInvest} activeOpacity={0.8} testID={`home-feed-invest-${deal.id}`}>
            <Text style={styles.investBtnText}>Invest Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function InvestorFirstFeed({ jvDeals, jvDealsLoading, isXs, cardWidth, openQuickBuy }: {
  jvDeals: JVAgreement[];
  jvDealsLoading: boolean;
  isXs: boolean;
  cardWidth: number;
  openQuickBuy: (deal: JVAgreement) => void;
}) {
  const router = useRouter();
  const padH = isXs ? 16 : 20;

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

  const goToDeal = (dealId: string) => {
    router.push({ pathname: '/jv-invest', params: { jvId: dealId } } as any);
  };

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
              return <DealVideoCard key={`video-${block.video.id}`} video={block.video} />;
            }
            const local = localById.get(block.deal.id);
            if (local) {
              return (
                <TrustDealCard
                  key={`deal-${block.deal.id}`}
                  deal={local as unknown as ParsedJVDeal}
                  galleryWidth={cardWidth - padH * 2}
                  onViewDetails={() => goToDeal(block.deal.id)}
                  onInvestNow={() => openQuickBuy(local)}
                />
              );
            }
            return (
              <RemoteDealCard
                key={`deal-${block.deal.id}`}
                deal={block.deal}
                onView={() => goToDeal(block.deal.id)}
                onInvest={() => goToDeal(block.deal.id)}
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
  remoteCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden' as const,
  },
  remotePhoto: {
    width: '100%' as const,
    height: 180,
    backgroundColor: Colors.backgroundSecondary,
  },
  remotePhotoFallback: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  remoteBody: {
    padding: 14,
  },
  remoteName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  remoteLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  remoteLocation: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  remotePhase: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  remoteStats: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
  },
  remoteStat: {
    flex: 1,
    alignItems: 'center',
  },
  remoteStatVal: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  remoteStatLbl: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.backgroundSecondary,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  progressText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  remoteBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  viewBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  viewBtnText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  investBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  investBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
});
