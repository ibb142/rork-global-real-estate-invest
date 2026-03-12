import { Member, AdminStats, AdminTransaction, MemberActivity, EngagementMessage, MemberEngagementStats, BroadcastMessage, BroadcastTemplate, BroadcastStats, BroadcastRecipient, AdminRole, TeamMember, AdminPermission, FeeConfiguration, FeeTransaction, FeeStats } from '@/types';

export const members: Member[] = [];

export const adminTransactions: AdminTransaction[] = [];

export const adminStats: AdminStats = {
  totalMembers: 0,
  activeMembers: 0,
  pendingKyc: 0,
  totalTransactions: 0,
  totalVolume: 0,
  totalProperties: 6,
  liveProperties: 4,
  totalInvested: 0,
};

export const getAdminStats = (): AdminStats => adminStats;

export const getMemberById = (id: string): Member | undefined => {
  return members.find(m => m.id === id);
};

export const getPendingKycMembers = (): Member[] => {
  return members.filter(m => m.kycStatus === 'pending' || m.kycStatus === 'in_review');
};

export const getActiveMembers = (): Member[] => {
  return members.filter(m => m.status === 'active');
};

export const getRecentTransactions = (limit: number = 10): AdminTransaction[] => {
  return [...adminTransactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
};

export const memberActivities: MemberActivity[] = [];

export const engagementMessages: EngagementMessage[] = [];

export const getInactiveMembers = (days: number = 2): MemberEngagementStats[] => {
  const now = new Date('2025-01-25T00:00:00Z');
  return members
    .map((member) => {
      const lastActivity = new Date(member.lastActivity);
      const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
      
      let riskLevel: MemberEngagementStats['riskLevel'] = 'active';
      if (daysSince >= 7) riskLevel = 'churned';
      else if (daysSince >= 4) riskLevel = 'inactive';
      else if (daysSince >= 2) riskLevel = 'at_risk';
      
      const engagementScore = Math.max(0, 100 - (daysSince * 10) - (member.totalInvested === 0 ? 20 : 0));
      
      return {
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`,
        memberEmail: member.email,
        memberAvatar: member.avatar,
        lastActivityDate: member.lastActivity,
        daysSinceLastActivity: daysSince,
        totalInvested: member.totalInvested,
        engagementScore,
        riskLevel,
        suggestedAction: riskLevel === 'at_risk' 
          ? 'Send re-engagement message' 
          : riskLevel === 'inactive' 
          ? 'Personal outreach recommended'
          : riskLevel === 'churned'
          ? 'Win-back campaign'
          : undefined,
      };
    })
    .filter((m) => m.daysSinceLastActivity >= days)
    .sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);
};

export const getRecentActivities = (limit: number = 10): MemberActivity[] => {
  return [...memberActivities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
};

export const getEngagementStats = () => {
  const inactive = getInactiveMembers(2);
  return {
    totalMembers: members.length,
    activeMembers: members.filter(m => {
      const daysSince = Math.floor((new Date('2025-01-25').getTime() - new Date(m.lastActivity).getTime()) / (1000 * 60 * 60 * 24));
      return daysSince < 2;
    }).length,
    atRiskMembers: inactive.filter(m => m.riskLevel === 'at_risk').length,
    inactiveMembers: inactive.filter(m => m.riskLevel === 'inactive').length,
    churnedMembers: inactive.filter(m => m.riskLevel === 'churned').length,
    messagesSent: engagementMessages.length,
    messagesOpened: engagementMessages.filter(m => m.status === 'opened').length,
  };
};

export const broadcastTemplates: BroadcastTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Welcome New Member',
    subject: 'Welcome to IVX HOLDINGS - Start Your Investment Journey',
    body: 'Dear {{name}},\n\nWelcome to IVX HOLDINGS! We\'re thrilled to have you join our community of smart real estate investors.\n\nWith IVX HOLDINGS, you can:\n• Invest in premium properties with as little as $100\n• Earn passive income through rental distributions\n• Build a diversified real estate portfolio\n\nReady to get started? Browse our available properties today!\n\nBest regards,\nThe IVX HOLDINGS Team',
    category: 'welcome',
  },
  {
    id: 'tpl-2',
    name: 'Re-engagement Campaign',
    subject: 'We Miss You! Exclusive Properties Await',
    body: 'Hi {{name}},\n\nIt\'s been a while since we\'ve seen you on IVX HOLDINGS. We wanted to reach out and let you know about some exciting new investment opportunities.\n\nNew properties added:\n• Premium residential units with 8%+ yields\n• Commercial spaces in prime locations\n• Mixed-use developments with strong returns\n\nLog in now to explore these opportunities before they\'re fully funded!\n\nWarm regards,\nIVX HOLDINGS Team',
    category: 'reengagement',
  },
  {
    id: 'tpl-3',
    name: 'New Property Alert',
    subject: 'New Investment Opportunity: {{property_name}}',
    body: 'Dear {{name}},\n\nWe\'re excited to announce a new property available for investment!\n\n{{property_name}}\n• Location: {{property_location}}\n• Expected Yield: {{property_yield}}%\n• Minimum Investment: ${{min_investment}}\n\nThis property is already generating interest. Don\'t miss your chance to invest!\n\nInvest Now →\n\nBest,\nIVX HOLDINGS Team',
    category: 'promotion',
  },
  {
    id: 'tpl-4',
    name: 'Dividend Distribution',
    subject: 'Your Dividend Payment Has Been Processed',
    body: 'Dear {{name}},\n\nGreat news! Your dividend distribution has been processed.\n\nDistribution Details:\n• Amount: ${{amount}}\n• Property: {{property_name}}\n• Period: {{period}}\n\nThe funds have been credited to your IVXHOLDINGS wallet. You can reinvest or withdraw at any time.\n\nView your portfolio →\n\nThank you for investing with IVX HOLDINGS!',
    category: 'update',
  },
  {
    id: 'tpl-5',
    name: 'KYC Reminder',
    subject: 'Complete Your KYC to Start Investing',
    body: 'Hi {{name}},\n\nYour account is almost ready! To start investing in premium real estate, please complete your KYC verification.\n\nIt only takes a few minutes:\n1. Log in to your account\n2. Go to Settings > Verification\n3. Upload your documents\n\nOnce verified, you\'ll have full access to all investment opportunities.\n\nComplete KYC Now →\n\nNeed help? Contact our support team anytime.\n\nBest,\nIVX HOLDINGS Team',
    category: 'reminder',
  },
];

export const broadcastHistory: BroadcastMessage[] = [];

export const getBroadcastRecipients = (filter: string): BroadcastRecipient[] => {
  let filtered = members;
  
  switch (filter) {
    case 'active':
      filtered = members.filter(m => m.status === 'active');
      break;
    case 'inactive':
      filtered = members.filter(m => m.status === 'inactive' || m.status === 'suspended');
      break;
    case 'kyc_pending':
      filtered = members.filter(m => m.kycStatus === 'pending' || m.kycStatus === 'in_review');
      break;
    case 'high_value':
      filtered = members.filter(m => m.totalInvested >= 50000);
      break;
    default:
      filtered = members;
  }
  
  return filtered.map(m => ({
    id: m.id,
    name: `${m.firstName} ${m.lastName}`,
    email: m.email,
    phone: m.phone,
    avatar: m.avatar,
    selected: true,
  }));
};

export const getBroadcastStats = (): BroadcastStats => {
  const totalSent = broadcastHistory.reduce((acc, b) => acc + b.sentCount, 0);
  const totalFailed = broadcastHistory.reduce((acc, b) => acc + b.failedCount, 0);
  return {
    totalSent,
    totalDelivered: Math.floor(totalSent * 0.98),
    totalFailed,
    totalOpened: Math.floor(totalSent * 0.45),
    deliveryRate: 98,
    openRate: 45,
  };
};

export const adminRoles: AdminRole[] = [
  {
    id: 'role-ceo',
    name: 'CEO',
    type: 'ceo',
    description: 'Full access to all admin features. Can manage team members and assign roles.',
    permissions: ['manage_members', 'manage_transactions', 'manage_properties', 'manage_kyc', 'manage_support', 'view_analytics'],
    isSystemRole: true,
  },
  {
    id: 'role-manager',
    name: 'Manager',
    type: 'manager',
    description: 'Can manage members, properties, and view analytics. Cannot manage team.',
    permissions: ['manage_members', 'manage_properties', 'manage_kyc', 'view_analytics'],
    isSystemRole: true,
  },
  {
    id: 'role-analyst',
    name: 'Analyst',
    type: 'analyst',
    description: 'Can view analytics and member data. Read-only access.',
    permissions: ['view_analytics'],
    isSystemRole: true,
  },
  {
    id: 'role-support',
    name: 'Support Agent',
    type: 'support',
    description: 'Can manage support tickets and view member information.',
    permissions: ['manage_support', 'manage_kyc'],
    isSystemRole: true,
  },
  {
    id: 'role-viewer',
    name: 'Viewer',
    type: 'viewer',
    description: 'Read-only access to dashboard and reports.',
    permissions: ['view_analytics'],
    isSystemRole: true,
  },
];

export const teamMembers: TeamMember[] = [
  {
    id: 'admin-1',
    email: 'ceo@ipxholding.com',
    firstName: 'IVXHOLDINGS',
    lastName: 'CEO',
    avatar: '',
    phone: '+1 (561) 644-3503',
    roleId: 'role-ceo',
    role: adminRoles[0],
    status: 'active',
    lastLogin: '2025-01-25T09:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'admin-2',
    email: 'operations@ipxholding.com',
    firstName: 'Sarah',
    lastName: 'Martinez',
    avatar: '',
    phone: '+1 (555) 234-5678',
    roleId: 'role-manager',
    role: adminRoles[1],
    status: 'active',
    lastLogin: '2025-01-24T16:30:00Z',
    invitedBy: 'admin-1',
    invitedAt: '2024-03-15T10:00:00Z',
    createdAt: '2024-03-15T10:00:00Z',
  },
  {
    id: 'admin-3',
    email: 'analyst@ipxholding.com',
    firstName: 'Michael',
    lastName: 'Chen',
    avatar: '',
    phone: '+1 (555) 345-6789',
    roleId: 'role-analyst',
    role: adminRoles[2],
    status: 'active',
    lastLogin: '2025-01-23T11:00:00Z',
    invitedBy: 'admin-1',
    invitedAt: '2024-06-01T09:00:00Z',
    createdAt: '2024-06-01T09:00:00Z',
  },
  {
    id: 'admin-4',
    email: 'support@ipxholding.com',
    firstName: 'Emily',
    lastName: 'Johnson',
    avatar: '',
    phone: '+1 (555) 456-7890',
    roleId: 'role-support',
    role: adminRoles[3],
    status: 'active',
    lastLogin: '2025-01-25T08:45:00Z',
    invitedBy: 'admin-1',
    invitedAt: '2024-08-20T14:00:00Z',
    createdAt: '2024-08-20T14:00:00Z',
  },
  {
    id: 'admin-5',
    email: 'newemployee@ipxholding.com',
    firstName: 'James',
    lastName: 'Wilson',
    roleId: 'role-viewer',
    role: adminRoles[4],
    status: 'invited',
    invitedBy: 'admin-1',
    invitedAt: '2025-01-20T10:00:00Z',
    createdAt: '2025-01-20T10:00:00Z',
  },
];

export const getTeamMembers = (): TeamMember[] => teamMembers;

export const getTeamMemberById = (id: string): TeamMember | undefined => {
  return teamMembers.find(m => m.id === id);
};

export const getAdminRoles = (): AdminRole[] => adminRoles;

export const getRoleById = (id: string): AdminRole | undefined => {
  return adminRoles.find(r => r.id === id);
};

export const getCurrentAdmin = (): TeamMember => teamMembers[0];

export const hasPermission = (memberId: string, permission: AdminPermission): boolean => {
  const member = getTeamMemberById(memberId);
  if (!member) return false;
  return member.role.permissions.includes(permission);
};

export const canManageTeam = (memberId: string): boolean => {
  const member = getTeamMemberById(memberId);
  if (!member) return false;
  return member.role.type === 'ceo';
};

export const feeConfigurations: FeeConfiguration[] = [
  {
    id: 'fee-buy',
    type: 'buy',
    name: 'Daily Trading Fee (Buy)',
    percentage: 1.0,
    minFee: 0.50,
    maxFee: 500.00,
    isActive: true,
    updatedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'fee-sell',
    type: 'sell',
    name: 'Daily Trading Fee (Sell/Exit)',
    percentage: 1.0,
    minFee: 0.50,
    maxFee: 500.00,
    isActive: true,
    updatedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'fee-withdrawal',
    type: 'withdrawal',
    name: 'Withdrawal Fee',
    percentage: 0.0,
    minFee: 0.00,
    maxFee: 0.00,
    isActive: false,
    updatedAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'fee-deposit',
    type: 'deposit',
    name: 'Deposit Fee',
    percentage: 0.0,
    minFee: 0.00,
    maxFee: 0.00,
    isActive: false,
    updatedAt: '2025-01-15T10:00:00Z',
  },
];

export const platformFeeStructure = {
  // Long-term Investment Fees
  entryFee: 2.0,
  annualManagementFee: 2.0,
  exitFee: 1.0,
  // Daily Trading Fees (Stock Market Style)
  dailyTradingFee: 1.0,
  dailyTradingExitFee: 1.0,
  // Real Estate Agent Commission (Property Sourcing)
  agentPropertyCommission: 2.0, // 2% on listing value for agents who bring property owners
  agentCommissionPaidOnListing: true,
  // Investor Broker Commission (Investor/Lender Sourcing)
  brokerInvestorCommission: 2.0, // 2% on investment amount for brokers who bring investors/lenders
  brokerCommissionRecurring: true, // Recurring on all future investments from referred investors
  brokerCommissionPaidMonthly: true,
  // Influencer
  influencerCommission: 1.5,
  // Returns
  investorAnnualReturn: 10.0,
  managementFeePaidMonthly: true,
  influencerCommissionOneTime: true,
  // Tax Responsibility
  userResponsibleForTaxes: true,
};

export const feeTransactions: FeeTransaction[] = [];

export const getFeeStats = (): FeeStats => {
  const now = new Date('2025-01-25');
  const thisMonth = feeTransactions.filter(ft => {
    const date = new Date(ft.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() && ft.status === 'collected';
  });
  const lastMonth = feeTransactions.filter(ft => {
    const date = new Date(ft.createdAt);
    return date.getMonth() === now.getMonth() - 1 && date.getFullYear() === now.getFullYear() && ft.status === 'collected';
  });

  const feesThisMonth = thisMonth.reduce((sum, ft) => sum + ft.feeAmount, 0);
  const feesLastMonth = lastMonth.reduce((sum, ft) => sum + ft.feeAmount, 0);
  const totalCollected = feeTransactions.filter(ft => ft.status === 'collected').reduce((sum, ft) => sum + ft.feeAmount, 0);

  return {
    totalFeesCollected: totalCollected,
    feesThisMonth,
    feesLastMonth,
    feeGrowthPercent: feesLastMonth > 0 ? ((feesThisMonth - feesLastMonth) / feesLastMonth) * 100 : 100,
    totalTransactionsWithFees: feeTransactions.length,
    averageFeeAmount: feeTransactions.filter(ft => ft.status === 'collected').length > 0 ? totalCollected / feeTransactions.filter(ft => ft.status === 'collected').length : 0,
    feesByType: {
      buy: feeTransactions.filter(ft => ft.transactionType === 'buy' && ft.status === 'collected').reduce((sum, ft) => sum + ft.feeAmount, 0),
      sell: feeTransactions.filter(ft => ft.transactionType === 'sell' && ft.status === 'collected').reduce((sum, ft) => sum + ft.feeAmount, 0),
      withdrawal: feeTransactions.filter(ft => ft.transactionType === 'withdrawal' && ft.status === 'collected').reduce((sum, ft) => sum + ft.feeAmount, 0),
      deposit: feeTransactions.filter(ft => ft.transactionType === 'deposit' && ft.status === 'collected').reduce((sum, ft) => sum + ft.feeAmount, 0),
    },
  };
};

export const getFeeConfigurations = (): FeeConfiguration[] => feeConfigurations;

export const getFeeTransactions = (): FeeTransaction[] => {
  return [...feeTransactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const updateFeeConfiguration = (id: string, updates: Partial<FeeConfiguration>): FeeConfiguration | undefined => {
  const index = feeConfigurations.findIndex(f => f.id === id);
  if (index === -1) return undefined;
  feeConfigurations[index] = { ...feeConfigurations[index], ...updates, updatedAt: new Date().toISOString() };
  return feeConfigurations[index];
};
