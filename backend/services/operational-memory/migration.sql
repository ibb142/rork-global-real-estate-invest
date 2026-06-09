-- IVX Operational Memory schema (Block 23)
-- Idempotent. Safe to run multiple times.

create extension if not exists vector;

create table if not exists public.ivx_operational_memory (
  id text primary key default gen_random_uuid()::text,
  category text not null check (category in ('architecture','deployment','incident','fix','roadmap','repo_index','task_state','note')),
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  source text,
  ref_id text,
  embedding vector(1536),
  embedding_dim integer not null default 1536,
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ivx_op_memory_category_idx on public.ivx_operational_memory (category, created_at desc);
create index if not exists ivx_op_memory_ref_idx on public.ivx_operational_memory (source, ref_id);
create index if not exists ivx_op_memory_embedding_idx
  on public.ivx_operational_memory using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.ivx_operational_memory enable row level security;

create table if not exists public.ivx_agent_tasks (
  id text primary key default gen_random_uuid()::text,
  goal text not null,
  status text not null default 'queued' check (status in ('queued','analyzing','planning','patching','testing','validating','deploying','verifying','completed','failed','rolled_back','canceled')),
  steps jsonb not null default '[]'::jsonb,
  rollback_token text,
  rollback_applied boolean not null default false,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ivx_agent_tasks_status_idx on public.ivx_agent_tasks (status, created_at desc);

alter table public.ivx_agent_tasks enable row level security;

comment on table public.ivx_operational_memory is 'IVX Block 23 vector-indexed operational memory. Backend service-role is the access boundary.';
comment on table public.ivx_agent_tasks is 'IVX Block 23 autonomous execution loop task state.';

select pg_notify('pgrst','reload schema');
