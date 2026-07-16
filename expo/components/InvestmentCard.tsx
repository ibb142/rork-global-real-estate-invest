/**
 * InvestmentCard — the ONE canonical compact investment card for IVX.
 *
 * Used by:
 *   • Main/Home feed (InvestorFirstFeed) for deal blocks
 *   • Search results
 *   • Saved deals
 *   • Portfolio deal previews
 *
 * Visual design (owner-approved):
 *   Compact card with horizontal image carousel (up to 8 photos)
 *   Image counter pill (top-right)
 *   Status badge (top-left)
 *   Property title + location
 *   ROI / Min Investment metrics row
 *   Category chips (Tokenized / JV Deal / Buyer)
 *   Action row: Like, Comment, Save, Share
 *   CTA buttons: View Deal + Invest Now
 *   NO full-screen reel layout — always a card in a scroll feed
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  ScrollView,
  Image as RNImage,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MapPin,
  TrendingUp,
  Hexagon,
  Users,
  Home as HomeIcon,
  ChevronRight,
  ImageOff,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatCount, compactCurrency } from '@/lib/reel-formatters';

export interface InvestmentCardData {
  dealId: string;
  title: string;
  location: string | null;
  photos: string[];
  roi: number | null;
  minimumInvestment: number | null;
  status: string;
  category: string | null;
  dealUrl: string | null;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  isLiked: boolean;
  isSaved: boolean;
}

export interface InvestmentCardProps {
  data: InvestmentCardData;
  onOpenDeal: (data: InvestmentCardData) => void;
  onInvest: (data: InvestmentCardData) => void;
  onLike: (data: InvestmentCardData) => void;
  onComment: (data: InvestmentCardData) => void;
  onSave: (data: InvestmentCardData) => void;
  onShare: (data: InvestmentCardData) => void;
  testIDPrefix?: string;
}

interface CategoryChip {
  id: string;
  label: string;
  icon: React.ReactNode;
  tint: string;
}

function useCategoryChips(dealType: string | null | undefined): CategoryChip[] {
  const t = (dealType ?? '').toLowerCase();
  const tokenized: CategoryChip = {
    id: 'tokenized',
    label: 'Tokenized',
    icon: <Hexagon size={13} color={Colors.primary} />,
    tint: Colors.primary,
  };
  const jv: CategoryChip = {
    id: 'jv',
    label: 'JV Deal',
    icon: <Users size={13} color={Colors.blue} />,
    tint: Colors.blue,
  };
  const buyer: CategoryChip = {
    id: 'buyer',
    label: 'Buyer',
    icon: <HomeIcon size={13} color={Colors.green} />,
    tint: Colors.green,
  };
  switch (t) {
    case 'jv':
    case 'equity_split':
    case 'hybrid':
      return [tokenized, jv, buyer];
    case 'development':
    case 'new_construction':
    case 'rehab_construction':
      return [jv, tokenized, buyer];
    case 'profit_sharing':
      return [tokenized, buyer, jv];
    default:
      return [tokenized, jv, buyer];
  }
}

const MAX_IMAGES = 8;
const CAROUSEL_HEIGHT = 240;

const InvestmentCard = memo(function InvestmentCard({
  data,
  onOpenDeal,
  onInvest,
  onLike,
  onComment,
  onSave,
  onShare,
  testIDPrefix = 'investment-card',
}: InvestmentCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(screenWidth - 32, 520);

  const photos = useMemo(
    () => (data.photos && data.photos.length > 0 ? data.photos.slice(0, MAX_IMAGES) : []),
    [data.photos],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [liked, setLiked] = useState(data.isLiked);
  const [likeCount, setLikeCount] = useState(data.likeCount);
  const [saved, setSaved] = useState(data.isSaved);
  const [saveCount, setSaveCount] = useState(data.saveCount);

  const categoryChips = useCategoryChips(data.category);
  const isActiveStatus = (data.status ?? 'published') === 'published';

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number }; layoutMeasurement: { width: number } } }) => {
    const x = event.nativeEvent.contentOffset.x;
    const w = event.nativeEvent.layoutMeasurement.width;
    if (w > 0) {
      const idx = Math.round(x / w);
      if (idx >= 0 && idx < photos.length && idx !== activeIndex) {
        setActiveIndex(idx);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, [photos.length, activeIndex]);

  const handleLike = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !liked;
    setLiked(next);
    setLikeCount((p: number) => p + (next ? 1 : -1));
    onLike(data);
  }, [liked, onLike, data]);

  const handleSave = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !saved;
    setSaved(next);
    setSaveCount((p: number) => p + (next ? 1 : -1));
    onSave(data);
  }, [saved, onSave, data]);

  const handleShare = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onShare(data);
  }, [onShare, data]);

  const handleComment = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onComment(data);
  }, [onComment, data]);

  const handleViewDeal = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onOpenDeal(data);
  }, [onOpenDeal, data]);

  const handleInvestNow = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onInvest(data);
  }, [onInvest, data]);

  return (
    <View
      style={[styles.container, { width: cardWidth }]}
      testID={`${testIDPrefix}-${data.dealId}`}
    >
      {/* Image Carousel */}
      <View style={styles.carouselContainer}>
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
            bounces={false}
            style={styles.carousel}
          >
            {photos.map((uri: string, i: number) => (
              <View key={i} style={[styles.imageFrame, { width: cardWidth }]}>
                <Image
                  source={{ uri }}
                  style={styles.image}
                  contentFit="cover"
                  transition={150}
                  testID={`${testIDPrefix}-img-${i}`}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.noImage, { width: cardWidth }]}>
            <ImageOff size={28} color={Colors.textTertiary} />
            <Text style={styles.noImageText}>No photos available</Text>
          </View>
        )}

        {/* Status badge */}
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isActiveStatus ? Colors.success : Colors.warning }]} />
          <Text style={styles.statusText}>{isActiveStatus ? 'ACTIVE' : 'PENDING'}</Text>
        </View>

        {/* Image counter */}
        {photos.length > 1 && (
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {activeIndex + 1}/{photos.length}
            </Text>
          </View>
        )}

        {/* Pagination dots */}
        {photos.length > 1 && (
          <View style={styles.dotsRow}>
            {photos.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}
      </View>

      {/* Card body */}
      <View style={styles.body}>
        {/* Title + Location */}
        <Text style={styles.title} numberOfLines={1}>
          {data.title}
        </Text>
        {data.location ? (
          <View style={styles.locationRow}>
            <MapPin size={13} color={Colors.textSecondary} />
            <Text style={styles.locationText} numberOfLines={1}>{data.location}</Text>
          </View>
        ) : null}

        {/* Metrics */}
        <View style={styles.metricsRow}>
          {data.roi != null && data.roi > 0 ? (
            <View style={styles.metric}>
              <TrendingUp size={14} color={Colors.primary} />
              <Text style={styles.metricValue}>{data.roi}%</Text>
              <Text style={styles.metricLabel}>ROI</Text>
            </View>
          ) : null}
          {data.minimumInvestment != null && data.minimumInvestment > 0 ? (
            <View style={styles.metricDivider} />
          ) : null}
          {data.minimumInvestment != null && data.minimumInvestment > 0 ? (
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{compactCurrency(data.minimumInvestment)}</Text>
              <Text style={styles.metricLabel}>MIN INVEST</Text>
            </View>
          ) : null}
        </View>

        {/* Category chips */}
        <View style={styles.chipsRow}>
          {categoryChips.map((chip) => (
            <View key={chip.id} style={[styles.chip, { borderColor: `${chip.tint}44` }]}>
              {chip.icon}
              <Text style={[styles.chipLabel, { color: chip.tint }]}>{chip.label}</Text>
            </View>
          ))}
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleLike}
            testID={`${testIDPrefix}-like-${data.dealId}`}
          >
            <Heart
              size={20}
              color={liked ? Colors.error : Colors.textSecondary}
              fill={liked ? Colors.error : 'transparent'}
            />
            <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleComment}
            testID={`${testIDPrefix}-comment-${data.dealId}`}
          >
            <MessageCircle size={20} color={Colors.textSecondary} />
            <Text style={styles.actionCount}>{formatCount(data.commentCount)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleSave}
            testID={`${testIDPrefix}-save-${data.dealId}`}
          >
            <Bookmark
              size={20}
              color={saved ? Colors.primary : Colors.textSecondary}
              fill={saved ? Colors.primary : 'transparent'}
            />
            <Text style={styles.actionCount}>{formatCount(saveCount)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleShare}
            testID={`${testIDPrefix}-share-${data.dealId}`}
          >
            <Share2 size={20} color={Colors.textSecondary} />
            <Text style={styles.actionCount}>{formatCount(data.shareCount)}</Text>
          </TouchableOpacity>
        </View>

        {/* CTA buttons */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.viewDealBtn}
            onPress={handleViewDeal}
            activeOpacity={0.85}
            testID={`${testIDPrefix}-view-deal-${data.dealId}`}
          >
            <Text style={styles.viewDealText}>View Deal</Text>
            <ChevronRight size={16} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.investNowBtn}
            onPress={handleInvestNow}
            activeOpacity={0.85}
            testID={`${testIDPrefix}-invest-${data.dealId}`}
          >
            <Text style={styles.investNowText}>Invest Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

export default InvestmentCard;

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  carouselContainer: {
    position: 'relative',
    height: CAROUSEL_HEIGHT,
    backgroundColor: '#0a0a0a',
  },
  carousel: {
    flex: 1,
  },
  imageFrame: {
    height: CAROUSEL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    height: CAROUSEL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  noImageText: {
    color: Colors.textTertiary,
    fontSize: 13,
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  counterPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  counterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 18,
    backgroundColor: Colors.primary,
  },
  body: {
    padding: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  locationText: {
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 10,
  },
  metric: {
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  actionCount: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  viewDealBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  viewDealText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  investNowBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  investNowText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800' as const,
  },
});
