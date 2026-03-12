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

const generateIntraday = (basePrice: number, hours: number): { time: string; price: number; volume: number }[] => {
  const data: { time: string; price: number; volume: number }[] = [];
  let price = basePrice * 0.95;
  const now = new Date();
  for (let i = hours * 4; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 15 * 60 * 1000);
    const momentum = (Math.random() - 0.42) * basePrice * 0.015;
    price = Math.max(basePrice * 0.85, Math.min(basePrice * 1.35, price + momentum));
    const volume = Math.floor(Math.random() * 25000) + 5000;
    data.push({
      time: t.toISOString(),
      price: Math.round(price * 100) / 100,
      volume,
    });
  }
  return data;
};

const generateTrades = (propertyId: string, basePrice: number): ShareTrade[] => {
  const names = ['Alex M.', 'Jordan K.', 'Taylor R.', 'Casey L.', 'Morgan P.', 'Riley S.', 'Drew W.', 'Sam T.', 'Chris B.', 'Jamie D.'];
  const trades: ShareTrade[] = [];
  let p = basePrice;
  for (let i = 0; i < 20; i++) {
    const isBuy = Math.random() > 0.35;
    const shares = Math.floor(Math.random() * 5000) + 100;
    const change = (Math.random() - 0.4) * 0.08;
    p = Math.max(0.80, Math.min(basePrice * 1.5, p + change));
    p = Math.round(p * 100) / 100;
    const prevPrice = isBuy ? undefined : p - (Math.random() * 0.3 + 0.05);
    const profit = prevPrice ? (p - prevPrice) * shares : undefined;
    const profitPercent = prevPrice ? ((p - prevPrice) / prevPrice) * 100 : undefined;
    const t = new Date(Date.now() - i * (Math.random() * 300000 + 60000));
    trades.push({
      id: `trade-${propertyId}-${i}`,
      propertyId,
      buyerName: names[Math.floor(Math.random() * names.length)],
      type: isBuy ? 'buy' : 'sell',
      shares,
      pricePerShare: p,
      total: Math.round(p * shares * 100) / 100,
      profit: profit ? Math.round(profit * 100) / 100 : undefined,
      profitPercent: profitPercent ? Math.round(profitPercent * 100) / 100 : undefined,
      timestamp: t.toISOString(),
    });
  }
  return trades;
};

export const tokenizedProperties: TokenizedProperty[] = [];

const _SAMPLE_PROPERTIES: TokenizedProperty[] = [
  {
    id: 'tp-1',
    name: 'Coral Gables Estate',
    address: '4800 Ponce de Leon Blvd',
    city: 'Coral Gables',
    state: 'FL',
    country: 'USA',
    image: '',
    propertyType: 'residential',
    appraisedValue: 5000000,
    ltvPercent: 85,
    tokenizationValue: 4250000,
    totalShares: 4250000,
    availableShares: 1850000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.18,
    high24h: 1.25,
    low24h: 1.05,
    change24h: 0.13,
    changePercent24h: 12.38,
    volume24h: 892000,
    totalTrades: 4521,
    marketCap: 5015000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 9.5,
    status: 'trading',
    listedAt: '2025-09-01T00:00:00Z',
    priceHistory: generateIntraday(1.18, 24),
    recentTrades: generateTrades('tp-1', 1.18),
  },
  {
    id: 'tp-2',
    name: 'Manhattan Luxury Loft',
    address: '150 West 56th Street',
    city: 'New York',
    state: 'NY',
    country: 'USA',
    image: '',
    propertyType: 'commercial',
    appraisedValue: 12000000,
    ltvPercent: 85,
    tokenizationValue: 10200000,
    totalShares: 10200000,
    availableShares: 3060000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.32,
    high24h: 1.38,
    low24h: 1.22,
    change24h: 0.07,
    changePercent24h: 5.60,
    volume24h: 2140000,
    totalTrades: 8903,
    marketCap: 13464000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 8.2,
    status: 'trading',
    listedAt: '2025-07-15T00:00:00Z',
    priceHistory: generateIntraday(1.32, 24),
    recentTrades: generateTrades('tp-2', 1.32),
  },
  {
    id: 'tp-3',
    name: 'Beverly Hills Villa',
    address: '1200 Sunset Boulevard',
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
    image: '',
    propertyType: 'residential',
    appraisedValue: 8500000,
    ltvPercent: 85,
    tokenizationValue: 7225000,
    totalShares: 7225000,
    availableShares: 5057500,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.04,
    high24h: 1.08,
    low24h: 0.98,
    change24h: 0.02,
    changePercent24h: 1.96,
    volume24h: 560000,
    totalTrades: 1230,
    marketCap: 7514000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 10.8,
    status: 'ipo',
    listedAt: '2026-02-01T00:00:00Z',
    priceHistory: generateIntraday(1.04, 24),
    recentTrades: generateTrades('tp-3', 1.04),
  },
  {
    id: 'tp-4',
    name: 'Fisher Island Penthouse',
    address: '7000 Fisher Island Drive',
    city: 'Miami Beach',
    state: 'FL',
    country: 'USA',
    image: '',
    propertyType: 'residential',
    appraisedValue: 30000000,
    ltvPercent: 85,
    tokenizationValue: 25500000,
    totalShares: 25500000,
    availableShares: 17850000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.09,
    high24h: 1.14,
    low24h: 1.01,
    change24h: 0.05,
    changePercent24h: 4.81,
    volume24h: 3200000,
    totalTrades: 6140,
    marketCap: 27795000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 11.5,
    status: 'trading',
    listedAt: '2025-12-01T00:00:00Z',
    priceHistory: generateIntraday(1.09, 24),
    recentTrades: generateTrades('tp-4', 1.09),
  },
  {
    id: 'tp-5',
    name: 'Dubai Marina Tower',
    address: 'Marina Walk, Tower 12',
    city: 'Dubai',
    state: 'Dubai',
    country: 'UAE',
    image: '',
    propertyType: 'mixed',
    appraisedValue: 45000000,
    ltvPercent: 85,
    tokenizationValue: 38250000,
    totalShares: 38250000,
    availableShares: 15300000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.41,
    high24h: 1.48,
    low24h: 1.33,
    change24h: 0.09,
    changePercent24h: 6.82,
    volume24h: 5840000,
    totalTrades: 14200,
    marketCap: 53932500,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 12.4,
    status: 'trading',
    listedAt: '2025-06-01T00:00:00Z',
    priceHistory: generateIntraday(1.41, 24),
    recentTrades: generateTrades('tp-5', 1.41),
  },
  {
    id: 'tp-6',
    name: 'London Mayfair Residence',
    address: '22 Grosvenor Square',
    city: 'London',
    state: 'England',
    country: 'UK',
    image: '',
    propertyType: 'residential',
    appraisedValue: 22000000,
    ltvPercent: 85,
    tokenizationValue: 18700000,
    totalShares: 18700000,
    availableShares: 5610000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.27,
    high24h: 1.31,
    low24h: 1.19,
    change24h: 0.04,
    changePercent24h: 3.25,
    volume24h: 3450000,
    totalTrades: 9870,
    marketCap: 23749000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 7.8,
    status: 'trading',
    listedAt: '2025-08-15T00:00:00Z',
    priceHistory: generateIntraday(1.27, 24),
    recentTrades: generateTrades('tp-6', 1.27),
  },
  {
    id: 'tp-7',
    name: 'Tokyo Shibuya Complex',
    address: '1-2-3 Shibuya',
    city: 'Tokyo',
    state: 'Tokyo',
    country: 'Japan',
    image: '',
    propertyType: 'commercial',
    appraisedValue: 35000000,
    ltvPercent: 85,
    tokenizationValue: 29750000,
    totalShares: 29750000,
    availableShares: 20825000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.15,
    high24h: 1.19,
    low24h: 1.08,
    change24h: 0.06,
    changePercent24h: 5.50,
    volume24h: 4120000,
    totalTrades: 7600,
    marketCap: 34212500,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 8.9,
    status: 'trading',
    listedAt: '2025-10-01T00:00:00Z',
    priceHistory: generateIntraday(1.15, 24),
    recentTrades: generateTrades('tp-7', 1.15),
  },
  {
    id: 'tp-8',
    name: 'Singapore Orchard Suites',
    address: '238 Orchard Road',
    city: 'Singapore',
    state: 'Central',
    country: 'Singapore',
    image: '',
    propertyType: 'residential',
    appraisedValue: 18000000,
    ltvPercent: 85,
    tokenizationValue: 15300000,
    totalShares: 15300000,
    availableShares: 7650000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.22,
    high24h: 1.26,
    low24h: 1.15,
    change24h: 0.03,
    changePercent24h: 2.52,
    volume24h: 2780000,
    totalTrades: 5430,
    marketCap: 18666000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 9.1,
    status: 'trading',
    listedAt: '2025-11-01T00:00:00Z',
    priceHistory: generateIntraday(1.22, 24),
    recentTrades: generateTrades('tp-8', 1.22),
  },
  {
    id: 'tp-9',
    name: 'Paris Champs-Élysées',
    address: '88 Avenue des Champs-Élysées',
    city: 'Paris',
    state: 'Île-de-France',
    country: 'France',
    image: '',
    propertyType: 'commercial',
    appraisedValue: 52000000,
    ltvPercent: 85,
    tokenizationValue: 44200000,
    totalShares: 44200000,
    availableShares: 22100000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.35,
    high24h: 1.42,
    low24h: 1.28,
    change24h: 0.08,
    changePercent24h: 6.30,
    volume24h: 6200000,
    totalTrades: 11500,
    marketCap: 59670000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 7.2,
    status: 'trading',
    listedAt: '2025-05-01T00:00:00Z',
    priceHistory: generateIntraday(1.35, 24),
    recentTrades: generateTrades('tp-9', 1.35),
  },
  {
    id: 'tp-10',
    name: 'Sydney Harbour Estate',
    address: '1 Circular Quay West',
    city: 'Sydney',
    state: 'NSW',
    country: 'Australia',
    image: '',
    propertyType: 'mixed',
    appraisedValue: 28000000,
    ltvPercent: 85,
    tokenizationValue: 23800000,
    totalShares: 23800000,
    availableShares: 11900000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.19,
    high24h: 1.24,
    low24h: 1.12,
    change24h: -0.02,
    changePercent24h: -1.65,
    volume24h: 3100000,
    totalTrades: 6800,
    marketCap: 28322000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 8.6,
    status: 'trading',
    listedAt: '2025-10-15T00:00:00Z',
    priceHistory: generateIntraday(1.19, 24),
    recentTrades: generateTrades('tp-10', 1.19),
  },
  {
    id: 'tp-11',
    name: 'Monaco Waterfront Villa',
    address: '7 Avenue Princesse Grace',
    city: 'Monte Carlo',
    state: 'Monaco',
    country: 'Monaco',
    image: '',
    propertyType: 'residential',
    appraisedValue: 85000000,
    ltvPercent: 85,
    tokenizationValue: 72250000,
    totalShares: 72250000,
    availableShares: 36125000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.52,
    high24h: 1.58,
    low24h: 1.44,
    change24h: 0.11,
    changePercent24h: 7.80,
    volume24h: 8900000,
    totalTrades: 18400,
    marketCap: 109820000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 6.5,
    status: 'trading',
    listedAt: '2025-04-01T00:00:00Z',
    priceHistory: generateIntraday(1.52, 24),
    recentTrades: generateTrades('tp-11', 1.52),
  },
  {
    id: 'tp-12',
    name: 'Hong Kong Victoria Peak',
    address: '15 Peak Road',
    city: 'Hong Kong',
    state: 'HK',
    country: 'China',
    image: '',
    propertyType: 'residential',
    appraisedValue: 62000000,
    ltvPercent: 85,
    tokenizationValue: 52700000,
    totalShares: 52700000,
    availableShares: 26350000,
    initialPricePerShare: 1.00,
    currentPricePerShare: 1.38,
    high24h: 1.44,
    low24h: 1.30,
    change24h: -0.04,
    changePercent24h: -2.82,
    volume24h: 7200000,
    totalTrades: 15800,
    marketCap: 72726000,
    ipxLienPosition: 'first',
    ipxFeePercent: 2.5,
    closingCostPercent: 3,
    projectedYield: 7.1,
    status: 'trading',
    listedAt: '2025-07-01T00:00:00Z',
    priceHistory: generateIntraday(1.38, 24),
    recentTrades: generateTrades('tp-12', 1.38),
  },
];

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

const _generateIndexHistory = (): { time: string; value: number }[] => {
  const data: { time: string; value: number }[] = [];
  let value = 100;
  const now = new Date();
  for (let i = 365; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const momentum = (Math.random() - 0.38) * 1.5;
    value = Math.max(95, Math.min(200, value + momentum));
    data.push({
      time: t.toISOString(),
      value: Math.round(value * 100) / 100,
    });
  }
  return data;
};

const _computeTotalMarketCap = (): number => {
  return tokenizedProperties.reduce((sum, p) => sum + p.marketCap, 0);
};

const _computeTotalVolume = (): number => {
  return tokenizedProperties.reduce((sum, p) => sum + p.volume24h, 0);
};

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
  const avgYield = tokenizedProperties.reduce((sum, p) => sum + p.projectedYield, 0) / tokenizedProperties.length;
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
