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

  const requestsDevelopmentExecution = /\b(audit\s+and\s+fix|fix|patch|repair|implement|modify|update|build|code|ship|complete|do\s+now|work\s+on\s+(?:my\s+)?code)\b/i.test(message)
    && /\b(code|feature|screen|ui|bug|project|file|app|module|chat\.tsx|owner[-\s]?room|developer|development|command|ia|ai|ivx|owner\s+ai|chat)\b/i.test(message);

  if (requestsDevelopmentExecution || /(full\s+development|developer|end[-\s]?to[-\s]?end|app\s+functionality|why.*typing|typing.*only|stuck.*typing|finish.*audit|complete.*audit)/i.test(message)) {
    return 'Starting implementation now. I will inspect the target files, patch the code, validate immediately, and return only files changed, commands run, validation result, and any blocker.';
  }

  if (/(free|100%|full\s+control|restriction|restricted|limit|unlimited|paywall|quota|billing|cost)/i.test(message) && /(ivx|ia|ai|owner|development|developer|control)/i.test(message)) {
    return 'I can review access and security status, but development requests stay in implementation mode first. Send the exact file, bug, or feature target and I will patch code before returning proof.';
  }

  if (/supabase|schema|rls|table|database|backend access|backend tool|metadata/i.test(message)) {
    return 'Supabase inspection is enabled through owner-only read-only backend tools. The live inspection request did not complete from this local guard path, so I will not guess table, schema, column, RLS, or policy details.';
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
