-- =============================================================================
-- IVX Member Registration — Database Migration
-- Idempotent. Safe to re-run.
--
-- Creates:
--   1. Extended profiles columns: email_verified, phone_verified, last_login_at
--   2. verification_codes table — TTL-based verification codes
--   3. audit_logs table — member action audit trail
--   4. RLS policies for member self-access
-- =============================================================================

-- ---------- Extend profiles table -----------------------------------------
-- Add verification columns if they don't exist (safe on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'phone_verified'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
END $$;

-- ---------- verification_codes --------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('email', 'phone')),
  code        TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_codes_user_type_idx
  ON public.verification_codes (user_id, type)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS verification_codes_expires_idx
  ON public.verification_codes (expires_at)
  WHERE verified_at IS NULL;

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verification_codes_service_access ON public.verification_codes;
CREATE POLICY verification_codes_service_access
  ON public.verification_codes FOR ALL
  USING (true)   -- service_role only in practice; backend proxies everything
  WITH CHECK (true);

-- ---------- audit_logs ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_owner_select ON public.audit_logs;
CREATE POLICY audit_logs_owner_select
  ON public.audit_logs FOR SELECT
  USING (public.ivx_is_owner());

DROP POLICY IF EXISTS audit_logs_service_access ON public.audit_logs;
CREATE POLICY audit_logs_service_access
  ON public.audit_logs FOR INSERT
  USING (true)
  WITH CHECK (true);

-- ---------- Allow members to read their own profile ------------------------
DROP POLICY IF EXISTS profiles_member_select ON public.profiles;
CREATE POLICY profiles_member_select
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow members to update their own profile (non-role fields)
DROP POLICY IF EXISTS profiles_member_update ON public.profiles;
CREATE POLICY profiles_member_update
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(role, 'investor') = COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'investor')
  );
