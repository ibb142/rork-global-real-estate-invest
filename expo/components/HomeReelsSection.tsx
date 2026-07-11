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
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import { Clapperboard, Play, X, RefreshCw, WifiOff } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { mapReelRows, type HomeReel } from '@/lib/home-content-guards';

export const QUERY_KEY_HOME_REELS = ['home', 'reels'] as const;

async function fetchHomeReels(): Promise<{ reels: HomeReel[] }> {
  if (!isSupabaseConfigured()) return { reels: [] };
  const { data, error } = await supabase
    .from('jv_deal_reels')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true });
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return { reels: [] };
    }
    throw new Error(error.message);
  }
  const reels = mapReelRows(data);
  console.log('[HomeReels] Fetched', reels.length, 'published public reels');
  return { reels };
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

  const query = useQuery({
    queryKey: [...QUERY_KEY_HOME_REELS],
    queryFn: fetchHomeReels,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const reels = query.data?.reels ?? [];

  const closePlayer = useCallback(() => {
    setActiveReel(null);
    setPlaybackError(null);
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

  if (reels.length === 0) {
    return null;
  }

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
            style={[rStyles.reelCard, { width: isXs ? 130 : 150, height: isXs ? 200 : 230 }]}
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
              <View style={rStyles.playBadge}>
                <Play size={16} color="#fff" fill="#fff" />
              </View>
              {reel.caption ? (
                <Text style={rStyles.reelCaption} numberOfLines={2}>{reel.caption}</Text>
              ) : null}
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
    </View>
  );
}

function SectionHeader({ isXs, padH }: { isXs: boolean; padH: number }) {
  return (
    <View style={[rStyles.header, { paddingHorizontal: padH }]}>
      <View style={rStyles.headerLeft}>
        <Clapperboard size={isXs ? 16 : 18} color={Colors.primary} />
        <Text style={[rStyles.headerTitle, { fontSize: isXs ? 16 : 18 }]}>Reels</Text>
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
  playBadge: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
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
