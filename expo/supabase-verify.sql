-- =============================================================================
-- IVXHOLDINGS — VERIFICATION SCRIPT
-- =============================================================================
-- Run AFTER supabase-master.sql to confirm everything is set up correctly.
-- This script does NOT modify anything.
-- =============================================================================

DO $$
DECLARE
  _tables text[] := ARRAY[
    'jv_deals', 'landing_deals', 'audit_trail', 'waitlist',
    'profiles', 'wallets', 'holdings', 'transactions', 'notifications',
    'analytics_events', 'analytics_dashboard', 'analytics_kpi',
    'analytics_retention', 'analytics_investments',
    'system_health', 'system_metrics', 'staff_activity', 'staff_activity_log',
    'signups', 'applications', 'ai_brain_status',
    'auto_repair_scans', 'repair_logs',
    'ipx_holdings', 'ipx_purchases',
    'earn_accounts', 'earn_deposits', 'earn_payouts',
    'kyc_verifications', 'kyc_documents',
    'referrals', 'referral_invites',
    'sms_reports', 'sms_messages',
    'lender_sync_stats', 'lender_sync_config', 'synced_lenders',
    'lender_sync_jobs', 'imported_lenders',
    'orders', 'support_tickets', 'influencer_applications', 'push_tokens',
    'properties', 'market_data', 'market_index',
    'image_registry', 'app_config', 'landing_analytics',
    'retargeting_dashboard', 'audience_segments', 'ad_pixels',
    'utm_analytics', 'search_discovery', 're_engagement_triggers',
    'engagement_scoring', 'emails',
    'visitor_sessions', 'realtime_snapshots',
    'image_backups', 'image_health_reports'
  ];
  _t text;
  _exists boolean;
  _rls boolean;
  _ok integer := 0;
  _miss integer := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  IVXHOLDINGS — FULL SETUP VERIFICATION';
  RAISE NOTICE '  Checking % tables...', array_length(_tables, 1);
  RAISE NOTICE '========================================';
  RAISE NOTICE '';

  FOREACH _t IN ARRAY _tables LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables WHERE table_name = _t AND table_schema = 'public'
    ) INTO _exists;

    IF _exists THEN
      SELECT rowsecurity INTO _rls FROM pg_tables WHERE tablename = _t AND schemaname = 'public';
      IF _rls THEN
        _ok := _ok + 1;
        RAISE NOTICE '[OK]   % — exists + RLS ON', _t;
      ELSE
        _ok := _ok + 1;
        RAISE NOTICE '[WARN] % — exists but RLS OFF', _t;
      END IF;
    ELSE
      _miss := _miss + 1;
      RAISE NOTICE '[MISS] % — TABLE NOT FOUND', _t;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '--- RESULTS ---';
  RAISE NOTICE 'Tables OK: % / %', _ok, array_length(_tables, 1);
  RAISE NOTICE 'Tables MISSING: %', _miss;

  RAISE NOTICE '';
  RAISE NOTICE '--- FUNCTIONS CHECK ---';
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
    RAISE NOTICE '[OK]   is_admin() exists';
  ELSE
    RAISE NOTICE '[MISS] is_admin() NOT found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_owner_of') THEN
    RAISE NOTICE '[OK]   is_owner_of() exists';
  ELSE
    RAISE NOTICE '[MISS] is_owner_of() NOT found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_role') THEN
    RAISE NOTICE '[OK]   get_user_role() exists';
  ELSE
    RAISE NOTICE '[MISS] get_user_role() NOT found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'verify_admin_access') THEN
    RAISE NOTICE '[OK]   verify_admin_access() exists';
  ELSE
    RAISE NOTICE '[MISS] verify_admin_access() NOT found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '--- REALTIME CHECK ---';
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jv_deals') THEN
    RAISE NOTICE '[OK]   jv_deals in realtime';
  ELSE
    RAISE NOTICE '[MISS] jv_deals NOT in realtime';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'landing_deals') THEN
    RAISE NOTICE '[OK]   landing_deals in realtime';
  ELSE
    RAISE NOTICE '[MISS] landing_deals NOT in realtime';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    RAISE NOTICE '[OK]   notifications in realtime';
  ELSE
    RAISE NOTICE '[MISS] notifications NOT in realtime';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '--- ANALYTICS RPCs CHECK ---';
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_visitor_session') THEN
    RAISE NOTICE '[OK]   upsert_visitor_session() exists';
  ELSE
    RAISE NOTICE '[MISS] upsert_visitor_session() NOT found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mark_inactive_sessions') THEN
    RAISE NOTICE '[OK]   mark_inactive_sessions() exists';
  ELSE
    RAISE NOTICE '[MISS] mark_inactive_sessions() NOT found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_realtime_snapshot') THEN
    RAISE NOTICE '[OK]   save_realtime_snapshot() exists';
  ELSE
    RAISE NOTICE '[MISS] save_realtime_snapshot() NOT found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_sms_counter') THEN
    RAISE NOTICE '[OK]   increment_sms_counter() exists';
  ELSE
    RAISE NOTICE '[MISS] increment_sms_counter() NOT found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '--- REALTIME CHECK ---';
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'landing_analytics') THEN
    RAISE NOTICE '[OK]   landing_analytics in realtime';
  ELSE
    RAISE NOTICE '[MISS] landing_analytics NOT in realtime';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'visitor_sessions') THEN
    RAISE NOTICE '[OK]   visitor_sessions in realtime';
  ELSE
    RAISE NOTICE '[MISS] visitor_sessions NOT in realtime';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'analytics_events') THEN
    RAISE NOTICE '[OK]   analytics_events in realtime';
  ELSE
    RAISE NOTICE '[MISS] analytics_events NOT in realtime';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '--- STORAGE CHECK ---';
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'deal-photos') THEN
    RAISE NOTICE '[OK]   deal-photos bucket exists';
  ELSE
    RAISE NOTICE '[MISS] deal-photos bucket NOT found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '--- APP CONFIG CHECK ---';
  IF EXISTS (SELECT 1 FROM app_config WHERE key = 'admin_roles') THEN
    RAISE NOTICE '[OK]   admin_roles config exists';
  ELSE
    RAISE NOTICE '[MISS] admin_roles config NOT found';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '  VERIFICATION COMPLETE';
  RAISE NOTICE '========================================';
END $$;

SELECT 'jv_deals' as tbl, count(*) as rows FROM jv_deals
UNION ALL SELECT 'landing_deals', count(*) FROM landing_deals
UNION ALL SELECT 'profiles', count(*) FROM profiles
UNION ALL SELECT 'wallets', count(*) FROM wallets
UNION ALL SELECT 'transactions', count(*) FROM transactions
UNION ALL SELECT 'waitlist', count(*) FROM waitlist
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'audit_trail', count(*) FROM audit_trail
UNION ALL SELECT 'holdings', count(*) FROM holdings
UNION ALL SELECT 'emails', count(*) FROM emails
UNION ALL SELECT 'sms_messages', count(*) FROM sms_messages
UNION ALL SELECT 'app_config', count(*) FROM app_config
UNION ALL SELECT 'visitor_sessions', count(*) FROM visitor_sessions
UNION ALL SELECT 'realtime_snapshots', count(*) FROM realtime_snapshots
UNION ALL SELECT 'landing_analytics', count(*) FROM landing_analytics
ORDER BY tbl;
