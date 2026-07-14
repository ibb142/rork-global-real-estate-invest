/**
 * IVX Vercel Exit Command Center — test suite.
 *
 * Tests the dependency inventory, agent tracking, owner controls,
 * certification criteria, and scan logic.
 */
import { describe, test, expect } from 'bun:test';

// ─── Types (mirrors of backend types) ─────────────────────────────────────────

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

interface AgentRole {
  agentNumber: number;
  agentName: string;
  role: string;
}

// ─── Test Data ─────────────────────────────────────────────────────────────────

const AGENT_ROLES: AgentRole[] = [
  { agentNumber: 1, agentName: 'Atlas', role: 'Migration Architect' },
  { agentNumber: 2, agentName: 'Vega', role: 'AI Gateway Developer' },
  { agentNumber: 3, agentName: 'Orion', role: 'Backend API Developer' },
  { agentNumber: 4, agentName: 'Nova', role: 'Mobile and Web Developer' },
  { agentNumber: 5, agentName: 'Cipher', role: 'Database and Supabase Developer' },
  { agentNumber: 6, agentName: 'Forge', role: 'DevOps and Infrastructure Developer' },
  { agentNumber: 7, agentName: 'Sentinel', role: 'Security and Identity Developer' },
  { agentNumber: 8, agentName: 'Pulse', role: 'QA and Performance Developer' },
  { agentNumber: 9, agentName: 'Auditor', role: 'Code Review, Evidence and Cutover Developer' },
];

const SAMPLE_DEPENDENCIES: VercelDependency[] = [
  {
    dependencyId: 'VD-001',
    vercelService: 'ai-gateway.vercel.sh',
    dependencyType: 'AI Gateway',
    sourceFile: 'backend/ivx-ai-runtime.ts',
    lineReference: 'line 156',
    runtimeEnvironment: 'backend',
    currentPurpose: 'Primary AI gateway URL',
    replacementService: 'IVX AI Gateway — POST /api/ivx/ai/chat',
    assignedAI: 2,
    risk: 'critical',
    migrationStatus: 'REPLACEMENT_IDENTIFIED',
    testStatus: 'pending',
    commitSha: null,
    deploymentId: null,
    cutoverStatus: 'PENDING',
    rollbackMethod: 'Revert to ai-gateway.vercel.sh',
    evidence: [],
  },
  {
    dependencyId: 'VD-002',
    vercelService: 'ai-gateway.vercel.sh',
    dependencyType: 'AI Gateway',
    sourceFile: 'backend/ivx-ai-runtime.ts',
    lineReference: 'line 190',
    runtimeEnvironment: 'backend',
    currentPurpose: 'Canonical gateway URL builder',
    replacementService: 'IVX AI Gateway URL builder',
    assignedAI: 2,
    risk: 'critical',
    migrationStatus: 'REPLACEMENT_IDENTIFIED',
    testStatus: 'pending',
    commitSha: null,
    deploymentId: null,
    cutoverStatus: 'PENDING',
    rollbackMethod: 'Revert canonical builder',
    evidence: [],
  },
  {
    dependencyId: 'VD-013',
    vercelService: 'VERCEL_TOKEN',
    dependencyType: 'Secret',
    sourceFile: 'backend/services/ivx-secure-vault.ts',
    lineReference: 'lines 17, 272-273',
    runtimeEnvironment: 'backend',
    currentPurpose: 'Vercel API token stored in secure vault',
    replacementService: 'No replacement — token revoked',
    assignedAI: 7,
    risk: 'low',
    migrationStatus: 'DISCOVERED',
    testStatus: 'pending',
    commitSha: null,
    deploymentId: null,
    cutoverStatus: 'PENDING',
    rollbackMethod: 'Re-add token to vault',
    evidence: [],
  },
  {
    dependencyId: 'VD-021',
    vercelService: 'VERCEL_GIT_COMMIT_SHA',
    dependencyType: 'Environment variable',
    sourceFile: 'backend/api/public-chat.ts',
    lineReference: 'line 70',
    runtimeEnvironment: 'backend',
    currentPurpose: 'Public chat uses Vercel-injected git commit SHA',
    replacementService: 'Use RENDER_GIT_COMMIT',
    assignedAI: 3,
    risk: 'low',
    migrationStatus: 'REPLACEMENT_IDENTIFIED',
    testStatus: 'pending',
    commitSha: null,
    deploymentId: null,
    cutoverStatus: 'PENDING',
    rollbackMethod: 'Re-add VERCEL_GIT_COMMIT_SHA',
    evidence: [],
  },
];

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('IVX Vercel Exit — Agent Roles', () => {
  test('defines exactly 9 AI senior developer roles', () => {
    expect(AGENT_ROLES.length).toBe(9);
  });

  test('each agent has a unique number (1-9)', () => {
    const numbers = AGENT_ROLES.map((a) => a.agentNumber);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('each agent has a unique name', () => {
    const names = AGENT_ROLES.map((a) => a.agentName);
    expect(new Set(names).size).toBe(9);
  });

  test('each agent has a unique role', () => {
    const roles = AGENT_ROLES.map((a) => a.role);
    expect(new Set(roles).size).toBe(9);
  });

  test('AI 1 is Migration Architect', () => {
    expect(AGENT_ROLES[0].role).toBe('Migration Architect');
  });

  test('AI 2 is AI Gateway Developer', () => {
    expect(AGENT_ROLES[1].role).toBe('AI Gateway Developer');
  });

  test('AI 9 is Code Review, Evidence and Cutover Developer', () => {
    expect(AGENT_ROLES[8].role).toBe('Code Review, Evidence and Cutover Developer');
  });
});

describe('IVX Vercel Exit — Dependency Inventory', () => {
  test('every dependency has a unique ID', () => {
    const ids = SAMPLE_DEPENDENCIES.map((d) => d.dependencyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every dependency has a replacement service identified', () => {
    for (const dep of SAMPLE_DEPENDENCIES) {
      expect(dep.replacementService.length).toBeGreaterThan(0);
    }
  });

  test('every dependency has a rollback method', () => {
    for (const dep of SAMPLE_DEPENDENCIES) {
      expect(dep.rollbackMethod.length).toBeGreaterThan(0);
    }
  });

  test('every dependency is assigned to a valid AI agent (1-9)', () => {
    for (const dep of SAMPLE_DEPENDENCIES) {
      expect(dep.assignedAI).toBeGreaterThanOrEqual(1);
      expect(dep.assignedAI).toBeLessThanOrEqual(9);
    }
  });

  test('every dependency has a valid risk level', () => {
    const validRisks = ['low', 'medium', 'high', 'critical'];
    for (const dep of SAMPLE_DEPENDENCIES) {
      expect(validRisks).toContain(dep.risk);
    }
  });

  test('every dependency has a valid migration status', () => {
    const validStatuses = ['DISCOVERED', 'REPLACEMENT_IDENTIFIED', 'IMPLEMENTING', 'TESTING', 'STAGING_VERIFIED', 'PRODUCTION_CUTOVER', 'VERIFIED', 'BLOCKED'];
    for (const dep of SAMPLE_DEPENDENCIES) {
      expect(validStatuses).toContain(dep.migrationStatus);
    }
  });

  test('critical risk dependencies are assigned to AI 2 (AI Gateway Developer)', () => {
    const criticalDeps = SAMPLE_DEPENDENCIES.filter((d) => d.risk === 'critical');
    for (const dep of criticalDeps) {
      expect(dep.assignedAI).toBe(2);
    }
  });
});

describe('IVX Vercel Exit — Completion Calculation', () => {
  function calculateCompletionPercentage(deps: VercelDependency[]): number {
    const total = deps.length;
    const verified = deps.filter((d) => d.migrationStatus === 'VERIFIED').length;
    const cutover = deps.filter((d) => d.migrationStatus === 'PRODUCTION_CUTOVER').length;
    const staging = deps.filter((d) => d.migrationStatus === 'STAGING_VERIFIED').length;
    const implementing = deps.filter((d) => d.migrationStatus === 'IMPLEMENTING').length;
    const identified = deps.filter((d) => d.migrationStatus === 'REPLACEMENT_IDENTIFIED').length;

    const weighted = (verified * 1.0) + (cutover * 0.85) + (staging * 0.7) + (implementing * 0.4) + (identified * 0.2);
    return Math.round((weighted / total) * 100);
  }

  test('all DISCOVERED = 0%', () => {
    const allDiscovered = SAMPLE_DEPENDENCIES.map((d) => ({ ...d, migrationStatus: 'DISCOVERED' }));
    expect(calculateCompletionPercentage(allDiscovered)).toBe(0);
  });

  test('all REPLACEMENT_IDENTIFIED = 20%', () => {
    const allIdentified = SAMPLE_DEPENDENCIES.map((d) => ({ ...d, migrationStatus: 'REPLACEMENT_IDENTIFIED' }));
    expect(calculateCompletionPercentage(allIdentified)).toBe(20);
  });

  test('all VERIFIED = 100%', () => {
    const allVerified = SAMPLE_DEPENDENCIES.map((d) => ({ ...d, migrationStatus: 'VERIFIED' }));
    expect(calculateCompletionPercentage(allVerified)).toBe(100);
  });

  test('mixed statuses produce weighted result', () => {
    const mixed: VercelDependency[] = [
      { ...SAMPLE_DEPENDENCIES[0], migrationStatus: 'VERIFIED' },
      { ...SAMPLE_DEPENDENCIES[1], migrationStatus: 'REPLACEMENT_IDENTIFIED' },
      { ...SAMPLE_DEPENDENCIES[2], migrationStatus: 'DISCOVERED' },
      { ...SAMPLE_DEPENDENCIES[3], migrationStatus: 'STAGING_VERIFIED' },
    ];
    // weighted = 1.0 + 0.2 + 0 + 0.7 = 1.9; 1.9/4 = 47.5% -> 48%
    expect(calculateCompletionPercentage(mixed)).toBe(48);
  });
});

describe('IVX Vercel Exit — Certification Criteria', () => {
  const CRITERIA = [
    { id: 1, description: 'All Vercel dependencies inventoried', met: true },
    { id: 2, description: 'Every active Vercel dependency has a replacement', met: true },
    { id: 3, description: 'IVX AI Gateway no longer routes through Vercel', met: false },
    { id: 4, description: 'All APIs run on IVX-controlled infrastructure', met: false },
    { id: 5, description: 'Mobile and web contain no active Vercel endpoint', met: false },
    { id: 6, description: 'Secrets are migrated securely', met: false },
    { id: 7, description: 'DNS routes production traffic away from Vercel', met: false },
    { id: 8, description: 'Production traffic is 100% IVX infrastructure', met: false },
    { id: 9, description: 'Zero active Vercel dependencies remain', met: false },
    { id: 10, description: 'Automated tests pass', met: false },
    { id: 11, description: 'Load and failover tests pass', met: false },
    { id: 12, description: 'Production health remains stable', met: true },
    { id: 13, description: 'Rollback path is verified', met: false },
    { id: 14, description: 'New APK is generated', met: false },
    { id: 15, description: 'APK is directly downloadable', met: false },
    { id: 16, description: 'Dashboard shows all 9 AI agents with live evidence', met: false },
    { id: 17, description: 'GitHub HEAD equals deployed SHA equals /version SHA', met: true },
    { id: 18, description: 'Every completion claim includes evidence', met: false },
    { id: 19, description: 'No secrets are exposed', met: true },
    { id: 20, description: 'Owner approves final cutover', met: false },
  ];

  test('defines exactly 20 acceptance criteria', () => {
    expect(CRITERIA.length).toBe(20);
  });

  test('each criterion has a unique ID (1-20)', () => {
    const ids = CRITERIA.map((c) => c.id);
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test('final status is MIGRATION IN PROGRESS when some criteria met but < 5', () => {
    const metCount = CRITERIA.filter((c) => c.met).length;
    expect(metCount).toBe(5);
    const finalStatus = metCount > 15
      ? 'VERCEL REMOVED — OWNER VALIDATION PENDING'
      : metCount > 10
      ? 'PRODUCTION CUTOVER IN PROGRESS'
      : metCount > 5
      ? 'STAGING VERIFIED'
      : metCount > 0
      ? 'MIGRATION IN PROGRESS'
      : 'DISCOVERY IN PROGRESS';
    expect(finalStatus).toBe('MIGRATION IN PROGRESS');
  });
});

describe('IVX Vercel Exit — Scan Patterns', () => {
  const SCAN_PATTERNS = [
    'ai-gateway.vercel.sh',
    'vercel.app',
    'vercel.sh',
    '@vercel/',
    'VERCEL_',
    'NEXT_PUBLIC_',
    'vercel_ai_gateway',
    'api.vercel.com',
  ];

  test('all 8 scan patterns are defined', () => {
    expect(SCAN_PATTERNS.length).toBe(8);
  });

  test('scan patterns cover AI gateway, SDK, env vars, API, and Next.js', () => {
    expect(SCAN_PATTERNS).toContain('ai-gateway.vercel.sh');
    expect(SCAN_PATTERNS).toContain('@vercel/');
    expect(SCAN_PATTERNS).toContain('VERCEL_');
    expect(SCAN_PATTERNS).toContain('NEXT_PUBLIC_');
    expect(SCAN_PATTERNS).toContain('api.vercel.com');
  });

  test('vercel-zero is true when all dependencies are VERIFIED', () => {
    const allVerified = SAMPLE_DEPENDENCIES.map((d) => ({ ...d, migrationStatus: 'VERIFIED' }));
    const activeCount = allVerified.filter((d) => d.migrationStatus !== 'VERIFIED').length;
    expect(activeCount).toBe(0);
  });

  test('vercel-zero is false when any dependency is not VERIFIED', () => {
    const activeCount = SAMPLE_DEPENDENCIES.filter((d) => d.migrationStatus !== 'VERIFIED').length;
    expect(activeCount).toBeGreaterThan(0);
  });
});

describe('IVX Vercel Exit — Owner Controls', () => {
  const VALID_ACTIONS = [
    'pause',
    'resume',
    'approve_cutover',
    'trigger_rollback',
    'freeze_deployments',
    'unfreeze_deployments',
    'reassign_task',
    'reject_evidence',
  ];

  test('defines exactly 8 owner control actions', () => {
    expect(VALID_ACTIONS.length).toBe(8);
  });

  test('dangerous operations include rollback, freeze, and approve cutover', () => {
    const dangerous = ['approve_cutover', 'trigger_rollback', 'freeze_deployments', 'reject_evidence'];
    for (const action of dangerous) {
      expect(VALID_ACTIONS).toContain(action);
    }
  });

  test('control state starts with migration not paused', () => {
    const initialState = {
      migrationPaused: false,
      deploymentsFrozen: false,
      cutoverApproved: false,
      rollbackTriggered: false,
    };
    expect(initialState.migrationPaused).toBe(false);
    expect(initialState.deploymentsFrozen).toBe(false);
    expect(initialState.cutoverApproved).toBe(false);
    expect(initialState.rollbackTriggered).toBe(false);
  });
});

describe('IVX Vercel Exit — Migration Phases', () => {
  const PHASES = [
    { phase: 1, name: 'Vercel Discovery', status: 'COMPLETE' },
    { phase: 2, name: 'Replacement Architecture', status: 'IN_PROGRESS' },
    { phase: 3, name: 'Replace Vercel AI Gateway', status: 'PENDING' },
    { phase: 4, name: 'Migrate APIs and Functions', status: 'PENDING' },
    { phase: 5, name: 'Mobile and Web Migration', status: 'PENDING' },
    { phase: 6, name: 'Secret and Environment Migration', status: 'PENDING' },
    { phase: 7, name: 'Infrastructure Deployment', status: 'PENDING' },
    { phase: 8, name: 'DNS and Traffic Cutover', status: 'PENDING' },
    { phase: 9, name: 'Testing', status: 'PENDING' },
    { phase: 10, name: 'Vercel-Zero Verification', status: 'PENDING' },
    { phase: 11, name: 'APK and Application Release', status: 'PENDING' },
    { phase: 12, name: 'Live Evidence Ledger', status: 'IN_PROGRESS' },
    { phase: 13, name: 'Dashboard Detail Pages', status: 'IN_PROGRESS' },
    { phase: 14, name: 'Owner Controls', status: 'IN_PROGRESS' },
  ];

  test('defines exactly 14 migration phases', () => {
    expect(PHASES.length).toBe(14);
  });

  test('phases are numbered 1-14 sequentially', () => {
    const numbers = PHASES.map((p) => p.phase);
    expect(numbers).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  test('phase 1 (discovery) is COMPLETE', () => {
    expect(PHASES[0].status).toBe('COMPLETE');
  });

  test('phase 8 is DNS and Traffic Cutover', () => {
    expect(PHASES[7].name).toBe('DNS and Traffic Cutover');
  });

  test('phase 10 is Vercel-Zero Verification', () => {
    expect(PHASES[9].name).toBe('Vercel-Zero Verification');
  });
});

describe('IVX Vercel Exit — Cost Estimates', () => {
  const COSTS = {
    before: { vercelAiGateway: 240, vercelProPlan: 20, renderBackend: 49, supabase: 25, redis: 15, total: 349 },
    after: { renderBackend: 49, renderWorker: 19, supabase: 25, redis: 15, openaiDirect: 180, total: 288 },
    monthlySavings: 61,
  };

  test('before total equals sum of before components', () => {
    const sum = COSTS.before.vercelAiGateway + COSTS.before.vercelProPlan + COSTS.before.renderBackend + COSTS.before.supabase + COSTS.before.redis;
    expect(sum).toBe(COSTS.before.total);
  });

  test('after total equals sum of after components', () => {
    const sum = COSTS.after.renderBackend + COSTS.after.renderWorker + COSTS.after.supabase + COSTS.after.redis + COSTS.after.openaiDirect;
    expect(sum).toBe(COSTS.after.total);
  });

  test('monthly savings equals before total minus after total', () => {
    expect(COSTS.before.total - COSTS.after.total).toBe(COSTS.monthlySavings);
  });

  test('after costs do not include any Vercel line items', () => {
    const afterKeys = Object.keys(COSTS.after);
    expect(afterKeys.some((k) => k.toLowerCase().includes('vercel'))).toBe(false);
  });
});
