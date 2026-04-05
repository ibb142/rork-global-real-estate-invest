import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  Member,
  AdminStats,
  AdminTransaction,
  TeamMember,
  AdminRole,
  FeeConfiguration,
  FeeTransaction,
  FeeStats,
  TitleCompany,
  TitleCompanyAssignment,
  Lender,
  PropertySubmission,
  FractionalShare,
  LandPartnerDeal,
} from '@/types';
import { ADMIN_ROLES, FEE_CONFIGURATIONS } from '@/constants/platform-config';

export function useMembers() {
  const query = useQuery({
    queryKey: ['admin-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,first_name,last_name,email,phone,country,avatar,kyc_status,total_invested,total_returns,created_at,updated_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        console.log('[AdminQueries] Members fetch error:', error.message);
        throw error;
      }
      return data || [];
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const members: Member[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      email: row.email || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatar: row.avatar || '',
      phone: row.phone || '',
      country: row.country || '',
      kycStatus: row.kyc_status || 'pending',
      eligibilityStatus: 'pending' as const,
      walletBalance: 0,
      totalInvested: row.total_invested || 0,
      totalReturns: row.total_returns || 0,
      createdAt: row.created_at || new Date().toISOString(),
      holdings: 0,
      totalTransactions: 0,
      lastActivity: row.updated_at || row.created_at || new Date().toISOString(),
      status: 'active' as const,
    }));
  }, [query.data]);

  return { members, isLoading: query.isLoading, refetch: query.refetch };
}

export function useAdminStats() {
  const query = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [profilesRes, propertiesRes, transactionsRes] = await Promise.all([
        supabase.from('profiles').select('id,kyc_status,total_invested', { count: 'exact' }).limit(1),
        supabase.from('properties').select('id,status', { count: 'exact' }).limit(1),
        supabase.from('transactions').select('id,amount', { count: 'exact' }).limit(1),
      ]);
      return {
        totalMembers: profilesRes.count || 0,
        totalProperties: propertiesRes.count || 0,
        totalTransactions: transactionsRes.count || 0,
      };
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const stats: AdminStats = useMemo(() => ({
    totalMembers: query.data?.totalMembers || 0,
    activeMembers: 0,
    pendingKyc: 0,
    totalTransactions: query.data?.totalTransactions || 0,
    totalVolume: 0,
    totalProperties: query.data?.totalProperties || 0,
    liveProperties: 0,
    totalInvested: 0,
  }), [query.data]);

  return { stats, isLoading: query.isLoading, refetch: query.refetch };
}

export function useAdminTransactions(limit: number = 20) {
  const query = useQuery({
    queryKey: ['admin-transactions', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id,user_id,type,amount,status,description,property_id,property_name,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    retry: 1,
    staleTime: 1000 * 60 * 3,
  });

  const transactions: AdminTransaction[] = useMemo(() => {
    if (!query.data) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      type: row.type || 'buy',
      amount: row.amount || 0,
      status: row.status || 'pending',
      description: row.description || '',
      propertyId: row.property_id,
      propertyName: row.property_name,
      createdAt: row.created_at || new Date().toISOString(),
      userId: row.user_id || '',
      userName: '',
      userEmail: '',
    }));
  }, [query.data]);

  return { transactions, isLoading: query.isLoading, refetch: query.refetch };
}

export function useTeamMembers() {
  const query = useQuery({
    queryKey: ['admin-team'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) {
        console.log('[AdminQueries] Team members table may not exist yet:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 10,
  });

  const teamMembers: TeamMember[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) {
      return [{
        id: 'admin-1',
        email: 'ceo@ipxholding.com',
        firstName: 'IVXHOLDINGS',
        lastName: 'CEO',
        avatar: '',
        phone: '+1 (561) 644-3503',
        roleId: 'role-ceo',
        role: ADMIN_ROLES[0] as AdminRole,
        status: 'active' as const,
        lastLogin: new Date().toISOString(),
        createdAt: '2024-01-01T00:00:00Z',
      }];
    }
    return query.data.map((row: any) => ({
      id: row.id,
      email: row.email || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatar: row.avatar || '',
      phone: row.phone || '',
      roleId: row.role_id || 'role-viewer',
      role: ADMIN_ROLES.find(r => r.id === row.role_id) as AdminRole || ADMIN_ROLES[4] as AdminRole,
      status: row.status || 'active',
      lastLogin: row.last_login,
      invitedBy: row.invited_by,
      invitedAt: row.invited_at,
      createdAt: row.created_at || new Date().toISOString(),
    }));
  }, [query.data]);

  return { teamMembers, isLoading: query.isLoading, refetch: query.refetch };
}

export function useFeeConfigurations() {
  const query = useQuery({
    queryKey: ['fee-configurations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fee_configurations')
        .select('*')
        .order('type');
      if (error) {
        console.log('[AdminQueries] Fee configurations table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 30,
  });

  const configurations: FeeConfiguration[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) {
      return FEE_CONFIGURATIONS;
    }
    return query.data.map((row: any) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      percentage: row.percentage || 0,
      minFee: row.min_fee || 0,
      maxFee: row.max_fee || 0,
      isActive: row.is_active ?? true,
      updatedAt: row.updated_at || new Date().toISOString(),
    }));
  }, [query.data]);

  return { configurations, isLoading: query.isLoading, refetch: query.refetch };
}

export function useFeeTransactions() {
  const query = useQuery({
    queryKey: ['fee-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fee_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        console.log('[AdminQueries] Fee transactions table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const transactions: FeeTransaction[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      transactionId: row.transaction_id || '',
      transactionType: row.transaction_type || 'buy',
      userId: row.user_id || '',
      userName: row.user_name || '',
      userEmail: row.user_email || '',
      transactionAmount: row.transaction_amount || 0,
      feePercentage: row.fee_percentage || 0,
      feeAmount: row.fee_amount || 0,
      propertyId: row.property_id,
      propertyName: row.property_name,
      status: row.status || 'collected',
      createdAt: row.created_at || new Date().toISOString(),
    }));
  }, [query.data]);

  return { transactions, isLoading: query.isLoading, refetch: query.refetch };
}

export function useFeeStats(): FeeStats {
  const { transactions } = useFeeTransactions();
  return useMemo(() => {
    const collected = transactions.filter(ft => ft.status === 'collected');
    const totalCollected = collected.reduce((sum, ft) => sum + ft.feeAmount, 0);
    return {
      totalFeesCollected: totalCollected,
      feesThisMonth: 0,
      feesLastMonth: 0,
      feeGrowthPercent: 0,
      totalTransactionsWithFees: transactions.length,
      averageFeeAmount: collected.length > 0 ? totalCollected / collected.length : 0,
      feesByType: {
        buy: collected.filter(ft => ft.transactionType === 'buy').reduce((s, ft) => s + ft.feeAmount, 0),
        sell: collected.filter(ft => ft.transactionType === 'sell').reduce((s, ft) => s + ft.feeAmount, 0),
        withdrawal: 0,
        deposit: 0,
      },
    };
  }, [transactions]);
}

export function useTitleCompanies() {
  const query = useQuery({
    queryKey: ['title-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('title_companies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.log('[AdminQueries] Title companies table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 10,
  });

  const companies: TitleCompany[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      name: row.name || '',
      contactName: row.contact_name || '',
      email: row.email || '',
      phone: row.phone || '',
      address: row.address || '',
      city: row.city || '',
      state: row.state || '',
      licenseNumber: row.license_number || '',
      status: row.status || 'active',
      assignedProperties: row.assigned_properties || [],
      completedReviews: row.completed_reviews || 0,
      averageReviewDays: row.average_review_days || 0,
      createdAt: row.created_at || new Date().toISOString(),
    }));
  }, [query.data]);

  return { companies, isLoading: query.isLoading, refetch: query.refetch };
}

export function useTitleAssignments() {
  const query = useQuery({
    queryKey: ['title-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('title_assignments')
        .select('*')
        .order('assigned_at', { ascending: false });
      if (error) {
        console.log('[AdminQueries] Title assignments table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const assignments: TitleCompanyAssignment[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      propertyId: row.property_id || '',
      propertyName: row.property_name || '',
      propertyAddress: row.property_address || '',
      titleCompanyId: row.title_company_id || '',
      titleCompanyName: row.title_company_name || '',
      assignedAt: row.assigned_at || new Date().toISOString(),
      assignedBy: row.assigned_by || '',
      status: row.status || 'assigned',
      completedAt: row.completed_at,
      notes: row.notes,
    }));
  }, [query.data]);

  return { assignments, isLoading: query.isLoading, refetch: query.refetch };
}

export function useLenders() {
  const query = useQuery({
    queryKey: ['lenders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lenders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.log('[AdminQueries] Lenders table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 10,
  });

  const lenders: Lender[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      name: row.name || '',
      type: row.type || 'private',
      category: row.category || 'bank',
      contactName: row.contact_name || '',
      contactTitle: row.contact_title || '',
      email: row.email || '',
      phone: row.phone || '',
      website: row.website,
      address: row.address || '',
      city: row.city || '',
      state: row.state || '',
      country: row.country || '',
      logo: row.logo,
      description: row.description || '',
      aum: row.aum || 0,
      minInvestment: row.min_investment || 0,
      maxInvestment: row.max_investment || 0,
      preferredPropertyTypes: row.preferred_property_types || [],
      preferredRegions: row.preferred_regions || [],
      interestRate: row.interest_rate,
      ltvRange: row.ltv_range,
      status: row.status || 'prospect',
      lastContactedAt: row.last_contacted_at,
      totalInvested: row.total_invested || 0,
      propertiesInvested: row.properties_invested || 0,
      rating: row.rating || 0,
      tags: row.tags || [],
      createdAt: row.created_at || new Date().toISOString(),
    }));
  }, [query.data]);

  return { lenders, isLoading: query.isLoading, refetch: query.refetch };
}

export function usePropertySubmissions() {
  const query = useQuery({
    queryKey: ['property-submissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_submissions')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (error) {
        console.log('[AdminQueries] Property submissions table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const submissions: PropertySubmission[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data as PropertySubmission[];
  }, [query.data]);

  return { submissions, isLoading: query.isLoading, refetch: query.refetch };
}

export function useFractionalShares() {
  const query = useQuery({
    queryKey: ['fractional-shares'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fractional_shares')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.log('[AdminQueries] Fractional shares table may not exist:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const shares: FractionalShare[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data as FractionalShare[];
  }, [query.data]);

  return { shares, isLoading: query.isLoading, refetch: query.refetch };
}

export function useLandPartnerDeals() {
  const query = useQuery({
    queryKey: ['land-partner-deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jv_deals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.log('[AdminQueries] JV deals query error:', error.message);
        return null;
      }
      return data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5,
  });

  const deals: LandPartnerDeal[] = useMemo(() => {
    if (!query.data || !Array.isArray(query.data)) return [];
    return query.data.map((row: any) => ({
      id: row.id,
      partnerId: row.user_id || '',
      partnerName: row.partner_name || '',
      partnerEmail: row.partner_email || '',
      partnerPhone: row.partner_phone || '',
      partnerType: row.partner_type || 'jv',
      propertyAddress: row.property_address || row.propertyAddress || '',
      city: row.city || '',
      state: row.state || '',
      zipCode: row.zip_code || '',
      country: row.country || '',
      lotSize: row.lot_size || 0,
      lotSizeUnit: row.lot_size_unit || 'sqft',
      zoning: row.zoning || '',
      propertyType: row.property_type || 'land',
      estimatedValue: row.estimated_value || 0,
      appraisedValue: row.appraised_value,
      cashPaymentPercent: row.cash_payment_percent || 60,
      collateralPercent: row.collateral_percent || 40,
      partnerProfitShare: row.partner_profit_share || 30,
      developerProfitShare: row.developer_profit_share || 70,
      termMonths: row.term_months || 30,
      cashPaymentAmount: row.cash_payment_amount || 0,
      collateralAmount: row.collateral_amount || 0,
      status: row.status || 'draft',
      controlDisclosureAccepted: row.control_disclosure_accepted || false,
      submittedAt: row.submitted_at || row.created_at || new Date().toISOString(),
    })) as LandPartnerDeal[];
  }, [query.data]);

  const stats = useMemo(() => ({
    totalDeals: deals.length,
    activeDeals: deals.filter(d => d.status === 'active').length,
    pendingDeals: deals.filter(d => ['draft', 'submitted', 'valuation', 'review'].includes(d.status)).length,
    completedDeals: deals.filter(d => d.status === 'completed').length,
    totalLandValue: deals.reduce((s, d) => s + (d.estimatedValue || 0), 0),
    totalCashPaid: deals.reduce((s, d) => s + (d.cashPaymentAmount || 0), 0),
    totalCollateral: deals.reduce((s, d) => s + (d.collateralAmount || 0), 0),
    jvDeals: deals.filter(d => d.partnerType === 'jv').length,
    lpDeals: deals.filter(d => d.partnerType === 'lp').length,
  }), [deals]);

  return { deals, stats, isLoading: query.isLoading, refetch: query.refetch };
}
