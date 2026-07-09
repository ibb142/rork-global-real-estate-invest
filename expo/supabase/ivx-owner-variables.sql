-- IVX Owner Variables — encrypted credential store + audit log
-- Run this migration in Supabase SQL Editor.
-- Creates: ivx_owner_variables, ivx_owner_variable_audit_logs

-- ============================================================================
-- ivx_owner_variables
--   Stores encrypted credential values keyed by variable name.
--   Only the backend (service_role) can read/write; RLS blocks anon + authenticated.
-- ============================================================================
create table if not exists public.ivx_owner_variables (
  name              text primary key,
  provider          text not null default 'security',
  encrypted_value   text not null,
  masked_preview    text,
  status            text not null default 'saved',
  last_tested_at    timestamptz,
  last_test_result  text,
  last_saved_at     timestamptz not null default now(),
  last_saved_by     text,
  required          boolean not null default true,
  secret            boolean not null default true,
  description       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- RLS: only service_role can access this table
alter table public.ivx_owner_variables enable row level security;

drop policy if exists "ivx_owner_variables_service_role_all" on public.ivx_owner_variables;
create policy "ivx_owner_variables_service_role_all"
  on public.ivx_owner_variables
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================================
-- ivx_owner_variable_audit_logs
--   Append-only audit trail for every save/edit/delete/test action.
--   Never stores the secret value — only the action, variable name, and result.
-- ============================================================================
create table if not exists public.ivx_owner_variable_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  variable    text not null,
  provider    text,
  action      text not null,
  result      text,
  actor_id    text,
  actor_email text,
  detail      text,
  created_at  timestamptz not null default now()
);

alter table public.ivx_owner_variable_audit_logs enable row level security;

drop policy if exists "ivx_owner_variable_audit_logs_service_role_all" on public.ivx_owner_variable_audit_logs;
create policy "ivx_owner_variable_audit_logs_service_role_all"
  on public.ivx_owner_variable_audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Index for recent-first queries
create index if not exists ivx_owner_variable_audit_logs_created_at_idx
  on public.ivx_owner_variable_audit_logs (created_at desc);

-- ============================================================================
-- Helpful view for owner dashboards (metadata only, no secrets)
-- ============================================================================
create or replace view public.ivx_owner_variables_status as
  select
    name,
    provider,
    required,
    secret,
    status,
    masked_preview,
    last_tested_at,
    last_test_result,
    last_saved_at,
    last_saved_by,
    description,
    updated_at
  from public.ivx_owner_variables;

comment on table public.ivx_owner_variables is
  'Encrypted credential store for IVX owner-managed variables. Service-role only.';
comment on table public.ivx_owner_variable_audit_logs is
  'Append-only audit trail for credential save/edit/delete/test actions. No secret values stored.';
