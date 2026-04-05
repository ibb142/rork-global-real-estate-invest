export { SHARE_TRADING_CONFIG } from '@/constants/platform-config';

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
  name: 'IVX HOLDINGS LLC Index', ticker: 'IVXHOLDINGS-GREI',
  currentValue: 0, change24h: 0, changePercent24h: 0, high24h: 0, low24h: 0,
  totalMarketCap: 0, totalVolume24h: 0, totalProperties: 0, totalInvestors: 0,
  countriesActive: 0, allTimeHigh: 0, allTimeHighDate: '', history: [],
};

export const getGlobalStats = () => ({
  tradingCount: 0, ipoCount: 0, avgYield: 0, topGainer: undefined,
  topLoser: undefined, totalMarketCap: 0, totalVolume24h: 0, totalInvestors: 0, countriesActive: 0,
});
