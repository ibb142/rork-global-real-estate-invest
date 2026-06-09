CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
        AND regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g') IN ('owner', 'owneradmin', 'ivxowner', 'developer', 'dev', 'admin', 'superadmin', 'administrator', 'founder', 'staff', 'staffmember', 'ceo', 'manager', 'analyst', 'support')
    );
$ivx$;

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Workspace Assistant',
  subtitle TEXT,
  slug TEXT,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS subtitle TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_text TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_slug_unique ON public.conversations(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON public.conversation_participants(conversation_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  text TEXT,
  body TEXT,
  file_url TEXT,
  file_type TEXT,
  read_by TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_by TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages(sender_id, created_at DESC);

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
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_rooms_slug_unique ON public.chat_rooms(slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id TEXT,
  user_id TEXT,
  text TEXT,
  body TEXT,
  file_url TEXT,
  file_type TEXT,
  read_by TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS text TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS read_by TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON public.room_messages(room_id, created_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_auth_all ON public.conversations;
CREATE POLICY conversations_auth_all ON public.conversations
FOR ALL
TO authenticated
USING (id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner())
WITH CHECK (id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner());

DROP POLICY IF EXISTS conversation_participants_auth_all ON public.conversation_participants;
CREATE POLICY conversation_participants_auth_all ON public.conversation_participants
FOR ALL
TO authenticated
USING (conversation_id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner())
WITH CHECK (conversation_id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner());

DROP POLICY IF EXISTS messages_auth_all ON public.messages;
CREATE POLICY messages_auth_all ON public.messages
FOR ALL
TO authenticated
USING (conversation_id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner())
WITH CHECK (conversation_id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner());

DROP POLICY IF EXISTS chat_rooms_auth_all ON public.chat_rooms;
CREATE POLICY chat_rooms_auth_all ON public.chat_rooms
FOR ALL
TO authenticated
USING (id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner())
WITH CHECK (id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner());

DROP POLICY IF EXISTS room_messages_auth_all ON public.room_messages;
CREATE POLICY room_messages_auth_all ON public.room_messages
FOR ALL
TO authenticated
USING (room_id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner())
WITH CHECK (room_id <> '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41'::uuid OR public.ivx_is_owner());

INSERT INTO public.conversations (
  id,
  slug,
  title,
  subtitle,
  last_message_at
)
VALUES (
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
  'ivx-owner-room',
  'IVX Owner Room',
  'Owner/admin access to the shared realtime IVX room.',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle;

INSERT INTO public.chat_rooms (
  id,
  slug,
  title,
  subtitle,
  updated_at
)
VALUES (
  '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41',
  'ivx-owner-room',
  'IVX Owner Room',
  'Owner/admin access to the shared realtime IVX room.',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  updated_at = now();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;