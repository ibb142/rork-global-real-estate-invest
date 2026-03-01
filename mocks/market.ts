import { MarketData, OrderBookEntry } from '@/types';

const generateOrderBook = (basePrice: number, spread: number = 0.02): { bids: OrderBookEntry[], asks: OrderBookEntry[] } => {
  const bids: OrderBookEntry[] = [];
  const asks: OrderBookEntry[] = [];
  
  for (let i = 0; i < 5; i++) {
    const bidPrice = basePrice * (1 - spread * (i + 1));
    const bidShares = Math.floor(Math.random() * 500) + 100;
    bids.push({
      price: Math.round(bidPrice * 100) / 100,
      shares: bidShares,
      total: Math.round(bidPrice * bidShares * 100) / 100,
    });
    
    const askPrice = basePrice * (1 + spread * (i + 1));
    const askShares = Math.floor(Math.random() * 500) + 100;
    asks.push({
      price: Math.round(askPrice * 100) / 100,
      shares: askShares,
      total: Math.round(askPrice * askShares * 100) / 100,
    });
  }
  
  return { bids, asks };
};

export const marketData: Record<string, MarketData> = {
  '1': {
    propertyId: '1',
    lastPrice: 52.40,
    change24h: 0.85,
    changePercent24h: 1.65,
    volume24h: 125000,
    high24h: 53.10,
    low24h: 51.20,
    ...generateOrderBook(52.40),
  },
  '2': {
    propertyId: '2',
    lastPrice: 125.00,
    change24h: -1.20,
    changePercent24h: -0.95,
    volume24h: 85000,
    high24h: 126.50,
    low24h: 124.00,
    ...generateOrderBook(125.00),
  },
  '3': {
    propertyId: '3',
    lastPrice: 78.50,
    change24h: 0.50,
    changePercent24h: 0.64,
    volume24h: 45000,
    high24h: 79.00,
    low24h: 77.80,
    ...generateOrderBook(78.50),
  },
  '4': {
    propertyId: '4',
    lastPrice: 95.00,
    change24h: 0,
    changePercent24h: 0,
    volume24h: 0,
    high24h: 95.00,
    low24h: 95.00,
    ...generateOrderBook(95.00),
  },
  '5': {
    propertyId: '5',
    lastPrice: 185.00,
    change24h: 2.50,
    changePercent24h: 1.37,
    volume24h: 62000,
    high24h: 186.00,
    low24h: 182.00,
    ...generateOrderBook(185.00),
  },
  '6': {
    propertyId: '6',
    lastPrice: 68.00,
    change24h: -0.45,
    changePercent24h: -0.66,
    volume24h: 98000,
    high24h: 69.00,
    low24h: 67.50,
    ...generateOrderBook(68.00),
  },
};

export const getMarketDataByPropertyId = (propertyId: string): MarketData | undefined => {
  return marketData[propertyId];
};

export const getTopMovers = (): { gainers: MarketData[], losers: MarketData[] } => {
  const allData = Object.values(marketData);
  const sorted = [...allData].sort((a, b) => b.changePercent24h - a.changePercent24h);
  
  return {
    gainers: sorted.filter(d => d.changePercent24h > 0).slice(0, 3),
    losers: sorted.filter(d => d.changePercent24h < 0).slice(0, 3),
  };
};
