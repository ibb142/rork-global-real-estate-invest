import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDirectApiBaseUrl } from '@/lib/api-base';

/**
 * IVX Reels module client — one canonical production source (backend
 * /api/reels, which reads jv_deal_reels + jv_deals + social tables) shared by
 * the app feed, the owner management screen, and (same endpoint) the landing
 * page. Never a separate hardcoded list.
 */

export const REELS_API_FALLBACK_BASE = 'https://ivx-holdings-platform.onrender.com';

export type ReelCategoryId =
  | 'all'
  | 'investment'
  | 'buyer'
  | 'seller'
  | 'jv'
  | 'tokenized'
  | 'construction'
  | 'walkthrough'
  | 'opportunity'
  | 'saved';

export const REEL_CATEGORY_CHIPS: { id: ReelCategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'investment', label: 'Investments' },
  { id: 'buyer', label: 'Buyers' },
  { id: 'seller', label: 'Sellers' },
  { id: 'jv', label: 'JV Deals' },
  { id: 'tokenized', label: 'Tokenized' },
  { id: 'construction', label: 'Construction' },
  { id: 'walkthrough', label: 'Walkthroughs' },
  { id: 'opportunity', label: 'Opportunities' },
  { id: 'saved', label: 'Saved' },
];

export const REEL_TYPE_LABELS: Record<string, string> = {
  investment: 'Investment',
  jv: 'JV Deal',
  buyer: 'Buyer',
  seller: 'Seller',
  tokenized: 'Tokenized',
  construction: 'Construction',
  walkthrough: 'Walkthrough',
  opportunity: 'Opportunity',
};

export interface ReelProjectSummary {
  id: string;
  title: string;
  location: string;
  investmentAmount: number;
  roiPercent: number;
  salePrice: number;
  minInvestment: number;
  minOwnershipPercent: string;
  developer: string;
  status: string;
}

export interface ReelItem {
  reel_id: string;
  reel_type: string;
  category_tags: string[];
  project_id: string | null;
  deal_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  tokenized_asset_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  published: boolean;
  approved: boolean;
  visibility: string;
  display_order: number;
  created_at: string | null;
  updated_at: string | null;
  likes: number;
  comments: number;
  saves: number;
  viewer: { liked: boolean; saved: boolean };
  project: ReelProjectSummary | null;
  cta: { primary: string; secondary: string | null };
}

export interface ReelsListResponse {
  ok: boolean;
  marker: string;
  total: number;
  count: number;
  categories: Record<string, number>;
  reels: ReelItem[];
  error?: string;
}

export interface ReelComment {
  id: string;
  reel_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

const DEVICE_KEY_STORAGE_KEY = 'ivx.reels.deviceKey';
let cachedDeviceKey: string | null = null;

function generateDeviceKey(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'ivxr-';
  for (let i = 0; i < 24; i++) {
    key += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return key;
}

/** Stable per-device key so likes/saves persist and are never double-counted. */
export async function getReelsDeviceKey(): Promise<string> {
  if (cachedDeviceKey) return cachedDeviceKey;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY_STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,128}$/.test(stored)) {
      cachedDeviceKey = stored;
      return stored;
    }
  } catch (error) {
    console.log('[Reels] device key read failed:', error instanceof Error ? error.message : 'unknown');
  }
  const fresh = generateDeviceKey();
  cachedDeviceKey = fresh;
  try {
    await AsyncStorage.setItem(DEVICE_KEY_STORAGE_KEY, fresh);
  } catch (error) {
    console.log('[Reels] device key persist failed:', error instanceof Error ? error.message : 'unknown');
  }
  return fresh;
}

async function reelsApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const bases = [getDirectApiBaseUrl(), REELS_API_FALLBACK_BASE].filter(
    (base, index, arr) => base && arr.indexOf(base) === index,
  );
  let lastError: Error | null = null;
  for (const base of bases) {
    try {
      const response = await fetch(`${base}${path}`, init);
      // Only fail over on infrastructure-level failures, not business errors.
      if (response.status !== 404 && response.status !== 502 && response.status !== 503) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} from ${base}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('network failure');
    }
  }
  throw lastError ?? new Error('Reels API unreachable');
}

/** Fetch the full canonical reels feed (all categories) with viewer state. */
export async function fetchReelsModule(deviceKey: string): Promise<ReelsListResponse> {
  const response = await reelsApiFetch(`/api/reels?viewer=${encodeURIComponent(deviceKey)}&limit=200`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Reels API HTTP ${response.status}: ${text.slice(0, 140)}`);
  }
  const data = await response.json() as ReelsListResponse;
  if (!data.ok) throw new Error(data.error || 'Reels API returned an error');
  console.log('[Reels] Loaded', data.total, 'reels; categories:', JSON.stringify(data.categories));
  return data;
}

/** Client-side category predicate — mirrors the backend exactly. */
export function reelMatchesCategoryClient(reel: ReelItem, category: ReelCategoryId, savedIds?: Set<string>): boolean {
  if (category === 'all') return true;
  if (category === 'saved') return reel.viewer.saved || Boolean(savedIds?.has(reel.reel_id));
  const type = (reel.reel_type || '').toLowerCase();
  const tags = Array.isArray(reel.category_tags) ? reel.category_tags : [];
  switch (category) {
    case 'investment':
      return reel.project_id !== null || type === 'investment' || tags.includes('investment');
    case 'jv':
      return reel.project_id !== null || type === 'jv' || tags.includes('jv');
    case 'buyer':
      return type === 'buyer' || tags.includes('buyer') || Boolean(reel.buyer_id);
    case 'seller':
      return type === 'seller' || tags.includes('seller') || Boolean(reel.seller_id);
    case 'tokenized':
      return type === 'tokenized' || tags.includes('tokenized') || Boolean(reel.tokenized_asset_id);
    case 'construction':
      return type === 'construction' || tags.includes('construction');
    case 'walkthrough':
      return type === 'walkthrough' || tags.includes('walkthrough');
    case 'opportunity':
      return type === 'opportunity' || tags.includes('opportunity');
    default:
      return false;
  }
}

/** Toggle like/save. Returns the new persisted count from the server. */
export async function toggleReelEngagement(
  reelId: string,
  kind: 'like' | 'save',
  deviceKey: string,
  on: boolean,
): Promise<number> {
  const response = await reelsApiFetch(`/api/reels/${encodeURIComponent(reelId)}/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceKey, on }),
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; count?: number; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return typeof data.count === 'number' ? data.count : 0;
}

export async function fetchReelComments(reelId: string): Promise<ReelComment[]> {
  const response = await reelsApiFetch(`/api/reels/${encodeURIComponent(reelId)}/comments`);
  const data = await response.json().catch(() => ({})) as { ok?: boolean; comments?: ReelComment[]; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return Array.isArray(data.comments) ? data.comments : [];
}

export async function postReelComment(
  reelId: string,
  deviceKey: string,
  authorName: string,
  body: string,
): Promise<{ comment: ReelComment | null; count: number }> {
  const response = await reelsApiFetch(`/api/reels/${encodeURIComponent(reelId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceKey, authorName, body }),
  });
  const data = await response.json().catch(() => ({})) as { ok?: boolean; comment?: ReelComment | null; count?: number; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return { comment: data.comment ?? null, count: typeof data.count === 'number' ? data.count : 0 };
}

export function formatReelMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${Math.round(value).toLocaleString('en-US')}`;
  return `$${value.toFixed(2)}`;
}
