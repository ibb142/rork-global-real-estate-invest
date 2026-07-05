/**
 * Instagram-style property video card — Android/Expo mirror of the iOS
 * `DealVideoCard.swift`: header row with IVX avatar, autoplaying muted looping
 * video, action rail (like / comment / share / save), likes line, caption,
 * and deal chips with a gold "View Deal" CTA.
 *
 * Consumes the same production feed as iOS + landing:
 *   GET https://api.ivxholding.com/api/ivx/video-platform/feed
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { useRouter } from 'expo-router';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Volume2,
  VolumeX,
  MoreHorizontal,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import type { FeedVideo } from '@/lib/video-feed';

const MEDIA_HEIGHT = 230;

function compactCurrency(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return `$${Math.round(value)}`;
}

function Chip({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

export default function DealVideoCard({ video }: { video: FeedVideo }) {
  const router = useRouter();
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [liked, setLiked] = useState<boolean>(false);

  const deal = video.deal ?? null;
  const playbackUri = video.hls_url ?? video.video_url;
  const posterUri = video.poster_url ?? video.thumbnail_url ?? video.preview_blur_url ?? undefined;

  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  const handleLike = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLiked(prev => !prev);
  }, []);

  const handleShare = useCallback(() => {
    const url = deal?.url ?? 'https://ivxholding.com';
    void Share.share({ message: `${video.title ?? 'IVX Property'} — ${url}` }).catch(() => {});
  }, [deal, video.title]);

  const handleViewDeal = useCallback(() => {
    if (deal?.id) {
      router.push({ pathname: '/jv-invest', params: { jvId: deal.id } } as any);
    }
  }, [deal, router]);

  const likeTotal = (video.like_count ?? 0) + (liked ? 1 : 0);

  return (
    <View style={styles.card} testID={`deal-video-card-${video.id}`}>
      {/* Header — avatar, account name, property */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>IVX</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.accountName}>ivxholdings</Text>
          <Text style={styles.propertyName} numberOfLines={1}>
            {deal?.title ?? video.title ?? 'IVX Holdings'}
          </Text>
        </View>
        <MoreHorizontal size={18} color={Colors.textSecondary} />
      </View>

      {/* Media — autoplay muted loop, tap toggles sound */}
      <TouchableOpacity activeOpacity={1} onPress={toggleMute} style={styles.media}>
        <Video
          source={{ uri: playbackUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted={isMuted}
          posterSource={posterUri ? { uri: posterUri } : undefined}
          usePoster={!!posterUri}
        />
        <TouchableOpacity style={styles.muteBtn} onPress={toggleMute} testID={`deal-video-mute-${video.id}`}>
          {isMuted ? <VolumeX size={14} color="#fff" /> : <Volume2 size={14} color="#fff" />}
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Action rail — like / comment / share / save */}
      <View style={styles.actionRail}>
        <TouchableOpacity onPress={handleLike} testID={`deal-video-like-${video.id}`}>
          <Heart
            size={24}
            color={liked ? '#FF3B5C' : '#fff'}
            fill={liked ? '#FF3B5C' : 'transparent'}
          />
        </TouchableOpacity>
        <MessageCircle size={24} color="#fff" />
        <TouchableOpacity onPress={handleShare} testID={`deal-video-share-${video.id}`}>
          <Send size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.railSpacer} />
        <Bookmark size={24} color="#fff" />
      </View>

      {/* Likes line */}
      <Text style={styles.likesLine}>
        {likeTotal} like{likeTotal === 1 ? '' : 's'}
      </Text>

      {/* Caption */}
      <Text style={styles.caption} numberOfLines={2}>
        <Text style={styles.captionBold}>ivxholdings </Text>
        {video.title ?? 'Property tour'}
      </Text>

      {/* Deal chips + CTA */}
      {deal ? (
        <View style={styles.dealSection}>
          <View style={styles.chipsRow}>
            {deal.expected_roi ? <Chip label="ROI" value={`${deal.expected_roi}%`} tint="#22C55E" /> : null}
            {deal.price && deal.price > 0 ? <Chip label="Value" value={compactCurrency(deal.price)} tint={Colors.primary} /> : null}
            {deal.min_investment && deal.min_investment > 0 ? (
              <Chip label="Min" value={compactCurrency(deal.min_investment)} tint="#fff" />
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.viewDealBtn}
            onPress={handleViewDeal}
            activeOpacity={0.85}
            testID={`deal-video-cta-${video.id}`}
          >
            <Text style={styles.viewDealText}>View Deal</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ height: 12 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden' as const,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '66',
  },
  avatarText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900' as const,
  },
  headerText: {
    flex: 1,
  },
  accountName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  propertyName: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  media: {
    height: MEDIA_HEIGHT,
    backgroundColor: '#000',
  },
  muteBtn: {
    position: 'absolute' as const,
    right: 10,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  railSpacer: {
    flex: 1,
  },
  likesLine: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  caption: {
    color: Colors.text,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingTop: 3,
  },
  captionBold: {
    fontWeight: '700' as const,
  },
  dealSection: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  chipLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
  },
  chipValue: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  viewDealBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewDealText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700' as const,
  },
});
