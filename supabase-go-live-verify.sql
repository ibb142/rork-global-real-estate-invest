-- =============================================================================
-- IVXHOLDINGS — GO-LIVE VERIFICATION SCRIPT
-- =============================================================================
-- Run this AFTER supabase-master-setup.sql + supabase-security-patch.sql
-- Safe to run multiple times. Does NOT modify data.
-- Aligned with audit fix policy names (_scoped suffix).
-- =============================================================================

-- ============================================================
-- 1. VERIFY ALL 13 TABLES EXIST
-- ============================================================
DO $$
DECLARE
  _tables text[] := ARRAY[
    'profiles','wallets','properties','market_data','holdings',
    'transactions','notifications','analytics_events','image_registry',
    'push_tokens','jv_deals','landing_analytics','waitlist'
  ];
  _t text;
  _exists boolean;
  _ok integer := 0;
  _fail integer := 0;
  _total integer := 13;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  GO-LIVE VERIFICATION';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '--- 1. TABLE CHECK ---';

  FOREACH _t IN ARRAY _tables LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_name = _t AND table_schema = 'public'
    ) INTO _exists;

    IF _exists THEN
      _ok := _ok + 1;
      RAISE NOTICE '[OK]    %', _t;
    ELSE
      _fail := _fail + 1;
      RAISE NOTICE '[MISS]  % <-- RUN supabase-master-setup.sql', _t;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Tables: % / % OK', _ok, _total;
  IF _fail > 0 THEN
    RAISE NOTICE 'ACTION: Run supabase-master-setup.sql to create missing tables';
  END IF;
END $$;


-- ============================================================
-- 2. VERIFY RLS IS ENABLED ON ALL TABLES
-- ============================================================
DO $$
DECLARE
  _tables text[] := ARRAY[
    'profiles','wallets','properties','market_data','holdings',
    'transactions','notifications','analytics_events','image_registry',
    'push_tokens','jv_deals','landing_analytics','waitlist'
  ];
  _t text;
  _rls boolean;
  _ok integer := 0;
  _fail integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 2. ROW LEVEL SECURITY CHECK ---';

  FOREACH _t IN ARRAY _tables LOOP
    SELECT COALESCE(
      (SELECT relrowsecurity FROM pg_class
       WHERE relname = _t AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')),
      false
    ) INTO _rls;

    IF _rls THEN
      _ok := _ok + 1;
      RAISE NOTICE '[OK]    % — RLS enabled', _t;
    ELSE
      _fail := _fail + 1;
      RAISE NOTICE '[WARN]  % — RLS NOT enabled', _t;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'RLS: % / % enabled', _ok, _ok + _fail;
END $$;


-- ============================================================
-- 3. VERIFY SUPABASE REALTIME ON jv_deals
-- ============================================================
DO $$
DECLARE
  _rt_exists boolean;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 3. REALTIME PUBLICATION CHECK ---';

  SELECT EXISTS(
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals'
  ) INTO _rt_exists;

  IF _rt_exists THEN
    RAISE NOTICE '[OK]    jv_deals is in supabase_realtime publication';
  ELSE
    RAISE NOTICE '[FAIL]  jv_deals NOT in supabase_realtime — run:';
    RAISE NOTICE '        ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals;';
  END IF;
END $$;


-- ============================================================
-- 4. VERIFY KEY RLS POLICIES EXIST (aligned with _scoped names)
-- ============================================================
DO $$
DECLARE
  _policies text[] := ARRAY[
    'profiles_select_own',
    'profiles_update_own',
    'profiles_insert_own',
    'wallets_select_own',
    'wallets_insert_own',
    'holdings_select_own',
    'holdings_insert_own',
    'transactions_select_own',
    'notifications_select_own',
    'notifications_insert_scoped',
    'analytics_insert_auth',
    'push_tokens_select_own',
    'push_tokens_insert_own',
    'push_tokens_delete_own',
    'properties_select_all',
    'properties_insert_admin',
    'properties_update_admin',
    'jv_deals_select_scoped',
    'jv_deals_insert_scoped',
    'jv_deals_update_scoped',
    'jv_deals_delete_scoped',
    'landing_analytics_select_admin',
    'landing_analytics_insert_validated',
    'waitlist_select_admin',
    'waitlist_insert_validated'
  ];
  _p text;
  _exists boolean;
  _ok integer := 0;
  _fail integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 4. KEY POLICIES CHECK ---';

  FOREACH _p IN ARRAY _policies LOOP
    SELECT EXISTS(
      SELECT 1 FROM pg_policies WHERE policyname = _p
    ) INTO _exists;

    IF _exists THEN
      _ok := _ok + 1;
    ELSE
      _fail := _fail + 1;
      RAISE NOTICE '[MISS]  Policy: %', _p;
    END IF;
  END LOOP;

  IF _fail = 0 THEN
    RAISE NOTICE '[OK]    All % key policies exist', _ok;
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE 'Policies: % OK, % missing', _ok, _fail;
    RAISE NOTICE 'ACTION: Run supabase-fix-audit-8.sql to create missing policies';
  END IF;
END $$;


-- ============================================================
-- 5. VERIFY AUTH TRIGGER EXISTS
-- ============================================================
DO $$
DECLARE
  _trigger_exists boolean;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 5. AUTH TRIGGER CHECK ---';

  SELECT EXISTS(
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'on_auth_user_created'
    AND event_object_table = 'users'
    AND trigger_schema = 'auth'
  ) INTO _trigger_exists;

  IF _trigger_exists THEN
    RAISE NOTICE '[OK]    on_auth_user_created trigger exists (auto-creates profile on signup)';
  ELSE
    RAISE NOTICE '[FAIL]  on_auth_user_created trigger missing — new signups wont create profiles';
    RAISE NOTICE '        Run supabase-master-setup.sql to create it';
  END IF;
END $$;


-- ============================================================
-- 6. VERIFY KEY INDEXES EXIST
-- ============================================================
DO $$
DECLARE
  _indexes text[] := ARRAY[
    'idx_wallets_user_id',
    'idx_holdings_user',
    'idx_transactions_user',
    'idx_notifications_user',
    'idx_analytics_user',
    'idx_push_tokens_user',
    'idx_jv_deals_published',
    'idx_jv_deals_status'
  ];
  _idx text;
  _exists boolean;
  _ok integer := 0;
  _fail integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 6. INDEX CHECK ---';

  FOREACH _idx IN ARRAY _indexes LOOP
    SELECT EXISTS(
      SELECT 1 FROM pg_indexes WHERE indexname = _idx
    ) INTO _exists;

    IF _exists THEN
      _ok := _ok + 1;
    ELSE
      _fail := _fail + 1;
      RAISE NOTICE '[MISS]  Index: %', _idx;
    END IF;
  END LOOP;

  IF _fail = 0 THEN
    RAISE NOTICE '[OK]    All % key indexes exist', _ok;
  ELSE
    RAISE NOTICE 'Indexes: % OK, % missing', _ok, _fail;
  END IF;
END $$;


-- ============================================================
-- 7. VERIFY HELPER FUNCTIONS
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 7. HELPER FUNCTIONS CHECK ---';

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    RAISE NOTICE '[OK]    is_admin() function exists';
  ELSE
    RAISE NOTICE '[FAIL]  is_admin() function missing — admin RLS policies will fail';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    RAISE NOTICE '[OK]    set_updated_at() function exists';
  ELSE
    RAISE NOTICE '[FAIL]  set_updated_at() function missing — updated_at auto-trigger wont work';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_jv_updated_at' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    RAISE NOTICE '[OK]    set_jv_updated_at() function exists';
  ELSE
    RAISE NOTICE '[FAIL]  set_jv_updated_at() function missing — jv_deals "updatedAt" trigger wont work';
  END IF;
END $$;


-- ============================================================
-- 8. VERIFY updated_at TRIGGERS (including jv_deals)
-- ============================================================
DO $$
DECLARE
  _triggers text[] := ARRAY[
    'trg_profiles_updated_at',
    'trg_wallets_updated_at',
    'trg_properties_updated_at',
    'trg_market_data_updated_at',
    'trg_push_tokens_updated_at',
    'trg_jv_deals_updated_at'
  ];
  _trg text;
  _exists boolean;
  _ok integer := 0;
  _fail integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 8. UPDATED_AT TRIGGERS CHECK ---';

  FOREACH _trg IN ARRAY _triggers LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = _trg AND trigger_schema = 'public'
    ) INTO _exists;

    IF _exists THEN
      _ok := _ok + 1;
    ELSE
      _fail := _fail + 1;
      RAISE NOTICE '[MISS]  Trigger: %', _trg;
    END IF;
  END LOOP;

  IF _fail = 0 THEN
    RAISE NOTICE '[OK]    All % updated_at triggers exist', _ok;
  ELSE
    RAISE NOTICE 'Triggers: % OK, % missing', _ok, _fail;
  END IF;
END $$;


-- ============================================================
-- 9. VERIFY FOREIGN KEYS (holdings + transactions -> properties)
-- ============================================================
DO $$
DECLARE
  _holdings_fk boolean;
  _transactions_fk boolean;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 9. FOREIGN KEY CHECK ---';

  SELECT EXISTS(
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_name = 'holdings'
      AND kcu.column_name = 'property_id'
      AND rc.constraint_schema = 'public'
  ) INTO _holdings_fk;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    WHERE kcu.table_name = 'transactions'
      AND kcu.column_name = 'property_id'
      AND rc.constraint_schema = 'public'
  ) INTO _transactions_fk;

  IF _holdings_fk THEN
    RAISE NOTICE '[OK]    holdings.property_id FK to properties';
  ELSE
    RAISE NOTICE '[FAIL]  holdings.property_id has no FK to properties';
  END IF;

  IF _transactions_fk THEN
    RAISE NOTICE '[OK]    transactions.property_id FK to properties';
  ELSE
    RAISE NOTICE '[FAIL]  transactions.property_id has no FK to properties';
  END IF;
END $$;


-- ============================================================
-- 10. VERIFY NO STALE/WIDE-OPEN POLICIES REMAIN
-- ============================================================
DO $$
DECLARE
  _bad_policies text[] := ARRAY[
    'jv_deals_select_all',
    'jv_deals_insert_all',
    'jv_deals_insert_own',
    'jv_deals_update_all',
    'jv_deals_update_own',
    'jv_deals_delete_auth',
    'jv_deals_delete_admin',
    'landing_analytics_select_all',
    'landing_analytics_insert_all',
    'waitlist_select_all',
    'waitlist_insert_all',
    'properties_insert_auth',
    'properties_update_auth',
    'notifications_insert_auth',
    'notifications_insert_own',
    'notifications_insert_all'
  ];
  _p text;
  _exists boolean;
  _found integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '--- 10. STALE/WIDE-OPEN POLICY CHECK ---';

  FOREACH _p IN ARRAY _bad_policies LOOP
    SELECT EXISTS(SELECT 1 FROM pg_policies WHERE policyname = _p) INTO _exists;
    IF _exists THEN
      _found := _found + 1;
      RAISE NOTICE '[WARN]  Stale policy still exists: %', _p;
    END IF;
  END LOOP;

  IF _found = 0 THEN
    RAISE NOTICE '[OK]    No stale wide-open policies found';
  ELSE
    RAISE NOTICE '[WARN]  % stale policies found — run supabase-fix-audit-8.sql to fix', _found;
  END IF;
END $$;


-- ============================================================
-- 11. SUMMARY
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  VERIFICATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'If all checks show [OK], your Supabase is ready for go-live.';
  RAISE NOTICE 'If any show [MISS] or [FAIL]:';
  RAISE NOTICE '  1. Run supabase-master-setup.sql to create tables + base policies';
  RAISE NOTICE '  2. Run supabase-fix-audit-8.sql to apply all 8 audit fixes';
  RAISE NOTICE '';
  RAISE NOTICE 'Checks 1-6: Tables, RLS, Realtime, Policies, Auth Trigger, Indexes';
  RAISE NOTICE 'Checks 7-10: Helper Functions, updated_at Triggers, Foreign Keys, Stale Policies';
  RAISE NOTICE '';
  RAISE NOTICE 'Remaining manual steps:';
  RAISE NOTICE '  1. Deploy send-email Edge Function (for real email delivery)';
  RAISE NOTICE '  2. Configure DNS for ivxholding.com / staging.ivxholding.com';
  RAISE NOTICE '  3. Provision SSL certs (deploy/nginx/ssl/)';
  RAISE NOTICE '  4. Fill in deploy/.env.production with real credentials';
  RAISE NOTICE '  5. Items #9 (2FA) and #10 (Owner Access) are deferred to next phase';
  RAISE NOTICE '';
END $$;
