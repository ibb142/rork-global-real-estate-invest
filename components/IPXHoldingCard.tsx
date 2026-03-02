import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { TrendingUp, TrendingDown, Building2 } from 'lucide-react-native';
import { IPXHolding } from '@/lib/ipx-context';
import Colors from '@/constants/colors';

interface IPXHoldingCardProps {
  holding: IPXHolding;
  onPress?: () => void;
}

const IPXHoldingCard = memo(function IPXHoldingCard({ holding, onPress }: IPXHoldingCardProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 375;
  const isPositive = useMemo(() => holding.unrealizedPnL >= 0, [holding.unrealizedPnL]);

  return (
    <TouchableOpacity 
      style={[styles.container, isCompact && styles.containerCompact]} 
      onPress={onPress} 
      activeOpacity={0.8}
    >
      <View style={[styles.iconContainer, isCompact && styles.iconContainerCompact]}>
        <Building2 size={isCompact ? 24 : 28} color={Colors.primary} />
      </View>
      
      <View style={[styles.content, isCompact && styles.contentCompact]}>
        <View style={styles.header}>
          <Text style={[styles.name, isCompact && styles.nameCompact]} numberOfLines={1}>
            {holding.propertyName}
          </Text>
          <View style={styles.ipxBadge}>
            <Text style={styles.ipxBadgeText}>IVX</Text>
          </View>
        </View>
        
        <Text style={[styles.address, isCompact && styles.addressCompact]} numberOfLines={1}>
          {holding.propertyAddress}
        </Text>
        
        <View style={styles.sharesRow}>
          <Text style={[styles.shares, isCompact && styles.sharesCompact]}>
            {holding.shares.toLocaleString()} shares
          </Text>
          <Text style={[styles.avgCost, isCompact && styles.avgCostCompact]}>
            Avg: ${holding.avgCostBasis.toFixed(2)}
          </Text>
        </View>
        
        <View style={styles.footer}>
          <View style={styles.valueContainer}>
            <Text style={[styles.valueLabel, isCompact && styles.valueLabelCompact]}>Current Value</Text>
            <Text style={[styles.value, isCompact && styles.valueCompact]}>
              ${holding.currentValue.toLocaleString()}
            </Text>
          </View>
          
          <View style={styles.pnlContainer}>
            <View style={[
              styles.pnlBadge, 
              isCompact && styles.pnlBadgeCompact, 
              { backgroundColor: isPositive ? Colors.success + '20' : Colors.error + '20' }
            ]}>
              {isPositive ? (
                <TrendingUp size={isCompact ? 12 : 14} color={Colors.success} />
              ) : (
                <TrendingDown size={isCompact ? 12 : 14} color={Colors.error} />
              )}
              <Text style={[
                styles.pnlText, 
                isCompact && styles.pnlTextCompact, 
                { color: isPositive ? Colors.success : Colors.error }
              ]}>
                {isPositive ? '+' : ''}{holding.unrealizedPnLPercent.toFixed(isCompact ? 1 : 2)}%
              </Text>
            </View>
            <Text style={[
              styles.pnlAmount, 
              isCompact && styles.pnlAmountCompact, 
              { color: isPositive ? Colors.success : Colors.error }
            ]}>
              {isPositive ? '+' : ''}${Math.abs(holding.unrealizedPnL).toLocaleString()}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default IPXHoldingCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  containerCompact: {
    padding: 10,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerCompact: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  contentCompact: {
    marginLeft: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  nameCompact: {
    fontSize: 13,
    marginRight: 4,
  },
  ipxBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ipxBadgeText: {
    color: Colors.black,
    fontSize: 9,
    fontWeight: '700' as const,
  },
  address: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  addressCompact: {
    fontSize: 10,
  },
  sharesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  shares: {
    fontSize: 12,
    color: Colors.textSecondary,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sharesCompact: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  avgCost: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  avgCostCompact: {
    fontSize: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  valueContainer: {
    flexShrink: 1,
  },
  valueLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  valueLabelCompact: {
    fontSize: 10,
  },
  value: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  valueCompact: {
    fontSize: 14,
  },
  pnlContainer: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  pnlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 2,
  },
  pnlBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 2,
  },
  pnlText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  pnlTextCompact: {
    fontSize: 10,
  },
  pnlAmount: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  pnlAmountCompact: {
    fontSize: 10,
  },
});
