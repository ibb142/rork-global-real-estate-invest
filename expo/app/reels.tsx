import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  Modal,
  ActivityIndicator,
  Pressable,
  TextInput,
  Share,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Clapperboard,
  Heart,
  MapPin,
  MessageCircle,
  Play,
  RefreshCw,
  Send,
  Share2,
  WifiOff,
  X,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  fetchReelsModule,
  fetchReelComments,
  postReelComment,
  toggleReelEngagement,
  getReelsDeviceKey,
  reelMatchesCategoryClient,
  formatReelMoney,
  REEL_CATEGORY_CHIPS,
  REEL_TYPE_LABELS,
  type ReelCategoryId,
  type ReelItem,
  type ReelComment,
} from '@/lib/reels-module';

export const QUERY_KEY_REELS_MODULE = ['reels', 'module'] as const;

/**
 * Full IVX Reels module — the complete discovery + investment experience.
 * One canonical source (backend /api/reels → jv_deal_reels ⟶ jv_deals) shared
 * with the landing page. Category chips filter in place; every reel carries
 * its linked business record (investment card, buyer/seller/JV CTA) matched
 * by immutable project UUID — never array index or title guessing.
 */
export default function ReelsModuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ project?: string; category?: string }>();
  const [category, setCategory] = useState<ReelCategoryId>(() => {
    const raw = String(params.category ?? '').toLowerCase();
    const known = REEL_CATEGORY_CHIPS.find((chip) => chip.id === raw);
    return known ? known.id : 'all';
  });
  const [projectFilter, setProjectFilter] = useState<string | null>(
    () => (typeof params.project === 'string' && params.project.trim().length > 0 ? params.project.trim() : null),
  );
  const [deviceKey, setDeviceKey] = useState<string | null>(null);
  const [commentsReel, setCommentsReel] = useState<ReelItem | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    void getReelsDeviceKey().then(setDeviceKey);
  }, []);

  const query = useQuery({
    queryKey: [...QUERY_KEY_REELS_MODULE, deviceKey ?? 'anon'],
    queryFn: () => fetchReelsModule(deviceKey ?? 'ivxr-anonymous-viewer'),
    enabled: deviceKey !== null,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 1000 * 60 * 2,
  });

  const allReels = useMemo<ReelItem[]>(() => query.data?.reels ?? [], [query.data]);

  const visibleReels = useMemo(() => {
    let list = allReels;
    if (projectFilter) list = list.filter((reel) => reel.project_id === projectFilter);
    return list.filter((reel) => reelMatchesCategoryClient(reel, category));
  }, [allReels, projectFilter, category]);

  const categoryCounts = useMemo<Record<string, number>>(() => {
    const base: Record<string, number> = { ...(query.data?.categories ?? {}) };
    base.saved = allReels.filter((reel) => reel.viewer.saved).length;
    return base;
  }, [query.data, allReels]);

  const projectTitle = useMemo(() => {
    if (!projectFilter) return null;
    const match = allReels.find((reel) => reel.project_id === projectFilter);
    return match?.project?.title ?? projectFilter;
  }, [projectFilter, allReels]);

  const updateReel = useCallback((reelId: string, patch: (reel: ReelItem) => ReelItem) => {
    queryClient.setQueryData<typeof query.data>([...QUERY_KEY_REELS_MODULE, deviceKey ?? 'anon'], (old) => {
      if (!old) return old;
      return { ...old, reels: old.reels.map((reel) => (reel.reel_id === reelId ? patch(reel) : reel)) };
    });
  }, [queryClient, deviceKey, query.data]);

  const handleToggle = useCallback(async (reel: ReelItem, kind: 'like' | 'save') => {
    if (!deviceKey) return;
    const wasOn = kind === 'like' ? reel.viewer.liked : reel.viewer.saved;
    const nextOn = !wasOn;
    updateReel(reel.reel_id, (r) => ({
      ...r,
      likes: kind === 'like' ? Math.max(0, r.likes + (nextOn ? 1 : -1)) : r.likes,
      saves: kind === 'save' ? Math.max(0, r.saves + (nextOn ? 1 : -1)) : r.saves,
      viewer: { ...r.viewer, liked: kind === 'like' ? nextOn : r.viewer.liked, saved: kind === 'save' ? nextOn : r.viewer.saved },
    }));
    try {
      const count = await toggleReelEngagement(reel.reel_id, kind, deviceKey, nextOn);
      updateReel(reel.reel_id, (r) => ({
        ...r,
        likes: kind === 'like' ? count : r.likes,
        saves: kind === 'save' ? count : r.saves,
      }));
    } catch (error) {
      console.log('[Reels] engagement toggle failed:', error instanceof Error ? error.message : 'unknown');
      updateReel(reel.reel_id, (r) => ({
        ...r,
        likes: kind === 'like' ? reel.likes : r.likes,
        saves: kind === 'save' ? reel.saves : r.saves,
        viewer: { ...r.viewer, liked: kind === 'like' ? wasOn : r.viewer.liked, saved: kind === 'save' ? wasOn : r.viewer.saved },
      }));
    }
  }, [deviceKey, updateReel]);

  const handleShare = useCallback(async (reel: ReelItem) => {
    const url = reel.project_id
      ? `https://ivxholding.com/reels?project=${encodeURIComponent(reel.project_id)}`
      : 'https://ivxholding.com/reels';
    try {
      await Share.share({ message: `${reel.caption ?? 'IVX Property Reel'} — ${url}` });
    } catch (error) {
      console.log('[Reels] share failed:', error instanceof Error ? error.message : 'unknown');
    }
  }, []);

  const openDeal = useCallback((projectId: string) => {
    router.push({ pathname: '/jv-invest', params: { jvId: projectId } } as never);
  }, [router]);

  const handleCta = useCallback((reel: ReelItem, action: string) => {
    if (reel.project_id && (action === 'invest_now' || action === 'view_deal')) {
      openDeal(reel.project_id);
      return;
    }
    if (action === 'contact_match' || action === 'submit_listing') {
      router.push('/chat-hub' as never);
      return;
    }
    // view_projects / view_deals / view_tokenized → live deals on home
    router.back();
  }, [openDeal, router]);

  const renderReel = useCallback(({ item }: { item: ReelItem }) => (
    <ReelCard
      reel={item}
      onLike={() => void handleToggle(item, 'like')}
      onSave={() => void handleToggle(item, 'save')}
      onShare={() => void handleShare(item)}
      onComments={() => setCommentsReel(item)}
      onCta={(action) => handleCta(item, action)}
    />
  ), [handleToggle, handleShare, handleCta]);

  const emptyLabel = projectFilter
    ? 'No published reels for this project yet. Approved project videos appear here the moment they are published.'
    : category === 'saved'
      ? 'No saved reels yet. Tap the bookmark on any reel to save it.'
      : `No published ${REEL_CATEGORY_CHIPS.find((c) => c.id === category)?.label ?? ''} reels yet. Approved videos appear here the moment they are published.`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          testID="reels-module-back"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <View style={styles.headerIcon} testID="reels-module-yellow-icon">
            <Clapperboard size={16} color={Colors.black} />
          </View>
          <Text style={styles.headerTitle}>IVX Reels</Text>
        </View>
        <View style={styles.headerCountPill}>
          <Text style={styles.headerCountText}>
            {`${visibleReels.length} ${visibleReels.length === 1 ? 'REEL' : 'REELS'}`}
          </Text>
        </View>
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          testID="reels-category-chips"
        >
          {REEL_CATEGORY_CHIPS.map((chip) => {
            const active = category === chip.id;
            const count = categoryCounts[chip.id];
            return (
              <TouchableOpacity
                key={chip.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategory(chip.id)}
                testID={`reels-chip-${chip.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Filter reels: ${chip.label}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {chip.label}
                  {typeof count === 'number' ? ` ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {projectFilter ? (
        <View style={styles.projectChip} testID="reels-project-filter-chip">
          <Text style={styles.projectChipText} numberOfLines={1}>
            Showing reels for <Text style={styles.projectChipStrong}>{projectTitle}</Text>
          </Text>
          <TouchableOpacity onPress={() => setProjectFilter(null)} testID="reels-project-filter-clear">
            <Text style={styles.projectChipClear}>Show all</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {query.isPending || deviceKey === null ? (
        <View style={styles.stateWrap} testID="reels-module-loading">
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonVideo}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: '55%' }]} />
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <View style={styles.stateWrap} testID="reels-module-error">
          <WifiOff size={26} color={Colors.textTertiary} />
          <Text style={styles.stateText}>Couldn&apos;t load reels. Check your connection.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => query.refetch()} testID="reels-module-retry">
            <RefreshCw size={14} color={Colors.black} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : visibleReels.length === 0 ? (
        <View style={styles.stateWrap} testID="reels-module-empty">
          <Clapperboard size={26} color={Colors.textTertiary} />
          <Text style={styles.stateText}>{emptyLabel}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleReels}
          keyExtractor={(item) => item.reel_id}
          renderItem={renderReel}
          contentContainerStyle={styles.feed}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={Colors.primary}
            />
          }
          testID="reels-module-feed"
        />
      )}

      <CommentsModal
        reel={commentsReel}
        deviceKey={deviceKey}
        onClose={() => setCommentsReel(null)}
        onPosted={(reelId, count) => updateReel(reelId, (r) => ({ ...r, comments: count }))}
      />
    </SafeAreaView>
  );
}

function ReelCard({ reel, onLike, onSave, onShare, onComments, onCta }: {
  reel: ReelItem;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onComments: () => void;
  onCta: (action: string) => void;
}) {
  const [playing, setPlaying] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<boolean>(false);
  const typeLabel = REEL_TYPE_LABELS[reel.reel_type] ?? 'Reel';
  const subtitle = reel.project?.title ?? typeLabel;

  return (
    <View style={styles.card} testID={`reel-card-${reel.reel_id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Clapperboard size={16} color={Colors.black} />
        </View>
        <View style={styles.cardHeaderText}>
          <View style={styles.brandRow}>
            <Text style={styles.brandName}>IVX Holdings</Text>
            <BadgeCheck size={14} color="#4A90D9" fill="rgba(74,144,217,0.25)" />
          </View>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            {reel.project?.location ? (
              <>
                <MapPin size={10} color={Colors.textTertiary} />
                <Text style={styles.subtitle} numberOfLines={1}>{reel.project.location}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{typeLabel.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.videoWrap}>
        {videoError ? (
          <View style={styles.videoErrorBox} testID={`reel-video-error-${reel.reel_id}`}>
            <WifiOff size={24} color={Colors.textTertiary} />
            <Text style={styles.stateText}>Video temporarily unavailable</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => setVideoError(false)}>
              <RefreshCw size={14} color={Colors.black} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : playing ? (
          <Video
            source={{ uri: reel.video_url }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            useNativeControls
            onError={(err: string) => {
              console.log('[Reels] playback error:', err?.slice?.(0, 120));
              setVideoError(true);
            }}
          />
        ) : (
          <Pressable
            style={styles.posterWrap}
            onPress={() => setPlaying(true)}
            testID={`reel-play-${reel.reel_id}`}
            accessibilityRole="button"
            accessibilityLabel={`Play reel: ${reel.caption ?? typeLabel}`}
          >
            {reel.thumbnail_url ? (
              <Image source={{ uri: reel.thumbnail_url }} style={styles.poster} resizeMode="cover" />
            ) : (
              <View style={[styles.poster, styles.posterFallback]}>
                <Clapperboard size={30} color={Colors.textTertiary} />
              </View>
            )}
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Play size={26} color="#fff" fill="#fff" />
              </View>
            </View>
          </Pressable>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onLike} testID={`reel-like-${reel.reel_id}`} accessibilityRole="button" accessibilityLabel="Like reel">
          <Heart size={22} color={reel.viewer.liked ? '#FF4D6D' : Colors.text} fill={reel.viewer.liked ? '#FF4D6D' : 'transparent'} />
          <Text style={styles.actionCount}>{reel.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onComments} testID={`reel-comments-${reel.reel_id}`} accessibilityRole="button" accessibilityLabel="View comments">
          <MessageCircle size={22} color={Colors.text} />
          <Text style={styles.actionCount}>{reel.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onShare} testID={`reel-share-${reel.reel_id}`} accessibilityRole="button" accessibilityLabel="Share reel">
          <Share2 size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.actionsSpacer} />
        <TouchableOpacity style={styles.actionBtn} onPress={onSave} testID={`reel-save-${reel.reel_id}`} accessibilityRole="button" accessibilityLabel="Save reel">
          <Bookmark size={22} color={reel.viewer.saved ? Colors.primary : Colors.text} fill={reel.viewer.saved ? Colors.primary : 'transparent'} />
          <Text style={styles.actionCount}>{reel.saves}</Text>
        </TouchableOpacity>
      </View>

      {reel.caption ? <Text style={styles.caption}>{reel.caption}</Text> : null}

      {reel.project ? (
        <View style={styles.investCard} testID={`reel-invest-card-${reel.project.id}`}>
          <Text style={styles.investTitle} numberOfLines={1}>{reel.project.title}</Text>
          {reel.project.location ? (
            <Text style={styles.investLocation} numberOfLines={1}>{reel.project.location}</Text>
          ) : null}
          <View style={styles.metricsRow}>
            <Metric value={formatReelMoney(reel.project.investmentAmount)} label="INVESTMENT" />
            <Metric value={`${reel.project.roiPercent}%`} label="ROI" />
            <Metric value={formatReelMoney(reel.project.salePrice)} label="SALE PRICE" />
          </View>
          <View style={styles.fracRow}>
            <Text style={styles.fracText}>
              Fractional from <Text style={styles.fracStrong}>{`$${reel.project.minInvestment.toFixed(2)}`}</Text>
            </Text>
            {reel.project.minOwnershipPercent ? (
              <Text style={styles.fracText}>
                <Text style={styles.fracStrong}>{reel.project.minOwnershipPercent}</Text> min ownership
              </Text>
            ) : null}
          </View>
          <Text style={styles.developer} numberOfLines={1}>
            Developed by <Text style={styles.fracStrong}>{reel.project.developer}</Text>
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <BadgeCheck size={11} color="#22C55E" />
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          </View>
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => onCta('view_deal')}
              testID={`reel-view-deal-${reel.project.id}`}
              accessibilityRole="button"
              accessibilityLabel={`View deal for ${reel.project.title}`}
            >
              <Text style={styles.secondaryBtnText}>View Deal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => onCta('invest_now')}
              testID={`reel-invest-now-${reel.project.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Invest now in ${reel.project.title}`}
            >
              <Text style={styles.primaryBtnText}>Invest Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.investCard} testID={`reel-cta-card-${reel.reel_id}`}>
          <Text style={styles.investTitle}>{ctaHeadline(reel.reel_type)}</Text>
          <Text style={styles.ctaBody}>{ctaBody(reel.reel_type)}</Text>
          <View style={styles.ctaRow}>
            {reel.cta.secondary ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => onCta(reel.cta.secondary ?? 'view_deals')}>
                <Text style={styles.secondaryBtnText}>{ctaLabel(reel.cta.secondary)}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={() => onCta(reel.cta.primary)} testID={`reel-cta-${reel.reel_id}`}>
              <Text style={styles.primaryBtnText}>{ctaLabel(reel.cta.primary)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function ctaLabel(action: string): string {
  switch (action) {
    case 'invest_now': return 'Invest Now';
    case 'view_deal': return 'View Deal';
    case 'contact_match': return 'Contact IVX';
    case 'submit_listing': return 'Submit Your Property';
    case 'view_projects': return 'View Projects';
    case 'view_tokenized': return 'View Tokenized';
    default: return 'View Live Deals';
  }
}

function ctaHeadline(reelType: string): string {
  switch (reelType) {
    case 'buyer': return 'Looking to buy?';
    case 'seller': return 'Selling a property?';
    case 'construction': return 'Live build progress';
    case 'walkthrough': return 'Property walkthrough';
    case 'tokenized': return 'Tokenized ownership';
    default: return 'Investor opportunity';
  }
}

function ctaBody(reelType: string): string {
  switch (reelType) {
    case 'buyer': return 'IVX matches qualified buyers with verified properties and investment opportunities.';
    case 'seller': return 'Submit your property to IVX and reach verified investors and buyers.';
    case 'construction': return 'Follow real construction progress across IVX development projects.';
    case 'walkthrough': return 'Tour finished and in-progress IVX properties.';
    case 'tokenized': return 'Fractional, tokenized ownership opportunities on verified assets.';
    default: return 'Explore live, verified investment opportunities on the IVX platform.';
  }
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricVal}>{value}</Text>
      <Text style={styles.metricLbl}>{label}</Text>
    </View>
  );
}

function CommentsModal({ reel, deviceKey, onClose, onPosted }: {
  reel: ReelItem | null;
  deviceKey: string | null;
  onClose: () => void;
  onPosted: (reelId: string, count: number) => void;
}) {
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [posting, setPosting] = useState<boolean>(false);

  const reelId = reel?.reel_id ?? null;

  useEffect(() => {
    if (!reelId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchReelComments(reelId)
      .then((rows) => { if (!cancelled) setComments(rows); })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load comments');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reelId]);

  const submit = useCallback(async () => {
    if (!reelId || !deviceKey || text.trim().length === 0 || posting) return;
    setPosting(true);
    try {
      const { comment, count } = await postReelComment(reelId, deviceKey, name.trim() || 'Guest', text.trim());
      if (comment) setComments((prev) => [comment, ...prev]);
      setText('');
      onPosted(reelId, count);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Comment failed');
    } finally {
      setPosting(false);
    }
  }, [reelId, deviceKey, text, name, posting, onPosted]);

  return (
    <Modal visible={reel !== null} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.commentsBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.commentsSheet} testID="reel-comments-sheet">
          <View style={styles.commentsHeader}>
            <Text style={styles.commentsTitle}>Comments</Text>
            <TouchableOpacity onPress={onClose} testID="reel-comments-close" accessibilityRole="button" accessibilityLabel="Close comments">
              <X size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.commentsState}><ActivityIndicator size="small" color={Colors.primary} /></View>
          ) : loadError ? (
            <View style={styles.commentsState}><Text style={styles.stateText}>{loadError}</Text></View>
          ) : comments.length === 0 ? (
            <View style={styles.commentsState}><Text style={styles.stateText}>No comments yet. Be the first.</Text></View>
          ) : (
            <ScrollView style={styles.commentsList}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.commentRow}>
                  <Text style={styles.commentAuthor}>{comment.author_name}</Text>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <TextInput
            style={styles.commentNameInput}
            placeholder="Your name (optional)"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
            maxLength={60}
            testID="reel-comment-name"
          />
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor={Colors.textTertiary}
              value={text}
              onChangeText={setText}
              maxLength={500}
              multiline
              testID="reel-comment-input"
            />
            <TouchableOpacity
              style={[styles.commentSend, (text.trim().length === 0 || posting) && styles.commentSendDisabled]}
              onPress={() => void submit()}
              disabled={text.trim().length === 0 || posting}
              testID="reel-comment-send"
              accessibilityRole="button"
              accessibilityLabel="Post comment"
            >
              {posting ? <ActivityIndicator size="small" color={Colors.black} /> : <Send size={16} color={Colors.black} />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: Colors.text, fontSize: 19, fontWeight: '900' as const },
  headerCountPill: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerCountText: { color: Colors.primary, fontSize: 10, fontWeight: '900' as const, letterSpacing: 0.6 },
  chipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  chip: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const },
  chipTextActive: { color: Colors.black },
  projectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  projectChipText: { flex: 1, color: Colors.textSecondary, fontSize: 12 },
  projectChipStrong: { color: Colors.primary, fontWeight: '800' as const },
  projectChipClear: { color: Colors.primary, fontSize: 12, fontWeight: '800' as const, textDecorationLine: 'underline' as const },
  feed: { paddingHorizontal: 16, paddingBottom: 32, gap: 18 },
  card: {
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 12,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1, gap: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandName: { color: Colors.text, fontSize: 14, fontWeight: '800' as const },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subtitle: { color: Colors.textTertiary, fontSize: 11, flexShrink: 1 },
  typePill: {
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typePillText: { color: Colors.primary, fontSize: 9, fontWeight: '900' as const, letterSpacing: 0.8 },
  videoWrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 440 },
  posterWrap: { width: '100%', aspectRatio: 9 / 16, maxHeight: 440 },
  poster: { width: '100%', height: '100%' },
  posterFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundTertiary },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  videoErrorBox: {
    width: '100%',
    aspectRatio: 9 / 16,
    maxHeight: 440,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.backgroundTertiary,
  },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 44 },
  actionCount: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' as const },
  actionsSpacer: { flex: 1 },
  caption: { color: Colors.text, fontSize: 13, lineHeight: 19 },
  investCard: {
    borderRadius: 14,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 14,
    gap: 8,
  },
  investTitle: { color: Colors.text, fontSize: 16, fontWeight: '900' as const },
  investLocation: { color: Colors.textTertiary, fontSize: 12 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  metricVal: { color: Colors.primary, fontSize: 14, fontWeight: '800' as const },
  metricLbl: { color: Colors.textTertiary, fontSize: 9, letterSpacing: 0.8, marginTop: 2 },
  fracRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  fracText: { color: Colors.textSecondary, fontSize: 12 },
  fracStrong: { color: Colors.primary, fontWeight: '800' as const },
  developer: { color: Colors.textTertiary, fontSize: 11 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  liveBadgeText: { color: '#22C55E', fontSize: 9, fontWeight: '900' as const, letterSpacing: 1.2 },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  verifiedText: { color: '#22C55E', fontSize: 9, fontWeight: '900' as const, letterSpacing: 0.8 },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  ctaBody: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.5)',
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '800' as const },
  primaryBtn: {
    flex: 1.2,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryBtnText: { color: Colors.black, fontSize: 13, fontWeight: '900' as const },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
  },
  stateText: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center' as const },
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
  retryText: { color: Colors.black, fontSize: 13, fontWeight: '700' as const },
  skeletonCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 12,
    gap: 10,
  },
  skeletonVideo: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: Colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonLine: { width: '80%', height: 12, borderRadius: 6, backgroundColor: Colors.backgroundTertiary },
  commentsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  commentsSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 10,
    maxHeight: '75%',
  },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentsTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' as const },
  commentsState: { paddingVertical: 26, alignItems: 'center' },
  commentsList: { maxHeight: 260 },
  commentRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, gap: 2 },
  commentAuthor: { color: Colors.primary, fontSize: 12, fontWeight: '800' as const },
  commentBody: { color: Colors.text, fontSize: 13, lineHeight: 19 },
  commentNameInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundTertiary,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  commentInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundTertiary,
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    maxHeight: 90,
  },
  commentSend: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendDisabled: { opacity: 0.5 },
});
