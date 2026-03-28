-- =============================================================================
-- IVXHOLDINGS — NUKE ALL TABLES & START FRESH
-- =============================================================================
-- WARNING: This DELETES ALL DATA. Only use if database is broken.
-- After running this, run supabase-master.sql to rebuild everything.
-- =============================================================================

DROP TABLE IF EXISTS image_health_reports CASCADE;
DROP TABLE IF EXISTS image_backups CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS engagement_scoring CASCADE;
DROP TABLE IF EXISTS re_engagement_triggers CASCADE;
DROP TABLE IF EXISTS search_discovery CASCADE;
DROP TABLE IF EXISTS utm_analytics CASCADE;
DROP TABLE IF EXISTS ad_pixels CASCADE;
DROP TABLE IF EXISTS audience_segments CASCADE;
DROP TABLE IF EXISTS retargeting_dashboard CASCADE;
DROP TABLE IF EXISTS realtime_snapshots CASCADE;
DROP TABLE IF EXISTS visitor_sessions CASCADE;
DROP TABLE IF EXISTS landing_analytics CASCADE;
DROP TABLE IF EXISTS app_config CASCADE;
DROP TABLE IF EXISTS image_registry CASCADE;
DROP TABLE IF EXISTS market_index CASCADE;
DROP TABLE IF EXISTS market_data CASCADE;
DROP TABLE IF EXISTS properties CASCADE;
DROP TABLE IF EXISTS push_tokens CASCADE;
DROP TABLE IF EXISTS influencer_applications CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS imported_lenders CASCADE;
DROP TABLE IF EXISTS lender_sync_jobs CASCADE;
DROP TABLE IF EXISTS synced_lenders CASCADE;
DROP TABLE IF EXISTS lender_sync_config CASCADE;
DROP TABLE IF EXISTS lender_sync_stats CASCADE;
DROP TABLE IF EXISTS sms_messages CASCADE;
DROP TABLE IF EXISTS sms_reports CASCADE;
DROP TABLE IF EXISTS referral_invites CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS kyc_documents CASCADE;
DROP TABLE IF EXISTS kyc_verifications CASCADE;
DROP TABLE IF EXISTS earn_payouts CASCADE;
DROP TABLE IF EXISTS earn_deposits CASCADE;
DROP TABLE IF EXISTS earn_accounts CASCADE;
DROP TABLE IF EXISTS ipx_purchases CASCADE;
DROP TABLE IF EXISTS ipx_holdings CASCADE;
DROP TABLE IF EXISTS repair_logs CASCADE;
DROP TABLE IF EXISTS auto_repair_scans CASCADE;
DROP TABLE IF EXISTS ai_brain_status CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS signups CASCADE;
DROP TABLE IF EXISTS staff_activity_log CASCADE;
DROP TABLE IF EXISTS staff_activity CASCADE;
DROP TABLE IF EXISTS system_metrics CASCADE;
DROP TABLE IF EXISTS system_health CASCADE;
DROP TABLE IF EXISTS analytics_investments CASCADE;
DROP TABLE IF EXISTS analytics_retention CASCADE;
DROP TABLE IF EXISTS analytics_kpi CASCADE;
DROP TABLE IF EXISTS analytics_dashboard CASCADE;
DROP TABLE IF EXISTS analytics_events CASCADE;
DROP TABLE IF EXISTS landing_deals CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS holdings CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS jv_deals CASCADE;

DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS ivx_auto_setup() CASCADE;
DROP FUNCTION IF EXISTS increment_jv_version() CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS is_owner_of(TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_user_role() CASCADE;
DROP FUNCTION IF EXISTS verify_admin_access() CASCADE;
DROP FUNCTION IF EXISTS increment_sms_counter(TEXT) CASCADE;
DROP FUNCTION IF EXISTS upsert_visitor_session(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS mark_inactive_sessions() CASCADE;
DROP FUNCTION IF EXISTS save_realtime_snapshot(INTEGER, INTEGER, INTEGER, JSONB, JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS ensure_deal_photos_bucket() CASCADE;

DELETE FROM storage.objects WHERE bucket_id = 'deal-photos';
DELETE FROM storage.buckets WHERE id = 'deal-photos';

-- Database is now CLEAN. Run supabase-master.sql to rebuild.
