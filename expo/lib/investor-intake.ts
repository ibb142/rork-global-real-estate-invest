import type { PublishedDealCardModel } from '@/lib/published-deal-card-model';

export const INVESTOR_MEMBER_AGREEMENT_VERSION = '2026-04-05';

export type InvestorEntityType = 'individual' | 'corporate';
export type InvestorDocumentType = 'drivers_license' | 'passport' | 'national_id' | 'tax_id';

export const INVESTOR_ENTITY_OPTIONS = [
  { id: 'individual' as const, label: 'Individual investor' },
  { id: 'corporate' as const, label: 'Company / entity investor' },
] as const;

export const IDENTIFICATION_TYPE_OPTIONS = [
  { id: 'drivers_license' as const, label: 'Driver\'s license' },
  { id: 'passport' as const, label: 'Passport' },
  { id: 'national_id' as const, label: 'National ID' },
  { id: 'tax_id' as const, label: 'Tax ID / residency card' },
] as const;

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
    detail: 'We review your waitlist details, call preference, identity references, and onboarding readiness.',
  },
  {
    id: 'agreement',
    label: 'Agreement + member onboarding',
    detail: 'Members sign platform terms, investment acknowledgements, tax-responsibility disclosures, and complete identity checks.',
  },
  {
    id: 'wallet',
    label: 'Wallet + funding',
    detail: 'Funding source, transaction records, source-of-funds review, and account statements are activated before investing.',
  },
  {
    id: 'allocation',
    label: 'Property allocation',
    detail: 'You review deal timelines, target sale assumptions, entity economics, and projected ownership economics.',
  },
  {
    id: 'exit',
    label: 'Distributions + exit',
    detail: 'Investor returns depend on deal performance, distributions, refinance, tax treatment, and the final property sale or exit event.',
  },
] as const;

export const INVESTOR_MEMBER_AGREEMENT_SECTIONS = [
  {
    id: 'eligibility',
    title: 'Eligibility and truthful information',
    text: 'You confirm that all information you submit to IVX is accurate, complete, current, and belongs to you or your authorized entity. IVX may pause or deny access if information is incomplete, misleading, or cannot be verified.',
  },
  {
    id: 'identity',
    title: 'Identity, KYC, AML, and document review',
    text: 'IVX may request government-issued ID, passport, national ID, tax identification references, source-of-funds support, beneficial-owner information, entity formation records, and any other compliance material needed to satisfy KYC, AML, sanctions, fraud, or operational review requirements.',
  },
  {
    id: 'tax',
    title: 'Tax reporting remains your responsibility',
    text: 'Each investor remains solely responsible for determining, filing, and paying any taxes, withholding, reporting obligations, or regulatory filings that apply to their account, entity, investment activity, distributions, and exit proceeds in every relevant jurisdiction.',
  },
  {
    id: 'wallet',
    title: 'Wallet, transaction, and recordkeeping',
    text: 'Members are responsible for using verified funding sources only. IVX may maintain transaction records, statements, wallet activity, suitability notes, compliance reviews, and investor communications for legal, security, and operational purposes.',
  },
  {
    id: 'ownership',
    title: 'Fractional ownership economics',
    text: 'Investor ownership percentages, distributions, fees, tax treatment, and exit proceeds are determined by the governing offering documents, capital stack, entity structure, and the final transaction documents for each property.',
  },
  {
    id: 'entity',
    title: 'Entity authority and beneficial ownership',
    text: 'If you register for a company, trust, fund, or other entity, you confirm that you are authorized to act for that entity, that you will provide true beneficial-owner information, and that IVX may require additional company tax, formation, and signer documentation before activation.',
  },
  {
    id: 'compliance',
    title: 'Compliance, investigations, and platform protections',
    text: 'IVX may reject, reverse, suspend, restrict, delay, or report onboarding, funding, withdrawals, or member access where needed for legal, compliance, fraud, AML, sanctions, tax, litigation-hold, or operational review. Platform use remains subject to the full IVX legal documents and applicable law.',
  },
] as const;

export type InvestorIntakeUploadSource = 'camera' | 'gallery' | 'document_picker';

export interface InvestorIntakeUploadFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  publicUrl?: string | null;
  storagePath?: string | null;
  source?: InvestorIntakeUploadSource;
}

export type IntakeProofOfFundsFile = InvestorIntakeUploadFile;

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

export function getIdentificationTypeLabel(type: InvestorDocumentType): string {
  return IDENTIFICATION_TYPE_OPTIONS.find((option) => option.id === type)?.label ?? 'Identification';
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
