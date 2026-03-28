import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import logger from './logger';
import type { Property, MarketData, Holding, Notification } from '@/types';
import type { WalletRow } from '@/types/database';

const DEFAULT_USER = {
  id: '',
  email: '',
  firstName: '',
  lastName: '',
  kycStatus: 'pending' as const,
  country: '',
  phone: '',
  avatar: '',
  totalInvested: 0,
  totalReturns: 0,
  walletBalance: 0,
  referralCode: '',
  vipTier: 'standard' as const,
};

export function useProperties() {
  const query = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const properties: Property[] = useMemo(() => {
    if (query.data && Array.isArray(query.data) && query.data.length > 0) {
      logger.dataHooks.log('Properties loaded from Supabase:', query.data.length);
      return query.data.map((row: any) => ({
        id: row.id,
        name: row.name || '',
        location: row.location || '',
        city: row.city || '',
        country: row.country || '',
        images: row.image ? [row.image] : [],
        pricePerShare: row.share_price ?? 0,
        totalShares: row.total_shares ?? 1000,
        availableShares: row.available_shares ?? 1000,
        minInvestment: row.share_price ?? 0,
        targetRaise: (row.share_price ?? 0) * (row.total_shares ?? 1000),
        currentRaise: ((row.total_shares ?? 1000) - (row.available_shares ?? 1000)) * (row.share_price ?? 0),
        yield: row.annual_yield ?? 0,
        capRate: row.annual_yield ?? 0,
        irr: row.annual_yield ?? 0,
        occupancy: row.occupancy_rate ?? 0,
        propertyType: (row.type as Property['propertyType']) || 'residential',
        status: row.status === 'active' ? 'live' as const : (row.status as Property['status']) || 'live',
        riskLevel: 'medium' as const,
        description: row.name || '',
        highlights: [],
        documents: [],
        distributions: [],
        priceHistory: [],
        createdAt: row.created_at || new Date().toISOString(),
        closingDate: '',
      })) as Property[];
    }
    return [];
  }, [query.data]);

  return {
    properties,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!(query.data && query.data.length > 0),
  };
}

export function useProperty(propertyId: string) {
  const query = useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();
      if (error) throw error;
      return data;
    },
    retry: 1,
    enabled: !!propertyId,
  });

  const property: Property | null = useMemo(() => {
    if (query.data) {
      logger.dataHooks.log('Property loaded from Supabase:', propertyId);
      const row = query.data as any;
      return {
        id: row.id,
        name: row.name || '',
        location: row.location || '',
        city: row.city || '',
        country: row.country || '',
        images: row.image ? [row.image] : [],
        pricePerShare: row.share_price ?? 0,
        totalShares: row.total_shares ?? 1000,
        availableShares: row.available_shares ?? 1000,
        minInvestment: row.share_price ?? 0,
        targetRaise: (row.share_price ?? 0) * (row.total_shares ?? 1000),
        currentRaise: ((row.total_shares ?? 1000) - (row.available_shares ?? 1000)) * (row.share_price ?? 0),
        yield: row.annual_yield ?? 0,
        capRate: row.annual_yield ?? 0,
        irr: row.annual_yield ?? 0,
        occupancy: row.occupancy_rate ?? 0,
        propertyType: (row.type as Property['propertyType']) || 'residential',
        status: row.status === 'active' ? 'live' as const : (row.status as Property['status']) || 'live',
        riskLevel: 'medium' as const,
        description: row.name || '',
        highlights: [],
        documents: [],
        distributions: [],
        priceHistory: [],
        createdAt: row.created_at || new Date().toISOString(),
        closingDate: '',
      } as Property;
    }
    return null;
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
  const query = useQuery({
    queryKey: ['market-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_data')
        .select('*');
      if (error) throw error;
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60,
  });

  const marketData: Record<string, MarketData> = useMemo(() => {
    if (query.data && query.data.length > 0) {
      logger.dataHooks.log('Market data loaded from Supabase:', query.data.length, 'rows');
      const map: Record<string, MarketData> = {};
      (query.data as any[]).forEach((row: any) => {
        const key = row.id || row.metric || 'unknown';
        map[key] = {
          propertyId: row.id || '',
          lastPrice: row.value ?? 0,
          change24h: row.change_percent ?? 0,
          changePercent24h: row.change_percent ?? 0,
          volume24h: 0,
          high24h: row.value ?? 0,
          low24h: row.value ?? 0,
          bids: [],
          asks: [],
        };
      });
      return map;
    }
    return {};
  }, [query.data]);

  return {
    marketData,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!(query.data && query.data.length > 0),
  };
}

export function useCurrentUser() {
  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const meta = user.user_metadata || {};
      return {
        id: user.id,
        email: user.email || '',
        firstName: profile?.first_name || meta.firstName || '',
        lastName: profile?.last_name || meta.lastName || '',
        kycStatus: profile?.kyc_status || meta.kycStatus || 'pending',
        country: profile?.country || meta.country || '',
        phone: profile?.phone || meta.phone || '',
        avatar: profile?.avatar || meta.avatar || '',
        totalInvested: profile?.total_invested || 0,
        totalReturns: profile?.total_returns || 0,
      };
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const balanceQuery = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      return data;
    },
    retry: 1,
    staleTime: 1000 * 60,
  });

  const user = useMemo(() => {
    const base = profileQuery.data ? {
      ...DEFAULT_USER,
      id: profileQuery.data.id,
      email: profileQuery.data.email,
      firstName: profileQuery.data.firstName,
      lastName: profileQuery.data.lastName,
      kycStatus: profileQuery.data.kycStatus,
      country: profileQuery.data.country || '',
      phone: profileQuery.data.phone || '',
      avatar: profileQuery.data.avatar || '',
      totalInvested: profileQuery.data.totalInvested ?? 0,
      totalReturns: profileQuery.data.totalReturns ?? 0,
    } : DEFAULT_USER;

    return {
      ...base,
      walletBalance: (balanceQuery.data as unknown as WalletRow | null)?.available ?? 0,
    };
  }, [profileQuery.data, balanceQuery.data]);

  return {
    user,
    isLoading: profileQuery.isLoading || balanceQuery.isLoading,
    isError: profileQuery.isError,
    refetch: () => {
      void profileQuery.refetch();
      void balanceQuery.refetch();
    },
    isFromAPI: !!profileQuery.data,
  };
}

export function useHoldings() {
  const query = useQuery({
    queryKey: ['holdings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    retry: 1,
    staleTime: 1000 * 60 * 2,
  });

  const holdings: Holding[] = useMemo(() => {
    if (query.data && Array.isArray(query.data) && query.data.length > 0) {
      logger.dataHooks.log('Holdings loaded from Supabase:', query.data.length);
      return query.data.map((row: any) => ({
        id: row.id,
        propertyId: row.property_id || '',
        property: {
          id: row.property_id || '',
          name: row.property_id || '',
          location: '',
          city: '',
          country: '',
          images: [],
          pricePerShare: row.avg_cost_basis ?? 0,
          totalShares: 0,
          availableShares: 0,
          minInvestment: 0,
          targetRaise: 0,
          currentRaise: 0,
          yield: 0,
          capRate: 0,
          irr: 0,
          occupancy: 0,
          propertyType: 'residential' as const,
          status: 'live' as const,
          riskLevel: 'medium' as const,
          description: '',
          highlights: [],
          documents: [],
          distributions: [],
          priceHistory: [],
          createdAt: row.created_at || '',
          closingDate: '',
        },
        shares: row.shares ?? 0,
        avgCostBasis: row.avg_cost_basis ?? 0,
        currentValue: row.current_value ?? 0,
        totalReturn: row.total_return ?? 0,
        totalReturnPercent: row.total_return_percent ?? 0,
        unrealizedPnL: row.unrealized_pnl ?? 0,
        unrealizedPnLPercent: row.unrealized_pnl_percent ?? 0,
        purchaseDate: row.purchase_date || row.created_at || '',
      })) as Holding[];
    }
    return [];
  }, [query.data]);

  const totalValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
  }, [holdings]);

  const totalPnL = useMemo(() => {
    return holdings.reduce((sum, h) => sum + (h.unrealizedPnL ?? 0), 0);
  }, [holdings]);

  return {
    holdings,
    totalValue,
    totalPnL,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!(query.data && query.data.length > 0),
  };
}

export function useNotifications() {
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    retry: 1,
    staleTime: 1000 * 60,
  });

  const notifications: Notification[] = useMemo(() => {
    if (query.data && Array.isArray(query.data) && query.data.length > 0) {
      logger.dataHooks.log('Notifications loaded from Supabase:', query.data.length);
      return query.data.map((n: any) => ({
        id: n.id as string,
        type: n.type as Notification['type'],
        title: n.title as string,
        message: n.message as string,
        read: n.read as boolean,
        createdAt: n.created_at as string,
      }));
    }
    return [];
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
    isFromAPI: !!(query.data && query.data.length > 0),
  };
}

export function useWalletBalance() {
  const query = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      return data;
    },
    retry: 1,
    staleTime: 1000 * 30,
  });

  const balance = useMemo(() => {
    const wallet = query.data as unknown as WalletRow | null;
    return {
      available: wallet?.available ?? 0,
      pending: wallet?.pending ?? 0,
      invested: wallet?.invested ?? 0,
      total: wallet?.total ?? 0,
    };
  }, [query.data]);

  return {
    balance,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}

export function useTransactions(page: number = 1, limit: number = 20) {
  const query = useQuery({
    queryKey: ['transactions', page, limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { transactions: [], total: 0 };

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error, count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { transactions: data || [], total: count || 0 };
    },
    retry: 1,
    staleTime: 1000 * 60,
  });

  return {
    transactions: query.data?.transactions || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isFromAPI: !!query.data,
  };
}
