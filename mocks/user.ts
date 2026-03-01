import { User, Holding, Transaction, Notification, Order } from '@/types';
import { properties } from './properties';

export const currentUser: User = {
  id: 'user-1',
  email: 'investor@example.com',
  firstName: 'Alexander',
  lastName: 'Sterling',
  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
  phone: '+1 (561) 644-3503',
  country: 'United States',
  kycStatus: 'approved',
  eligibilityStatus: 'eligible',
  walletBalance: 25430.50,
  totalInvested: 48750.00,
  totalReturns: 6234.80,
  createdAt: '2024-01-01T00:00:00Z',
};

export const holdings: Holding[] = [
  {
    id: 'holding-1',
    propertyId: '1',
    property: properties[0],
    shares: 250,
    avgCostBasis: 48.50,
    currentValue: 13100.00,
    totalReturn: 975.00,
    totalReturnPercent: 8.04,
    unrealizedPnL: 975.00,
    unrealizedPnLPercent: 8.04,
    purchaseDate: '2024-03-15T00:00:00Z',
  },
  {
    id: 'holding-2',
    propertyId: '2',
    property: properties[1],
    shares: 120,
    avgCostBasis: 118.00,
    currentValue: 15000.00,
    totalReturn: 840.00,
    totalReturnPercent: 5.93,
    unrealizedPnL: 840.00,
    unrealizedPnLPercent: 5.93,
    purchaseDate: '2024-04-20T00:00:00Z',
  },
  {
    id: 'holding-3',
    propertyId: '3',
    property: properties[2],
    shares: 180,
    avgCostBasis: 72.00,
    currentValue: 14130.00,
    totalReturn: 1170.00,
    totalReturnPercent: 9.03,
    unrealizedPnL: 1170.00,
    unrealizedPnLPercent: 9.03,
    purchaseDate: '2023-08-10T00:00:00Z',
  },
  {
    id: 'holding-4',
    propertyId: '5',
    property: properties[4],
    shares: 35,
    avgCostBasis: 175.00,
    currentValue: 6475.00,
    totalReturn: 350.00,
    totalReturnPercent: 5.71,
    unrealizedPnL: 350.00,
    unrealizedPnLPercent: 5.71,
    purchaseDate: '2024-06-05T00:00:00Z',
  },
];

export const transactions: Transaction[] = [
  {
    id: 'tx-1',
    type: 'deposit',
    amount: 10000.00,
    status: 'completed',
    description: 'Bank Transfer Deposit',
    createdAt: '2024-12-15T10:30:00Z',
  },
  {
    id: 'tx-2',
    type: 'buy',
    amount: -5240.00,
    status: 'completed',
    description: 'Bought 100 shares',
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    createdAt: '2024-12-14T14:22:00Z',
  },
  {
    id: 'tx-3',
    type: 'dividend',
    amount: 156.75,
    status: 'completed',
    description: 'Q4 2024 Distribution',
    propertyId: '1',
    propertyName: 'Marina Bay Residences',
    createdAt: '2024-12-01T00:00:00Z',
  },
  {
    id: 'tx-4',
    type: 'buy',
    amount: -3750.00,
    status: 'completed',
    description: 'Bought 30 shares',
    propertyId: '2',
    propertyName: 'Manhattan Office Tower',
    createdAt: '2024-11-28T09:15:00Z',
  },
  {
    id: 'tx-5',
    type: 'dividend',
    amount: 102.00,
    status: 'completed',
    description: 'Q4 2024 Distribution',
    propertyId: '2',
    propertyName: 'Manhattan Office Tower',
    createdAt: '2024-12-01T00:00:00Z',
  },
  {
    id: 'tx-6',
    type: 'withdrawal',
    amount: -2000.00,
    status: 'completed',
    description: 'Bank Transfer Withdrawal',
    createdAt: '2024-11-20T16:45:00Z',
  },
  {
    id: 'tx-7',
    type: 'deposit',
    amount: 15000.00,
    status: 'completed',
    description: 'Wire Transfer Deposit',
    createdAt: '2024-11-15T11:00:00Z',
  },
];

export const orders: Order[] = [
  {
    id: 'order-1',
    propertyId: '1',
    property: properties[0],
    type: 'buy',
    orderType: 'limit',
    status: 'open',
    shares: 50,
    filledShares: 0,
    price: 51.00,
    total: 2550.00,
    fees: 5.10,
    createdAt: '2024-12-16T08:00:00Z',
  },
  {
    id: 'order-2',
    propertyId: '6',
    property: properties[5],
    type: 'buy',
    orderType: 'market',
    status: 'filled',
    shares: 75,
    filledShares: 75,
    price: 68.00,
    total: 5100.00,
    fees: 10.20,
    createdAt: '2024-12-15T14:30:00Z',
    filledAt: '2024-12-15T14:30:05Z',
  },
];

export const notifications: Notification[] = [
  {
    id: 'notif-1',
    type: 'dividend',
    title: 'Dividend Received',
    message: 'You received $156.75 from Marina Bay Residences Q4 distribution.',
    read: false,
    createdAt: '2024-12-01T00:00:00Z',
  },
  {
    id: 'notif-2',
    type: 'order',
    title: 'Order Filled',
    message: 'Your buy order for 75 shares of Tokyo Mixed-Use Tower has been filled.',
    read: true,
    createdAt: '2024-12-15T14:30:05Z',
  },
  {
    id: 'notif-3',
    type: 'system',
    title: 'New Property Available',
    message: 'Singapore Tech Hub is now open for investment. Check it out!',
    read: false,
    createdAt: '2024-12-10T09:00:00Z',
  },
  {
    id: 'notif-4',
    type: 'kyc',
    title: 'KYC Approved',
    message: 'Your identity verification has been approved. You can now invest!',
    read: true,
    createdAt: '2024-01-05T12:00:00Z',
  },
];

export const getTotalPortfolioValue = (): number => {
  return holdings.reduce((sum, h) => sum + h.currentValue, 0);
};

export const getTotalUnrealizedPnL = (): number => {
  return holdings.reduce((sum, h) => sum + h.unrealizedPnL, 0);
};

export const getTotalUnrealizedPnLPercent = (): number => {
  const totalCost = holdings.reduce((sum, h) => sum + (h.shares * h.avgCostBasis), 0);
  const totalValue = getTotalPortfolioValue();
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
