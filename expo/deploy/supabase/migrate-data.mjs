#!/usr/bin/env node

/**
 * IVX Holdings — Supabase Data Migration Script
 * Exports data from hosted Supabase and imports into self-hosted instance.
 *
 * Usage:
 *   STEP 1 — Export:  node migrate-data.mjs export
 *   STEP 2 — Import:  node migrate-data.mjs import
 *
 * Env vars required:
 *   SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_KEY  (hosted)
 *   TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_KEY  (self-hosted)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join(__dirname, 'migration-export');

const TABLES = [
  'profiles',
  'wallets',
  'jv_deals',
  'landing_deals',
  'properties',
  'market_data',
  'holdings',
  'transactions',
  'notifications',
  'analytics_events',
  'image_registry',
  'push_tokens',
  'landing_analytics',
  'waitlist',
  'visitor_sessions',
  'realtime_snapshots',
  'audit_trail',
  'app_config',
  'sms_log',
  'sms_templates',
  'sms_campaigns',
  'email_queue',
  'email_templates',
  'referral_codes',
  'referral_tracking',
  'scheduled_investments',
  'auto_reinvest_settings',
  'copy_investing_leaders',
  'copy_investing_followers',
  'fee_schedules',
  'fee_transactions',
  'team_members',
  'staff_activity_log',
  'applications',
  'lender_profiles',
  'lender_deals',
  'broker_profiles',
  'agent_profiles',
  'influencer_profiles',
  'vip_tiers',
  'vip_memberships',
  'gift_shares',
  'tax_documents',
  'kyc_verifications',
  'two_factor_secrets',
  'login_attempts',
  'rate_limit_counters',
  'system_health_checks',
  'deploy_logs',
  'image_backups',
];

const BATCH_SIZE = 500;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

function log(msg) { console.log(`${BLUE}[migrate]${NC} ${msg}`); }
function ok(msg) { console.log(`${GREEN}[OK]${NC} ${msg}`); }
function warn(msg) { console.log(`${YELLOW}[WARN]${NC} ${msg}`); }
function fail(msg) { console.log(`${RED}[FAIL]${NC} ${msg}`); }

async function supabaseRequest(baseUrl, serviceKey, endpoint, options = {}) {
  const url = `${baseUrl}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...options.headers,
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    return res.json();
  }
  return null;
}

async function exportTable(baseUrl, serviceKey, table) {
  const rows = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const batch = await supabaseRequest(
        baseUrl,
        serviceKey,
        `${table}?select=*&order=created_at.asc.nullsfirst&offset=${offset}&limit=${BATCH_SIZE}`,
        { headers: { 'Range-Unit': 'items', 'Range': `${offset}-${offset + BATCH_SIZE - 1}` } }
      );

      if (!batch || !Array.isArray(batch) || batch.length === 0) {
        hasMore = false;
      } else {
        rows.push(...batch);
        offset += batch.length;
        if (batch.length < BATCH_SIZE) hasMore = false;
      }
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('does not exist')) {
        warn(`Table '${table}' does not exist on source — skipping`);
        return [];
      }
      throw err;
    }
  }

  return rows;
}

async function importTable(baseUrl, serviceKey, table, rows) {
  if (!rows.length) return { inserted: 0, errors: 0 };

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await supabaseRequest(baseUrl, serviceKey, table, {
        method: 'POST',
        body: batch,
        prefer: 'resolution=merge-duplicates,return=minimal',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      });
      inserted += batch.length;
    } catch (err) {
      fail(`  Batch ${i / BATCH_SIZE + 1} failed for ${table}: ${err.message}`);
      errors += batch.length;
    }
  }

  return { inserted, errors };
}

async function runExport() {
  const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
  const SOURCE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;

  if (!SOURCE_URL || !SOURCE_KEY) {
    fail('Missing SOURCE_SUPABASE_URL or SOURCE_SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  log(`Exporting from: ${SOURCE_URL}`);
  log(`Export dir: ${EXPORT_DIR}`);
  console.log('');

  const manifest = { exportedAt: new Date().toISOString(), sourceUrl: SOURCE_URL, tables: {} };
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const rows = await exportTable(SOURCE_URL, SOURCE_KEY, table);
      const filePath = path.join(EXPORT_DIR, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      manifest.tables[table] = { rows: rows.length, file: `${table}.json` };
      totalRows += rows.length;

      if (rows.length > 0) {
        ok(`${table}: ${rows.length} rows`);
      } else {
        log(`${table}: 0 rows (empty or missing)`);
      }
    } catch (err) {
      fail(`${table}: ${err.message}`);
      manifest.tables[table] = { rows: 0, error: err.message };
    }
  }

  fs.writeFileSync(path.join(EXPORT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('');
  ok(`Export complete — ${totalRows} total rows across ${Object.keys(manifest.tables).length} tables`);
  log(`Files saved to: ${EXPORT_DIR}`);
}

async function runImport() {
  const TARGET_URL = process.env.TARGET_SUPABASE_URL;
  const TARGET_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY;

  if (!TARGET_URL || !TARGET_KEY) {
    fail('Missing TARGET_SUPABASE_URL or TARGET_SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  if (!fs.existsSync(EXPORT_DIR)) {
    fail(`Export directory not found: ${EXPORT_DIR}`);
    fail('Run "node migrate-data.mjs export" first.');
    process.exit(1);
  }

  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail('manifest.json not found in export directory');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  log(`Importing to: ${TARGET_URL}`);
  log(`Source export from: ${manifest.exportedAt}`);
  console.log('');

  let totalInserted = 0;
  let totalErrors = 0;

  for (const table of TABLES) {
    const filePath = path.join(EXPORT_DIR, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      log(`${table}: no export file — skipping`);
      continue;
    }

    const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!rows.length) {
      log(`${table}: 0 rows — skipping`);
      continue;
    }

    try {
      const { inserted, errors } = await importTable(TARGET_URL, TARGET_KEY, table, rows);
      totalInserted += inserted;
      totalErrors += errors;

      if (errors === 0) {
        ok(`${table}: ${inserted} rows imported`);
      } else {
        warn(`${table}: ${inserted} imported, ${errors} failed`);
      }
    } catch (err) {
      fail(`${table}: ${err.message}`);
      totalErrors += rows.length;
    }
  }

  console.log('');
  if (totalErrors === 0) {
    ok(`Import complete — ${totalInserted} rows imported successfully`);
  } else {
    warn(`Import complete — ${totalInserted} imported, ${totalErrors} errors`);
  }
}

async function runVerify() {
  const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
  const SOURCE_KEY = process.env.SOURCE_SUPABASE_SERVICE_KEY;
  const TARGET_URL = process.env.TARGET_SUPABASE_URL;
  const TARGET_KEY = process.env.TARGET_SUPABASE_SERVICE_KEY;

  if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
    fail('Missing env vars. Need: SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_KEY, TARGET_SUPABASE_URL, TARGET_SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  log('Verifying data parity between source and target...');
  console.log('');

  let mismatches = 0;

  for (const table of TABLES) {
    try {
      const sourceCount = await supabaseRequest(SOURCE_URL, SOURCE_KEY, `${table}?select=count`, {
        headers: { 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
      });
      const targetCount = await supabaseRequest(TARGET_URL, TARGET_KEY, `${table}?select=count`, {
        headers: { 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
      });

      const sLen = Array.isArray(sourceCount) ? sourceCount.length : 0;
      const tLen = Array.isArray(targetCount) ? targetCount.length : 0;

      if (sLen === tLen) {
        ok(`${table}: ${sLen} rows (match)`);
      } else {
        warn(`${table}: source=${sLen}, target=${tLen} (MISMATCH)`);
        mismatches++;
      }
    } catch (err) {
      if (err.message.includes('does not exist') || err.message.includes('404')) {
        log(`${table}: table missing on one side — skipping`);
      } else {
        fail(`${table}: ${err.message}`);
      }
      mismatches++;
    }
  }

  console.log('');
  if (mismatches === 0) {
    ok('All tables match between source and target');
  } else {
    warn(`${mismatches} table(s) have mismatches or errors`);
  }
}

const command = process.argv[2];

switch (command) {
  case 'export':
    await runExport();
    break;
  case 'import':
    await runImport();
    break;
  case 'verify':
    await runVerify();
    break;
  default:
    console.log('');
    console.log('IVX Holdings — Supabase Data Migration');
    console.log('');
    console.log('Commands:');
    console.log('  export   Export all data from hosted Supabase');
    console.log('  import   Import exported data into self-hosted Supabase');
    console.log('  verify   Compare row counts between source and target');
    console.log('');
    console.log('Env vars:');
    console.log('  SOURCE_SUPABASE_URL          Hosted Supabase URL');
    console.log('  SOURCE_SUPABASE_SERVICE_KEY   Hosted service_role key');
    console.log('  TARGET_SUPABASE_URL          Self-hosted Supabase URL');
    console.log('  TARGET_SUPABASE_SERVICE_KEY   Self-hosted service_role key');
    console.log('');
    console.log('Example:');
    console.log('  SOURCE_SUPABASE_URL=https://xxx.supabase.co \\');
    console.log('  SOURCE_SUPABASE_SERVICE_KEY=eyJ... \\');
    console.log('  node deploy/supabase/migrate-data.mjs export');
    console.log('');
    process.exit(0);
}
