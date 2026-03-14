import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { FractionalShare, SharePurchase } from '@/types';
import { fractionalShares as initialShares, calculateIPXFee } from '@/mocks/ipx-invest';
import { getAuthUserId } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { scopedKey } from '@/lib/project-storage';

const IPX_HOLDINGS_KEY = scopedKey('ipx_holdings');
const IPX_PURCHASES_KEY = scopedKey('ipx_purchases');

export interface IPXHolding {
  id: string;
  fractionalShareId: string;
  propertyName: string;
  propertyAddress: string;
  shares: number;
  avgCostBasis: number;
  currentPrice: number;
  currentValue: number;
  totalInvested: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  purchasedAt: string;
}

async function loadLocalHoldings(): Promise<{ holdings: IPXHolding[]; purchases: SharePurchase[] }> {
  try {
    const [holdingsData, purchasesData] = await Promise.all([
      AsyncStorage.getItem(IPX_HOLDINGS_KEY),
      AsyncStorage.getItem(IPX_PURCHASES_KEY),
    ]);
    return {
      holdings: holdingsData ? JSON.parse(holdingsData) : [],
      purchases: purchasesData ? JSON.parse(purchasesData) : [],
    };
  } catch (error) {
    console.log('[IPX] Error loading local data:', error);
    return { holdings: [], purchases: [] };
  }
}

async function saveLocalData(holdings: IPXHolding[], purchases: SharePurchase[]) {
  try {
    await Promise.all([
      AsyncStorage.setItem(IPX_HOLDINGS_KEY, JSON.stringify(holdings)),
      AsyncStorage.setItem(IPX_PURCHASES_KEY, JSON.stringify(purchases)),
    ]);
  } catch (error) {
    console.log('[IPX] Error saving local data:', error);
  }
}

export const [IPXProvider, useIPX] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [fractionalShares, setFractionalShares] = useState<FractionalShare[]>(initialShares);
  const [holdings, setHoldings] = useState<IPXHolding[]>([]);
  const [purchases, setPurchases] = useState<SharePurchase[]>([]);

  const holdingsQuery = useQuery({
    queryKey: ['ipx-holdings'],
    queryFn: async () => {
      const userId = getAuthUserId();
      if (!userId) return { holdings: [], purchases: [] };

      try {
        const [holdingsRes, purchasesRes] = await Promise.all([
          supabase.from('ipx_holdings').select('*').eq('user_id', userId),
          supabase.from('ipx_purchases').select('*').eq('user_id', userId).order('purchased_at', { ascending: false }),
        ]);

        if (holdingsRes.data && holdingsRes.data.length > 0) {
          console.log('[IPX] Loaded from Supabase:', holdingsRes.data.length, 'holdings');
          const sbHoldings: IPXHolding[] = holdingsRes.data.map((h: any) => ({
            id: h.id,
            fractionalShareId: h.fractional_share_id,
            propertyName: h.property_name,
            propertyAddress: h.property_address,
            shares: h.shares,
            avgCostBasis: h.avg_cost_basis,
            currentPrice: h.current_price,
            currentValue: h.current_value,
            totalInvested: h.total_invested,
            unrealizedPnL: h.unrealized_pnl,
            unrealizedPnLPercent: h.unrealized_pnl_percent,
            purchasedAt: h.purchased_at,
          }));
          const sbPurchases: SharePurchase[] = (purchasesRes.data || []).map((p: any) => ({
            id: p.id,
            fractionalShareId: p.fractional_share_id,
            userId: p.user_id,
            userName: p.user_name,
            shares: p.shares,
            pricePerShare: p.price_per_share,
            totalAmount: p.total_amount,
            ipxFee: p.ipx_fee,
            netToProperty: p.net_to_property,
            purchasedAt: p.purchased_at,
          }));
          await saveLocalData(sbHoldings, sbPurchases);
          return { holdings: sbHoldings, purchases: sbPurchases };
        }
      } catch (error) {
        console.log('[IPX] Supabase fetch failed, using local:', error);
      }

      return loadLocalHoldings();
    },
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (holdingsQuery.data) {
      setHoldings(holdingsQuery.data.holdings);
      setPurchases(holdingsQuery.data.purchases);
    }
  }, [holdingsQuery.data]);

  const sharesQuery = useQuery({
    queryKey: ['ipx-fractional-shares'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('fractional_shares')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          console.log('[IPX] Fractional shares from Supabase:', data.length);
          return data.map((fs: any) => ({
            id: fs.id,
            submissionId: fs.submission_id || '',
            propertyName: fs.property_name,
            propertyAddress: fs.property_address,
            totalShares: fs.total_shares,
            availableShares: fs.available_shares,
            pricePerShare: fs.price_per_share,
            minShares: fs.min_shares,
            ownerPercentage: fs.owner_percentage,
            investorPercentage: fs.investor_percentage,
            ipxFeePercentage: fs.ipx_fee_percentage,
            demandMultiplier: fs.demand_multiplier,
            basePrice: fs.base_price,
            currentPrice: fs.current_price,
            totalRaised: fs.total_raised,
            targetRaise: fs.target_raise,
            status: fs.status,
            createdAt: fs.created_at,
          })) as FractionalShare[];
        }
      } catch (error) {
        console.log('[IPX] Fractional shares Supabase error:', error);
      }
      return initialShares;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (sharesQuery.data) {
      setFractionalShares(sharesQuery.data);
    }
  }, [sharesQuery.data]);

  const buyMutation = useMutation({
    mutationFn: async ({ property, shareCount }: { property: FractionalShare; shareCount: number }) => {
      const userId = getAuthUserId() || 'anonymous';
      const totalAmount = shareCount * property.currentPrice;
      const ipxFee = calculateIPXFee(totalAmount, 'transaction');
      const netToProperty = totalAmount - ipxFee;

      const purchase: SharePurchase = {
        id: `purchase-${Date.now()}`,
        fractionalShareId: property.id,
        userId,
        userName: 'You',
        shares: shareCount,
        pricePerShare: property.currentPrice,
        totalAmount,
        ipxFee,
        netToProperty,
        purchasedAt: new Date().toISOString(),
      };

      const existingHoldingIndex = holdings.findIndex(h => h.fractionalShareId === property.id);
      let newHoldings: IPXHolding[];

      if (existingHoldingIndex >= 0) {
        const existing = holdings[existingHoldingIndex];
        const newTotalShares = existing.shares + shareCount;
        const newTotalInvested = existing.totalInvested + totalAmount;
        const newAvgCost = newTotalInvested / newTotalShares;
        const newCurrentValue = newTotalShares * property.currentPrice;
        const newPnL = newCurrentValue - newTotalInvested;
        const newPnLPercent = (newPnL / newTotalInvested) * 100;

        newHoldings = [...holdings];
        newHoldings[existingHoldingIndex] = {
          ...existing,
          shares: newTotalShares,
          avgCostBasis: newAvgCost,
          currentPrice: property.currentPrice,
          currentValue: newCurrentValue,
          totalInvested: newTotalInvested,
          unrealizedPnL: newPnL,
          unrealizedPnLPercent: newPnLPercent,
        };
      } else {
        const newHolding: IPXHolding = {
          id: `ipx-holding-${Date.now()}`,
          fractionalShareId: property.id,
          propertyName: property.propertyName,
          propertyAddress: property.propertyAddress,
          shares: shareCount,
          avgCostBasis: property.currentPrice,
          currentPrice: property.currentPrice,
          currentValue: totalAmount,
          totalInvested: totalAmount,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          purchasedAt: new Date().toISOString(),
        };
        newHoldings = [...holdings, newHolding];
      }

      const newPurchases = [purchase, ...purchases];

      try {
        const holdingToUpsert = newHoldings.find(h => h.fractionalShareId === property.id);
        if (holdingToUpsert) {
          await supabase.from('ipx_holdings').upsert({
            id: holdingToUpsert.id,
            user_id: userId,
            fractional_share_id: holdingToUpsert.fractionalShareId,
            property_name: holdingToUpsert.propertyName,
            property_address: holdingToUpsert.propertyAddress,
            shares: holdingToUpsert.shares,
            avg_cost_basis: holdingToUpsert.avgCostBasis,
            current_price: holdingToUpsert.currentPrice,
            current_value: holdingToUpsert.currentValue,
            total_invested: holdingToUpsert.totalInvested,
            unrealized_pnl: holdingToUpsert.unrealizedPnL,
            unrealized_pnl_percent: holdingToUpsert.unrealizedPnLPercent,
            purchased_at: holdingToUpsert.purchasedAt,
          });
        }

        await supabase.from('ipx_purchases').insert({
          id: purchase.id,
          fractional_share_id: purchase.fractionalShareId,
          user_id: purchase.userId,
          user_name: purchase.userName,
          shares: purchase.shares,
          price_per_share: purchase.pricePerShare,
          total_amount: purchase.totalAmount,
          ipx_fee: purchase.ipxFee,
          net_to_property: purchase.netToProperty,
          purchased_at: purchase.purchasedAt,
        });

        console.log('[IPX] Purchase saved to Supabase');
      } catch (error) {
        console.log('[IPX] Supabase save failed, saving locally:', error);
      }

      await saveLocalData(newHoldings, newPurchases);
      return { newHoldings, newPurchases, property, shareCount, netToProperty };
    },
    onSuccess: ({ newHoldings, newPurchases, property, shareCount, netToProperty }) => {
      setHoldings(newHoldings);
      setPurchases(newPurchases);
      setFractionalShares(prev =>
        prev.map(fs =>
          fs.id === property.id
            ? {
                ...fs,
                availableShares: fs.availableShares - shareCount,
                totalRaised: fs.totalRaised + netToProperty,
              }
            : fs
        )
      );
      void queryClient.invalidateQueries({ queryKey: ['ipx-holdings'] });
      console.log('[IPX] Purchase complete');
    },
  });

  const buyShares = useCallback(async (
    property: FractionalShare,
    shareCount: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (shareCount < property.minShares) {
      return { success: false, error: `Minimum ${property.minShares} shares required` };
    }
    if (shareCount > property.availableShares) {
      return { success: false, error: 'Not enough shares available' };
    }
    try {
      await buyMutation.mutateAsync({ property, shareCount });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Purchase failed' };
    }
  }, [buyMutation]);

  const getTotalIPXValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.currentValue, 0);
  }, [holdings]);

  const getTotalIPXPnL = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.unrealizedPnL, 0);
  }, [holdings]);

  const getTotalIPXPnLPercent = useMemo(() => {
    const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
    if (totalInvested === 0) return 0;
    return (getTotalIPXPnL / totalInvested) * 100;
  }, [holdings, getTotalIPXPnL]);

  return useMemo(() => ({
    fractionalShares,
    holdings,
    purchases,
    isLoading: holdingsQuery.isLoading,
    buyShares,
    getTotalIPXValue,
    getTotalIPXPnL,
    getTotalIPXPnLPercent,
  }), [fractionalShares, holdings, purchases, holdingsQuery.isLoading, buyShares, getTotalIPXValue, getTotalIPXPnL, getTotalIPXPnLPercent]);
});

export function useFilteredShares(searchQuery: string, filter: string) {
  const { fractionalShares } = useIPX();

  return useMemo(() => {
    let filtered = [...fractionalShares];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        fs =>
          fs.propertyName.toLowerCase().includes(query) ||
          fs.propertyAddress.toLowerCase().includes(query)
      );
    }

    if (filter !== 'all') {
      filtered = filtered.filter(fs => {
        const address = fs.propertyAddress.toLowerCase();
        if (filter === 'residential') {
          return address.includes('residence') || address.includes('penthouse') || address.includes('apartment');
        }
        if (filter === 'commercial') {
          return address.includes('office') || address.includes('tower') || address.includes('commercial');
        }
        return true;
      });
    }

    return filtered;
  }, [fractionalShares, searchQuery, filter]);
}
