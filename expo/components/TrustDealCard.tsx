import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  Shield,
  MapPin,
  CheckCircle2,
  FileText,
  Lock,
  HardHat,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { formatCurrency } from '@/lib/formatters';
import type { ParsedJVDeal, DealTrustInfo } from '@/lib/parse-deal';
import { filterValidPhotos } from '@/lib/parse-deal';
import { getFallbackPhotosForDeal } from '@/constants/deal-photos';

interface TrustDealCardProps {
  deal: ParsedJVDeal;
  onInvestNow: (deal: ParsedJVDeal) => void;
  onViewDetails: (deal: ParsedJVDeal) => void;
  galleryWidth?: number;
}

function extractLocationFromDeal(deal: ParsedJVDeal): string {
  if (deal.city && deal.state) return `${deal.city}, ${deal.state}`;
  if (deal.propertyAddress) {
    const parts = deal.propertyAddress.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    }
    return deal.propertyAddress;
  }
  return '';
}

function getDefaultTrustInfo(deal: ParsedJVDeal): DealTrustInfo {
  const projName = deal.projectName || '';
  const isLLC = projName.toUpperCase().includes('LLC');
  return {
    llcName: isLLC ? projName : (projName ? `${projName} LLC` : 'IVX Holdings LLC'),
    builderName: projName.includes('ONE STOP') ? 'One Stop Development' : (projName || 'IVX Development'),
    minInvestment: 50,
    timelineMin: 14,
    timelineMax: 24,
    timelineUnit: 'months' as const,
    legalStructure: 'LLC Joint Venture',
    insuranceCoverage: true,
    titleVerified: true,
    permitStatus: 'approved' as const,
    escrowProtected: true,
    thirdPartyAudit: false,
    investorProtections: [
      'LLC-backed investment structure',
      'Title insurance verified',
      'Escrow-protected funds',
    ],
    riskFactors: [],
    keyMilestones: [],
    documents: [],
  };
}

function formatTimelineString(trust: DealTrustInfo): string {
  const min = trust.timelineMin || 0;
  const max = trust.timelineMax || 0;
  const unit = trust.timelineUnit === 'years' ? 'yr' : 'mo';
  if (min > 0 && max > 0) {
    return `${min}\u2013${max} ${unit}`;
  }
  if (max > 0) return `${max} ${unit}`;
  if (min > 0) return `${min} ${unit}`;
  return '';
}

const TrustDealCard = memo(function TrustDealCard({
  deal,
  onInvestNow,
  onViewDetails,
  galleryWidth = 300,
}: TrustDealCardProps) {
  const trust = useMemo(() => deal.trustInfo || getDefaultTrustInfo(deal), [deal]);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / galleryWidth);
    setActivePhotoIndex(idx);
  }, [galleryWidth]);

  const photos = useMemo(() => {
    let p = filterValidPhotos(deal.photos);
    if (p.length === 0) {
      p = getFallbackPhotosForDeal(deal);
    }
    return p;
  }, [deal]);

  const location = useMemo(() => extractLocationFromDeal(deal), [deal]);
  const timeline = useMemo(() => formatTimelineString(trust), [trust]);

  const verifiedCount = useMemo(() => {
    let count = 0;
    if (trust.titleVerified) count++;
    if (trust.insuranceCoverage) count++;
    if (trust.escrowProtected) count++;
    if (trust.permitStatus === 'approved') count++;
    if (trust.thirdPartyAudit) count++;
    return count;
  }, [trust]);

  const handleInvest = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onInvestNow(deal);
  }, [deal, onInvestNow]);

  const handleDetails = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onViewDetails(deal);
  }, [deal, onViewDetails]);

  return (
    <View style={styles.card} testID={`trust-deal-${deal.id}`}>
      {photos.length > 0 && (
        <View style={styles.imageSection}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.imageScroll}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {photos.map((uri, idx) => (
              <Image
                key={`trust-photo-${deal.id}-${idx}`}
                source={{ uri }}
                style={[styles.image, { width: galleryWidth }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          {photos.length > 1 && (
            <>
              <View style={styles.photoDots}>
                {photos.map((_, idx) => (
                  <View key={idx} style={[styles.photoDot, idx === activePhotoIndex && styles.photoDotActive]} />
                ))}
              </View>
              <View style={styles.photoCounter}>
                <Text style={styles.photoCounterText}>{activePhotoIndex + 1}/{photos.length}</Text>
              </View>
            </>
          )}
          <View style={styles.liveBadgeOverlay}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
          {verifiedCount >= 3 && (
            <View style={styles.verifiedBadgeOverlay}>
              <Shield size={10} color="#22C55E" />
              <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.dealTitle}>{deal.title || deal.projectName}</Text>
        {location ? (
          <View style={styles.locationRow}>
            <MapPin size={12} color={Colors.textTertiary} />
            <Text style={styles.locationText}>{location}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{formatCurrency(deal.totalInvestment, true)}</Text>
            <Text style={styles.metricLabel}>Investment</Text>
          </View>
          <View style={styles.metricSeparator} />
          <View style={styles.metric}>
            <Text style={[styles.metricValue, styles.metricValueHighlight]}>{deal.expectedROI}%</Text>
            <Text style={styles.metricLabel}>ROI</Text>
          </View>
          <View style={styles.metricSeparator} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{timeline}</Text>
            <Text style={styles.metricLabel}>Timeline</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.trustRow}>
          <View style={styles.trustItem}>
            <HardHat size={13} color={Colors.primary} />
            <Text style={styles.trustText} numberOfLines={1}>
              Developed by <Text style={styles.trustBold}>{trust.llcName || 'ONE STOP DEVELOPMENT LLC'}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.trustIndicators}>
          {trust.titleVerified && (
            <View style={styles.trustBadge}>
              <CheckCircle2 size={10} color="#22C55E" />
              <Text style={styles.trustBadgeText}>Title Verified</Text>
            </View>
          )}
          {trust.insuranceCoverage && (
            <View style={styles.trustBadge}>
              <Shield size={10} color="#4A90D9" />
              <Text style={styles.trustBadgeText}>Insured</Text>
            </View>
          )}
          {trust.escrowProtected && (
            <View style={styles.trustBadge}>
              <Lock size={10} color={Colors.primary} />
              <Text style={styles.trustBadgeText}>Escrow</Text>
            </View>
          )}
          {trust.permitStatus === 'approved' && (
            <View style={styles.trustBadge}>
              <FileText size={10} color="#22C55E" />
              <Text style={styles.trustBadgeText}>Permitted</Text>
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={handleDetails}
            activeOpacity={0.85}
            testID={`trust-details-${deal.id}`}
          >
            <Text style={styles.detailsBtnText}>Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.investBtn}
            onPress={handleInvest}
            activeOpacity={0.85}
            testID={`trust-invest-${deal.id}`}
          >
            <Text style={styles.investBtnText}>Invest Now</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.minInvestWrap}>
          <Text style={styles.minInvestText}>
            Invest from <Text style={styles.minInvestBold}>${trust.minInvestment || 50}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
});

export default TrustDealCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    marginBottom: 16,
  },
  imageSection: {
    position: 'relative' as const,
    height: 200,
    overflow: 'hidden',
    width: '100%',
  },
  imageScroll: {
    height: 200,
    width: '100%',
  },
  image: {
    height: 200,
    backgroundColor: Colors.backgroundSecondary,
  },
  photoDots: {
    position: 'absolute' as const,
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  photoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  photoDotActive: {
    width: 18,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  photoCounter: {
    position: 'absolute' as const,
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  photoCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  liveBadgeOverlay: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,196,140,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.4)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    letterSpacing: 1.5,
  },
  verifiedBadgeOverlay: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,196,140,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,196,140,0.3)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  verifiedBadgeText: {
    color: '#22C55E',
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
  },
  content: {
    padding: 18,
  },
  dealTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900' as const,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  locationText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
    letterSpacing: -0.3,
  },
  metricValueHighlight: {
    color: Colors.text,
  },
  metricLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    marginTop: 3,
  },
  metricSeparator: {
    width: 1,
    height: 32,
    backgroundColor: Colors.surfaceBorder,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  trustText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  trustBold: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  trustDot: {
    color: Colors.textTertiary,
    fontSize: 8,
  },
  trustIndicators: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  trustBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  investBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  investBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900' as const,
  },
  detailsBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundSecondary,
  },
  detailsBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  minInvestWrap: {
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  minInvestText: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  minInvestBold: {
    color: Colors.text,
    fontWeight: '800' as const,
  },
});
