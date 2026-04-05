import type { PublishedDealCardModel } from '@/lib/published-deal-card-model';

export const INVESTOR_MEMBER_AGREEMENT_VERSION = '2026-04-05';

export const INVESTMENT_RANGE_OPTIONS = [
  '$1,000 – $5,000',
  '$5,000 – $10,000',
  '$10,000 – $25,000',
  '$25,000 – $50,000',
  '$50,000 – $100,000',
  '$100,000 – $250,000',
  '$250,000+',
] as const;

export const RETURN_EXPECTATION_OPTIONS = [
  '8% – 12% annually',
  '12% – 18% annually',
  '18% – 25% annually',
  '25%+ annually',
  'Capital preservation + steady income',
  'Aggressive growth',
] as const;

export const CALL_TIME_OPTIONS = [
  '8:00 AM – 10:00 AM',
  '10:00 AM – 12:00 PM',
  '12:00 PM – 2:00 PM',
  '2:00 PM – 4:00 PM',
  '4:00 PM – 6:00 PM',
  '6:00 PM – 8:00 PM',
] as const;

export const ACCREDITED_STATUS_OPTIONS = [
  { id: 'unsure', label: 'Not sure yet' },
  { id: 'non_accredited', label: 'Non-accredited investor' },
  { id: 'accredited', label: 'Accredited investor' },
] as const;

export const INVESTOR_TIMELINE_STEPS = [
  {
    id: 'intake',
    label: 'Intake review',
    detail: 'We review your waitlist details, call preference, and wallet readiness.',
  },
  {
    id: 'agreement',
    label: 'Agreement + member onboarding',
    detail: 'Members sign platform terms, investment acknowledgements, and complete identity checks.',
  },
  {
    id: 'wallet',
    label: 'Wallet + funding',
    detail: 'Funding source, transaction records, and account statements are activated before investing.',
  },
  {
    id: 'allocation',
    label: 'Property allocation',
    detail: 'You review deal timelines, target sale assumptions, and projected ownership economics.',
  },
  {
    id: 'exit',
    label: 'Distributions + exit',
    detail: 'Investor returns depend on deal performance, distributions, refinance, or property sale.',
  },
] as const;

export const INVESTOR_MEMBER_AGREEMENT_SECTIONS = [
  {
    id: 'eligibility',
    title: 'Eligibility and truthful information',
    text: 'You confirm that all information you submit to IVX is accurate, complete, and belongs to you. IVX may pause or deny access if information is incomplete, misleading, or cannot be verified.',
  },
  {
    id: 'risk',
    title: 'No guaranteed returns',
    text: 'All investment illustrations, sale projections, timelines, yields, IRR figures, and return targets are estimates only. Capital is at risk and losses, delays, or lower returns may occur.',
  },
  {
    id: 'wallet',
    title: 'Wallet, transaction, and recordkeeping',
    text: 'Members are responsible for using verified funding sources only. IVX may maintain transaction records, statements, wallet activity, suitability notes, and investor communications for compliance and operational purposes.',
  },
  {
    id: 'ownership',
    title: 'Fractional ownership economics',
    text: 'Investor ownership percentages, distributions, fees, and exit proceeds are determined by the governing offering documents, capital stack, and the final transaction documents for each property.',
  },
  {
    id: 'compliance',
    title: 'Compliance, disputes, and platform protections',
    text: 'IVX may reject, reverse, suspend, or delay onboarding, funding, or member access where needed for legal, compliance, fraud, AML, sanctions, or operational review. Platform use remains subject to the full IVX legal documents and applicable law.',
  },
] as const;

export interface IntakeProofOfFundsFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  publicUrl?: string | null;
  storagePath?: string | null;
}

export interface DealExitProjection {
  baseAssetValue: number;
  estimatedSalePrice: number;
  minimumOwnershipPercent: number;
  minimumInvestment: number;
  estimatedGrossProfitAtMinimum: number;
  estimatedGrossPayoutAtMinimum: number;
}

function clampPositiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function parseRangeMidpoint(label: string): number {
  const matches = label.replace(/,/g, '').match(/\$?(\d+(?:\.\d+)?)/g) ?? [];
  const values = matches
    .map((value) => Number(String(value).replace('$', '')))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    return 0;
  }

  if (label.includes('+')) {
    return values[0] ?? 0;
  }

  if (values.length === 1) {
    return values[0] ?? 0;
  }

  return Math.round(((values[0] ?? 0) + (values[1] ?? 0)) / 2);
}

export function parseReturnMidpoint(label: string): number {
  const matches = label.match(/(\d+(?:\.\d+)?)%/g) ?? [];
  const values = matches
    .map((value) => Number(value.replace('%', '')))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    if (label.toLowerCase().includes('capital preservation')) {
      return 8;
    }
    if (label.toLowerCase().includes('aggressive')) {
      return 25;
    }
    return 0;
  }

  if (values.length === 1) {
    return values[0] ?? 0;
  }

  return Number((((values[0] ?? 0) + (values[1] ?? 0)) / 2).toFixed(1));
}

export function getDealExitProjection(deal: Pick<PublishedDealCardModel, 'propertyValue' | 'expectedROI' | 'minInvestment' | 'totalInvestment'>): DealExitProjection {
  const baseAssetValue = clampPositiveNumber(deal.propertyValue) || clampPositiveNumber(deal.totalInvestment);
  const roiPercent = clampPositiveNumber(deal.expectedROI);
  const minimumInvestment = clampPositiveNumber(deal.minInvestment);
  const capitalBase = clampPositiveNumber(deal.totalInvestment) || baseAssetValue;
  const minimumOwnershipPercent = capitalBase > 0 ? Number(((minimumInvestment / capitalBase) * 100).toFixed(3)) : 0;
  const estimatedSalePrice = Number((baseAssetValue * (1 + roiPercent / 100)).toFixed(2));
  const estimatedGrossProfitAtMinimum = Number((minimumInvestment * (roiPercent / 100)).toFixed(2));
  const estimatedGrossPayoutAtMinimum = Number((minimumInvestment + estimatedGrossProfitAtMinimum).toFixed(2));

  return {
    baseAssetValue,
    estimatedSalePrice,
    minimumOwnershipPercent,
    minimumInvestment,
    estimatedGrossProfitAtMinimum,
    estimatedGrossPayoutAtMinimum,
  };
}
