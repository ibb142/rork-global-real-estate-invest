/**
 * IVX Canonical Media + Reels Migration Runner.
 *
 * Applies the `jv_deal_media` / `jv_deal_reels` production migration through
 * the backend's own service-role runtime (the only credential allowed to run
 * privileged DDL) via the existing `ivx_exec_sql(sql_text)` RPC.
 *
 * Safety model:
 *   - The SQL is a fixed, embedded, idempotent script — nothing in a request
 *     can inject arbitrary SQL.
 *   - An in-database backup snapshot (ivx_migration_backups) of jv_deals,
 *     project_media and project_videos is written BEFORE any data correction.
 *   - Every statement uses IF NOT EXISTS / WHERE guards, so re-running is a
 *     no-op.
 *   - Runs automatically at boot; POST /api/ivx/media-migration/apply can
 *     retry it with an explicit confirm header.
 */

const MIGRATION_ID = 'ivx-canonical-media-reels-v1';

export type MediaMigrationState = {
  migration: string;
  status: 'not_started' | 'running' | 'applied' | 'failed' | 'skipped_no_credentials';
  startedAt: string | null;
  finishedAt: string | null;
  statementsTotal: number;
  statementsApplied: number;
  error: string | null;
  lastVerification: {
    jvDealMediaExists: boolean;
    jvDealReelsExists: boolean;
    mediaRows: number | null;
    reelRows: number | null;
    checkedAt: string;
  } | null;
};

const state: MediaMigrationState = {
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
 * The complete migration. Statement order matters:
 * backups first, then DDL, then RLS, then guarded data corrections/backfill.
 */
export const CANONICAL_MEDIA_MIGRATION_SQL = `
-- ---------- backup table (service-role only; written BEFORE any mutation) ---
CREATE TABLE IF NOT EXISTS public.ivx_migration_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration TEXT NOT NULL,
  entity TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ivx_migration_backups ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ivx_migration_backups (migration, entity, snapshot)
SELECT '${MIGRATION_ID}', 'jv_deals', COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
FROM public.jv_deals d
WHERE NOT EXISTS (
  SELECT 1 FROM public.ivx_migration_backups b
  WHERE b.migration = '${MIGRATION_ID}' AND b.entity = 'jv_deals'
);

INSERT INTO public.ivx_migration_backups (migration, entity, snapshot)
SELECT '${MIGRATION_ID}', 'project_media', COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
FROM public.project_media m
WHERE NOT EXISTS (
  SELECT 1 FROM public.ivx_migration_backups b
  WHERE b.migration = '${MIGRATION_ID}' AND b.entity = 'project_media'
);

INSERT INTO public.ivx_migration_backups (migration, entity, snapshot)
SELECT '${MIGRATION_ID}', 'project_videos', COALESCE(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
FROM public.project_videos v
WHERE NOT EXISTS (
  SELECT 1 FROM public.ivx_migration_backups b
  WHERE b.migration = '${MIGRATION_ID}' AND b.entity = 'project_videos'
);

-- ---------- jv_deal_media ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jv_deal_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES public.jv_deals(id) ON DELETE CASCADE,
  media_type    TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  public_url    TEXT NOT NULL CHECK (public_url ~* '^https://'),
  storage_path  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_cover      BOOLEAN NOT NULL DEFAULT FALSE,
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE,
  published     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jv_deal_media_one_cover_per_project
  ON public.jv_deal_media (project_id) WHERE is_cover = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS jv_deal_media_unique_url_per_project
  ON public.jv_deal_media (public_url) WHERE is_shared = FALSE;

CREATE INDEX IF NOT EXISTS jv_deal_media_project_order_idx
  ON public.jv_deal_media (project_id, sort_order);

ALTER TABLE public.jv_deal_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jv_deal_media_public_select ON public.jv_deal_media;
CREATE POLICY jv_deal_media_public_select
  ON public.jv_deal_media FOR SELECT USING (published = TRUE);

-- ---------- jv_deal_reels ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jv_deal_reels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     TEXT REFERENCES public.jv_deals(id) ON DELETE CASCADE,
  video_url      TEXT NOT NULL CHECK (video_url ~* '^https://.+\\.(mp4|mov|m4v|webm)(\\?.*)?$'),
  storage_path   TEXT,
  thumbnail_url  TEXT,
  caption        TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published      BOOLEAN NOT NULL DEFAULT FALSE,
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'global')),
  is_global      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jv_deal_reels_project_or_global
    CHECK (project_id IS NOT NULL OR is_global = TRUE)
);

CREATE UNIQUE INDEX IF NOT EXISTS jv_deal_reels_unique_video_url
  ON public.jv_deal_reels (video_url);

CREATE INDEX IF NOT EXISTS jv_deal_reels_project_order_idx
  ON public.jv_deal_reels (project_id, sort_order, created_at DESC);

ALTER TABLE public.jv_deal_reels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jv_deal_reels_public_select ON public.jv_deal_reels;
CREATE POLICY jv_deal_reels_public_select
  ON public.jv_deal_reels FOR SELECT USING (published = TRUE AND visibility IN ('public', 'global'));

-- ---------- unique slug guard + updated_at triggers -------------------------
CREATE UNIQUE INDEX IF NOT EXISTS jv_deals_unique_id_slug ON public.jv_deals (id);

CREATE OR REPLACE FUNCTION public.ivx_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jv_deal_media_touch ON public.jv_deal_media;
CREATE TRIGGER jv_deal_media_touch BEFORE UPDATE ON public.jv_deal_media
  FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();

DROP TRIGGER IF EXISTS jv_deal_reels_touch ON public.jv_deal_reels;
CREATE TRIGGER jv_deal_reels_touch BEFORE UPDATE ON public.jv_deal_reels
  FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();

-- ---------- DATA CORRECTIONS (all guarded / idempotent) ----------------------
UPDATE public.jv_deals
SET photos = '[
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/junpisw15h6borglpbckz",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/2s8bcg6npyx96xcfrr5rm",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t8rc86kynbs64jopcujtf",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/bxqj57n0z60oqoxaqvnlo",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/idr3twi8x1q8skiyl9sm7",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/q28qwxwmig7m8qr5m83jh",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/p6gks5os79lycfghdkupz",
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/g9g9wbb8r1epd4hc9qifl"
]'::jsonb,
    updated_at = now()
WHERE id = 'casa-rosario-001'
  AND (photos IS NULL OR photos::text = '[]' OR photos::text = 'null');

UPDATE public.jv_deals SET display_order = 2, updated_at = now()
WHERE id = 'casa-rosario-001' AND display_order = 1
  AND EXISTS (SELECT 1 FROM public.jv_deals WHERE id <> 'casa-rosario-001' AND display_order = 1);

UPDATE public.jv_deals
SET photos = (
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
  FROM jsonb_array_elements_text(photos) AS p
  WHERE p NOT LIKE 'data:image/%'
), updated_at = now()
WHERE id = 'JV-202603-5190'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(photos) AS p WHERE p LIKE 'data:image/%'
  );

UPDATE public.project_media SET is_approved = FALSE
WHERE (project_id::text = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   OR media_url LIKE 'https://example.com/%')
  AND is_approved = TRUE;

-- ---------- CANONICAL BACKFILL ------------------------------------------------
-- Media: one canonical row per photo in every deal's verified photo set.
INSERT INTO public.jv_deal_media (project_id, media_type, public_url, sort_order, published)
SELECT DISTINCT ON (p.url) d.id, 'image', p.url, p.ord - 1, TRUE
FROM public.jv_deals d,
     LATERAL jsonb_array_elements_text(COALESCE(d.photos, '[]'::jsonb)) WITH ORDINALITY AS p(url, ord)
WHERE p.url ~* '^https://'
  AND NOT EXISTS (SELECT 1 FROM public.jv_deal_media m WHERE m.public_url = p.url)
ORDER BY p.url, d.id, p.ord;

-- Exactly one cover per project: first gallery image when none is set.
UPDATE public.jv_deal_media m SET is_cover = TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.jv_deal_media c
    WHERE c.project_id = m.project_id AND c.is_cover = TRUE
  )
  AND m.id = (
    SELECT x.id FROM public.jv_deal_media x
    WHERE x.project_id = m.project_id
    ORDER BY x.sort_order, x.created_at
    LIMIT 1
  );

-- Reels: seed the verified Casa Rosario property tour, correctly linked.
INSERT INTO public.jv_deal_reels (project_id, video_url, thumbnail_url, caption, sort_order, published, visibility)
SELECT 'casa-rosario-001',
       'https://ivxholding.com/videos/original/b8788d0c-0558-43fb-a3dd-4ccdc6f441c8/casa-rosario.mp4',
       'https://ivxholding.com/videos/thumbs/b8788d0c-0558-43fb-a3dd-4ccdc6f441c8/thumb.jpg',
       'Casa Rosario — Property Tour',
       0, TRUE, 'public'
WHERE EXISTS (SELECT 1 FROM public.jv_deals WHERE id = 'casa-rosario-001')
  AND NOT EXISTS (
    SELECT 1 FROM public.jv_deal_reels
    WHERE video_url = 'https://ivxholding.com/videos/original/b8788d0c-0558-43fb-a3dd-4ccdc6f441c8/casa-rosario.mp4'
  );

-- ---------- INTEGRITY VIEW ----------------------------------------------------
CREATE OR REPLACE VIEW public.ivx_project_integrity AS
SELECT
  (SELECT count(*) FROM public.jv_deals)                                              AS project_count,
  (SELECT count(*) FROM public.jv_deal_media)                                         AS canonical_media_count,
  (SELECT count(*) FROM public.jv_deal_media WHERE is_cover = TRUE)                   AS cover_image_count,
  (SELECT count(*) FROM public.jv_deal_reels)                                         AS canonical_reel_count,
  (SELECT count(*) FROM public.jv_deal_reels WHERE published = TRUE)                  AS published_reel_count,
  (SELECT count(*) FROM public.jv_deal_media m
     WHERE NOT EXISTS (SELECT 1 FROM public.jv_deals d WHERE d.id = m.project_id))    AS orphan_media_count,
  (SELECT count(*) FROM public.jv_deal_reels r
     WHERE r.project_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.jv_deals d WHERE d.id = r.project_id))    AS orphan_reel_count,
  (SELECT count(*) FROM (
     SELECT public_url FROM public.jv_deal_media WHERE is_shared = FALSE
     GROUP BY public_url HAVING count(*) > 1) dup)                                    AS duplicate_media_count,
  (SELECT count(*) FROM (
     SELECT display_order FROM public.jv_deals WHERE display_order IS NOT NULL
     GROUP BY display_order HAVING count(*) > 1) dup)                                 AS duplicate_display_order_count;

GRANT SELECT ON public.ivx_project_integrity TO anon, authenticated;
`;

function readDollarQuoteTag(sql: string, index: number): string | null {
  const rest = sql.slice(index);
  const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
  return match?.[0] ?? null;
}

/** Split a SQL script into statements, respecting quotes, comments, $$ bodies. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag: string | null = null;

  while (index < sql.length) {
    const char = sql[index] ?? '';
    const nextChar = sql[index + 1] ?? '';

    if (inLineComment) {
      current += char;
      index += 1;
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        current += '*/';
        index += 2;
        inBlockComment = false;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }
    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length;
        dollarQuoteTag = null;
        continue;
      }
      current += char;
      index += 1;
      continue;
    }
    if (inSingleQuote) {
      current += char;
      index += 1;
      if (char === "'" && nextChar === "'") {
        current += nextChar;
        index += 1;
        continue;
      }
      if (char === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      current += char;
      index += 1;
      if (char === '"') inDoubleQuote = false;
      continue;
    }
    if (char === '-' && nextChar === '-') {
      current += '--';
      index += 2;
      inLineComment = true;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      current += '/*';
      index += 2;
      inBlockComment = true;
      continue;
    }
    if (char === "'") {
      current += char;
      index += 1;
      inSingleQuote = true;
      continue;
    }
    if (char === '"') {
      current += char;
      index += 1;
      inDoubleQuote = true;
      continue;
    }
    if (char === '$') {
      const tag = readDollarQuoteTag(sql, index);
      if (tag) {
        current += tag;
        index += tag.length;
        dollarQuoteTag = tag;
        continue;
      }
    }
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }

  const finalStatement = current.trim();
  if (finalStatement.length > 0) statements.push(finalStatement);
  return statements;
}

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

async function countRows(url: string, serviceKey: string, table: string): Promise<{ exists: boolean; rows: number | null }> {
  try {
    const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
      method: 'HEAD',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'count=exact',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { exists: false, rows: null };
    const range = response.headers.get('content-range') ?? '';
    const total = Number(range.split('/')[1]);
    return { exists: true, rows: Number.isFinite(total) ? total : null };
  } catch {
    return { exists: false, rows: null };
  }
}

async function verifyTables(url: string, serviceKey: string): Promise<void> {
  const [media, reels] = await Promise.all([
    countRows(url, serviceKey, 'jv_deal_media'),
    countRows(url, serviceKey, 'jv_deal_reels'),
  ]);
  state.lastVerification = {
    jvDealMediaExists: media.exists,
    jvDealReelsExists: reels.exists,
    mediaRows: media.rows,
    reelRows: reels.rows,
    checkedAt: new Date().toISOString(),
  };
}

/** Apply the migration. Idempotent; safe to call repeatedly. */
export async function runCanonicalMediaMigration(): Promise<MediaMigrationState> {
  if (state.status === 'running') return getMediaMigrationState();

  const credentials = getCredentials();
  if (!credentials) {
    state.status = 'skipped_no_credentials';
    state.error = 'SUPABASE_SERVICE_ROLE_KEY is not bound in this runtime.';
    return getMediaMigrationState();
  }

  const statements = splitSqlStatements(CANONICAL_MEDIA_MIGRATION_SQL);
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.statementsTotal = statements.length;
  state.statementsApplied = 0;
  state.error = null;

  console.log('[IVXMediaMigration] applying', { migration: MIGRATION_ID, statements: statements.length });

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] ?? '';
    const result = await execSql(credentials.url, credentials.serviceKey, statement);
    if (!result.ok) {
      state.status = 'failed';
      state.finishedAt = new Date().toISOString();
      state.error = `Statement ${i + 1}/${statements.length} failed: ${result.error}`;
      console.log('[IVXMediaMigration] FAILED', { step: i + 1, error: result.error });
      await verifyTables(credentials.url, credentials.serviceKey);
      return getMediaMigrationState();
    }
    state.statementsApplied = i + 1;
  }

  state.status = 'applied';
  state.finishedAt = new Date().toISOString();
  await verifyTables(credentials.url, credentials.serviceKey);
  console.log('[IVXMediaMigration] applied', {
    migration: MIGRATION_ID,
    statements: statements.length,
    verification: state.lastVerification,
  });
  return getMediaMigrationState();
}

/** Refresh live table verification without re-running the migration. */
export async function refreshMediaMigrationVerification(): Promise<MediaMigrationState> {
  const credentials = getCredentials();
  if (credentials) await verifyTables(credentials.url, credentials.serviceKey);
  return getMediaMigrationState();
}

export function getMediaMigrationState(): MediaMigrationState {
  return { ...state, lastVerification: state.lastVerification ? { ...state.lastVerification } : null };
}

/** Boot hook: apply once at startup without blocking server start. */
export function scheduleCanonicalMediaMigrationAtBoot(): void {
  setTimeout(() => {
    runCanonicalMediaMigration().catch((error) => {
      console.log('[IVXMediaMigration] boot run crashed:', error instanceof Error ? error.message : 'unknown');
    });
  }, 3_000);
}
