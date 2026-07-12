const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SUPABASE_PAT_PATTERN = /sbp_[A-Za-z0-9._-]{16,}/g;
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/gi;
const LABELED_SECRET_PATTERN = /((?:service[_\s-]?role|anon|jwt|secret|access|api|supabase|aws)[^\n:=]{0,32}(?:key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi;

const BLOCKED_VISIBLE_CHAT_PATTERNS = [
  /shared fallback/i,
  /fallback reply delivered/i,
  /fallback path answered/i,
  /provider fallback/i,
  /degraded fallback mode/i,
  /assistant replying/i,
  /DEV_TEST_MODE/i,
  /^source:\s*owner_audit_report/im,
  /^detected_intent:/im,
  /^selected_route:/im,
  /^audit_endpoint_called:/im,
  /^audit_failure:/im,
];

function hasStructuredInternalRows(value: string): boolean {
  const labels = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return null;
      }
      return line.slice(0, separatorIndex).trim().toLowerCase();
    })
    .filter((label): label is string => label !== null);

  const auditDebugLabels = ['source', 'detected_intent', 'selected_route', 'audit_endpoint_called', 'audit_failure'];
  const auditDebugCount = auditDebugLabels.filter((label) => labels.includes(label)).length;
  return (labels.length >= 3 && labels.includes('result') && (labels.includes('evidence') || labels.includes('operator action log')))
    || auditDebugCount >= 2;
}

export function containsBlockedUserFacingChatText(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return BLOCKED_VISIBLE_CHAT_PATTERNS.some((pattern) => pattern.test(value)) || hasStructuredInternalRows(value);
}

export function redactUserFacingChatSecrets(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [redacted]')
    .replace(LABELED_SECRET_PATTERN, '$1[redacted]')
    .replace(JWT_PATTERN, '[redacted token]')
    .replace(SUPABASE_PAT_PATTERN, '[redacted token]')
    .replace(AWS_ACCESS_KEY_PATTERN, '[redacted key]')
    .trim();
}

export function sanitizeUserFacingChatText(value: unknown): string {
  const redacted = redactUserFacingChatSecrets(value);

  if (!redacted || containsBlockedUserFacingChatText(redacted)) {
    return '';
  }

  return redacted;
}
