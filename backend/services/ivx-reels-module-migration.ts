/**
 * IVX Reels Module Migration (v2).
 *
 * Extends the canonical `jv_deal_reels` table into the full IVX Reels module:
 *   - reel_type + category_tags (investment / jv / buyer / seller / tokenized /
 *     construction / walkthrough / opportunity) so category chips filter one
 *     canonical source instead of separate hardcoded lists.
 *   - approved flag + typed business links (buyer_id, seller_id,
 *     tokenized_asset_id) alongside the existing project_id → jv_deals FK.
 *   - Real social tables (reel_likes / reel_saves / reel_comments) with
 *     public read RLS; writes only happen through the backend service role.
 *   - Seeds the 4 verified production category videos (walkthrough, seller,
 *     construction, investor-opportunity) that already live in production
 *     hosting (each URL + thumbnail verified HTTP 200 on 2026-07-11, deduped
 *     by ETag so no video appears twice).
 *   - ivx_reels_integrity view exposing per-category counts + orphan /
 *     duplicate checks for public QA evidence.
 *
 * Runs through the same `ivx_exec_sql(sql_text)` service-role RPC as the v1
 * canonical media migration. Idempotent: every statement is guarded.
 */
import { splitSqlStatements } from './ivx-canonical-media-migration';

const MIGRATION_ID = 'ivx-reels-module-v2';

export type ReelsModuleMigrationState = {
  migration: string;
  status: 'not_started' | 'running' | 'applied' | 'failed' | 'skipped_no_credentials';
  startedAt: string | null;
  finishedAt: string | null;
  statementsTotal: number;
  statementsApplied: number;
  error: string | null;
  lastVerification: {
    reelTypeColumnExists: boolean;
    reelLikesTableExists: boolean;
    publishedReels: number | null;
    checkedAt: string;
  } | null;
};

const state: ReelsModuleMigrationState = {
  migration: MIGRATION_ID,
  status: 'not_started',
  startedAt: null,
  finishedAt: null,
  statementsTotal: 0,
  statementsApplied: 0,
  error: null,
  lastVerification: null,
};

function getCredentials(): { url: string; serviceKey: string } | null {
  const url = (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '').trim();
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

/**
 * Production video seeds. Every URL was audited against `project_videos`
 * (approved rows only), deduplicated by HTTP ETag, and verified live with
 * its thumbnail before being added here. Captions are the exact production
 * titles — no invented content, no stock substitutions.
 */
export const REELS_MODULE_SEEDS = [
  {
    videoUrl: 'https://ivxholding.com/videos/original/c0725a70-497f-4332-8f9d-03a29036d270/modern_home_walkthrough.mp4',
    thumbnailUrl: 'https://ivxholding.com/videos/thumbs/c0725a70-497f-4332-8f9d-03a29036d270/thumb.jpg',
    caption: 'Modern Home Walkthrough — Buyer Tour',
    reelType: 'walkthrough',
    categoryTags: ['buyer'],
    sortOrder: 1,
  },
  {
    videoUrl: 'https://ivxholding.com/videos/original/376694f1-98b9-4c3e-88ac-f46abbc6f4f2/realtor_for_sale_sign.mp4',
    thumbnailUrl: 'https://ivxholding.com/videos/thumbs/376694f1-98b9-4c3e-88ac-f46abbc6f4f2/thumb.jpg',
    caption: 'New Listing Just Hit the Market — Realtor Spotlight',
    reelType: 'seller',
    categoryTags: [] as string[],
    sortOrder: 2,
  },
  {
    videoUrl: 'https://ivxholding.com/videos/original/89d9176d-0ce1-486e-8ab6-9908e1fc5d64/construction_framing_progress.mp4',
    thumbnailUrl: 'https://ivxholding.com/videos/thumbs/89d9176d-0ce1-486e-8ab6-9908e1fc5d64/thumb.jpg',
    caption: 'Framing Week 6 — Builder Progress Update',
    reelType: 'construction',
    categoryTags: [] as string[],
    sortOrder: 3,
  },
  {
    videoUrl: 'https://ivxholding.com/videos/original/ebef4cf0-1d31-4f60-87a3-293f77fbfcf6/waterfront_condo_sunset_drone.mp4',
    thumbnailUrl: 'https://ivxholding.com/videos/thumbs/ebef4cf0-1d31-4f60-87a3-293f77fbfcf6/thumb.jpg',
    caption: 'Waterfront Tower — Investor Opportunity',
    reelType: 'opportunity',
    categoryTags: [] as string[],
    sortOrder: 4,
  },
] as const;

function seedInsertSql(seed: (typeof REELS_MODULE_SEEDS)[number]): string {
  const tags = seed.categoryTags.length > 0
    ? `ARRAY[${seed.categoryTags.map((t) => `'${t}'`).join(', ')}]::TEXT[]`
    : `'{}'::TEXT[]`;
  return `
INSERT INTO public.jv_deal_reels
  (project_id, video_url, thumbnail_url, caption, sort_order, published, visibility, is_global, reel_type, category_tags, approved)
SELECT NULL,
       '${seed.videoUrl}',
       '${seed.thumbnailUrl}',
       '${seed.caption.replace(/'/g, "''")}',
       ${seed.sortOrder}, TRUE, 'public', TRUE, '${seed.reelType}', ${tags}, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.jv_deal_reels WHERE video_url = '${seed.videoUrl}'
)`;
}

export const REELS_MODULE_MIGRATION_SQL = `
-- ---------- backup snapshot BEFORE any change --------------------------------
CREATE TABLE IF NOT EXISTS public.ivx_migration_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration TEXT NOT NULL,
  entity TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ivx_migration_backups (migration, entity, snapshot)
SELECT '${MIGRATION_ID}', 'jv_deal_reels', COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
FROM public.jv_deal_reels r
WHERE NOT EXISTS (
  SELECT 1 FROM public.ivx_migration_backups b
  WHERE b.migration = '${MIGRATION_ID}' AND b.entity = 'jv_deal_reels'
);

-- ---------- reel categories + typed business links ---------------------------
ALTER TABLE public.jv_deal_reels ADD COLUMN IF NOT EXISTS reel_type TEXT NOT NULL DEFAULT 'investment';
ALTER TABLE public.jv_deal_reels ADD COLUMN IF NOT EXISTS category_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.jv_deal_reels ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.jv_deal_reels ADD COLUMN IF NOT EXISTS buyer_id UUID;
ALTER TABLE public.jv_deal_reels ADD COLUMN IF NOT EXISTS seller_id UUID;
ALTER TABLE public.jv_deal_reels ADD COLUMN IF NOT EXISTS tokenized_asset_id UUID;

DO $ivx$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jv_deal_reels_reel_type_check'
  ) THEN
    ALTER TABLE public.jv_deal_reels ADD CONSTRAINT jv_deal_reels_reel_type_check
      CHECK (reel_type IN ('investment','jv','buyer','seller','tokenized','construction','walkthrough','opportunity'));
  END IF;
END
$ivx$;

CREATE INDEX IF NOT EXISTS jv_deal_reels_type_idx
  ON public.jv_deal_reels (reel_type, published, approved);

-- Public read now also requires owner approval.
DROP POLICY IF EXISTS jv_deal_reels_public_select ON public.jv_deal_reels;
CREATE POLICY jv_deal_reels_public_select
  ON public.jv_deal_reels FOR SELECT
  USING (published = TRUE AND approved = TRUE AND visibility IN ('public', 'global'));

-- ---------- social tables (public read; writes only via backend service role)
CREATE TABLE IF NOT EXISTS public.reel_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.jv_deal_reels(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL CHECK (char_length(device_key) BETWEEN 8 AND 128),
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reel_likes_unique_device UNIQUE (reel_id, device_key)
);

CREATE INDEX IF NOT EXISTS reel_likes_reel_idx ON public.reel_likes (reel_id);
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reel_likes_public_select ON public.reel_likes;
CREATE POLICY reel_likes_public_select ON public.reel_likes FOR SELECT USING (TRUE);

CREATE TABLE IF NOT EXISTS public.reel_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.jv_deal_reels(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL CHECK (char_length(device_key) BETWEEN 8 AND 128),
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reel_saves_unique_device UNIQUE (reel_id, device_key)
);

CREATE INDEX IF NOT EXISTS reel_saves_reel_idx ON public.reel_saves (reel_id);
ALTER TABLE public.reel_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reel_saves_public_select ON public.reel_saves;
CREATE POLICY reel_saves_public_select ON public.reel_saves FOR SELECT USING (TRUE);

CREATE TABLE IF NOT EXISTS public.reel_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES public.jv_deal_reels(id) ON DELETE CASCADE,
  device_key TEXT NOT NULL CHECK (char_length(device_key) BETWEEN 8 AND 128),
  user_id UUID,
  author_name TEXT NOT NULL DEFAULT 'Guest' CHECK (char_length(author_name) BETWEEN 1 AND 60),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  approved BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reel_comments_reel_idx ON public.reel_comments (reel_id, created_at DESC);
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reel_comments_public_select ON public.reel_comments;
CREATE POLICY reel_comments_public_select ON public.reel_comments FOR SELECT USING (approved = TRUE);

-- ---------- seed verified production category reels (idempotent by URL) ------
${REELS_MODULE_SEEDS.map(seedInsertSql).join(';\n')};

-- Project-linked reels are investment reels by definition.
UPDATE public.jv_deal_reels
SET reel_type = 'investment'
WHERE project_id IS NOT NULL AND reel_type NOT IN ('investment');

-- ---------- integrity + category-count view (public QA evidence) -------------
CREATE OR REPLACE VIEW public.ivx_reels_integrity AS
SELECT
  (SELECT count(*) FROM public.jv_deal_reels)                                             AS total_reels,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global'))                  AS all_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (project_id IS NOT NULL OR reel_type = 'investment'
            OR 'investment' = ANY(category_tags)))                                       AS investment_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (reel_type = 'buyer' OR 'buyer' = ANY(category_tags) OR buyer_id IS NOT NULL)) AS buyer_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (reel_type = 'seller' OR 'seller' = ANY(category_tags) OR seller_id IS NOT NULL)) AS seller_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (project_id IS NOT NULL OR reel_type = 'jv' OR 'jv' = ANY(category_tags)))    AS jv_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (reel_type = 'tokenized' OR 'tokenized' = ANY(category_tags)
            OR tokenized_asset_id IS NOT NULL))                                          AS tokenized_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (reel_type = 'construction' OR 'construction' = ANY(category_tags)))          AS construction_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (reel_type = 'walkthrough' OR 'walkthrough' = ANY(category_tags)))            AS walkthrough_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels
     WHERE published AND approved AND visibility IN ('public','global')
       AND (reel_type = 'opportunity' OR 'opportunity' = ANY(category_tags)))            AS opportunity_reels_count,
  (SELECT count(*) FROM public.jv_deal_reels r
     WHERE r.project_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.jv_deals d WHERE d.id = r.project_id))       AS orphan_reels,
  (SELECT count(*) FROM (
     SELECT video_url FROM public.jv_deal_reels GROUP BY video_url HAVING count(*) > 1) dup) AS duplicate_reels,
  (SELECT count(*) FROM (
     SELECT video_url FROM public.jv_deal_reels WHERE project_id IS NOT NULL
     GROUP BY video_url HAVING count(DISTINCT project_id) > 1) cross_p)                  AS cross_project_reels;

GRANT SELECT ON public.ivx_reels_integrity TO anon, authenticated;
`;

async function execSql(url: string, serviceKey: string, sqlText: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const response = await fetch(`${url}/rest/v1/rpc/ivx_exec_sql`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql_text: sqlText }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return { ok: true, error: null };
    const text = await response.text().catch(() => '');
    return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 400)}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'exec_sql request failed' };
  }
}

async function verify(url: string, serviceKey: string): Promise<void> {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  let reelTypeColumnExists = false;
  let reelLikesTableExists = false;
  let publishedReels: number | null = null;
  try {
    const res = await fetch(`${url}/rest/v1/jv_deal_reels?select=id,reel_type&limit=1`, { headers, signal: AbortSignal.timeout(15_000) });
    reelTypeColumnExists = res.ok;
  } catch { /* verification is best-effort */ }
  try {
    const res = await fetch(`${url}/rest/v1/reel_likes?select=id&limit=1`, { headers, signal: AbortSignal.timeout(15_000) });
    reelLikesTableExists = res.ok;
  } catch { /* best-effort */ }
  try {
    const res = await fetch(`${url}/rest/v1/jv_deal_reels?select=id&published=eq.true&limit=1`, {
      method: 'HEAD',
      headers: { ...headers, Prefer: 'count=exact' },
      signal: AbortSignal.timeout(15_000),
    });
    const range = res.headers.get('content-range') ?? '';
    const total = Number(range.split('/')[1]);
    publishedReels = Number.isFinite(total) ? total : null;
  } catch { /* best-effort */ }
  state.lastVerification = {
    reelTypeColumnExists,
    reelLikesTableExists,
    publishedReels,
    checkedAt: new Date().toISOString(),
  };
}

/** Apply the reels module migration. Idempotent; safe to call repeatedly. */
export async function runReelsModuleMigration(): Promise<ReelsModuleMigrationState> {
  if (state.status === 'running') return getReelsModuleMigrationState();

  const credentials = getCredentials();
  if (!credentials) {
    state.status = 'skipped_no_credentials';
    state.error = 'SUPABASE_SERVICE_ROLE_KEY is not bound in this runtime.';
    return getReelsModuleMigrationState();
  }

  const statements = splitSqlStatements(REELS_MODULE_MIGRATION_SQL);
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.statementsTotal = statements.length;
  state.statementsApplied = 0;
  state.error = null;

  console.log('[IVXReelsMigration] applying', { migration: MIGRATION_ID, statements: statements.length });

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] ?? '';
    const result = await execSql(credentials.url, credentials.serviceKey, statement);
    if (!result.ok) {
      state.status = 'failed';
      state.finishedAt = new Date().toISOString();
      state.error = `Statement ${i + 1}/${statements.length} failed: ${result.error}`;
      console.log('[IVXReelsMigration] FAILED', { step: i + 1, error: result.error });
      await verify(credentials.url, credentials.serviceKey);
      return getReelsModuleMigrationState();
    }
    state.statementsApplied = i + 1;
  }

  state.status = 'applied';
  state.finishedAt = new Date().toISOString();
  await verify(credentials.url, credentials.serviceKey);
  console.log('[IVXReelsMigration] applied', {
    migration: MIGRATION_ID,
    statements: statements.length,
    verification: state.lastVerification,
  });
  return getReelsModuleMigrationState();
}

/** Refresh live verification without re-running the migration. */
export async function refreshReelsModuleMigrationVerification(): Promise<ReelsModuleMigrationState> {
  const credentials = getCredentials();
  if (credentials) await verify(credentials.url, credentials.serviceKey);
  return getReelsModuleMigrationState();
}

export function getReelsModuleMigrationState(): ReelsModuleMigrationState {
  return { ...state, lastVerification: state.lastVerification ? { ...state.lastVerification } : null };
}

/** Boot hook: apply once at startup without blocking server start. */
export function scheduleReelsModuleMigrationAtBoot(): void {
  setTimeout(() => {
    runReelsModuleMigration().catch((error) => {
      console.log('[IVXReelsMigration] boot run crashed:', error instanceof Error ? error.message : 'unknown');
    });
  }, 6_000);
}
