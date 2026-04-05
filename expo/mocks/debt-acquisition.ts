import type { DebtAcquisitionProperty, DebtTokenPurchase, FirstLienInvestment, DebtAcquisitionStats } from '@/types';

export { IPX_MORTGAGE_STRATEGY } from '@/constants/platform-config';

export const debtAcquisitionProperties: DebtAcquisitionProperty[] = [];
export const mockDebtTokenPurchases: DebtTokenPurchase[] = [];
export const mockFirstLienInvestments: FirstLienInvestment[] = [];

export const debtAcquisitionStats: DebtAcquisitionStats = {
  totalPropertiesListed: 0, totalDebtAcquired: 0, totalTokenized: 0,
  firstLiensSecured: 0, totalInvestorReturns: 0, averageYield: 0, averageLTV: 0,
};

export const getDebtPropertyById = (id: string): DebtAcquisitionProperty | undefined => {
  return debtAcquisitionProperties.find(p => p.id === id);
};

export const getAvailableDebtProperties = (): DebtAcquisitionProperty[] => {
  return debtAcquisitionProperties.filter(p => p.status === 'available' || p.status === 'tokenizing');
};

export const getFirstLienSecuredProperties = (): DebtAcquisitionProperty[] => {
  return debtAcquisitionProperties.filter(p => p.ipxFirstLienSecured);
};

export const calculateTokenization = (property: DebtAcquisitionProperty, tokens: number) => {
  const { IPX_MORTGAGE_STRATEGY } = require('@/constants/platform-config');
  const subtotal = tokens * property.pricePerToken;
  const ipxFee = subtotal * IPX_MORTGAGE_STRATEGY.transactionFee;
  const netInvestment = subtotal - ipxFee;
  const ownershipPercent = (tokens / property.totalTokens) * 100;
  const projectedAnnualReturn = netInvestment * (property.projectedYield / 100);
  return {
    tokens, pricePerToken: property.pricePerToken, subtotal, ipxFee, netInvestment,
    ownershipPercent, projectedAnnualReturn, projectedMonthlyReturn: projectedAnnualReturn / 12,
    lienPosition: property.ipxLienPosition,
  };
};
