import type {
  IPXTransaction,
  IPXProfitStats,
  PropertySubmission,
  FractionalShare,
  SharePurchase,
  LandPartnerDeal,
} from '@/types';

export {
  IPX_HOLDING_NAME,
  IPX_FEE_CONFIGS as ipxFeeConfigs,
  calculateIPXFee,
  calculateDemandPrice,
} from '@/constants/platform-config';

export const propertySubmissions: PropertySubmission[] = [];
export const fractionalShares: FractionalShare[] = [];
export const ipxTransactions: IPXTransaction[] = [];

export const ipxProfitStats: IPXProfitStats = {
  totalProfit: 0,
  profitThisMonth: 0,
  profitLastMonth: 0,
  growthPercent: 0,
  totalTransactions: 0,
  profitByType: { transaction: 0, listing: 0, management: 0, performance: 0, verification: 0 },
};

export const recentPurchases: SharePurchase[] = [];
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
  totalDeals: 0, activeDeals: 0, pendingDeals: 0, completedDeals: 0,
  totalLandValue: 0, totalCashPaid: 0, totalCollateral: 0, jvDeals: 0, lpDeals: 0,
};
