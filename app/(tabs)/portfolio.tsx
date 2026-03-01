import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TrendingUp, TrendingDown, Wallet, Building2, ChevronRight, PiggyBank, Percent } from 'lucide-react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Colors from '@/constants/colors';
import { getResponsiveSize, isCompactScreen, isExtraSmallScreen } from '@/lib/responsive';
import { holdings, getTotalPortfolioValue, getTotalUnrealizedPnL, currentUser as mockUser } from '@/mocks/user';
import { trpc } from '@/lib/trpc';
import { formatNumber } from '@/lib/formatters';
import HoldingCard from '@/components/HoldingCard';
import IPXHoldingCard from '@/components/IPXHoldingCard';
import { useIPX } from '@/lib/ipx-context';
import { useEarn } from '@/lib/earn-context';
import { useTranslation } from '@/lib/i18n-context';
import { useAnalytics } from '@/lib/analytics-context';

const CHART_HEIGHT = 120;

type TabType = 'holdings' | 'ipx';

const generatePortfolioHistory = (baseValue: number) => {
  const history = [];
  let value = baseValue * 0.85;
  const step = (baseValue - value) / 30;
  for (let i = 30; i >= 0; i--) {
    const dayOffset = Math.sin(i * 0.5) * (baseValue * 0.02);
    value = value + step + dayOffset;
    value = Math.max(baseValue * 0.75, value);
    history.push({ value });
  }
  return history;
};

export default function PortfolioScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('holdings');
  const [refreshing, setRefreshing] = useState(false);

  const balanceQuery = trpc.wallet.getBalance.useQuery();
  const portfolioQuery = trpc.wallet.getPortfolio.useQuery();

  const currentUser = useMemo(() => ({
    ...mockUser,
    walletBalance: balanceQuery.data?.available ?? mockUser.walletBalance,
  }), [balanceQuery.data]);

  const { holdings: ipxHoldings, getTotalIPXValue, getTotalIPXPnL, getTotalIPXPnLPercent } = useIPX();
  const { totalBalance: earnBalance, totalEarnings, apyRate } = useEarn();
  const { t } = useTranslation();
  const { trackScreen } = useAnalytics();

  const screenSize = getResponsiveSize(width);
  const isCompact = isCompactScreen(screenSize);
  const isXs = isExtraSmallScreen(screenSize);
  const CHART_WIDTH = width - (isXs ? 60 : 80);

  const responsiveStyles = useMemo(() => ({
    headerTitle: isXs ? 24 : isCompact ? 26 : 28,
    portfolioValue: isXs ? 24 : isCompact ? 28 : 36,
    portfolioLabel: isXs ? 12 : 14,
    pnlText: isXs ? 12 : 14,
    changeBadgePadding: isXs ? 6 : isCompact ? 8 : 10,
    changeText: isXs ? 11 : 13,
    walletValue: isXs ? 15 : isCompact ? 16 : 18,
    walletLabel: isXs ? 10 : 12,
    tabText: isXs ? 11 : 13,
    txIconSize: isXs ? 28 : isCompact ? 32 : 40,

    cardPadding: isXs ? 14 : isCompact ? 16 : 20,
    cardMargin: isXs ? 12 : 20,
  }), [isCompact, isXs]);

  const tradHoldingsValue = getTotalPortfolioValue();
  const tradUnrealizedPnL = getTotalUnrealizedPnL();

  const totalPortfolioValue = tradHoldingsValue + getTotalIPXValue;
  const totalUnrealizedPnL = tradUnrealizedPnL + getTotalIPXPnL;
  const totalInvested = holdings.reduce((sum, h) => sum + (h.shares * h.avgCostBasis), 0) +
    ipxHoldings.reduce((sum, h) => sum + h.totalInvested, 0);
  const totalUnrealizedPnLPercent = totalInvested > 0 ? ((totalPortfolioValue - totalInvested) / totalInvested) * 100 : 0;

  const isPositive = totalUnrealizedPnL >= 0;

  const portfolioHistory = useMemo(() => generatePortfolioHistory(totalPortfolioValue || 40000), [totalPortfolioValue]);

  const chartPath = useMemo(() => {
    if (portfolioHistory.length < 2) return '';

    const values = portfolioHistory.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = portfolioHistory.map((point, index) => {
      const x = (index / (portfolioHistory.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - ((point.value - min) / range) * CHART_HEIGHT;
      return { x, y };
    });

    const path = points.reduce((acc, point, i) => {
      if (i === 0) return `M ${point.x} ${point.y}`;
      const prev = points[i - 1];
      const cpX = (prev.x + point.x) / 2;
      return `${acc} Q ${cpX} ${prev.y} ${point.x} ${point.y}`;
    }, '');

    return path;
  }, [portfolioHistory, CHART_WIDTH]);

  const gradientPath = useMemo(() => {
    if (!chartPath) return '';
    const lastX = CHART_WIDTH;
    return `${chartPath} L ${lastX} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`;
  }, [chartPath, CHART_WIDTH]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([balanceQuery.refetch(), portfolioQuery.refetch()])
      .finally(() => setRefreshing(false));
  };



  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={[styles.header, { paddingHorizontal: responsiveStyles.cardMargin }]}>
          <Text style={[styles.headerTitle, { fontSize: responsiveStyles.headerTitle }]}>{t('portfolio')}</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          <View style={[styles.portfolioCard, { marginHorizontal: responsiveStyles.cardMargin, padding: responsiveStyles.cardPadding }]}>
            <View style={styles.portfolioHeader}>
              <Text style={[styles.portfolioLabel, { fontSize: responsiveStyles.portfolioLabel }]}>{t('totalPortfolioValue')}</Text>
              <View style={[
                styles.changeBadge,
                {
                  backgroundColor: isPositive ? Colors.success + '20' : Colors.error + '20',
                  paddingHorizontal: responsiveStyles.changeBadgePadding,
                }
              ]}>
                {isPositive ? (
                  <TrendingUp size={isXs ? 12 : 14} color={Colors.success} />
                ) : (
                  <TrendingDown size={isXs ? 12 : 14} color={Colors.error} />
                )}
                <Text style={[styles.changeText, { fontSize: responsiveStyles.changeText, color: isPositive ? Colors.success : Colors.error }]}>
                  {isPositive ? '+' : ''}{totalUnrealizedPnLPercent.toFixed(2)}%
                </Text>
              </View>
            </View>

            <Text style={[styles.portfolioValue, { fontSize: responsiveStyles.portfolioValue }]}>
              ${formatNumber(totalPortfolioValue)}
            </Text>

            <Text style={[styles.pnlText, { fontSize: responsiveStyles.pnlText, color: isPositive ? Colors.success : Colors.error }]}>
              {isPositive ? '+' : ''}${formatNumber(Math.abs(totalUnrealizedPnL))} {t('allTime').toLowerCase()}
            </Text>

            <View style={styles.chartContainer}>
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                  <LinearGradient id="portfolioGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor={isPositive ? Colors.success : Colors.error} stopOpacity={0.3} />
                    <Stop offset="100%" stopColor={isPositive ? Colors.success : Colors.error} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                {gradientPath && <Path d={gradientPath} fill="url(#portfolioGradient)" />}
                {chartPath && (
                  <Path
                    d={chartPath}
                    fill="none"
                    stroke={isPositive ? Colors.success : Colors.error}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
              </Svg>
            </View>
          </View>

          {ipxHoldings.length > 0 && (
            <View style={[styles.ipxSummaryCard, { marginHorizontal: responsiveStyles.cardMargin }]}>
              <View style={styles.ipxSummaryLeft}>
                <View style={styles.ipxIconContainer}>
                  <Building2 size={20} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.ipxSummaryLabel}>{t('ipxHoldings')}</Text>
                  <Text style={styles.ipxSummaryValue}>${formatNumber(getTotalIPXValue)}</Text>
                </View>
              </View>
              <View style={[
                styles.ipxPnlBadge,
                { backgroundColor: getTotalIPXPnL >= 0 ? Colors.success + '20' : Colors.error + '20' }
              ]}>
                <Text style={[
                  styles.ipxPnlText,
                  { color: getTotalIPXPnL >= 0 ? Colors.success : Colors.error }
                ]}>
                  {getTotalIPXPnL >= 0 ? '+' : ''}{getTotalIPXPnLPercent.toFixed(1)}%
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.walletCard, { marginHorizontal: responsiveStyles.cardMargin, padding: isXs ? 10 : isCompact ? 12 : 16 }]}
            onPress={() => router.push('/wallet' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.walletLeft}>
              <Wallet size={isXs ? 18 : isCompact ? 20 : 24} color={Colors.primary} />
              <View>
                <Text style={[styles.walletLabel, { fontSize: responsiveStyles.walletLabel }]}>{t('availableBalance')}</Text>
                <Text style={[styles.walletValue, { fontSize: responsiveStyles.walletValue }]}>
                  ${formatNumber(currentUser.walletBalance)}
                </Text>
              </View>
            </View>
            <View style={styles.walletRight}>
              <Text style={styles.manageFundsText}>{t('manage')}</Text>
              <ChevronRight size={18} color={Colors.primary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.earnCard, { marginHorizontal: responsiveStyles.cardMargin, padding: isXs ? 10 : isCompact ? 12 : 16 }]}
            onPress={() => router.push('/ipx-earn' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.walletLeft}>
              <PiggyBank size={isXs ? 18 : isCompact ? 20 : 24} color={Colors.primary} />
              <View>
                <View style={styles.earnLabelRow}>
                  <Text style={[styles.walletLabel, { fontSize: responsiveStyles.walletLabel }]}>{t('ipxEarn')}</Text>
                  <View style={styles.earnApyBadge}>
                    <Percent size={8} color={Colors.black} />
                    <Text style={styles.earnApyBadgeText}>{`${Math.round(apyRate * 100)}% APY`}</Text>
                  </View>
                </View>
                <Text style={[styles.walletValue, { fontSize: responsiveStyles.walletValue }]}>
                  ${formatNumber(earnBalance)}
                </Text>
              </View>
            </View>
            <View style={styles.walletRight}>
              <Text style={styles.manageFundsText}>{earnBalance > 0 ? t('viewLabel') : t('startLabel')}</Text>
              <ChevronRight size={18} color={Colors.primary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.tabsContainer, { marginHorizontal: responsiveStyles.cardMargin }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'holdings' && styles.tabActive]}
              onPress={() => setActiveTab('holdings')}
            >
              <Text style={[styles.tabText, { fontSize: responsiveStyles.tabText }, activeTab === 'holdings' && styles.tabTextActive]}>
                {t('holdings')} ({holdings.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'ipx' && styles.tabActive]}
              onPress={() => setActiveTab('ipx')}
            >
              <Text style={[styles.tabText, { fontSize: responsiveStyles.tabText }, activeTab === 'ipx' && styles.tabTextActive]}>
                IPX ({ipxHoldings.length})
              </Text>
            </TouchableOpacity>

          </View>

          {activeTab === 'holdings' ? (
            <View style={[styles.holdingsSection, { paddingHorizontal: responsiveStyles.cardMargin }]}>
              {holdings.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>{t('noHoldings')}</Text>
                  <Text style={styles.emptyStateSubtext}>{t('startInvesting')}</Text>
                </View>
              ) : (
                holdings.map(holding => (
                  <HoldingCard key={holding.id} holding={holding} />
                ))
              )}
            </View>
          ) : (
            <View style={[styles.holdingsSection, { paddingHorizontal: responsiveStyles.cardMargin }]}>
              {ipxHoldings.length === 0 ? (
                <View style={styles.emptyState}>
                  <Building2 size={48} color={Colors.textTertiary} />
                  <Text style={styles.emptyStateText}>{t('noIpxHoldings')}</Text>
                  <Text style={styles.emptyStateSubtext}>{t('investInShares')}</Text>
                </View>
              ) : (
                ipxHoldings.map(holding => (
                  <IPXHoldingCard key={holding.id} holding={holding} />
                ))
              )}
            </View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingVertical: 12,
  },
  headerTitle: {
    fontWeight: '800' as const,
    color: Colors.text,
  },
  portfolioCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  portfolioLabel: {
    color: Colors.textSecondary,
    fontWeight: '500' as const,
    flexShrink: 1,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingVertical: 4,
  },
  changeText: {
    fontWeight: '700' as const,
  },
  portfolioValue: {
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  pnlText: {
    fontWeight: '600' as const,
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  ipxSummaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  ipxSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  ipxIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ipxSummaryLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500' as const,
    flexShrink: 1,
  },
  ipxSummaryValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 2,
  },
  ipxPnlBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ipxPnlText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  walletCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  earnCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  earnLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  earnApyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  earnApyBadgeText: {
    color: Colors.black,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  walletLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  walletLabel: {
    color: Colors.textSecondary,
    fontWeight: '500' as const,
    flexShrink: 1,
  },
  walletValue: {
    color: Colors.text,
    fontWeight: '700' as const,
    marginTop: 2,
  },
  walletRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  manageFundsText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600' as const,
    flexShrink: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  tabTextActive: {
    color: Colors.black,
  },
  holdingsSection: {
    gap: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyStateText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  emptyStateSubtext: {
    color: Colors.textTertiary,
    fontSize: 14,
  },
  bottomPadding: {
    height: 40,
  },
  scrollView: {
    backgroundColor: Colors.background,
  },
});
