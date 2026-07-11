import React, { useCallback, useState } from 'react';
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
import {
  mapReelRows,
  mapMediaRowsToPublications,
  buildProjectTitleMap,
  type HomeReel,
  type HomePublicationGroup,
} from '@/lib/home-content-guards';

export const QUERY_KEY_HOME_REELS = ['home', 'reels-publications'] as const;

interface HomeReelsData {
  reels: HomeReel[];
  publications: HomePublicationGroup[];
  titleMap: Record<string, string>;
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
  if (!isSupabaseConfigured()) return { reels: [], publications: [], titleMap: {} };
  const [reelsRes, mediaRes, dealsRes] = await Promise.all([
    supabase.from('jv_deal_reels').select('*').eq('published', true).order('sort_order', { ascending: true }),
    supabase.from('jv_deal_media').select('id,project_id,media_type,public_url,sort_order,is_cover,published').eq('published', true).order('sort_order', { ascending: true }),
    supabase.from('jv_deals').select('id,title,project_name').eq('published', true),
  ]);

  if (reelsRes.error && mediaRes.error && !isMissingTableError(reelsRes.error.message)) {
    throw new Error(reelsRes.error.message);
  }

  const titleMap = buildProjectTitleMap(dealsRes.error ? [] : dealsRes.data);
  const reels = reelsRes.error ? [] : mapReelRows(reelsRes.data);
  const publications = mediaRes.error ? [] : mapMediaRowsToPublications(mediaRes.data, titleMap);
  console.log('[HomeReels] Fetched', reels.length, 'reels,', publications.length, 'publication groups');
  return { reels, publications, titleMap };
}

interface HomeReelsSectionProps {
  isXs: boolean;
  onOpenProject?: (projectId: string) => void;
}

/**
 * Reels section for the home screen, fed by the same jv_deal_reels rows (same
 * IDs and CDN URLs) as the landing page. Hidden only when there are genuinely
 * zero published reels; fetch failures show an error state with Retry instead
 * of silently disappearing.
 */
export default function HomeReelsSection({ isXs, onOpenProject }: HomeReelsSectionProps) {
  const padH = isXs ? 16 : 20;
  const [activeReel, setActiveReel] = useState<HomeReel | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [activeGallery, setActiveGallery] = useState<HomePublicationGroup | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const galleryPageWidth = Math.max(200, Math.min(windowWidth - 40, 420) - 28);

  const query = useQuery({
    queryKey: [...QUERY_KEY_HOME_REELS],
    queryFn: fetchHomeReels,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const reels = query.data?.reels ?? [];
  const publications = query.data?.publications ?? [];
  const titleMap = query.data?.titleMap ?? {};

  const closePlayer = useCallback(() => {
    setActiveReel(null);
    setPlaybackError(null);
  }, []);

  const closeGallery = useCallback(() => {
    setActiveGallery(null);
  }, []);

  if (query.isPending) {
    return (
      <View style={rStyles.section} testID="home-reels-loading">
        <SectionHeader isXs={isXs} padH={padH} />
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
        <SectionHeader isXs={isXs} padH={padH} />
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
      <SectionHeader isXs={isXs} padH={padH} />
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
              {reel.caption ? (
                <Text style={rStyles.reelCaption} numberOfLines={2}>{reel.caption}</Text>
              ) : null}
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
            <View style={rStyles.playerActions}>
              {activeReel?.projectId && onOpenProject ? (
                <TouchableOpacity
                  style={rStyles.projectBtn}
                  onPress={() => {
                    const pid = activeReel.projectId;
                    closePlayer();
                    onOpenProject(pid);
                  }}
                  testID="home-reel-open-project"
                >
                  <Text style={rStyles.projectBtnText}>View Project</Text>
                </TouchableOpacity>
              ) : null}
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

function SectionHeader({ isXs, padH }: { isXs: boolean; padH: number }) {
  return (
    <View style={[rStyles.header, { paddingHorizontal: padH }]}>
      <View style={rStyles.headerLeft}>
        <Clapperboard size={isXs ? 16 : 18} color={Colors.primary} />
        <Text style={[rStyles.headerTitle, { fontSize: isXs ? 16 : 18 }]}>Reels &amp; Publications</Text>
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
