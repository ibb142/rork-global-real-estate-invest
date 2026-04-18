
export type AgentId = 'ivx_senior_dev' | 'ivx_frontend' | 'ivx_backend' | 'ivx_devops' | 'ivx_qa' | 'ivx_orchestrator';

export type AgentToolCapability =
  | 'read_codebase'
  | 'search_codebase'
  | 'edit_codebase'
  | 'run_typecheck'
  | 'run_lint'
  | 'run_tests'
  | 'trace_request'
  | 'inspect_logs'
  | 'inspect_state'
  | 'query_db'
  | 'inspect_realtime'
  | 'audit_env'
  | 'summarize_arch';

export type MemoryScope = 'session' | 'project' | 'decisions' | 'bugs' | 'deployments' | 'preferences';

export type FallbackStrategy = 'toolkit_generate' | 'cached_response' | 'graceful_degrade' | 'escalate_to_owner';

export interface AgentDefinition {
  id: AgentId;
  role: string;
  systemPrompt: string;
  tools: AgentToolCapability[];
  memoryScopes: MemoryScope[];
  fallbackStrategy: FallbackStrategy;
  maxContextTokens: number;
  confidenceThreshold: number;
}

export const IVX_CODEBASE_MAP = {
  entryPoints: {
    app: 'expo/app/_layout.tsx',
    tabs: 'expo/app/(tabs)/_layout.tsx',
    ownerChat: 'expo/app/ivx/chat.tsx',
    ownerInbox: 'expo/app/ivx/inbox.tsx',
    adminPanel: 'expo/app/admin/index.tsx',
    backend: 'backend/hono.ts',
    server: 'server.ts',
  },
  modules: {
    chat: {
      root: 'expo/src/modules/chat/',
      screens: ['expo/src/modules/chat/screens/ChatScreen.tsx', 'expo/src/modules/chat/screens/ChatModule.tsx'],
      components: 'expo/src/modules/chat/components/',
      hooks: 'expo/src/modules/chat/hooks/',
      services: 'expo/src/modules/chat/services/',
      types: 'expo/src/modules/chat/types/chat.ts',
    },
    ownerAI: {
      root: 'expo/src/modules/ivx-owner-ai/',
      services: 'expo/src/modules/ivx-owner-ai/services/',
      barrel: 'expo/src/modules/ivx-owner-ai/services/index.ts',
      requestService: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts',
      chatService: 'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts',
      runtimeService: 'expo/src/modules/ivx-owner-ai/services/ivxRoomRuntimeService.ts',
      tableResolver: 'expo/src/modules/ivx-owner-ai/services/ivxTableResolver.ts',
    },
    controlTower: {
      root: 'expo/lib/control-tower/',
      aggregator: 'expo/lib/control-tower/aggregator.ts',
      predictive: 'expo/lib/control-tower/predictive-engine.ts',
      remediation: 'expo/lib/control-tower/auto-remediation.ts',
      decision: 'expo/lib/control-tower/decision-engine.ts',
      proofGraph: 'expo/lib/control-tower/proof-graph.ts',
      traffic: 'expo/lib/control-tower/traffic-aggregator.ts',
      liveIntel: 'expo/lib/control-tower/live-intelligence.ts',
      types: 'expo/lib/control-tower/types.ts',
    },
  },
  sharedContracts: {
    ivxTypes: 'expo/shared/ivx/types.ts',
    ivxIndex: 'expo/shared/ivx/index.ts',
    chatTypes: 'expo/src/modules/chat/types/chat.ts',
    controlTowerTypes: 'expo/lib/control-tower/types.ts',
    databaseTypes: 'expo/types/database.ts',
  },
  infrastructure: {
    supabase: 'expo/lib/supabase.ts',
    supabaseAdmin: 'expo/lib/supabase-admin.ts',
    ivxSupabase: 'expo/lib/ivx-supabase-client.ts',
    realtime: 'expo/lib/realtime.ts',
    envConfig: 'expo/lib/env-config.ts',
    envValidation: 'expo/lib/env-validation.ts',
    s3Config: 'expo/deploy/aws/s3-config.ts',
  },
  auth: {
    context: 'expo/lib/auth-context.tsx',
    helpers: 'expo/lib/auth-helpers.ts',
    rateLimiter: 'expo/lib/auth-rate-limiter.ts',
    mfa: 'expo/lib/auth-mfa.ts',
    store: 'expo/lib/auth-store.ts',
  },
  constants: {
    ownerAI: 'expo/constants/ivx-owner-ai.ts',
    colors: 'expo/constants/colors.ts',
    brand: 'expo/constants/brand.ts',
    schemaSql: 'expo/constants/ivx-owner-ai-schema-sql.ts',
  },
  backend: {
    hono: 'backend/hono.ts',
    ownerAI: 'backend/api/ivx-owner-ai.ts',
    ownerOnly: 'backend/api/owner-only.ts',
    route53: 'backend/api/route53-dns.ts',
  },
  apiRoutes: {
    ownerAI: 'expo/app/api/ivx/owner-ai+api.ts',
    assistant: 'expo/app/api/assistant+api.ts',
    authLookup: 'expo/app/api/auth-lookup+api.ts',
    ownerBootstrap: 'expo/app/api/owner-bootstrap+api.ts',
  },
  tests: {
    root: 'expo/__tests__/',
    files: [
      'expo/__tests__/auth-helpers.test.ts',
      'expo/__tests__/auth-rate-limiter.test.ts',
      'expo/__tests__/chat-runtime-state.test.ts',
      'expo/__tests__/ivx-chat.test.ts',
      'expo/__tests__/query-keys.test.ts',
      'expo/__tests__/room-state-manager.test.ts',
    ],
  },
} as const;

export const REQUEST_TRACES = {
  sendMessage: {
    name: 'Send Owner Message',
    steps: [
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'handleSendMessage', desc: 'User taps send or presses enter' },
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'normalizeSendInput', desc: 'Safe input normalization (guards undefined/null/non-string)' },
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'sendMessageMutation.mutate', desc: 'Optimistic user message inserted, mutation started' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts', fn: 'sendOwnerMessage', desc: 'Insert message row into Supabase (ivx_messages or chat_messages)' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxTableResolver.ts', fn: 'resolveIVXTables', desc: 'Resolve which table schema to use (IVX vs generic)' },
      { layer: 'Database', file: 'Supabase', fn: 'INSERT', desc: 'Row inserted into messages table' },
      { layer: 'Realtime', file: 'Supabase', fn: 'postgres_changes', desc: 'INSERT event broadcast to subscribers' },
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'realtime callback', desc: 'New message received via subscription, query invalidated' },
    ],
  },
  getAIResponse: {
    name: 'Get AI Response',
    steps: [
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'sendMessageMutation (after user msg)', desc: 'AI request initiated after user message persisted' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'requestOwnerAI', desc: 'Build payload, check auth, check routing' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'getIVXOwnerAIConfigAudit', desc: 'Audit routing config: base URL, endpoints, fallback policy' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'fetchOwnerAIEndpointWithFallback', desc: 'Try candidate endpoints in order' },
      { layer: 'Network', file: 'fetch()', fn: 'POST /api/ivx/owner-ai', desc: 'HTTP request to backend' },
      { layer: 'Backend', file: 'backend/api/ivx-owner-ai.ts', fn: 'handleIVXOwnerAIRequest', desc: 'Validate auth, find conversation, generate AI response' },
      { layer: 'Backend', file: 'backend/api/ivx-owner-ai.ts', fn: 'toolkit generateText', desc: 'Call AI model via rork-toolkit-sdk' },
      { layer: 'Backend', file: 'backend/api/ivx-owner-ai.ts', fn: 'persist messages', desc: 'Insert user + assistant messages into Supabase' },
      { layer: 'Network', file: 'Response', fn: 'JSON', desc: 'Return canonical IVXOwnerAIResponse' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'normalizeOwnerAIResponse', desc: 'Validate response schema, extract answer' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'setLastOwnerAIRuntimeProof', desc: 'Record runtime proof for debugging' },
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'onSuccess callback', desc: 'Add assistant message to thread, update proof display' },
    ],
    fallbackPath: [
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'requestToolkitFallback', desc: 'If remote fails in dev, use toolkit SDK directly' },
      { layer: 'Service', file: '@rork-ai/toolkit-sdk', fn: 'generateText', desc: 'Direct AI generation without backend' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts', fn: 'extractToolkitText', desc: 'Safely extract text from toolkit response' },
    ],
  },
  realtimeSubscription: {
    name: 'Realtime Message Subscription',
    steps: [
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'useEffect (realtime setup)', desc: 'Subscribe to message changes on room open' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts', fn: 'subscribeToOwnerMessages', desc: 'Create Supabase channel for postgres_changes on messages table' },
      { layer: 'Realtime', file: 'Supabase', fn: 'channel.subscribe()', desc: 'WebSocket connection established' },
      { layer: 'Realtime', file: 'Supabase', fn: 'postgres_changes INSERT', desc: 'New message event received' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts', fn: 'message callback', desc: 'Map row to IVXMessage, notify listeners' },
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'onNewMessage', desc: 'Add to message list, scroll to bottom' },
    ],
    cleanup: [
      { layer: 'UI', file: 'expo/app/ivx/chat.tsx', fn: 'useEffect cleanup', desc: 'Unsubscribe on unmount' },
      { layer: 'Service', file: 'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts', fn: 'unsubscribe()', desc: 'Remove channel, clean up tracking sets' },
    ],
  },
} as const;

export const KNOWN_FAILURE_PATTERNS = [
  {
    id: 'raw_text_trim',
    pattern: 'rawText.trim is not a function',
    rootCause: 'Send entry point passing undefined/null/non-string value to trim()',
    affectedFiles: ['expo/app/ivx/chat.tsx'],
    fix: 'Route all send entry points through normalizeSendInput helper',
    preventionRule: 'Never call .trim() directly on user input. Always use normalizeSendInput.',
  },
  {
    id: 'toolkit_empty_response',
    pattern: 'AI returned an empty fallback response',
    rootCause: 'Toolkit generateText returned object without .text/.content/.answer property',
    affectedFiles: ['expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts'],
    fix: 'extractToolkitText must handle all possible return shapes',
    preventionRule: 'Always validate AI response shape before using. Never assume string return.',
  },
  {
    id: 'realtime_subscription_leak',
    pattern: 'activeChannelCount > 1 for single room',
    rootCause: 'useEffect cleanup not running or missing room ID dependency',
    affectedFiles: ['expo/app/ivx/chat.tsx', 'expo/src/modules/ivx-owner-ai/services/ivxChatService.ts'],
    fix: 'Track active subscriptions in Set, deduplicate on subscribe, clean on unmount',
    preventionRule: 'Always audit getOwnerRealtimeSubscriptionAudit() after navigation.',
  },
  {
    id: 'response_schema_mismatch',
    pattern: 'Owner AI response rejected',
    rootCause: 'Backend or toolkit returning non-canonical response shape',
    affectedFiles: ['expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts'],
    fix: 'normalizeOwnerAIResponse with compatibility mode for dev, strict mode for prod',
    preventionRule: 'Always validate against canonical schema. Log rejection reason.',
  },
  {
    id: 'keyboard_composer_overlap',
    pattern: 'Composer hidden behind system navigation bar',
    rootCause: 'Missing safe area inset on composer container',
    affectedFiles: ['expo/app/ivx/chat.tsx'],
    fix: 'Add paddingBottom: insets.bottom to composer, use SafeAreaView edges=[bottom]',
    preventionRule: 'Always use useSafeAreaInsets() for bottom-positioned UI.',
  },
] as const;

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'ivx_senior_dev',
    role: 'Senior Developer AI',
    systemPrompt: [
      'You are IVX Senior Developer AI. You understand the entire IVX codebase end-to-end.',
      '',
      'CODEBASE ARCHITECTURE:',
      '- Frontend: Expo/React Native with file-based routing (expo/app/)',
      '- Modules: expo/src/modules/ (chat, ivx-owner-ai)',
      '- Services: expo/lib/ (80+ service files)',
      '- Backend: Hono server (backend/) + Expo API routes (expo/app/api/)',
      '- Database: Supabase PostgreSQL with realtime',
      '- Storage: Supabase Storage + AWS S3/CloudFront',
      '- AI: Rork Toolkit SDK with multi-endpoint fallback',
      '',
      'KEY SYSTEMS:',
      '- IVX Owner AI Chat: owner-only room with AI assistant, realtime sync, file uploads',
      '- Nerve Center / Control Tower: system health, predictive risk, autonomous remediation',
      '- Investment Platform: property shares, JV agreements, portfolio management',
      '- Landing & Acquisition: waitlist, viral growth, traffic attribution',
      '',
      'REASONING PROTOCOL:',
      '1. Identify which architectural layer the issue lives in',
      '2. Trace the request/state flow from trigger to outcome',
      '3. Find the exact root cause (earliest divergence point)',
      '4. Propose the safest fix (smallest blast radius)',
      '5. Validate possible regressions in dependent paths',
      '6. Explain impact clearly',
      '7. Label claims as: hypothesis / evidence / confirmed',
      '',
      'KNOWN PATTERNS:',
      '- rawText.trim crash: always use normalizeSendInput, never direct .trim()',
      '- Toolkit fallback: check extractToolkitText handles all return shapes',
      '- Realtime leaks: audit getOwnerRealtimeSubscriptionAudit() after navigation',
      '- Response mismatch: normalizeOwnerAIResponse has canonical + compatibility modes',
      '',
      'RULES:',
      '- Never present hypothesis as confirmed fact',
      '- Always check type safety (project uses strict TypeScript)',
      '- Always run checkErrors after code changes',
      '- Never introduce unsafe .trim() on unknown values',
      '- Always handle Supabase errors (check .error before using .data)',
      '- Always consider web compatibility (React Native Web)',
    ].join('\n'),
    tools: [
      'read_codebase', 'search_codebase', 'edit_codebase', 'run_typecheck', 'run_lint',
      'run_tests', 'trace_request', 'inspect_logs', 'inspect_state', 'query_db',
      'inspect_realtime', 'audit_env', 'summarize_arch',
    ],
    memoryScopes: ['session', 'project', 'decisions', 'bugs', 'deployments', 'preferences'],
    fallbackStrategy: 'toolkit_generate',
    maxContextTokens: 128000,
    confidenceThreshold: 0.4,
  },
];

export const ENV_VAR_MAP = {
  supabase: {
    clientUrl: 'EXPO_PUBLIC_SUPABASE_URL',
    clientAnonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
    dbPassword: 'SUPABASE_DB_PASSWORD',
  },
  auth: {
    jwtSecret: 'JWT_SECRET',
  },
  aws: {
    accessKeyId: 'AWS_ACCESS_KEY_ID',
    secretAccessKey: 'AWS_SECRET_ACCESS_KEY',
    region: 'AWS_REGION',
    s3Bucket: 'S3_BUCKET_NAME',
    cloudfrontDistId: 'CLOUDFRONT_DISTRIBUTION_ID',
  },
  ai: {
    toolkitSecretKey: 'EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY',
    apiBaseUrl: 'EXPO_PUBLIC_RORK_API_BASE_URL',
    toolkitUrl: 'EXPO_PUBLIC_TOOLKIT_URL',
  },
  github: {
    token: 'GITHUB_TOKEN',
    repoUrl: 'GITHUB_REPO_URL',
  },
  rork: {
    authUrl: 'EXPO_PUBLIC_RORK_AUTH_URL',
    projectId: 'EXPO_PUBLIC_PROJECT_ID',
    teamId: 'EXPO_PUBLIC_TEAM_ID',
  },
} as const;
