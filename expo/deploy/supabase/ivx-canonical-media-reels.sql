-- ============================================================================
-- IVX CANONICAL PROJECT MEDIA + REELS (one source of truth)
-- ============================================================================
-- Root cause being fixed:
--   * jv_deals uses TEXT ids ('perez-residence-001', 'casa-rosario-001',
--     'JV-202603-5190') but project_media / project_videos use UUID
--     project_id columns — so NO media/video row can reference a real deal.
--     All 14 project_media rows and all project_videos rows are orphans.
--   * Frontends compensated with hardcoded, title-matched fallback photo
--     arrays in which Perez Residence was assigned Casa Rosario's photos.
--
-- This migration creates media/reels tables keyed to jv_deals(id) with real
-- foreign keys, integrity constraints, and an integrity view. Run in the
-- Supabase SQL editor with service-role privileges.
-- ============================================================================

-- ---------- jv_deal_media ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jv_deal_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL REFERENCES public.jv_deals(id) ON DELETE CASCADE,
  media_type    TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  public_url    TEXT NOT NULL CHECK (public_url ~* '^https://'),
  storage_path  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_cover      BOOLEAN NOT NULL DEFAULT FALSE,
  is_shared     BOOLEAN NOT NULL DEFAULT FALSE, -- explicit cross-project reuse only
  published     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only ONE cover image per project.
CREATE UNIQUE INDEX IF NOT EXISTS jv_deal_media_one_cover_per_project
  ON public.jv_deal_media (project_id) WHERE is_cover = TRUE;

-- A non-shared media URL may belong to only ONE project.
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
  video_url      TEXT NOT NULL CHECK (video_url ~* '^https://.+\.(mp4|mov|m4v|webm)(\?.*)?$'),
  storage_path   TEXT,
  thumbnail_url  TEXT,
  caption        TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  published      BOOLEAN NOT NULL DEFAULT FALSE,
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'global')),
  is_global      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Every reel belongs to an existing project OR is explicitly global.
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

-- ---------- unique slug guard on jv_deals -----------------------------------
-- jv_deals.id IS the slug. Enforce uniqueness explicitly (PK already does) and
-- prevent duplicate display_order collisions from producing unstable ordering.
CREATE UNIQUE INDEX IF NOT EXISTS jv_deals_unique_id_slug ON public.jv_deals (id);

-- ---------- updated_at triggers ----------------------------------------------
CREATE OR REPLACE FUNCTION public.ivx_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jv_deal_media_touch ON public.jv_deal_media;
CREATE TRIGGER jv_deal_media_touch BEFORE UPDATE ON public.jv_deal_media
  FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();

DROP TRIGGER IF EXISTS jv_deal_reels_touch ON public.jv_deal_reels;
CREATE TRIGGER jv_deal_reels_touch BEFORE UPDATE ON public.jv_deal_reels
  FOR EACH ROW EXECUTE FUNCTION public.ivx_touch_updated_at();

-- ---------- DATA CORRECTIONS -------------------------------------------------
-- 1. Casa Rosario currently has ZERO photos in jv_deals.photos; frontends were
--    papering over it with hardcoded arrays. Persist the verified Casa Rosario
--    photo set into the canonical row so every surface reads the same media.
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

-- 2. Fix duplicate display_order (Perez=1 AND Casa=1 today).
UPDATE public.jv_deals SET display_order = 2, updated_at = now()
WHERE id = 'casa-rosario-001' AND display_order = 1;

-- 3. Remove the embedded base64 data-URI photo from IVX Jacksonville Prime
--    (breaks payload sizes; storage URLs remain).
UPDATE public.jv_deals
SET photos = (
  SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
  FROM jsonb_array_elements_text(photos) AS p
  WHERE p NOT LIKE 'data:image/%'
), updated_at = now()
WHERE id = 'JV-202603-5190';

-- 4. Quarantine orphan test rows in legacy project_media (example.com URLs and
--    placeholder UUID project ids). Rows are unapproved, not deleted, so no
--    storage files are lost.
UPDATE public.project_media SET is_approved = FALSE
WHERE project_id::text = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
   OR media_url LIKE 'https://example.com/%';

-- 5. RESTORE THE LANDING REEL. The Casa Rosario property tour video is live in
--    production hosting (verified HTTP 200 on video, thumb, and poster on
--    2026-07-11) but its project_videos row is unapproved and orphaned
--    (project_id is a self-referencing UUID that cannot match jv_deals.id).
--    Seed it into the canonical reels table, correctly linked to
--    casa-rosario-001, so the landing reels section renders it.
INSERT INTO public.jv_deal_reels (project_id, video_url, thumbnail_url, caption, sort_order, published, visibility)
SELECT 'casa-rosario-001',
       'https://ivxholding.com/videos/original/b8788d0c-0558-43fb-a3dd-4ccdc6f441c8/casa-rosario.mp4',
       'https://ivxholding.com/videos/thumbs/b8788d0c-0558-43fb-a3dd-4ccdc6f441c8/thumb.jpg',
       'Casa Rosario — Property Tour',
       0, TRUE, 'public'
WHERE NOT EXISTS (
  SELECT 1 FROM public.jv_deal_reels
  WHERE video_url = 'https://ivxholding.com/videos/original/b8788d0c-0558-43fb-a3dd-4ccdc6f441c8/casa-rosario.mp4'
);

-- ---------- INTEGRITY VIEW ----------------------------------------------------
CREATE OR REPLACE VIEW public.ivx_project_integrity AS
SELECT
  (SELECT count(*) FROM public.jv_deals)                                              AS project_count,
  (SELECT count(*) FROM public.jv_deals WHERE published = TRUE)                       AS published_project_count,
  (SELECT count(*) FROM public.jv_deal_media)                                         AS canonical_media_count,
  (SELECT count(*) FROM public.jv_deal_reels)                                         AS canonical_reel_count,
  (SELECT count(*) FROM public.jv_deal_reels WHERE published = TRUE)                  AS published_reel_count,
  (SELECT count(*) FROM public.project_media pm
     WHERE NOT EXISTS (SELECT 1 FROM public.jv_deals d WHERE d.id = pm.project_id::text)) AS legacy_orphan_media_count,
  (SELECT count(*) FROM public.project_videos pv
     WHERE NOT EXISTS (SELECT 1 FROM public.jv_deals d WHERE d.id = pv.project_id::text)) AS legacy_orphan_video_count,
  (SELECT count(*) FROM (
     SELECT display_order FROM public.jv_deals WHERE display_order IS NOT NULL
     GROUP BY display_order HAVING count(*) > 1) dup)                                 AS duplicate_display_order_count,
  (SELECT count(*) FROM public.jv_deals
     WHERE published = TRUE AND (photos IS NULL OR photos::text IN ('[]', 'null')))   AS published_projects_without_photos;

GRANT SELECT ON public.ivx_project_integrity TO anon, authenticated;
