import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown, Activity, BarChart3, Clock, Zap, Globe, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getResponsiveSize, isCompactScreen, isExtraSmallScreen } from '@/lib/responsive';
import { properties as mockProperties } from '@/mocks/properties';
import { marketData as mockMarketData } from '@/mocks/market';
import { trpc } from '@/lib/trpc';
import { useTranslation } from '@/lib/i18n-context';
import { useAnalytics } from '@/lib/analytics-context';
import PriceChart from '@/components/PriceChart';
import TradingModal from '@/components/TradingModal';
import { TimeRange, Property, MarketData, Order } from '@/types';
import { currentUser as mockUser, holdings as mockHoldings } from '@/mocks/user';
import { ipxGlobalIndex, tokenizedProperties, getGlobalStats } from '@/mocks/share-trading';
import { useGlobalMarkets } from '@/lib/global-markets';

type MarketTab = 'all' | 'gainers' | 'losers';

function GlobalMarketsSection({ router }: { router: ReturnType<typeof useRouter> }) {
  const { forex, indices, crypto, commodities, marketSentiment } = useGlobalMarkets(4000);
  const sentimentColor = marketSentiment === 'bullish' ? Colors.success : marketSentiment === 'bearish' ? Colors.error : Colors.warning;
  const sentimentLabel = marketSentiment === 'bullish' ? '🐂 Bullish' : marketSentiment === 'bearish' ? '🐻 Bearish' : '⚖️ Neutral';

  const topForex = forex.slice(0, 4);
  const topIndices = indices.slice(0, 4);

  return (
    <View style={gmStyles.wrap}>
      <View style={gmStyles.header}>
        <View style={gmStyles.headerLeft}>
          <Globe size={16} color={Colors.primary} />
          <Text style={gmStyles.headerTitle}>Global Markets</Text>
          <View style={[gmStyles.sentimentBadge, { backgroundColor: sentimentColor + '20' }]}>
            <Text style={[gmStyles.sentimentText, { color: sentimentColor }]}>{sentimentLabel}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={gmStyles.viewAllBtn}
          onPress={() => router.push('/global-intelligence' as any)}
          activeOpacity={0.7}
        >
          <Text style={gmStyles.viewAllText}>Full Intelligence</Text>
          <ChevronRight size={13} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={gmStyles.grid}>
        <View style={gmStyles.section}>
          <Text style={gmStyles.sectionLabel}>FOREX</Text>
          {topForex.map((fx) => {
            const up = fx.changePercent24h >= 0;
            return (
              <View key={fx.symbol} style={gmStyles.row}>
                <Text style={gmStyles.rowFlag}>{fx.flag}</Text>
                <Text style={gmStyles.rowSymbol}>{fx.symbol}</Text>
                <Text style={gmStyles.rowRate}>
                  {fx.rate < 10 ? fx.rate.toFixed(4) : fx.rate.toFixed(2)}
                </Text>
                <View style={[gmStyles.changePill, { backgroundColor: (up ? Colors.success : Colors.error) + '20' }]}>
                  {up ? <ArrowUpRight size={9} color={Colors.success} /> : <ArrowDownRight size={9} color={Colors.error} />}
                  <Text style={[gmStyles.changeVal, { color: up ? Colors.success : Colors.error }]}>
                    {Math.abs(fx.changePercent24h).toFixed(2)}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={gmStyles.divider} />

        <View style={gmStyles.section}>
          <Text style={gmStyles.sectionLabel}>INDICES</Text>
          {topIndices.map((idx) => {
            const up = idx.changePercent >= 0;
            return (
              <View key={idx.symbol} style={gmStyles.row}>
                <Text style={gmStyles.rowFlag}>{idx.flag}</Text>
                <Text style={gmStyles.rowSymbol}>{idx.symbol}</Text>
                <Text style={gmStyles.rowRate}>
                  {idx.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </Text>
                <View style={[gmStyles.changePill, { backgroundColor: (up ? Colors.success : Colors.error) + '20' }]}>
                  {up ? <ArrowUpRight size={9} color={Colors.success} /> : <ArrowDownRight size={9} color={Colors.error} />}
                  <Text style={[gmStyles.changeVal, { color: up ? Colors.success : Colors.error }]}>
                    {Math.abs(idx.changePercent).toFixed(2)}%
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={gmStyles.commodityRow}>
        {commodities.slice(0, 3).map((c) => {
          const up = c.changePercent24h >= 0;
          return (
            <View key={c.symbol} style={gmStyles.commodityCard}>
              <View style={[gmStyles.commodityDot, { backgroundColor: c.color }]} />
              <Text style={gmStyles.commodityName}>{c.name}</Text>
              <Text style={gmStyles.commodityPrice}>
                ${c.price >= 100
                  ? c.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : c.price.toFixed(2)}
              </Text>
              <Text style={[gmStyles.commodityChange, { color: up ? Colors.success : Colors.error }]}>
                {up ? '+' : ''}{c.changePercent24h.toFixed(2)}%
              </Text>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={gmStyles.intelligenceBtn}
        onPress={() => router.push('/global-intelligence' as any)}
        activeOpacity={0.85}
      >
        <Globe size={15} color={Colors.black} />
        <Text style={gmStyles.intelligenceBtnText}>Open Global Financial Intelligence</Text>
        <ChevronRight size={15} color={Colors.black} />
      </TouchableOpacity>
    </View>
  );
}

const gmStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  sentimentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sentimentText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  section: {
    flex: 1,
  },
  sectionLabel: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  rowFlag: {
    fontSize: 13,
  },
  rowSymbol: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontWeight: '700' as const,
    flex: 1,
  },
  rowRate: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '700' as const,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  changeVal: {
    fontSize: 9,
    fontWeight: '700' as const,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  commodityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  commodityCard: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  commodityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  commodityName: {
    color: Colors.textTertiary,
    fontSize: 9,
    fontWeight: '600' as const,
  },
  commodityPrice: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  commodityChange: {
    fontSize: 9,
    fontWeight: '700' as const,
  },
  intelligenceBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  intelligenceBtnText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '800' as const,
  },
});

export default function MarketScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<MarketTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1M');
  const [tradingModalVisible, setTradingModalVisible] = useState(false);
  const [selectedTradeProperty, setSelectedTradeProperty] = useState<Property | null>(null);
  const [selectedTradeMarket, setSelectedTradeMarket] = useState<MarketData | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [liveMarketData, setLiveMarketData] = useState(mockMarketData);
  const [liveIndexValue, setLiveIndexValue] = useState(ipxGlobalIndex.currentValue);
  const [liveIndexChange, setLiveIndexChange] = useState(ipxGlobalIndex.changePercent24h);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const globalStats = useMemo(() => getGlobalStats(), []);
  const { t } = useTranslation();
  const { trackScreen, trackAction, trackTransaction } = useAnalytics();

  useEffect(() => {
    trackScreen('Market');
  }, []);

  const properties = mockProperties;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveMarketData(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (!updated[key]?.lastPrice) return;
          const change = (Math.random() - 0.5) * 0.1;
          const newPrice = Math.max(1, updated[key].lastPrice + change);
          const basePrice = newPrice - (updated[key].change24h ?? 0);
          const priceChange = newPrice - (updated[key].lastPrice - (updated[key].change24h ?? 0));
          const denominator = basePrice || 1;
          updated[key] = {
            ...updated[key],
            lastPrice: Math.round(newPrice * 100) / 100,
            change24h: Math.round(priceChange * 100) / 100,
            changePercent24h: Math.round((priceChange / denominator) * 10000) / 100,
          };
        });
        return updated;
      });
      setLiveIndexValue(prev => {
        const tick = (Math.random() - 0.45) * 0.3;
        return Math.round((prev + tick) * 100) / 100;
      });
      setLiveIndexChange(prev => {
        const drift = (Math.random() - 0.5) * 0.05;
        return Math.round((prev + drift) * 100) / 100;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const screenSize = getResponsiveSize(width);
  const isCompact = isCompactScreen(screenSize);
  const isNarrow = screenSize !== 'lg' && screenSize !== 'xl';
  const isXs = isExtraSmallScreen(screenSize);

  const responsiveStyles = useMemo(() => ({
    headerTitle: isXs ? 24 : isCompact ? 26 : 28,
    statValue: isXs ? 14 : isCompact ? 16 : 18,
    statLabel: isXs ? 9 : isCompact ? 10 : 11,
    statPadding: isXs ? 10 : isCompact ? 12 : 14,
    tabText: isXs ? 12 : isCompact ? 13 : 14,
    propertyImage: isXs ? 28 : isCompact ? 32 : 40,
    propertyName: isXs ? 11 : isCompact ? 12 : 14,
    propertyCity: isXs ? 9 : isCompact ? 10 : 12,
    priceText: isXs ? 11 : isCompact ? 12 : 14,
    changeText: isXs ? 9 : isCompact ? 10 : 12,
    volumeText: isXs ? 11 : isCompact ? 12 : 13,
    rowPadding: isXs ? 8 : isCompact ? 10 : 12,
    cellMinWidth: isXs ? 42 : isCompact ? 50 : 60,
    volumeCellWidth: isXs ? 45 : 55,
  }), [isCompact, isXs]);

  const { gainers, losers } = useMemo(() => {
    const allData = Object.values(liveMarketData);
    const sorted = [...allData].sort((a, b) => b.changePercent24h - a.changePercent24h);
    return {
      gainers: sorted.filter(d => d.changePercent24h > 0).slice(0, 3),
      losers: sorted.filter(d => d.changePercent24h < 0).slice(0, 3),
    };
  }, [liveMarketData]);

  const marketList = useMemo(() => {
    const list = properties
      .filter(p => p.status !== 'coming_soon')
      .map(property => ({
        property,
        market: liveMarketData[property.id],
      }))
      .filter(item => item.market);

    switch (activeTab) {
      case 'gainers':
        return list.filter(item => item.market.changePercent24h > 0)
          .sort((a, b) => b.market.changePercent24h - a.market.changePercent24h);
      case 'losers':
        return list.filter(item => item.market.changePercent24h < 0)
          .sort((a, b) => a.market.changePercent24h - b.market.changePercent24h);
      default:
        return list.sort((a, b) => b.market.volume24h - a.market.volume24h);
    }
  }, [activeTab, liveMarketData]);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return properties.find(p => p.id === selectedPropertyId);
  }, [selectedPropertyId]);

  const allMarketQuery = trpc.market.getAllMarketData.useQuery();
  const globalIndexQuery = trpc.market.getGlobalIndex.useQuery();
  const topMoversQuery = trpc.market.getTopMovers.useQuery();
  const balanceQuery = trpc.wallet.getBalance.useQuery();

  const currentUser = useMemo(() => ({
    ...mockUser,
    walletBalance: balanceQuery.data?.available ?? mockUser.walletBalance,
  }), [balanceQuery.data]);

  useEffect(() => {
    if (allMarketQuery.data) {
      const raw = allMarketQuery.data as unknown;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const backendData = raw as Record<string, typeof mockMarketData[string]>;
        const keys = Object.keys(backendData).filter(k => k !== 'markets');
        if (keys.length > 0) {
          const filtered: Record<string, typeof mockMarketData[string]> = {};
          keys.forEach(k => { if (backendData[k]?.lastPrice) filtered[k] = backendData[k]; });
          if (Object.keys(filtered).length > 0) {
            setLiveMarketData(prev => ({ ...prev, ...filtered }));
            console.log('[Market] Loaded backend market data:', Object.keys(filtered).length, 'items');
          }
        }
      }
    }
  }, [allMarketQuery.data]);

  useEffect(() => {
    if (globalIndexQuery.data) {
      const idx = globalIndexQuery.data as { currentValue?: number; changePercent24h?: number };
      if (idx.currentValue) setLiveIndexValue(idx.currentValue);
      if (idx.changePercent24h != null) setLiveIndexChange(idx.changePercent24h);
    }
  }, [globalIndexQuery.data]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([
      allMarketQuery.refetch(),
      globalIndexQuery.refetch(),
      topMoversQuery.refetch(),
      balanceQuery.refetch(),
    ]).finally(() => setRefreshing(false));
  };

  const totalVolume = useMemo(() => {
    return Object.values(liveMarketData).reduce((sum, m) => sum + m.volume24h, 0);
  }, [liveMarketData]);

  const openTradeModal = (property: Property, market: MarketData, type: 'buy' | 'sell') => {
    setSelectedTradeProperty(property);
    setSelectedTradeMarket(market);
    setTradeType(type);
    setTradingModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const placeMutation = trpc.market.placeOrder.useMutation({
    onSuccess: () => {
      allMarketQuery.refetch();
      balanceQuery.refetch();
    },
  });

  const handleTradeComplete = (order: Order) => {
    console.log('[Market] Trade completed:', order);
    trackTransaction(order.type, order.shares * order.price, 'USD', { propertyId: order.propertyId, shares: order.shares });
    placeMutation.mutate({
      propertyId: order.propertyId,
      type: order.type,
      orderType: order.orderType,
      shares: order.shares,
      price: order.price,
    });
  };

  const getUserShares = (propertyId: string): number => {
    const holding = mockHoldings.find(h => h.propertyId === propertyId);
    return holding?.shares || 0;
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{t('market')}</Text>
            <View style={styles.marketStatusRow}>
              <Animated.View style={[styles.liveIndicator, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.marketStatusText}>{t('open247')}</Text>
              <Clock size={12} color={Colors.success} />
            </View>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/notifications' as any)}>
            <Activity size={22} color={Colors.text} />
          </TouchableOpacity>
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
          <View style={styles.indexBanner}>
            <View style={styles.indexBannerTop}>
              <View>
                <View style={styles.indexTickerRow}>
                  <Animated.View style={[styles.indexLiveDot, { transform: [{ scale: pulseAnim }] }]} />
                  <Text style={styles.indexTickerText}>{ipxGlobalIndex.ticker}</Text>
                  <Text style={styles.indexSubLabel}>{t('realEstateIndex')}</Text>
                </View>
                <Text style={styles.indexBigValue}>${liveIndexValue.toFixed(2)}</Text>
              </View>
              <View style={styles.indexBannerRight}>
                <View style={[
                  styles.indexBannerBadge,
                  { backgroundColor: liveIndexChange >= 0 ? Colors.success + '20' : Colors.error + '20' }
                ]}>
                  {liveIndexChange >= 0 ? <TrendingUp size={14} color={Colors.success} /> : <TrendingDown size={14} color={Colors.error} />}
                  <Text style={[styles.indexBannerChangeText, { color: liveIndexChange >= 0 ? Colors.success : Colors.error }]}>
                    {liveIndexChange >= 0 ? '+' : ''}{liveIndexChange.toFixed(2)}%
                  </Text>
                </View>
                <Text style={styles.indexBannerAth}>ATH ${ipxGlobalIndex.allTimeHigh.toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.indexBannerStats}>
              <View style={styles.indexBannerStat}>
                <Text style={styles.indexBannerStatValue}>${(globalStats.totalMarketCap / 1000000).toFixed(1)}M</Text>
                <Text style={styles.indexBannerStatLabel}>{t('totalMarketCap')}</Text>
              </View>
              <View style={styles.indexBannerStatDivider} />
              <View style={styles.indexBannerStat}>
                <Text style={styles.indexBannerStatValue}>{globalStats.countriesActive}</Text>
                <Text style={styles.indexBannerStatLabel}>{t('countries')}</Text>
              </View>
              <View style={styles.indexBannerStatDivider} />
              <View style={styles.indexBannerStat}>
                <Text style={styles.indexBannerStatValue}>{tokenizedProperties.length}</Text>
                <Text style={styles.indexBannerStatLabel}>{t('properties')}</Text>
              </View>
              <View style={styles.indexBannerStatDivider} />
              <View style={styles.indexBannerStat}>
                <Text style={styles.indexBannerStatValue}>{(globalStats.totalInvestors / 1000).toFixed(1)}K</Text>
                <Text style={styles.indexBannerStatLabel}>{t('investors')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { padding: responsiveStyles.statPadding }]}>
              <BarChart3 size={isCompact ? 16 : 20} color={Colors.primary} />
              <Text style={[styles.statValue, { fontSize: responsiveStyles.statValue }]}>
                ${(totalVolume / 1000000).toFixed(isXs ? 1 : 2)}M
              </Text>
              <Text style={[styles.statLabel, { fontSize: responsiveStyles.statLabel }]}>{t('volume24h')}</Text>
            </View>
            <View style={[styles.statCard, { padding: responsiveStyles.statPadding }]}>
              <TrendingUp size={isCompact ? 16 : 20} color={Colors.success} />
              <Text style={[styles.statValue, { fontSize: responsiveStyles.statValue }]}>{gainers.length}</Text>
              <Text style={[styles.statLabel, { fontSize: responsiveStyles.statLabel }]}>{t('gainers')}</Text>
            </View>
            <View style={[styles.statCard, { padding: responsiveStyles.statPadding }]}>
              <TrendingDown size={isCompact ? 16 : 20} color={Colors.error} />
              <Text style={[styles.statValue, { fontSize: responsiveStyles.statValue }]}>{losers.length}</Text>
              <Text style={[styles.statLabel, { fontSize: responsiveStyles.statLabel }]}>{t('losers')}</Text>
            </View>
          </View>

          {selectedProperty && (
            <View style={styles.chartSection}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>{selectedProperty.name}</Text>
                <TouchableOpacity onPress={() => setSelectedPropertyId(null)}>
                  <Text style={styles.closeChart}>{t('closeLabel')}</Text>
                </TouchableOpacity>
              </View>
              <PriceChart
                data={selectedProperty.priceHistory}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
              />
            </View>
          )}

          <View style={styles.tabsContainer}>
            {(['all', 'gainers', 'losers'] as MarketTab[]).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, { fontSize: responsiveStyles.tabText }, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'all' ? t('allProperties') : tab === 'gainers' ? t('gainers') : t('losers')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.tableHeader, { paddingHorizontal: isXs ? 12 : 20 }]}>
            <Text style={[styles.tableHeaderText, { flex: isCompact ? 1.5 : 2, fontSize: isXs ? 10 : 12 }]}>{t('properties')}</Text>
            <Text style={[styles.tableHeaderText, styles.cellRight, { minWidth: responsiveStyles.cellMinWidth, fontSize: isXs ? 10 : 12 }]}>{t('price')}</Text>
            <Text style={[styles.tableHeaderText, styles.cellRight, { minWidth: responsiveStyles.cellMinWidth, fontSize: isXs ? 10 : 12 }]}>{t('change24h')}</Text>
            {!isCompact && <Text style={[styles.tableHeaderText, styles.cellRight, { minWidth: responsiveStyles.volumeCellWidth, fontSize: isXs ? 10 : 12 }]}>{t('volume')}</Text>}
          </View>

          {marketList.map(({ property, market }) => {
            const isPositive = market.changePercent24h >= 0;
            return (
              <View key={property.id} style={[styles.marketRowContainer, { paddingHorizontal: isXs ? 12 : 20 }]}>
                <TouchableOpacity
                  style={[styles.marketRow, { paddingVertical: responsiveStyles.rowPadding }]}
                  onPress={() => setSelectedPropertyId(property.id)}
                  onLongPress={() => router.push(`/property/${property.id}` as any)}
                >
                  <View style={[styles.propertyCell, { flex: isCompact ? 1.5 : 2 }]}>
                    <Image 
                      source={{ uri: property.images[0] }} 
                      style={[
                        styles.propertyImage, 
                        { 
                          width: responsiveStyles.propertyImage, 
                          height: responsiveStyles.propertyImage,
                          borderRadius: isXs ? 4 : isCompact ? 6 : 8,
                          marginRight: isXs ? 6 : isCompact ? 8 : 10,
                        }
                      ]} 
                    />
                    <View style={styles.propertyInfo}>
                      <Text style={[styles.propertyName, { fontSize: responsiveStyles.propertyName }]} numberOfLines={1}>
                        {property.name}
                      </Text>
                      <Text style={[styles.propertyCity, { fontSize: responsiveStyles.propertyCity }]}>
                        {property.city}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.priceCell, { minWidth: responsiveStyles.cellMinWidth }]}>
                    <Text style={[styles.priceText, { fontSize: responsiveStyles.priceText }]}>
                      ${market.lastPrice.toFixed(isCompact ? 0 : 2)}
                    </Text>
                  </View>
                  <View style={[styles.changeCell, { minWidth: responsiveStyles.cellMinWidth }]}>
                    <View style={[
                      styles.changeBadge, 
                      { 
                        backgroundColor: isPositive ? Colors.success + '20' : Colors.error + '20',
                        paddingHorizontal: isXs ? 4 : isCompact ? 5 : 8,
                        paddingVertical: isXs ? 2 : isCompact ? 3 : 4,
                      }
                    ]}>
                      <Text style={[styles.changeText, { fontSize: responsiveStyles.changeText, color: isPositive ? Colors.success : Colors.error }]}>
                        {isPositive ? '+' : ''}{market.changePercent24h.toFixed(isNarrow ? 1 : 2)}%
                      </Text>
                    </View>
                  </View>
                  {!isCompact && (
                    <View style={[styles.volumeCell, { minWidth: responsiveStyles.volumeCellWidth }]}>
                      <Text style={[styles.volumeText, { fontSize: responsiveStyles.volumeText }]}>
                        ${(market.volume24h / 1000).toFixed(0)}K
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.tradeButtonsRow}>
                  <TouchableOpacity
                    style={styles.buyButton}
                    onPress={() => openTradeModal(property, market, 'buy')}
                  >
                    <Zap size={12} color={Colors.white} />
                    <Text style={styles.buyButtonText}>{t('buy')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sellButton}
                    onPress={() => openTradeModal(property, market, 'sell')}
                  >
                    <Text style={styles.sellButtonText}>{t('sell')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {!selectedPropertyId && marketList.length > 0 && (() => {
            const first = marketList[0];
            const market = first?.market;
            const bids = Array.isArray(market?.bids) ? market.bids.slice(0, 5) : [];
            const asks = Array.isArray(market?.asks) ? market.asks.slice(0, 5) : [];
            return (
            <View style={styles.orderBookSection}>
              <Text style={styles.sectionTitle}>{t('orderBook')} - {first?.property?.name ?? t('market')}</Text>
              <View style={styles.orderBookContainer}>
                <View style={styles.orderBookSide}>
                  <Text style={styles.orderBookHeader}>{t('bids')}</Text>
                  {bids.map((bid, index) => (
                    <View key={`bid-${index}`} style={styles.orderBookRow}>
                      <Text style={[styles.orderBookPrice, { color: Colors.success }]}>
                        ${(bid?.price ?? 0).toFixed(2)}
                      </Text>
                      <Text style={styles.orderBookShares}>{bid?.shares ?? 0}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.orderBookDivider} />
                <View style={styles.orderBookSide}>
                  <Text style={styles.orderBookHeader}>{t('asks')}</Text>
                  {asks.map((ask, index) => (
                    <View key={`ask-${index}`} style={styles.orderBookRow}>
                      <Text style={[styles.orderBookPrice, { color: Colors.error }]}>
                        ${(ask?.price ?? 0).toFixed(2)}
                      </Text>
                      <Text style={styles.orderBookShares}>{ask?.shares ?? 0}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            );
          })()}

          <GlobalMarketsSection router={router} />

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>

      <TradingModal
        visible={tradingModalVisible}
        onClose={() => setTradingModalVisible(false)}
        property={selectedTradeProperty}
        marketData={selectedTradeMarket}
        initialType={tradeType}
        userBalance={currentUser.walletBalance}
        userShares={selectedTradeProperty ? getUserShares(selectedTradeProperty.id) : 0}
        onTradeComplete={handleTradeComplete}
      />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontWeight: '800' as const,
    color: Colors.text,
  },
  marketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  marketStatusText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  headerButton: {
    padding: 8,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statValue: {
    fontWeight: '800' as const,
    color: Colors.text,
  },
  statLabel: {
    color: Colors.textTertiary,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  chartSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  chartTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    flex: 1,
  },
  closeChart: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
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
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    marginBottom: 4,
  },
  tableHeaderText: {
    color: Colors.textTertiary,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
  },
  marketRowContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tradeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    paddingTop: 4,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  buyButtonText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  sellButton: {
    backgroundColor: Colors.error + '20',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sellButtonText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  cellRight: {
    textAlign: 'right',
  },
  propertyCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  propertyImage: {
    backgroundColor: Colors.surfaceLight,
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  propertyCity: {
    color: Colors.textTertiary,
    marginTop: 2,
  },
  priceCell: {
    alignItems: 'flex-end',
  },
  priceText: {
    color: Colors.text,
    fontWeight: '700' as const,
  },
  changeCell: {
    alignItems: 'flex-end',
  },
  changeBadge: {
    borderRadius: 8,
  },
  changeText: {
    fontWeight: '700' as const,
  },
  volumeCell: {
    alignItems: 'flex-end',
  },
  volumeText: {
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  orderBookSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  orderBookContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  orderBookSide: {
    flex: 1,
  },
  orderBookDivider: {
    width: 1,
    backgroundColor: Colors.surfaceBorder,
    marginHorizontal: 12,
  },
  orderBookHeader: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  orderBookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderBookPrice: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  orderBookShares: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  bottomPadding: {
    height: 120,
  },
  indexBanner: {
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  indexBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  indexTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  indexLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  indexTickerText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  indexSubLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    flexShrink: 1,
  },
  indexBigValue: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
  },
  indexBannerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  indexBannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  indexBannerChangeText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  indexBannerAth: {
    color: Colors.textTertiary,
    fontSize: 11,
  },
  indexBannerStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    paddingTop: 14,
  },
  indexBannerStat: {
    flex: 1,
    alignItems: 'center',
  },
  indexBannerStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.surfaceBorder,
  },
  indexBannerStatValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  indexBannerStatLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center' as const,
  },
  scrollView: {
    backgroundColor: Colors.background,
  },
});
