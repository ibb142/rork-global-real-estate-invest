export interface TeamMember {
  id: string;
  name: string;
  role: string;
  title: string;
  phone?: string;
  email?: string;
  status: 'active' | 'away';
  avatarInitials: string;
  avatarColor: string;
}

export const leadershipTeam: TeamMember[] = [
  {
    id: 'ceo',
    name: 'Ivan Perez',
    role: 'CEO',
    title: 'Chief Executive Officer',
    phone: '+1 (561) 644-3503',
    email: 'ceo@ivxholding.com',
    status: 'active',
    avatarInitials: 'IP',
    avatarColor: '#FFD700',
  },
];

export const adminTeamMembers: TeamMember[] = [
  {
    id: 'mgr-kimberly',
    name: 'Kimberly Perez',
    role: 'Advertising Manager',
    title: 'Head of Advertising & Outreach',
    email: 'kimberly@ivxholding.com',
    status: 'active',
    avatarInitials: 'KP',
    avatarColor: '#FF6B9D',
  },
  {
    id: 'mgr-sharon',
    name: 'Sharon',
    role: 'Advertising Partner',
    title: 'Advertising & Partnerships',
    email: 'sharon@ivxholding.com',
    status: 'active',
    avatarInitials: 'SH',
    avatarColor: '#4ECDC4',
  },
];
