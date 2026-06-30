import { User, Holding, Transaction, Notification, Order } from '@/types';
import { properties } from './properties';

export const currentUser: User = {
  id: '',
  email: '',
  firstName: '',
  lastName: '',
  avatar: '',
  phone: '',
  country: '',
  kycStatus: 'pending',
  eligibilityStatus: 'pending',
  walletBalance: 0,
  totalInvested: 0,
  totalReturns: 0,
  createdAt: new Date().toISOString(),
};

export const holdings: Holding[] = [];

export const transactions: Transaction[] = [];

export const orders: Order[] = [];

export const notifications: Notification[] = [];

export const getTotalPortfolioValue = (): number => {
  return holdings.reduce((sum, h) => sum + h.currentValue, 0);
};

export const getTotalUnrealizedPnL = (): number => {
  return holdings.reduce((sum, h) => sum + h.unrealizedPnL, 0);
};

export const getTotalUnrealizedPnLPercent = (): number => {
  const totalCost = holdings.reduce((sum, h) => sum + (h.shares * h.avgCostBasis), 0);
  const totalValue = getTotalPortfolioValue();
  if (totalCost === 0) return 0;
  return ((totalValue - totalCost) / totalCost) * 100;
};

export const executeTrade = (
  propertyId: string,
  type: 'buy' | 'sell',
  shares: number,
  price: number,
  fee: number
): { success: boolean; message: string } => {
  const total = type === 'buy' ? shares * price + fee : shares * price - fee;
  
  if (type === 'buy') {
    if (total > currentUser.walletBalance) {
      return { success: false, message: 'Insufficient funds' };
    }
    currentUser.walletBalance -= total;
    currentUser.totalInvested += shares * price;
    
    const existingHolding = holdings.find(h => h.propertyId === propertyId);
    if (existingHolding) {
      const totalShares = existingHolding.shares + shares;
      const totalCost = existingHolding.shares * existingHolding.avgCostBasis + shares * price;
      existingHolding.shares = totalShares;
      existingHolding.avgCostBasis = totalCost / totalShares;
      existingHolding.currentValue = totalShares * price;
    }
    
    transactions.unshift({
      id: `tx-${Date.now()}`,
      type: 'buy',
      amount: -total,
      status: 'completed',
      description: `Bought ${shares} shares`,
      propertyId,
      propertyName: properties.find(p => p.id === propertyId)?.name,
      createdAt: new Date().toISOString(),
    });
    
    return { success: true, message: `Successfully bought ${shares} shares` };
  } else {
    const holding = holdings.find(h => h.propertyId === propertyId);
    if (!holding || holding.shares < shares) {
      return { success: false, message: 'Insufficient shares' };
    }
    
    const netAmount = shares * price - fee;
    currentUser.walletBalance += netAmount;
    holding.shares -= shares;
    holding.currentValue = holding.shares * price;
    
    if (holding.shares === 0) {
      const index = holdings.indexOf(holding);
      holdings.splice(index, 1);
    }
    
    transactions.unshift({
      id: `tx-${Date.now()}`,
      type: 'sell',
      amount: netAmount,
      status: 'completed',
      description: `Sold ${shares} shares`,
      propertyId,
      propertyName: properties.find(p => p.id === propertyId)?.name,
      createdAt: new Date().toISOString(),
    });
    
    return { success: true, message: `Successfully sold ${shares} shares` };
  }
};

export const getHoldingByPropertyId = (propertyId: string): Holding | undefined => {
  return holdings.find(h => h.propertyId === propertyId);
};
