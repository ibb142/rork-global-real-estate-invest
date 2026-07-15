import { buildOwnershipSnapshot } from '@/lib/ownership-math';

export interface ResolvedTrustMarket {
  salePrice: number;
  explicitSalePrice?: number;
  minInvestment: number;
  fractionalSharePrice: number;
  timelineMin: number;
  timelineMax: number;
  timelineUnit: 'months' | 'years';
  priceChange1h: number;
  priceChange2h: number;
  ownershipText: string;
}

function sanitizePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function resolveTrustMarket(values: {
  salePrice?: unknown;
  propertyValue?: unknown;
  totalInvestment?: unknown;
  minInvestment?: unknown;
  fractionalSharePrice?: unknown;
  timelineMin?: unknown;
  timelineMax?: unknown;
  timelineUnit?: unknown;
  priceChange1h?: unknown;
  priceChange2h?: unknown;
}): ResolvedTrustMarket {
  const fallbackSalePrice = sanitizePositiveNumber(values.propertyValue, sanitizePositiveNumber(values.totalInvestment, 0));
  const explicitSalePrice = sanitizePositiveNumber(values.salePrice, 0);
  const salePrice = explicitSalePrice || fallbackSalePrice;
  const minInvestment = sanitizePositiveNumber(values.minInvestment, 50);
  const fractionalSharePrice = sanitizePositiveNumber(values.fractionalSharePrice, Math.max(minInvestment, 1));
  const timelineMin = sanitizePositiveNumber(values.timelineMin, 0);
  const timelineMax = sanitizePositiveNumber(values.timelineMax, timelineMin > 0 ? timelineMin : 0);
  const timelineUnit = values.timelineUnit === 'years' ? 'years' : 'months';
  const priceChange1h = Number.isFinite(Number(values.priceChange1h)) ? Number(values.priceChange1h) : 10;
  const priceChange2h = Number.isFinite(Number(values.priceChange2h)) ? Number(values.priceChange2h) : 18;
  const ownershipText = buildOwnershipSnapshot(minInvestment, salePrice).ownershipText;

  return {
    salePrice,
    explicitSalePrice: explicitSalePrice > 0 ? explicitSalePrice : undefined,
    minInvestment,
    fractionalSharePrice,
    timelineMin,
    timelineMax,
    timelineUnit,
    priceChange1h,
    priceChange2h,
    ownershipText,
  };
}

export function formatTrustTimelineLabel(values: Pick<ResolvedTrustMarket, 'timelineMin' | 'timelineMax' | 'timelineUnit'>): string {
  const unit = values.timelineUnit === 'years' ? 'yr' : 'mo';
  if (values.timelineMin > 0 && values.timelineMax > 0) {
    if (values.timelineMin === values.timelineMax) {
      return `${values.timelineMax} ${unit}`;
    }
    return `${values.timelineMin}–${values.timelineMax} ${unit}`;
  }
  if (values.timelineMax > 0) {
    return `${values.timelineMax} ${unit}`;
  }
  if (values.timelineMin > 0) {
    return `${values.timelineMin} ${unit}`;
  }
  return '';
}
