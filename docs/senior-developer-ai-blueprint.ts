
export type SeniorDeveloperAICapability =
  | 'repo_comprehension'
  | 'cross_layer_tracing'
  | 'root_cause_analysis'
  | 'request_lifecycle_reasoning'
  | 'state_and_side_effect_reasoning'
  | 'deployment_awareness'
  | 'architecture_reasoning'
  | 'tradeoff_explanation'
  | 'code_generation'
  | 'code_review'
  | 'test_generation'
  | 'migration_planning'
  | 'incident_response'
  | 'performance_diagnosis'
  | 'security_audit';

export type AILayerId =
  | 'repo_understanding'
  | 'memory_context'
  | 'tool_execution'
  | 'debugging_log_analysis'
  | 'architecture_reasoning'
  | 'deployment_devops'
  | 'project_knowledge';

export type DomainId =
  | 'ui_mobile_web'
  | 'api_backend'
  | 'auth_security'
  | 'database_storage'
  | 'realtime_subscriptions'
  | 'file_document_handling'
  | 'infra_deployment'
  | 'observability_logging'
  | 'ci_cd'
  | 'testing_qa'
  | 'architecture_scaling'
  | 'product_feature_lifecycle'
  | 'ai_ml_integration'
  | 'traffic_analytics';

export type ToolId =
  | 'read_file'
  | 'search_repo'
  | 'edit_file'
  | 'run_validation'
  | 'inspect_logs'
  | 'inspect_runtime_state'
  | 'inspect_network'
  | 'analyze_db_schema'
  | 'inspect_deploy_config'
  | 'summarize_architecture'
  | 'compare_changes'
  | 'trace_request_path'
  | 'run_tests'
  | 'query_supabase'
  | 'inspect_realtime_channels'
  | 'audit_env_config'
  | 'measure_bundle_size'
  | 'profile_render_perf';

export type MemoryScopeId =
  | 'session'
  | 'project'
  | 'architecture_decisions'
  | 'bug_history'
  | 'deployment_history'
  | 'user_preferences'
  | 'agent_specific';

export type ReasoningStepId =
  | 'identify_layer'
  | 'trace_flow'
  | 'find_root_cause'
  | 'propose_fix'
  | 'validate_regressions'
  | 'explain_impact'
  | 'distinguish_hypothesis_vs_evidence';

export type AgentRoleId =
  | 'senior_developer'
  | 'frontend_specialist'
  | 'backend_specialist'
  | 'devops_engineer'
  | 'qa_engineer'
  | 'security_auditor'
  | 'product_analyst'
  | 'incident_commander'
  | 'orchestrator';

export type ImplementationPhase = 1 | 2 | 3 | 4 | 5;

export interface AILayer {
  id: AILayerId;
  name: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  ivxImplementation: string;
}

export interface Tool {
  id: ToolId;
  name: string;
  description: string;
  inputSchema: string;
  outputSchema: string;
  ivxContext: string;
  phase: ImplementationPhase;
}

export interface MemoryScope {
  id: MemoryScopeId;
  name: string;
  persistence: 'ephemeral' | 'session' | 'persistent';
  storage: string;
  maxEntries: number | null;
  ttl: string | null;
  ivxUsage: string;
}

export interface Domain {
  id: DomainId;
  name: string;
  ivxFiles: string[];
  keyAbstractions: string[];
  failureModes: string[];
  crossCuts: DomainId[];
}

export interface AgentRole {
  id: AgentRoleId;
  name: string;
  responsibilities: string[];
  tools: ToolId[];
  memoryScopes: MemoryScopeId[];
  splitPhase: ImplementationPhase | null;
}

export interface RoadmapItem {
  phase: ImplementationPhase;
  title: string;
  deliverables: string[];
  dependencies: ImplementationPhase[];
  estimatedWeeks: number;
}

export interface RepoReadinessRecommendation {
  area: string;
  currentState: string;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  files: string[];
}

export const AI_LAYERS: AILayer[] = [
  {
    id: 'repo_understanding',
    name: 'Repo Understanding Layer',
    purpose: 'Build and maintain a live mental model of the entire codebase: module boundaries, dependency graph, data flow, naming conventions, and architectural patterns.',
    inputs: [
      'file tree',
      'import graph',
      'package.json dependencies',
      'tsconfig paths',
      'expo router file conventions',
      'supabase schema',
      'backend route definitions',
    ],
    outputs: [
      'module dependency map',
      'file-to-domain mapping',
      'import chain for any symbol',
      'dead code candidates',
      'naming inconsistency flags',
    ],
    ivxImplementation: 'Parse expo/app/ for route structure, expo/src/modules/ for domain modules, expo/lib/ for shared services, backend/ for API layer, expo/shared/ for cross-boundary types, expo/constants/ for config, expo/mocks/ for test data. Build adjacency list from import statements. Map each file to its domain (chat, control-tower, admin, auth, investment, etc).',
  },
  {
    id: 'memory_context',
    name: 'Memory & Context Layer',
    purpose: 'Retain and recall facts across time: architecture decisions, past bugs, deployment events, user preferences, and ongoing investigations.',
    inputs: [
      'conversation history',
      'resolved bug reports',
      'deployment logs',
      'architecture decision records',
      'user-stated preferences',
    ],
    outputs: [
      'relevant past context for current query',
      'pattern matches to known bugs',
      'decision rationale lookups',
      'preference-aware suggestions',
    ],
    ivxImplementation: 'Store architecture decisions in docs/decisions/. Store bug history in docs/bugs/. Use Supabase table ivx_ai_memory for persistent AI context. Session memory lives in React Query cache + local state during active sessions. Project memory persisted to AsyncStorage for cross-session recall.',
  },
  {
    id: 'tool_execution',
    name: 'Tool Execution Layer',
    purpose: 'Execute discrete developer actions: read, search, edit, validate, deploy, test. Each tool has defined input/output contracts and safety classifications.',
    inputs: [
      'tool invocation request',
      'parameters',
      'safety classification',
    ],
    outputs: [
      'tool execution result',
      'side effects log',
      'validation status',
    ],
    ivxImplementation: 'Tools map directly to the IVX codebase operations. File tools operate on expo/ and backend/. Validation tools run tsc --noEmit and eslint. DB tools query Supabase directly. Deploy tools interact with the Hono backend and S3/CloudFront config.',
  },
  {
    id: 'debugging_log_analysis',
    name: 'Debugging & Log Analysis Layer',
    purpose: 'Analyze runtime logs, error traces, network requests, and state snapshots to identify failures and their propagation paths.',
    inputs: [
      'console.log output',
      'error stack traces',
      'network request/response pairs',
      'React Query cache state',
      'Supabase realtime channel state',
      'IVX proof records',
    ],
    outputs: [
      'classified error with root cause hypothesis',
      'request trace with failure point identified',
      'state corruption diagnosis',
      'realtime subscription health assessment',
    ],
    ivxImplementation: 'IVX already produces extensive console logs tagged with [IVXAIRequestService], [IVXChatService], [Realtime], etc. Parse these for failure classification. Use IVXOwnerAIRequestDiagnostics for structured error data. Use IVXRoomRuntimeSnapshot for room health. Use control-tower aggregator for system-wide health.',
  },
  {
    id: 'architecture_reasoning',
    name: 'Architecture Reasoning Layer',
    purpose: 'Evaluate architectural decisions, identify scaling bottlenecks, propose migrations, and reason about system-level tradeoffs.',
    inputs: [
      'current architecture map',
      'performance metrics',
      'scaling requirements',
      'team constraints',
      'technology options',
    ],
    outputs: [
      'architecture evaluation with tradeoffs',
      'migration plan with risk assessment',
      'scaling recommendation with proof',
      'tech debt prioritization',
    ],
    ivxImplementation: 'IVX has a layered architecture: Expo frontend -> Expo API routes -> Hono backend -> Supabase. The AI must understand this request lifecycle end-to-end. Key architectural decisions: toolkit fallback for dev mode, multi-endpoint candidate routing, realtime subscription management, proof-backed state claims.',
  },
  {
    id: 'deployment_devops',
    name: 'Deployment & DevOps Awareness Layer',
    purpose: 'Understand environment configuration, deployment pipelines, infrastructure topology, and operational state.',
    inputs: [
      'environment variables',
      'deployment markers',
      'infrastructure config (S3, CloudFront, Route53)',
      'Supabase project config',
      'app.config.ts',
    ],
    outputs: [
      'environment health assessment',
      'deployment readiness check',
      'config drift detection',
      'infrastructure audit',
    ],
    ivxImplementation: 'IVX uses: Supabase (DB + auth + realtime + storage), AWS (S3 + CloudFront + Route53), Hono server, Expo API routes. Deployment markers tracked in DEPLOYMENT_MARKER constants. Environment detection via env-config.ts and env-validation.ts. The AI must know which env vars control which subsystems.',
  },
  {
    id: 'project_knowledge',
    name: 'Project Knowledge Layer',
    purpose: 'Maintain a structured understanding of business domain, product flows, user journeys, and feature specifications.',
    inputs: [
      'PLAN.md',
      'feature specifications',
      'user flow definitions',
      'business rules',
      'regulatory requirements',
    ],
    outputs: [
      'feature context for any code change',
      'business rule validation',
      'user impact assessment',
      'regulatory compliance check',
    ],
    ivxImplementation: 'IVX is a real estate investment platform with: property investment flows, share trading, JV agreements, portfolio management, AI-powered owner operations, lender directory, landing/waitlist acquisition, KYC verification, tax documents, and a Nerve Center operating brain. PLAN.md defines the Nerve Center architecture. The AI must understand the investment lifecycle: discover -> KYC -> invest -> trade -> distribute -> report.',
  },
];

export const TOOLS: Tool[] = [
  {
    id: 'read_file',
    name: 'Read File',
    description: 'Read any file in the repo with line numbers and optional range.',
    inputSchema: '{ filePath: string, offset?: number, limit?: number }',
    outputSchema: '{ content: string, lineCount: number }',
    ivxContext: 'Primary tool for understanding any IVX module. Start with the barrel export (index.ts) then drill into specific files.',
    phase: 1,
  },
  {
    id: 'search_repo',
    name: 'Search Repository',
    description: 'Regex search across all files with optional file pattern filter.',
    inputSchema: '{ pattern: string, include?: string, path?: string }',
    outputSchema: '{ matches: Array<{ file: string, line: number, text: string }> }',
    ivxContext: 'Use to find all usages of a type, function, or pattern. Critical for tracing IVX send paths, realtime subscriptions, and proof record creation.',
    phase: 1,
  },
  {
    id: 'edit_file',
    name: 'Edit File',
    description: 'Make targeted find-and-replace edits to a file.',
    inputSchema: '{ filePath: string, edits: Array<{ oldString: string, newString: string }> }',
    outputSchema: '{ success: boolean, linesChanged: number }',
    ivxContext: 'Use for surgical fixes. Always read the file first. Prefer multi-edit for multiple changes to the same file.',
    phase: 1,
  },
  {
    id: 'run_validation',
    name: 'Run Validation',
    description: 'Run TypeScript type checking and ESLint on the project.',
    inputSchema: '{ filePaths?: string[] }',
    outputSchema: '{ tsErrors: Error[], eslintErrors: Error[] }',
    ivxContext: 'Run after every code change. IVX uses strict TypeScript. Common issues: missing type annotations on useState, unsafe .trim() on unknown values, missing null checks on Supabase responses.',
    phase: 1,
  },
  {
    id: 'inspect_logs',
    name: 'Inspect Runtime Logs',
    description: 'Read and analyze console output from the running app.',
    inputSchema: '{ filter?: string, tail?: number }',
    outputSchema: '{ logs: Array<{ timestamp: string, tag: string, message: string, level: string }> }',
    ivxContext: 'IVX logs are tagged: [IVXAIRequestService], [IVXChatService], [Realtime], [ControlTower], [AuthContext], etc. Filter by tag to isolate subsystem behavior.',
    phase: 2,
  },
  {
    id: 'inspect_runtime_state',
    name: 'Inspect Runtime State',
    description: 'Query the current in-memory state of React Query cache, context providers, and module singletons.',
    inputSchema: '{ queryKey?: string[], provider?: string, singleton?: string }',
    outputSchema: '{ state: unknown, cacheAge: number, stale: boolean }',
    ivxContext: 'Critical for debugging IVX. Check: React Query cache for messages/room status, auth context for session state, realtime subscription audit for channel count, room runtime snapshot for health.',
    phase: 2,
  },
  {
    id: 'inspect_network',
    name: 'Inspect Network Requests',
    description: 'Capture and analyze HTTP requests and responses from the app.',
    inputSchema: '{ urlFilter?: string, method?: string, statusFilter?: number }',
    outputSchema: '{ requests: Array<{ url: string, method: string, status: number, duration: number, body: unknown }> }',
    ivxContext: 'Trace the IVX owner AI request lifecycle: app -> fetchOwnerAIEndpointWithFallback -> candidate endpoints -> response parsing -> normalizeOwnerAIResponse. Key endpoints: /api/ivx/owner-ai, /api/assistant, /api/owner-bootstrap.',
    phase: 2,
  },
  {
    id: 'analyze_db_schema',
    name: 'Analyze Database Schema',
    description: 'Query Supabase for table definitions, RLS policies, indexes, and row counts.',
    inputSchema: '{ tables?: string[], includeRls?: boolean, includeIndexes?: boolean }',
    outputSchema: '{ tables: Array<{ name: string, columns: Column[], rls: Policy[], indexes: Index[], rowCount: number }> }',
    ivxContext: 'IVX tables: ivx_conversations, ivx_messages, ivx_inbox_state, ivx_ai_requests, ivx_knowledge_documents. Also generic chat tables: chat_rooms, chat_messages. Schema resolution handled by ivxTableResolver.ts.',
    phase: 3,
  },
  {
    id: 'inspect_deploy_config',
    name: 'Inspect Deployment Config',
    description: 'Read and validate environment variables, deployment markers, and infrastructure state.',
    inputSchema: '{ checkEnvVars?: boolean, checkDeployMarker?: boolean, checkInfra?: boolean }',
    outputSchema: '{ envVars: Record<string, string>, deployMarker: string, infraHealth: Record<string, string> }',
    ivxContext: 'IVX deployment marker: DEPLOYMENT_MARKER in hono.ts and owner-ai+api.ts. Key env vars: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, AWS_*, S3_BUCKET_NAME, CLOUDFRONT_DISTRIBUTION_ID.',
    phase: 3,
  },
  {
    id: 'summarize_architecture',
    name: 'Summarize Architecture',
    description: 'Generate a structured summary of the system architecture from the current codebase.',
    inputSchema: '{ scope?: string, depth?: "overview" | "detailed" | "exhaustive" }',
    outputSchema: '{ summary: ArchitectureSummary }',
    ivxContext: 'Generate from: route structure (expo/app/), module structure (expo/src/modules/), service layer (expo/lib/), backend (backend/), shared types (expo/shared/), constants (expo/constants/). Include data flow diagrams for key paths.',
    phase: 2,
  },
  {
    id: 'compare_changes',
    name: 'Compare Changed Files',
    description: 'Diff the current state of files against a baseline to identify what changed.',
    inputSchema: '{ files: string[], baseline?: "last_commit" | "last_session" }',
    outputSchema: '{ diffs: Array<{ file: string, additions: number, deletions: number, hunks: Hunk[] }> }',
    ivxContext: 'Use to verify that a fix only touches intended files. Critical after multi-file refactors like the send normalization unification.',
    phase: 2,
  },
  {
    id: 'trace_request_path',
    name: 'Trace Request Path End-to-End',
    description: 'Follow a user action from UI event through state management, API call, backend handler, database operation, realtime event, and back to UI render.',
    inputSchema: '{ action: string, startFile: string }',
    outputSchema: '{ trace: Array<{ layer: string, file: string, function: string, description: string }> }',
    ivxContext: 'Example: trace "send message" from chat.tsx handleSendMessage -> normalizeSendInput -> ivxChatService.sendOwnerMessage -> Supabase insert -> realtime event -> message list update. This is the most valuable debugging tool for IVX.',
    phase: 1,
  },
  {
    id: 'query_supabase',
    name: 'Query Supabase',
    description: 'Execute read-only queries against the Supabase database.',
    inputSchema: '{ table: string, select?: string, filter?: Record<string, unknown>, limit?: number }',
    outputSchema: '{ rows: unknown[], count: number }',
    ivxContext: 'Query ivx_messages to verify message persistence. Query ivx_conversations for room state. Query ivx_ai_requests for request history. Never mutate from this tool.',
    phase: 3,
  },
  {
    id: 'inspect_realtime_channels',
    name: 'Inspect Realtime Channels',
    description: 'List active Supabase realtime subscriptions, their state, and event counts.',
    inputSchema: '{}',
    outputSchema: '{ channels: Array<{ name: string, state: string, eventCount: number, lastEventAt: string }> }',
    ivxContext: 'IVX tracks realtime subscriptions via activeOwnerRealtimeSubscriptions Set and getOwnerRealtimeSubscriptionAudit(). Critical for diagnosing duplicate messages, missed events, and subscription leaks.',
    phase: 2,
  },
  {
    id: 'audit_env_config',
    name: 'Audit Environment Config',
    description: 'Validate that all required environment variables are set and consistent across environments.',
    inputSchema: '{ environment?: "development" | "production" }',
    outputSchema: '{ valid: boolean, missing: string[], inconsistent: string[], warnings: string[] }',
    ivxContext: 'IVX env validation in env-validation.ts. Critical vars: SUPABASE_URL, SUPABASE_ANON_KEY for client, SERVICE_ROLE_KEY for backend, JWT_SECRET for auth, AWS_* for storage.',
    phase: 3,
  },
  {
    id: 'run_tests',
    name: 'Run Tests',
    description: 'Execute test suites and return results.',
    inputSchema: '{ files?: string[], pattern?: string }',
    outputSchema: '{ passed: number, failed: number, skipped: number, failures: TestFailure[] }',
    ivxContext: 'IVX tests in expo/__tests__/: auth-helpers, auth-rate-limiter, chat-runtime-state, ivx-chat, query-keys, room-state-manager. Run with bun test.',
    phase: 1,
  },
  {
    id: 'measure_bundle_size',
    name: 'Measure Bundle Size',
    description: 'Analyze the JavaScript bundle size and identify large dependencies.',
    inputSchema: '{ platform?: "ios" | "android" | "web" }',
    outputSchema: '{ totalSize: number, byModule: Record<string, number>, largestDeps: string[] }',
    ivxContext: 'IVX has a large codebase with many admin screens. Identify candidates for code splitting: admin/, control-tower/, analytics components.',
    phase: 4,
  },
  {
    id: 'profile_render_perf',
    name: 'Profile Render Performance',
    description: 'Identify slow renders, unnecessary re-renders, and memory leaks in React components.',
    inputSchema: '{ screen?: string, duration?: number }',
    outputSchema: '{ renders: Array<{ component: string, count: number, avgMs: number }>, warnings: string[] }',
    ivxContext: 'IVX chat screen (ivx/chat.tsx) is the most render-intensive screen. Monitor: FlatList renders, proof UI updates, realtime event processing, keyboard animations.',
    phase: 4,
  },
];

export const MEMORY_SCOPES: MemoryScope[] = [
  {
    id: 'session',
    name: 'Session Memory',
    persistence: 'ephemeral',
    storage: 'In-memory (React state / conversation context)',
    maxEntries: null,
    ttl: null,
    ivxUsage: 'Current conversation context, active investigation state, files read in this session, errors encountered, fixes attempted.',
  },
  {
    id: 'project',
    name: 'Project Memory',
    persistence: 'persistent',
    storage: 'Supabase table: ivx_ai_project_memory',
    maxEntries: 1000,
    ttl: '90 days',
    ivxUsage: 'Module map, architecture summary, key file purposes, established patterns, coding conventions, known gotchas (e.g. rawText.trim crash pattern).',
  },
  {
    id: 'architecture_decisions',
    name: 'Architecture Decisions',
    persistence: 'persistent',
    storage: 'docs/decisions/ + Supabase table: ivx_ai_decisions',
    maxEntries: 500,
    ttl: null,
    ivxUsage: 'Why toolkit fallback exists. Why multi-endpoint candidate routing. Why proof-backed state claims. Why realtime subscription tracking. Why safe normalization helper pattern.',
  },
  {
    id: 'bug_history',
    name: 'Bug History',
    persistence: 'persistent',
    storage: 'Supabase table: ivx_ai_bug_history',
    maxEntries: 500,
    ttl: '180 days',
    ivxUsage: 'rawText.trim crash: root cause was multiple send entry points bypassing normalization. Response delivery failure: toolkit fallback returning unexpected shape. Realtime subscription leak: missing cleanup on unmount.',
  },
  {
    id: 'deployment_history',
    name: 'Deployment History',
    persistence: 'persistent',
    storage: 'Supabase table: ivx_ai_deploy_history',
    maxEntries: 200,
    ttl: '365 days',
    ivxUsage: 'Track deployment markers, env changes, schema migrations, infrastructure changes. Correlate deployments with incidents.',
  },
  {
    id: 'user_preferences',
    name: 'User/Owner Preferences',
    persistence: 'persistent',
    storage: 'AsyncStorage: ivx_ai_owner_prefs',
    maxEntries: 50,
    ttl: null,
    ivxUsage: 'Preferred debug verbosity, proof detail level, auto-heal approval preferences, response format preferences, priority systems.',
  },
  {
    id: 'agent_specific',
    name: 'Agent-Specific Memory',
    persistence: 'persistent',
    storage: 'Supabase table: ivx_ai_agent_memory',
    maxEntries: 200,
    ttl: '90 days',
    ivxUsage: 'Per-agent learned patterns, calibrated confidence thresholds, tool usage statistics, effectiveness tracking. Only relevant when multi-agent is active.',
  },
];

export const DOMAINS: Domain[] = [
  {
    id: 'ui_mobile_web',
    name: 'UI / Mobile / Web',
    ivxFiles: [
      'expo/app/(tabs)/',
      'expo/app/ivx/',
      'expo/app/admin/',
      'expo/components/',
      'expo/src/modules/chat/components/',
      'expo/src/modules/chat/screens/',
    ],
    keyAbstractions: [
      'Expo Router file-based routing',
      'Tab navigation with nested stacks',
      'SafeAreaView + KeyboardAvoidingView',
      'FlatList for message lists',
      'Pressable with haptic feedback',
      'StyleSheet for all styling',
      'Platform-specific code paths',
    ],
    failureModes: [
      'Keyboard overlapping composer',
      'Safe area inset miscalculation',
      'FlatList not scrolling to bottom',
      'Web compatibility crashes (reanimated, SVG)',
      'Missing Platform checks for native-only APIs',
    ],
    crossCuts: ['realtime_subscriptions', 'auth_security', 'ai_ml_integration'],
  },
  {
    id: 'api_backend',
    name: 'API / Backend',
    ivxFiles: [
      'backend/hono.ts',
      'backend/api/ivx-owner-ai.ts',
      'backend/api/owner-only.ts',
      'backend/api/route53-dns.ts',
      'expo/app/api/ivx/owner-ai+api.ts',
      'expo/app/api/assistant+api.ts',
      'expo/app/api/auth-lookup+api.ts',
      'expo/app/api/owner-bootstrap+api.ts',
    ],
    keyAbstractions: [
      'Hono HTTP framework',
      'Expo API routes (+api.ts convention)',
      'Owner-only auth guard',
      'Multi-endpoint candidate routing',
      'Request/response normalization',
      'Toolkit fallback for dev mode',
    ],
    failureModes: [
      'Endpoint not found (404/405)',
      'Auth token missing or expired',
      'Response schema mismatch',
      'Toolkit fallback returning unexpected shape',
      'CORS misconfiguration',
      'Network timeout',
    ],
    crossCuts: ['auth_security', 'database_storage', 'ai_ml_integration'],
  },
  {
    id: 'auth_security',
    name: 'Auth / Security',
    ivxFiles: [
      'expo/lib/auth-context.tsx',
      'expo/lib/auth-helpers.ts',
      'expo/lib/auth-mfa.ts',
      'expo/lib/auth-password-recovery.ts',
      'expo/lib/auth-password-sign-in.ts',
      'expo/lib/auth-rate-limiter.ts',
      'expo/lib/auth-store.ts',
      'expo/lib/biometric-auth.ts',
      'expo/lib/session-timeout.ts',
      'expo/lib/totp.ts',
      'backend/api/owner-only.ts',
    ],
    keyAbstractions: [
      'Supabase Auth',
      'JWT tokens',
      'Owner-only access control',
      'Rate limiting',
      'MFA / TOTP',
      'Biometric auth',
      'Session timeout',
      'Open access mode for dev',
    ],
    failureModes: [
      'Token expiry without refresh',
      'Owner guard blocking legitimate requests',
      'Rate limiter false positives',
      'MFA flow interruption',
      'Session timeout during long operations',
    ],
    crossCuts: ['api_backend', 'database_storage'],
  },
  {
    id: 'database_storage',
    name: 'Database / Storage',
    ivxFiles: [
      'expo/lib/supabase.ts',
      'expo/lib/supabase-admin.ts',
      'expo/lib/supabase-auto-setup.ts',
      'expo/lib/supabase-sql-executor.ts',
      'expo/lib/supabase-sync.ts',
      'expo/lib/ivx-supabase-client.ts',
      'expo/lib/stored-procedures.ts',
      'expo/lib/db-setup.ts',
      'expo/src/modules/ivx-owner-ai/services/ivxTableResolver.ts',
      'expo/constants/ivx-owner-ai-schema-sql.ts',
      'expo/constants/ivx-owner-admin-module-sql.ts',
      'expo/deploy/aws/s3-config.ts',
    ],
    keyAbstractions: [
      'Supabase PostgreSQL',
      'Row Level Security',
      'Table resolver (IVX vs generic schema)',
      'S3 file storage',
      'CloudFront CDN',
      'AsyncStorage for local persistence',
      'Stored procedures',
    ],
    failureModes: [
      'Table not found (schema not created)',
      'RLS blocking legitimate queries',
      'Schema mismatch between IVX and generic tables',
      'S3 upload failures',
      'AsyncStorage corruption',
      'Migration conflicts',
    ],
    crossCuts: ['auth_security', 'realtime_subscriptions', 'file_document_handling'],
  },
  {
    id: 'realtime_subscriptions',
    name: 'Realtime / Subscriptions',
    ivxFiles: [
      'expo/lib/realtime.ts',
      'expo/lib/realtime-presence.ts',
      'expo/lib/jv-realtime.ts',
      'expo/src/modules/chat/services/ivxChat.ts',
      'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts',
      'expo/src/modules/chat/hooks/useRoomSync.ts',
    ],
    keyAbstractions: [
      'Supabase Realtime channels',
      'postgres_changes subscriptions',
      'Throttled query invalidation',
      'Subscription lifecycle management',
      'App state change handling (background/foreground)',
      'Channel deduplication',
    ],
    failureModes: [
      'Subscription leak (multiple channels for same room)',
      'Recursive unsubscribe/removeChannel loops',
      'Duplicate messages from stacked subscriptions',
      'Missed events after background/resume',
      'Throttle hiding important updates',
    ],
    crossCuts: ['database_storage', 'ui_mobile_web'],
  },
  {
    id: 'file_document_handling',
    name: 'File / Document Handling',
    ivxFiles: [
      'expo/lib/photo-upload.ts',
      'expo/lib/image-storage.ts',
      'expo/lib/image-backup.ts',
      'expo/lib/image-picker-utils.ts',
      'expo/lib/pdf-export.ts',
      'expo/lib/csv-export.ts',
      'expo/src/modules/ivx-owner-ai/services/ivxFileUploadService.ts',
      'expo/src/modules/chat/services/uploadService.ts',
    ],
    keyAbstractions: [
      'Supabase Storage buckets',
      'S3 direct upload',
      'Platform-specific file picking (DocumentPicker)',
      'Image caching and CDN URLs',
      'PDF/CSV export generation',
      'Upload progress tracking',
    ],
    failureModes: [
      'Upload timeout',
      'Bucket not found',
      'File type rejection',
      'CDN invalidation delay',
      'Memory pressure from large files',
    ],
    crossCuts: ['database_storage', 'api_backend'],
  },
  {
    id: 'infra_deployment',
    name: 'Infrastructure / Deployment',
    ivxFiles: [
      'expo/deploy/aws/s3-config.ts',
      'backend/api/route53-dns.ts',
      'expo/lib/auto-deploy.ts',
      'expo/lib/landing-deploy.ts',
      'expo/lib/env-config.ts',
      'expo/lib/env-validation.ts',
      'expo/lib/environment.ts',
      'expo/app.config.ts',
      'server.ts',
    ],
    keyAbstractions: [
      'AWS S3 for static hosting',
      'CloudFront CDN distribution',
      'Route53 DNS management',
      'Environment variable management',
      'Deployment markers for version tracking',
      'Landing page deployment pipeline',
    ],
    failureModes: [
      'Env var misconfiguration',
      'DNS propagation delay',
      'CloudFront cache staleness',
      'S3 permission errors',
      'Deployment marker mismatch',
    ],
    crossCuts: ['api_backend', 'database_storage'],
  },
  {
    id: 'observability_logging',
    name: 'Observability / Logging',
    ivxFiles: [
      'expo/lib/logger.ts',
      'expo/lib/error-tracking.ts',
      'expo/lib/performance-monitor.ts',
      'expo/lib/startup-health.ts',
      'expo/lib/system-health-checker.ts',
      'expo/lib/audit-trail.ts',
      'expo/lib/control-tower/',
      'expo/lib/qc/',
    ],
    keyAbstractions: [
      'Tagged console.log for all subsystems',
      'Error tracking service',
      'Performance monitoring',
      'System health checks',
      'Audit trail for operator actions',
      'Control Tower aggregation',
      'QC diagnostic events and probes',
    ],
    failureModes: [
      'Log noise hiding real errors',
      'Missing error context',
      'Health check false positives',
      'Audit trail gaps',
    ],
    crossCuts: ['ui_mobile_web', 'api_backend', 'realtime_subscriptions'],
  },
  {
    id: 'testing_qa',
    name: 'Testing / QA',
    ivxFiles: [
      'expo/__tests__/',
      'expo/lib/qc/',
      'expo/lib/production-readiness.ts',
      'expo/lib/owner-repair-readiness.ts',
    ],
    keyAbstractions: [
      'Bun test runner',
      'Unit tests for auth, chat, room state',
      'QC diagnostic probes',
      'Production readiness checks',
      'Owner repair readiness',
    ],
    failureModes: [
      'Test coverage gaps (especially integration)',
      'QC probes not running in production',
      'Readiness checks not blocking deployment',
    ],
    crossCuts: ['observability_logging'],
  },
  {
    id: 'architecture_scaling',
    name: 'Architecture / Scaling',
    ivxFiles: [
      'PLAN.md',
      'expo/lib/control-tower/',
      'expo/src/modules/',
      'expo/shared/',
    ],
    keyAbstractions: [
      'Module-based architecture',
      'Shared types across frontend/backend',
      'Control Tower as system brain',
      'Proof-backed state claims',
      'Nerve Center operating architecture',
    ],
    failureModes: [
      'Module boundary violations',
      'Shared type drift between frontend and backend',
      'Control Tower becoming monolithic',
      'Proof freshness not enforced',
    ],
    crossCuts: ['observability_logging', 'infra_deployment'],
  },
  {
    id: 'product_feature_lifecycle',
    name: 'Product / Feature Lifecycle',
    ivxFiles: [
      'expo/app/(tabs)/',
      'expo/app/admin/',
      'expo/mocks/',
      'expo/constants/brand.ts',
    ],
    keyAbstractions: [
      'Investment flows (buy, sell, trade shares)',
      'JV agreements',
      'Portfolio management',
      'Landing page and waitlist',
      'Admin dashboard',
      'Owner controls',
      'Viral growth and referrals',
    ],
    failureModes: [
      'Feature flags not gating incomplete features',
      'Mock data leaking into production',
      'Admin actions affecting live user data',
    ],
    crossCuts: ['ui_mobile_web', 'api_backend', 'auth_security'],
  },
  {
    id: 'ai_ml_integration',
    name: 'AI / ML Integration',
    ivxFiles: [
      'expo/src/modules/ivx-owner-ai/',
      'expo/lib/ai-service.ts',
      'expo/lib/ai-investor-service.ts',
      'expo/lib/ai-ops.ts',
      'expo/lib/ai-ops-alerts.ts',
      'expo/src/modules/chat/services/aiReplyService.ts',
    ],
    keyAbstractions: [
      'Rork Toolkit SDK for AI generation',
      'IVX Owner AI request service',
      'Multi-endpoint routing with fallback',
      'Response normalization and validation',
      'Toolkit fallback in dev mode',
      'System prompt construction',
    ],
    failureModes: [
      'AI response empty or malformed',
      'Toolkit fallback masking real backend issues',
      'System prompt drift',
      'Token limit exceeded',
      'Model unavailability',
    ],
    crossCuts: ['api_backend', 'realtime_subscriptions'],
  },
  {
    id: 'traffic_analytics',
    name: 'Traffic / Analytics',
    ivxFiles: [
      'expo/lib/analytics.ts',
      'expo/lib/analytics-compute.ts',
      'expo/lib/analytics-context.tsx',
      'expo/lib/analytics-server.ts',
      'expo/lib/control-tower/traffic-aggregator.ts',
      'expo/lib/control-tower/traffic-attribution.ts',
      'expo/lib/control-tower/traffic-predictive.ts',
      'expo/lib/control-tower/live-intelligence.ts',
      'expo/lib/landing-tracker.ts',
      'expo/components/analytics/',
    ],
    keyAbstractions: [
      'Traffic source attribution',
      'Funnel tracking',
      'Live intelligence events',
      'Predictive scoring',
      'Landing page analytics',
      'Session stitching',
    ],
    failureModes: [
      'Attribution data loss',
      'Funnel step misclassification',
      'Predictive model drift',
      'Analytics event queue overflow',
    ],
    crossCuts: ['observability_logging', 'database_storage'],
  },
  {
    id: 'ci_cd',
    name: 'CI/CD',
    ivxFiles: [
      'package.json',
      'expo/app.config.ts',
    ],
    keyAbstractions: [
      'Bun as package manager',
      'TypeScript strict mode',
      'ESLint',
      'Expo build system',
    ],
    failureModes: [
      'Type errors blocking build',
      'Missing dependency',
      'Expo SDK version mismatch',
    ],
    crossCuts: ['testing_qa', 'infra_deployment'],
  },
];

export const REASONING_MODEL: {
  id: ReasoningStepId;
  name: string;
  description: string;
  ivxExample: string;
}[] = [
  {
    id: 'identify_layer',
    name: 'Identify the Layer',
    description: 'Determine which architectural layer the issue lives in: UI, state management, API, backend, database, realtime, infrastructure.',
    ivxExample: '"rawText.trim crash" -> layer is UI/state management, specifically the send pipeline in ivx/chat.tsx and useChatMessages.ts. Not a backend issue.',
  },
  {
    id: 'trace_flow',
    name: 'Trace the Request/State Flow',
    description: 'Follow the exact execution path from trigger to outcome. Map every function call, state transition, and async boundary.',
    ivxExample: 'Send message flow: handleSendMessage (chat.tsx) -> normalizeSendInput -> ivxChatService.sendOwnerMessage -> Supabase insert -> realtime postgres_changes event -> message list update via React Query invalidation.',
  },
  {
    id: 'find_root_cause',
    name: 'Find the Root Cause',
    description: 'Distinguish between the symptom and the underlying cause. The root cause is the earliest point in the chain where correct behavior diverged.',
    ivxExample: 'Symptom: "reply failed" in UI. Root cause: toolkit fallback extractToolkitText received an object with neither .text nor .content nor .answer, returning empty string, triggering the empty response guard.',
  },
  {
    id: 'propose_fix',
    name: 'Propose the Safest Fix',
    description: 'Choose the fix with the smallest blast radius that fully resolves the root cause. Prefer fixing at the source over adding guards downstream.',
    ivxExample: 'Instead of adding null checks in every send entry point, create one normalizeSendInput helper and route all entry points through it. Single fix point, zero duplication.',
  },
  {
    id: 'validate_regressions',
    name: 'Validate Possible Regressions',
    description: 'Before applying a fix, identify what else depends on the changed code. Run type checking and tests. Check for behavioral changes in dependent paths.',
    ivxExample: 'Changing normalizeSendInput affects: composer send, keyboard submit, reply-last, resend/retry, quick actions. Must verify all triggers still work after the change.',
  },
  {
    id: 'explain_impact',
    name: 'Explain Impact Clearly',
    description: 'Communicate what changed, why, what it affects, and what the user should verify. No jargon without context.',
    ivxExample: '"The crash was caused by the reply-last button passing undefined instead of the last message text. Fixed by routing all send triggers through normalizeSendInput. This affects 6 send entry points. All now share the same safe path."',
  },
  {
    id: 'distinguish_hypothesis_vs_evidence',
    name: 'Distinguish Hypothesis vs Evidence vs Confirmed',
    description: 'Never present a guess as a fact. Label reasoning as: hypothesis (untested theory), evidence (observed signal), or confirmed (verified root cause).',
    ivxExample: 'Hypothesis: the realtime subscription might be leaking. Evidence: getOwnerRealtimeSubscriptionAudit shows activeChannelCount=3 when expected=1. Confirmed: subscription cleanup in useEffect was missing the room ID dependency, causing new subscriptions without teardown.',
  },
];

export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'senior_developer',
    name: 'Senior Developer AI (unified)',
    responsibilities: [
      'Full codebase comprehension',
      'Cross-layer bug tracing',
      'Architecture evaluation',
      'Code review and generation',
      'Deployment awareness',
      'Performance diagnosis',
      'Security audit',
      'Test generation',
      'Incident response',
    ],
    tools: [
      'read_file', 'search_repo', 'edit_file', 'run_validation',
      'inspect_logs', 'inspect_runtime_state', 'inspect_network',
      'analyze_db_schema', 'inspect_deploy_config', 'summarize_architecture',
      'compare_changes', 'trace_request_path', 'run_tests',
      'query_supabase', 'inspect_realtime_channels', 'audit_env_config',
    ],
    memoryScopes: ['session', 'project', 'architecture_decisions', 'bug_history', 'deployment_history', 'user_preferences'],
    splitPhase: null,
  },
  {
    id: 'frontend_specialist',
    name: 'Frontend Specialist',
    responsibilities: [
      'React Native / Expo expertise',
      'UI/UX implementation',
      'Platform compatibility',
      'Animation and performance',
      'Accessibility',
    ],
    tools: ['read_file', 'search_repo', 'edit_file', 'run_validation', 'profile_render_perf', 'measure_bundle_size'],
    memoryScopes: ['session', 'project'],
    splitPhase: 4,
  },
  {
    id: 'backend_specialist',
    name: 'Backend Specialist',
    responsibilities: [
      'API design and implementation',
      'Database schema and queries',
      'Auth and security',
      'Supabase administration',
      'Backend performance',
    ],
    tools: ['read_file', 'search_repo', 'edit_file', 'run_validation', 'analyze_db_schema', 'query_supabase', 'audit_env_config'],
    memoryScopes: ['session', 'project', 'architecture_decisions'],
    splitPhase: 4,
  },
  {
    id: 'devops_engineer',
    name: 'DevOps Engineer',
    responsibilities: [
      'Deployment pipeline',
      'Infrastructure management',
      'Environment configuration',
      'Monitoring and alerting',
      'CDN and DNS',
    ],
    tools: ['read_file', 'inspect_deploy_config', 'audit_env_config', 'inspect_logs'],
    memoryScopes: ['session', 'deployment_history'],
    splitPhase: 5,
  },
  {
    id: 'qa_engineer',
    name: 'QA Engineer',
    responsibilities: [
      'Test strategy and generation',
      'Regression testing',
      'Integration testing',
      'Production readiness validation',
    ],
    tools: ['read_file', 'search_repo', 'run_tests', 'run_validation', 'inspect_runtime_state'],
    memoryScopes: ['session', 'bug_history'],
    splitPhase: 5,
  },
  {
    id: 'security_auditor',
    name: 'Security Auditor',
    responsibilities: [
      'Auth flow review',
      'RLS policy audit',
      'Secret management',
      'Input validation',
      'Vulnerability scanning',
    ],
    tools: ['read_file', 'search_repo', 'analyze_db_schema', 'audit_env_config'],
    memoryScopes: ['session', 'project'],
    splitPhase: 5,
  },
  {
    id: 'product_analyst',
    name: 'Product Analyst',
    responsibilities: [
      'Feature impact analysis',
      'User flow optimization',
      'Analytics interpretation',
      'A/B test design',
    ],
    tools: ['read_file', 'query_supabase', 'summarize_architecture'],
    memoryScopes: ['session', 'user_preferences'],
    splitPhase: 5,
  },
  {
    id: 'incident_commander',
    name: 'Incident Commander',
    responsibilities: [
      'Incident triage',
      'Root cause coordination',
      'Communication',
      'Post-mortem',
    ],
    tools: ['inspect_logs', 'inspect_runtime_state', 'inspect_network', 'trace_request_path', 'inspect_realtime_channels'],
    memoryScopes: ['session', 'bug_history', 'deployment_history'],
    splitPhase: 5,
  },
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    responsibilities: [
      'Task decomposition',
      'Agent delegation',
      'Result synthesis',
      'Conflict resolution',
      'Priority management',
    ],
    tools: ['read_file', 'summarize_architecture'],
    memoryScopes: ['session', 'project', 'user_preferences', 'agent_specific'],
    splitPhase: 4,
  },
];

export const IMPLEMENTATION_ROADMAP: RoadmapItem[] = [
  {
    phase: 1,
    title: 'Core AI Engine + Repo Understanding',
    deliverables: [
      'Build repo indexer: parse import graph, file-to-domain mapping, module boundaries',
      'Create project knowledge base from codebase analysis (auto-generated, stored in Supabase)',
      'Implement session memory with conversation context tracking',
      'Implement trace_request_path tool for IVX send/receive/realtime flows',
      'Wire AI engine to existing IVX chat room as enhanced assistant',
      'Add system prompt that includes repo structure, architecture summary, and domain map',
      'Implement safe file read/search/edit tools with validation',
    ],
    dependencies: [],
    estimatedWeeks: 3,
  },
  {
    phase: 2,
    title: 'Runtime Intelligence + Debugging Tools',
    deliverables: [
      'Implement log analysis tool that parses tagged console output',
      'Implement runtime state inspection (React Query cache, auth context, realtime audit)',
      'Implement network request tracing for IVX AI request lifecycle',
      'Add architecture summarization tool',
      'Add file diff/comparison tool',
      'Wire debugging tools into IVX Owner Room chat commands',
      'Add structured command parsing: "trace send path", "show realtime health", "inspect auth state"',
    ],
    dependencies: [1],
    estimatedWeeks: 3,
  },
  {
    phase: 3,
    title: 'Persistent Memory + Database Awareness',
    deliverables: [
      'Create Supabase tables for AI memory: project_memory, bug_history, decisions, deploy_history',
      'Implement persistent memory read/write with TTL and size limits',
      'Implement database schema analysis tool',
      'Implement Supabase query tool (read-only)',
      'Implement environment config audit tool',
      'Add architecture decision recording from chat conversations',
      'Add bug pattern recognition from historical memory',
    ],
    dependencies: [2],
    estimatedWeeks: 3,
  },
  {
    phase: 4,
    title: 'Multi-Agent Foundation + Specialization',
    deliverables: [
      'Define agent registry schema and configuration',
      'Implement orchestrator agent for task decomposition',
      'Split frontend specialist from unified agent',
      'Split backend specialist from unified agent',
      'Implement agent delegation protocol',
      'Add result synthesis across agent responses',
      'Add bundle size and render performance tools',
    ],
    dependencies: [3],
    estimatedWeeks: 4,
  },
  {
    phase: 5,
    title: 'Full Multi-Agent System + Operational Intelligence',
    deliverables: [
      'Add QA engineer, security auditor, devops engineer, product analyst, incident commander agents',
      'Implement cross-agent memory sharing',
      'Add agent effectiveness tracking and calibration',
      'Integrate with Nerve Center for live system intelligence',
      'Add proactive incident detection and recommendation',
      'Add deployment pipeline awareness and pre-deploy checks',
      'Add end-to-end autonomous investigation flows',
    ],
    dependencies: [4],
    estimatedWeeks: 5,
  },
];

export const REPO_READINESS: RepoReadinessRecommendation[] = [
  {
    area: 'Module Boundaries',
    currentState: 'expo/lib/ has 80+ files with mixed concerns. Services, contexts, utilities, and domain logic are all at the same level.',
    recommendation: 'Group expo/lib/ into subdirectories by domain: expo/lib/auth/, expo/lib/chat/, expo/lib/investment/, expo/lib/infra/, expo/lib/analytics/. Keep shared utilities at expo/lib/utils/.',
    priority: 'high',
    files: ['expo/lib/'],
  },
  {
    area: 'Source of Truth Files',
    currentState: 'No single file describes each subsystem. Understanding chat requires reading 15+ files across expo/src/modules/chat/, expo/lib/, expo/shared/, expo/constants/.',
    recommendation: 'Create a MANIFEST.ts in each module directory that exports: purpose, key types, entry points, dependencies, failure modes. The AI reads this first before diving into implementation files.',
    priority: 'critical',
    files: ['expo/src/modules/chat/', 'expo/src/modules/ivx-owner-ai/', 'expo/lib/control-tower/'],
  },
  {
    area: 'Architecture Documentation',
    currentState: 'PLAN.md covers Nerve Center architecture but not the full system. No docs for chat engine, auth flow, investment lifecycle, or deployment pipeline.',
    recommendation: 'Create docs/architecture/ with: system-overview.ts, chat-engine.ts, auth-flow.ts, investment-lifecycle.ts, deployment-pipeline.ts, realtime-subscriptions.ts. Use TypeScript types (not markdown) so the AI can import and reason about them programmatically.',
    priority: 'critical',
    files: ['docs/'],
  },
  {
    area: 'Flow Documentation',
    currentState: 'Request flows are implicit in code. No explicit documentation of: send message flow, AI response flow, realtime subscription lifecycle, file upload flow, auth flow.',
    recommendation: 'Create docs/flows/ with typed flow definitions. Each flow defines: trigger, steps (with file + function), async boundaries, failure points, recovery strategies. The AI uses these as trace guides.',
    priority: 'high',
    files: ['docs/flows/'],
  },
  {
    area: 'Naming Consistency',
    currentState: 'Mixed naming: ivxChatService vs chatService vs ivxChat. IVXOwnerAI vs OwnerAI. camelCase file names vs kebab-case. Inconsistent export patterns.',
    recommendation: 'Standardize: all IVX-specific services use ivx prefix. All file names use kebab-case. All barrel exports use index.ts. All types use PascalCase with domain prefix.',
    priority: 'medium',
    files: ['expo/src/modules/', 'expo/lib/'],
  },
  {
    area: 'Test Coverage',
    currentState: 'Only 6 test files covering auth helpers, rate limiter, chat runtime, ivx chat, query keys, room state. No integration tests. No API route tests. No end-to-end tests.',
    recommendation: 'Add test files for: AI request service, response normalization, realtime subscription lifecycle, file upload, control tower aggregation. Create expo/__tests__/integration/ for cross-module tests.',
    priority: 'high',
    files: ['expo/__tests__/'],
  },
  {
    area: 'Error Types',
    currentState: 'IVXOwnerAIRequestError is well-structured with diagnostics. But most other errors are generic Error or untyped. No unified error taxonomy.',
    recommendation: 'Create expo/lib/errors/ with typed error classes for each domain: AuthError, ChatError, RealtimeError, UploadError, DatabaseError. Each includes structured diagnostics like IVXOwnerAIRequestError.',
    priority: 'medium',
    files: ['expo/lib/'],
  },
  {
    area: 'Configuration Centralization',
    currentState: 'Config scattered across: constants/, lib/env-config.ts, lib/env-validation.ts, lib/environment.ts, lib/platform-config.ts, constants/ivx-owner-ai.ts. Hard to audit what controls what.',
    recommendation: 'Create expo/config/ as the single config directory. Move all env parsing, feature flags, and runtime config here. Create a typed config object that the AI can query to understand the full configuration surface.',
    priority: 'medium',
    files: ['expo/constants/', 'expo/lib/env-config.ts', 'expo/lib/env-validation.ts'],
  },
  {
    area: 'Backend/Frontend Type Sharing',
    currentState: 'expo/shared/ivx/ shares types between frontend and backend. But backend/api/ivx-owner-ai.ts also defines its own row types that partially duplicate shared types.',
    recommendation: 'Move all shared contracts to expo/shared/. Backend imports from shared only. No type definitions in backend/ that duplicate shared types. Add a lint rule or manifest check.',
    priority: 'high',
    files: ['expo/shared/', 'backend/api/'],
  },
  {
    area: 'Debug/Proof Surface Separation',
    currentState: 'Debug and proof UI is embedded directly in chat.tsx (2000+ lines). Hard to maintain, test, or toggle.',
    recommendation: 'Extract proof/debug surfaces into separate components: ProofPanel.tsx, DiagnosticsFooter.tsx, RuntimeDebugOverlay.tsx. Gate behind a dev mode flag. Chat.tsx should only contain chat logic.',
    priority: 'high',
    files: ['expo/app/ivx/chat.tsx'],
  },
];

export const MULTI_AGENT_SPLIT = {
  staysUnified: [
    'Repo understanding and indexing',
    'Session memory management',
    'Project knowledge base',
    'Architecture decision recording',
    'Core reasoning engine',
    'Bug history tracking',
    'User preference management',
  ],
  becomesSpecialized: [
    { agent: 'frontend_specialist' as AgentRoleId, trigger: 'When UI-specific tasks exceed 40% of requests', phase: 4 as ImplementationPhase },
    { agent: 'backend_specialist' as AgentRoleId, trigger: 'When API/DB tasks require deep schema reasoning', phase: 4 as ImplementationPhase },
    { agent: 'orchestrator' as AgentRoleId, trigger: 'When tasks require coordinating 2+ specialists', phase: 4 as ImplementationPhase },
    { agent: 'devops_engineer' as AgentRoleId, trigger: 'When deployment and infra tasks become regular', phase: 5 as ImplementationPhase },
    { agent: 'qa_engineer' as AgentRoleId, trigger: 'When test generation becomes a dedicated workflow', phase: 5 as ImplementationPhase },
    { agent: 'security_auditor' as AgentRoleId, trigger: 'When security reviews become periodic requirements', phase: 5 as ImplementationPhase },
    { agent: 'incident_commander' as AgentRoleId, trigger: 'When production incidents require autonomous triage', phase: 5 as ImplementationPhase },
    { agent: 'product_analyst' as AgentRoleId, trigger: 'When analytics and feature decisions need dedicated reasoning', phase: 5 as ImplementationPhase },
  ],
  orchestrationModel: {
    delegationProtocol: 'Orchestrator receives task -> decomposes into subtasks -> assigns to most capable agent -> collects results -> synthesizes response -> resolves conflicts',
    conflictResolution: 'When agents disagree (e.g., frontend wants X, backend wants Y), orchestrator applies: user impact first, then simplicity, then consistency with existing patterns',
    memorySharing: 'Agents share project memory and architecture decisions. Session memory is agent-local. Bug history is shared. Deployment history is shared.',
    escalation: 'If any agent is stuck for >30s or confidence drops below 0.3, escalate to orchestrator for re-decomposition or human input request.',
  },
};
