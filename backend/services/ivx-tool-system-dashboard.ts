/**
 * IVX Self-Upgrade Tool System — Tool Dashboard (read-only aggregator).
 *
 * One owner-facing snapshot of the IVX-native tool system:
 *   - available tools  (in the approved catalog, not yet enabled)
 *   - active tools     (registered + enabled + test-passed)
 *   - failed tools     (registered but failed the test gate)
 *   - missing credentials (tools whose required secrets are absent)
 *   - last successful run + risk level per tool
 *   - the owner-approval gate map.
 *
 * Read-only + defensive — a failing reader degrades to an honest empty section,
 * never throws.
 */
import {
  APPROVED_TOOL_CATALOG,
  scanToolForSafety,
} from './ivx-tool-catalog';
import {
  listTools,
  summarizeTools,
  type ToolApprovalCategory,
  type ToolRecord,
  type ToolRegistrySummary,
  type ToolRiskLevel,
} from './ivx-tool-registry-store';

export const IVX_TOOL_DASHBOARD_MARKER = 'ivx-tool-dashboard-2026-06-05';

export type DashboardToolRow = {
  id: string;
  name: string;
  purpose: string;
  riskLevel: ToolRiskLevel;
  enabled: boolean;
  testStatus: ToolRecord['testStatus'];
  requiresApproval: boolean;
  approvalCategories: ToolApprovalCategory[];
  requiredSecrets: string[];
  missingSecrets: string[];
  lastSuccessfulRunAt: string | null;
  lastRunLabel: string | null;
  runCount: number;
};

export type AvailableCatalogRow = {
  name: string;
  purpose: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  installed: boolean;
};

export type ToolSystemDashboard = {
  marker: string;
  generatedAt: string;
  summary: ToolRegistrySummary;
  activeTools: DashboardToolRow[];
  failedTools: DashboardToolRow[];
  pendingTools: DashboardToolRow[];
  toolsMissingCredentials: DashboardToolRow[];
  availableToInstall: AvailableCatalogRow[];
  approvalGates: { category: ToolApprovalCategory; label: string }[];
};

const APPROVAL_GATE_LABELS: { category: ToolApprovalCategory; label: string }[] = [
  { category: 'payments', label: 'payments / spending money' },
  { category: 'deletes', label: 'deleting data / filesystem writes' },
  { category: 'production_schema', label: 'production database / schema changes' },
  { category: 'credential_changes', label: 'credential / secret changes' },
  { category: 'external_publishing', label: 'sending / publishing externally' },
  { category: 'legal_compliance', label: 'legal / compliance actions' },
];

function toRow(record: ToolRecord, env: NodeJS.ProcessEnv): DashboardToolRow {
  const missingSecrets = record.requiredSecrets.filter(
    (name) => !(env[name] && String(env[name]).trim()),
  );
  return {
    id: record.id,
    name: record.name,
    purpose: record.purpose,
    riskLevel: record.riskLevel,
    enabled: record.enabled,
    testStatus: record.testStatus,
    requiresApproval: record.requiresApproval,
    approvalCategories: record.approvalCategories,
    requiredSecrets: record.requiredSecrets,
    missingSecrets,
    lastSuccessfulRunAt: record.lastSuccessfulRunAt,
    lastRunLabel: record.lastRunLabel,
    runCount: record.runCount,
  };
}

/** Build the read-only tool-system dashboard. */
export async function buildToolSystemDashboard(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ToolSystemDashboard> {
  let tools: ToolRecord[] = [];
  try {
    tools = await listTools();
  } catch {
    tools = [];
  }
  let summary: ToolRegistrySummary;
  try {
    summary = await summarizeTools(env);
  } catch {
    summary = {
      marker: 'ivx-tool-registry-2026-06-05',
      generatedAt: new Date().toISOString(),
      total: 0, enabled: 0, disabled: 0, passed: 0, failed: 0, untested: 0,
      byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
      requiringApproval: 0, missingSecrets: 0,
    };
  }

  const rows = tools.map((t) => toRow(t, env));
  const installedNames = new Set(tools.map((t) => t.name.toLowerCase()));

  const availableToInstall: AvailableCatalogRow[] = APPROVED_TOOL_CATALOG.map((def) => {
    const scan = scanToolForSafety(def);
    return {
      name: def.name,
      purpose: def.purpose,
      riskLevel: scan.riskLevel,
      requiresApproval: scan.requiresApproval,
      installed: installedNames.has(def.name.toLowerCase()),
    };
  });

  return {
    marker: IVX_TOOL_DASHBOARD_MARKER,
    generatedAt: new Date().toISOString(),
    summary,
    activeTools: rows.filter((r) => r.enabled && r.testStatus === 'passed'),
    failedTools: rows.filter((r) => r.testStatus === 'failed'),
    pendingTools: rows.filter((r) => r.testStatus === 'untested'),
    toolsMissingCredentials: rows.filter((r) => r.missingSecrets.length > 0),
    availableToInstall,
    approvalGates: APPROVAL_GATE_LABELS,
  };
}
