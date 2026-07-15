/**
 * IVX Autonomous Dashboard Export — CSV, JSON, PDF generation.
 *
 * Exports are generated from real dashboard data (no fabrication).
 * Owner-only: callers must verify owner auth before calling export functions.
 * No secrets, tokens, or sensitive KYC data are included in any export.
 * Investor PII is redacted to IDs only.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

import type {
  ActivityItem,
  AutonomousOpsDashboard,
  CategorySummary,
  DailySummary,
  UnifiedAgent,
} from './ivxAutonomousOpsService';

export type ExportFormat = 'csv' | 'json' | 'pdf';
export type ExportReportType =
  | 'daily_activities'
  | 'agent_performance'
  | 'code_commits'
  | 'deployments'
  | 'investors'
  | 'buyers_crm'
  | 'failures_retries'
  | 'owner_actions'
  | 'evidence_ledger'
  | 'executive_summary';

export type ExportFilters = {
  dateRange?: string;
  agent?: string | null;
  department?: string | null;
  category?: string | null;
  status?: string | null;
  investor?: string | null;
  property?: string | null;
  deployment?: string | null;
};

const EXPORT_DIR = `${FileSystem.documentDirectory}ivx-exports/`;

async function ensureExportDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EXPORT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  }
}

function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: (string | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...dataLines].join('\n');
}

function timestampSlug(): string {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sanitizeForExport(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .slice(0, 500);
}

/**
 * Build activity items CSV from dashboard data.
 */
function exportDailyActivitiesCsv(data: AutonomousOpsDashboard): string {
  const headers = [
    'Item #', 'Agent', 'Department', 'Category', 'Task', 'Result',
    'Status', 'Start Time (UTC)', 'End Time (UTC)', 'Duration (ms)',
    'Commit SHA', 'Trace ID', 'Error',
  ];
  const rows = data.activityItems.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    item.department,
    item.category,
    sanitizeForExport(item.task),
    sanitizeForExport(item.result),
    item.status,
    item.startTime,
    item.endTime,
    item.durationMs !== null ? String(item.durationMs) : '',
    item.commitSha,
    item.traceId,
    item.error ? sanitizeForExport(item.error) : '',
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build agent performance CSV.
 */
function exportAgentPerformanceCsv(data: AutonomousOpsDashboard): string {
  const headers = [
    'Agent #', 'Agent ID', 'Name', 'Department', 'Status',
    'Tasks Started Today', 'Tasks Completed', 'Tasks Failed',
    'Tasks Blocked', 'Success Rate (%)', 'Total Exec Time (ms)',
    'Last Activity (UTC)',
  ];
  const rows = data.agents.map((agent: UnifiedAgent) => [
    String(agent.agentNumber),
    agent.agentId,
    agent.name,
    agent.department,
    agent.status,
    String(agent.tasksStartedToday),
    String(agent.tasksCompletedToday),
    String(agent.tasksFailedToday),
    String(agent.tasksBlockedToday),
    agent.successRate !== null ? String(agent.successRate) : '',
    agent.totalExecutionTimeMs !== null ? String(agent.totalExecutionTimeMs) : '',
    agent.lastActivityTime,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build failures and retries CSV.
 */
function exportFailuresRetriesCsv(data: AutonomousOpsDashboard): string {
  const failed = data.activityItems.filter(
    (i: ActivityItem) => i.status === 'FAILED' || i.status === 'BLOCKED' || i.status === 'OWNER_ACTION_REQUIRED' || i.retryCount > 0,
  );
  const headers = [
    'Item #', 'Agent', 'Task', 'Status', 'Error', 'Retry Count',
    'Start Time (UTC)', 'End Time (UTC)', 'Trace ID',
  ];
  const rows = failed.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    sanitizeForExport(item.task),
    item.status,
    item.error ? sanitizeForExport(item.error) : '',
    String(item.retryCount),
    item.startTime,
    item.endTime,
    item.traceId,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build owner actions CSV.
 */
function exportOwnerActionsCsv(data: AutonomousOpsDashboard): string {
  const headers = ['Trace ID', 'Title', 'Status', 'Created At (UTC)', 'Blocker'];
  const rows = data.ownerActionRequests.map((action) => [
    action.traceId,
    sanitizeForExport(action.title),
    action.status,
    action.createdAt,
    action.blocker ? sanitizeForExport(action.blocker) : '',
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build evidence ledger CSV from activity items with evidence.
 */
function exportEvidenceLedgerCsv(data: AutonomousOpsDashboard): string {
  const headers = ['Item #', 'Agent', 'Evidence', 'Trace ID', 'Commit SHA', 'Status'];
  const rows = data.activityItems.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    sanitizeForExport(item.evidence),
    item.traceId,
    item.commitSha,
    item.status,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build code commits CSV from items with commit SHAs.
 */
function exportCodeCommitsCsv(data: AutonomousOpsDashboard): string {
  const withCommits = data.activityItems.filter((i: ActivityItem) => i.commitSha);
  const headers = ['Item #', 'Agent', 'Commit SHA', 'Repository', 'Branch', 'Task', 'Status'];
  const rows = withCommits.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    item.commitSha,
    item.repository,
    item.branch,
    sanitizeForExport(item.task),
    item.status,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build deployments CSV from items with deployment IDs.
 */
function exportDeploymentsCsv(data: AutonomousOpsDashboard): string {
  const withDeploys = data.activityItems.filter((i: ActivityItem) => i.deploymentId);
  const headers = ['Item #', 'Agent', 'Deployment ID', 'Production URL', 'Task', 'Status', 'Time (UTC)'];
  const rows = withDeploys.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    item.deploymentId,
    item.productionUrl,
    sanitizeForExport(item.task),
    item.status,
    item.endTime ?? item.startTime,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build investors CSV — redacted to IDs only (no PII).
 */
function exportInvestorsCsv(data: AutonomousOpsDashboard): string {
  const investorItems = data.activityItems.filter((i: ActivityItem) => i.category === 'INVESTORS' || i.investorId);
  const headers = ['Item #', 'Agent', 'Investor ID (redacted)', 'Task', 'Status', 'Time (UTC)', 'Trace ID'];
  const rows = investorItems.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    item.investorId ? `[REDACTED-${item.investorId.slice(0, 8)}]` : '',
    sanitizeForExport(item.task),
    item.status,
    item.endTime ?? item.startTime,
    item.traceId,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build buyers/CRM CSV — redacted to IDs only.
 */
function exportBuyersCrmCsv(data: AutonomousOpsDashboard): string {
  const buyerItems = data.activityItems.filter(
    (i: ActivityItem) => i.category === 'BUYERS' || i.category === 'LEADS_CRM' || i.leadId,
  );
  const headers = ['Item #', 'Agent', 'Lead ID (redacted)', 'Property ID', 'Task', 'Status', 'Time (UTC)'];
  const rows = buyerItems.map((item: ActivityItem) => [
    String(item.itemNumber),
    item.agent,
    item.leadId ? `[REDACTED-${item.leadId.slice(0, 8)}]` : '',
    item.propertyId,
    sanitizeForExport(item.task),
    item.status,
    item.endTime ?? item.startTime,
  ]);
  return buildCsv(headers, rows);
}

/**
 * Build executive summary CSV from daily summary.
 */
function exportExecutiveSummaryCsv(data: AutonomousOpsDashboard): string {
  const s = data.dailySummary;
  if (!s) return 'No daily summary available.\n';
  const headers = ['Metric', 'Value'];
  const rows: (string | null | undefined)[][] = [
    ['Report Date', s.reportDate],
    ['Total Tasks Started', String(s.totalTasksStarted)],
    ['Total Tasks Completed', String(s.totalTasksCompleted)],
    ['Total Tasks Failed', String(s.totalTasksFailed)],
    ['Total Tasks Blocked', String(s.totalTasksBlocked)],
    ['Total Retries', String(s.totalRetries)],
    ['Total Deployments', String(s.totalDeployments)],
    ['Total Code Commits', String(s.totalCodeCommits)],
    ['Total Bugs Fixed', String(s.totalBugsFixed)],
    ['Investors Processed', String(s.totalInvestorsProcessed)],
    ['Buyers Processed', String(s.totalBuyersProcessed)],
    ['Leads Generated', String(s.totalLeadsGenerated)],
    ['Properties Updated', String(s.totalPropertiesUpdated)],
    ['Messages Sent', String(s.totalMessagesSent)],
    ['Revenue Opportunities', String(s.totalRevenueOpportunities)],
    ['Owner Actions Required', String(s.totalOwnerActionsRequired)],
    ['Real Agents', String(data.realAgentCount)],
    ['Idle Agents', String(data.placeholderAgentCount)],
  ];
  return buildCsv(headers, rows);
}

/**
 * Get CSV content for a specific report type.
 */
export function getCsvForReport(
  data: AutonomousOpsDashboard,
  reportType: ExportReportType,
): string {
  switch (reportType) {
    case 'daily_activities': return exportDailyActivitiesCsv(data);
    case 'agent_performance': return exportAgentPerformanceCsv(data);
    case 'code_commits': return exportCodeCommitsCsv(data);
    case 'deployments': return exportDeploymentsCsv(data);
    case 'investors': return exportInvestorsCsv(data);
    case 'buyers_crm': return exportBuyersCrmCsv(data);
    case 'failures_retries': return exportFailuresRetriesCsv(data);
    case 'owner_actions': return exportOwnerActionsCsv(data);
    case 'evidence_ledger': return exportEvidenceLedgerCsv(data);
    case 'executive_summary': return exportExecutiveSummaryCsv(data);
    default: return exportDailyActivitiesCsv(data);
  }
}

/**
 * Get JSON content for a specific report type.
 */
export function getJsonForReport(
  data: AutonomousOpsDashboard,
  reportType: ExportReportType,
): string {
  const meta = {
    exportedAt: new Date().toISOString(),
    reportType,
    dateRange: data.dateRange,
    filters: { agent: data.agents.length, activities: data.activityItems.length },
    disclaimer: data.disclaimer,
  };

  let payload: Record<string, unknown>;
  switch (reportType) {
    case 'daily_activities':
      payload = { meta, activityItems: data.activityItems };
      break;
    case 'agent_performance':
      payload = { meta, agents: data.agents };
      break;
    case 'code_commits':
      payload = { meta, commits: data.activityItems.filter((i) => i.commitSha) };
      break;
    case 'deployments':
      payload = { meta, deployments: data.activityItems.filter((i) => i.deploymentId) };
      break;
    case 'investors':
      payload = {
        meta,
        investorActivity: data.activityItems
          .filter((i) => i.category === 'INVESTORS' || i.investorId)
          .map((i) => ({ ...i, investorId: i.investorId ? `[REDACTED-${i.investorId.slice(0, 8)}]` : null })),
      };
      break;
    case 'buyers_crm':
      payload = {
        meta,
        buyerActivity: data.activityItems
          .filter((i) => i.category === 'BUYERS' || i.category === 'LEADS_CRM' || i.leadId)
          .map((i) => ({ ...i, leadId: i.leadId ? `[REDACTED-${i.leadId.slice(0, 8)}]` : null })),
      };
      break;
    case 'failures_retries':
      payload = {
        meta,
        failures: data.activityItems.filter(
          (i) => i.status === 'FAILED' || i.status === 'BLOCKED' || i.status === 'OWNER_ACTION_REQUIRED' || i.retryCount > 0,
        ),
      };
      break;
    case 'owner_actions':
      payload = { meta, ownerActions: data.ownerActionRequests };
      break;
    case 'evidence_ledger':
      payload = {
        meta,
        evidence: data.activityItems.map((i) => ({
          itemNumber: i.itemNumber,
          agent: i.agent,
          evidence: i.evidence,
          traceId: i.traceId,
          commitSha: i.commitSha,
          status: i.status,
        })),
      };
      break;
    case 'executive_summary':
      payload = {
        meta,
        summary: data.dailySummary,
        realAgentCount: data.realAgentCount,
        placeholderAgentCount: data.placeholderAgentCount,
        categoryBreakdown: data.categoryBreakdown.map((c: CategorySummary) => ({
          category: c.category,
          total: c.total,
          completed: c.completed,
          failed: c.failed,
          blocked: c.blocked,
        })),
      };
      break;
    default:
      payload = { meta, activityItems: data.activityItems };
  }
  return JSON.stringify(payload, null, 2);
}

/**
 * Build an HTML document for PDF export.
 */
function buildPdfHtml(
  data: AutonomousOpsDashboard,
  reportType: ExportReportType,
): string {
  const s = data.dailySummary;
  const reportTitle = reportType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const activityRows = data.activityItems
    .slice(0, 100)
    .map(
      (i: ActivityItem) => `<tr>
        <td>${i.itemNumber}</td>
        <td>${sanitizeForExport(i.agent)}</td>
        <td>${sanitizeForExport(i.task)}</td>
        <td>${i.status}</td>
        <td>${i.startTime ?? '—'}</td>
        <td>${i.traceId ? i.traceId.slice(0, 12) : '—'}</td>
      </tr>`,
    )
    .join('');

  const agentRows = data.agents
    .map(
      (a: UnifiedAgent) => `<tr>
        <td>${a.agentNumber}</td>
        <td>${sanitizeForExport(a.name)}</td>
        <td>${a.department}</td>
        <td>${a.status}</td>
        <td>${a.tasksCompletedToday}</td>
        <td>${a.tasksFailedToday}</td>
        <td>${a.successRate !== null ? `${a.successRate}%` : '—'}</td>
      </tr>`,
    )
    .join('');

  const summaryStats = s
    ? `<div class="stats-grid">
        <div class="stat"><div class="stat-value">${s.totalTasksStarted}</div><div class="stat-label">Tasks Started</div></div>
        <div class="stat"><div class="stat-value">${s.totalTasksCompleted}</div><div class="stat-label">Completed</div></div>
        <div class="stat"><div class="stat-value">${s.totalTasksFailed}</div><div class="stat-label">Failed</div></div>
        <div class="stat"><div class="stat-value">${s.totalDeployments}</div><div class="stat-label">Deploys</div></div>
        <div class="stat"><div class="stat-value">${s.totalRevenueOpportunities}</div><div class="stat-label">Revenue Opps</div></div>
        <div class="stat"><div class="stat-value">${s.totalOwnerActionsRequired}</div><div class="stat-label">Owner Actions</div></div>
      </div>`
    : '<p>No daily summary available.</p>';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, 'Segoe UI', Helvetica, sans-serif; margin: 40px; color: #1a1a1a; }
  h1 { color: #4A90D9; font-size: 22px; margin-bottom: 4px; }
  h2 { color: #333; font-size: 16px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .disclaimer { color: #999; font-size: 10px; font-style: italic; margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  th { text-align: left; padding: 6px 8px; background: #f0f0f0; border-bottom: 2px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .stats-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
  .stat { flex: 1; min-width: 100px; background: #f8f8f8; border-radius: 8px; padding: 12px; text-align: center; }
  .stat-value { font-size: 24px; font-weight: bold; color: #4A90D9; }
  .stat-label { font-size: 10px; color: #666; margin-top: 4px; }
  .footer { margin-top: 30px; font-size: 10px; color: #999; }
</style>
</head>
<body>
  <h1>IVX Autonomous Operations — ${reportTitle}</h1>
  <div class="meta">
    Generated: ${new Date().toISOString()} | Range: ${data.dateRange.label} |
    Agents: ${data.realAgentCount} real / ${data.placeholderAgentCount} idle |
    Activities: ${data.activityItems.length}
  </div>

  ${(reportType === 'executive_summary' || reportType === 'daily_activities') ? `
    <h2>Executive Summary</h2>
    ${summaryStats}
  ` : ''}

  ${(reportType === 'agent_performance' || reportType === 'executive_summary') ? `
    <h2>Agent Performance</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Dept</th><th>Status</th><th>Done</th><th>Failed</th><th>Success</th></tr></thead>
      <tbody>${agentRows}</tbody>
    </table>
  ` : ''}

  ${(reportType === 'daily_activities' || reportType === 'evidence_ledger' || reportType === 'failures_retries') ? `
    <h2>Activity Log (Top 100)</h2>
    <table>
      <thead><tr><th>#</th><th>Agent</th><th>Task</th><th>Status</th><th>Start</th><th>Trace</th></tr></thead>
      <tbody>${activityRows}</tbody>
    </table>
  ` : ''}

  <div class="disclaimer">${sanitizeForExport(data.disclaimer)}</div>
  <div class="footer">IVX Holdings — Confidential | Generated from real system records | No fabricated data</div>
</body>
</html>`;
}

/**
 * Main export function — generates and shares a file.
 */
export async function exportDashboard(
  data: AutonomousOpsDashboard,
  format: ExportFormat,
  reportType: ExportReportType,
): Promise<{ ok: boolean; filePath: string; error?: string }> {
  try {
    await ensureExportDir();
    const slug = timestampSlug();
    const baseName = `ivx-${reportType}-${slug}`;

    if (format === 'json') {
      const content = getJsonForReport(data, reportType);
      const filePath = `${EXPORT_DIR}${baseName}.json`;
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'IVX Dashboard Export',
        UTI: 'public.json',
      });
      return { ok: true, filePath };
    }

    if (format === 'csv') {
      const content = getCsvForReport(data, reportType);
      const filePath = `${EXPORT_DIR}${baseName}.csv`;
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'IVX Dashboard Export',
        UTI: 'public.comma-separated-values-text',
      });
      return { ok: true, filePath };
    }

    if (format === 'pdf') {
      const html = buildPdfHtml(data, reportType);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'IVX Dashboard Export',
        UTI: 'com.adobe.pdf',
      });
      return { ok: true, filePath: uri };
    }

    return { ok: false, filePath: '', error: `Unsupported format: ${format}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return { ok: false, filePath: '', error: message };
  }
}

export const EXPORT_REPORT_LABELS: Record<ExportReportType, string> = {
  daily_activities: 'Daily Activities',
  agent_performance: 'Agent Performance',
  code_commits: 'Code & Commits',
  deployments: 'Deployments',
  investors: 'Investors',
  buyers_crm: 'Buyers & CRM',
  failures_retries: 'Failures & Retries',
  owner_actions: 'Owner Action Requests',
  evidence_ledger: 'Evidence Ledger',
  executive_summary: 'Executive Summary',
};
