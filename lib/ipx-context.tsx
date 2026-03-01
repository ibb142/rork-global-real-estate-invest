import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { FractionalShare, SharePurchase } from '@/types';
import { fractionalShares as initialShares, calculateIPXFee } from '@/mocks/ipx-invest';
import { trpc } from '@/lib/trpc';
import { getAuthUserId } from '@/lib/auth-store';

const IPX_HOLDINGS_KEY = '@ipx_holdings';
const IPX_PURCHASES_KEY = '@ipx_purchases';

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

export const [IPXProvider, useIPX] = createContextHook(() => {
  const [fractionalShares, setFractionalShares] = useState<FractionalShare[]>(initialShares);
  const [holdings, setHoldings] = useState<IPXHolding[]>([]);
  const [purchases, setPurchases] = useState<SharePurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const portfolioQuery = trpc.wallet.getPortfolio.useQuery(undefined, {
    enabled: true,
    retry: 1,
    staleTime: 60000,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (portfolioQuery.data?.holdings) {
      console.log('[IPX] Synced portfolio from backend:', portfolioQuery.data.holdings.length, 'holdings');
    }
  }, [portfolioQuery.data]);

  const loadData = async () => {
    try {
      const [holdingsData, purchasesData] = await Promise.all([
        AsyncStorage.getItem(IPX_HOLDINGS_KEY),
        AsyncStorage.getItem(IPX_PURCHASES_KEY),
      ]);

      if (holdingsData) {
        setHoldings(JSON.parse(holdingsData));
      }
      if (purchasesData) {
        setPurchases(JSON.parse(purchasesData));
      }
    } catch (error) {
      console.log('Error loading IPX data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (newHoldings: IPXHolding[], newPurchases: SharePurchase[]) => {
    try {
      await Promise.all([
        AsyncStorage.setItem(IPX_HOLDINGS_KEY, JSON.stringify(newHoldings)),
        AsyncStorage.setItem(IPX_PURCHASES_KEY, JSON.stringify(newPurchases)),
      ]);
    } catch (error) {
      console.log('Error saving IPX data:', error);
    }
  };

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

    const totalAmount = shareCount * property.currentPrice;
    const ipxFee = calculateIPXFee(totalAmount, 'transaction');
    const netToProperty = totalAmount - ipxFee;

    const purchase: SharePurchase = {
      id: `purchase-${Date.now()}`,
      fractionalShareId: property.id,
      userId: getAuthUserId() || 'anonymous',
      userName: 'You',
      shares: shareCount,
      pricePerShare: property.currentPrice,
      totalAmount,
      ipxFee,
      netToProperty,
      purchasedAt: new Date().toISOString(),
    };

    const existingHoldingIndex = holdings.findIndex(
      h => h.fractionalShareId === property.id
    );

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

    const newPurchases = [purchase, ...purchases];
    setHoldings(newHoldings);
    setPurchases(newPurchases);
    await saveData(newHoldings, newPurchases);

    console.log('IPX Purchase successful:', {
      property: property.propertyName,
      shares: shareCount,
      total: totalAmount,
      fee: ipxFee,
    });

    portfolioQuery.refetch();

    return { success: true };
  }, [holdings, purchases]);

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

  return {
    fractionalShares,
    holdings,
    purchases,
    isLoading,
    buyShares,
    getTotalIPXValue,
    getTotalIPXPnL,
    getTotalIPXPnLPercent,
  };
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
