/**
 * IVX Reels Module API — one canonical production source for the app AND the
 * public landing page.
 *
 * Public (no login required):
 *   GET  /api/reels                     — all published+approved reels with
 *                                         linked business data + social counts
 *   GET  /api/reels?category=<cat>      — category-filtered feed
 *   GET  /api/reels?project_id=<id>     — project-filtered feed
 *   GET  /api/reels/meta                — per-category counts + integrity
 *   GET  /api/reels/:reelId/comments    — approved comments for one reel
 *   POST /api/reels/:reelId/like        — { deviceKey, on } toggle (real rows)
 *   POST /api/reels/:reelId/save        — { deviceKey, on } toggle (real rows)
 *   POST /api/reels/:reelId/comments    — { deviceKey, authorName?, body }
 *
 * Owner-only (Supabase owner bearer via assertIVXOwnerOnly):
 *   GET    /api/reels/admin/list        — every reel, any status
 *   POST   /api/reels/admin/create      — add reel from a storage URL
 *   PATCH  /api/reels/admin/:reelId     — edit/publish/approve/reorder/link
 *   DELETE /api/reels/admin/:reelId     — delete (explicit confirm required)
 *
 * Canonical source: public.jv_deal_reels (+ reel_likes / reel_saves /
 * reel_comments) keyed to jv_deals by immutable project id — never array
 * index or title matching. Social writes go through the backend service role
 * only, so counts are real persisted rows, never client-side fakes.
 */

export const REELS_API_MARKER = 'ivx-reels-module-v2';

/* ────────────────────────── types ────────────────────────── */

export type ReelRow = {
  id: string;
  project_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  sort_order: number | null;
  published: boolean;
  visibility: string | null;
  is_global: boolean | null;
  reel_type?: string | null;
  category_tags?: string[] | null;
  approved?: boolean | null;
  buyer_id?: string | null;
  seller_id?: string | null;
  tokenized_asset_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DealRow = {
  id: string;
  title?: string | null;
  project_name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  total_investment?: number | string | null;
  expected_roi?: number | string | null;
  estimated_value?: number | string | null;
  propertyValue?: number | string | null;
  min_investment?: number | string | null;
  partner_name?: string | null;
  status?: string | null;
};

export type DealSummary = {
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
};

export type ReelSocialCounts = { likes: number; comments: number; saves: number };
export type ReelViewerState = { liked: boolean; saved: boolean };

export const REEL_CATEGORIES = [
  'investment',
  'buyer',
  'seller',
  'jv',
  'tokenized',
  'construction',
  'walkthrough',
  'opportunity',
] as const;

export type ReelCategory = (typeof REEL_CATEGORIES)[number];
export type ReelCategoryFilter = ReelCategory | 'all';

const CATEGORY_SYNONYMS: Record<string, ReelCategoryFilter> = {
  '': 'all',
  all: 'all',
  investment: 'investment',
  investments: 'investment',
  buyer: 'buyer',
  buyers: 'buyer',
  seller: 'seller',
  sellers: 'seller',
  jv: 'jv',
  'jv-deals': 'jv',
  jv_deals: 'jv',
  jvdeals: 'jv',
  tokenized: 'tokenized',
  construction: 'construction',
  walkthrough: 'walkthrough',
  walkthroughs: 'walkthrough',
  opportunity: 'opportunity',
  opportunities: 'opportunity',
};

/* ─────────────────── pure, unit-tested helpers ─────────────────── */

/** Normalize any user-supplied category string; null when unrecognized. */
export function normalizeReelCategory(raw: string | null | undefined): ReelCategoryFilter | null {
  const key = String(raw ?? '').trim().toLowerCase();
  return CATEGORY_SYNONYMS[key] ?? null;
}

function tags(reel: ReelRow): string[] {
  return Array.isArray(reel.category_tags) ? reel.category_tags : [];
}

/**
 * Category membership. A reel can appear in more than one category (e.g. a
 * walkthrough explicitly tagged as buyer content), but a category never
 * guesses from titles — only typed columns decide.
 */
export function reelMatchesCategory(reel: ReelRow, category: ReelCategoryFilter): boolean {
  if (category === 'all') return true;
  const type = String(reel.reel_type ?? '').toLowerCase();
  const t = tags(reel);
  switch (category) {
    case 'investment':
      return reel.project_id !== null || type === 'investment' || t.includes('investment');
    case 'jv':
      return reel.project_id !== null || type === 'jv' || t.includes('jv');
    case 'buyer':
      return type === 'buyer' || t.includes('buyer') || Boolean(reel.buyer_id);
    case 'seller':
      return type === 'seller' || t.includes('seller') || Boolean(reel.seller_id);
    case 'tokenized':
      return type === 'tokenized' || t.includes('tokenized') || Boolean(reel.tokenized_asset_id);
    case 'construction':
      return type === 'construction' || t.includes('construction');
    case 'walkthrough':
      return type === 'walkthrough' || t.includes('walkthrough');
    case 'opportunity':
      return type === 'opportunity' || t.includes('opportunity');
    default:
      return false;
  }
}

/** Count reels per category (plus 'all') for chips + QA evidence. */
export function countReelsByCategory(reels: ReelRow[]): Record<string, number> {
  const counts: Record<string, number> = { all: reels.length };
  for (const category of REEL_CATEGORIES) {
    counts[category] = reels.filter((reel) => reelMatchesCategory(reel, category)).length;
  }
  return counts;
}

function toNumber(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** Investment-card summary mirroring the landing page math exactly. */
export function summarizeDealRow(deal: DealRow): DealSummary {
  const salePrice = toNumber(deal.estimated_value) || toNumber(deal.propertyValue) || toNumber(deal.total_investment);
  const minRaw = toNumber(deal.min_investment);
  const minInvestment = minRaw > 0 ? minRaw : 50;
  let minOwnershipPercent = '';
  if (minInvestment > 0 && salePrice > 0) {
    const pct = (minInvestment / salePrice) * 100;
    minOwnershipPercent = `${pct.toFixed(pct >= 1 ? 2 : 4)}%`;
  }
  const city = String(deal.city ?? '').trim();
  const st = String(deal.state ?? '').trim();
  const location = city && st ? `${city}, ${st}` : city || st || String(deal.country ?? '').trim();
  return {
    id: deal.id,
    title: String(deal.title || deal.project_name || 'Untitled'),
    location,
    investmentAmount: toNumber(deal.total_investment),
    roiPercent: toNumber(deal.expected_roi),
    salePrice,
    minInvestment,
    minOwnershipPercent,
    developer: String(deal.partner_name || deal.project_name || 'IVX Holdings LLC'),
    status: String(deal.status ?? ''),
  };
}

/** CTA descriptor per reel type so every surface renders the correct action. */
export function reelCta(reel: ReelRow): { primary: string; secondary: string | null } {
  if (reel.project_id) return { primary: 'invest_now', secondary: 'view_deal' };
  const type = String(reel.reel_type ?? '').toLowerCase();
  if (type === 'buyer') return { primary: 'contact_match', secondary: 'view_deals' };
  if (type === 'seller') return { primary: 'submit_listing', secondary: 'view_deals' };
  if (type === 'tokenized') return { primary: 'view_tokenized', secondary: 'view_deals' };
  if (type === 'construction' || type === 'walkthrough') return { primary: 'view_projects', secondary: null };
  return { primary: 'view_deals', secondary: null };
}

/** Canonical wire shape for one reel — identical for app, web, and landing. */
export function buildReelPayload(
  reel: ReelRow,
  deal: DealRow | null,
  counts: ReelSocialCounts,
  viewer: ReelViewerState,
): Record<string, unknown> {
  return {
    reel_id: reel.id,
    reel_type: String(reel.reel_type ?? (reel.project_id ? 'investment' : 'opportunity')),
    category_tags: tags(reel),
    project_id: reel.project_id,
    deal_id: reel.project_id,
    buyer_id: reel.buyer_id ?? null,
    seller_id: reel.seller_id ?? null,
    tokenized_asset_id: reel.tokenized_asset_id ?? null,
    video_url: reel.video_url,
    thumbnail_url: reel.thumbnail_url,
    caption: reel.caption,
    published: reel.published,
    approved: reel.approved ?? true,
    visibility: reel.visibility ?? 'public',
    display_order: typeof reel.sort_order === 'number' ? reel.sort_order : 0,
    created_at: reel.created_at ?? null,
    updated_at: reel.updated_at ?? null,
    likes: counts.likes,
    comments: counts.comments,
    saves: counts.saves,
    viewer,
    project: deal ? summarizeDealRow(deal) : null,
    cta: reelCta(reel),
  };
}

/* ────────────────────────── infra helpers ────────────────────────── */

function supabaseBase(): string {
  return (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://kvclcdjmjghndxsngfzb.supabase.co')
    .trim()
    .replace(/\/+$/, '');
}

function anonKey(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
}

function serviceKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '').trim();
}

function readKey(): string {
  return serviceKey() || anonKey();
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ivx-reels-confirm',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

export function reelsOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function sbFetch(path: string, key: string, init?: RequestInit): Promise<Response> {
  return fetch(`${supabaseBase()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

const DEVICE_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

function normalizeDeviceKey(raw: unknown): string | null {
  const key = String(raw ?? '').trim();
  return DEVICE_KEY_RE.test(key) ? key : null;
}

const VIDEO_URL_RE = /^https:\/\/.+\.(mp4|mov|m4v|webm)(\?.*)?$/i;

/* ────────────────────────── data loading ────────────────────────── */

const PUBLIC_REEL_FILTER = 'published=eq.true&approved=eq.true&visibility=in.(public,global)';
const LEGACY_REEL_FILTER = 'published=eq.true&visibility=in.(public,global)';

async function fetchPublicReels(): Promise<{ reels: ReelRow[]; error: string | null; legacySchema: boolean }> {
  const key = readKey();
  if (!key) return { reels: [], error: 'Supabase credentials are not bound in this runtime.', legacySchema: false };
  const order = 'order=sort_order.asc,created_at.desc';
  let res = await sbFetch(`jv_deal_reels?select=*&${PUBLIC_REEL_FILTER}&${order}`, key).catch(() => null);
  if (res && res.ok) {
    const rows = await res.json().catch(() => []) as ReelRow[];
    return { reels: Array.isArray(rows) ? rows : [], error: null, legacySchema: false };
  }
  // Pre-migration schema (no approved/reel_type columns) — degrade gracefully.
  res = await sbFetch(`jv_deal_reels?select=*&${LEGACY_REEL_FILTER}&${order}`, key).catch(() => null);
  if (res && res.ok) {
    const rows = await res.json().catch(() => []) as ReelRow[];
    return { reels: Array.isArray(rows) ? rows : [], error: null, legacySchema: true };
  }
  const detail = res ? `HTTP ${res.status}` : 'network failure';
  return { reels: [], error: `jv_deal_reels fetch failed: ${detail}`, legacySchema: false };
}

async function fetchPublishedDeals(): Promise<Record<string, DealRow>> {
  const key = readKey();
  if (!key) return {};
  const fields = 'id,title,project_name,city,state,country,total_investment,expected_roi,estimated_value,propertyValue,min_investment,partner_name,status';
  const res = await sbFetch(`jv_deals?select=${encodeURIComponent(fields)}&published=eq.true`, key).catch(() => null);
  if (!res || !res.ok) return {};
  const rows = await res.json().catch(() => []) as DealRow[];
  const map: Record<string, DealRow> = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.id) map[row.id] = row;
  }
  return map;
}

type SocialRow = { reel_id: string; device_key?: string };

async function fetchSocialRows(table: 'reel_likes' | 'reel_saves' | 'reel_comments'): Promise<SocialRow[]> {
  const key = readKey();
  if (!key) return [];
  const filter = table === 'reel_comments' ? '&approved=eq.true' : '';
  const res = await sbFetch(`${table}?select=reel_id,device_key${filter}&limit=10000`, key).catch(() => null);
  if (!res || !res.ok) return [];
  const rows = await res.json().catch(() => []) as SocialRow[];
  return Array.isArray(rows) ? rows : [];
}

function socialIndex(rows: SocialRow[]): { counts: Record<string, number>; byDevice: Record<string, Set<string>> } {
  const counts: Record<string, number> = {};
  const byDevice: Record<string, Set<string>> = {};
  for (const row of rows) {
    if (!row?.reel_id) continue;
    counts[row.reel_id] = (counts[row.reel_id] ?? 0) + 1;
    if (row.device_key) {
      (byDevice[row.reel_id] ??= new Set()).add(row.device_key);
    }
  }
  return { counts, byDevice };
}

/* ────────────────────────── public handlers ────────────────────────── */

export async function handleReelsListRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const categoryRaw = url.searchParams.get('category');
  const category = normalizeReelCategory(categoryRaw);
  if (categoryRaw !== null && category === null) {
    return json({
      ok: false,
      marker: REELS_API_MARKER,
      error: `Unknown category "${categoryRaw}". Valid: all, ${REEL_CATEGORIES.join(', ')}.`,
    }, 400);
  }
  const projectId = (url.searchParams.get('project_id') ?? url.searchParams.get('project') ?? '').trim() || null;
  const viewerKey = normalizeDeviceKey(url.searchParams.get('viewer'));
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 1), 200);
  const offset = Math.max(Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const [{ reels, error, legacySchema }, deals, likeRows, saveRows, commentRows] = await Promise.all([
    fetchPublicReels(),
    fetchPublishedDeals(),
    fetchSocialRows('reel_likes'),
    fetchSocialRows('reel_saves'),
    fetchSocialRows('reel_comments'),
  ]);

  if (error) {
    return json({ ok: false, marker: REELS_API_MARKER, error, timestamp: new Date().toISOString() }, 502);
  }

  const likes = socialIndex(likeRows);
  const saves = socialIndex(saveRows);
  const comments = socialIndex(commentRows);
  const categoryCounts = countReelsByCategory(reels);

  let filtered = reels;
  if (projectId) filtered = filtered.filter((reel) => reel.project_id === projectId);
  if (category && category !== 'all') filtered = filtered.filter((reel) => reelMatchesCategory(reel, category));

  const page = filtered.slice(offset, offset + limit);
  const payload = page.map((reel) => buildReelPayload(
    reel,
    reel.project_id ? deals[reel.project_id] ?? null : null,
    {
      likes: likes.counts[reel.id] ?? 0,
      comments: comments.counts[reel.id] ?? 0,
      saves: saves.counts[reel.id] ?? 0,
    },
    {
      liked: Boolean(viewerKey && likes.byDevice[reel.id]?.has(viewerKey)),
      saved: Boolean(viewerKey && saves.byDevice[reel.id]?.has(viewerKey)),
    },
  ));

  return json({
    ok: true,
    marker: REELS_API_MARKER,
    legacySchema,
    category: category ?? 'all',
    project_id: projectId,
    total: filtered.length,
    count: payload.length,
    limit,
    offset,
    categories: categoryCounts,
    reels: payload,
    timestamp: new Date().toISOString(),
  });
}

export async function handleReelsMetaRequest(): Promise<Response> {
  const [{ reels, error, legacySchema }, deals] = await Promise.all([
    fetchPublicReels(),
    fetchPublishedDeals(),
  ]);
  if (error) {
    return json({ ok: false, marker: REELS_API_MARKER, error, timestamp: new Date().toISOString() }, 502);
  }
  const categoryCounts = countReelsByCategory(reels);
  const perProject: Record<string, number> = {};
  const seenUrls = new Map<string, number>();
  let orphanReels = 0;
  for (const reel of reels) {
    seenUrls.set(reel.video_url, (seenUrls.get(reel.video_url) ?? 0) + 1);
    if (reel.project_id) {
      perProject[reel.project_id] = (perProject[reel.project_id] ?? 0) + 1;
      if (!deals[reel.project_id]) orphanReels += 1;
    }
  }
  const duplicateReels = [...seenUrls.values()].filter((count) => count > 1).length;

  return json({
    ok: true,
    marker: REELS_API_MARKER,
    legacySchema,
    total_reels: reels.length,
    categories: categoryCounts,
    per_project: perProject,
    orphan_reels: orphanReels,
    duplicate_reels: duplicateReels,
    cross_project_reels: 0,
    published_projects: Object.keys(deals).length,
    timestamp: new Date().toISOString(),
  });
}

/* ────────────────────────── social handlers ────────────────────────── */

async function countForReel(table: 'reel_likes' | 'reel_saves' | 'reel_comments', reelId: string): Promise<number> {
  const key = readKey();
  if (!key) return 0;
  const filter = table === 'reel_comments' ? '&approved=eq.true' : '';
  const res = await sbFetch(`${table}?select=id&reel_id=eq.${encodeURIComponent(reelId)}${filter}&limit=1`, key, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  }).catch(() => null);
  if (!res || !res.ok) return 0;
  const range = res.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

export async function handleReelEngagementToggle(
  request: Request,
  reelId: string,
  kind: 'like' | 'save',
): Promise<Response> {
  const table = kind === 'like' ? 'reel_likes' : 'reel_saves';
  const svc = serviceKey();
  if (!svc) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'Engagement writes are unavailable: service credentials not bound.' }, 503);
  }
  const body = await request.json().catch(() => ({})) as { deviceKey?: unknown; on?: unknown };
  const deviceKey = normalizeDeviceKey(body.deviceKey);
  if (!deviceKey) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'deviceKey (8-128 chars, [A-Za-z0-9_-]) is required.' }, 400);
  }
  const on = body.on !== false;

  if (on) {
    const res = await sbFetch(`${table}?on_conflict=reel_id,device_key`, svc, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ reel_id: reelId, device_key: deviceKey }),
    }).catch(() => null);
    if (!res || (!res.ok && res.status !== 409)) {
      const detail = res ? `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}` : 'network failure';
      return json({ ok: false, marker: REELS_API_MARKER, error: `${kind} failed: ${detail}` }, 502);
    }
  } else {
    const res = await sbFetch(`${table}?reel_id=eq.${encodeURIComponent(reelId)}&device_key=eq.${encodeURIComponent(deviceKey)}`, svc, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }).catch(() => null);
    if (!res || !res.ok) {
      const detail = res ? `HTTP ${res.status}` : 'network failure';
      return json({ ok: false, marker: REELS_API_MARKER, error: `un${kind} failed: ${detail}` }, 502);
    }
  }

  const total = await countForReel(table, reelId);
  return json({
    ok: true,
    marker: REELS_API_MARKER,
    reel_id: reelId,
    kind,
    on,
    count: total,
    timestamp: new Date().toISOString(),
  });
}

export async function handleReelCommentsGet(reelId: string): Promise<Response> {
  const key = readKey();
  if (!key) return json({ ok: false, marker: REELS_API_MARKER, error: 'Supabase credentials are not bound.' }, 503);
  const res = await sbFetch(
    `reel_comments?select=id,reel_id,author_name,body,created_at&reel_id=eq.${encodeURIComponent(reelId)}&approved=eq.true&order=created_at.desc&limit=100`,
    key,
  ).catch(() => null);
  if (!res || !res.ok) {
    return json({ ok: false, marker: REELS_API_MARKER, error: `comments fetch failed: ${res ? `HTTP ${res.status}` : 'network failure'}` }, 502);
  }
  const rows = await res.json().catch(() => []) as unknown[];
  return json({
    ok: true,
    marker: REELS_API_MARKER,
    reel_id: reelId,
    count: Array.isArray(rows) ? rows.length : 0,
    comments: rows,
    timestamp: new Date().toISOString(),
  });
}

function sanitizeCommentText(raw: unknown, maxLength: number): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export async function handleReelCommentPost(request: Request, reelId: string): Promise<Response> {
  const svc = serviceKey();
  if (!svc) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'Comment writes are unavailable: service credentials not bound.' }, 503);
  }
  const body = await request.json().catch(() => ({})) as { deviceKey?: unknown; authorName?: unknown; body?: unknown };
  const deviceKey = normalizeDeviceKey(body.deviceKey);
  if (!deviceKey) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'deviceKey (8-128 chars, [A-Za-z0-9_-]) is required.' }, 400);
  }
  const text = sanitizeCommentText(body.body, 500);
  if (text.length === 0) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'Comment body is required (1-500 characters).' }, 400);
  }
  const authorName = sanitizeCommentText(body.authorName, 60) || 'Guest';

  const res = await sbFetch('reel_comments', svc, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ reel_id: reelId, device_key: deviceKey, author_name: authorName, body: text, approved: true }),
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}` : 'network failure';
    return json({ ok: false, marker: REELS_API_MARKER, error: `comment failed: ${detail}` }, 502);
  }
  const created = await res.json().catch(() => []) as unknown[];
  const total = await countForReel('reel_comments', reelId);
  return json({
    ok: true,
    marker: REELS_API_MARKER,
    reel_id: reelId,
    comment: Array.isArray(created) ? created[0] ?? null : null,
    count: total,
    timestamp: new Date().toISOString(),
  });
}

/* ────────────────────────── owner admin handlers ────────────────────────── */

async function requireOwner(request: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const { assertIVXOwnerOnly } = await import('./owner-only');
    await assertIVXOwnerOnly(request);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner authorization failed.';
    return { ok: false, response: json({ ok: false, marker: REELS_API_MARKER, error: message }, 401) };
  }
}

export async function handleReelsAdminList(request: Request): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const svc = serviceKey();
  if (!svc) return json({ ok: false, marker: REELS_API_MARKER, error: 'Service credentials not bound.' }, 503);

  const [reelsRes, deals] = await Promise.all([
    sbFetch('jv_deal_reels?select=*&order=sort_order.asc,created_at.desc', svc).catch(() => null),
    fetchPublishedDeals(),
  ]);
  if (!reelsRes || !reelsRes.ok) {
    return json({ ok: false, marker: REELS_API_MARKER, error: `admin list failed: ${reelsRes ? `HTTP ${reelsRes.status}` : 'network failure'}` }, 502);
  }
  const reels = await reelsRes.json().catch(() => []) as ReelRow[];
  const { getReelsModuleMigrationState } = await import('../services/ivx-reels-module-migration');
  return json({
    ok: true,
    marker: REELS_API_MARKER,
    total: Array.isArray(reels) ? reels.length : 0,
    reels,
    deals: Object.values(deals).map((deal) => summarizeDealRow(deal)),
    migration: getReelsModuleMigrationState(),
    timestamp: new Date().toISOString(),
  });
}

const ADMIN_EDITABLE_FIELDS = new Set([
  'caption', 'thumbnail_url', 'reel_type', 'category_tags', 'sort_order',
  'published', 'approved', 'visibility', 'project_id', 'buyer_id', 'seller_id', 'tokenized_asset_id',
]);

function validateReelType(value: unknown): string | null {
  const type = String(value ?? '').trim().toLowerCase();
  return (REEL_CATEGORIES as readonly string[]).includes(type) ? type : null;
}

async function projectExists(projectId: string): Promise<boolean> {
  const key = readKey();
  if (!key) return false;
  const res = await sbFetch(`jv_deals?select=id&id=eq.${encodeURIComponent(projectId)}&limit=1`, key).catch(() => null);
  if (!res || !res.ok) return false;
  const rows = await res.json().catch(() => []) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

export async function handleReelsAdminCreate(request: Request): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const svc = serviceKey();
  if (!svc) return json({ ok: false, marker: REELS_API_MARKER, error: 'Service credentials not bound.' }, 503);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const videoUrl = String(body.videoUrl ?? body.video_url ?? '').trim();
  if (!VIDEO_URL_RE.test(videoUrl)) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'videoUrl must be an https URL ending in .mp4/.mov/.m4v/.webm.' }, 400);
  }
  const projectId = String(body.projectId ?? body.project_id ?? '').trim() || null;
  if (projectId && !(await projectExists(projectId))) {
    return json({ ok: false, marker: REELS_API_MARKER, error: `Project "${projectId}" does not exist in jv_deals — reels must link to real records.` }, 400);
  }
  const reelType = validateReelType(body.reelType ?? body.reel_type) ?? (projectId ? 'investment' : 'opportunity');
  const categoryTags = Array.isArray(body.categoryTags ?? body.category_tags)
    ? (body.categoryTags ?? body.category_tags as unknown[] ?? [])
    : [];
  const row = {
    project_id: projectId,
    is_global: projectId === null,
    video_url: videoUrl,
    thumbnail_url: String(body.thumbnailUrl ?? body.thumbnail_url ?? '').trim() || null,
    caption: sanitizeCommentText(body.caption, 200) || null,
    reel_type: reelType,
    category_tags: (categoryTags as unknown[]).map((t) => String(t).toLowerCase()).filter((t) => (REEL_CATEGORIES as readonly string[]).includes(t)),
    sort_order: Number.isFinite(Number(body.sortOrder ?? body.sort_order)) ? Number(body.sortOrder ?? body.sort_order) : 0,
    published: body.published === true,
    approved: body.approved !== false,
    visibility: 'public',
  };
  const res = await sbFetch('jv_deal_reels', svc, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 240)}` : 'network failure';
    return json({ ok: false, marker: REELS_API_MARKER, error: `create failed: ${detail}` }, 502);
  }
  const created = await res.json().catch(() => []) as unknown[];
  return json({ ok: true, marker: REELS_API_MARKER, reel: Array.isArray(created) ? created[0] ?? null : null, timestamp: new Date().toISOString() });
}

export async function handleReelsAdminUpdate(request: Request, reelId: string): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const svc = serviceKey();
  if (!svc) return json({ ok: false, marker: REELS_API_MARKER, error: 'Service credentials not bound.' }, 503);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(body)) {
    const key = rawKey.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (!ADMIN_EDITABLE_FIELDS.has(key)) continue;
    patch[key] = value;
  }
  if ('reel_type' in patch) {
    const type = validateReelType(patch.reel_type);
    if (!type) return json({ ok: false, marker: REELS_API_MARKER, error: `Invalid reel_type. Valid: ${REEL_CATEGORIES.join(', ')}.` }, 400);
    patch.reel_type = type;
  }
  if ('project_id' in patch) {
    const projectId = String(patch.project_id ?? '').trim() || null;
    if (projectId && !(await projectExists(projectId))) {
      return json({ ok: false, marker: REELS_API_MARKER, error: `Project "${projectId}" does not exist in jv_deals.` }, 400);
    }
    patch.project_id = projectId;
    patch.is_global = projectId === null;
  }
  if ('caption' in patch) patch.caption = sanitizeCommentText(patch.caption, 200) || null;
  if (Object.keys(patch).length === 0) {
    return json({ ok: false, marker: REELS_API_MARKER, error: 'No editable fields supplied.' }, 400);
  }

  const res = await sbFetch(`jv_deal_reels?id=eq.${encodeURIComponent(reelId)}`, svc, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 240)}` : 'network failure';
    return json({ ok: false, marker: REELS_API_MARKER, error: `update failed: ${detail}` }, 502);
  }
  const updated = await res.json().catch(() => []) as unknown[];
  if (!Array.isArray(updated) || updated.length === 0) {
    return json({ ok: false, marker: REELS_API_MARKER, error: `Reel ${reelId} not found.` }, 404);
  }
  return json({ ok: true, marker: REELS_API_MARKER, reel: updated[0], timestamp: new Date().toISOString() });
}

export async function handleReelsAdminDelete(request: Request, reelId: string): Promise<Response> {
  const owner = await requireOwner(request);
  if (!owner.ok) return owner.response;
  const svc = serviceKey();
  if (!svc) return json({ ok: false, marker: REELS_API_MARKER, error: 'Service credentials not bound.' }, 503);

  const confirm = request.headers.get('x-ivx-reels-confirm')?.trim() ?? '';
  if (confirm !== 'DELETE') {
    return json({
      ok: false,
      marker: REELS_API_MARKER,
      error: 'Deletion requires explicit owner confirmation. Send header x-ivx-reels-confirm: DELETE',
    }, 409);
  }
  const res = await sbFetch(`jv_deal_reels?id=eq.${encodeURIComponent(reelId)}`, svc, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  }).catch(() => null);
  if (!res || !res.ok) {
    const detail = res ? `HTTP ${res.status}` : 'network failure';
    return json({ ok: false, marker: REELS_API_MARKER, error: `delete failed: ${detail}` }, 502);
  }
  const deleted = await res.json().catch(() => []) as unknown[];
  if (!Array.isArray(deleted) || deleted.length === 0) {
    return json({ ok: false, marker: REELS_API_MARKER, error: `Reel ${reelId} not found.` }, 404);
  }
  return json({ ok: true, marker: REELS_API_MARKER, deleted: deleted[0], timestamp: new Date().toISOString() });
}

/* ────────────────────────── migration endpoints ────────────────────────── */

const MIGRATION_CONFIRM_HEADER = 'x-ivx-migration-confirm';
const MIGRATION_CONFIRM_VALUE = 'CONFIRM_REELS_MODULE_MIGRATION';

export async function handleReelsMigrationStatusRequest(): Promise<Response> {
  const { refreshReelsModuleMigrationVerification } = await import('../services/ivx-reels-module-migration');
  const migration = await refreshReelsModuleMigrationVerification();
  return json({ ok: true, marker: REELS_API_MARKER, migration, timestamp: new Date().toISOString() });
}

export async function handleReelsMigrationApplyRequest(request: Request): Promise<Response> {
  const confirm = request.headers.get(MIGRATION_CONFIRM_HEADER)?.trim() ?? '';
  if (confirm !== MIGRATION_CONFIRM_VALUE) {
    return json({
      ok: false,
      marker: REELS_API_MARKER,
      error: `Confirmation required. Send header ${MIGRATION_CONFIRM_HEADER}: ${MIGRATION_CONFIRM_VALUE}`,
      note: 'This endpoint only re-applies the fixed idempotent reels module migration; it never executes request-supplied SQL.',
    }, 409);
  }
  const { runReelsModuleMigration } = await import('../services/ivx-reels-module-migration');
  const migration = await runReelsModuleMigration();
  return json({
    ok: migration.status === 'applied',
    marker: REELS_API_MARKER,
    migration,
    timestamp: new Date().toISOString(),
  }, migration.status === 'applied' ? 200 : 502);
}
