/**
 * Pure guards for production home-screen content.
 *
 * These exist so the live home screen can never render:
 * - "$NaN" or "undefined" as money/percentages
 * - test/mock property records (e.g. "IVX Test") as production cards
 * - broken reel rows that would blank out the Reels section
 *
 * All functions are pure and covered by __tests__/home-content-guards.test.ts.
 */

/** Coerces any value to a finite number, falling back when invalid. */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Renders a percent value safely — never "NaN%" or "undefined%". */
export function formatPercentSafe(value: unknown): string {
  const n = toFiniteNumber(value, Number.NaN);
  if (!Number.isFinite(n)) return '—';
  return `${n}%`;
}

const TEST_NAME_PATTERN = /(^|[^a-z])(test|demo|placeholder|sample|mock)([^a-z]|$)/i;

/**
 * Identifies test/mock property records that must never render in production
 * (e.g. the "IVX Test" card that displayed "$NaN" / "0% Yield" / "$0 raised").
 *
 * A record is quarantined when its name matches a test pattern OR it has no
 * valid financials at all (no price per share AND no target raise).
 */
export function isQuarantinedTestProperty(row: {
  name?: unknown;
  pricePerShare?: unknown;
  price_per_share?: unknown;
  targetRaise?: unknown;
  target_raise?: unknown;
} | null | undefined): boolean {
  if (!row) return true;
  const name = typeof row.name === 'string' ? row.name : '';
  if (TEST_NAME_PATTERN.test(name)) return true;

  const price = toFiniteNumber(row.pricePerShare ?? row.price_per_share, Number.NaN);
  const target = toFiniteNumber(row.targetRaise ?? row.target_raise, Number.NaN);
  const hasValidPrice = Number.isFinite(price) && price > 0;
  const hasValidTarget = Number.isFinite(target) && target > 0;
  return !hasValidPrice && !hasValidTarget;
}

export interface HomeReel {
  id: string;
  projectId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  sortOrder: number;
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * A reel row is publicly renderable when it is published, public (or has no
 * visibility restriction), and has a playable video URL. One bad row is
 * dropped without hiding the whole section.
 */
export function isPublicReelRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if (row.published !== true) return false;
  const visibility = typeof row.visibility === 'string' ? row.visibility.toLowerCase() : 'public';
  if (visibility !== 'public') return false;
  return isValidHttpUrl(row.video_url ?? row.videoUrl);
}

/** Maps a raw jv_deal_reels row into the app model. Returns null when unusable. */
export function mapReelRow(row: Record<string, unknown> | null | undefined): HomeReel | null {
  if (!isPublicReelRow(row)) return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id ? r.id : '';
  if (!id) return null;
  const videoUrl = (r.video_url ?? r.videoUrl) as string;
  const thumb = r.thumbnail_url ?? r.thumbnailUrl;
  return {
    id,
    projectId: typeof r.project_id === 'string' ? r.project_id : '',
    videoUrl,
    thumbnailUrl: isValidHttpUrl(thumb) ? thumb : null,
    caption: typeof r.caption === 'string' ? r.caption : '',
    sortOrder: toFiniteNumber(r.sort_order ?? r.sortOrder, 0),
  };
}

/** Maps + sorts a raw reel result set, dropping bad rows and duplicate ids. */
export function mapReelRows(rows: unknown): HomeReel[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const reels: HomeReel[] = [];
  for (const row of rows) {
    const reel = mapReelRow(row as Record<string, unknown>);
    if (!reel || seen.has(reel.id)) continue;
    seen.add(reel.id);
    reels.push(reel);
  }
  return reels.sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface HomePublicationPhoto {
  id: string;
  url: string;
  sortOrder: number;
  isCover: boolean;
}

export interface HomePublicationGroup {
  projectId: string;
  projectTitle: string;
  coverUrl: string;
  photoCount: number;
  photos: HomePublicationPhoto[];
}

/**
 * Builds a display title lookup from raw jv_deals rows so publications and
 * reels are always labeled with the correct project (title first, then
 * project_name, then the raw id — never blank).
 */
export function buildProjectTitleMap(rows: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(rows)) return map;
  for (const raw of rows) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r.id !== 'string' || !r.id) continue;
    const title =
      (typeof r.title === 'string' && r.title.trim()) ||
      (typeof r.project_name === 'string' && r.project_name.trim()) ||
      r.id;
    map[r.id] = title;
  }
  return map;
}

/**
 * Investment summary for a JV project, attached to every reel so the app
 * never renders a video without its linked investment card (owner directive:
 * reels are an investment surface, not a generic video gallery).
 */
export interface DealInvestmentSummary {
  id: string;
  title: string;
  location: string;
  investmentAmount: number;
  roiPercent: number;
  salePrice: number;
  fractionalMinimum: number;
  minOwnershipPercent: number;
  developer: string;
  status: string;
}

/**
 * Maps raw published jv_deals rows to per-project investment summaries keyed
 * by immutable project id (never by array index or title guessing).
 */
export function mapDealRowsToSummaries(rows: unknown): Record<string, DealInvestmentSummary> {
  const map: Record<string, DealInvestmentSummary> = {};
  if (!Array.isArray(rows)) return map;
  for (const raw of rows) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r.id !== 'string' || !r.id) continue;
    const title =
      (typeof r.title === 'string' && r.title.trim()) ||
      (typeof r.project_name === 'string' && r.project_name.trim()) ||
      r.id;
    const city = typeof r.city === 'string' ? r.city.trim() : '';
    const state = typeof r.state === 'string' ? r.state.trim() : '';
    const country = typeof r.country === 'string' ? r.country.trim() : '';
    const location = city && state ? `${city}, ${state}` : city || state || country;
    const investmentAmount = toFiniteNumber(r.total_investment, 0);
    const salePrice =
      toFiniteNumber(r.estimated_value, 0) ||
      toFiniteNumber(r.propertyValue, 0) ||
      investmentAmount;
    const rawMin = toFiniteNumber(r.min_investment, 0);
    const fractionalMinimum = rawMin > 0 ? rawMin : 50;
    const minOwnershipPercent = salePrice > 0 ? (fractionalMinimum / salePrice) * 100 : 0;
    const developer =
      (typeof r.partner_name === 'string' && r.partner_name.trim()) ||
      (typeof r.project_name === 'string' && r.project_name.trim()) ||
      'IVX Holdings LLC';
    map[r.id] = {
      id: r.id,
      title,
      location,
      investmentAmount,
      roiPercent: toFiniteNumber(r.expected_roi, 0),
      salePrice,
      fractionalMinimum,
      minOwnershipPercent,
      developer,
      status: typeof r.status === 'string' ? r.status : '',
    };
  }
  return map;
}

/** Counts published reels per project id — drives the yellow reels icon on project cards. */
export function countReelsByProject(reels: HomeReel[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reel of reels) {
    if (!reel.projectId) continue;
    counts[reel.projectId] = (counts[reel.projectId] ?? 0) + 1;
  }
  return counts;
}

/** Formats a minimum-ownership percent without ever rendering NaN. */
export function formatOwnershipPercent(minInvestment: number, salePrice: number): string {
  const min = toFiniteNumber(minInvestment, 0);
  const sale = toFiniteNumber(salePrice, 0);
  if (!(min > 0) || !(sale > 0)) return '';
  const pct = (min / sale) * 100;
  return `${pct.toFixed(pct >= 1 ? 2 : 4)}%`;
}

/**
 * Groups published jv_deal_media image rows by project so each project's
 * publications render next to that project. Unpublished rows, broken URLs,
 * and unknown shapes are dropped; one bad row never hides a project's group.
 */
export function mapMediaRowsToPublications(
  rows: unknown,
  titleMap: Record<string, string> = {},
): HomePublicationGroup[] {
  if (!Array.isArray(rows)) return [];
  const byProject = new Map<string, HomePublicationPhoto[]>();
  const seenIds = new Set<string>();
  for (const raw of rows) {
    const r = raw as Record<string, unknown> | null;
    if (!r) continue;
    if (r.published !== true) continue;
    const mediaType = typeof r.media_type === 'string' ? r.media_type.toLowerCase() : '';
    if (mediaType !== 'image') continue;
    const projectId = typeof r.project_id === 'string' ? r.project_id : '';
    if (!projectId) continue;
    const url = r.public_url ?? r.publicUrl ?? r.url;
    if (!isValidHttpUrl(url)) continue;
    const id = typeof r.id === 'string' && r.id ? r.id : `${projectId}:${String(url)}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const photo: HomePublicationPhoto = {
      id,
      url,
      sortOrder: toFiniteNumber(r.sort_order ?? r.sortOrder, 0),
      isCover: r.is_cover === true,
    };
    const list = byProject.get(projectId) ?? [];
    list.push(photo);
    byProject.set(projectId, list);
  }

  const groups: HomePublicationGroup[] = [];
  for (const [projectId, photos] of byProject) {
    photos.sort((a, b) => (Number(b.isCover) - Number(a.isCover)) || (a.sortOrder - b.sortOrder));
    groups.push({
      projectId,
      projectTitle: titleMap[projectId] ?? projectId,
      coverUrl: photos[0].url,
      photoCount: photos.length,
      photos,
    });
  }
  return groups.sort((a, b) => a.projectTitle.localeCompare(b.projectTitle));
}
