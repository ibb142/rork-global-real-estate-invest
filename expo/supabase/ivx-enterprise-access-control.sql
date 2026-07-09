-- IVX Enterprise Access Control — Database schema
-- Creates tables for roles, permissions, departments, invites, sessions, audit logs,
-- and owner approvals. Owner role is protected and cannot be deleted or downgraded.

create extension if not exists pgcrypto;

-- ── Departments ──
create table if not exists public.ivx_departments (
  id text primary key,
  label text not null,
  created_at timestamptz default timezone('utc', now())
);

-- ── Roles ──
create table if not exists public.ivx_roles (
  id text primary key,
  label text not null,
  hierarchy_level integer not null default 0,
  can_invite boolean not null default false,
  can_deploy boolean not null default false,
  can_manage_money boolean not null default false,
  can_access_secrets boolean not null default false,
  requires_owner_approval boolean not null default false,
  created_at timestamptz default timezone('utc', now())
);

-- ── Permissions ──
create table if not exists public.ivx_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id text not null references public.ivx_roles(id) on delete cascade,
  module text not null,
  action text not null,
  created_at timestamptz default timezone('utc', now()),
  unique(role_id, module, action)
);

-- ── User roles (links auth.users to enterprise roles) ──
create table if not exists public.ivx_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  department text not null default 'general',
  status text not null default 'active',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz default timezone('utc', now()),
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now()),
  unique(user_id)
);

-- ── User permissions (granular overrides) ──
create table if not exists public.ivx_user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,
  action text not null,
  granted boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default timezone('utc', now()),
  unique(user_id, module, action)
);

-- ── Invites ──
create table if not exists public.ivx_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text,
  phone text,
  role text not null default 'member',
  department text not null default 'general',
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_by_email text,
  status text not null default 'pending',
  expires_at timestamptz not null,
  one_time boolean not null default true,
  used_at timestamptz,
  audit_note text,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_ivx_invites_token on public.ivx_invites(token);
create index if not exists idx_ivx_invites_email on public.ivx_invites(email);
create index if not exists idx_ivx_invites_status on public.ivx_invites(status);

-- ── Sessions (track active sessions for force-logout) ──
create table if not exists public.ivx_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_token_hash text not null,
  device_info text,
  ip_address text,
  created_at timestamptz default timezone('utc', now()),
  last_active_at timestamptz default timezone('utc', now()),
  revoked boolean not null default false,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_ivx_sessions_user on public.ivx_sessions(user_id);
create index if not exists idx_ivx_sessions_revoked on public.ivx_sessions(revoked);

-- ── Audit logs ──
create table if not exists public.ivx_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  target_email text,
  details text,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_ivx_audit_logs_actor on public.ivx_audit_logs(actor_id);
create index if not exists idx_ivx_audit_logs_action on public.ivx_audit_logs(action);
create index if not exists idx_ivx_audit_logs_created on public.ivx_audit_logs(created_at desc);

-- ── Owner approvals ──
create table if not exists public.ivx_owner_approvals (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requester_email text,
  requester_role text,
  action text not null,
  target_type text,
  target_id text,
  description text not null,
  status text not null default 'pending',
  owner_id uuid references auth.users(id) on delete set null,
  owner_decision_at timestamptz,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_ivx_owner_approvals_status on public.ivx_owner_approvals(status);

-- ── Access requests ──
create table if not exists public.ivx_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  requested_module text not null,
  requested_action text not null,
  reason text,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists idx_ivx_access_requests_status on public.ivx_access_requests(status);

-- ── RLS Policies ──
alter table public.ivx_user_roles enable row level security;
alter table public.ivx_user_permissions enable row level security;
alter table public.ivx_invites enable row level security;
alter table public.ivx_sessions enable row level security;
alter table public.ivx_audit_logs enable row level security;
alter table public.ivx_owner_approvals enable row level security;
alter table public.ivx_access_requests enable row level security;

-- Owner function (reused)
create or replace function public.ivx_is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.ivx_user_roles
      where user_id = auth.uid()
        and role = 'owner'
        and status = 'active'
    );
$$;

-- Privileged function (owner, staff, admin)
create or replace function public.ivx_is_privileged()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.ivx_user_roles
      where user_id = auth.uid()
        and role in ('owner', 'staff', 'admin')
        and status = 'active'
    );
$$;

-- User roles: self can read, privileged can read all, owner can write
drop policy if exists ivx_user_roles_select on public.ivx_user_roles;
create policy ivx_user_roles_select on public.ivx_user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.ivx_is_privileged());

drop policy if exists ivx_user_roles_insert on public.ivx_user_roles;
create policy ivx_user_roles_insert on public.ivx_user_roles
  for insert to authenticated
  with check (user_id = auth.uid() or public.ivx_is_owner());

drop policy if exists ivx_user_roles_update on public.ivx_user_roles;
create policy ivx_user_roles_update on public.ivx_user_roles
  for update to authenticated
  using (public.ivx_is_owner())
  with check (public.ivx_is_owner());

drop policy if exists ivx_user_roles_delete on public.ivx_user_roles;
create policy ivx_user_roles_delete on public.ivx_user_roles
  for delete to authenticated
  using (public.ivx_is_owner());

-- User permissions: self can read, owner can write
drop policy if exists ivx_user_permissions_select on public.ivx_user_permissions;
create policy ivx_user_permissions_select on public.ivx_user_permissions
  for select to authenticated
  using (user_id = auth.uid() or public.ivx_is_privileged());

drop policy if exists ivx_user_permissions_modify on public.ivx_user_permissions;
create policy ivx_user_permissions_modify on public.ivx_user_permissions
  for all to authenticated
  using (public.ivx_is_owner())
  with check (public.ivx_is_owner());

-- Invites: self can read own, privileged can read all, owner/staff can create
drop policy if exists ivx_invites_select on public.ivx_invites;
create policy ivx_invites_select on public.ivx_invites
  for select to authenticated
  using (invited_by = auth.uid() or public.ivx_is_privileged());

drop policy if exists ivx_invites_insert on public.ivx_invites;
create policy ivx_invites_insert on public.ivx_invites
  for insert to authenticated
  with check (public.ivx_is_privileged());

drop policy if exists ivx_invites_update on public.ivx_invites;
create policy ivx_invites_update on public.ivx_invites
  for update to authenticated
  using (public.ivx_is_owner() or invited_by = auth.uid())
  with check (public.ivx_is_owner() or invited_by = auth.uid());

-- Sessions: self can read, owner can manage all
drop policy if exists ivx_sessions_select on public.ivx_sessions;
create policy ivx_sessions_select on public.ivx_sessions
  for select to authenticated
  using (user_id = auth.uid() or public.ivx_is_owner());

drop policy if exists ivx_sessions_insert on public.ivx_sessions;
create policy ivx_sessions_insert on public.ivx_sessions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ivx_sessions_update on public.ivx_sessions;
create policy ivx_sessions_update on public.ivx_sessions
  for update to authenticated
  using (user_id = auth.uid() or public.ivx_is_owner());

-- Audit logs: privileged can read, authenticated can write own
drop policy if exists ivx_audit_logs_select on public.ivx_audit_logs;
create policy ivx_audit_logs_select on public.ivx_audit_logs
  for select to authenticated
  using (public.ivx_is_privileged());

drop policy if exists ivx_audit_logs_insert on public.ivx_audit_logs;
create policy ivx_audit_logs_insert on public.ivx_audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid());

-- Owner approvals: self can read own, owner can read all, self can create
drop policy if exists ivx_owner_approvals_select on public.ivx_owner_approvals;
create policy ivx_owner_approvals_select on public.ivx_owner_approvals
  for select to authenticated
  using (requester_id = auth.uid() or public.ivx_is_owner());

drop policy if exists ivx_owner_approvals_insert on public.ivx_owner_approvals;
create policy ivx_owner_approvals_insert on public.ivx_owner_approvals
  for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists ivx_owner_approvals_update on public.ivx_owner_approvals;
create policy ivx_owner_approvals_update on public.ivx_owner_approvals
  for update to authenticated
  using (public.ivx_is_owner())
  with check (public.ivx_is_owner());

-- Access requests: self can read own, privileged can read all, self can create
drop policy if exists ivx_access_requests_select on public.ivx_access_requests;
create policy ivx_access_requests_select on public.ivx_access_requests
  for select to authenticated
  using (user_id = auth.uid() or public.ivx_is_privileged());

drop policy if exists ivx_access_requests_insert on public.ivx_access_requests;
create policy ivx_access_requests_insert on public.ivx_access_requests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ivx_access_requests_update on public.ivx_access_requests;
create policy ivx_access_requests_update on public.ivx_access_requests
  for update to authenticated
  using (public.ivx_is_owner() or public.ivx_is_privileged())
  with check (public.ivx_is_owner() or public.ivx_is_privileged());

-- ── Security trigger: prevent owner role deletion/downgrade ──
create or replace function public.protect_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Prevent changing an owner's role to something else
  if OLD.role = 'owner' and NEW.role != 'owner' then
    raise exception 'Owner role cannot be downgraded';
  end if;
  -- Prevent deleting an owner
  if TG_OP = 'DELETE' and OLD.role = 'owner' then
    raise exception 'Owner cannot be deleted';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_owner_role on public.ivx_user_roles;
create trigger trg_protect_owner_role
  before update or delete on public.ivx_user_roles
  for each row
  execute function public.protect_owner_role();

-- ── Seed roles ──
insert into public.ivx_roles (id, label, hierarchy_level, can_invite, can_deploy, can_manage_money, can_access_secrets, requires_owner_approval)
values
  ('owner', 'Owner', 100, true, true, true, true, false),
  ('staff', 'IVX Staff', 60, false, false, false, false, true),
  ('admin', 'Admin', 50, true, false, false, false, true),
  ('investor', 'Investor', 20, false, false, false, false, false),
  ('buyer', 'Buyer', 20, false, false, false, false, false),
  ('member', 'Member', 10, false, false, false, false, false),
  ('realtor', 'Realtor', 15, false, false, false, false, false),
  ('influencer', 'Influencer', 15, false, false, false, false, false),
  ('partner', 'Partner', 15, false, false, false, false, false),
  ('lender', 'Lender', 15, false, false, false, false, false)
on conflict (id) do nothing;

-- ── Seed departments ──
insert into public.ivx_departments (id, label)
values
  ('executive', 'Executive'),
  ('engineering', 'Engineering'),
  ('operations', 'Operations'),
  ('finance', 'Finance'),
  ('investments', 'Investments'),
  ('properties', 'Properties'),
  ('crm', 'CRM'),
  ('marketing', 'Marketing'),
  ('compliance', 'Compliance'),
  ('support', 'Support'),
  ('deployments', 'Deployments'),
  ('investor_relations', 'Investor Relations'),
  ('buyer_relations', 'Buyer Relations'),
  ('general', 'General')
on conflict (id) do nothing;
