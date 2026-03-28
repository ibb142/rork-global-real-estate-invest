export interface TokenizedProperty {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  image: string;
  propertyType: 'residential' | 'commercial' | 'mixed';
  appraisedValue: number;
  ltvPercent: number;
  tokenizationValue: number;
  totalShares: number;
  availableShares: number;
  initialPricePerShare: number;
  currentPricePerShare: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  totalTrades: number;
  marketCap: number;
  ipxLienPosition: 'first';
  ipxFeePercent: number;
  closingCostPercent: number;
  projectedYield: number;
  status: 'trading' | 'ipo' | 'closed';
  listedAt: string;
  priceHistory: { time: string; price: number; volume: number }[];
  recentTrades: ShareTrade[];
}

export interface ShareTrade {
  id: string;
  propertyId: string;
  buyerName: string;
  type: 'buy' | 'sell';
  shares: number;
  pricePerShare: number;
  total: number;
  profit?: number;
  profitPercent?: number;
  timestamp: string;
}

export interface UserShareHolding {
  propertyId: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  totalInvested: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
}

export const tokenizedProperties: TokenizedProperty[] = [];

export const mockUserHoldings: UserShareHolding[] = [];

export const SHARE_TRADING_CONFIG = {
  initialPrice: 1.00,
  ltvPercent: 85,
  ipxFeePercent: 2.5,
  closingCostPercent: 3,
  tradingFeePercent: 1,
  minPurchase: 1,
  tradingHours: '24/7',
  resellDelay: 'Instant',
};

export interface IPXGlobalIndex {
  name: string;
  ticker: string;
  currentValue: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  totalMarketCap: number;
  totalVolume24h: number;
  totalProperties: number;
  totalInvestors: number;
  countriesActive: number;
  allTimeHigh: number;
  allTimeHighDate: string;
  history: { time: string; value: number }[];
}

export const ipxGlobalIndex: IPXGlobalIndex = {
  name: 'IVX HOLDINGS LLC Index',
  ticker: 'IVXHOLDINGS-GREI',
  currentValue: 0,
  change24h: 0,
  changePercent24h: 0,
  high24h: 0,
  low24h: 0,
  totalMarketCap: 0,
  totalVolume24h: 0,
  totalProperties: 0,
  totalInvestors: 0,
  countriesActive: 0,
  allTimeHigh: 0,
  allTimeHighDate: '',
  history: [],
};

export const getGlobalStats = () => {
  const tradingCount = tokenizedProperties.filter(p => p.status === 'trading').length;
  const ipoCount = tokenizedProperties.filter(p => p.status === 'ipo').length;
  const avgYield = tokenizedProperties.length > 0
    ? tokenizedProperties.reduce((sum, p) => sum + p.projectedYield, 0) / tokenizedProperties.length
    : 0;
  const topGainer = [...tokenizedProperties].sort((a, b) => b.changePercent24h - a.changePercent24h)[0];
  const topLoser = [...tokenizedProperties].sort((a, b) => a.changePercent24h - b.changePercent24h)[0];

  return {
    tradingCount,
    ipoCount,
    avgYield: Math.round(avgYield * 10) / 10,
    topGainer,
    topLoser,
    totalMarketCap: ipxGlobalIndex.totalMarketCap,
    totalVolume24h: ipxGlobalIndex.totalVolume24h,
    totalInvestors: ipxGlobalIndex.totalInvestors,
    countriesActive: ipxGlobalIndex.countriesActive,
  };
};
