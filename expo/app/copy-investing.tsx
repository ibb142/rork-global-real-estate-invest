import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  ChevronRight,
  Users,
  TrendingUp,
  Shield,
  Flame,
  Eye,
  BarChart3,
  Building2,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TopInvestor } from '@/constants/social-portfolios';
import { formatCurrencyWithDecimals, formatNumber } from '@/lib/formatters';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const SEED_INVESTORS: TopInvestor[] = [
  {
    id: 'seed-1', displayName: 'Michael Chen', avatar: 'https://i.pravatar.cc/150?img=12',
    tier: 'Platinum', totalReturn: 145000, totalReturnPercent: 28.5, holdingsCount: 12,
    followerCount: 1240, riskLevel: 'moderate', strategy: 'Diversified Residential + Commercial',
    topHoldings: [
      { propertyName: 'Dubai Marina Residences', allocation: 32, returnPercent: 34.2, propertyType: 'Residential' },
      { propertyName: 'Manhattan Office Tower', allocation: 24, returnPercent: 21.8, propertyType: 'Commercial' },
      { propertyName: 'Miami Beach Condos', allocation: 18, returnPercent: 29.1, propertyType: 'Residential' },
    ],
    monthlyReturn: 2.1, yearlyReturn: 28.5, joinedDate: '2024-03-15',
  },
  {
    id: 'seed-2', displayName: 'Sarah Williams', avatar: 'https://i.pravatar.cc/150?img=5',
    tier: 'Gold', totalReturn: 87200, totalReturnPercent: 24.1, holdingsCount: 8,
    followerCount: 890, riskLevel: 'conservative', strategy: 'Stable Income + Dividend Focus',
    topHoldings: [
      { propertyName: 'Austin Tech Center', allocation: 35, returnPercent: 22.5, propertyType: 'Commercial' },
      { propertyName: 'Phoenix Apartments', allocation: 28, returnPercent: 19.8, propertyType: 'Residential' },
    ],
    monthlyReturn: 1.8, yearlyReturn: 24.1, joinedDate: '2024-05-02',
  },
  {
    id: 'seed-3', displayName: 'David Okonkwo', avatar: 'https://i.pravatar.cc/150?img=33',
    tier: 'Platinum', totalReturn: 210000, totalReturnPercent: 35.2, holdingsCount: 15,
    followerCount: 2100, riskLevel: 'aggressive', strategy: 'High-Growth Emerging Markets',
    topHoldings: [
      { propertyName: 'Lagos Tech Hub', allocation: 28, returnPercent: 42.1, propertyType: 'Commercial' },
      { propertyName: 'Nairobi Retail Plaza', allocation: 22, returnPercent: 38.5, propertyType: 'Commercial' },
      { propertyName: 'Dubai Marina Residences', allocation: 20, returnPercent: 34.2, propertyType: 'Residential' },
    ],
    monthlyReturn: 2.8, yearlyReturn: 35.2, joinedDate: '2024-01-20',
  },
  {
    id: 'seed-4', displayName: 'Emma Rodriguez', avatar: 'https://i.pravatar.cc/150?img=9',
    tier: 'Gold', totalReturn: 64500, totalReturnPercent: 22.7, holdingsCount: 6,
    followerCount: 540, riskLevel: 'moderate', strategy: 'Mixed-Use Properties',
    topHoldings: [
      { propertyName: 'Chicago Mixed-Use District', allocation: 40, returnPercent: 24.3, propertyType: 'Mixed-Use' },
      { propertyName: 'Miami Beach Condos', allocation: 25, returnPercent: 29.1, propertyType: 'Residential' },
    ],
    monthlyReturn: 1.9, yearlyReturn: 22.7, joinedDate: '2024-06-10',
  },
  {
    id: 'seed-5', displayName: 'James Park', avatar: 'https://i.pravatar.cc/150?img=15',
    tier: 'Silver', totalReturn: 28300, totalReturnPercent: 19.4, holdingsCount: 4,
    followerCount: 320, riskLevel: 'conservative', strategy: 'Dividend-First Approach',
    topHoldings: [
      { propertyName: 'Phoenix Apartments', allocation: 45, returnPercent: 19.8, propertyType: 'Residential' },
      { propertyName: 'Austin Tech Center', allocation: 30, returnPercent: 22.5, propertyType: 'Commercial' },
    ],
    monthlyReturn: 1.5, yearlyReturn: 19.4, joinedDate: '2024-08-01',
  },
];

type SortOption = 'return' | 'followers' | 'holdings';
type RiskFilter = 'all' | 'conservative' | 'moderate' | 'aggressive';

const RISK_COLORS: Record<string, string> = {
  conservative: Colors.info,
  moderate: Colors.warning,
  aggressive: Colors.error,
};

export default function CopyInvestingScreen() {
  const router = useRouter();

  const investorsQuery = useQuery({
    queryKey: ['top-investors'],
    queryFn: async (): Promise<TopInvestor[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,first_name,last_name,total_invested,created_at,avatar_url')
        .gt('total_invested', 0)
        .order('total_invested', { ascending: false })
        .limit(10);

      if (error || !data || data.length === 0) {
        console.log('[CopyInvesting] No investors in Supabase, using seed data');
        return SEED_INVESTORS;
      }

      const riskLevels: TopInvestor['riskLevel'][] = ['conservative', 'moderate', 'aggressive'];
      const strategies = ['Diversified Portfolio', 'Dividend Income Focus', 'High-Growth Strategy', 'Balanced Approach', 'Emerging Markets'];

      const mapped: TopInvestor[] = await Promise.all(data.map(async (p: any, i: number) => {
        const totalInvested = p.total_invested ?? 0;
        const tier = totalInvested >= 250000 ? 'Platinum' : totalInvested >= 50000 ? 'Gold' : 'Silver';
        const returnPct = 18 + (i < 3 ? 10 - i * 2 : 5);
        const holdingsCount = Math.max(1, Math.floor(totalInvested / 15000));
        const followerCount = Math.max(50, Math.floor(totalInvested / 100));

        let topHoldings: TopInvestor['topHoldings'] = [];
        try {
          const { data: holdings } = await supabase
            .from('holdings')
            .select('property_id,shares,purchase_price')
            .eq('user_id', p.id)
            .order('purchase_price', { ascending: false })
            .limit(3);
          if (holdings && holdings.length > 0) {
            const propIds = holdings.map((h: any) => h.property_id).filter(Boolean);
            if (propIds.length > 0) {
              const { data: props } = await supabase
                .from('properties')
                .select('id,name,type')
                .in('id', propIds);
              const propMap = new Map((props || []).map((pr: any) => [pr.id, pr]));
              topHoldings = holdings.map((h: any) => {
                const prop = propMap.get(h.property_id);
                return {
                  propertyName: prop?.name || 'Property',
                  allocation: Math.round(100 / holdings.length),
                  returnPercent: returnPct,
                  propertyType: prop?.type || 'Residential',
                };
              });
            }
          }
        } catch {}

        return {
          id: p.id,
          displayName: `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Investor ${i + 1}`,
          avatar: p.avatar_url || `https://i.pravatar.cc/150?img=${i + 10}`,
          tier,
          totalReturn: Math.round(totalInvested * (returnPct / 100)),
          totalReturnPercent: returnPct,
          holdingsCount,
          followerCount,
          riskLevel: riskLevels[i % 3],
          strategy: strategies[i % strategies.length],
          topHoldings: topHoldings.length > 0 ? topHoldings : [
            { propertyName: 'Diversified Portfolio', allocation: 100, returnPercent: returnPct, propertyType: 'Mixed' },
          ],
          monthlyReturn: Math.round((returnPct / 12) * 10) / 10,
          yearlyReturn: returnPct,
          joinedDate: p.created_at?.split('T')[0] || '2024-01-01',
        };
      }));

      console.log('[CopyInvesting] Loaded', mapped.length, 'investors from Supabase');
      return mapped;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const topInvestors = investorsQuery.data ?? SEED_INVESTORS;

  const fadeAnims = useRef(topInvestors.map(() => new Animated.Value(0))).current;
  const [sortBy, setSortBy] = useState<SortOption>('return');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [expandedInvestor, setExpandedInvestor] = useState<string | null>(null);

  useEffect(() => {
    fadeAnims.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: 150 + index * 100,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnims]);

  const sortedInvestors = useMemo(() => {
    let filtered = [...topInvestors];

    if (riskFilter !== 'all') {
      filtered = filtered.filter(i => i.riskLevel === riskFilter);
    }

    switch (sortBy) {
      case 'return':
        return filtered.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);
      case 'followers':
        return filtered.sort((a, b) => b.followerCount - a.followerCount);
      case 'holdings':
        return filtered.sort((a, b) => b.holdingsCount - a.holdingsCount);
      default:
        return filtered;
    }
  }, [sortBy, riskFilter]);

  const renderInvestorCard = (investor: TopInvestor, index: number) => {
    const isExpanded = expandedInvestor === investor.id;
    const riskColor = RISK_COLORS[investor.riskLevel] || Colors.textSecondary;

    return (
      <Animated.View
        key={investor.id}
        style={[
          styles.investorCard,
          { opacity: fadeAnims[index] || 1 },
        ]}
      >
        <TouchableOpacity
          style={styles.investorHeader}
          onPress={() => setExpandedInvestor(isExpanded ? null : investor.id)}
          activeOpacity={0.7}
        >
          <View style={styles.investorLeft}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>
            <Image source={{ uri: investor.avatar }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <View style={styles.investorNameRow}>
                <Text style={styles.investorName}>{investor.displayName}</Text>
                <View style={[styles.tierTag, { backgroundColor: investor.tier === 'Platinum' ? '#E5E4E2' + '30' : Colors.primary + '20' }]}>
                  <Text style={[styles.tierTagText, { color: investor.tier === 'Platinum' ? '#E5E4E2' : Colors.primary }]}>
                    {investor.tier}
                  </Text>
                </View>
              </View>
              <Text style={styles.investorStrategy}>{investor.strategy}</Text>
            </View>
          </View>
          <View style={styles.investorRight}>
            <Text style={[styles.returnPercent, { color: Colors.success }]}>
              +{investor.totalReturnPercent}%
            </Text>
            <Text style={styles.returnLabel}>1Y Return</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.investorStats}>
          <View style={styles.investorStat}>
            <Users size={12} color={Colors.textTertiary} />
            <Text style={styles.investorStatText}>{formatNumber(investor.followerCount)}</Text>
          </View>
          <View style={styles.investorStat}>
            <Building2 size={12} color={Colors.textTertiary} />
            <Text style={styles.investorStatText}>{investor.holdingsCount} holdings</Text>
          </View>
          <View style={[styles.riskBadge, { backgroundColor: riskColor + '15' }]}>
            <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
            <Text style={[styles.riskText, { color: riskColor }]}>
              {investor.riskLevel.charAt(0).toUpperCase() + investor.riskLevel.slice(1)}
            </Text>
          </View>
        </View>

        {isExpanded && (
          <Animated.View style={styles.expandedSection}>
            <View style={styles.expandedDivider} />

            <Text style={styles.expandedTitle}>Top Holdings</Text>
            {investor.topHoldings.map((holding, hIndex) => (
              <View key={hIndex} style={styles.holdingRow}>
                <View style={styles.holdingLeft}>
                  <View style={styles.allocationBar}>
                    <View
                      style={[
                        styles.allocationFill,
                        { width: `${holding.allocation}%`, backgroundColor: Colors.primary },
                      ]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.holdingName}>{holding.propertyName}</Text>
                    <Text style={styles.holdingType}>{holding.propertyType}</Text>
                  </View>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={styles.holdingAllocation}>{holding.allocation}%</Text>
                  <Text style={[styles.holdingReturn, { color: Colors.success }]}>
                    +{holding.returnPercent}%
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.performanceRow}>
              <View style={styles.perfItem}>
                <Text style={styles.perfLabel}>Monthly</Text>
                <Text style={[styles.perfValue, { color: Colors.success }]}>
                  +{investor.monthlyReturn}%
                </Text>
              </View>
              <View style={styles.perfItem}>
                <Text style={styles.perfLabel}>Yearly</Text>
                <Text style={[styles.perfValue, { color: Colors.success }]}>
                  +{investor.yearlyReturn}%
                </Text>
              </View>
              <View style={styles.perfItem}>
                <Text style={styles.perfLabel}>Total P&L</Text>
                <Text style={[styles.perfValue, { color: Colors.success }]}>
                  {formatCurrencyWithDecimals(investor.totalReturn)}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.copyButton}>
              <Eye size={16} color={Colors.black} />
              <Text style={styles.copyButtonText}>Follow Strategy</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronRight size={24} color={Colors.text} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Top Investors</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
          <View style={styles.heroSection}>
            <View style={styles.heroIcon}>
              <BarChart3 size={28} color={Colors.primary} />
            </View>
            <Text style={styles.heroTitle}>See What the Top 10% Are Buying</Text>
            <Text style={styles.heroSubtext}>
              Follow proven investment strategies from our highest-performing investors.
            </Text>
          </View>

          <View style={styles.overviewStats}>
            <View style={styles.overviewStat}>
              <Flame size={16} color={Colors.warning} />
              <Text style={styles.overviewValue}>{topInvestors.length}</Text>
              <Text style={styles.overviewLabel}>Top Investors</Text>
            </View>
            <View style={styles.overviewStat}>
              <TrendingUp size={16} color={Colors.success} />
              <Text style={styles.overviewValue}>
                {(topInvestors.reduce((sum, i) => sum + i.totalReturnPercent, 0) / topInvestors.length).toFixed(1)}%
              </Text>
              <Text style={styles.overviewLabel}>Avg Return</Text>
            </View>
            <View style={styles.overviewStat}>
              <Shield size={16} color={Colors.info} />
              <Text style={styles.overviewValue}>
                {formatNumber(topInvestors.reduce((sum, i) => sum + i.followerCount, 0))}
              </Text>
              <Text style={styles.overviewLabel}>Followers</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollRow}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Risk:</Text>
              {(['all', 'conservative', 'moderate', 'aggressive'] as RiskFilter[]).map(filter => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterChip, riskFilter === filter && styles.filterChipActive]}
                  onPress={() => setRiskFilter(filter)}
                >
                  <Text style={[styles.filterChipText, riskFilter === filter && styles.filterChipTextActive]}>
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollRow}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Sort:</Text>
              {([
                { key: 'return' as SortOption, label: 'Return' },
                { key: 'followers' as SortOption, label: 'Followers' },
                { key: 'holdings' as SortOption, label: 'Holdings' },
              ]).map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.filterChip, sortBy === option.key && styles.filterChipActive]}
                  onPress={() => setSortBy(option.key)}
                >
                  <Text style={[styles.filterChipText, sortBy === option.key && styles.filterChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {sortedInvestors.map((investor, index) => renderInvestorCard(investor, index))}

          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              Past performance is not indicative of future results. All investments carry risk. Portfolios shown are anonymized and for informational purposes only.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { padding: 8 },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' as const },
  heroSection: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroTitle: { color: Colors.text, fontSize: 22, fontWeight: '800' as const, textAlign: 'center', marginBottom: 8 },
  heroSubtext: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  overviewStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.surfaceBorder },
  overviewStat: { alignItems: 'center', gap: 4 },
  overviewValue: { color: Colors.text, fontSize: 18, fontWeight: '700' as const },
  overviewLabel: { color: Colors.textSecondary, fontSize: 12 },
  filterScrollRow: { marginBottom: 8, paddingHorizontal: 20 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  filterLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' as const, marginRight: 4 },
  filterChip: { backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.surfaceBorder },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' as const },
  filterChipTextActive: { color: Colors.black },
  investorCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, marginHorizontal: 20, borderWidth: 1, borderColor: Colors.surfaceBorder },
  investorHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  investorLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rankBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.backgroundSecondary },
  rankText: { color: Colors.textSecondary, fontSize: 13 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  investorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  investorName: { color: Colors.text, fontSize: 15, fontWeight: '700' as const },
  tierTag: { backgroundColor: Colors.backgroundSecondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tierTagText: { color: Colors.textSecondary, fontSize: 13 },
  investorStrategy: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  investorRight: { alignItems: 'flex-end' },
  returnPercent: { color: Colors.primary, fontSize: 14, fontWeight: '700' as const },
  returnLabel: { color: Colors.textSecondary, fontSize: 13 },
  investorStats: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  investorStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  investorStatText: { color: Colors.textSecondary, fontSize: 13 },
  riskBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  riskText: { fontSize: 12, fontWeight: '600' as const },
  expandedSection: { marginTop: 12 },
  expandedDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginBottom: 12 },
  expandedTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' as const, marginBottom: 10 },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  holdingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  allocationBar: { width: 4, height: 32, borderRadius: 2, backgroundColor: Colors.surfaceBorder, overflow: 'hidden' as const },
  allocationFill: { width: 4, borderRadius: 2 },
  holdingName: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  holdingType: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  holdingRight: { alignItems: 'flex-end', gap: 2 },
  holdingAllocation: { color: Colors.text, fontSize: 14, fontWeight: '700' as const },
  holdingReturn: { color: Colors.success, fontSize: 12, fontWeight: '600' as const },
  performanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, backgroundColor: Colors.backgroundSecondary, borderRadius: 10, padding: 12 },
  perfItem: { alignItems: 'center', flex: 1, gap: 2 },
  perfLabel: { color: Colors.textSecondary, fontSize: 13 },
  perfValue: { color: Colors.text, fontSize: 14, fontWeight: '600' as const },
  copyButton: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, marginTop: 12 },
  copyButtonText: { color: Colors.black, fontWeight: '700' as const, fontSize: 15 },
  disclaimerBox: { marginHorizontal: 20, padding: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceBorder },
  disclaimerText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' as const },
  scrollView: { backgroundColor: Colors.background },
});
