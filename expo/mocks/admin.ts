import type {
  Member, AdminStats, AdminTransaction, MemberActivity, EngagementMessage,
  MemberEngagementStats, BroadcastMessage, BroadcastStats,
  BroadcastRecipient, AdminRole, TeamMember, AdminPermission,
  FeeConfiguration, FeeTransaction, FeeStats,
} from '@/types';

export {
  ADMIN_ROLES as adminRoles,
  BROADCAST_TEMPLATES as broadcastTemplates,
  FEE_CONFIGURATIONS as feeConfigurations,
  PLATFORM_FEE_STRUCTURE as platformFeeStructure,
} from '@/constants/platform-config';

export const members: Member[] = [];
export const adminTransactions: AdminTransaction[] = [];

export const adminStats: AdminStats = {
  totalMembers: 0, activeMembers: 0, pendingKyc: 0,
  totalTransactions: 0, totalVolume: 0, totalProperties: 0, liveProperties: 0, totalInvested: 0,
};

export const getAdminStats = (): AdminStats => adminStats;
export const getMemberById = (id: string): Member | undefined => members.find(m => m.id === id);
export const getPendingKycMembers = (): Member[] => members.filter(m => m.kycStatus === 'pending' || m.kycStatus === 'in_review');
export const getActiveMembers = (): Member[] => members.filter(m => m.status === 'active');
export const getRecentTransactions = (limit: number = 10): AdminTransaction[] => [...adminTransactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);

export const memberActivities: MemberActivity[] = [];
export const engagementMessages: EngagementMessage[] = [];

export const getInactiveMembers = (_days: number = 2): MemberEngagementStats[] => [];
export const getRecentActivities = (_limit: number = 10): MemberActivity[] => [];
export const getEngagementStats = () => ({
  totalMembers: 0, activeMembers: 0, atRiskMembers: 0,
  inactiveMembers: 0, churnedMembers: 0, messagesSent: 0, messagesOpened: 0,
});

export const broadcastHistory: BroadcastMessage[] = [];
export const getBroadcastRecipients = (_filter: string): BroadcastRecipient[] => [];
export const getBroadcastStats = (): BroadcastStats => ({
  totalSent: 0, totalDelivered: 0, totalFailed: 0, totalOpened: 0, deliveryRate: 0, openRate: 0,
});

import { ADMIN_ROLES } from '@/constants/platform-config';

export const teamMembers: TeamMember[] = [{
  id: 'admin-1', email: 'ceo@ipxholding.com', firstName: 'IVXHOLDINGS', lastName: 'CEO',
  avatar: '', phone: '+1 (561) 644-3503', roleId: 'role-ceo',
  role: ADMIN_ROLES[0] as AdminRole, status: 'active',
  lastLogin: new Date().toISOString(), createdAt: '2024-01-01T00:00:00Z',
}];

export const getTeamMembers = (): TeamMember[] => teamMembers;
export const getTeamMemberById = (id: string): TeamMember | undefined => teamMembers.find(m => m.id === id);
export const getAdminRoles = (): AdminRole[] => ADMIN_ROLES as AdminRole[];
export const getRoleById = (id: string): AdminRole | undefined => (ADMIN_ROLES as AdminRole[]).find(r => r.id === id);
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

export const feeTransactions: FeeTransaction[] = [];
export const getFeeStats = (): FeeStats => ({
  totalFeesCollected: 0, feesThisMonth: 0, feesLastMonth: 0, feeGrowthPercent: 0,
  totalTransactionsWithFees: 0, averageFeeAmount: 0,
  feesByType: { buy: 0, sell: 0, withdrawal: 0, deposit: 0 },
});
export const getFeeConfigurations = (): FeeConfiguration[] => [];
export const getFeeTransactions = (): FeeTransaction[] => [];
export const updateFeeConfiguration = (_id: string, _updates: Partial<FeeConfiguration>): FeeConfiguration | undefined => undefined;
