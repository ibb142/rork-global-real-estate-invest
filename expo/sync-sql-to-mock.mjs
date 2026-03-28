#!/usr/bin/env node
/**
 * sync-sql-to-mock.mjs
 * Reads actual SQL files from the project root and generates mocks/supabase-scripts.ts
 * Run: node sync-sql-to-mock.mjs
 * This ensures the Supabase SQL admin screen always shows the latest SQL content.
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const SQL_FILES = [
  {
    id: 'sql_analytics_only',
    file: 'supabase-master.sql',
    extractSection: 'analytics',
    title: null,
    category: 'Analytics',
    version: null,
  },
  {
    id: 'sql_master_setup',
    file: 'supabase-master.sql',
    extractSection: null,
    title: null,
    category: 'Setup',
    version: null,
  },
  {
    id: 'sql_verify_all',
    file: 'supabase-verify.sql',
    extractSection: null,
    title: null,
    category: 'Verify',
    version: null,
  },
  {
    id: 'sql_nuke_reset',
    file: 'supabase-nuke.sql',
    extractSection: null,
    title: null,
    category: 'Emergency',
    version: null,
  },
];

function extractAnalyticsSection(content) {
  const lines = content.split('\n');
  const analyticsLines = [];
  let inSection = false;

  for (const line of lines) {
    if (line.includes('SECTION 2: ADMIN & ANALYTICS') || line.includes('analytics_events') && !inSection) {
      if (line.includes('CREATE TABLE IF NOT EXISTS analytics')) {
        inSection = true;
        analyticsLines.push(line);
        continue;
      }
    }
    if (inSection) {
      analyticsLines.push(line);
      if (line.includes('idx_landing_analytics_created')) {
        break;
      }
    }
    if (!inSection && line.includes('CREATE TABLE IF NOT EXISTS landing_analytics')) {
      inSection = true;
      analyticsLines.push(line);
    }
  }

  const header = `-- =============================================================================
-- IVXHOLDINGS — ANALYTICS ONLY (Tables + Realtime + Time Tracking + RPCs)
-- =============================================================================
-- Auto-generated from supabase-master.sql
-- Copy-paste this into Supabase SQL Editor and click RUN.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).
-- =============================================================================

`;

  const analyticsContent = [];
  const tableNames = [
    'landing_analytics', 'analytics_events', 'analytics_dashboard',
    'analytics_kpi', 'analytics_retention', 'analytics_investments'
  ];
  const indexNames = [
    'idx_analytics_events_event', 'idx_analytics_events_created',
    'idx_landing_analytics_event', 'idx_landing_analytics_session',
    'idx_landing_analytics_created'
  ];

  const allLines = content.split('\n');
  let collecting = false;
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const isTableCreate = tableNames.some(t => line.includes(`CREATE TABLE IF NOT EXISTS ${t}`));
    const isIndex = indexNames.some(idx => line.includes(idx));

    if (isTableCreate || isIndex) {
      collecting = true;
    }

    if (collecting) {
      analyticsContent.push(line);
      if (line.trim().endsWith(');') || isIndex) {
        collecting = false;
        analyticsContent.push('');
      }
    }
  }

  return header + analyticsContent.join('\n').trim();
}

function extractVersion(content) {
  const lines = content.split('\n');
  let lastVersion = 'v1.0';
  for (const line of lines) {
    const match = line.match(/^--\s+(v\d+\.\d+)/);
    if (match) lastVersion = match[1];
  }
  return lastVersion;
}

function generateTitle(id, content, version) {
  if (id === 'sql_master_setup') {
    const tableCount = (content.match(/CREATE TABLE IF NOT EXISTS/g) || []).length;
    return `MASTER SETUP ${version}: All ${tableCount}+ Tables, Analytics, Realtime, Time Tracking`;
  }
  if (id === 'sql_analytics_only') {
    return `ANALYTICS ONLY: Tables + Realtime + Time Tracking + RPCs (copy-paste this)`;
  }
  if (id === 'sql_verify_all') {
    return `VERIFY: Check all tables, functions, realtime, storage, app_config ${version}`;
  }
  if (id === 'sql_nuke_reset') {
    return `NUKE: Drop ALL tables & functions (DANGER — full reset) ${version}`;
  }
  return content.split('\n').find(l => l.startsWith('--'))?.replace(/^--\s*/, '') || 'SQL Script';
}

function escapeForTemplate(str) {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/[$][{]/g, '$\\{');
}

const today = new Date().toISOString().split('T')[0];
const scripts = [];

for (const entry of SQL_FILES) {
  const filePath = path.join(ROOT, entry.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[WARN] File not found: ${entry.file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8').trim();

  if (entry.extractSection === 'analytics') {
    content = extractAnalyticsSection(content);
  }

  const lineCount = content.split('\n').length;
  const version = extractVersion(content);
  const title = generateTitle(entry.id, content, version, lineCount);

  scripts.push({
    id: entry.id,
    fileName: entry.file === 'supabase-master.sql' && entry.extractSection === 'analytics'
      ? 'analytics-only.sql'
      : entry.file,
    title,
    category: entry.category,
    lineCount,
    version,
    updatedAt: today,
    content,
  });
}

// Add the cleanup script (not a file, generated)
const cleanupContent = `-- =============================================================================
-- IVXHOLDINGS — CLEANUP OLD / STALE DATA
-- =============================================================================
-- Run this to clean up old analytics data, expired sessions, stale snapshots,
-- and orphaned storage objects. Safe to run multiple times.
-- =============================================================================

-- 1. Delete stale visitor sessions older than 30 days
DELETE FROM visitor_sessions WHERE created_at < (now() - interval '30 days');

-- 2. Delete old realtime snapshots older than 7 days
DELETE FROM realtime_snapshots WHERE snapshot_at < (now() - interval '7 days');

-- 3. Delete old landing analytics older than 90 days
DELETE FROM landing_analytics WHERE created_at < (now() - interval '90 days');

-- 4. Delete old analytics events older than 90 days
DELETE FROM analytics_events WHERE created_at < (now() - interval '90 days');

-- 5. Mark all active sessions as inactive if no heartbeat for 10 min
UPDATE visitor_sessions
SET is_active = false,
    ended_at = last_seen_at,
    duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::INTEGER
WHERE is_active = true
  AND last_seen_at < (now() - interval '10 minutes');

-- 6. Delete old staff activity logs older than 60 days
DELETE FROM staff_activity WHERE created_at < (now() - interval '60 days');
DELETE FROM staff_activity_log WHERE created_at < (now() - interval '60 days');

-- 7. Delete old repair logs older than 30 days
DELETE FROM repair_logs WHERE created_at < (now() - interval '30 days');
DELETE FROM auto_repair_scans WHERE created_at < (now() - interval '30 days');

-- 8. Delete old SMS messages older than 90 days
DELETE FROM sms_messages WHERE created_at < (now() - interval '90 days');

-- 9. Delete orphaned image_registry entries with no matching deal
DELETE FROM image_registry
WHERE deal_id IS NOT NULL
  AND deal_id NOT IN (SELECT id FROM jv_deals);

-- 10. Ensure deal-photos bucket has correct config
SELECT ensure_deal_photos_bucket();

-- 11. Report cleanup results
SELECT 'visitor_sessions' as table_name, count(*) as remaining FROM visitor_sessions
UNION ALL SELECT 'realtime_snapshots', count(*) FROM realtime_snapshots
UNION ALL SELECT 'landing_analytics', count(*) FROM landing_analytics
UNION ALL SELECT 'analytics_events', count(*) FROM analytics_events
UNION ALL SELECT 'staff_activity', count(*) FROM staff_activity
UNION ALL SELECT 'repair_logs', count(*) FROM repair_logs
UNION ALL SELECT 'sms_messages', count(*) FROM sms_messages
UNION ALL SELECT 'image_registry', count(*) FROM image_registry
ORDER BY table_name;

-- =============================================================================
-- DONE! Old data cleaned. Run this periodically to keep DB lean.
-- =============================================================================`;

scripts.push({
  id: 'sql_analytics_realtime_patch',
  fileName: 'analytics_realtime_patch.sql',
  title: 'PATCH: Analytics Realtime + Time Tracking (run if already on older version)',
  category: 'Fix & Patch',
  lineCount: scripts.find(s => s.id === 'sql_analytics_only')?.lineCount || 53,
  version: scripts.find(s => s.id === 'sql_analytics_only')?.version || 'v1.0',
  updatedAt: today,
  content: scripts.find(s => s.id === 'sql_analytics_only')?.content || '',
});

scripts.push({
  id: 'sql_cleanup_old_data',
  fileName: 'cleanup-old-data.sql',
  title: 'CLEANUP: Delete old/stale data (analytics, sessions, snapshots, storage orphans)',
  category: 'Fix & Patch',
  lineCount: cleanupContent.split('\n').length,
  version: 'v1.0',
  updatedAt: today,
  content: cleanupContent,
});

// Sort: Analytics first, then Setup, Fix & Patch, Verify, Emergency
const categoryOrder = ['Analytics', 'Setup', 'Fix & Patch', 'Verify', 'Emergency'];
scripts.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

// Generate TypeScript
const masterVersion = scripts.find(s => s.id === 'sql_master_setup')?.version || 'v1.4';
const tsContent = `export interface SqlScript {
  id: string;
  fileName: string;
  title: string;
  category: string;
  lineCount: number;
  content: string;
  version: string;
  updatedAt: string;
}

export const SQL_SCRIPTS: SqlScript[] = [
${scripts.map(s => `  {
    id: '${s.id}',
    fileName: '${s.fileName}',
    title: '${s.title.replace(/'/g, "\\'")}',
    category: '${s.category}',
    lineCount: ${s.lineCount},
    version: '${s.version}',
    updatedAt: '${s.updatedAt}',
    content: \`${escapeForTemplate(s.content)}\`
  }`).join(',\n')}
];

export const SQL_CATEGORIES = Array.from(new Set(SQL_SCRIPTS.map(s => s.category)));
export const SCRIPTS_VERSION = '${masterVersion}-${today.replace(/-/g, '')}';
`;

const outPath = path.join(ROOT, 'mocks', 'supabase-scripts.ts');
fs.writeFileSync(outPath, tsContent);
console.log(`[sync-sql-to-mock] Generated ${outPath}`);
console.log(`[sync-sql-to-mock] ${scripts.length} scripts, version ${masterVersion}-${today.replace(/-/g, '')}`);
scripts.forEach(s => {
  console.log(`  → ${s.id}: ${s.lineCount} lines (${s.version}) [${s.category}]`);
});
