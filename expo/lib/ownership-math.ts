export interface OwnershipSnapshot {
  salePrice: number;
  investmentAmount: number;
  ownershipPercent: number;
  ownershipText: string;
}

function sanitizeAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

export function calculateOwnershipPercent(investmentAmount: number, salePrice: number): number {
  const safeInvestmentAmount = sanitizeAmount(investmentAmount);
  const safeSalePrice = sanitizeAmount(salePrice);

  if (safeInvestmentAmount <= 0 || safeSalePrice <= 0) {
    return 0;
  }

  return Math.min((safeInvestmentAmount / safeSalePrice) * 100, 100);
}

export function buildOwnershipSnapshot(investmentAmount: number, salePrice: number): OwnershipSnapshot {
  const safeSalePrice = sanitizeAmount(salePrice);
  const safeInvestmentAmount = sanitizeAmount(investmentAmount);
  const ownershipPercent = calculateOwnershipPercent(safeInvestmentAmount, safeSalePrice);

  return {
    salePrice: safeSalePrice,
    investmentAmount: safeInvestmentAmount,
    ownershipPercent,
    ownershipText: safeSalePrice > 0 && safeInvestmentAmount > 0
      ? `${ownershipPercent.toFixed(4)}% minimum ownership`
      : 'Ownership updates from live sale price',
  };
}
