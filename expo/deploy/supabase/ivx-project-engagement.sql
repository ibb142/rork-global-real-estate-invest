-- =============================================================================
-- IVX Project Engagement — Instagram-Style Cards
-- Idempotent. Safe to re-run.
--
-- Creates:
--   1. project_media — photos/videos linked to projects
--   2. project_videos — video-specific metadata
--   3. project_likes — user likes on projects
--   4. project_comments — user comments with replies
--   5. project_shares — share tracking
--   6. project_saves — user bookmarks
--   7. project_analytics — aggregated engagement analytics
-- =============================================================================

-- ---------- project_media --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  media_type      TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  url             TEXT NOT NULL,
  thumbnail_url   TEXT,
  cover_image_url TEXT,
  title           TEXT,
  description     TEXT,
  duration_sec    REAL,
  width           INTEGER,
  height          INTEGER,
  file_size_bytes BIGINT,
  position        INTEGER NOT NULL DEFAULT 0,
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved     BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_media_project_idx ON public.project_media (project_id, position);
CREATE INDEX IF NOT EXISTS project_media_type_idx ON public.project_media (project_id, media_type);
CREATE INDEX IF NOT EXISTS project_media_pinned_idx ON public.project_media (project_id, is_pinned) WHERE is_pinned = TRUE;

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_media_public_select ON public.project_media;
CREATE POLICY project_media_public_select
  ON public.project_media FOR SELECT
  USING (is_approved = TRUE);

DROP POLICY IF EXISTS project_media_owner_all ON public.project_media;
CREATE POLICY project_media_owner_all
  ON public.project_media FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- project_videos -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_videos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  media_id        UUID REFERENCES public.project_media(id) ON DELETE CASCADE,
  title           TEXT,
  video_url       TEXT NOT NULL,
  thumbnail_url   TEXT,
  cover_url       TEXT,
  duration_sec    REAL NOT NULL DEFAULT 0,
  width           INTEGER,
  height          INTEGER,
  orientation     TEXT CHECK (orientation IN ('portrait', 'landscape', 'square')) DEFAULT 'landscape',
  file_size_bytes BIGINT,
  mime_type       TEXT DEFAULT 'video/mp4',
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved     BOOLEAN NOT NULL DEFAULT TRUE,
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_videos_project_idx ON public.project_videos (project_id);
CREATE INDEX IF NOT EXISTS project_videos_approved_idx ON public.project_videos (project_id, is_approved) WHERE is_approved = TRUE;

ALTER TABLE public.project_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_videos_public_select ON public.project_videos;
CREATE POLICY project_videos_public_select
  ON public.project_videos FOR SELECT
  USING (is_approved = TRUE);

DROP POLICY IF EXISTS project_videos_owner_all ON public.project_videos;
CREATE POLICY project_videos_owner_all
  ON public.project_videos FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- project_likes --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_likes_unique UNIQUE (project_id, user_id),
  CONSTRAINT project_likes_user_or_guest CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL) OR
    (user_id IS NULL AND guest_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS project_likes_project_idx ON public.project_likes (project_id);
CREATE INDEX IF NOT EXISTS project_likes_user_idx ON public.project_likes (user_id);

ALTER TABLE public.project_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_likes_public_insert ON public.project_likes;
CREATE POLICY project_likes_public_insert
  ON public.project_likes FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS project_likes_public_delete ON public.project_likes;
CREATE POLICY project_likes_public_delete
  ON public.project_likes FOR DELETE
  USING (user_id = auth.uid() OR (guest_id IS NOT NULL AND guest_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'));

DROP POLICY IF EXISTS project_likes_public_select ON public.project_likes;
CREATE POLICY project_likes_public_select
  ON public.project_likes FOR SELECT
  USING (true);

-- ---------- project_comments ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_name      TEXT,
  parent_id       UUID REFERENCES public.project_comments(id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 2000),
  is_approved     BOOLEAN NOT NULL DEFAULT TRUE,
  is_owner_reply  BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_comments_project_idx ON public.project_comments (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_comments_parent_idx ON public.project_comments (parent_id);
CREATE INDEX IF NOT EXISTS project_comments_approved_idx ON public.project_comments (project_id, is_approved) WHERE is_approved = TRUE AND deleted_at IS NULL;

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_comments_public_select ON public.project_comments;
CREATE POLICY project_comments_public_select
  ON public.project_comments FOR SELECT
  USING (is_approved = TRUE AND deleted_at IS NULL);

DROP POLICY IF EXISTS project_comments_public_insert ON public.project_comments;
CREATE POLICY project_comments_public_insert
  ON public.project_comments FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS project_comments_owner_delete ON public.project_comments;
CREATE POLICY project_comments_owner_delete
  ON public.project_comments FOR UPDATE
  USING (user_id = auth.uid() OR public.ivx_is_owner())
  WITH CHECK (user_id = auth.uid() OR public.ivx_is_owner());

DROP POLICY IF EXISTS project_comments_admin_all ON public.project_comments;
CREATE POLICY project_comments_admin_all
  ON public.project_comments FOR ALL
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- ---------- project_shares --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_id    TEXT,
  share_type  TEXT NOT NULL CHECK (share_type IN ('copy_link', 'whatsapp', 'sms', 'email', 'social', 'referral', 'other')),
  share_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_shares_project_idx ON public.project_shares (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_shares_type_idx ON public.project_shares (project_id, share_type);

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_shares_public_insert ON public.project_shares;
CREATE POLICY project_shares_public_insert
  ON public.project_shares FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS project_shares_public_select ON public.project_shares;
CREATE POLICY project_shares_public_select
  ON public.project_shares FOR SELECT
  USING (true);

-- ---------- project_saves ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_saves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_saves_unique UNIQUE (project_id, user_id),
  CONSTRAINT project_saves_user_or_guest CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL) OR
    (user_id IS NULL AND guest_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS project_saves_project_idx ON public.project_saves (project_id);
CREATE INDEX IF NOT EXISTS project_saves_user_idx ON public.project_saves (user_id);

ALTER TABLE public.project_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_saves_public_insert ON public.project_saves;
CREATE POLICY project_saves_public_insert
  ON public.project_saves FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS project_saves_public_delete ON public.project_saves;
CREATE POLICY project_saves_public_delete
  ON public.project_saves FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS project_saves_public_select ON public.project_saves;
CREATE POLICY project_saves_public_select
  ON public.project_saves FOR SELECT
  USING (user_id = auth.uid() OR public.ivx_is_owner());

-- ---------- project_analytics -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  video_views     INTEGER NOT NULL DEFAULT 0,
  total_watch_sec REAL NOT NULL DEFAULT 0,
  like_count      INTEGER NOT NULL DEFAULT 0,
  comment_count   INTEGER NOT NULL DEFAULT 0,
  share_count     INTEGER NOT NULL DEFAULT 0,
  save_count      INTEGER NOT NULL DEFAULT 0,
  invest_clicks   INTEGER NOT NULL DEFAULT 0,
  lead_conversions INTEGER NOT NULL DEFAULT 0,
  detail_views    INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_analytics_unique UNIQUE (project_id, date)
);

CREATE INDEX IF NOT EXISTS project_analytics_project_idx ON public.project_analytics (project_id, date DESC);

ALTER TABLE public.project_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_analytics_owner_select ON public.project_analytics;
CREATE POLICY project_analytics_owner_select
  ON public.project_analytics FOR SELECT
  USING (public.ivx_is_owner());

-- ---------- Analytics helper: upsert daily ----------------------------------
CREATE OR REPLACE FUNCTION public.upsert_project_analytics(
  p_project_id UUID
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_likes INTEGER;
  v_comments INTEGER;
  v_shares INTEGER;
  v_saves INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_likes FROM public.project_likes WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_comments FROM public.project_comments WHERE project_id = p_project_id AND is_approved = TRUE AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_shares FROM public.project_shares WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_saves FROM public.project_saves WHERE project_id = p_project_id;

  INSERT INTO public.project_analytics (project_id, date, like_count, comment_count, share_count, save_count)
  VALUES (p_project_id, v_today, v_likes, v_comments, v_shares, v_saves)
  ON CONFLICT (project_id, date)
  DO UPDATE SET
    like_count    = EXCLUDED.like_count,
    comment_count = EXCLUDED.comment_count,
    share_count   = EXCLUDED.share_count,
    save_count    = EXCLUDED.save_count,
    updated_at    = NOW();
END;
$$;

-- ---------- Engagement view for project cards -------------------------------
CREATE OR REPLACE VIEW public.project_engagement AS
SELECT
  project_id,
  COUNT(DISTINCT l.id) FILTER (WHERE l.id IS NOT NULL) AS like_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL AND c.is_approved = TRUE AND c.deleted_at IS NULL) AS comment_count,
  COUNT(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL) AS share_count,
  COUNT(DISTINCT sv.id) FILTER (WHERE sv.id IS NOT NULL) AS save_count
FROM (SELECT DISTINCT project_id FROM public.project_media) pm
LEFT JOIN public.project_likes l ON l.project_id = pm.project_id
LEFT JOIN public.project_comments c ON c.project_id = pm.project_id
LEFT JOIN public.project_shares s ON s.project_id = pm.project_id
LEFT JOIN public.project_saves sv ON sv.project_id = pm.project_id
GROUP BY pm.project_id;

-- ---------- Add project_links for share URLs --------------------------------
CREATE TABLE IF NOT EXISTS public.project_referral_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL,
  referrer_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  short_code    TEXT NOT NULL UNIQUE,
  click_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_referral_short_code_idx ON public.project_referral_links (short_code);

ALTER TABLE public.project_referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_referral_public_select ON public.project_referral_links;
CREATE POLICY project_referral_public_select
  ON public.project_referral_links FOR SELECT
  USING (true);

DROP POLICY IF EXISTS project_referral_public_insert ON public.project_referral_links;
CREATE POLICY project_referral_public_insert
  ON public.project_referral_links FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);
