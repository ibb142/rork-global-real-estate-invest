# IVX IA — Supabase Schema

Source of truth: `expo/deploy/supabase/ivx-platform-persistence-phase1.sql` (Phase 1).
Apply to a fresh Supabase project with:

```bash
psql "$SUPABASE_DB_URL" -f expo/deploy/supabase/ivx-platform-persistence-phase1.sql
```

Or via Supabase Dashboard → SQL Editor.

## Tables (all in `public`)

| Table | Purpose | RLS |
|---|---|---|
| `platform_settings` | Owner key/value app settings (JSONB). | Owner-only via `public.ivx_is_owner()`. |
| `fee_configurations` | Owner-controlled fee config; idempotent default seed (4 rows). | Owner-only. |
| `property_controls` | Per-property owner overrides (lock, override price, owner share). | Owner-only. |
| `notification_events` | Append log of email/sms/push/in_app/webhook deliveries. | Owner-only. |
| `deployment_history` | Owner-triggered deploy starts/finishes. | Owner-only. |
| `ai_usage_logs` | Per-request AI accounting. | Service-role inserts; owner read. |
| `audit_events` | Append-only owner action log. | Owner-only; no UPDATE/DELETE policies. |
| `public_chat_sessions` | Public visitor session metadata (Block 17). | Service-role only. |
| `public_chat_messages` | Public chat user/assistant turns (Block 17). | Service-role only. |

## Helper functions

- `public.ivx_is_owner()` → `boolean`. Reads `auth.uid()` and checks `profiles.role IN ('owner','admin','super_admin')`. Used in every owner-RLS policy.
- `public.ivx_touch_updated_at()` → trigger fn on row UPDATE.
- `public.ivx_exec_sql(sql text, params jsonb)` → guarded SQL RPC, used by `/api/ivx/developer-deploy/action` to apply migrations server-side. Service-role only.

## Triggers

- `platform_settings_touch_updated_at`, `fee_configurations_touch_updated_at`, `property_controls_touch_updated_at` — set `updated_at = now()` on UPDATE.

## Indexes (selected)

- `platform_settings_category_idx` on `(category)`.
- `fee_configurations_type_idx` on `(fee_type)`.
- `property_controls_property_id_idx`.
- `notification_events_created_at_idx`.
- `deployment_history_started_at_idx`.
- `ai_usage_logs_created_at_idx`.
- `audit_events_created_at_idx`, `audit_events_owner_id_idx`.
- `public_chat_messages_session_id_idx`, `public_chat_messages_created_at_idx`.

## Realtime publication

`supabase_realtime` includes:

- `platform_settings`
- `fee_configurations`
- `property_controls`
- `audit_events`

## Storage

### Bucket: `ivx-chat-uploads`

- `public: true`
- `file_size_limit: 52428800` (50 MB)
- Allowed MIME (selected): `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`, `text/plain`, `text/markdown`, `application/json`.

### Storage policies (`storage.objects`)

- `ivx_chat_uploads_public_select` — `FOR SELECT TO public USING (bucket_id = 'ivx-chat-uploads')`.
- `ivx_chat_uploads_auth_insert` — `FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ivx-chat-uploads')`.

> **Independence note**: in the Rork-hosted Supabase project these two policies could not be created via the management API because `storage.objects` is owned by `supabase_storage_admin` and policy creation requires `must be owner of table objects`. On a **fresh** Supabase project where you are the project owner, the migration applies cleanly. The backend-signed `POST /api/upload` route is also a working fallback that does not depend on these policies.

## Auth

- Email + password.
- Owner emails listed in `IVX_OWNER_REGISTRATION_EMAILS` env are granted `owner` role on first login (handled by `/api/ivx/owner-access-repair`).
- All admin routes guard via `useAdminGuard` → checks `profiles.role`.

## Independent-host migration order

```sql
-- 1. Apply Phase 1 schema (tables + RLS + storage bucket + policies + helpers).
\i expo/deploy/supabase/ivx-platform-persistence-phase1.sql

-- 2. Verify.
SELECT count(*) FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('platform_settings','fee_configurations','property_controls',
                      'notification_events','deployment_history','ai_usage_logs',
                      'audit_events','public_chat_sessions','public_chat_messages');
-- Expect: 9.

SELECT count(*) FROM storage.buckets WHERE id = 'ivx-chat-uploads';
-- Expect: 1.

SELECT count(*) FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename = 'objects'
   AND policyname IN ('ivx_chat_uploads_public_select','ivx_chat_uploads_auth_insert');
-- Expect: 2.
```

If the storage policy count is 0 on a fresh project, run the two `CREATE POLICY` statements directly in the Supabase Dashboard SQL Editor (you are the table owner there).
