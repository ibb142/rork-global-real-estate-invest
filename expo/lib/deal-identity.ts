import type { DealTrustInfo } from '@/lib/parse-deal';

function readText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function parseTrustInfo(value: unknown): DealTrustInfo | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as DealTrustInfo;
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return typeof value === 'object' ? value as DealTrustInfo : undefined;
}

function parsePartners(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function looksLikeCompanyName(value: string): boolean {
  const normalized = value.toUpperCase();
  return [
    ' LLC',
    ' INC',
    ' LTD',
    ' LP',
    ' CORP',
    ' CORPORATION',
    ' GROUP',
    ' DEVELOPMENT',
    ' DEVELOPERS',
    ' CONSTRUCT',
    ' BUILD',
    ' HOMES',
    ' REALTY',
    ' HOLDINGS',
    ' PROPERTIES',
    ' CAPITAL',
    ' VENTURES',
  ].some((token) => normalized.includes(token));
}

function getPartnerDeveloperName(partners: Array<Record<string, unknown>>): string {
  const rankedRoles = ['developer', 'builder', 'sponsor', 'operator', 'manager'];
  for (const role of rankedRoles) {
    const match = partners.find((partner) => {
      const partnerRole = readText(partner.role).toLowerCase();
      return partnerRole.includes(role);
    });
    const name = readText(match?.name);
    if (name) return name;
  }

  return readText(partners[0]?.name);
}

export interface CanonicalDealIdentity {
  title: string;
  projectName: string;
  developerName: string;
  trustInfo?: DealTrustInfo;
}

export function resolveCanonicalDealIdentity(deal: Record<string, unknown>): CanonicalDealIdentity {
  const trustInfo = parseTrustInfo(deal.trustInfo ?? deal.trust_info);
  const partners = parsePartners(deal.partners);

  const explicitTitle = readText(deal.title) || readText(deal.name);
  const explicitProjectName = readText(deal.projectName) || readText(deal.project_name);
  const explicitDeveloperName = readText(deal.developerName) || readText(deal.developer_name);
  const titleLooksLikeDeveloper = explicitTitle && looksLikeCompanyName(explicitTitle);
  const developerMatchesProject = explicitDeveloperName && explicitProjectName && explicitDeveloperName === explicitProjectName;

  const developerCandidates = [
    developerMatchesProject ? '' : explicitDeveloperName,
    titleLooksLikeDeveloper ? explicitTitle : '',
    readText(deal.partnerName),
    readText(deal.partner_name),
    readText(trustInfo?.llcName),
    readText(trustInfo?.builderName),
    getPartnerDeveloperName(partners),
  ].filter(Boolean);

  const developerName = developerCandidates[0]
    || (looksLikeCompanyName(explicitProjectName) ? explicitProjectName : '')
    || 'IVX Holdings LLC';

  const title = explicitTitle || explicitProjectName || developerName || 'Untitled Deal';
  const projectName = explicitProjectName || explicitTitle || developerName || title;

  return {
    title,
    projectName,
    developerName,
    trustInfo,
  };
}
