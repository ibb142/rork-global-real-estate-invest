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
