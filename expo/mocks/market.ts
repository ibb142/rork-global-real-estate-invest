import { MarketData } from '@/types';

export const marketData: Record<string, MarketData> = {};

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
