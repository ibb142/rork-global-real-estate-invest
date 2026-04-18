export const IVX_SECURITY_HOTFIX_SQL = `-- IVX SUPABASE SECURITY HOTFIX
-- Drops permissive policies, replaces with owner-only or row-scoped policies.

CREATE OR REPLACE FUNCTION public.ivx_is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND regexp_replace(lower(coalesce(role, 'investor')), '[^a-z0-9]+', '', 'g') IN ('owner', 'owneradmin', 'ivxowner', 'developer', 'dev', 'admin', 'superadmin', 'administrator', 'founder', 'staff', 'staffmember', 'ceo', 'manager', 'analyst', 'support')
    );
$$;

-- 1. PROFILES: row-scoped, owner sees all
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.ivx_is_owner());

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.ivx_is_owner())
  WITH CHECK (auth.uid() = id OR public.ivx_is_owner());

-- 2. WALLETS: remove permissive admin_all
DROP POLICY IF EXISTS "wallets_admin_all" ON public.wallets;
DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
DROP POLICY IF EXISTS "wallets_insert_own" ON public.wallets;
DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;

CREATE POLICY "wallets_select_own" ON public.wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "wallets_insert_own" ON public.wallets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wallets_update_own" ON public.wallets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner())
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

-- 3. WALLET_TRANSACTIONS: row-scoped
DROP POLICY IF EXISTS "wtx_select_own" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wtx_insert_auth" ON public.wallet_transactions;

CREATE POLICY "wtx_select_own" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "wtx_insert_auth" ON public.wallet_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

-- 4. HOLDINGS: row-scoped
DROP POLICY IF EXISTS "holdings_select_own" ON public.holdings;
DROP POLICY IF EXISTS "holdings_insert_auth" ON public.holdings;
DROP POLICY IF EXISTS "holdings_update_auth" ON public.holdings;
DROP POLICY IF EXISTS "holdings_delete_auth" ON public.holdings;

CREATE POLICY "holdings_select_own" ON public.holdings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "holdings_insert_own" ON public.holdings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "holdings_update_own" ON public.holdings
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner())
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "holdings_delete_own" ON public.holdings
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

-- 5. TRANSACTIONS: row-scoped
DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_auth" ON public.transactions;

CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

-- 6. ORDERS: row-scoped
DROP POLICY IF EXISTS "orders_select_auth" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_auth" ON public.orders;
DROP POLICY IF EXISTS "orders_update_auth" ON public.orders;

CREATE POLICY "orders_select_own" ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "orders_insert_own" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "orders_update_own" ON public.orders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner())
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

-- 7. NOTIFICATIONS: row-scoped
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_auth" ON public.notifications;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "notifications_insert_own" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner())
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

-- 8. KYC: row-scoped, owner reviews
DROP POLICY IF EXISTS "kyc_select_own" ON public.kyc_verifications;
DROP POLICY IF EXISTS "kyc_update_auth" ON public.kyc_verifications;

CREATE POLICY "kyc_select_own" ON public.kyc_verifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

CREATE POLICY "kyc_update_own" ON public.kyc_verifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner())
  WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());

DROP POLICY IF EXISTS "kyc_docs_select_auth" ON public.kyc_documents;
CREATE POLICY "kyc_docs_select_own" ON public.kyc_documents
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.ivx_is_owner());

-- 9. PROPERTIES: public read, owner write
DROP POLICY IF EXISTS "properties_insert_auth" ON public.properties;
DROP POLICY IF EXISTS "properties_update_auth" ON public.properties;

CREATE POLICY "properties_insert_owner" ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (public.ivx_is_owner());

CREATE POLICY "properties_update_owner" ON public.properties
  FOR UPDATE TO authenticated
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- 10. MARKET_DATA/MARKET_INDEX: public read, owner write
DROP POLICY IF EXISTS "market_data_insert_auth" ON public.market_data;
DROP POLICY IF EXISTS "market_data_update_auth" ON public.market_data;

CREATE POLICY "market_data_insert_owner" ON public.market_data
  FOR INSERT TO authenticated
  WITH CHECK (public.ivx_is_owner());

CREATE POLICY "market_data_update_owner" ON public.market_data
  FOR UPDATE TO authenticated
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "market_index_auth_write" ON public.market_index;
CREATE POLICY "market_index_owner_write" ON public.market_index
  FOR ALL TO authenticated
  USING (public.ivx_is_owner())
  WITH CHECK (public.ivx_is_owner());

-- 11. WAITLIST: keep anon/auth insert, owner-only read/update/delete
DROP POLICY IF EXISTS "waitlist_auth_select" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_auth_update" ON public.waitlist;
CREATE POLICY "waitlist_owner_select" ON public.waitlist
  FOR SELECT TO authenticated USING (public.ivx_is_owner());
CREATE POLICY "waitlist_owner_update" ON public.waitlist
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY "waitlist_owner_delete" ON public.waitlist
  FOR DELETE TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "waitlist_entries_auth_select" ON public.waitlist_entries;
DROP POLICY IF EXISTS "waitlist_entries_auth_update" ON public.waitlist_entries;
CREATE POLICY "waitlist_entries_owner_select" ON public.waitlist_entries
  FOR SELECT TO authenticated USING (public.ivx_is_owner());
CREATE POLICY "waitlist_entries_owner_update" ON public.waitlist_entries
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY "waitlist_entries_owner_delete" ON public.waitlist_entries
  FOR DELETE TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "otp_events_auth_select" ON public.waitlist_otp_events;
CREATE POLICY "otp_events_owner_select" ON public.waitlist_otp_events
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "email_queue_auth_select" ON public.email_notifications_queue;
CREATE POLICY "email_queue_owner_select" ON public.email_notifications_queue
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

-- 12. JV_DEALS: public read published, owner write
DROP POLICY IF EXISTS "jv_deals_select_all" ON public.jv_deals;
DROP POLICY IF EXISTS "jv_deals_insert_auth" ON public.jv_deals;
DROP POLICY IF EXISTS "jv_deals_update_auth" ON public.jv_deals;
DROP POLICY IF EXISTS "jv_deals_delete_auth" ON public.jv_deals;

CREATE POLICY "jv_deals_select_published" ON public.jv_deals
  FOR SELECT TO authenticated USING (published = true OR public.ivx_is_owner());
CREATE POLICY "jv_deals_select_anon" ON public.jv_deals
  FOR SELECT TO anon USING (published = true);
CREATE POLICY "jv_deals_insert_owner" ON public.jv_deals
  FOR INSERT TO authenticated WITH CHECK (public.ivx_is_owner());
CREATE POLICY "jv_deals_update_owner" ON public.jv_deals
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY "jv_deals_delete_owner" ON public.jv_deals
  FOR DELETE TO authenticated USING (public.ivx_is_owner());

-- 13. LANDING TABLES: keep public read/anon insert, owner write
DROP POLICY IF EXISTS "landing_deals_insert_auth" ON public.landing_deals;
DROP POLICY IF EXISTS "landing_deals_update_auth" ON public.landing_deals;
DROP POLICY IF EXISTS "landing_deals_delete_auth" ON public.landing_deals;
CREATE POLICY "landing_deals_insert_owner" ON public.landing_deals
  FOR INSERT TO authenticated WITH CHECK (public.ivx_is_owner());
CREATE POLICY "landing_deals_update_owner" ON public.landing_deals
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY "landing_deals_delete_owner" ON public.landing_deals
  FOR DELETE TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "landing_submissions_auth_select" ON public.landing_submissions;
CREATE POLICY "landing_submissions_owner_select" ON public.landing_submissions
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "landing_analytics_auth_select" ON public.landing_analytics;
CREATE POLICY "landing_analytics_owner_select" ON public.landing_analytics
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "landing_investments_auth_all" ON public.landing_investments;
CREATE POLICY "landing_investments_owner_all" ON public.landing_investments
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "landing_page_config_auth_all" ON public.landing_page_config;
CREATE POLICY "landing_page_config_select_all" ON public.landing_page_config
  FOR SELECT USING (true);
CREATE POLICY "landing_page_config_owner_write" ON public.landing_page_config
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "landing_deployments_auth_all" ON public.landing_deployments;
CREATE POLICY "landing_deployments_owner_all" ON public.landing_deployments
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 14. ANALYTICS: owner-only read
DROP POLICY IF EXISTS "analytics_events_select_auth" ON public.analytics_events;
CREATE POLICY "analytics_events_owner_select" ON public.analytics_events
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "analytics_dashboard_auth_all" ON public.analytics_dashboard;
CREATE POLICY "analytics_dashboard_owner_all" ON public.analytics_dashboard
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "analytics_kpi_auth_all" ON public.analytics_kpi;
CREATE POLICY "analytics_kpi_owner_all" ON public.analytics_kpi
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "analytics_retention_auth_all" ON public.analytics_retention;
CREATE POLICY "analytics_retention_owner_all" ON public.analytics_retention
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "analytics_investments_auth_all" ON public.analytics_investments;
CREATE POLICY "analytics_investments_owner_all" ON public.analytics_investments
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "visitor_sessions_auth_select" ON public.visitor_sessions;
CREATE POLICY "visitor_sessions_owner_select" ON public.visitor_sessions
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "realtime_snapshots_auth_select" ON public.realtime_snapshots;
DROP POLICY IF EXISTS "realtime_snapshots_auth_insert" ON public.realtime_snapshots;
CREATE POLICY "realtime_snapshots_owner_all" ON public.realtime_snapshots
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 15. SMS: owner-only
DROP POLICY IF EXISTS "sms_reports_auth_all" ON public.sms_reports;
CREATE POLICY "sms_reports_owner_all" ON public.sms_reports
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "sms_messages_auth_all" ON public.sms_messages;
CREATE POLICY "sms_messages_owner_all" ON public.sms_messages
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 16. LENDER TABLES: owner-only
DROP POLICY IF EXISTS "imported_lenders_auth_all" ON public.imported_lenders;
CREATE POLICY "imported_lenders_owner_all" ON public.imported_lenders
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "synced_lenders_auth_all" ON public.synced_lenders;
CREATE POLICY "synced_lenders_owner_all" ON public.synced_lenders
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "lender_sync_stats_auth_all" ON public.lender_sync_stats;
CREATE POLICY "lender_sync_stats_owner_all" ON public.lender_sync_stats
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "lender_sync_config_auth_all" ON public.lender_sync_config;
CREATE POLICY "lender_sync_config_owner_all" ON public.lender_sync_config
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "lender_sync_jobs_auth_all" ON public.lender_sync_jobs;
CREATE POLICY "lender_sync_jobs_owner_all" ON public.lender_sync_jobs
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 17. IMAGE MANAGEMENT: public read on registry, owner write
DROP POLICY IF EXISTS "image_registry_insert_auth" ON public.image_registry;
DROP POLICY IF EXISTS "image_registry_update_auth" ON public.image_registry;
DROP POLICY IF EXISTS "image_registry_delete_auth" ON public.image_registry;
CREATE POLICY "image_registry_insert_owner" ON public.image_registry
  FOR INSERT TO authenticated WITH CHECK (public.ivx_is_owner());
CREATE POLICY "image_registry_update_owner" ON public.image_registry
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());
CREATE POLICY "image_registry_delete_owner" ON public.image_registry
  FOR DELETE TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "image_backups_auth_all" ON public.image_backups;
CREATE POLICY "image_backups_owner_all" ON public.image_backups
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "image_health_reports_auth_all" ON public.image_health_reports;
CREATE POLICY "image_health_reports_owner_all" ON public.image_health_reports
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 18. ADMIN/SYSTEM: owner-only
DROP POLICY IF EXISTS "audit_trail_auth_select" ON public.audit_trail;
DROP POLICY IF EXISTS "audit_trail_auth_insert" ON public.audit_trail;
CREATE POLICY "audit_trail_owner_all" ON public.audit_trail
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "error_logs_auth_select" ON public.error_logs;
CREATE POLICY "error_logs_owner_select" ON public.error_logs
  FOR SELECT TO authenticated USING (public.ivx_is_owner());

DROP POLICY IF EXISTS "system_health_auth_all" ON public.system_health;
CREATE POLICY "system_health_owner_all" ON public.system_health
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "system_metrics_auth_all" ON public.system_metrics;
CREATE POLICY "system_metrics_owner_all" ON public.system_metrics
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "staff_activity_auth_all" ON public.staff_activity;
CREATE POLICY "staff_activity_owner_all" ON public.staff_activity
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "staff_activity_log_auth_all" ON public.staff_activity_log;
CREATE POLICY "staff_activity_log_owner_all" ON public.staff_activity_log
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "app_config_auth_write" ON public.app_config;
CREATE POLICY "app_config_owner_write" ON public.app_config
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "feature_flags_auth_write" ON public.feature_flags;
CREATE POLICY "feature_flags_owner_write" ON public.feature_flags
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "team_members_auth_all" ON public.team_members;
CREATE POLICY "team_members_owner_all" ON public.team_members
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "push_tokens_insert_auth" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_select_auth" ON public.push_tokens;
CREATE POLICY "push_tokens_insert_own" ON public.push_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_tokens_select_own" ON public.push_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.ivx_is_owner());

-- 19. APP TABLES
DROP POLICY IF EXISTS "signups_auth_all" ON public.signups;
CREATE POLICY "signups_owner_all" ON public.signups
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "applications_auth_all" ON public.applications;
CREATE POLICY "applications_select" ON public.applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.ivx_is_owner());
CREATE POLICY "applications_insert" ON public.applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());
CREATE POLICY "applications_update_owner" ON public.applications
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "support_tickets_auth_all" ON public.support_tickets;
CREATE POLICY "support_tickets_select" ON public.support_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.ivx_is_owner());
CREATE POLICY "support_tickets_insert" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.ivx_is_owner());
CREATE POLICY "support_tickets_update_owner" ON public.support_tickets
  FOR UPDATE TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "influencer_applications_auth_all" ON public.influencer_applications;
CREATE POLICY "influencer_applications_owner_all" ON public.influencer_applications
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "ai_brain_status_auth_all" ON public.ai_brain_status;
CREATE POLICY "ai_brain_status_owner_all" ON public.ai_brain_status
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "auto_repair_scans_auth_all" ON public.auto_repair_scans;
CREATE POLICY "auto_repair_scans_owner_all" ON public.auto_repair_scans
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "repair_logs_auth_all" ON public.repair_logs;
CREATE POLICY "repair_logs_owner_all" ON public.repair_logs
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "emails_auth_all" ON public.emails;
CREATE POLICY "emails_owner_all" ON public.emails
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 20. MARKETING/RETARGETING: owner-only
DROP POLICY IF EXISTS "retargeting_dashboard_auth_all" ON public.retargeting_dashboard;
CREATE POLICY "retargeting_dashboard_owner_all" ON public.retargeting_dashboard
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "audience_segments_auth_all" ON public.audience_segments;
CREATE POLICY "audience_segments_owner_all" ON public.audience_segments
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "ad_pixels_auth_all" ON public.ad_pixels;
CREATE POLICY "ad_pixels_owner_all" ON public.ad_pixels
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "utm_analytics_auth_all" ON public.utm_analytics;
CREATE POLICY "utm_analytics_owner_all" ON public.utm_analytics
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "search_discovery_auth_all" ON public.search_discovery;
CREATE POLICY "search_discovery_owner_all" ON public.search_discovery
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "re_engagement_triggers_auth_all" ON public.re_engagement_triggers;
CREATE POLICY "re_engagement_triggers_owner_all" ON public.re_engagement_triggers
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

DROP POLICY IF EXISTS "engagement_scoring_auth_all" ON public.engagement_scoring;
CREATE POLICY "engagement_scoring_owner_all" ON public.engagement_scoring
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 21. db-setup.sql tables: owner-only
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'lenders','title_companies','title_company_assignments','title_documents',
      'property_document_submissions','fee_configurations','ipx_fee_configs',
      'broadcast_templates','email_accounts','email_templates','email_campaigns',
      'smtp_configs','email_logs','land_partner_deals','social_media_content',
      'marketing_campaigns','influencers','trackable_links','referrals',
      'vip_tiers','audit_log','system_health_checks'
    ])
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated read" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated update" ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY "owner_only_all" ON public.%I FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner())',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "owner_only_all" ON public.vip_tiers;
CREATE POLICY "vip_tiers_select_all" ON public.vip_tiers FOR SELECT USING (true);
CREATE POLICY "vip_tiers_owner_write" ON public.vip_tiers
  FOR ALL TO authenticated USING (public.ivx_is_owner()) WITH CHECK (public.ivx_is_owner());

-- 22. STORAGE BUCKETS
UPDATE storage.buckets SET public = false WHERE id IN ('investor-intake', 'chat-uploads');

DROP POLICY IF EXISTS "deal_photos_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "investor_intake_public_select" ON storage.objects;
DROP POLICY IF EXISTS "investor_intake_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "investor_intake_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "landing_page_auth_all" ON storage.objects;
DROP POLICY IF EXISTS "chat_uploads_public_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_uploads_auth_insert" ON storage.objects;

CREATE POLICY "deal_photos_owner_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'deal-photos' AND public.ivx_is_owner());

CREATE POLICY "investor_intake_anon_insert_v2" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'investor-intake');
CREATE POLICY "investor_intake_auth_insert_v2" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'investor-intake');
CREATE POLICY "investor_intake_owner_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'investor-intake' AND public.ivx_is_owner());

CREATE POLICY "landing_page_owner_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'landing-page' AND public.ivx_is_owner())
  WITH CHECK (bucket_id = 'landing-page' AND public.ivx_is_owner());

CREATE POLICY "chat_uploads_auth_insert_v2" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-uploads');
CREATE POLICY "chat_uploads_auth_select_v2" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'chat-uploads');

DROP POLICY IF EXISTS "kyc_docs_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "kyc_docs_auth_select" ON storage.objects;
CREATE POLICY "kyc_docs_auth_insert_v2" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'kyc-documents');
CREATE POLICY "kyc_docs_owner_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'kyc-documents' AND public.ivx_is_owner());

-- 23. FORCE RLS
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', tbl.schemaname, tbl.tablename);
  END LOOP;
END
$$;

SELECT 'IVX Security Hotfix applied — ' || now()::text AS result;`;
