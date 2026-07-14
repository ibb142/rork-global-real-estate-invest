/**
 * IVX Vercel Exit Command Center — Owner-only dashboard.
 *
 * 15 tabs: Executive Summary, 9 AI Live Work, Vercel Dependency Inventory,
 * Architecture Map, API Migration, AI Gateway Migration, Environment and Secrets,
 * Infrastructure, DNS and Traffic, Tests, Deployments, Incidents, Costs,
 * Evidence Ledger, Final Certification.
 *
 * Owner controls: pause/resume/approve cutover/rollback/freeze.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';

const GOLD = '#FFD700';
const GREEN = '#00C48C';
const RED = '#FF4D4D';
const BLUE = '#4A90D9';
const DARK_BG = '#0A0A0F';
const CARD_BG = '#15151F';
const CARD_BORDER = '#252535';
const CARD_ELEVATED = '#1A1A2E';

const STATUS_COLORS: Record<string, string> = {
  IDLE: '#666',
  DISCOVERING: BLUE,
  ANALYZING: BLUE,
  IMPLEMENTING: GOLD,
  WAITING_FOR_REVIEW: GOLD,
  TESTING: GOLD,
  TEST_FAILED: RED,
  TEST_PASSED: GREEN,
  DEPLOYING: BLUE,
  DEPLOYMENT_FAILED: RED,
  DEPLOYED: BLUE,
  PRODUCTION_VERIFIED: GREEN,
  BLOCKED: RED,
  REJECTED: RED,
  COMPLETE: GREEN,
  IN_PROGRESS: GOLD,
  PENDING: '#666',
  DISCOVERED: BLUE,
  REPLACEMENT_IDENTIFIED: BLUE,
  STAGING_VERIFIED: BLUE,
  PRODUCTION_CUTOVER: GOLD,
  VERIFIED: GREEN,
  CLEAR: GREEN,
  ACTIVE_DEPENDENCIES: RED,
};

const RISK_COLORS: Record<string, string> = {
  low: GREEN,
  medium: GOLD,
  high: '#FF8800',
  critical: RED,
};

const API_BASE = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || 'https://api.ivxholding.com';

// ─── API Types ─────────────────────────────────────────────────────────────────

interface DashboardData {
  migrationStatus: string;
  overallCompletionPercentage: number;
  currentPhase: { phase: number; name: string; status: string; description: string };
  vercelDependenciesDiscovered: number;
  dependenciesRemoved: number;
  dependenciesRemaining: number;
  apisMigrated: number;
  environmentVariablesMigrated: number;
  secretsMigrated: number;
  servicesDeployed: number;
  testsPassed: number;
  testsFailed: number;
  currentProductionCommit: string | null;
  currentDeploymentId: string | null;
  currentRollbackTarget: string;
  lastProductionHealthResult: string;
  vercelTrafficPercentage: number;
  ivxInfrastructureTrafficPercentage: number;
  estimatedMonthlyCostBefore: number;
  estimatedMonthlyCostAfter: number;
  monthlySavings: number;
  activeIncidents: number;
  currentBlockers: string[];
  generatedAt: string;
  totalDependencies: number;
}

interface AgentState {
  agentNumber: number;
  agentName: string;
  role: string;
  currentTask: string;
  status: string;
  progress: number;
  startTime: string;
  lastActivity: string;
  filesReserved: string[];
  filesChanged: string[];
  testsExecuted: number;
  testResult: string;
  lastCommitSha: string | null;
  pullRequest: string | null;
  deploymentId: string | null;
  productionVerification: boolean;
  currentBlocker: string | null;
  nextAction: string;
  timeWorking: string;
  tasksCompletedToday: number;
  tasksFailedToday: number;
}

interface VercelDependency {
  dependencyId: string;
  vercelService: string;
  dependencyType: string;
  sourceFile: string;
  lineReference: string;
  runtimeEnvironment: string;
  currentPurpose: string;
  replacementService: string;
  assignedAI: number;
  risk: string;
  migrationStatus: string;
  testStatus: string;
  commitSha: string | null;
  deploymentId: string | null;
  cutoverStatus: string;
  rollbackMethod: string;
  evidence: string[];
}

interface InventoryResponse {
  dependencies: VercelDependency[];
  total: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  byStatus: Record<string, number>;
  byAssignedAI: Record<number, number>;
}

interface ArchitectureItem {
  dependencyId: string;
  currentImplementation: string;
  targetImplementation: string;
  dataMigrationRequired: boolean;
  secretMigrationRequired: boolean;
  dnsChangeRequired: boolean;
  downtimeRisk: string;
  rollbackProcedure: string;
  assignedAI: number;
  acceptanceTest: string;
}

interface Phase {
  phase: number;
  name: string;
  status: string;
  description: string;
}

interface ControlState {
  migrationPaused: boolean;
  deploymentsFrozen: boolean;
  cutoverApproved: boolean;
  rollbackTriggered: boolean;
  lastOwnerAction: string;
  lastOwnerActionTime: string;
}

interface CertificationCriterion {
  id: number;
  description: string;
  met: boolean;
  evidence: string;
}

interface CertificationData {
  criteria: CertificationCriterion[];
  metCount: number;
  totalCount: number;
  completionPercentage: number;
  finalStatus: string;
  readyForCutover: boolean;
  ownerApprovalRequired: boolean;
}

interface ScanResult {
  scanPatterns: Array<{
    pattern: string;
    activeCount: number;
    totalCount: number;
    status: string;
    files: Array<{ dependencyId: string; file: string; migrationStatus: string }>;
  }>;
  activeDependencies: number;
  totalScanned: number;
  vercelZero: boolean;
  scanTimestamp: string;
  finalStatus: string;
}

interface CostData {
  before: Record<string, number>;
  after: Record<string, number>;
  monthlySavings: number;
  annualSavings: number;
}

// ─── API Functions ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

// ─── Tab Definitions ───────────────────────────────────────────────────────────

type TabId =
  | 'summary'
  | 'agents'
  | 'inventory'
  | 'architecture'
  | 'api_migration'
  | 'ai_gateway'
  | 'secrets'
  | 'infrastructure'
  | 'dns_traffic'
  | 'tests'
  | 'deployments'
  | 'incidents'
  | 'costs'
  | 'evidence'
  | 'certification';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'summary', label: 'Executive Summary', icon: 'M3 3h18v18H3z' },
  { id: 'agents', label: '9 AI Live Work', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z' },
  { id: 'inventory', label: 'Dependency Inventory', icon: 'M4 6h16M4 12h16M4 18h16' },
  { id: 'architecture', label: 'Architecture Map', icon: 'M3 12l9-9 9 9-9 9z' },
  { id: 'api_migration', label: 'API Migration', icon: 'M8 7h8M8 12h8M8 17h5' },
  { id: 'ai_gateway', label: 'AI Gateway Migration', icon: 'M12 2L2 7l10 5 10-5-10-5z' },
  { id: 'secrets', label: 'Environment & Secrets', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z' },
  { id: 'infrastructure', label: 'Infrastructure', icon: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
  { id: 'dns_traffic', label: 'DNS & Traffic', icon: 'M3 12c0-5 4-9 9-9s9 4 9 9-4 9-9 9-9-4-9-9z' },
  { id: 'tests', label: 'Tests', icon: 'M9 12l2 2 4-4' },
  { id: 'deployments', label: 'Deployments', icon: 'M12 4v16m-7-7l7 7 7-7' },
  { id: 'incidents', label: 'Incidents', icon: 'M12 9v4m0 4h.01' },
  { id: 'costs', label: 'Costs', icon: 'M12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2 .9 2 2-.9 2-2 2m0-8V6m0 12v-2' },
  { id: 'evidence', label: 'Evidence Ledger', icon: 'M9 12h6m-6 4h6m-6-8h6M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { id: 'certification', label: 'Final Certification', icon: 'M5 13l4 4L19 7' },
];

// ─── Reusable Components ───────────────────────────────────────────────────────

function MetricCard({ label, value, color = GOLD, sublabel }: { label: string; value: string | number; color?: string; sublabel?: string }) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {sublabel ? <Text style={styles.metricSublabel}>{sublabel}</Text> : null}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? GOLD;
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + '22', borderColor: color }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── Tab Content Components ────────────────────────────────────────────────────

function ExecutiveSummaryTab({ data }: { data: DashboardData }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.progressBanner}>
        <Text style={styles.progressBannerTitle}>{data.migrationStatus}</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${data.overallCompletionPercentage}%` }]} />
        </View>
        <Text style={styles.progressPercentage}>{data.overallCompletionPercentage}% Complete</Text>
        <Text style={styles.progressPhase}>
          Phase {data.currentPhase.phase}: {data.currentPhase.name} — {data.currentPhase.status}
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard label="Dependencies Discovered" value={data.vercelDependenciesDiscovered} color={BLUE} />
        <MetricCard label="Dependencies Removed" value={data.dependenciesRemoved} color={GREEN} />
        <MetricCard label="Dependencies Remaining" value={data.dependenciesRemaining} color={RED} />
        <MetricCard label="APIs Migrated" value={data.apisMigrated} color={GREEN} />
        <MetricCard label="Env Vars Migrated" value={data.environmentVariablesMigrated} color={BLUE} />
        <MetricCard label="Secrets Migrated" value={data.secretsMigrated} color={GOLD} />
        <MetricCard label="Services Deployed" value={data.servicesDeployed} color={GREEN} />
        <MetricCard label="Tests Passed" value={data.testsPassed} color={GREEN} />
        <MetricCard label="Tests Failed" value={data.testsFailed} color={RED} />
      </View>

      <SectionHeader title="Production Status" />
      <Card>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Production Commit</Text>
          <Text style={styles.rowValue}>{data.currentProductionCommit ?? 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Deployment ID</Text>
          <Text style={styles.rowValue}>{data.currentDeploymentId ?? 'N/A'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Rollback Target</Text>
          <Text style={styles.rowValue}>{data.currentRollbackTarget}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Health Result</Text>
          <Text style={[styles.rowValue, { color: GREEN }]}>{data.lastProductionHealthResult}</Text>
        </View>
      </Card>

      <SectionHeader title="Traffic Routing" />
      <View style={styles.metricsGrid}>
        <MetricCard label="Vercel Traffic" value={`${data.vercelTrafficPercentage}%`} color={RED} />
        <MetricCard label="IVX Infrastructure" value={`${data.ivxInfrastructureTrafficPercentage}%`} color={GREEN} />
      </View>

      <SectionHeader title="Cost Estimates" />
      <View style={styles.metricsGrid}>
        <MetricCard label="Before Migration" value={`$${data.estimatedMonthlyCostBefore}/mo`} color={RED} />
        <MetricCard label="After Migration" value={`$${data.estimatedMonthlyCostAfter}/mo`} color={GREEN} />
        <MetricCard label="Monthly Savings" value={`$${data.monthlySavings}/mo`} color={GOLD} />
      </View>

      <SectionHeader title="Incidents & Blockers" />
      <Card>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Active Incidents</Text>
          <Text style={[styles.rowValue, { color: data.activeIncidents > 0 ? RED : GREEN }]}>
            {data.activeIncidents}
          </Text>
        </View>
        {data.currentBlockers.length > 0 ? (
          <View style={styles.blockerList}>
            {data.currentBlockers.map((blocker, i) => (
              <Text key={i} style={styles.blockerText}>  - {blocker}</Text>
            ))}
          </View>
        ) : (
          <Text style={styles.noBlockers}>No active blockers</Text>
        )}
      </Card>
    </ScrollView>
  );
}

function AgentsTab({ agents }: { agents: AgentState[] }) {
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="9 AI Senior Developers" subtitle="Live work tracking — only PRODUCTION VERIFIED counts as complete" />
      {agents.map((agent) => (
        <Pressable key={agent.agentNumber} onPress={() => setSelectedAgent(agent)}>
          <Card style={styles.agentCard}>
            <View style={styles.agentHeader}>
              <View style={styles.agentNumberCircle}>
                <Text style={styles.agentNumberText}>AI{agent.agentNumber}</Text>
              </View>
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{agent.agentName}</Text>
                <Text style={styles.agentRole}>{agent.role}</Text>
              </View>
              <StatusBadge status={agent.status} />
            </View>
            <View style={styles.agentProgressRow}>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${agent.progress}%` }]} />
              </View>
              <Text style={styles.agentProgressText}>{agent.progress}%</Text>
            </View>
            <Text style={styles.agentTask} numberOfLines={2}>{agent.currentTask}</Text>
            <View style={styles.agentMetaRow}>
              <Text style={styles.agentMeta}>Files: {agent.filesReserved.length}</Text>
              <Text style={styles.agentMeta}>Tests: {agent.testsExecuted}</Text>
              <Text style={styles.agentMeta}>Done: {agent.tasksCompletedToday}</Text>
              <Text style={styles.agentMeta}>Failed: {agent.tasksFailedToday}</Text>
            </View>
            {agent.currentBlocker ? (
              <View style={styles.blockerBadge}>
                <Text style={styles.blockerBadgeText}>BLOCKED: {agent.currentBlocker}</Text>
              </View>
            ) : null}
          </Card>
        </Pressable>
      ))}

      <Modal visible={selectedAgent !== null} transparent animationType="slide" onRequestClose={() => setSelectedAgent(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedAgent ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>AI{selectedAgent.agentNumber} — {selectedAgent.agentName}</Text>
                  <Pressable onPress={() => setSelectedAgent(null)}>
                    <Text style={styles.modalClose}>X</Text>
                  </Pressable>
                </View>
                <Text style={styles.modalRole}>{selectedAgent.role}</Text>
                <StatusBadge status={selectedAgent.status} />
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Current Task</Text>
                  <Text style={styles.modalSectionText}>{selectedAgent.currentTask}</Text>
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Next Action</Text>
                  <Text style={styles.modalSectionText}>{selectedAgent.nextAction}</Text>
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Files Reserved</Text>
                  {selectedAgent.filesReserved.map((f, i) => (
                    <Text key={i} style={styles.modalFileText}>{f}</Text>
                  ))}
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Files Changed</Text>
                  {selectedAgent.filesChanged.length > 0 ? (
                    selectedAgent.filesChanged.map((f, i) => (
                      <Text key={i} style={styles.modalFileText}>{f}</Text>
                    ))
                  ) : (
                    <Text style={styles.modalEmptyText}>No files changed yet</Text>
                  )}
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Test Results</Text>
                  <Text style={styles.modalSectionText}>
                    Executed: {selectedAgent.testsExecuted} | Result: {selectedAgent.testResult}
                  </Text>
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Deployment</Text>
                  <Text style={styles.modalSectionText}>
                    Commit: {selectedAgent.lastCommitSha ?? 'N/A'}{'\n'}
                    PR: {selectedAgent.pullRequest ?? 'N/A'}{'\n'}
                    Deploy ID: {selectedAgent.deploymentId ?? 'N/A'}{'\n'}
                    Production Verified: {selectedAgent.productionVerification ? 'YES' : 'NO'}
                  </Text>
                </View>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Timing</Text>
                  <Text style={styles.modalSectionText}>
                    Started: {selectedAgent.startTime}{'\n'}
                    Last Activity: {selectedAgent.lastActivity}{'\n'}
                    Working Time: {selectedAgent.timeWorking}
                  </Text>
                </View>
                {selectedAgent.currentBlocker ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Blocker</Text>
                    <Text style={[styles.modalSectionText, { color: RED }]}>{selectedAgent.currentBlocker}</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InventoryTab({ data }: { data: InventoryResponse }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const types = useMemo(() => ['all', ...Object.keys(data.byType)], [data]);
  const risks = ['all', 'low', 'medium', 'high', 'critical'];
  const statuses = ['all', 'DISCOVERED', 'REPLACEMENT_IDENTIFIED', 'IMPLEMENTING', 'TESTING', 'STAGING_VERIFIED', 'PRODUCTION_CUTOVER', 'VERIFIED', 'BLOCKED'];

  const filtered = useMemo(() => {
    return data.dependencies.filter((d) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!d.dependencyId.toLowerCase().includes(q) &&
            !d.vercelService.toLowerCase().includes(q) &&
            !d.sourceFile.toLowerCase().includes(q) &&
            !d.currentPurpose.toLowerCase().includes(q)) return false;
      }
      if (filterType !== 'all' && d.dependencyType !== filterType) return false;
      if (filterRisk !== 'all' && d.risk !== filterRisk) return false;
      if (filterStatus !== 'all' && d.migrationStatus !== filterStatus) return false;
      return true;
    });
  }, [data, searchQuery, filterType, filterRisk, filterStatus]);

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Vercel Dependency Inventory" subtitle={`${data.total} dependencies discovered`} />

      <View style={styles.summaryRow}>
        {Object.entries(data.byType).map(([type, count]) => (
          <View key={type} style={styles.summaryChip}>
            <Text style={styles.summaryChipText}>{type}: {count}</Text>
          </View>
        ))}
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search dependencies..."
        placeholderTextColor="#666"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {types.map((t) => (
          <Pressable key={t} onPress={() => setFilterType(t)}>
            <Text style={[styles.filterChip, filterType === t && styles.filterChipActive]}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {risks.map((r) => (
          <Pressable key={r} onPress={() => setFilterRisk(r)}>
            <Text style={[styles.filterChip, filterRisk === r && styles.filterChipActive]}>{r}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {statuses.map((s) => (
          <Pressable key={s} onPress={() => setFilterStatus(s)}>
            <Text style={[styles.filterChip, filterStatus === s && styles.filterChipActive]}>{s.replace(/_/g, ' ')}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.filterResultText}>{filtered.length} of {data.total} dependencies</Text>

      {filtered.map((dep) => (
        <Card key={dep.dependencyId} style={styles.inventoryCard}>
          <View style={styles.inventoryHeader}>
            <Text style={styles.inventoryId}>{dep.dependencyId}</Text>
            <StatusBadge status={dep.migrationStatus} />
          </View>
          <Text style={styles.inventoryService}>{dep.vercelService}</Text>
          <Text style={styles.inventoryType}>{dep.dependencyType} | {dep.runtimeEnvironment}</Text>
          <Text style={styles.inventoryFile}>{dep.sourceFile}</Text>
          <Text style={styles.inventoryLine}>{dep.lineReference}</Text>
          <Text style={styles.inventoryPurpose}>{dep.currentPurpose}</Text>
          <View style={styles.inventoryReplaceRow}>
            <Text style={styles.inventoryReplaceLabel}>Replacement:</Text>
            <Text style={styles.inventoryReplaceValue}>{dep.replacementService}</Text>
          </View>
          <View style={styles.inventoryMetaRow}>
            <Text style={[styles.inventoryRisk, { color: RISK_COLORS[dep.risk] ?? GOLD }]}>Risk: {dep.risk}</Text>
            <Text style={styles.inventoryAssigned}>AI{dep.assignedAI}</Text>
            <Text style={styles.inventoryTest}>Test: {dep.testStatus}</Text>
          </View>
          <Text style={styles.inventoryRollback}>Rollback: {dep.rollbackMethod}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function ArchitectureTab({ items }: { items: ArchitectureItem[] }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Architecture Map" subtitle={`${items.length} dependency mappings — current to target`} />
      {items.map((item) => (
        <Card key={item.dependencyId} style={styles.archCard}>
          <Text style={styles.archId}>{item.dependencyId}</Text>
          <View style={styles.archCurrentBox}>
            <Text style={styles.archBoxLabel}>CURRENT (Vercel)</Text>
            <Text style={styles.archBoxText}>{item.currentImplementation}</Text>
          </View>
          <Text style={styles.archArrow}>{'  ->  '}</Text>
          <View style={styles.archTargetBox}>
            <Text style={styles.archBoxLabel}>TARGET (IVX)</Text>
            <Text style={styles.archBoxText}>{item.targetImplementation}</Text>
          </View>
          <View style={styles.archMetaRow}>
            <Text style={styles.archMeta}>Data: {item.dataMigrationRequired ? 'YES' : 'NO'}</Text>
            <Text style={styles.archMeta}>Secret: {item.secretMigrationRequired ? 'YES' : 'NO'}</Text>
            <Text style={styles.archMeta}>DNS: {item.dnsChangeRequired ? 'YES' : 'NO'}</Text>
            <Text style={[styles.archMeta, { color: RISK_COLORS[item.downtimeRisk] ?? GOLD }]}>
              Downtime: {item.downtimeRisk}
            </Text>
          </View>
          <Text style={styles.archAssigned}>Assigned: AI{item.assignedAI}</Text>
          <Text style={styles.archAcceptance}>Acceptance: {item.acceptanceTest}</Text>
          <Text style={styles.archRollback}>Rollback: {item.rollbackProcedure}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function PhasesTab({ phases }: { phases: Phase[] }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Migration Phases" subtitle={`${phases.length} phases — 14 total`} />
      {phases.map((p) => (
        <Card key={p.phase} style={styles.phaseCard}>
          <View style={styles.phaseHeader}>
            <Text style={styles.phaseNumber}>Phase {p.phase}</Text>
            <StatusBadge status={p.status} />
          </View>
          <Text style={styles.phaseName}>{p.name}</Text>
          <Text style={styles.phaseDescription}>{p.description}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function ControlsTab({
  controlState,
  onAction,
}: {
  controlState: ControlState | null;
  onAction: (action: string) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const handleAction = (action: string, label: string, dangerous: boolean) => {
    if (dangerous) {
      Alert.alert(
        'Confirm Action',
        `Are you sure you want to ${label}? This is a dangerous operation.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'destructive', onPress: () => onAction(action) },
        ],
      );
    } else {
      onAction(action);
    }
  };

  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Owner Controls" subtitle="Dangerous operations require confirmation" />

      {controlState ? (
        <Card>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Migration Paused</Text>
            <Text style={[styles.rowValue, { color: controlState.migrationPaused ? RED : GREEN }]}>
              {controlState.migrationPaused ? 'YES' : 'NO'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Deployments Frozen</Text>
            <Text style={[styles.rowValue, { color: controlState.deploymentsFrozen ? RED : GREEN }]}>
              {controlState.deploymentsFrozen ? 'YES' : 'NO'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Cutover Approved</Text>
            <Text style={[styles.rowValue, { color: controlState.cutoverApproved ? GREEN : GOLD }]}>
              {controlState.cutoverApproved ? 'APPROVED' : 'PENDING'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rollback Triggered</Text>
            <Text style={[styles.rowValue, { color: controlState.rollbackTriggered ? RED : GREEN }]}>
              {controlState.rollbackTriggered ? 'YES' : 'NO'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last Action</Text>
            <Text style={styles.rowValue}>{controlState.lastOwnerAction}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Last Action Time</Text>
            <Text style={styles.rowValue}>{controlState.lastOwnerActionTime}</Text>
          </View>
        </Card>
      ) : (
        <ActivityIndicator color={GOLD} />
      )}

      <View style={styles.controlsGrid}>
        <Pressable style={styles.controlButton} onPress={() => handleAction('pause', 'pause migration', false)}>
          <Text style={styles.controlButtonText}>Pause Migration</Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={() => handleAction('resume', 'resume migration', false)}>
          <Text style={styles.controlButtonText}>Resume Migration</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, { borderColor: GREEN }]} onPress={() => handleAction('approve_cutover', 'approve production cutover', true)}>
          <Text style={[styles.controlButtonText, { color: GREEN }]}>Approve Cutover</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, { borderColor: RED }]} onPress={() => handleAction('trigger_rollback', 'trigger rollback', true)}>
          <Text style={[styles.controlButtonText, { color: RED }]}>Trigger Rollback</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, { borderColor: RED }]} onPress={() => handleAction('freeze_deployments', 'freeze deployments', true)}>
          <Text style={[styles.controlButtonText, { color: RED }]}>Freeze Deployments</Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={() => handleAction('unfreeze_deployments', 'unfreeze deployments', false)}>
          <Text style={styles.controlButtonText}>Unfreeze Deployments</Text>
        </Pressable>
        <Pressable style={[styles.controlButton, { borderColor: RED }]} onPress={() => handleAction('reject_evidence', 'reject evidence', true)}>
          <Text style={[styles.controlButtonText, { color: RED }]}>Reject Evidence</Text>
        </Pressable>
        <Pressable style={styles.controlButton} onPress={() => handleAction('reassign_task', 'reassign task', false)}>
          <Text style={styles.controlButtonText}>Reassign Task</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function CertificationTab({ data }: { data: CertificationData }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Final Certification" subtitle="20 acceptance criteria" />

      <View style={styles.certBanner}>
        <Text style={styles.certStatus}>{data.finalStatus}</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${data.completionPercentage}%` }]} />
        </View>
        <Text style={styles.certProgress}>{data.metCount}/{data.totalCount} criteria met ({data.completionPercentage}%)</Text>
        {data.ownerApprovalRequired ? (
          <View style={styles.certApprovalBanner}>
            <Text style={styles.certApprovalText}>Owner approval required for cutover</Text>
          </View>
        ) : null}
        {data.readyForCutover ? (
          <View style={styles.certReadyBanner}>
            <Text style={styles.certReadyText}>Ready for production cutover</Text>
          </View>
        ) : null}
      </View>

      {data.criteria.map((c) => (
        <Card key={c.id} style={styles.certCard}>
          <View style={styles.certHeader}>
            <Text style={styles.certId}>#{c.id}</Text>
            <Text style={[styles.certMet, { color: c.met ? GREEN : RED }]}>
              {c.met ? 'MET' : 'NOT MET'}
            </Text>
          </View>
          <Text style={styles.certDescription}>{c.description}</Text>
          <Text style={styles.certEvidence}>Evidence: {c.evidence}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

function ScanTab({ data }: { data: ScanResult }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Vercel-Zero Verification Scan" subtitle="Live scan of all active Vercel references" />

      <View style={[styles.scanBanner, { backgroundColor: data.vercelZero ? GREEN + '22' : RED + '22' }]}>
        <Text style={[styles.scanStatus, { color: data.vercelZero ? GREEN : RED }]}>
          {data.vercelZero ? 'VERCEL ZERO — ALL CLEAR' : `${data.activeDependencies} ACTIVE DEPENDENCIES`}
        </Text>
        <Text style={styles.scanTimestamp}>Scan time: {data.scanTimestamp}</Text>
        <Text style={styles.scanFinal}>{data.finalStatus}</Text>
      </View>

      {data.scanPatterns.map((p) => (
        <Card key={p.pattern} style={styles.scanCard}>
          <View style={styles.scanHeader}>
            <Text style={styles.scanPattern}>{p.pattern}</Text>
            <StatusBadge status={p.status} />
          </View>
          <Text style={styles.scanCounts}>
            Active: {p.activeCount} | Total: {p.totalCount}
          </Text>
          {p.files.length > 0 && (
            <View>
              {p.files.slice(0, 5).map((f, i) => (
                <Text key={i} style={styles.scanFile}>{f.dependencyId}: {f.file}</Text>
              ))}
              {p.files.length > 5 && <Text style={styles.scanMore}>...and {p.files.length - 5} more</Text>}
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

function CostsTab({ data }: { data: CostData }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Cost Analysis" subtitle="Monthly cost comparison" />

      <View style={styles.costComparisonRow}>
        <View style={styles.costBeforeBox}>
          <Text style={styles.costBoxTitle}>BEFORE (with Vercel)</Text>
          {Object.entries(data.before).map(([key, val]) => (
            <Text key={key} style={styles.costLine}>{key}: ${val}</Text>
          ))}
          <Text style={styles.costTotal}>Total: ${data.before.total}/mo</Text>
        </View>
        <View style={styles.costAfterBox}>
          <Text style={styles.costBoxTitle}>AFTER (IVX only)</Text>
          {Object.entries(data.after).map(([key, val]) => (
            <Text key={key} style={styles.costLine}>{key}: ${val}</Text>
          ))}
          <Text style={styles.costTotal}>Total: ${data.after.total}/mo</Text>
        </View>
      </View>

      <View style={styles.savingsBanner}>
        <Text style={styles.savingsText}>Monthly Savings: ${data.monthlySavings}/mo</Text>
        <Text style={styles.savingsAnnual}>Annual Savings: ${data.annualSavings}/yr</Text>
      </View>
    </ScrollView>
  );
}

function SimpleTab({ title, message }: { title: string; message: string }) {
  return (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title={title} />
      <Card>
        <Text style={styles.simpleTabText}>{message}</Text>
      </Card>
    </ScrollView>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function VercelExitCommandCenterScreen() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('summary');

  const dashboardQuery = useQuery<DashboardData>({
    queryKey: ['vercel-exit', 'dashboard'],
    queryFn: () => apiFetch<DashboardData>('/api/ivx/vercel-exit/dashboard'),
    refetchInterval: 15000,
  });

  const agentsQuery = useQuery<{ agents: AgentState[]; totalAgents: number }>({
    queryKey: ['vercel-exit', 'agents'],
    queryFn: () => apiFetch<{ agents: AgentState[]; totalAgents: number }>('/api/ivx/vercel-exit/agents'),
    refetchInterval: 10000,
  });

  const inventoryQuery = useQuery<InventoryResponse>({
    queryKey: ['vercel-exit', 'inventory'],
    queryFn: () => apiFetch<InventoryResponse>('/api/ivx/vercel-exit/inventory'),
  });

  const architectureQuery = useQuery<{ architectureMap: ArchitectureItem[]; targetArchitecture: unknown }>({
    queryKey: ['vercel-exit', 'architecture'],
    queryFn: () => apiFetch<{ architectureMap: ArchitectureItem[]; targetArchitecture: unknown }>('/api/ivx/vercel-exit/architecture'),
  });

  const phasesQuery = useQuery<{ phases: Phase[]; totalPhases: number }>({
    queryKey: ['vercel-exit', 'phases'],
    queryFn: () => apiFetch<{ phases: Phase[]; totalPhases: number }>('/api/ivx/vercel-exit/phases'),
  });

  const controlsQuery = useQuery<ControlState>({
    queryKey: ['vercel-exit', 'controls'],
    queryFn: () => apiFetch<ControlState>('/api/ivx/vercel-exit/controls'),
  });

  const certificationQuery = useQuery<CertificationData>({
    queryKey: ['vercel-exit', 'certification'],
    queryFn: () => apiFetch<CertificationData>('/api/ivx/vercel-exit/certification'),
  });

  const scanQuery = useQuery<ScanResult>({
    queryKey: ['vercel-exit', 'scan'],
    queryFn: () => apiFetch<ScanResult>('/api/ivx/vercel-exit/scan'),
    refetchInterval: 30000,
  });

  const costsQuery = useQuery<CostData>({
    queryKey: ['vercel-exit', 'costs'],
    queryFn: () => apiFetch<CostData>('/api/ivx/vercel-exit/costs'),
  });

  const controlMutation = useMutation({
    mutationFn: (action: string) => apiPost('/api/ivx/vercel-exit/controls', { action }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vercel-exit'] });
    },
  });

  const onRefresh = useCallback(() => {
    void dashboardQuery.refetch();
    void agentsQuery.refetch();
    void inventoryQuery.refetch();
  }, [dashboardQuery, agentsQuery, inventoryQuery]);

  const refreshing = dashboardQuery.isFetching || agentsQuery.isFetching;

  const renderTab = () => {
    switch (activeTab) {
      case 'summary':
        return dashboardQuery.data ? <ExecutiveSummaryTab data={dashboardQuery.data} /> : <ActivityIndicator color={GOLD} />;
      case 'agents':
        return agentsQuery.data ? <AgentsTab agents={agentsQuery.data.agents} /> : <ActivityIndicator color={GOLD} />;
      case 'inventory':
        return inventoryQuery.data ? <InventoryTab data={inventoryQuery.data} /> : <ActivityIndicator color={GOLD} />;
      case 'architecture':
        return architectureQuery.data ? <ArchitectureTab items={architectureQuery.data.architectureMap} /> : <ActivityIndicator color={GOLD} />;
      case 'api_migration':
        return <SimpleTab title="API Migration" message="API migration will be tracked here. Each Vercel API route will be mapped to its IVX backend replacement with staging and production verification." />;
      case 'ai_gateway':
        return <SimpleTab title="AI Gateway Migration" message="IVX AI Gateway replacement endpoints: POST /api/ivx/ai/chat, POST /api/ivx/ai/stream, GET /api/ivx/ai/models, GET /api/ivx/ai/health, GET /api/ivx/ai/usage. Direct provider authentication — no Vercel proxy." />;
      case 'secrets':
        return <SimpleTab title="Environment & Secrets" message="Secret migration inventory will be displayed here. No secret values are ever shown — only binding status and authentication test results." />;
      case 'infrastructure':
        return <SimpleTab title="Infrastructure" message="Render backend, Redis, workers, queues, health checks, autoscaling (1-3), rollback deployment target. Multi-instance compatibility verified." />;
      case 'dns_traffic':
        return <SimpleTab title="DNS & Traffic Cutover" message="Progressive cutover: 5% -> 25% -> 50% -> 75% -> 100%. Automatic rollback if error rate exceeds 1%, critical auth fails, or p95 exceeds threshold." />;
      case 'tests':
        return <SimpleTab title="Tests" message="AI Gateway tests, auth tests, API route tests, web tests, Android tests, database tests, realtime tests, upload tests, worker/queue tests, failover tests, security tests, regression tests, load tests." />;
      case 'deployments':
        return <SimpleTab title="Deployments" message="Production and staging deployment tracking with commit SHA, deployment ID, health verification, and rollback targets." />;
      case 'incidents':
        return <SimpleTab title="Incidents" message="No active incidents. Incident tracking will display severity, affected service, resolution status, and timestamps." />;
      case 'costs':
        return costsQuery.data ? <CostsTab data={costsQuery.data} /> : <ActivityIndicator color={GOLD} />;
      case 'evidence':
        return <SimpleTab title="Evidence Ledger" message="Every task stores: Task ID, AI agent, role, start/end time, files changed, tests executed, test output, commit SHA, PR, deployment ID, production URL, health result, trace ID, before/after evidence, rollback target, final status. No evidence = NOT VERIFIED." />;
      case 'certification':
        return certificationQuery.data ? <CertificationTab data={certificationQuery.data} /> : <ActivityIndicator color={GOLD} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Banner */}
      <View style={styles.headerBanner}>
        <Text style={styles.headerTitle}>Vercel Exit Command Center</Text>
        <Text style={styles.headerSubtitle}>
          {dashboardQuery.data?.migrationStatus ?? 'Loading...'}
        </Text>
        <View style={styles.headerProgressBar}>
          <View style={[styles.headerProgressFill, { width: `${dashboardQuery.data?.overallCompletionPercentage ?? 0}%` }]} />
        </View>
        <Text style={styles.headerProgressText}>
          {dashboardQuery.data?.overallCompletionPercentage ?? 0}% Complete
        </Text>
      </View>

      {/* Tab Bar — horizontal scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
          >
            <Text style={[styles.tabItemText, activeTab === tab.id && styles.tabItemTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
        }
      >
        {renderTab()}
      </ScrollView>

      {/* Owner Controls FAB */}
      <Pressable
        style={styles.controlsFAB}
        onPress={() => setActiveTab('certification')}
      >
        <Text style={styles.controlsFABText}>Controls</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  headerBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: GOLD,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#AAA',
    marginBottom: 8,
  },
  headerProgressBar: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  headerProgressFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 3,
  },
  headerProgressText: {
    fontSize: 11,
    color: '#888',
    textAlign: 'right' as const,
  },
  tabBar: {
    flexDirection: 'row' as const,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    maxHeight: 44,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
  },
  tabItemText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500' as const,
  },
  tabItemTextActive: {
    color: GOLD,
    fontWeight: '700' as const,
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  // Progress Banner
  progressBanner: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  progressBannerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: GOLD,
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#222',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: GOLD,
    textAlign: 'right' as const,
    marginBottom: 4,
  },
  progressPhase: {
    fontSize: 12,
    color: '#AAA',
  },
  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    backgroundColor: CARD_BG,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderLeftWidth: 3,
  },
  metricLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  metricSublabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  // Status Badge
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  // Section Header
  sectionHeader: {
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  // Card
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  // Row
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
  },
  rowLabel: {
    fontSize: 13,
    color: '#AAA',
  },
  rowValue: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '500' as const,
  },
  // Blockers
  blockerList: {
    marginTop: 8,
  },
  blockerText: {
    fontSize: 12,
    color: RED,
    marginBottom: 4,
  },
  noBlockers: {
    fontSize: 12,
    color: GREEN,
    paddingVertical: 8,
  },
  // Agent Cards
  agentCard: {
    marginBottom: 10,
  },
  agentHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    marginBottom: 8,
  },
  agentNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GOLD + '22',
    borderWidth: 1,
    borderColor: GOLD,
    justifyContent: 'center' as const,
    alignItems: 'center',
    marginRight: 10,
  },
  agentNumberText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: GOLD,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  agentRole: {
    fontSize: 11,
    color: '#888',
  },
  agentProgressRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    marginBottom: 6,
  },
  agentProgressText: {
    fontSize: 11,
    color: GOLD,
    marginLeft: 6,
    fontWeight: '600' as const,
  },
  agentTask: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 6,
  },
  agentMetaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
  },
  agentMeta: {
    fontSize: 10,
    color: '#666',
  },
  blockerBadge: {
    marginTop: 6,
    backgroundColor: RED + '22',
    borderRadius: 6,
    padding: 6,
  },
  blockerBadgeText: {
    fontSize: 11,
    color: RED,
    fontWeight: '600' as const,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center' as const,
    padding: 16,
  },
  modalContent: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: GOLD,
  },
  modalClose: {
    fontSize: 18,
    color: RED,
    fontWeight: '700' as const,
  },
  modalRole: {
    fontSize: 13,
    color: '#AAA',
    marginBottom: 8,
  },
  modalSection: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
    paddingTop: 10,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: GOLD,
    marginBottom: 4,
  },
  modalSectionText: {
    fontSize: 12,
    color: '#CCC',
    lineHeight: 18,
  },
  modalFileText: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  modalEmptyText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic' as const,
  },
  // Inventory
  summaryRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginBottom: 10,
  },
  summaryChip: {
    backgroundColor: CARD_ELEVATED,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  summaryChipText: {
    fontSize: 10,
    color: '#AAA',
  },
  searchInput: {
    backgroundColor: CARD_ELEVATED,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  filterRow: {
    flexDirection: 'row' as const,
    marginBottom: 8,
  },
  filterChip: {
    fontSize: 11,
    color: '#888',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CARD_ELEVATED,
    borderRadius: 6,
    marginRight: 6,
    overflow: 'hidden',
  },
  filterChipActive: {
    color: GOLD,
    fontWeight: '700' as const,
    backgroundColor: GOLD + '22',
  },
  filterResultText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 10,
  },
  inventoryCard: {
    marginBottom: 10,
  },
  inventoryHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inventoryId: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: GOLD,
  },
  inventoryService: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
    marginBottom: 2,
  },
  inventoryType: {
    fontSize: 11,
    color: BLUE,
    marginBottom: 4,
  },
  inventoryFile: {
    fontSize: 11,
    color: '#AAA',
  },
  inventoryLine: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  inventoryPurpose: {
    fontSize: 12,
    color: '#CCC',
    marginBottom: 6,
  },
  inventoryReplaceRow: {
    flexDirection: 'row' as const,
    marginBottom: 6,
  },
  inventoryReplaceLabel: {
    fontSize: 11,
    color: GREEN,
    fontWeight: '700' as const,
  },
  inventoryReplaceValue: {
    fontSize: 11,
    color: '#CCC',
    flex: 1,
    marginLeft: 4,
  },
  inventoryMetaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inventoryRisk: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  inventoryAssigned: {
    fontSize: 11,
    color: BLUE,
  },
  inventoryTest: {
    fontSize: 11,
    color: '#888',
  },
  inventoryRollback: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  // Architecture
  archCard: {
    marginBottom: 12,
  },
  archId: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: GOLD,
    marginBottom: 8,
  },
  archCurrentBox: {
    backgroundColor: RED + '11',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  archBoxLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#888',
    marginBottom: 4,
  },
  archBoxText: {
    fontSize: 11,
    color: '#CCC',
    lineHeight: 16,
  },
  archArrow: {
    fontSize: 14,
    color: GOLD,
    textAlign: 'center' as const,
    marginVertical: 2,
  },
  archTargetBox: {
    backgroundColor: GREEN + '11',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  archMetaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginBottom: 6,
  },
  archMeta: {
    fontSize: 10,
    color: '#888',
    marginRight: 8,
  },
  archAssigned: {
    fontSize: 11,
    color: BLUE,
    marginBottom: 2,
  },
  archAcceptance: {
    fontSize: 10,
    color: '#999',
    marginBottom: 2,
  },
  archRollback: {
    fontSize: 10,
    color: '#666',
  },
  // Phases
  phaseCard: {
    marginBottom: 8,
  },
  phaseHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  phaseNumber: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: GOLD,
  },
  phaseName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
    marginBottom: 2,
  },
  phaseDescription: {
    fontSize: 12,
    color: '#AAA',
  },
  // Controls
  controlsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    marginTop: 16,
  },
  controlButton: {
    width: '48%',
    backgroundColor: CARD_ELEVATED,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  controlButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: GOLD,
  },
  // Certification
  certBanner: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  certStatus: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: GOLD,
    marginBottom: 10,
  },
  certProgress: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 4,
  },
  certApprovalBanner: {
    marginTop: 10,
    backgroundColor: GOLD + '22',
    borderRadius: 8,
    padding: 8,
  },
  certApprovalText: {
    fontSize: 12,
    color: GOLD,
    fontWeight: '600' as const,
  },
  certReadyBanner: {
    marginTop: 10,
    backgroundColor: GREEN + '22',
    borderRadius: 8,
    padding: 8,
  },
  certReadyText: {
    fontSize: 12,
    color: GREEN,
    fontWeight: '600' as const,
  },
  certCard: {
    marginBottom: 8,
  },
  certHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  certId: {
    fontSize: 12,
    color: '#888',
  },
  certMet: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  certDescription: {
    fontSize: 12,
    color: '#CCC',
    marginBottom: 4,
  },
  certEvidence: {
    fontSize: 10,
    color: '#666',
  },
  // Scan
  scanBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  scanStatus: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  scanTimestamp: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  scanFinal: {
    fontSize: 12,
    color: '#AAA',
  },
  scanCard: {
    marginBottom: 8,
  },
  scanHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  scanPattern: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FFF',
    fontFamily: 'monospace' as const,
  },
  scanCounts: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  scanFile: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  scanMore: {
    fontSize: 10,
    color: '#888',
    fontStyle: 'italic' as const,
  },
  // Costs
  costComparisonRow: {
    flexDirection: 'row' as const,
    marginBottom: 16,
  },
  costBeforeBox: {
    flex: 1,
    backgroundColor: RED + '11',
    borderRadius: 10,
    padding: 12,
    marginRight: 6,
  },
  costAfterBox: {
    flex: 1,
    backgroundColor: GREEN + '11',
    borderRadius: 10,
    padding: 12,
    marginLeft: 6,
  },
  costBoxTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#FFF',
    marginBottom: 8,
  },
  costLine: {
    fontSize: 11,
    color: '#AAA',
    marginBottom: 2,
  },
  costTotal: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FFF',
    marginTop: 6,
  },
  savingsBanner: {
    backgroundColor: GOLD + '22',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  savingsText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: GOLD,
    marginBottom: 4,
  },
  savingsAnnual: {
    fontSize: 13,
    color: '#AAA',
  },
  // Simple Tab
  simpleTabText: {
    fontSize: 13,
    color: '#CCC',
    lineHeight: 20,
  },
  // FAB
  controlsFAB: {
    position: 'absolute' as const,
    bottom: 20,
    right: 20,
    backgroundColor: GOLD,
    borderRadius: 25,
    paddingHorizontal: 18,
    paddingVertical: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  controlsFABText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#000',
  },
});
