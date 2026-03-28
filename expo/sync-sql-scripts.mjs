#!/usr/bin/env node
/**
 * sync-sql-scripts.mjs
 * Reads actual .sql files from the project root and generates mocks/supabase-scripts.ts
 * Run: bun run sync-sql
 * 
 * This ensures the admin Supabase SQL page always shows the latest SQL content.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUTPUT = join(ROOT, 'mocks', 'supabase-scripts.ts');

const SCRIPT_CONFIGS = [
  {
    id: 'sql_analytics_only',
    file: null,
    category: 'Analytics',
    title: 'ANALYTICS ONLY: Tables + Realtime + Time Tracking + RPCs (copy-paste this)',
    generateContent: () => generateAnalyticsOnly(),
  },
  {
    id: 'sql_master_setup',
    file: 'supabase-master.sql',
    category: 'Setup',
    titlePrefix: 'MASTER SETUP',
  },
  {
    id: 'sql_analytics_realtime_patch',
    file: null,
    category: 'Fix & Patch',
    title: 'PATCH: Analytics Realtime + Time Tracking (run if already on older version)',
    generateContent: () => generateAnalyticsPatch(),
  },
  {
    id: 'sql_verify_all',
    file: 'supabase-verify.sql',
    category: 'Verify',
    titlePrefix: 'VERIFY: Check all tables, functions, realtime, storage, app_config',
  },
  {
    id: 'sql_nuke_reset',
    file: 'supabase-nuke.sql',
    category: 'Emergency',
    titlePrefix: 'NUKE: Drop ALL tables & functions (DANGER — full reset)',
  },
];

function getVersion(content) {
  const matches = [...content.matchAll(/v(\d+\.\d+)/g)];
  if (!matches.length) return 'v1.0';
  let highest = '0.0';
  for (const m of matches) {
    if (m[1] && compareVersions(m[1], highest) > 0) highest = m[1];
  }
  return `v${highest}`;
}

function compareVersions(a, b) {
  const [aMaj, aMin] = a.split('.').map(Number);
  const [bMaj, bMin] = b.split('.').map(Number);
  if (aMaj !== bMaj) return aMaj - bMaj;
  return aMin - bMin;
}

function getTableCount(content) {
  const matches = content.match(/CREATE TABLE IF NOT EXISTS/gi);
  return matches ? matches.length : 0;
}

function escapeForTemplate(str) {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function generateAnalyticsOnly() {
  const master = readFileSync(join(ROOT, 'supabase-master.sql'), 'utf-8');
  const sections = [];
  
  sections.push(`-- =============================================================================
-- IVXHOLDINGS — ANALYTICS ONLY (Tables + Realtime + Time Tracking + RPCs)
-- =============================================================================
-- Auto-generated from supabase-master.sql
-- Copy-paste this into Supabase SQL Editor and click RUN.
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT).
-- =============================================================================`);

  const analyticsTableNames = [
    'landing_analytics', 'visitor_sessions', 'realtime_snapshots',
    'analytics_events', 'analytics_dashboard', 'analytics_kpi',
    'analytics_retention', 'analytics_investments'
  ];

  for (const tableName of analyticsTableNames) {
    const regex = new RegExp(`(CREATE TABLE IF NOT EXISTS ${tableName}[\\s\\S]*?);`, 'i');
    const match = master.match(regex);
    if (match) {
      sections.push(match[0]);
    }
  }

  const indexRegex = /CREATE INDEX IF NOT EXISTS idx_(landing_analytics|visitor_sessions|realtime_snapshots|analytics_events|analytics_dashboard)[\s\S]*?;/gi;
  let indexMatch;
  while ((indexMatch = indexRegex.exec(master)) !== null) {
    sections.push(indexMatch[0]);
  }

  const funcNames = ['upsert_visitor_session', 'mark_inactive_sessions', 'save_realtime_snapshot'];
  for (const fn of funcNames) {
    const regex = new RegExp(`CREATE OR REPLACE FUNCTION ${fn}[\\s\\S]*?\\$\\s*LANGUAGE plpgsql SECURITY DEFINER;`, 'i');
    const match = master.match(regex);
    if (match) {
      sections.push(match[0]);
    }
  }

  return sections.join('\n\n');
}

function generateAnalyticsPatch() {
  return generateAnalyticsOnly();
}

function readSqlFile(filename) {
  const filepath = join(ROOT, filename);
  try {
    return readFileSync(filepath, 'utf-8');
  } catch (e) {
    console.error(`[sync-sql] Could not read ${filename}:`, e.message);
    return null;
  }
}

function generateTitle(config, content) {
  if (config.title) return config.title;
  const version = getVersion(content);
  const tableCount = getTableCount(content);
  let title = config.titlePrefix || config.id;
  if (tableCount > 0) {
    title += ` ${version}: All ${tableCount}+ Tables, Analytics, Realtime, Time Tracking`;
  } else {
    title += ` ${version}`;
  }
  return title;
}

const today = new Date().toISOString().split('T')[0];

console.log('[sync-sql] Starting SQL script sync...');
console.log('[sync-sql] Date:', today);

const scripts = [];

for (const config of SCRIPT_CONFIGS) {
  let content;
  let lineCount;

  if (config.file) {
    content = readSqlFile(config.file);
    if (!content) continue;
    lineCount = content.split('\n').length;
  } else if (config.generateContent) {
    content = config.generateContent();
    lineCount = content.split('\n').length;
  } else {
    continue;
  }

  const version = getVersion(content);
  const title = generateTitle(config, content);

  scripts.push({
    id: config.id,
    fileName: config.file || `${config.id.replace('sql_', '')}.sql`,
    title,
    category: config.category,
    lineCount,
    version,
    updatedAt: today,
    content,
  });

  console.log(`[sync-sql] ${config.id}: ${lineCount} lines, ${version}, category=${config.category}`);
}

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
  id: 'sql_cleanup_old_data',
  fileName: 'cleanup-old-data.sql',
  title: 'CLEANUP: Delete old/stale data (analytics, sessions, snapshots, storage orphans)',
  category: 'Fix & Patch',
  lineCount: cleanupContent.split('\n').length,
  version: getVersion(scripts[0]?.content || 'v1.4'),
  updatedAt: today,
  content: cleanupContent,
});

const masterVersion = getVersion(scripts.find(s => s.id === 'sql_master_setup')?.content || 'v1.4');
const scriptsVersion = `${masterVersion}-${today.replace(/-/g, '')}`;

let output = `export interface SqlScript {
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
`;

for (let i = 0; i < scripts.length; i++) {
  const s = scripts[i];
  const escaped = escapeForTemplate(s.content);
  output += `  {
    id: '${s.id}',
    fileName: '${s.fileName}',
    title: '${s.title.replace(/'/g, "\\'")}',
    category: '${s.category}',
    lineCount: ${s.lineCount},
    version: '${s.version}',
    updatedAt: '${s.updatedAt}',
    content: \`${escaped}\`
  }${i < scripts.length - 1 ? ',' : ''}
`;
}

output += `];

export const SQL_CATEGORIES = Array.from(new Set(SQL_SCRIPTS.map(s => s.category)));
export const SCRIPTS_VERSION = '${scriptsVersion}';
`;

writeFileSync(OUTPUT, output, 'utf-8');
console.log(`[sync-sql] Written ${scripts.length} scripts to ${OUTPUT}`);
console.log(`[sync-sql] Version: ${scriptsVersion}`);
console.log('[sync-sql] Done!');
