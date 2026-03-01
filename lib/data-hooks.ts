import { useMemo } from 'react';
import logger from './logger';
import { trpc } from '@/lib/trpc';
import { properties as mockProperties } from '@/mocks/properties';
import { currentUser as mockUser, holdings as mockHoldings, notifications as mockNotifications } from '@/mocks/user';
import { marketData as mockMarketData } from '@/mocks/market';
import type { Property, MarketData, Holding, Notification } from '@/types';

export function useProperties() {
  const query = trpc.properties.list.useQuery(
    { page: 1, limit: 50 },
    { retry: 1, staleTime: 1000 * 60 * 5 },
  );

  const properties: Property[] = useMemo(() => {
    if (query.data && (query.data as any).properties && Array.isArray((query.data as any).properties)) {
      logger.dataHooks.log('Properties loaded from API:', (query.data as any).properties.length);
      return (query.data as any).properties as Property[];
    }
    return mockProperties;
  }, [query.data]);

  return {
    properties,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useProperty(propertyId: string) {
  const query = trpc.properties.getById.useQuery(
    { id: propertyId },
    { retry: 1, enabled: !!propertyId },
  );

  const property: Property | null = useMemo(() => {
    if (query.data) {
      logger.dataHooks.log('Property loaded from API:', propertyId);
      return query.data as unknown as Property;
    }
    return mockProperties.find(p => p.id === propertyId) || null;
  }, [query.data, propertyId]);

  return {
    property,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useMarketData() {
  const query = trpc.market.getAllMarketData.useQuery(undefined, {
    retry: 1,
    staleTime: 1000 * 60,
  });

  const marketData: Record<string, MarketData> = useMemo(() => {
    if (query.data && (query.data as any).markets) {
      logger.dataHooks.log('Market data loaded from API');
      const markets = (query.data as any).markets as Array<MarketData & { propertyId: string }>;
      const map: Record<string, MarketData> = {};
      markets.forEach(m => { map[m.propertyId] = m; });
      return map;
    }
    return mockMarketData;
  }, [query.data]);

  return {
    marketData,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useCurrentUser() {
  const profileQuery = trpc.users.getProfile.useQuery(undefined, {
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });
  const balanceQuery = trpc.wallet.getBalance.useQuery(undefined, {
    retry: 1,
    staleTime: 1000 * 60,
  });

  const user = useMemo(() => {
    const base = profileQuery.data ? {
      ...mockUser,
      id: profileQuery.data.id,
      email: profileQuery.data.email,
      firstName: profileQuery.data.firstName,
      lastName: profileQuery.data.lastName,
      kycStatus: profileQuery.data.kycStatus,
      country: (profileQuery.data as any).country || mockUser.country,
      phone: (profileQuery.data as any).phone || mockUser.phone,
      avatar: (profileQuery.data as any).avatar || mockUser.avatar,
      totalInvested: (profileQuery.data as any).totalInvested ?? mockUser.totalInvested,
      totalReturns: (profileQuery.data as any).totalReturns ?? mockUser.totalReturns,
    } : mockUser;

    return {
      ...base,
      walletBalance: balanceQuery.data?.available ?? base.walletBalance,
    };
  }, [profileQuery.data, balanceQuery.data]);

  return {
    user,
    isLoading: profileQuery.isLoading || balanceQuery.isLoading,
    isError: profileQuery.isError,
    refetch: () => {
      profileQuery.refetch();
      balanceQuery.refetch();
    },
    isFromAPI: !!profileQuery.data,
  };
}

export function useHoldings() {
  const query = trpc.wallet.getPortfolio.useQuery(undefined, {
    retry: 1,
    staleTime: 1000 * 60 * 2,
  });

  const holdings: Holding[] = useMemo(() => {
    if (query.data && Array.isArray((query.data as any).holdings)) {
      logger.dataHooks.log('Holdings loaded from API');
      return (query.data as any).holdings as Holding[];
    }
    return mockHoldings;
  }, [query.data]);

  const totalValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.currentValue, 0);
  }, [holdings]);

  const totalPnL = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.unrealizedPnL, 0);
  }, [holdings]);

  return {
    holdings,
    totalValue,
    totalPnL,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useNotifications() {
  const query = trpc.notifications.list.useQuery(
    { page: 1, limit: 50 },
    { retry: 1, staleTime: 1000 * 60 },
  );

  const notifications: Notification[] = useMemo(() => {
    if (query.data && (query.data as any).notifications) {
      const items = (query.data as any).notifications as Array<Record<string, unknown>>;
      logger.dataHooks.log('Notifications loaded from API:', items.length);
      return items.map(n => ({
        id: n.id as string,
        type: n.type as Notification['type'],
        title: n.title as string,
        message: n.message as string,
        read: n.read as boolean,
        createdAt: n.createdAt as string,
      }));
    }
    return mockNotifications;
  }, [query.data]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useWalletBalance() {
  const query = trpc.wallet.getBalance.useQuery(undefined, {
    retry: 1,
    staleTime: 1000 * 30,
  });

  const balance = useMemo(() => ({
    available: query.data?.available ?? mockUser.walletBalance,
    pending: query.data?.pending ?? 0,
    invested: query.data?.invested ?? mockUser.totalInvested,
    total: query.data?.total ?? (mockUser.walletBalance + mockUser.totalInvested),
  }), [query.data]);

  return {
    balance,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useTransactions(page: number = 1, limit: number = 20) {
  const query = trpc.wallet.getTransactionHistory.useQuery(
    { page, limit },
    { retry: 1, staleTime: 1000 * 60 },
  );

  return {
    transactions: (query.data as any)?.transactions || [],
    total: (query.data as any)?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}
