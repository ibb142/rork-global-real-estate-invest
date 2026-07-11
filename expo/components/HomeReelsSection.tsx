import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import { Clapperboard, Play, X, RefreshCw, WifiOff, Image as ImageIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatCurrencyCompact } from '@/lib/formatters';
import {
  mapReelRows,
  mapMediaRowsToPublications,
  buildProjectTitleMap,
  mapDealRowsToSummaries,
  countReelsByProject,
  formatOwnershipPercent,
  type HomeReel,
  type HomePublicationGroup,
  type DealInvestmentSummary,
} from '@/lib/home-content-guards';

export const QUERY_KEY_HOME_REELS = ['home', 'reels-publications'] as const;

interface HomeReelsData {
  reels: HomeReel[];
  publications: HomePublicationGroup[];
  titleMap: Record<string, string>;
  dealMap: Record<string, DealInvestmentSummary>;
  reelCounts: Record<string, number>;
}

function fmtMoney(value: number): string {
  const compact = formatCurrencyCompact(value);
  return compact.startsWith('$') ? compact : `$${compact}`;
}

function isMissingTableError(message: string | undefined): boolean {
  const msg = (message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('schema cache');
}

/**
 * Fetches published reels + published per-project media publications + project
 * titles in parallel from the same Supabase tables the landing page uses.
 * Reels/media table errors degrade gracefully; total failure throws so the
 * UI shows an explicit error + Retry instead of silently hiding content.
 */
async function fetchHomeReels(): Promise<HomeReelsData> {
  if (!isSupabaseConfigured()) return { reels: [], publications: [], titleMap: {}, dealMap: {}, reelCounts: {} };
  const [reelsRes, mediaRes, dealsRes] = await Promise.all([
    supabase.from('jv_deal_reels').select('*').eq('published', true).order('sort_order', { ascending: true }),
    supabase.from('jv_deal_media').select('id,project_id,media_type,public_url,sort_order,is_cover,published').eq('published', true).order('sort_order', { ascending: true }),
    supabase.from('jv_deals').select('id,title,project_name,city,state,country,total_investment,expected_roi,estimated_value,propertyValue,min_investment,partner_name,status').eq('published', true),
  ]);

  if (reelsRes.error && mediaRes.error && !isMissingTableError(reelsRes.error.message)) {
    throw new Error(reelsRes.error.message);
  }

  const dealRows = dealsRes.error ? [] : dealsRes.data;
  const titleMap = buildProjectTitleMap(dealRows);
  const dealMap = mapDealRowsToSummaries(dealRows);
  const reels = reelsRes.error ? [] : mapReelRows(reelsRes.data);
  const publications = mediaRes.error ? [] : mapMediaRowsToPublications(mediaRes.data, titleMap);
  const reelCounts = countReelsByProject(reels);
  console.log('[HomeReels] Fetched', reels.length, 'reels,', publications.length, 'publication groups,', Object.keys(dealMap).length, 'deal summaries');
  return { reels, publications, titleMap, dealMap, reelCounts };
}

/**
 * Shared home reels query — same queryKey everywhere so the JV deal cards'
 * yellow Reels icons and the reels section read one cached result.
 */
export function useHomeReelsQuery() {
  return useQuery({
    queryKey: [...QUERY_KEY_HOME_REELS],
    queryFn: fetchHomeReels,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

interface HomeReelsSectionProps {
  isXs: boolean;
  onOpenProject?: (projectId: string) => void;
  /** Opens the correct project investment flow (Invest Now inside a reel). */
  onInvest?: (projectId: string) => void;
  /** When set (from a project card's yellow Reels icon), opens that project's first reel. */
  requestedProjectId?: string | null;
  onRequestHandled?: () => void;
  /** Opens the full Reels module (all categories). */
  onSeeAll?: () => void;
}

/**
 * Reels section for the home screen, fed by the same jv_deal_reels rows (same
 * IDs and CDN URLs) as the landing page. Hidden only when there are genuinely
 * zero published reels; fetch failures show an error state with Retry instead
 * of silently disappearing.
 */
export default function HomeReelsSection({ isXs, onOpenProject, onInvest, requestedProjectId, onRequestHandled, onSeeAll }: HomeReelsSectionProps) {
  const padH = isXs ? 16 : 20;
  const [activeReel, setActiveReel] = useState<HomeReel | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [activeGallery, setActiveGallery] = useState<HomePublicationGroup | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const galleryPageWidth = Math.max(200, Math.min(windowWidth - 40, 420) - 28);

  const query = useHomeReelsQuery();

  const reels = query.data?.reels ?? [];
  const publications = query.data?.publications ?? [];
  const titleMap = query.data?.titleMap ?? {};
  const dealMap = query.data?.dealMap ?? {};
  const reelCounts = query.data?.reelCounts ?? {};

  const closePlayer = useCallback(() => {
    setActiveReel(null);
    setPlaybackError(null);
  }, []);

  useEffect(() => {
    if (!requestedProjectId || !query.data) return;
    const match = query.data.reels.find((r) => r.projectId === requestedProjectId);
    if (match) {
      setPlaybackError(null);
      setActiveReel(match);
      console.log('[HomeReels] Opened project-filtered reel', match.id, 'for project', requestedProjectId);
    } else {
      console.log('[HomeReels] No published reel for project', requestedProjectId);
    }
    onRequestHandled?.();
  }, [requestedProjectId, query.data, onRequestHandled]);

  const closeGallery = useCallback(() => {
    setActiveGallery(null);
  }, []);

  if (query.isPending) {
    return (
      <View style={rStyles.section} testID="home-reels-loading">
        <SectionHeader isXs={isXs} padH={padH} onSeeAll={onSeeAll} />
        <View style={[rStyles.stateBox, { marginHorizontal: padH }]}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={rStyles.stateText}>Loading reels…</Text>
        </View>
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={rStyles.section} testID="home-reels-error">
        <SectionHeader isXs={isXs} padH={padH} onSeeAll={onSeeAll} />
        <View style={[rStyles.stateBox, { marginHorizontal: padH }]}>
          <WifiOff size={22} color={Colors.textTertiary} />
          <Text style={rStyles.stateText}>Couldn&apos;t load reels</Text>
          <TouchableOpacity
            style={rStyles.retryBtn}
            onPress={() => query.refetch()}
            testID="home-reels-retry"
            accessibilityRole="button"
            accessibilityLabel="Retry loading reels"
          >
            <RefreshCw size={14} color={Colors.black} />
            <Text style={rStyles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (reels.length === 0 && publications.length === 0) {
    return null;
  }

  const cardW = isXs ? 130 : 150;
  const cardH = isXs ? 200 : 230;

  return (
    <View style={rStyles.section} testID="home-reels-section">
      <SectionHeader isXs={isXs} padH={padH} onSeeAll={onSeeAll} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: padH, gap: 12 }}
      >
        {reels.map((reel) => (
          <TouchableOpacity
            key={reel.id}
            style={[rStyles.reelCard, { width: cardW, height: cardH }]}
            onPress={() => {
              setPlaybackError(null);
              setActiveReel(reel);
            }}
            activeOpacity={0.85}
            testID={`home-reel-${reel.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Play reel: ${reel.caption || 'property tour'}`}
          >
            {reel.thumbnailUrl ? (
              <Image source={{ uri: reel.thumbnailUrl }} style={rStyles.reelThumb} resizeMode="cover" />
            ) : (
              <View style={[rStyles.reelThumb, rStyles.reelThumbFallback]}>
                <Clapperboard size={26} color={Colors.textTertiary} />
              </View>
            )}
            <View style={rStyles.reelOverlay}>
              <View style={rStyles.overlayTopRow}>
                <View style={rStyles.projectBadge}>
                  <Text style={rStyles.projectBadgeText} numberOfLines={1}>
                    {titleMap[reel.projectId] ?? reel.projectId}
                  </Text>
                </View>
                <View style={rStyles.playBadge}>
                  <Play size={16} color="#fff" fill="#fff" />
                </View>
              </View>
              <View>
                {reel.caption ? (
                  <Text style={rStyles.reelCaption} numberOfLines={2}>{reel.caption}</Text>
                ) : null}
                {dealMap[reel.projectId] ? (
                  <Text style={rStyles.reelInvestHint} numberOfLines={1}>
                    {`${fmtMoney(dealMap[reel.projectId].investmentAmount)} · ${dealMap[reel.projectId].roiPercent}% ROI`}
                  </Text>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {publications.map((group) => (
          <TouchableOpacity
            key={`pub-${group.projectId}`}
            style={[rStyles.reelCard, { width: cardW, height: cardH }]}
            onPress={() => setActiveGallery(group)}
            activeOpacity={0.85}
            testID={`home-publication-${group.projectId}`}
            accessibilityRole="button"
            accessibilityLabel={`View ${group.photoCount} photos from ${group.projectTitle}`}
          >
            <Image source={{ uri: group.coverUrl }} style={rStyles.reelThumb} resizeMode="cover" />
            <View style={rStyles.reelOverlay}>
              <View style={rStyles.overlayTopRow}>
                <View style={rStyles.projectBadge}>
                  <Text style={rStyles.projectBadgeText} numberOfLines={1}>{group.projectTitle}</Text>
                </View>
                <View style={rStyles.countBadge}>
                  <ImageIcon size={12} color="#fff" />
                  <Text style={rStyles.countBadgeText}>{group.photoCount}</Text>
                </View>
              </View>
              <Text style={rStyles.reelCaption} numberOfLines={2}>
                {group.photoCount} photo{group.photoCount === 1 ? '' : 's'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={activeReel !== null}
        animationType="fade"
        transparent
        onRequestClose={closePlayer}
      >
        <View style={rStyles.playerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePlayer} testID="home-reel-player-backdrop" />
          <View style={rStyles.playerCard}>
            {activeReel ? (
              playbackError ? (
                <View style={rStyles.playerErrorBox}>
                  <WifiOff size={26} color={Colors.textTertiary} />
                  <Text style={rStyles.stateText}>Video failed to load</Text>
                  <TouchableOpacity
                    style={rStyles.retryBtn}
                    onPress={() => setPlaybackError(null)}
                    testID="home-reel-playback-retry"
                  >
                    <RefreshCw size={14} color={Colors.black} />
                    <Text style={rStyles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Video
                  source={{ uri: activeReel.videoUrl }}
                  style={rStyles.playerVideo}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  useNativeControls
                  onError={(err: string) => {
                    console.log('[HomeReels] Playback error:', err?.slice?.(0, 120));
                    setPlaybackError('playback-failed');
                  }}
                />
              )
            ) : null}
            {activeReel?.caption ? (
              <Text style={rStyles.playerCaption} numberOfLines={2}>{activeReel.caption}</Text>
            ) : null}
            {activeReel ? (
              dealMap[activeReel.projectId] ? (
                <ReelInvestmentCard
                  deal={dealMap[activeReel.projectId]}
                  reelCount={reelCounts[activeReel.projectId] ?? 0}
                  onDetails={onOpenProject ? () => {
                    const pid = activeReel.projectId;
                    closePlayer();
                    onOpenProject(pid);
                  } : undefined}
                  onInvest={onInvest ? () => {
                    const pid = activeReel.projectId;
                    closePlayer();
                    onInvest(pid);
                  } : undefined}
                />
              ) : activeReel.projectId ? (
                <View style={rStyles.unavailableBox} testID="home-reel-project-unavailable">
                  <Text style={rStyles.stateText}>Project details temporarily unavailable</Text>
                  <TouchableOpacity
                    style={rStyles.retryBtn}
                    onPress={() => query.refetch()}
                    testID="home-reel-project-retry"
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading project details"
                  >
                    <RefreshCw size={14} color={Colors.black} />
                    <Text style={rStyles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={rStyles.galleryHint}>IVX promotional reel</Text>
              )
            ) : null}
            <View style={rStyles.playerActions}>
              <TouchableOpacity
                style={rStyles.closeBtn}
                onPress={closePlayer}
                testID="home-reel-player-close"
                accessibilityRole="button"
                accessibilityLabel="Close reel player"
              >
                <X size={18} color={Colors.text} />
                <Text style={rStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeGallery !== null}
        animationType="fade"
        transparent
        onRequestClose={closeGallery}
      >
        <View style={rStyles.playerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeGallery} testID="home-gallery-backdrop" />
          <View style={rStyles.playerCard}>
            {activeGallery ? (
              <>
                <Text style={rStyles.playerCaption} numberOfLines={1}>{activeGallery.projectTitle}</Text>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={rStyles.galleryScroll}
                  testID="home-gallery-scroll"
                >
                  {activeGallery.photos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: photo.url }}
                      style={[rStyles.galleryImage, { width: galleryPageWidth }]}
                      resizeMode="contain"
                    />
                  ))}
                </ScrollView>
                <Text style={rStyles.galleryHint}>
                  Swipe to browse • {activeGallery.photoCount} photo{activeGallery.photoCount === 1 ? '' : 's'}
                </Text>
                <View style={rStyles.playerActions}>
                  {onOpenProject ? (
                    <TouchableOpacity
                      style={rStyles.projectBtn}
                      onPress={() => {
                        const pid = activeGallery.projectId;
                        closeGallery();
                        onOpenProject(pid);
                      }}
                      testID="home-gallery-open-project"
                    >
                      <Text style={rStyles.projectBtnText}>View Project</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={rStyles.closeBtn}
                    onPress={closeGallery}
                    testID="home-gallery-close"
                    accessibilityRole="button"
                    accessibilityLabel="Close photo gallery"
                  >
                    <X size={18} color={Colors.text} />
                    <Text style={rStyles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SectionHeader({ isXs, padH, onSeeAll }: { isXs: boolean; padH: number; onSeeAll?: () => void }) {
  return (
    <View style={[rStyles.header, { paddingHorizontal: padH }]}>
      <TouchableOpacity
        style={rStyles.headerLeft}
        onPress={onSeeAll}
        disabled={!onSeeAll}
        testID="home-reels-open-module"
        accessibilityRole="button"
        accessibilityLabel="Open the full Reels module"
      >
        <View style={rStyles.headerIconWrap} testID="home-reels-yellow-icon">
          <Clapperboard size={isXs ? 14 : 16} color={Colors.black} />
        </View>
        <Text style={[rStyles.headerTitle, { fontSize: isXs ? 16 : 18 }]}>Property Reels</Text>
      </TouchableOpacity>
      {onSeeAll ? (
        <TouchableOpacity
          onPress={onSeeAll}
          testID="home-reels-see-all"
          accessibilityRole="button"
          accessibilityLabel="See all reels"
        >
          <Text style={rStyles.seeAllText}>See All</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Investment card rendered under every reel — the reel is never a standalone
 * video: it always carries its project's live investment numbers and actions.
 */
function ReelInvestmentCard({ deal, reelCount, onDetails, onInvest }: {
  deal: DealInvestmentSummary;
  reelCount: number;
  onDetails?: () => void;
  onInvest?: () => void;
}) {
  const ownership = formatOwnershipPercent(deal.fractionalMinimum, deal.salePrice);
  return (
    <View style={rStyles.investCard} testID={`home-reel-invest-card-${deal.id}`}>
      <Text style={rStyles.investTitle} numberOfLines={1}>{deal.title}</Text>
      {deal.location ? (
        <Text style={rStyles.investLocation} numberOfLines={1}>{deal.location}</Text>
      ) : null}
      <View style={rStyles.investMetricsRow}>
        <View style={rStyles.investMetric}>
          <Text style={rStyles.investMetricVal}>{fmtMoney(deal.investmentAmount)}</Text>
          <Text style={rStyles.investMetricLbl}>INVESTMENT</Text>
        </View>
        <View style={rStyles.investMetric}>
          <Text style={rStyles.investMetricVal}>{`${deal.roiPercent}%`}</Text>
          <Text style={rStyles.investMetricLbl}>ROI</Text>
        </View>
        <View style={rStyles.investMetric}>
          <Text style={rStyles.investMetricVal}>{fmtMoney(deal.salePrice)}</Text>
          <Text style={rStyles.investMetricLbl}>SALE PRICE</Text>
        </View>
      </View>
      <View style={rStyles.investFracRow}>
        <Text style={rStyles.investFracText}>
          Fractional from <Text style={rStyles.investFracStrong}>{`$${deal.fractionalMinimum.toFixed(2)}`}</Text>
        </Text>
        {ownership ? (
          <Text style={rStyles.investFracText}>
            <Text style={rStyles.investFracStrong}>{ownership}</Text> min ownership
          </Text>
        ) : null}
      </View>
      <Text style={rStyles.investDeveloper} numberOfLines={1}>
        Developed by <Text style={rStyles.investFracStrong}>{deal.developer}</Text>
      </Text>
      <View style={rStyles.investBadgeRow}>
        <View style={rStyles.liveBadge}>
          <View style={rStyles.liveDot} />
          <Text style={rStyles.liveBadgeText}>LIVE</Text>
        </View>
        {reelCount > 0 ? (
          <View style={rStyles.reelCountPill}>
            <Text style={rStyles.reelCountPillText}>{reelCount === 1 ? '1 REEL' : `${reelCount} REELS`}</Text>
          </View>
        ) : null}
      </View>
      <View style={rStyles.investActions}>
        {onDetails ? (
          <TouchableOpacity
            style={rStyles.detailsBtn}
            onPress={onDetails}
            testID="home-reel-open-project"
            accessibilityRole="button"
            accessibilityLabel={`View details for ${deal.title}`}
          >
            <Text style={rStyles.detailsBtnText}>Details</Text>
          </TouchableOpacity>
        ) : null}
        {onInvest ? (
          <TouchableOpacity
            style={rStyles.investBtn}
            onPress={onInvest}
            testID="home-reel-invest-now"
            accessibilityRole="button"
            accessibilityLabel={`Invest now in ${deal.title}`}
          >
            <Text style={rStyles.investBtnText}>Invest Now</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const rStyles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontWeight: '700' as const,
    color: Colors.text,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  investCard: {
    borderRadius: 14,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    gap: 8,
  },
  investTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '900' as const,
  },
  investLocation: {
    color: Colors.textTertiary,
    fontSize: 12,
  },
  investMetricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  investMetric: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  investMetricVal: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  investMetricLbl: {
    color: Colors.textTertiary,
    fontSize: 9,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  investFracRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  investFracText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  investFracStrong: {
    color: Colors.primary,
    fontWeight: '800' as const,
  },
  investDeveloper: {
    color: Colors.textTertiary,
    fontSize: 11,
  },
  investBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,196,140,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.4)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveBadgeText: {
    color: '#22C55E',
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
  },
  reelCountPill: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  reelCountPillText: {
    color: Colors.primary,
    fontSize: 9,
    fontWeight: '800' as const,
  },
  investActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  detailsBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.5)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  detailsBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  investBtn: {
    flex: 1.2,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    alignItems: 'center',
  },
  investBtnText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '900' as const,
  },
  unavailableBox: {
    borderRadius: 14,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  stateBox: {
    height: 140,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stateText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  reelCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  reelThumb: {
    width: '100%',
    height: '100%',
  },
  reelThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundTertiary,
  },
  reelOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  overlayTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  projectBadge: {
    flexShrink: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  projectBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  playBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  reelCaption: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  reelInvestHint: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  playerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  playerCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 10,
  },
  playerVideo: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 480,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  playerErrorBox: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 480,
    borderRadius: 12,
    backgroundColor: Colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playerCaption: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  galleryScroll: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: '#000',
  },
  galleryImage: {
    height: '100%',
  },
  galleryHint: {
    color: Colors.textTertiary,
    fontSize: 12,
    textAlign: 'center' as const,
  },
  playerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  projectBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  projectBtnText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.backgroundTertiary,
  },
  closeBtnText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
