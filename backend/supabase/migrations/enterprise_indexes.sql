-- IVX Enterprise Database Optimization — Index Migration
-- Created: 2026-07-16
-- Purpose: Add missing indexes for high-traffic query patterns
-- Safety: All CREATE INDEX IF NOT EXISTS — safe to run multiple times
--          No table locks on Postgres (CONCURRENTLY not needed for new indexes on small tables)

-- ── High-priority: project_id indexes on engagement tables ──────────────────
-- These tables are filtered by project_id in ~30 query sites

CREATE INDEX IF NOT EXISTS idx_project_media_project_id
  ON project_media (project_id);

CREATE INDEX IF NOT EXISTS idx_project_media_project_approved
  ON project_media (project_id, is_approved);

CREATE INDEX IF NOT EXISTS idx_project_media_type_approved
  ON project_media (media_type, is_approved);

CREATE INDEX IF NOT EXISTS idx_project_media_position
  ON project_media (position);

CREATE INDEX IF NOT EXISTS idx_project_videos_project_id
  ON project_videos (project_id);

CREATE INDEX IF NOT EXISTS idx_project_videos_project_approved
  ON project_videos (project_id, is_approved);

CREATE INDEX IF NOT EXISTS idx_project_videos_pinned_created
  ON project_videos (is_pinned DESC, created_at);

CREATE INDEX IF NOT EXISTS idx_project_likes_project_id
  ON project_likes (project_id);

CREATE INDEX IF NOT EXISTS idx_project_comments_project_id
  ON project_comments (project_id);

CREATE INDEX IF NOT EXISTS idx_project_comments_proj_approved
  ON project_comments (project_id, is_approved);

CREATE INDEX IF NOT EXISTS idx_project_shares_project_id
  ON project_shares (project_id);

CREATE INDEX IF NOT EXISTS idx_project_saves_project_id
  ON project_saves (project_id);

CREATE INDEX IF NOT EXISTS idx_project_engagement_project_id
  ON project_engagement (project_id);

CREATE INDEX IF NOT EXISTS idx_project_analytics_project_date
  ON project_analytics (project_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_project_analytics_date
  ON project_analytics (date DESC);

-- ── JV deals: published + status + created_at (landing page queries) ─────────

CREATE INDEX IF NOT EXISTS idx_jv_deals_published_status_created
  ON jv_deals (published, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jv_deals_published
  ON jv_deals (published);

CREATE INDEX IF NOT EXISTS idx_jv_deals_status
  ON jv_deals (status);

CREATE INDEX IF NOT EXISTS idx_jv_deals_created_at
  ON jv_deals (created_at DESC);

-- ── Properties: created_at ordering ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_properties_created_at
  ON properties (created_at DESC);

-- ── Members & Investors: created_at ordering ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_members_created_at
  ON members (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_investors_created_at
  ON investors (created_at DESC);

-- ── Leads: created_at ordering ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON leads (created_at DESC);

-- ── Conversations & Messages: chat hot path ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages (conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_slug
  ON conversations (slug);

CREATE INDEX IF NOT EXISTS idx_inbox_state_conv_user
  ON inbox_state (conversation_id, user_id);

-- ── AI request audit: request_id + updated_at ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_requests_request_id
  ON ivx_owner_ai_requests (request_id);

CREATE INDEX IF NOT EXISTS idx_ai_requests_updated_at
  ON ivx_owner_ai_requests (updated_at DESC);

-- ── Verification codes: user_id + type ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_type
  ON verification_codes (user_id, type);

-- ── Profiles: email, phone, last_timezone_update ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON profiles (email);

CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON profiles (phone);

CREATE INDEX IF NOT EXISTS idx_profiles_last_tz_update
  ON profiles (last_timezone_update DESC);

-- ── Property controls: is_featured ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_property_controls_featured
  ON property_controls (is_featured);

-- ──── Landing investments: transaction_id ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_landing_investments_tx_id
  ON landing_investments (transaction_id);

-- ── Knowledge chunks: source_id + chunk_index ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_chunk
  ON knowledge_chunks (source_id, chunk_index);

-- ── Agent jobs: status + created_at (worker polling) ────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_created
  ON agent_jobs (status, created_at ASC);

-- ── Developer proof ledger: task_id ─────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_proof_ledger_task_id
  ON ivx_developer_proof_ledger (task_id);

-- ── Verification: run this to check index coverage ──────────────────────────
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;
