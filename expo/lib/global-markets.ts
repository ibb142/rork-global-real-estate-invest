import { useEffect, useRef, useState, useCallback } from 'react';

export interface ForexRate {
  symbol: string;
  base: string;
  quote: string;
  rate: number;
  change24h: number;
  changePercent24h: number;
  flag: string;
}

export interface GlobalIndex {
  symbol: string;
  name: string;
  country: string;
  value: number;
  change: number;
  changePercent: number;
  region: string;
  flag: string;
}

export interface CryptoAsset {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  marketCap: number;
  volume24h: number;
  color: string;
}

export interface Commodity {
  symbol: string;
  name: string;
  price: number;
  unit: string;
  change24h: number;
  changePercent24h: number;
  color: string;
}

export interface EconomicIndicator {
  country: string;
  flag: string;
  gdpGrowth: number;
  inflation: number;
  interestRate: number;
  currency: string;
}

export interface MoneyFlowNode {
  country: string;
  flag: string;
  city: string;
  volume: number;
  direction: 'inflow' | 'outflow';
  percentage: number;
  color: string;
}

export interface GlobalStats {
  totalForexVolume: string;
  dailyRealEstateTransactions: string;
  globalCryptoMarketCap: string;
  activeInvestors: string;
  globalGDPGrowth: string;
  totalAUM: string;
}

const BASE_FOREX: ForexRate[] = [
  { symbol: 'EUR/USD', base: 'EUR', quote: 'USD', rate: 1.0871, change24h: 0.0023, changePercent24h: 0.21, flag: '🇪🇺' },
  { symbol: 'GBP/USD', base: 'GBP', quote: 'USD', rate: 1.2643, change24h: -0.0011, changePercent24h: -0.09, flag: '🇬🇧' },
  { symbol: 'USD/JPY', base: 'USD', quote: 'JPY', rate: 149.82, change24h: 0.34, changePercent24h: 0.23, flag: '🇯🇵' },
  { symbol: 'USD/CAD', base: 'USD', quote: 'CAD', rate: 1.3621, change24h: -0.0045, changePercent24h: -0.33, flag: '🇨🇦' },
  { symbol: 'AUD/USD', base: 'AUD', quote: 'USD', rate: 0.6534, change24h: 0.0012, changePercent24h: 0.18, flag: '🇦🇺' },
  { symbol: 'USD/CHF', base: 'USD', quote: 'CHF', rate: 0.8921, change24h: 0.0008, changePercent24h: 0.09, flag: '🇨🇭' },
  { symbol: 'USD/CNY', base: 'USD', quote: 'CNY', rate: 7.2341, change24h: 0.0123, changePercent24h: 0.17, flag: '🇨🇳' },
  { symbol: 'USD/BRL', base: 'USD', quote: 'BRL', rate: 4.9712, change24h: -0.0231, changePercent24h: -0.46, flag: '🇧🇷' },
  { symbol: 'USD/MXN', base: 'USD', quote: 'MXN', rate: 17.1234, change24h: 0.0843, changePercent24h: 0.49, flag: '🇲🇽' },
  { symbol: 'USD/INR', base: 'USD', quote: 'INR', rate: 83.42, change24h: 0.12, changePercent24h: 0.14, flag: '🇮🇳' },
  { symbol: 'EUR/GBP', base: 'EUR', quote: 'GBP', rate: 0.8597, change24h: 0.0009, changePercent24h: 0.10, flag: '🇪🇺' },
  { symbol: 'USD/AED', base: 'USD', quote: 'AED', rate: 3.6730, change24h: 0.0, changePercent24h: 0.0, flag: '🇦🇪' },
];

const BASE_INDICES: GlobalIndex[] = [
  { symbol: 'S&P 500', name: 'S&P 500', country: 'USA', value: 5218.34, change: 34.21, changePercent: 0.66, region: 'Americas', flag: '🇺🇸' },
  { symbol: 'NASDAQ', name: 'NASDAQ Composite', country: 'USA', value: 16421.57, change: -87.32, changePercent: -0.53, region: 'Americas', flag: '🇺🇸' },
  { symbol: 'DOW', name: 'Dow Jones', country: 'USA', value: 38921.13, change: 156.34, changePercent: 0.40, region: 'Americas', flag: '🇺🇸' },
  { symbol: 'FTSE 100', name: 'FTSE 100', country: 'UK', value: 7642.31, change: -21.43, changePercent: -0.28, region: 'Europe', flag: '🇬🇧' },
  { symbol: 'DAX', name: 'DAX 40', country: 'Germany', value: 17823.45, change: 112.67, changePercent: 0.64, region: 'Europe', flag: '🇩🇪' },
  { symbol: 'CAC 40', name: 'CAC 40', country: 'France', value: 7932.18, change: 45.23, changePercent: 0.57, region: 'Europe', flag: '🇫🇷' },
  { symbol: 'NIKKEI', name: 'Nikkei 225', country: 'Japan', value: 38241.72, change: 234.56, changePercent: 0.62, region: 'Asia-Pacific', flag: '🇯🇵' },
  { symbol: 'HANG SENG', name: 'Hang Seng', country: 'HK', value: 16341.22, change: -123.45, changePercent: -0.75, region: 'Asia-Pacific', flag: '🇭🇰' },
  { symbol: 'SSE', name: 'Shanghai Composite', country: 'China', value: 3124.56, change: 18.34, changePercent: 0.59, region: 'Asia-Pacific', flag: '🇨🇳' },
  { symbol: 'ASX 200', name: 'ASX 200', country: 'Australia', value: 7734.21, change: 31.22, changePercent: 0.41, region: 'Asia-Pacific', flag: '🇦🇺' },
  { symbol: 'TSX', name: 'S&P/TSX', country: 'Canada', value: 21234.87, change: 87.43, changePercent: 0.41, region: 'Americas', flag: '🇨🇦' },
  { symbol: 'BOVESPA', name: 'Bovespa', country: 'Brazil', value: 127843.21, change: -432.11, changePercent: -0.34, region: 'Americas', flag: '🇧🇷' },
];

const BASE_CRYPTO: CryptoAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 67234.50, change24h: 1243.21, changePercent24h: 1.88, marketCap: 1324000000000, volume24h: 28400000000, color: '#F7931A' },
  { symbol: 'ETH', name: 'Ethereum', price: 3421.87, change24h: -67.23, changePercent24h: -1.93, marketCap: 411000000000, volume24h: 14200000000, color: '#627EEA' },
  { symbol: 'BNB', name: 'BNB', price: 412.34, change24h: 8.23, changePercent24h: 2.04, marketCap: 62000000000, volume24h: 1800000000, color: '#F3BA2F' },
  { symbol: 'SOL', name: 'Solana', price: 178.23, change24h: 5.43, changePercent24h: 3.14, marketCap: 83000000000, volume24h: 3200000000, color: '#9945FF' },
  { symbol: 'XRP', name: 'XRP', price: 0.6234, change24h: -0.0123, changePercent24h: -1.94, marketCap: 34000000000, volume24h: 1200000000, color: '#00AAE4' },
  { symbol: 'USDT', name: 'Tether', price: 1.0001, change24h: 0.0001, changePercent24h: 0.01, marketCap: 110000000000, volume24h: 48000000000, color: '#26A17B' },
];

const BASE_COMMODITIES: Commodity[] = [
  { symbol: 'XAU', name: 'Gold', price: 2321.40, unit: '/oz', change24h: 12.30, changePercent24h: 0.53, color: '#FFD700' },
  { symbol: 'XAG', name: 'Silver', price: 27.43, unit: '/oz', change24h: -0.23, changePercent24h: -0.83, color: '#C0C0C0' },
  { symbol: 'WTI', name: 'Crude Oil', price: 78.34, unit: '/bbl', change24h: 1.23, changePercent24h: 1.60, color: '#4A90D9' },
  { symbol: 'BRENT', name: 'Brent Oil', price: 82.12, unit: '/bbl', change24h: 0.98, changePercent24h: 1.21, color: '#2C7BE5' },
  { symbol: 'NG', name: 'Natural Gas', price: 2.143, unit: '/MMBtu', change24h: 0.034, changePercent24h: 1.61, color: '#00C48C' },
  { symbol: 'WHEAT', name: 'Wheat', price: 543.25, unit: '/bu', change24h: -3.75, changePercent24h: -0.69, color: '#F4A261' },
];

export const ECONOMIC_INDICATORS: EconomicIndicator[] = [
  { country: 'United States', flag: '🇺🇸', gdpGrowth: 2.5, inflation: 3.2, interestRate: 5.25, currency: 'USD' },
  { country: 'Euro Zone', flag: '🇪🇺', gdpGrowth: 0.8, inflation: 2.9, interestRate: 4.00, currency: 'EUR' },
  { country: 'United Kingdom', flag: '🇬🇧', gdpGrowth: 0.4, inflation: 4.0, interestRate: 5.00, currency: 'GBP' },
  { country: 'Japan', flag: '🇯🇵', gdpGrowth: 1.2, inflation: 2.8, interestRate: 0.10, currency: 'JPY' },
  { country: 'China', flag: '🇨🇳', gdpGrowth: 5.1, inflation: 0.7, interestRate: 3.45, currency: 'CNY' },
  { country: 'Canada', flag: '🇨🇦', gdpGrowth: 1.4, inflation: 3.4, interestRate: 4.75, currency: 'CAD' },
];

export const MONEY_FLOW_NODES: MoneyFlowNode[] = [
  { country: 'USA', flag: '🇺🇸', city: 'New York', volume: 8420, direction: 'outflow', percentage: 28.4, color: '#4A90D9' },
  { country: 'UK', flag: '🇬🇧', city: 'London', volume: 6230, direction: 'inflow', percentage: 21.0, color: '#00C48C' },
  { country: 'China', flag: '🇨🇳', city: 'Shanghai', volume: 4890, direction: 'outflow', percentage: 16.5, color: '#FF6B6B' },
  { country: 'Japan', flag: '🇯🇵', city: 'Tokyo', volume: 3210, direction: 'inflow', percentage: 10.8, color: '#FFD700' },
  { country: 'UAE', flag: '🇦🇪', city: 'Dubai', volume: 2780, direction: 'inflow', percentage: 9.4, color: '#9B59B6' },
  { country: 'Germany', flag: '🇩🇪', city: 'Frankfurt', volume: 2340, direction: 'outflow', percentage: 7.9, color: '#E67E22' },
  { country: 'Singapore', flag: '🇸🇬', city: 'Singapore', volume: 1890, direction: 'inflow', percentage: 6.4, color: '#1ABC9C' },
  { country: 'Brazil', flag: '🇧🇷', city: 'São Paulo', volume: 980, direction: 'outflow', percentage: 3.3, color: '#27AE60' },
];

export const GLOBAL_STATS: GlobalStats = {
  totalForexVolume: '$7.5T',
  dailyRealEstateTransactions: '$890B',
  globalCryptoMarketCap: '$2.3T',
  activeInvestors: '524M',
  globalGDPGrowth: '3.1%',
  totalAUM: '$124T',
};

function jitter(value: number, maxPercent: number = 0.002): number {
  const change = value * maxPercent * (Math.random() * 2 - 1);
  return value + change;
}

function updateForex(rates: ForexRate[]): ForexRate[] {
  return rates.map(r => {
    const newRate = jitter(r.rate, 0.0015);
    const diff = newRate - r.rate;
    const newChange = r.change24h + diff * 0.1;
    const newChangePercent = (newChange / (newRate - newChange)) * 100;
    return { ...r, rate: Math.round(newRate * 10000) / 10000, change24h: Math.round(newChange * 10000) / 10000, changePercent24h: Math.round(newChangePercent * 100) / 100 };
  });
}

function updateIndices(indices: GlobalIndex[]): GlobalIndex[] {
  return indices.map(idx => {
    const newVal = jitter(idx.value, 0.001);
    const diff = newVal - idx.value;
    const newChange = idx.change + diff;
    const newChangePct = (newChange / (newVal - newChange)) * 100;
    return { ...idx, value: Math.round(newVal * 100) / 100, change: Math.round(newChange * 100) / 100, changePercent: Math.round(newChangePct * 100) / 100 };
  });
}

function updateCrypto(assets: CryptoAsset[]): CryptoAsset[] {
  return assets.map(a => {
    const newPrice = jitter(a.price, 0.003);
    const diff = newPrice - a.price;
    const newChange = a.change24h + diff * 0.15;
    const newChangePct = (newChange / (newPrice - newChange)) * 100;
    return { ...a, price: Math.round(newPrice * 100) / 100, change24h: Math.round(newChange * 100) / 100, changePercent24h: Math.round(newChangePct * 100) / 100 };
  });
}

function updateCommodities(items: Commodity[]): Commodity[] {
  return items.map(c => {
    const newPrice = jitter(c.price, 0.002);
    const diff = newPrice - c.price;
    const newChange = c.change24h + diff * 0.1;
    const newChangePct = (newChange / (newPrice - newChange)) * 100;
    return { ...c, price: Math.round(newPrice * 1000) / 1000, change24h: Math.round(newChange * 1000) / 1000, changePercent24h: Math.round(newChangePct * 100) / 100 };
  });
}

export function useGlobalMarkets(updateIntervalMs: number = 3000) {
  const [forex, setForex] = useState<ForexRate[]>(BASE_FOREX);
  const [indices, setIndices] = useState<GlobalIndex[]>(BASE_INDICES);
  const [crypto, setCrypto] = useState<CryptoAsset[]>(BASE_CRYPTO);
  const [commodities, setCommodities] = useState<Commodity[]>(BASE_COMMODITIES);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    setForex(prev => updateForex(prev));
    setIndices(prev => updateIndices(prev));
    setCrypto(prev => updateCrypto(prev));
    setCommodities(prev => updateCommodities(prev));
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(tick, updateIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tick, updateIntervalMs]);

  const marketSentiment = (): 'bullish' | 'bearish' | 'neutral' => {
    const gainers = indices.filter(i => i.changePercent > 0).length;
    const ratio = gainers / indices.length;
    if (ratio > 0.6) return 'bullish';
    if (ratio < 0.4) return 'bearish';
    return 'neutral';
  };

  const globalVolume24h = forex.reduce((sum, r) => sum + Math.abs(r.change24h) * 1000000000, 0);

  return {
    forex,
    indices,
    crypto,
    commodities,
    lastUpdated,
    marketSentiment: marketSentiment(),
    globalStats: GLOBAL_STATS,
    economicIndicators: ECONOMIC_INDICATORS,
    moneyFlowNodes: MONEY_FLOW_NODES,
    globalVolume24h,
  };
}

export function formatPrice(price: number, decimals: number = 2): string {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(decimals)}`;
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

export function formatVolume(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T/day`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B/day`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M/day`;
  return `$${value.toLocaleString()}`;
}
