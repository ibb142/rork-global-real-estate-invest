-- =====================================================================
-- IVX Member Signup — picture_url column
-- =====================================================================
-- Adds an optional profile picture URL to every member record.
--
-- HOW TO APPLY (one time, ~10 seconds, NO redeploy needed)
--   1. Open Supabase dashboard -> your project -> SQL Editor -> New query.
--   2. Paste this entire file and click Run.
--
-- This script is idempotent (safe to run more than once). The backend
-- reaches these tables via the service-role key, which bypasses RLS.
-- =====================================================================

-- 1. profiles.picture_url  (Supabase Auth user profile row) -------------
alter table public.profiles
  add column if not exists picture_url text default '';

comment on column public.profiles.picture_url is
  'Optional URL to the member profile picture in the member-pictures storage bucket.';

-- 2. members.picture_url  (canonical members registry) ------------------
alter table public.members
  add column if not exists picture_url text default '';

comment on column public.members.picture_url is
  'Optional URL to the member profile picture in the member-pictures storage bucket.';

-- 3. member-pictures storage bucket -------------------------------------
-- Public read so signup pictures are visible in the app + admin module.
insert into storage.buckets (id, name, public)
  values ('member-pictures', 'member-pictures', true)
  on conflict (id) do update set public = true;

-- 4. Storage policies (allow authenticated uploads, public reads) -------
drop policy if exists "member-pictures public read" on storage.objects;
create policy "member-pictures public read"
  on storage.objects for select
  using (bucket_id = 'member-pictures');

drop policy if exists "member-pictures authenticated upload" on storage.objects;
create policy "member-pictures authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'member-pictures');

drop policy if exists "member-pictures anon upload" on storage.objects;
create policy "member-pictures anon upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'member-pictures');
