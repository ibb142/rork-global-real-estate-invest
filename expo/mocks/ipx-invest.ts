import { 
  IPXFeeConfig, 
  IPXTransaction, 
  IPXProfitStats, 
  PropertySubmission, 
  FractionalShare,
  SharePurchase,
  LandPartnerDeal 
} from '@/types';

export const IPX_HOLDING_NAME = 'IVX HOLDINGS LLC';

export const ipxFeeConfigs: IPXFeeConfig[] = [
  {
    id: 'fee-1',
    name: 'Transaction Fee',
    description: 'Applied to all buy/sell transactions',
    feeType: 'transaction',
    percentage: 2.5,
    minFee: 10,
    maxFee: 50000,
    isActive: true,
    appliesTo: ['buy', 'sell'],
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'fee-2',
    name: 'Property Listing Fee',
    description: 'One-time fee when property is listed for fractional ownership',
    feeType: 'listing',
    percentage: 3.0,
    minFee: 5000,
    maxFee: 100000,
    isActive: true,
    appliesTo: ['listing'],
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'fee-3',
    name: 'Management Fee',
    description: 'Annual management fee on total property value',
    feeType: 'management',
    percentage: 1.5,
    minFee: 1000,
    maxFee: 250000,
    isActive: true,
    appliesTo: ['dividend'],
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'fee-4',
    name: 'Performance Fee',
    description: 'Fee on profits above 8% annual return',
    feeType: 'performance',
    percentage: 20.0,
    minFee: 0,
    maxFee: 500000,
    isActive: true,
    appliesTo: ['dividend'],
    updatedAt: '2025-01-15T00:00:00Z',
  },
  {
    id: 'fee-5',
    name: 'Verification Fee',
    description: 'Fee for deed verification, lien search, and debt review',
    feeType: 'verification',
    percentage: 0.5,
    minFee: 2500,
    maxFee: 25000,
    isActive: true,
    appliesTo: ['verification'],
    updatedAt: '2025-01-15T00:00:00Z',
  },
];

export const propertySubmissions: PropertySubmission[] = [];

export const fractionalShares: FractionalShare[] = [];

export const ipxTransactions: IPXTransaction[] = [];

export const ipxProfitStats: IPXProfitStats = {
  totalProfit: 0,
  profitThisMonth: 0,
  profitLastMonth: 0,
  growthPercent: 0,
  totalTransactions: 0,
  profitByType: {
    transaction: 0,
    listing: 0,
    management: 0,
    performance: 0,
    verification: 0,
  },
};

export const recentPurchases: SharePurchase[] = [];

export const calculateIPXFee = (amount: number, feeType: IPXFeeConfig['feeType']): number => {
  const config = ipxFeeConfigs.find(f => f.feeType === feeType && f.isActive);
  if (!config) return 0;
  
  const fee = amount * (config.percentage / 100);
  return Math.max(config.minFee, Math.min(config.maxFee, fee));
};

export const calculateDemandPrice = (basePrice: number, totalShares: number, soldShares: number): number => {
  const soldPercentage = soldShares / totalShares;
  const demandMultiplier = 1 + (soldPercentage * 0.5);
  return basePrice * demandMultiplier;
};

export const landPartnerDeals: LandPartnerDeal[] = [];

export interface LandPartnerStats {
  totalDeals: number;
  activeDeals: number;
  pendingDeals: number;
  completedDeals: number;
  totalLandValue: number;
  totalCashPaid: number;
  totalCollateral: number;
  jvDeals: number;
  lpDeals: number;
}

export const landPartnerStats: LandPartnerStats = {
  totalDeals: 0,
  activeDeals: 0,
  pendingDeals: 0,
  completedDeals: 0,
  totalLandValue: 0,
  totalCashPaid: 0,
  totalCollateral: 0,
  jvDeals: 0,
  lpDeals: 0,
};
