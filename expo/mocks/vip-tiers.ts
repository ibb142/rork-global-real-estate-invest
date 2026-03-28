export type VIPTierLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface VIPTier {
  id: string;
  level: VIPTierLevel;
  name: string;
  minInvestment: number;
  maxInvestment: number | null;
  tradingFeeDiscount: number;
  earnApyBoost: number;
  earlyAccessDays: number;
  prioritySupport: boolean;
  exclusiveDeals: boolean;
  referralBonus: number;
  color: string;
  accentColor: string;
  icon: string;
  perks: string[];
}

export interface VIPProgress {
  currentTier: VIPTierLevel;
  totalInvested: number;
  nextTierThreshold: number;
  progressPercent: number;
  memberSince: string;
  pointsEarned: number;
}

export const VIP_TIERS: VIPTier[] = [
  {
    id: 'tier-bronze',
    level: 'bronze',
    name: 'Bronze',
    minInvestment: 0,
    maxInvestment: 10000,
    tradingFeeDiscount: 0,
    earnApyBoost: 0,
    earlyAccessDays: 0,
    prioritySupport: false,
    exclusiveDeals: false,
    referralBonus: 25,
    color: '#CD7F32',
    accentColor: '#E8A960',
    icon: 'shield',
    perks: [
      'Standard trading fees',
      'Base APY on IVXHOLDINGS Earn',
      '$25 referral bonus',
      'Community access',
    ],
  },
  {
    id: 'tier-silver',
    level: 'silver',
    name: 'Silver',
    minInvestment: 10000,
    maxInvestment: 50000,
    tradingFeeDiscount: 10,
    earnApyBoost: 0.5,
    earlyAccessDays: 1,
    prioritySupport: false,
    exclusiveDeals: false,
    referralBonus: 50,
    color: '#C0C0C0',
    accentColor: '#D8D8D8',
    icon: 'award',
    perks: [
      '10% lower trading fees',
      '+0.5% APY boost on Earn',
      '1-day early access to drops',
      '$50 referral bonus',
      'Monthly market insights',
    ],
  },
  {
    id: 'tier-gold',
    level: 'gold',
    name: 'Gold',
    minInvestment: 50000,
    maxInvestment: 250000,
    tradingFeeDiscount: 25,
    earnApyBoost: 1.0,
    earlyAccessDays: 3,
    prioritySupport: true,
    exclusiveDeals: true,
    referralBonus: 100,
    color: '#FFD700',
    accentColor: '#FFE44D',
    icon: 'crown',
    perks: [
      '25% lower trading fees',
      '+1.0% APY boost on Earn',
      '3-day early access to drops',
      '$100 referral bonus',
      'Priority customer support',
      'Exclusive property deals',
      'Quarterly portfolio review',
    ],
  },
  {
    id: 'tier-platinum',
    level: 'platinum',
    name: 'Platinum',
    minInvestment: 250000,
    maxInvestment: null,
    tradingFeeDiscount: 50,
    earnApyBoost: 2.0,
    earlyAccessDays: 7,
    prioritySupport: true,
    exclusiveDeals: true,
    referralBonus: 250,
    color: '#E5E4E2',
    accentColor: '#F5F5F3',
    icon: 'gem',
    perks: [
      '50% lower trading fees',
      '+2.0% APY boost on Earn',
      '7-day early access to drops',
      '$250 referral bonus',
      'Dedicated account manager',
      'First pick on exclusive deals',
      'Monthly 1-on-1 strategy call',
      'VIP events & networking',
    ],
  },
];

export const getUserVIPProgress = (totalInvested: number): VIPProgress => {
  let currentTier: VIPTierLevel = 'bronze';
  let nextTierThreshold = 10000;
  let progressPercent = 0;

  if (totalInvested >= 250000) {
    currentTier = 'platinum';
    nextTierThreshold = 250000;
    progressPercent = 100;
  } else if (totalInvested >= 50000) {
    currentTier = 'gold';
    nextTierThreshold = 250000;
    progressPercent = ((totalInvested - 50000) / (250000 - 50000)) * 100;
  } else if (totalInvested >= 10000) {
    currentTier = 'silver';
    nextTierThreshold = 50000;
    progressPercent = ((totalInvested - 10000) / (50000 - 10000)) * 100;
  } else {
    currentTier = 'bronze';
    nextTierThreshold = 10000;
    progressPercent = (totalInvested / 10000) * 100;
  }

  return {
    currentTier,
    totalInvested,
    nextTierThreshold,
    progressPercent: Math.min(progressPercent, 100),
    memberSince: '2024-01-15',
    pointsEarned: Math.floor(totalInvested * 0.1),
  };
};

export const getTierByLevel = (level: VIPTierLevel): VIPTier => {
  return VIP_TIERS.find(t => t.level === level) || VIP_TIERS[0];
};
