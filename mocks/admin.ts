import { Member, AdminStats, AdminTransaction, MemberActivity, EngagementMessage, MemberEngagementStats, BroadcastMessage, BroadcastTemplate, BroadcastStats, BroadcastRecipient, AdminRole, TeamMember, AdminPermission, FeeConfiguration, FeeTransaction, FeeStats } from '@/types';

export const members: Member[] = [
  {
    id: 'user-1',
    email: 'alexander@example.com',
    firstName: 'Alexander',
    lastName: 'Sterling',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    phone: '+1 (555) 123-4567',
    country: 'United States',
    kycStatus: 'approved',
    eligibilityStatus: 'eligible',
    walletBalance: 25430.50,
    totalInvested: 48750.00,
    totalReturns: 6234.80,
    createdAt: '2024-01-01T00:00:00Z',
    holdings: 4,
    totalTransactions: 12,
    lastActivity: '2025-01-24T14:30:00Z',
    status: 'active',
  },
  {
    id: 'user-2',
    email: 'maria.johnson@example.com',
    firstName: 'Maria',
    lastName: 'Johnson',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    phone: '+1 (555) 234-5678',
    country: 'United States',
    kycStatus: 'approved',
    eligibilityStatus: 'eligible',
    walletBalance: 15200.00,
    totalInvested: 32500.00,
    totalReturns: 4120.50,
    createdAt: '2024-02-15T00:00:00Z',
    holdings: 3,
    totalTransactions: 8,
    lastActivity: '2025-01-23T10:15:00Z',
    status: 'active',
  },
  {
    id: 'user-3',
    email: 'james.chen@example.com',
    firstName: 'James',
    lastName: 'Chen',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
    phone: '+65 9123 4567',
    country: 'Singapore',
    kycStatus: 'in_review',
    eligibilityStatus: 'pending',
    walletBalance: 50000.00,
    totalInvested: 0,
    totalReturns: 0,
    createdAt: '2025-01-20T00:00:00Z',
    holdings: 0,
    totalTransactions: 1,
    lastActivity: '2025-01-20T09:00:00Z',
    status: 'active',
  },
  {
    id: 'user-4',
    email: 'sarah.williams@example.com',
    firstName: 'Sarah',
    lastName: 'Williams',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
    phone: '+44 20 7946 0958',
    country: 'United Kingdom',
    kycStatus: 'approved',
    eligibilityStatus: 'eligible',
    walletBalance: 8750.25,
    totalInvested: 67800.00,
    totalReturns: 8945.30,
    createdAt: '2023-11-10T00:00:00Z',
    holdings: 5,
    totalTransactions: 22,
    lastActivity: '2025-01-24T16:45:00Z',
    status: 'active',
  },
  {
    id: 'user-5',
    email: 'michael.brown@example.com',
    firstName: 'Michael',
    lastName: 'Brown',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    phone: '+1 (555) 345-6789',
    country: 'Canada',
    kycStatus: 'pending',
    eligibilityStatus: 'pending',
    walletBalance: 0,
    totalInvested: 0,
    totalReturns: 0,
    createdAt: '2025-01-22T00:00:00Z',
    holdings: 0,
    totalTransactions: 0,
    lastActivity: '2025-01-22T11:30:00Z',
    status: 'inactive',
  },
  {
    id: 'user-6',
    email: 'emma.davis@example.com',
    firstName: 'Emma',
    lastName: 'Davis',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    phone: '+61 2 9876 5432',
    country: 'Australia',
    kycStatus: 'rejected',
    eligibilityStatus: 'restricted',
    walletBalance: 5000.00,
    totalInvested: 0,
    totalReturns: 0,
    createdAt: '2025-01-15T00:00:00Z',
    holdings: 0,
    totalTransactions: 1,
    lastActivity: '2025-01-18T08:20:00Z',
    status: 'suspended',
  },
  {
    id: 'user-7',
    email: 'david.lee@example.com',
    firstName: 'David',
    lastName: 'Lee',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200',
    phone: '+852 9876 5432',
    country: 'Hong Kong',
    kycStatus: 'approved',
    eligibilityStatus: 'eligible',
    walletBalance: 125000.00,
    totalInvested: 250000.00,
    totalReturns: 32500.00,
    createdAt: '2023-06-20T00:00:00Z',
    holdings: 8,
    totalTransactions: 45,
    lastActivity: '2025-01-24T18:00:00Z',
    status: 'active',
  },
  {
    id: 'user-8',
    email: 'sophie.martin@example.com',
    firstName: 'Sophie',
    lastName: 'Martin',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    phone: '+33 1 23 45 67 89',
    country: 'France',
    kycStatus: 'approved',
    eligibilityStatus: 'eligible',
    walletBalance: 42300.75,
    totalInvested: 89500.00,
    totalReturns: 11234.60,
    createdAt: '2023-09-05T00:00:00Z',
    holdings: 6,
    totalTransactions: 28,
    lastActivity: '2025-01-23T14:20:00Z',
    status: 'active',
  },
];

export const adminTransactions: AdminTransaction[] = [
  {
    id: 'atx-1',
    type: 'deposit',
    amount: 10000.00,
    status: 'completed',
    description: 'Bank Transfer Deposit',
    createdAt: '2025-01-24T10:30:00Z',
    userId: 'user-1',
    userName: 'Alexander Sterling',
    userEmail: 'alexander@example.com',
  },
  {
    id: 'atx-2',
    type: 'buy',
    amount: -5240.00,
    status: 'completed',
    description: 'Bought 100 shares',
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    createdAt: '2025-01-24T14:22:00Z',
    userId: 'user-1',
    userName: 'Alexander Sterling',
    userEmail: 'alexander@example.com',
  },
  {
    id: 'atx-3',
    type: 'deposit',
    amount: 50000.00,
    status: 'completed',
    description: 'Wire Transfer Deposit',
    createdAt: '2025-01-23T09:00:00Z',
    userId: 'user-7',
    userName: 'David Lee',
    userEmail: 'david.lee@example.com',
  },
  {
    id: 'atx-4',
    type: 'buy',
    amount: -12500.00,
    status: 'completed',
    description: 'Bought 100 shares',
    propertyId: '2',
    propertyName: 'Manhattan Office Tower',
    createdAt: '2025-01-23T11:45:00Z',
    userId: 'user-7',
    userName: 'David Lee',
    userEmail: 'david.lee@example.com',
  },
  {
    id: 'atx-5',
    type: 'withdrawal',
    amount: -2500.00,
    status: 'pending',
    description: 'Bank Transfer Withdrawal',
    createdAt: '2025-01-22T16:30:00Z',
    userId: 'user-4',
    userName: 'Sarah Williams',
    userEmail: 'sarah.williams@example.com',
  },
  {
    id: 'atx-6',
    type: 'dividend',
    amount: 425.50,
    status: 'completed',
    description: 'Q4 2024 Distribution',
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    createdAt: '2025-01-01T00:00:00Z',
    userId: 'user-4',
    userName: 'Sarah Williams',
    userEmail: 'sarah.williams@example.com',
  },
  {
    id: 'atx-7',
    type: 'deposit',
    amount: 15000.00,
    status: 'completed',
    description: 'Credit Card Deposit',
    createdAt: '2025-01-21T13:15:00Z',
    userId: 'user-2',
    userName: 'Maria Johnson',
    userEmail: 'maria.johnson@example.com',
  },
  {
    id: 'atx-8',
    type: 'buy',
    amount: -7850.00,
    status: 'completed',
    description: 'Bought 100 shares',
    propertyId: '3',
    propertyName: 'London Luxury Flats',
    createdAt: '2025-01-21T15:30:00Z',
    userId: 'user-2',
    userName: 'Maria Johnson',
    userEmail: 'maria.johnson@example.com',
  },
  {
    id: 'atx-9',
    type: 'sell',
    amount: 3400.00,
    status: 'completed',
    description: 'Sold 50 shares',
    propertyId: '6',
    propertyName: 'Tokyo Mixed-Use Tower',
    createdAt: '2025-01-20T10:00:00Z',
    userId: 'user-8',
    userName: 'Sophie Martin',
    userEmail: 'sophie.martin@example.com',
  },
  {
    id: 'atx-10',
    type: 'deposit',
    amount: 5000.00,
    status: 'failed',
    description: 'Bank Transfer Deposit - Insufficient Funds',
    createdAt: '2025-01-18T08:20:00Z',
    userId: 'user-6',
    userName: 'Emma Davis',
    userEmail: 'emma.davis@example.com',
  },
];

export const adminStats: AdminStats = {
  totalMembers: 8,
  activeMembers: 6,
  pendingKyc: 2,
  totalTransactions: 116,
  totalVolume: 2450000,
  totalProperties: 6,
  liveProperties: 4,
  totalInvested: 488550,
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

export const memberActivities: MemberActivity[] = [
  {
    id: 'act-1',
    memberId: 'user-1',
    memberName: 'Alexander Sterling',
    type: 'investment',
    description: 'Invested $5,240 in Marina Bay Residences',
    createdAt: '2025-01-24T14:22:00Z',
  },
  {
    id: 'act-2',
    memberId: 'user-1',
    memberName: 'Alexander Sterling',
    type: 'login',
    description: 'Logged in from Miami, FL',
    createdAt: '2025-01-24T14:00:00Z',
  },
  {
    id: 'act-3',
    memberId: 'user-7',
    memberName: 'David Lee',
    type: 'investment',
    description: 'Invested $12,500 in Manhattan Office Tower',
    createdAt: '2025-01-23T11:45:00Z',
  },
  {
    id: 'act-4',
    memberId: 'user-4',
    memberName: 'Sarah Williams',
    type: 'withdrawal',
    description: 'Requested withdrawal of $2,500',
    createdAt: '2025-01-22T16:30:00Z',
  },
  {
    id: 'act-5',
    memberId: 'user-2',
    memberName: 'Maria Johnson',
    type: 'view_property',
    description: 'Viewed London Luxury Flats property details',
    createdAt: '2025-01-21T15:00:00Z',
  },
  {
    id: 'act-6',
    memberId: 'user-3',
    memberName: 'James Chen',
    type: 'kyc_update',
    description: 'Submitted KYC documents for review',
    createdAt: '2025-01-20T09:00:00Z',
  },
  {
    id: 'act-7',
    memberId: 'user-5',
    memberName: 'Michael Brown',
    type: 'profile_update',
    description: 'Updated profile information',
    createdAt: '2025-01-22T11:30:00Z',
  },
  {
    id: 'act-8',
    memberId: 'user-8',
    memberName: 'Sophie Martin',
    type: 'investment',
    description: 'Sold 50 shares of Tokyo Mixed-Use Tower',
    createdAt: '2025-01-20T10:00:00Z',
  },
];

export const engagementMessages: EngagementMessage[] = [
  {
    id: 'msg-1',
    memberId: 'user-5',
    memberName: 'Michael Brown',
    memberEmail: 'michael.brown@example.com',
    subject: 'Complete Your Investment Journey',
    message: 'Hi Michael, we noticed you created an account but haven\'t made your first investment yet. Our team is here to help you get started with fractional real estate investing.',
    type: 'reengagement',
    status: 'sent',
    aiGenerated: true,
    sentAt: '2025-01-23T10:00:00Z',
    createdAt: '2025-01-23T09:55:00Z',
  },
  {
    id: 'msg-2',
    memberId: 'user-6',
    memberName: 'Emma Davis',
    memberEmail: 'emma.davis@example.com',
    subject: 'We Miss You - Exclusive Opportunity Inside',
    message: 'Hi Emma, it\'s been a while since we\'ve seen you on IVX HOLDINGS. We have some exciting new properties that match your investment profile.',
    type: 'reengagement',
    status: 'delivered',
    aiGenerated: true,
    sentAt: '2025-01-20T14:00:00Z',
    createdAt: '2025-01-20T13:50:00Z',
  },
];

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
    body: 'Dear {{name}},\n\nGreat news! Your dividend distribution has been processed.\n\nDistribution Details:\n• Amount: ${{amount}}\n• Property: {{property_name}}\n• Period: {{period}}\n\nThe funds have been credited to your IPX wallet. You can reinvest or withdraw at any time.\n\nView your portfolio →\n\nThank you for investing with IVX HOLDINGS!',
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

export const broadcastHistory: BroadcastMessage[] = [
  {
    id: 'bc-1',
    subject: 'January Newsletter: Market Updates & New Properties',
    body: 'Dear Investors, Here\'s your January update with exciting new opportunities...',
    channels: ['email', 'push'],
    recipientFilter: 'all',
    recipientCount: 8,
    batchSize: 100,
    status: 'completed',
    progress: 100,
    sentCount: 8,
    failedCount: 0,
    startedAt: '2025-01-20T10:00:00Z',
    completedAt: '2025-01-20T10:02:00Z',
    createdAt: '2025-01-20T09:45:00Z',
  },
  {
    id: 'bc-2',
    subject: 'New Property Alert: Marina Bay Residences',
    body: 'Exciting new investment opportunity in Singapore...',
    channels: ['email', 'sms', 'push'],
    recipientFilter: 'active',
    recipientCount: 6,
    batchSize: 50,
    status: 'completed',
    progress: 100,
    sentCount: 6,
    failedCount: 0,
    startedAt: '2025-01-18T14:00:00Z',
    completedAt: '2025-01-18T14:01:00Z',
    createdAt: '2025-01-18T13:30:00Z',
  },
  {
    id: 'bc-3',
    subject: 'Complete Your KYC Verification',
    body: 'Hi, your KYC verification is pending...',
    channels: ['email'],
    recipientFilter: 'kyc_pending',
    recipientCount: 2,
    batchSize: 10,
    status: 'completed',
    progress: 100,
    sentCount: 2,
    failedCount: 0,
    startedAt: '2025-01-15T09:00:00Z',
    completedAt: '2025-01-15T09:00:30Z',
    createdAt: '2025-01-15T08:45:00Z',
  },
];

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
    firstName: 'IPX',
    lastName: 'CEO',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
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
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200',
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
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
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
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
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

export const feeTransactions: FeeTransaction[] = [
  {
    id: 'ftx-1',
    transactionId: 'atx-2',
    transactionType: 'buy',
    userId: 'user-1',
    userName: 'Alexander Sterling',
    userEmail: 'alexander@example.com',
    transactionAmount: 5240.00,
    feePercentage: 1.5,
    feeAmount: 78.60,
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    status: 'collected',
    createdAt: '2025-01-24T14:22:00Z',
  },
  {
    id: 'ftx-2',
    transactionId: 'atx-4',
    transactionType: 'buy',
    userId: 'user-7',
    userName: 'David Lee',
    userEmail: 'david.lee@example.com',
    transactionAmount: 12500.00,
    feePercentage: 1.5,
    feeAmount: 187.50,
    propertyId: '2',
    propertyName: 'Manhattan Office Tower',
    status: 'collected',
    createdAt: '2025-01-23T11:45:00Z',
  },
  {
    id: 'ftx-3',
    transactionId: 'atx-5',
    transactionType: 'withdrawal',
    userId: 'user-4',
    userName: 'Sarah Williams',
    userEmail: 'sarah.williams@example.com',
    transactionAmount: 2500.00,
    feePercentage: 0.5,
    feeAmount: 12.50,
    status: 'pending',
    createdAt: '2025-01-22T16:30:00Z',
  },
  {
    id: 'ftx-4',
    transactionId: 'atx-8',
    transactionType: 'buy',
    userId: 'user-2',
    userName: 'Maria Johnson',
    userEmail: 'maria.johnson@example.com',
    transactionAmount: 7850.00,
    feePercentage: 1.5,
    feeAmount: 117.75,
    propertyId: '3',
    propertyName: 'London Luxury Flats',
    status: 'collected',
    createdAt: '2025-01-21T15:30:00Z',
  },
  {
    id: 'ftx-5',
    transactionId: 'atx-9',
    transactionType: 'sell',
    userId: 'user-8',
    userName: 'Sophie Martin',
    userEmail: 'sophie.martin@example.com',
    transactionAmount: 3400.00,
    feePercentage: 1.5,
    feeAmount: 51.00,
    propertyId: '6',
    propertyName: 'Tokyo Mixed-Use Tower',
    status: 'collected',
    createdAt: '2025-01-20T10:00:00Z',
  },
];

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
    averageFeeAmount: totalCollected / feeTransactions.filter(ft => ft.status === 'collected').length,
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
