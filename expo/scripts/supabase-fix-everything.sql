-- ============================================================
-- IVX SUPABASE FIX-EVERYTHING SCRIPT
-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run: uses CREATE IF NOT EXISTS everywhere
-- Fixes: 9 missing tables, 2 broken RPCs, 0 storage buckets
-- ============================================================

-- ============================================================
-- 0. PREREQUISITES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.ivx_is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $ivx$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g') IN ('owner', 'owneradmin')
    );
$ivx$;

-- ============================================================
-- 1. MISSING TABLE: visitor_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.visitor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  country TEXT,
  city TEXT,
  device_type TEXT,
  page_path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  is_active BOOLEAN DEFAULT true,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='visitor_sessions_anon_insert' AND tablename='visitor_sessions') THEN
    CREATE POLICY "visitor_sessions_anon_insert" ON public.visitor_sessions FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='visitor_sessions_auth_select' AND tablename='visitor_sessions') THEN
    CREATE POLICY "visitor_sessions_auth_select" ON public.visitor_sessions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='visitor_sessions_auth_insert' AND tablename='visitor_sessions') THEN
    CREATE POLICY "visitor_sessions_auth_insert" ON public.visitor_sessions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='visitor_sessions_session_id_key') THEN
    ALTER TABLE public.visitor_sessions ADD CONSTRAINT visitor_sessions_session_id_key UNIQUE (session_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. MISSING TABLE: realtime_snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.realtime_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type TEXT DEFAULT 'visitor',
  data JSONB DEFAULT '{}'::jsonb,
  active_visitors INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.realtime_snapshots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='realtime_snapshots_auth_select' AND tablename='realtime_snapshots') THEN
    CREATE POLICY "realtime_snapshots_auth_select" ON public.realtime_snapshots FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='realtime_snapshots_auth_insert' AND tablename='realtime_snapshots') THEN
    CREATE POLICY "realtime_snapshots_auth_insert" ON public.realtime_snapshots FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_snapshots; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3. MISSING TABLE: image_registry
-- ============================================================
CREATE TABLE IF NOT EXISTS public.image_registry (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  user_id UUID,
  is_protected BOOLEAN DEFAULT false,
  storage_path TEXT,
  backup_urls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.image_registry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='image_registry_select_all' AND tablename='image_registry') THEN
    CREATE POLICY "image_registry_select_all" ON public.image_registry FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='image_registry_insert_auth' AND tablename='image_registry') THEN
    CREATE POLICY "image_registry_insert_auth" ON public.image_registry FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='image_registry_update_auth' AND tablename='image_registry') THEN
    CREATE POLICY "image_registry_update_auth" ON public.image_registry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='image_registry_delete_auth' AND tablename='image_registry') THEN
    CREATE POLICY "image_registry_delete_auth" ON public.image_registry FOR DELETE TO authenticated USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_image_registry_user ON public.image_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_image_registry_entity ON public.image_registry(entity_type, entity_id);

-- ============================================================
-- 4. MISSING TABLE: push_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='push_tokens_insert_auth' AND tablename='push_tokens') THEN
    CREATE POLICY "push_tokens_insert_auth" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='push_tokens_select_auth' AND tablename='push_tokens') THEN
    CREATE POLICY "push_tokens_select_auth" ON public.push_tokens FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

-- ============================================================
-- 5. MISSING TABLE: chat_rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT,
  title TEXT,
  subtitle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS subtitle TEXT;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_slug ON public.chat_rooms(slug);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_updated_at ON public.chat_rooms(updated_at DESC);
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 6. MISSING TABLE: room_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id TEXT,
  user_id TEXT,
  text TEXT,
  body TEXT,
  file_url TEXT,
  file_type TEXT,
  read_by TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS read_by TEXT[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON public.room_messages(room_id, created_at DESC);
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 7. MISSING TABLE: room_participants (referenced in code, no SQL existed)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_participants (
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='room_participants_auth_all' AND tablename='room_participants') THEN
    CREATE POLICY "room_participants_auth_all" ON public.room_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON public.room_participants(user_id);

-- ============================================================
-- 8. CHAT ROOMS RLS POLICIES
-- ============================================================
CREATE OR REPLACE FUNCTION public.ivx_is_owner_room_chat(target_room_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_rooms
    WHERE id = target_room_id
      AND (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR coalesce(slug, '') = 'ivx-owner-room')
  );
$$;

DROP POLICY IF EXISTS chat_rooms_auth_all ON public.chat_rooms;
CREATE POLICY chat_rooms_auth_all ON public.chat_rooms
FOR ALL TO authenticated
USING (
  NOT (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR coalesce(slug, '') = 'ivx-owner-room')
  OR public.ivx_is_owner()
)
WITH CHECK (
  NOT (id = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR coalesce(slug, '') = 'ivx-owner-room')
  OR public.ivx_is_owner()
);

DROP POLICY IF EXISTS room_messages_auth_all ON public.room_messages;
CREATE POLICY room_messages_auth_all ON public.room_messages
FOR ALL TO authenticated
USING (
  NOT public.ivx_is_owner_room_chat(room_id)
  OR public.ivx_is_owner()
)
WITH CHECK (
  NOT public.ivx_is_owner_room_chat(room_id)
  OR public.ivx_is_owner()
);

-- Seed IVX Owner Room in chat_rooms
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_rooms WHERE slug = 'ivx-owner-room') THEN
    UPDATE public.chat_rooms SET title = 'IVX Owner Room', subtitle = 'Owner-only shared realtime IVX room.', updated_at = now() WHERE slug = 'ivx-owner-room';
  ELSE
    INSERT INTO public.chat_rooms (id, slug, title, subtitle, updated_at)
    VALUES ('8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41', 'ivx-owner-room', 'IVX Owner Room', 'Owner-only shared realtime IVX room.', now());
  END IF;
END
$$;

-- ============================================================
-- 9. MISSING TABLES: IVX Owner AI (ivx_conversations, ivx_messages, etc.)
-- These map to "ivx_owner_conversations" and "ivx_owner_ai_requests" in audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ivx_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ivx_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ivx_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL DEFAULT 'owner',
  sender_label TEXT,
  body TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_size BIGINT,
  attachment_kind TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.ivx_inbox_state (
  conversation_id UUID NOT NULL REFERENCES public.ivx_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.ivx_ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ivx_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  response_text TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  model TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.ivx_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT,
  content_text TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_ivx_messages_conversation_created_at ON public.ivx_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ivx_inbox_state_user_id ON public.ivx_inbox_state(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ivx_ai_requests_conversation_id ON public.ivx_ai_requests(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ivx_knowledge_documents_owner_id ON public.ivx_knowledge_documents(owner_user_id, updated_at DESC);

ALTER TABLE public.ivx_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_inbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_knowledge_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ivx_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_inbox_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_ai_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ivx_knowledge_documents FORCE ROW LEVEL SECURITY;

-- Drop old policies before creating new ones
DO $$ DECLARE policy_name TEXT;
BEGIN
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ivx_conversations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ivx_conversations', policy_name);
  END LOOP;
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ivx_messages' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ivx_messages', policy_name);
  END LOOP;
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ivx_inbox_state' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ivx_inbox_state', policy_name);
  END LOOP;
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ivx_ai_requests' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ivx_ai_requests', policy_name);
  END LOOP;
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ivx_knowledge_documents' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ivx_knowledge_documents', policy_name);
  END LOOP;
END $$;

CREATE POLICY ivx_conversations_owner_only ON public.ivx_conversations FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY ivx_messages_owner_only ON public.ivx_messages FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY ivx_inbox_state_owner_only ON public.ivx_inbox_state FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY ivx_ai_requests_owner_only ON public.ivx_ai_requests FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY ivx_knowledge_documents_owner_only ON public.ivx_knowledge_documents FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- Seed the IVX Owner AI Room conversation
INSERT INTO public.ivx_conversations (id, slug, title, subtitle)
VALUES (
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
  'ivx-owner-room',
  'IVX Owner AI Room',
  'Owner-only shared room for AI chat, inbox, uploads, knowledge, and commands.'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  updated_at = timezone('utc', now());

-- ============================================================
-- 10. REALTIME PUBLICATIONS
-- ============================================================
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ivx_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ivx_inbox_state; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ivx_conversations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 11. BROKEN RPC: get_user_role (column 'role' does not exist error)
-- This happens because profiles table exists but may lack 'role' column
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'investor';

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $fn$
DECLARE user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(user_role, 'investor');
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_user_role TO authenticated;

-- ============================================================
-- 12. BROKEN RPC: get_landing_analytics (function missing from schema)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_landing_analytics(
  p_cutoff TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50000
) RETURNS SETOF public.landing_analytics
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT * FROM public.landing_analytics
  WHERE (p_cutoff IS NULL OR created_at >= p_cutoff)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_landing_analytics TO anon, authenticated;

-- Additional admin RPCs
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND regexp_replace(lower(COALESCE(role, 'investor')), '[^a-z0-9]+', '', 'g') IN ('owner', 'owneradmin')
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_owner_of(check_user_id UUID)
RETURNS BOOLEAN AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND regexp_replace(lower(COALESCE(role, 'investor')), '[^a-z0-9]+', '', 'g') IN ('owner', 'owneradmin')
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.verify_admin_access()
RETURNS BOOLEAN AS $fn$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND regexp_replace(lower(COALESCE(role, 'investor')), '[^a-z0-9]+', '', 'g') IN ('owner', 'owneradmin')
  );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_of TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_access TO authenticated;

-- Visitor session RPCs
CREATE OR REPLACE FUNCTION public.upsert_visitor_session(
  p_session_id TEXT, p_ip_hash TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL, p_device_type TEXT DEFAULT NULL,
  p_page_path TEXT DEFAULT NULL, p_referrer TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL, p_utm_medium TEXT DEFAULT NULL, p_utm_campaign TEXT DEFAULT NULL
) RETURNS VOID AS $fn$
BEGIN
  INSERT INTO public.visitor_sessions (session_id, ip_hash, user_agent, country, city, device_type, page_path, referrer, utm_source, utm_medium, utm_campaign, is_active, last_seen_at)
  VALUES (p_session_id, p_ip_hash, p_user_agent, p_country, p_city, p_device_type, p_page_path, p_referrer, p_utm_source, p_utm_medium, p_utm_campaign, true, now())
  ON CONFLICT (session_id) DO UPDATE SET last_seen_at = now(), is_active = true, page_path = COALESCE(EXCLUDED.page_path, visitor_sessions.page_path);
EXCEPTION WHEN unique_violation THEN
  UPDATE public.visitor_sessions SET last_seen_at = now(), is_active = true WHERE session_id = p_session_id;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.mark_inactive_sessions(p_timeout_minutes INTEGER DEFAULT 5)
RETURNS INTEGER AS $fn$
DECLARE affected INTEGER;
BEGIN
  UPDATE public.visitor_sessions SET is_active = false WHERE is_active = true AND last_seen_at < now() - (p_timeout_minutes || ' minutes')::interval;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.save_realtime_snapshot(p_snapshot_type TEXT DEFAULT 'visitor', p_data JSONB DEFAULT '{}'::jsonb, p_active_visitors INTEGER DEFAULT 0)
RETURNS VOID AS $fn$
BEGIN
  INSERT INTO public.realtime_snapshots (snapshot_type, data, active_visitors) VALUES (p_snapshot_type, p_data, p_active_visitors);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.upsert_visitor_session TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inactive_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_realtime_snapshot TO authenticated;

-- ============================================================
-- 13. STORAGE BUCKETS (all missing — zero buckets exist)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('deal-photos', 'deal-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-uploads', 'chat-uploads', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('investor-intake', 'investor-intake', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('landing-page', 'landing-page', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ivx-owner-files', 'ivx-owner-files', false, 52428800,
  ARRAY['image/*', 'video/*', 'application/pdf', 'text/plain', 'application/json', 'application/zip']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- 14. STORAGE BUCKET POLICIES
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='deal_photos_public_select') THEN
    CREATE POLICY "deal_photos_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'deal-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='deal_photos_auth_insert') THEN
    CREATE POLICY "deal_photos_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'deal-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_uploads_public_select') THEN
    CREATE POLICY "chat_uploads_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'chat-uploads');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='chat_uploads_auth_insert') THEN
    CREATE POLICY "chat_uploads_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-uploads');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='avatars_public_select') THEN
    CREATE POLICY "avatars_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='avatars_auth_insert') THEN
    CREATE POLICY "avatars_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='avatars_auth_update') THEN
    CREATE POLICY "avatars_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='investor_intake_public_select') THEN
    CREATE POLICY "investor_intake_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'investor-intake');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='investor_intake_anon_insert') THEN
    CREATE POLICY "investor_intake_anon_insert" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'investor-intake');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='investor_intake_auth_insert') THEN
    CREATE POLICY "investor_intake_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'investor-intake');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='landing_page_public_select') THEN
    CREATE POLICY "landing_page_public_select" ON storage.objects FOR SELECT USING (bucket_id = 'landing-page');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='landing_page_auth_all') THEN
    CREATE POLICY "landing_page_auth_all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'landing-page') WITH CHECK (bucket_id = 'landing-page');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='kyc_docs_auth_insert') THEN
    CREATE POLICY "kyc_docs_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kyc-documents');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='kyc_docs_auth_select') THEN
    CREATE POLICY "kyc_docs_auth_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'kyc-documents');
  END IF;
END $$;

-- IVX Owner Files storage policies
DO $$ BEGIN
  DROP POLICY IF EXISTS ivx_owner_files_owner_only ON storage.objects;
  CREATE POLICY ivx_owner_files_owner_only ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'ivx-owner-files' AND public.ivx_is_owner())
  WITH CHECK (bucket_id = 'ivx-owner-files' AND public.ivx_is_owner());
END $$;

-- ============================================================
-- 15. VERIFICATION QUERY — Run this after to confirm everything worked
-- ============================================================
SELECT 'TABLES' AS check_type, tablename AS name,
  CASE WHEN tablename IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'visitor_sessions', 'realtime_snapshots', 'image_registry', 'push_tokens',
    'chat_rooms', 'room_messages', 'room_participants',
    'ivx_conversations', 'ivx_messages', 'ivx_inbox_state', 'ivx_ai_requests', 'ivx_knowledge_documents'
  )
UNION ALL
SELECT 'RPC' AS check_type, proname AS name, 'EXISTS' AS status
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('get_user_role', 'get_landing_analytics', 'is_admin', 'verify_admin_access', 'ivx_is_owner')
UNION ALL
SELECT 'BUCKET' AS check_type, id AS name, 'EXISTS' AS status
FROM storage.buckets
WHERE id IN ('deal-photos', 'chat-uploads', 'avatars', 'investor-intake', 'landing-page', 'kyc-documents', 'ivx-owner-files')
ORDER BY check_type, name;
