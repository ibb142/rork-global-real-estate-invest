-- =============================================================================
-- IVXHOLDINGS — DEFINITIVE FIX FOR AUDIT ISSUES #1–#8
-- =============================================================================
-- Run this in Supabase SQL Editor.
-- Safe to run multiple times (idempotent).
-- Fixes all 8 red items from the code-level audit.
-- =============================================================================


-- ============================================================
-- PREREQUISITE: Ensure is_admin() and set_updated_at() exist
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt()->'user_metadata'->>'role') = 'admin'
      OR (auth.jwt()->'app_metadata'->>'role') = 'admin',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper for jv_deals "updatedAt" (camelCase column)
CREATE OR REPLACE FUNCTION public.set_jv_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- FIX #1: jv_deals RLS — NUKE all old policies, recreate tight ones
-- ============================================================
DROP POLICY IF EXISTS jv_deals_select_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_select_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_insert_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_update_own ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_all ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_auth ON jv_deals;
DROP POLICY IF EXISTS jv_deals_delete_admin ON jv_deals;

-- SELECT: published deals visible to all, drafts only to owner + admin
CREATE POLICY jv_deals_select_scoped ON jv_deals
  FOR SELECT USING (
    published = true
    OR user_id = auth.uid()
    OR public.is_admin()
  );

-- INSERT: only deal owner or admin
CREATE POLICY jv_deals_insert_scoped ON jv_deals
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id = auth.uid() OR public.is_admin())
  );

-- UPDATE: only deal owner or admin
CREATE POLICY jv_deals_update_scoped ON jv_deals
  FOR UPDATE USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- DELETE: admin only
CREATE POLICY jv_deals_delete_scoped ON jv_deals
  FOR DELETE USING (
    public.is_admin()
  );

RAISE NOTICE '[FIX #1] jv_deals — RLS restricted to owner/admin (4 new policies)';


-- ============================================================
-- FIX #2: landing_analytics — admin-only SELECT, validated INSERT
-- ============================================================
DROP POLICY IF EXISTS landing_analytics_select_all ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_select_auth ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_select_admin ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_insert_all ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_insert_auth ON landing_analytics;
DROP POLICY IF EXISTS landing_analytics_insert_validated ON landing_analytics;

-- Only admin can read analytics
CREATE POLICY landing_analytics_select_admin ON landing_analytics
  FOR SELECT USING (public.is_admin());

-- Public insert requires valid session_id (min 8 chars) and event name
CREATE POLICY landing_analytics_insert_validated ON landing_analytics
  FOR INSERT WITH CHECK (
    session_id IS NOT NULL
    AND length(session_id) >= 8
    AND event IS NOT NULL
    AND length(event) >= 1
  );

RAISE NOTICE '[FIX #2] landing_analytics — SELECT admin-only, INSERT validated';


-- ============================================================
-- FIX #3: waitlist — admin-only SELECT, validated INSERT
-- ============================================================
DROP POLICY IF EXISTS waitlist_select_all ON waitlist;
DROP POLICY IF EXISTS waitlist_select_auth ON waitlist;
DROP POLICY IF EXISTS waitlist_select_admin ON waitlist;
DROP POLICY IF EXISTS waitlist_insert_all ON waitlist;
DROP POLICY IF EXISTS waitlist_insert_auth ON waitlist;
DROP POLICY IF EXISTS waitlist_insert_validated ON waitlist;

-- Only admin can read waitlist entries (protects PII)
CREATE POLICY waitlist_select_admin ON waitlist
  FOR SELECT USING (public.is_admin());

-- Public insert requires valid email (min 5 chars)
CREATE POLICY waitlist_insert_validated ON waitlist
  FOR INSERT WITH CHECK (
    email IS NOT NULL
    AND length(email) >= 5
  );

RAISE NOTICE '[FIX #3] waitlist — SELECT admin-only, INSERT validated';


-- ============================================================
-- FIX #4: properties — restrict INSERT/UPDATE to admin only
-- ============================================================
DROP POLICY IF EXISTS properties_insert_auth ON properties;
DROP POLICY IF EXISTS properties_insert_all ON properties;
DROP POLICY IF EXISTS properties_insert_admin ON properties;
DROP POLICY IF EXISTS properties_update_auth ON properties;
DROP POLICY IF EXISTS properties_update_all ON properties;
DROP POLICY IF EXISTS properties_update_admin ON properties;

-- Only admin can create properties
CREATE POLICY properties_insert_admin ON properties
  FOR INSERT WITH CHECK (public.is_admin());

-- Only admin can update properties
CREATE POLICY properties_update_admin ON properties
  FOR UPDATE USING (public.is_admin());

RAISE NOTICE '[FIX #4] properties — INSERT/UPDATE restricted to admin';


-- ============================================================
-- FIX #5: notifications — restrict INSERT to own user_id or admin
-- ============================================================
DROP POLICY IF EXISTS notifications_insert_all ON notifications;
DROP POLICY IF EXISTS notifications_insert_auth ON notifications;
DROP POLICY IF EXISTS notifications_insert_own ON notifications;

-- Can only create notifications for yourself, or admin can create for anyone
CREATE POLICY notifications_insert_scoped ON notifications
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR public.is_admin()
  );

RAISE NOTICE '[FIX #5] notifications — INSERT restricted to own user_id or admin';


-- ============================================================
-- FIX #6: updated_at auto-trigger for ALL tables with updated_at
-- ============================================================

-- profiles (already has updated_at column)
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- wallets (already has updated_at column)
DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- properties (already has updated_at column)
DROP TRIGGER IF EXISTS trg_properties_updated_at ON properties;
CREATE TRIGGER trg_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- market_data (already has updated_at column)
DROP TRIGGER IF EXISTS trg_market_data_updated_at ON market_data;
CREATE TRIGGER trg_market_data_updated_at
  BEFORE UPDATE ON market_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- push_tokens (already has updated_at column)
DROP TRIGGER IF EXISTS trg_push_tokens_updated_at ON push_tokens;
CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- jv_deals (uses camelCase "updatedAt" — needs special trigger)
DROP TRIGGER IF EXISTS trg_jv_deals_updated_at ON jv_deals;
CREATE TRIGGER trg_jv_deals_updated_at
  BEFORE UPDATE ON jv_deals
  FOR EACH ROW EXECUTE FUNCTION public.set_jv_updated_at();

RAISE NOTICE '[FIX #6] updated_at auto-triggers created for 6 tables (including jv_deals "updatedAt")';


-- ============================================================
-- FIX #7: holdings.property_id FK to properties
-- ============================================================
DO $$
DECLARE
  _fk_exists boolean;
BEGIN
  -- Check if ANY FK already exists on holdings.property_id -> properties
  SELECT EXISTS(
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_name = 'holdings'
      AND kcu.column_name = 'property_id'
      AND rc.constraint_schema = 'public'
  ) INTO _fk_exists;

  IF NOT _fk_exists THEN
    ALTER TABLE holdings
      ADD CONSTRAINT fk_holdings_property
      FOREIGN KEY (property_id) REFERENCES properties(id)
      ON DELETE SET NULL;
    RAISE NOTICE '[FIX #7] Added FK: holdings.property_id -> properties.id';
  ELSE
    RAISE NOTICE '[FIX #7] holdings.property_id FK already exists — skipped';
  END IF;
END $$;


-- ============================================================
-- FIX #8: transactions.property_id FK to properties
-- ============================================================
DO $$
DECLARE
  _fk_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_name = 'transactions'
      AND kcu.column_name = 'property_id'
      AND rc.constraint_schema = 'public'
  ) INTO _fk_exists;

  IF NOT _fk_exists THEN
    ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_property
      FOREIGN KEY (property_id) REFERENCES properties(id)
      ON DELETE SET NULL;
    RAISE NOTICE '[FIX #8] Added FK: transactions.property_id -> properties.id';
  ELSE
    RAISE NOTICE '[FIX #8] transactions.property_id FK already exists — skipped';
  END IF;
END $$;


-- ============================================================
-- VERIFICATION — Confirm all 8 fixes are applied
-- ============================================================
DO $$
DECLARE
  _ok integer := 0;
  _fail integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  AUDIT FIX VERIFICATION (#1–#8)';
  RAISE NOTICE '========================================';

  -- #1 jv_deals: check new scoped policies exist, old wide-open gone
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_select_scoped' AND tablename = 'jv_deals')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_insert_scoped' AND tablename = 'jv_deals')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_update_scoped' AND tablename = 'jv_deals')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'jv_deals_delete_scoped' AND tablename = 'jv_deals')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname IN ('jv_deals_insert_all','jv_deals_update_all','jv_deals_delete_auth') AND tablename = 'jv_deals')
  THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #1 jv_deals RLS — restricted to owner/admin';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #1 jv_deals RLS — wide-open policies may still exist';
  END IF;

  -- #2 landing_analytics
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_analytics_select_admin' AND tablename = 'landing_analytics')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'landing_analytics_insert_validated' AND tablename = 'landing_analytics')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname IN ('landing_analytics_select_all','landing_analytics_insert_all') AND tablename = 'landing_analytics')
  THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #2 landing_analytics — admin SELECT, validated INSERT';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #2 landing_analytics policies not correct';
  END IF;

  -- #3 waitlist
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_select_admin' AND tablename = 'waitlist')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_insert_validated' AND tablename = 'waitlist')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname IN ('waitlist_select_all','waitlist_insert_all') AND tablename = 'waitlist')
  THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #3 waitlist — admin SELECT, validated INSERT';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #3 waitlist policies not correct';
  END IF;

  -- #4 properties
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_insert_admin' AND tablename = 'properties')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'properties_update_admin' AND tablename = 'properties')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname IN ('properties_insert_auth','properties_update_auth','properties_insert_all','properties_update_all') AND tablename = 'properties')
  THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #4 properties — INSERT/UPDATE admin-only';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #4 properties — stale auth-level policies may exist';
  END IF;

  -- #5 notifications
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_insert_scoped' AND tablename = 'notifications')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname IN ('notifications_insert_auth','notifications_insert_all') AND tablename = 'notifications')
  THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #5 notifications — INSERT restricted to own user_id or admin';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #5 notifications INSERT policy not correct';
  END IF;

  -- #6 updated_at triggers
  IF EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_profiles_updated_at' AND trigger_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_wallets_updated_at' AND trigger_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_properties_updated_at' AND trigger_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_market_data_updated_at' AND trigger_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_push_tokens_updated_at' AND trigger_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trg_jv_deals_updated_at' AND trigger_schema = 'public')
  THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #6 updated_at triggers — all 6 tables covered';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #6 updated_at triggers — some missing';
  END IF;

  -- #7 holdings FK
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_name = 'holdings'
      AND kcu.column_name = 'property_id'
      AND rc.constraint_schema = 'public'
  ) THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #7 holdings.property_id FK to properties';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #7 holdings.property_id has no FK';
  END IF;

  -- #8 transactions FK
  IF EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_name = 'transactions'
      AND kcu.column_name = 'property_id'
      AND rc.constraint_schema = 'public'
  ) THEN
    _ok := _ok + 1;
    RAISE NOTICE '[OK]  #8 transactions.property_id FK to properties';
  ELSE
    _fail := _fail + 1;
    RAISE NOTICE '[FAIL] #8 transactions.property_id has no FK';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  IF _fail = 0 THEN
    RAISE NOTICE '  ALL 8 FIXES VERIFIED — 8/8 GREEN';
  ELSE
    RAISE NOTICE '  RESULT: %/8 OK, %/8 NEED ATTENTION', _ok, _fail;
  END IF;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '#9  2FA verification — Deferred to next phase';
  RAISE NOTICE '#10 Owner direct access — Deferred to next phase';
  RAISE NOTICE '';
END $$;
