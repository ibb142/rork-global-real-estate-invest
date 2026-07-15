# IVX Data Vault — Backup & Recovery Guide

## What happened (2026-07-06 incident)

An autonomous "cleanup" phase (phase8 in the closeout proof) deleted 14 member records and wiped the `landing_analytics` / `analytics_events` / `visitor_sessions` tables to clean up test emails. This destroyed real visitor data (~1,167 visitors, ~27,646 events) along with the test data. Supabase had no PITR backup enabled, so the data was unrecoverable.

## What was built to prevent this forever

### 1. IVX Data Vault (`backend/services/ivx-data-vault.ts`)
An **independent backup system** that lives on the backend's own filesystem — NOT in Supabase. If Supabase loses data, the vault still has every row.

- **Automatic snapshots every 6 hours** (configurable)
- **Snapshots 26 critical tables**: members, waitlist, investors, buyers, landing_analytics, analytics_events, visitor_sessions, jv_deals, wallets, ledger, treasury, and more
- **Append-only manifest ledger** — every snapshot is recorded with SHA-256 hashes
- **Boot-time snapshot** — takes an initial snapshot on first startup if none exists
- **Retention: keep ALL snapshots forever** (configurable, default is unlimited)
- **Data-loss detection** — compares latest snapshot vs live Supabase counts and alerts if rows disappeared

### 2. IVX Data-Loss Guard (`backend/services/ivx-data-loss-guard.ts`)
A **destructive operation interceptor** that ensures the autonomous cleanup incident can NEVER happen again.

- **26 protected tables** — autonomous systems (night-ops, senior-developer, cleanup scripts) can NEVER run DELETE/TRUNCATE/DROP on these tables
- **Owner approval required** — even for humans, destructive ops require `ownerApproved: true` + a written `ownerReason`
- **Pre-snapshot required** — before any allowed destructive op on a protected table, a vault snapshot is taken automatically
- **Immutable audit trail** — every evaluated destructive op is logged to `logs/audit/data-vault/destructive-ops-audit.jsonl`

## API Endpoints (all owner-only)

### Data Vault

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/ivx/data-vault/status` | Vault state, config, recent snapshots |
| `POST` | `/api/ivx/data-vault/config` | Update interval/retention/tables |
| `POST` | `/api/ivx/data-vault/snapshot` | Trigger a manual snapshot NOW |
| `GET` | `/api/ivx/data-vault/snapshots` | List all available snapshots |
| `GET` | `/api/ivx/data-vault/snapshots/:id` | Get metadata for a specific snapshot |
| `GET` | `/api/ivx/data-vault/snapshots/:id/tables/:table` | Download raw rows for one table |
| `POST` | `/api/ivx/data-vault/restore` | Restore a snapshot into Supabase (requires `confirmed: true`) |
| `GET` | `/api/ivx/data-vault/loss-detection` | Compare latest snapshot vs live — detect data loss |
| `GET` | `/api/ivx/data-vault/manifest` | Read the append-only manifest ledger |

### Data-Loss Guard

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/ivx/data-guard/evaluate` | Evaluate a destructive op (allowed/blocked) |
| `GET` | `/api/ivx/data-guard/audit` | Read the destructive-ops audit trail |
| `GET` | `/api/ivx/data-guard/protected-tables` | List all protected tables |
| `POST` | `/api/ivx/data-guard/check` | Check if an operation is destructive (no side effects) |

## How to recover lost data

### Step 1: Check what snapshots exist
```bash
curl -H "Authorization: Bearer $IVX_OWNER_TOKEN" \
  https://api.ivxholding.com/api/ivx/data-vault/snapshots
```

### Step 2: Inspect a specific snapshot
```bash
curl -H "Authorization: Bearer $IVX_OWNER_TOKEN" \
  https://api.ivxholding.com/api/ivx/data-vault/snapshots/VAULT-SNAPSHOT-ID
```

### Step 3: Download rows for a specific table from a snapshot
```bash
curl -H "Authorization: Bearer $IVX_OWNER_TOKEN" \
  https://api.ivxholding.com/api/ivx/data-vault/snapshots/VAULT-SNAPSHOT-ID/tables/landing_analytics
```

### Step 4: Restore (OVERWRITES production — requires confirmation)
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IVX_OWNER_TOKEN" \
  -d '{"snapshotId":"VAULT-SNAPSHOT-ID","confirmed":true}' \
  https://api.ivxholding.com/api/ivx/data-vault/restore
```

To restore only specific tables:
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IVX_OWNER_TOKEN" \
  -d '{"snapshotId":"VAULT-SNAPSHOT-ID","confirmed":true,"tables":["landing_analytics","analytics_events"]}' \
  https://api.ivxholding.com/api/ivx/data-vault/restore
```

### Step 5: Verify data-loss detection
```bash
curl -H "Authorization: Bearer $IVX_OWNER_TOKEN" \
  https://api.ivxholding.com/api/ivx/data-vault/loss-detection
```

## How the autonomous cleanup is now blocked

If any autonomous system (night-ops, senior-developer, cleanup script) attempts:
```sql
DELETE FROM members WHERE email LIKE '%@gmail.com%'
```

The data-loss guard intercepts it and returns:
```
BLOCKED: Autonomous systems cannot run destructive operations on protected table "members".
This guard was added after the 2026-07-06 data-loss incident.
An owner must run this manually with explicit approval.
```

Even if a human owner tries it, they must provide:
```json
{
  "operation": "DELETE FROM members WHERE email LIKE '%@gmail.com%'",
  "ownerApproved": true,
  "ownerReason": "Removing test accounts created during load testing on 2026-07-06",
  "isAutonomous": false
}
```

And a vault snapshot is taken BEFORE the operation proceeds.

## Storage layout

```
backend/logs/audit/data-vault/
├── manifest.jsonl              # append-only ledger of every snapshot
├── state.json                  # scheduler state + config
├── destructive-ops-audit.jsonl # every evaluated destructive op
└── snapshots/
    └── vault-2026-07-06T12-00-00-000Z-abc123/
        ├── meta.json           # snapshot metadata + per-table hashes
        ├── members.json
        ├── waitlist.json
        ├── investors.json
        ├── landing_analytics.json
        ├── analytics_events.json
        ├── visitor_sessions.json
        └── ... (26 tables total)
```
