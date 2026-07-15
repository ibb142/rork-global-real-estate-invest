export type LocalIVXBrainTopic =
  | 'access'
  | 'chat'
  | 'business'
  | 'support'
  | 'finance'
  | 'general';

export type LocalIVXBrainRequest = {
  message: string;
  senderLabel?: string | null;
  requestId?: string | null;
  conversationId?: string | null;
};

export type LocalIVXBrainResponse = {
  answer: string;
  model: string;
  requestId: string;
  topic: LocalIVXBrainTopic;
  generatedAt: string;
};

const LOCAL_IVX_BRAIN_MODEL = 'ivx-local-guard-v1';
const LOCAL_IVX_EMPTY_MESSAGE_REPLY = 'I’m here with IVX. Send one clear question or task, and I’ll help you move it forward.';

const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /sbp_[A-Za-z0-9._-]{16,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/gi,
];

function createLocalRequestId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanUserText(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const redacted = SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, '[redacted]'), raw);
  return redacted.replace(/\s+/g, ' ').trim();
}

function detectTopic(message: string): LocalIVXBrainTopic {
  const normalized = message.toLowerCase();

  if (/access|owner|room|permission|unlock|unblock|control|ivx|supabase|rls|schema|chatgpt|api|health|gate/.test(normalized)) {
    return 'access';
  }

  if (/chat|message|reply|assistant|conversation|inbox|user/.test(normalized)) {
    return 'chat';
  }

  if (/invest|deal|roi|property|real estate|capital|dividend|withdraw|wallet|kyc|member/.test(normalized)) {
    return 'finance';
  }

  if (/sale|growth|lead|client|customer|marketing|brand|business|plan|strategy/.test(normalized)) {
    return 'business';
  }

  if (/bug|crash|fix|error|broken|stuck|issue|help|support/.test(normalized)) {
    return 'support';
  }

  return 'general';
}

function buildAnswer(topic: LocalIVXBrainTopic, message: string): string {
  if (!message.trim()) {
    return LOCAL_IVX_EMPTY_MESSAGE_REPLY;
  }

  if (/\b(what\s+time\s+(?:is\s+)?(?:it\s+)?now|what\s+time\s+is\s+now|current\s+time|time\s+now|date\s+now|today'?s\s+date)\b/i.test(message)) {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(now);
    return `Current time: ${formatted}.`;
  }

  if (/what\s+(tools|access)|which\s+tools|tool\s+access|current\s+access|currently\s+have|capabilit(?:y|ies)|self[-\s]?report/i.test(message)) {
    return 'Current IVX Owner AI tools: real AI chat when the provider is reachable, technical answers, honest capability reporting, local memory, project plan, next task, project context, file notes, safe action confirmation, and owner-only read-only Supabase inspection tools for tables, schema, columns, RLS, and policies.';
  }

  switch (topic) {
    case 'access':
      return 'IVX is ready. I can help with owner-room chat, project execution, technical questions, local memory, file notes, and next action steps from inside this app.';
    case 'chat':
      return 'I’m ready to help with this conversation. Tell me the outcome you want, and I’ll draft the next response clearly.';
    case 'finance':
      return 'I can help organize the investment question, explain the next step, or draft a clear client-facing answer for IVX.';
    case 'business':
      return 'Let’s move the business task forward. Share the goal, audience, and deadline, and I’ll shape a practical next step.';
    case 'support':
      return 'I can help troubleshoot this. Send the exact behavior you see and what you expected, and I’ll narrow it down.';
    case 'general':
    default:
      return 'I’m here with IVX. Send the technical, project, or business question you want handled, and I’ll answer directly.';
  }
}

export function requestLocalIVXBrain(input: LocalIVXBrainRequest): LocalIVXBrainResponse {
  const message = cleanUserText(input.message);
  const topic = detectTopic(message);
  const requestId = input.requestId?.trim() || createLocalRequestId('ivx-local-brain');
  const answer = buildAnswer(topic, message);

  if (!answer.trim()) {
    console.log('[LocalIVXBrain] Empty local guard reply detected; using safe recovery reply:', {
      requestId,
      conversationId: input.conversationId ?? null,
      topic,
    });
  }

  console.log('[LocalIVXBrain] Reply generated:', {
    requestId,
    conversationId: input.conversationId ?? null,
    topic,
    messageLength: message.length,
    answerLength: answer.length,
  });

  return {
    answer: answer.trim() || LOCAL_IVX_EMPTY_MESSAGE_REPLY,
    model: LOCAL_IVX_BRAIN_MODEL,
    requestId,
    topic,
    generatedAt: new Date().toISOString(),
  };
}

export function probeLocalIVXBrain(): LocalIVXBrainResponse {
  return requestLocalIVXBrain({ message: 'ready', requestId: createLocalRequestId('ivx-local-probe') });
}
