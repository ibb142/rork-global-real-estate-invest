export type OwnerNamedTrustState =
  | 'owner_room_authenticated'
  | 'backend_admin_verified'
  | 'fallback_chat_only'
  | 'destructive_action_requires_confirmation';

export type OwnerRoomTrustState = 'owner_room_authenticated' | 'owner_room_unverified';
export type BackendAdminTrustState = 'backend_admin_verified' | 'backend_admin_unverified';
export type OwnerConversationAccessState = 'fallback_chat_only' | 'full_backend_execution';
export type OwnerActionConfirmationState = 'destructive_action_requires_confirmation' | 'normal_owner_chat';
export type OwnerRequestClass =
  | 'normal_owner_conversation'
  | 'admin_execution'
  | 'backend_linking'
  | 'production_config_change'
  | 'security_sensitive_operation'
  | 'destructive_command';

export type OwnerTrustContextInput = {
  messageText: unknown;
  ownerRoomAuthenticated: boolean;
  backendAdminVerified: boolean;
  fallbackModeActive: boolean;
  devTestModeActive?: boolean;
};

export type OwnerTrustContext = {
  normalizedMessageText: string;
  requestClass: OwnerRequestClass;
  ownerRoomState: OwnerRoomTrustState;
  backendAdminState: BackendAdminTrustState;
  conversationAccessState: OwnerConversationAccessState;
  actionConfirmationState: OwnerActionConfirmationState;
  requiresElevatedConfirmation: boolean;
  namedStates: OwnerNamedTrustState[];
  explanation: string;
};

const SENSITIVE_COMMANDS = new Set<string>(['heal', 'replay', 'broadcast', 'reconnect', 'probe']);
const DESTRUCTIVE_COMMANDS = new Set<string>(['clear']);

const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  /\b(delete|destroy|drop|purge|wipe|erase)\b/i,
  /\b(remove|reset|clear|rebuild)\b.{0,48}\b(database|table|messages|conversation|room|snapshot|config|deployment|runtime|policy|bucket|storage|queue)\b/i,
];

const SECURITY_PATTERNS: readonly RegExp[] = [
  /\b(show|reveal|print|expose|share|rotate|reset|update|change|set|modify|edit|use|inject|store|link)\b.{0,48}\b(secret|credential|password|jwt|token|api key|private key|service role|access key|anon key)\b/i,
  /\b(show|reveal|print|expose|share|rotate|reset|update|change|set|modify|edit|use|inject|store|link)\b.{0,48}\b(supabase_service_role_key|jwt_secret|aws_secret_access_key|aws_access_key_id)\b/i,
];

const BACKEND_LINKING_PATTERNS: readonly RegExp[] = [
  /\b(link|connect|wire|attach|bind)\b.{0,48}\b(backend|supabase|database|realtime|storage|bucket|cloudfront|aws|s3|api|provider)\b/i,
  /\b(set up|setup)\b.{0,48}\b(backend|supabase|database|realtime|storage|bucket|cloudfront|aws|s3|api|provider)\b/i,
];

const PRODUCTION_CONFIG_PATTERNS: readonly RegExp[] = [
  /\b(prod|production)\b.{0,48}\b(config|env|environment|setting|settings|secret|deploy|deployment|routing|dns|domain|bucket|cloudfront|aws|supabase)\b/i,
  /\b(change|update|set|modify|edit|rotate|switch|pin)\b.{0,48}\b(env|environment|config|secret|setting|api key|token|password|bucket|cloudfront|dns|supabase|aws|deployment)\b/i,
];

const ADMIN_EXECUTION_PATTERNS: readonly RegExp[] = [
  /\b(run|execute|apply|migrate|deploy|rollback|restart|rerun|replay|heal|probe|reindex|resync|invalidate|flush|promote)\b.{0,48}\b(runtime|backend|provider|model|sync|probe|migration|deployment|queue|pipeline|knowledge|room|inbox|transcript|fallback)\b/i,
  /^\/(heal|replay|broadcast|reconnect|probe)\b/i,
];

function safeTrimOwnerTrust(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value == null) {
    return '';
  }

  try {
    return String(value).trim();
  } catch {
    return '';
  }
}

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isExplicitSensitiveActionConfirmation(messageText: unknown): boolean {
  const normalizedMessageText = safeTrimOwnerTrust(messageText).toLowerCase();
  return normalizedMessageText === '/confirm'
    || normalizedMessageText === 'confirm'
    || normalizedMessageText.startsWith('/confirm ')
    || normalizedMessageText.startsWith('confirm ');
}

export function stripSensitiveActionConfirmationPrefix(messageText: unknown): string {
  const normalizedMessageText = safeTrimOwnerTrust(messageText);
  if (/^\/confirm\b/i.test(normalizedMessageText)) {
    return normalizedMessageText.replace(/^\/confirm\b\s*/i, '');
  }

  if (/^confirm\b/i.test(normalizedMessageText)) {
    return normalizedMessageText.replace(/^confirm\b\s*/i, '');
  }

  return normalizedMessageText;
}

export function classifyOwnerRequest(messageText: unknown): OwnerRequestClass {
  const normalizedMessageText = stripSensitiveActionConfirmationPrefix(messageText);
  if (!normalizedMessageText) {
    return 'normal_owner_conversation';
  }

  const commandMatch = normalizedMessageText.match(/^\/([^\s]+)/);
  const commandName = commandMatch?.[1]?.toLowerCase() ?? '';

  if (commandName && DESTRUCTIVE_COMMANDS.has(commandName)) {
    return 'destructive_command';
  }

  if (commandName && SENSITIVE_COMMANDS.has(commandName)) {
    return 'admin_execution';
  }

  if (matchesAny(normalizedMessageText, DESTRUCTIVE_PATTERNS)) {
    return 'destructive_command';
  }

  if (matchesAny(normalizedMessageText, SECURITY_PATTERNS)) {
    return 'security_sensitive_operation';
  }

  if (matchesAny(normalizedMessageText, BACKEND_LINKING_PATTERNS)) {
    return 'backend_linking';
  }

  if (matchesAny(normalizedMessageText, PRODUCTION_CONFIG_PATTERNS)) {
    return 'production_config_change';
  }

  if (matchesAny(normalizedMessageText, ADMIN_EXECUTION_PATTERNS)) {
    return 'admin_execution';
  }

  return 'normal_owner_conversation';
}

export function resolveOwnerTrustContext(input: OwnerTrustContextInput): OwnerTrustContext {
  const normalizedMessageText = safeTrimOwnerTrust(input.messageText);
  const requestClass = classifyOwnerRequest(normalizedMessageText);
  const devBypass = input.devTestModeActive === true;
  const requiresElevatedConfirmation = devBypass ? false : requestClass !== 'normal_owner_conversation';
  const ownerRoomState: OwnerRoomTrustState = (input.ownerRoomAuthenticated || devBypass)
    ? 'owner_room_authenticated'
    : 'owner_room_unverified';
  const backendAdminState: BackendAdminTrustState = (input.backendAdminVerified || devBypass)
    ? 'backend_admin_verified'
    : 'backend_admin_unverified';
  const conversationAccessState: OwnerConversationAccessState = (input.fallbackModeActive && !devBypass)
    ? 'fallback_chat_only'
    : 'full_backend_execution';
  const actionConfirmationState: OwnerActionConfirmationState = requiresElevatedConfirmation
    ? 'destructive_action_requires_confirmation'
    : 'normal_owner_chat';
  const namedStates: OwnerNamedTrustState[] = [];

  if (ownerRoomState === 'owner_room_authenticated') {
    namedStates.push('owner_room_authenticated');
  }

  if (backendAdminState === 'backend_admin_verified') {
    namedStates.push('backend_admin_verified');
  }

  if (conversationAccessState === 'fallback_chat_only') {
    namedStates.push('fallback_chat_only');
  }

  if (actionConfirmationState === 'destructive_action_requires_confirmation') {
    namedStates.push('destructive_action_requires_confirmation');
  }

  const explanationParts: string[] = [];

  if (devBypass) {
    explanationParts.push('DEV_TEST_MODE active: owner trust bypassed for testing.');
  } else if (ownerRoomState === 'owner_room_authenticated') {
    explanationParts.push('Owner room trust is active for normal conversation.');
  } else {
    explanationParts.push('Owner room trust is not verified yet.');
  }

  if (backendAdminState === 'backend_admin_verified') {
    explanationParts.push('Backend admin execution is verified.');
  } else if (conversationAccessState === 'fallback_chat_only') {
    explanationParts.push('Fallback mode keeps chat available, but backend admin execution is not verified.');
  } else {
    explanationParts.push('Backend admin execution is not verified yet.');
  }

  if (actionConfirmationState === 'destructive_action_requires_confirmation') {
    explanationParts.push(`This request is classified as ${requestClass} and needs explicit action confirmation.`);
  } else {
    explanationParts.push('This request is normal owner conversation and should not trigger identity re-verification.');
  }

  return {
    normalizedMessageText,
    requestClass,
    ownerRoomState,
    backendAdminState,
    conversationAccessState,
    actionConfirmationState,
    requiresElevatedConfirmation,
    namedStates,
    explanation: explanationParts.join(' '),
  };
}

export function buildOwnerTrustPromptBlock(input: OwnerTrustContextInput): string {
  const trust = resolveOwnerTrustContext(input);
  const devBypass = input.devTestModeActive === true;

  const lines = [
    'Owner-room trust policy:',
    `- room_trust: ${trust.ownerRoomState}`,
    `- backend_execution_trust: ${trust.backendAdminState}`,
    `- runtime_mode: ${trust.conversationAccessState}`,
    `- action_gate: ${trust.actionConfirmationState}`,
    `- inferred_request_class: ${trust.requestClass}`,
  ];

  if (devBypass) {
    lines.push('- DEV_TEST_MODE is active. The owner is fully trusted for this session. Do not ask for credentials, re-verification, or identity confirmation.');
    lines.push('- All owner actions are permitted without confirmation gates during this test session.');
    lines.push('- Audit logging remains active.');
  } else {
    lines.push(
      trust.ownerRoomState === 'owner_room_authenticated'
        ? '- Treat the user as the trusted owner for normal conversation inside this owner room.'
        : '- Owner-room trust is not proven yet, so do not claim authenticated backend execution.',
    );
    lines.push('- Do not ask for owner credentials, identity phrases, owner tokens, backend environment variables, or repeated identity verification for normal owner conversation.');
    lines.push(
      trust.conversationAccessState === 'fallback_chat_only'
        ? '- Fallback mode limits backend execution claims, but it does not limit normal owner conversation.'
        : '- Live backend execution can be discussed within the verified scope.',
    );
    lines.push(
      trust.actionConfirmationState === 'destructive_action_requires_confirmation'
        ? '- This request touches a sensitive action. Ask for explicit confirmation of the action and scope before claiming execution.'
        : '- This request is standard owner chat. Answer directly without escalation or re-authentication prompts.',
    );
    lines.push('- If backend admin execution is not verified, offer analysis, planning, or safe chat-only guidance instead of requesting identity re-verification.');
  }

  return lines.join('\n');
}
