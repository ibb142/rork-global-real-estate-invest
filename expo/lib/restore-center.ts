/**
 * Restore Center API client — migrated from ios-ivx/Ivx/Services/RestoreCenterService.swift
 *
 * Backend endpoints (all owner-only, require Bearer token):
 *   GET  /api/ivx/restore-center/overview           — backup status, PITR, vault, approvals
 *   GET  /api/ivx/restore-center/deleted             — soft-deleted records
 *   POST /api/ivx/restore-center/soft-delete         — soft-delete a record
 *   POST /api/ivx/restore-center/restore-soft        — restore a soft-deleted record
 *   GET  /api/ivx/restore-center/vault-entries       — data vault entries
 *   POST /api/ivx/restore-center/restore-vault       — restore from vault
 *   GET  /api/ivx/restore-center/pitr                — PITR status
 *   GET  /api/ivx/restore-center/snapshots           — file vault snapshots
 *   POST /api/ivx/restore-center/restore-snapshot    — restore from snapshot
 *   POST /api/ivx/restore-center/snapshot            — emergency snapshot now
 *   GET  /api/ivx/restore-center/approvals           — two-person approvals
 *   POST /api/ivx/restore-center/approvals/create    — create approval request
 *   POST /api/ivx/restore-center/approvals/confirm   — confirm approval
 *   POST /api/ivx/restore-center/approvals/reject    — reject approval
 *   GET  /api/ivx/restore-center/guard-audit         — guard audit log
 *   GET  /api/ivx/restore-center/protected-tables    — protected tables list
 *   POST /api/ivx/restore-center/drill               — recovery drill
 *   GET  /api/ivx/restore-center/report              — daily report
 *   POST /api/ivx/restore-center/export              — emergency export
 */

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');
const BASE_PATH = '/api/ivx/restore-center';

function getOwnerToken(): string {
  return process.env.EXPO_PUBLIC_IVX_OWNER_TOKEN || '';
}

// ============ Types ============

export interface FileVaultStatus {
  enabled: boolean;
  total_snapshots: number | null;
  last_snapshot_at: string | null;
  last_snapshot_id: string | null;
  next_scheduled_run: string | null;
  interval_ms: number | null;
}

export interface PitrStatus {
  supabase_reachable: boolean | null;
  pitr_alert: string | null;
  restore_window_note: string | null;
  newest_write_at: string | null;
  file_vault_snapshots: number | null;
  recommendation: string | null;
}

export interface TwoPersonSummary {
  pending_count: number | null;
}

export interface GuardAuditSummary {
  total_logged: number | null;
}

export interface RestoreOverview {
  marker: string | null;
  generated_at: string | null;
  file_vault: FileVaultStatus | null;
  pitr: PitrStatus | null;
  two_person_approvals: TwoPersonSummary | null;
  guard_audit: GuardAuditSummary | null;
  protected_tables: string[] | null;
  protected_table_count: number | null;
}

export interface OverviewResponse {
  ok: boolean;
  overview: RestoreOverview | null;
}

export interface DrillStep {
  step: string;
  passed: boolean;
  detail: string;
}

export interface DrillSummary {
  passed: number;
  failed: number;
  total: number;
}

export interface DrillReport {
  overall_passed: boolean;
  duration_ms: number;
  summary: DrillSummary;
  steps: DrillStep[];
}

export interface DrillResponse {
  ok: boolean;
  report: DrillReport | null;
}

export interface BackupStatus {
  file_vault_enabled: boolean;
  file_vault_last_snapshot_at: string | null;
  file_vault_total_snapshots: number;
  supabase_reachable: boolean;
}

export interface TableCount {
  table: string;
  count: number | null;
  exists: boolean;
}

export interface SoftDeletedCount {
  table: string;
  count: number;
}

export interface DailyReport {
  generated_at: string;
  date: string;
  backup_status: BackupStatus;
  row_counts: TableCount[];
  vault_size_note: string;
  recovery_risk: string;
  recommendation: string;
  soft_deleted_counts?: SoftDeletedCount[] | null;
}

export interface ReportResponse {
  ok: boolean;
  report: DailyReport | null;
}

export interface ExportSummary {
  snapshot_id: string;
  timestamp: string;
  tables: number;
  total_rows: number;
  message: string;
}

export interface ExportResponse {
  ok: boolean;
  export: ExportSummary | null;
}

export interface DeletedRecord {
  table: string;
  count: number;
  records?: Record<string, unknown>[] | null;
  error?: string | null;
}

export interface DeletedResponse {
  ok: boolean;
  table: string;
  count: number;
  records?: Record<string, unknown>[] | null;
  error?: string | null;
}

export interface VaultEntry {
  id: string;
  table_name: string;
  record_id: string;
  snapshot_at: string;
  data: Record<string, unknown>;
}

export interface VaultEntriesResponse {
  ok: boolean;
  entries: VaultEntry[];
  count: number;
}

export interface SnapshotEntry {
  id: string;
  created_at: string;
  tables: number;
  total_rows: number;
  status: string;
}

export interface SnapshotsResponse {
  ok: boolean;
  snapshots: SnapshotEntry[];
  count: number;
}

export interface ApprovalEntry {
  id: string;
  action: string;
  table: string;
  record_id: string;
  requested_by: string;
  requested_at: string;
  status: string;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
}

export interface ApprovalsResponse {
  ok: boolean;
  approvals: ApprovalEntry[];
  pending_count: number;
}

export interface GuardAuditEntry {
  id: string;
  action: string;
  table: string;
  actor: string;
  timestamp: string;
  detail: string;
}

export interface GuardAuditResponse {
  ok: boolean;
  entries: GuardAuditEntry[];
  total: number;
}

export interface ProtectedTablesResponse {
  ok: boolean;
  tables: string[];
  count: number;
}

// ============ API Functions ============

async function apiGet<T>(path: string): Promise<T> {
  const token = getOwnerToken();
  const res = await fetch(`${API_BASE}${BASE_PATH}${path}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Restore center request failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const token = getOwnerToken();
  const res = await fetch(`${API_BASE}${BASE_PATH}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : '{}',
  });
  if (!res.ok) throw new Error(`Restore center request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function fetchOverview(): Promise<OverviewResponse> {
  return apiGet<OverviewResponse>('/overview');
}

export function fetchReport(): Promise<ReportResponse> {
  return apiGet<ReportResponse>('/report');
}

export function runDrill(): Promise<DrillResponse> {
  return apiPost<DrillResponse>('/drill');
}

export function runEmergencyExport(): Promise<ExportResponse> {
  return apiPost<ExportResponse>('/snapshot');
}

export function fetchDeleted(table?: string): Promise<DeletedResponse> {
  return apiGet<DeletedResponse>(`/deleted${table ? `?table=${table}` : ''}`);
}

export function fetchVaultEntries(): Promise<VaultEntriesResponse> {
  return apiGet<VaultEntriesResponse>('/vault-entries');
}

export function fetchSnapshots(): Promise<SnapshotsResponse> {
  return apiGet<SnapshotsResponse>('/snapshots');
}

export function fetchPitr(): Promise<{ ok: boolean; pitr: PitrStatus | null }> {
  return apiGet<{ ok: boolean; pitr: PitrStatus | null }>('/pitr');
}

export function fetchApprovals(): Promise<ApprovalsResponse> {
  return apiGet<ApprovalsResponse>('/approvals');
}

export function fetchGuardAudit(): Promise<GuardAuditResponse> {
  return apiGet<GuardAuditResponse>('/guard-audit');
}

export function fetchProtectedTables(): Promise<ProtectedTablesResponse> {
  return apiGet<ProtectedTablesResponse>('/protected-tables');
}

export function restoreSoftDelete(table: string, recordId: string): Promise<{ ok: boolean; message?: string }> {
  return apiPost<{ ok: boolean; message?: string }>('/restore-soft', { table, record_id: recordId });
}

export function restoreVault(vaultEntryId: string): Promise<{ ok: boolean; message?: string }> {
  return apiPost<{ ok: boolean; message?: string }>('/restore-vault', { vault_entry_id: vaultEntryId });
}

export function restoreSnapshot(snapshotId: string): Promise<{ ok: boolean; message?: string }> {
  return apiPost<{ ok: boolean; message?: string }>('/restore-snapshot', { snapshot_id: snapshotId });
}

export function createApproval(action: string, table: string, recordId: string): Promise<{ ok: boolean; approval_id?: string }> {
  return apiPost<{ ok: boolean; approval_id?: string }>('/approvals/create', { action, table, record_id: recordId });
}

export function confirmApproval(approvalId: string): Promise<{ ok: boolean; message?: string }> {
  return apiPost<{ ok: boolean; message?: string }>('/approvals/confirm', { approval_id: approvalId });
}

export function rejectApproval(approvalId: string): Promise<{ ok: boolean; message?: string }> {
  return apiPost<{ ok: boolean; message?: string }>('/approvals/reject', { approval_id: approvalId });
}
