import { SQL } from 'bun';

const url = process.env.LIFECYCLE_DB_URL;
if (!url) {
  console.error('LIFECYCLE_DB_URL missing');
  process.exit(2);
}

const sql = new SQL(url);

try {
  await sql`create table if not exists public.ivx_lifecycle_proof (
    id uuid primary key default gen_random_uuid(),
    build_id text not null,
    commit_sha text not null,
    feature text not null,
    human_in_loop boolean not null default false,
    created_at timestamptz not null default now()
  )`;
  await sql`alter table public.ivx_lifecycle_proof enable row level security`;

  const rows = await sql`insert into public.ivx_lifecycle_proof
    (build_id, commit_sha, feature, human_in_loop)
    values ('lifecycle-proof-20260529-v1', '03df4ed6e45c5cc67562b717f2961545a4bd6625', 'autonomous-lifecycle-proof', false)
    returning id, build_id, commit_sha, created_at`;

  const total = await sql`select count(*)::int as n from public.ivx_lifecycle_proof`;
  console.log('INSERTED:', JSON.stringify(rows[0]));
  console.log('TOTAL_ROWS:', total[0].n);
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error('DB_ERROR:', err?.message ?? String(err));
  await sql.end().catch(() => {});
  process.exit(1);
}
