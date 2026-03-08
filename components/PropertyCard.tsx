/**
 * =============================================================================
 * PROPERTY CARD COMPONENT - components/PropertyCard.tsx
 * =============================================================================
 * 
 * Reusable card component for displaying property investment opportunities.
 * Used throughout the app on Discover, Portfolio, and Search screens.
 * 
 * VARIANTS:
 * ---------
 * 1. 'full' (default) - Large card with image slider, full stats, progress bar
 *    - Image slider with multiple photos
 *    - Status badge (LIVE, COMING SOON, FUNDED, CLOSED)
 *    - Property type tag
 *    - Location with icon
 *    - Stats: Price/share, Yield, IRR, Occupancy
 *    - Funding progress bar with amounts
 * 
 * 2. 'compact' - Small horizontal card for carousels/lists
 *    - Single image
 *    - Name and location
 *    - Price and yield only
 * 
 * PROPS:
 * ------
 * - property: Property - The property data to display (from @/types)
 * - variant?: 'full' | 'compact' - Card size/layout (default: 'full')
 * 
 * NAVIGATION:
 * -----------
 * Tapping the card navigates to /property/[id] detail page.
 * 
 * PERFORMANCE:
 * ------------
 * - Uses React.memo() to prevent unnecessary re-renders
 * - useMemo() for computed values (fundedPercent, statusBadge)
 * - useCallback() for navigation handler
 * 
 * USAGE:
 * ------
 * import PropertyCard from '@/components/PropertyCard';
 * 
 * <PropertyCard property={property} />              // Full card
 * <PropertyCard property={property} variant="compact" />  // Compact card
 * =============================================================================
 */

import React, { useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { MapPin, TrendingUp, Building2, Brain } from 'lucide-react-native';
import { useRouter, Href } from 'expo-router';
import { Property } from '@/types';
import Colors from '@/constants/colors';
import { useTranslation } from '@/lib/i18n-context';
import { TranslationKeys } from '@/constants/translations';
import ImageSlider from './ImageSlider';

interface PropertyCardProps {
  property: Property;
  variant?: 'full' | 'compact';
  isCompact?: boolean;
}

function computeAIScore(property: Property): { score: number; label: string; color: string } {
  const yieldVal = property.yield ?? 0;
  const irrVal = property.irr ?? 0;
  const occupancy = property.occupancy ?? 0;
  const funded = property.targetRaise ? ((property.currentRaise ?? 0) / property.targetRaise) * 100 : 0;

  let score = 0;
  score += Math.min(yieldVal * 4, 30);
  score += Math.min(irrVal * 2, 25);
  score += Math.min(occupancy * 0.3, 25);
  score += Math.min(funded * 0.2, 20);
  score = Math.min(99, Math.max(40, Math.round(score)));

  if (score >= 85) return { score, label: 'Strong Buy', color: '#00C48C' };
  if (score >= 70) return { score, label: 'Buy', color: '#4ECDC4' };
  if (score >= 55) return { score, label: 'Hold', color: '#FFB800' };
  return { score, label: 'Watch', color: '#FF6B6B' };
}

const PROPERTY_TYPE_MAP: Record<string, TranslationKeys> = {
  'commercial': 'typeCommercial',
  'residential': 'typeResidential',
  'industrial': 'typeIndustrial',
  'mixed use': 'typeMixedUse',
  'mixed_use': 'typeMixedUse',
  'retail': 'typeRetail',
  'hospitality': 'typeHospitality',
  'office': 'typeOffice',
  'land': 'typeLand',
};

const PropertyCard = memo(function PropertyCard({ property, variant = 'full', isCompact = false }: PropertyCardProps) {
  const isXs = isCompact;
  const router = useRouter();
  const { t } = useTranslation();

  const handlePress = useCallback(() => {
    router.push(`/property/${property.id}` as Href);
  }, [property.id, router]);

  const fundedPercent = useMemo(() => {
    const target = property?.targetRaise ?? 0;
    if (!target || typeof property?.currentRaise !== 'number') return 0;
    return Math.min(100, Math.round((property.currentRaise / target) * 100));
  }, [property?.currentRaise, property?.targetRaise]);

  const statusBadge = useMemo(() => {
    const status = (property?.status ?? '').toString().toLowerCase();
    switch (status) {
      case 'live':
        return { text: t('liveStatus'), color: Colors.success };
      case 'coming_soon':
        return { text: t('comingSoon').toUpperCase(), color: Colors.warning };
      case 'funded':
        return { text: t('funded').toUpperCase(), color: Colors.primary };
      default:
        return { text: t('closedStatus'), color: Colors.textTertiary };
    }
  }, [property?.status, t]);

  const propertyTypeLabel = useMemo(() => {
    const key = PROPERTY_TYPE_MAP[(property?.propertyType ?? '').toLowerCase()];
    return key ? t(key) : (property?.propertyType ?? '');
  }, [property?.propertyType, t]);

  const aiScore = useMemo(() => computeAIScore(property), [property]);

  if (variant === 'compact') {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, { width: isXs ? 140 : 160 }]}
        onPress={handlePress}
        activeOpacity={0.8}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`${property.name} in ${property.city}, ${property.pricePerShare.toFixed(2)} dollars per share, ${property.yield}% yield`}
        accessibilityHint="Opens property details"
        testID={`property-card-compact-${property.id}`}
      >
        <View>
          <Image
            source={{ uri: (property.images && property.images[0]) || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400' }}
            style={[styles.compactImage, { height: isXs ? 85 : 100 }]}
            accessibilityLabel={`Photo of ${property.name}`}
          />
          <View style={[styles.aiScoreBadgeCompact, { backgroundColor: aiScore.color }]}>
            <Brain size={8} color={Colors.black} />
            <Text style={styles.aiScoreTextCompact}>{aiScore.score}</Text>
          </View>
        </View>
        <View style={[styles.compactContent, { padding: isXs ? 8 : 10 }]}>
          <Text style={[styles.compactName, { fontSize: isXs ? 13 : 15 }]} numberOfLines={1}>
            {property.name}
          </Text>
          <View style={styles.compactLocation}>
            <MapPin size={isXs ? 10 : 12} color={Colors.textTertiary} />
            <Text style={[styles.compactLocationText, { fontSize: isXs ? 10 : 11 }]}>{property.city}</Text>
          </View>
          <View style={styles.compactStats}>
            <Text style={[styles.compactPrice, { fontSize: isXs ? 12 : 14 }]}>${property.pricePerShare.toFixed(2)}</Text>
            <Text style={[styles.compactYield, { fontSize: isXs ? 10 : 11 }]}>{property.yield}% {t('yield')}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.95}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${property.name}, ${property.propertyType} in ${property.city}, ${property.country}. ${property.pricePerShare.toFixed(2)} dollars per share, ${property.yield}% yield, ${property.irr}% IRR, ${fundedPercent}% funded`}
      accessibilityHint="Opens property details"
      testID={`property-card-${property.id}`}
    >
      <View style={styles.imageWrapper}>
        <ImageSlider images={Array.isArray(property.images) && property.images.length > 0 ? property.images : ['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800']} height={isXs ? 200 : 240} />
        <View style={[styles.statusBadge, { backgroundColor: statusBadge.color }]}>
          <Text style={styles.statusText}>{statusBadge.text}</Text>
        </View>
        <View style={[styles.aiScoreBadgeFull, { backgroundColor: aiScore.color }]}>
          <Brain size={11} color={Colors.black} />
          <Text style={styles.aiScoreTextFull}>{aiScore.score}</Text>
          <Text style={styles.aiScoreLabelFull}>{aiScore.label}</Text>
        </View>
      </View>

      <View style={[styles.content, { padding: isXs ? 12 : 16 }]}>
        <View style={styles.header}>
          <Text style={[styles.name, { fontSize: isXs ? 18 : 22 }]} numberOfLines={1}>{property.name}</Text>
          <View style={styles.typeTag}>
            <Building2 size={12} color={Colors.primary} />
            <Text style={styles.typeText}>{propertyTypeLabel}</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <MapPin size={14} color={Colors.textSecondary} />
          <Text style={styles.location}>{property.city}, {property.country}</Text>
        </View>

        <View style={[styles.statsRow, { paddingVertical: isXs ? 10 : 12 }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: isXs ? 14 : 16 }]}>${property.pricePerShare.toFixed(2)}</Text>
            <Text style={[styles.statLabel, { fontSize: isXs ? 10 : 11 }]}>{t('perShare')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: isXs ? 14 : 16 }]}>{property.yield}%</Text>
            <Text style={[styles.statLabel, { fontSize: isXs ? 10 : 11 }]}>{t('yield')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { fontSize: isXs ? 14 : 16 }]}>{property.irr}%</Text>
            <Text style={[styles.statLabel, { fontSize: isXs ? 10 : 11 }]}>{t('irr')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <View style={styles.occupancyRow}>
              <TrendingUp size={isXs ? 12 : 14} color={Colors.success} />
              <Text style={[styles.statValue, { fontSize: isXs ? 14 : 16, color: Colors.success }]}>
                {property.occupancy}%
              </Text>
            </View>
            <Text style={[styles.statLabel, { fontSize: isXs ? 10 : 11 }]}>{t('occupancy')}</Text>
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>
              ${((property?.currentRaise ?? 0) / 1000000).toFixed(2)}M {t('raised')}
            </Text>
            <Text style={styles.progressPercent}>{fundedPercent}%</Text>
          </View>
          <View
            style={styles.progressBar}
            accessible={true}
            accessibilityRole="progressbar"
            accessibilityLabel={`Funding progress: ${fundedPercent}% of target raised`}
            accessibilityValue={{ min: 0, max: 100, now: Math.min(fundedPercent, 100) }}
          >
            <View style={[styles.progressFill, { width: `${Math.min(fundedPercent, 100)}%` }]} />
          </View>
          <Text style={styles.targetText}>
            {t('target')}: ${((property?.targetRaise ?? 0) / 1000000).toFixed(2)}M
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default PropertyCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  imageWrapper: {
    position: 'relative',
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
    letterSpacing: -0.3,
  },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600' as const,
    textTransform: 'capitalize',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  location: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  occupancyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.surfaceBorder,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  progressSection: {
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  targetText: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'right',
  },
  aiScoreBadgeCompact: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiScoreTextCompact: {
    color: Colors.black,
    fontSize: 9,
    fontWeight: '800' as const,
  },
  aiScoreBadgeFull: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  aiScoreTextFull: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  aiScoreLabelFull: {
    color: Colors.black,
    fontSize: 10,
    fontWeight: '700' as const,
    opacity: 0.8,
  },
  compactContainer: {
    width: 160,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  compactImage: {
    width: '100%',
    height: 100,
  },
  compactContent: {
    padding: 10,
  },
  compactName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  compactLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 8,
  },
  compactLocationText: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  compactStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactPrice: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  compactYield: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600' as const,
  },
});
