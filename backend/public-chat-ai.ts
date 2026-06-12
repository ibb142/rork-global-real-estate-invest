import { IVX_OWNER_AI_PROFILE } from '../expo/constants/ivx-owner-ai';
import { getIVXAIEndpoint, isIVXAIConfigured, requestIVXAIText, resolveIVXAIModel, type IVXAIProviderMetadata } from './ivx-ai-runtime';
import { buildBusinessContextBlock, loadBusinessContext } from './services/ivx-business-context';
import { buildDealIntelligenceBlock } from './services/ivx-deal-intelligence';
import {
  buildDocumentAnalysisInstructionBlock,
  extractDealDocuments,
  type DealDocumentAttachment,
} from './services/ivx-deal-documents';
import {
  buildExtractedDocumentContentBlock,
  extractDealDocumentsContent,
  hasReadableExtractedContent,
  type ExtractedDocument,
} from './services/ivx-deal-document-extractor';
import {
  buildImageFallbackAnswer,
  buildVisionInstructionBlock,
  extractPublicChatImages,
  type PublicChatImageAttachment,
} from './services/ivx-public-chat-vision';
import { applyReportEvidenceGate } from './services/ivx-report-evidence-gate';
import { conversationHasRealDeliverable } from './services/ivx-deliverable-store';
import type { ChatRoomMessage } from './chat-types';

export { buildImageFallbackAnswer, extractPublicChatImages, extractDealDocuments };
export type { PublicChatImageAttachment, DealDocumentAttachment };

export type PublicChatRole = 'user' | 'assistant';

export type PublicChatHistoryItem = {
  role: PublicChatRole;
  content: string;
};

export type PublicChatSource = 'chatgpt' | 'fallback';

export type PublicChatAnswerResult = {
  answer: string;
  model: string;
  source: PublicChatSource;
  endpoint: string | null;
  /** Number of image attachments the model actually received for vision analysis. */
  imageCount: number;
  providerMetadata?: IVXAIProviderMetadata;
};

const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_ITEM_LENGTH = 600;
// Full multimodal model (vision + document analysis) billed against the paid
// Vercel AI Gateway balance — not the rate-limited free-tier gpt-4o-mini.
const DEFAULT_PUBLIC_CHAT_MODEL = 'openai/gpt-4o';

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getPublicChatModel(): string {
  return resolveIVXAIModel(
    readTrimmed(process.env.PUBLIC_CHAT_MODEL) || readTrimmed(process.env.OPENAI_MODEL) || DEFAULT_PUBLIC_CHAT_MODEL,
  );
}

function getGatewayModelEndpoint(): string | null {
  return getIVXAIEndpoint(getPublicChatModel());
}

export function isPublicChatAIConfigured(): boolean {
  return isIVXAIConfigured();
}

export function getPublicChatHealthSnapshot(): {
  aiEnabled: boolean;
  openAIModel: string;
  aiProvider: 'chatgpt' | 'fallback';
  aiEndpoint: string | null;
  ivxAIArchitecture: 'ivx-ai';
  ivxAIPhase: 'phase_1';
  ivxAIRuntimeLayer: 'ivx_ai_runtime_wrapper';
} {
  const aiEnabled = isPublicChatAIConfigured();
  return {
    aiEnabled,
    openAIModel: getPublicChatModel(),
    aiProvider: aiEnabled ? 'chatgpt' : 'fallback',
    aiEndpoint: getGatewayModelEndpoint(),
    ivxAIArchitecture: 'ivx-ai',
    ivxAIPhase: 'phase_1',
    ivxAIRuntimeLayer: 'ivx_ai_runtime_wrapper',
  };
}

function sanitizeHistoryItem(item: PublicChatHistoryItem): PublicChatHistoryItem | null {
  const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
  const content = readTrimmed(item.content).slice(0, MAX_HISTORY_ITEM_LENGTH);
  if (!role || !content) {
    return null;
  }

  return {
    role,
    content,
  };
}

export function sanitizePublicChatHistory(history: PublicChatHistoryItem[]): PublicChatHistoryItem[] {
  return history
    .map(sanitizeHistoryItem)
    .filter((item): item is PublicChatHistoryItem => item !== null)
    .slice(-MAX_HISTORY_ITEMS);
}

export function mapRoomMessagesToPublicChatHistory(messages: ChatRoomMessage[]): PublicChatHistoryItem[] {
  return sanitizePublicChatHistory(
    messages.map((message) => ({
      role: message.source === 'assistant' ? 'assistant' : 'user',
      content: message.text,
    })),
  );
}

function buildTranscript(history: PublicChatHistoryItem[]): string {
  if (history.length === 0) {
    return 'No previous messages.';
  }

  return history.map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`).join('\n');
}

function buildSystemPrompt(
  sessionId: string,
  hasImages: boolean,
  documents: DealDocumentAttachment[],
  extractedContentBlock: string | null,
): string {
  const parts = [
    `You are ${IVX_OWNER_AI_PROFILE.name}, the IVX AI assistant for the IVX public chat room.`,
    'Be concise, practical, and trustworthy.',
    'Help with IVX onboarding, investing basics, product navigation, API status checks, and deployment troubleshooting.',
    'You also act as an acquisition analyst / investment-committee member: when asked, rank deals, compare projects, give a buy/hold/avoid recommendation with rationale, assess risk, and answer capital-allocation questions — always from the IVX deal-intelligence scores provided in context.',
    'Do not claim production changes, account access, AWS console actions, or billing actions were completed unless the user explicitly confirms them.',
    'If a request needs credentials, infrastructure console access, or legal approval, say that clearly and give the next safe step.',
  ];

  if (hasImages) {
    parts.push(buildVisionInstructionBlock());
  }

  if (documents.length > 0) {
    parts.push(buildDocumentAnalysisInstructionBlock(documents));
  }

  if (extractedContentBlock) {
    parts.push(extractedContentBlock);
  }

  parts.push(`Session: ${sessionId}`);
  return parts.join('\n\n');
}

export function buildFallbackAnswer(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('api') || normalized.includes('backend') || normalized.includes('health')) {
    return 'The app frontend is intended to run on chat.ivxholding.com and the API on api.ivxholding.com. If live replies fail, confirm DNS first, then check GET /health and POST /public/chat on the API host.';
  }

  if (normalized.includes('invest') || normalized.includes('real estate') || normalized.includes('property')) {
    return 'IVX is designed to make real-estate participation easier to understand. A good beginner flow is: learn the deal, review the timeline and return assumptions, understand the risks, then only invest after reading the actual documents.';
  }

  if (normalized.includes('login') || normalized.includes('sign up') || normalized.includes('account')) {
    return 'For account issues, keep the flow simple: sign up, verify your email, complete profile steps, then continue into the app. If a real account or verification issue is blocking progress, route it to human support.';
  }

  if (normalized.includes('deploy') || normalized.includes('production') || normalized.includes('ec2')) {
    return 'For a production-safe EC2 deployment, run the API behind HTTPS, keep /health live, restart the process with a supervisor, and only point chat.ivxholding.com at the exported web build after api.ivxholding.com is healthy.';
  }

  return 'I can help with IVX onboarding, beginner investing questions, product navigation, API checks, and deployment readiness. Ask one specific question and I will answer clearly.';
}

async function requestIVXAIAnswer(input: {
  message: string;
  history: PublicChatHistoryItem[];
  sessionId: string;
  businessContext: string | null;
  images: PublicChatImageAttachment[];
  documents: DealDocumentAttachment[];
  extractedDocuments: ExtractedDocument[];
}): Promise<PublicChatAnswerResult> {
  const endpoint = getGatewayModelEndpoint();
  if (!isPublicChatAIConfigured() || !endpoint) {
    throw new Error('IVX AI proxy configuration is missing.');
  }

  const promptParts = [
    'Recent public chat transcript:',
    buildTranscript(input.history),
    '',
  ];
  if (input.businessContext) {
    promptParts.push(input.businessContext, '');
  }
  if (input.images.length > 0) {
    promptParts.push(
      `Note: ${input.images.length} image attachment(s) accompany this message — analyze them as part of your answer.`,
      '',
    );
  }
  if (input.documents.length > 0) {
    promptParts.push(
      `Note: ${input.documents.length} deal-room document(s) accompany this message: ${input.documents
        .map((doc) => `${doc.name ?? doc.url} [${doc.kind}] ${doc.url}`)
        .join('; ')}. Analyze them as an acquisition analyst per the instructions above.`,
      '',
    );
  }
  const extractedContentBlock = buildExtractedDocumentContentBlock(input.extractedDocuments);
  if (extractedContentBlock) {
    promptParts.push(extractedContentBlock, '');
  }
  promptParts.push(
    `User message: ${input.message || (input.images.length > 0 ? 'Analyze the attached image(s).' : '')}`,
    '',
    'Reply directly to the user message. If the user asks for an exact token or proof string, include it exactly.',
  );

  const result = await requestIVXAIText({
    module: 'public-chat',
    requestId: input.sessionId,
    model: getPublicChatModel(),
    system: buildSystemPrompt(input.sessionId, input.images.length > 0, input.documents, extractedContentBlock),
    prompt: promptParts.join('\n'),
    images: input.images.length > 0 ? input.images : undefined,
  });

  return {
    answer: result.text,
    model: result.providerMetadata.model,
    source: 'chatgpt',
    endpoint: result.providerMetadata.endpoint,
    imageCount: input.images.length,
    providerMetadata: result.providerMetadata,
  };
}

export async function generatePublicChatAnswer(input: {
  message: string;
  history: PublicChatHistoryItem[];
  sessionId: string;
  images?: PublicChatImageAttachment[];
  documents?: DealDocumentAttachment[];
}): Promise<PublicChatAnswerResult> {
  const history = sanitizePublicChatHistory(input.history);
  const images = (input.images ?? [])
    .map((img) => ({ url: typeof img.url === 'string' ? img.url.trim() : '', mimeType: img.mimeType ?? null }))
    .filter((img) => img.url.length > 0);
  const documents = (input.documents ?? []).filter((doc) => typeof doc.url === 'string' && doc.url.trim().length > 0);

  // BLOCK 62 — Report Evidence Gate. `/public/chat` (the endpoint the in-app
  // Chat tab AND the IVX Owner AI chat fall back to) had NO fake-deliverable
  // gate, so report claims like "10,000 Buyers Report is ready" with placeholder
  // links `[Buyers Report](#)` flowed through ungated. Gate every answer: a
  // report-completion claim is allowed only when a real, download-verified
  // deliverable exists for this conversation; otherwise the answer is rewritten
  // to an honest REPORT NOT READY message. Never throws into the reply.
  const gateAnswer = async (result: PublicChatAnswerResult): Promise<PublicChatAnswerResult> => {
    let hasRealDeliverable = false;
    try {
      hasRealDeliverable = await conversationHasRealDeliverable(input.sessionId);
    } catch (gateError) {
      console.log('[PublicChatAI] Deliverable check skipped:', gateError instanceof Error ? gateError.message : 'unknown');
    }
    const gate = applyReportEvidenceGate({ answer: result.answer, hasRealDeliverable });
    if (gate.gated) {
      console.log('[PublicChatAI] Report Evidence Gate blocked a fake-completion claim:', {
        sessionId: input.sessionId,
        violations: gate.violations,
        hasRealDeliverable,
      });
      return { ...result, answer: gate.answer };
    }
    return result;
  };

  // BLOCK 2 — load full IVX business context automatically for EVERY conversation
  // (projects, deal data, company, landing page, owner) so questions like
  // "What is Casa Rosario?" are answered from real business data without a
  // manual lookup. Never blocks the reply if the project read fails.
  // BLOCK 4 — alongside business context, compute the deal-intelligence block
  // (scores, ranking, recommendations, risks) so analytical questions answer
  // from one consistent set of numbers.
  let businessContext: string | null = null;
  try {
    const context = await loadBusinessContext();
    const baseBlock = buildBusinessContextBlock(context);
    const dealIntel = buildDealIntelligenceBlock(context.projects);
    businessContext = dealIntel ? `${baseBlock}\n\n${dealIntel}` : baseBlock;
    console.log('[PublicChatAI] Business context loaded:', {
      projectsOk: context.projects.ok,
      publishedCount: context.projects.publishedCount,
      dealIntelligence: dealIntel !== null,
      missingEnv: context.projects.missingEnv,
      company: context.company.name,
      landing: context.landing.url,
      ownerKnown: context.owner.email !== null,
    });
  } catch (contextError) {
    console.log('[PublicChatAI] Business context skipped:', contextError instanceof Error ? contextError.message : 'unknown');
  }

  // BLOCK 5 — read the attached deal-room documents server-side (PDF text layer,
  // CSV/TXT) so the analyst instructions operate on REAL figures instead of an
  // unreadable URL. Scanned/image-only PDFs are flagged honestly. Never blocks
  // the reply if extraction fails.
  let extractedDocuments: ExtractedDocument[] = [];
  if (documents.length > 0) {
    try {
      extractedDocuments = await extractDealDocumentsContent(documents);
      console.log('[PublicChatAI] Deal documents extracted:', {
        total: extractedDocuments.length,
        readable: extractedDocuments.filter((doc) => doc.status === 'extracted').length,
        scanned: extractedDocuments.filter((doc) => doc.status === 'scanned').length,
        failed: extractedDocuments.filter((doc) => doc.status === 'failed').length,
        hasReadable: hasReadableExtractedContent(extractedDocuments),
      });
    } catch (extractionError) {
      console.log('[PublicChatAI] Document extraction skipped:', extractionError instanceof Error ? extractionError.message : 'unknown');
    }
  }

  try {
    if (isPublicChatAIConfigured()) {
      const result = await requestIVXAIAnswer({
        message: input.message,
        history,
        sessionId: input.sessionId,
        businessContext,
        images,
        documents,
        extractedDocuments,
      });
      console.log('[PublicChatAI] IVX AI reply generated:', {
        model: result.model,
        endpoint: result.endpoint,
        historyCount: history.length,
        answerLength: result.answer.length,
        imageCount: result.imageCount,
        documentCount: documents.length,
        extractedDocumentCount: extractedDocuments.filter((doc) => doc.status === 'extracted').length,
      });
      return await gateAnswer(result);
    }
  } catch (error) {
    console.log('[PublicChatAI] IVX AI request failed, falling back:', error instanceof Error ? error.message : 'unknown');
  }

  return await gateAnswer({
    answer: images.length > 0 ? buildImageFallbackAnswer() : buildFallbackAnswer(input.message),
    model: isPublicChatAIConfigured() ? getPublicChatModel() : 'ivx-local-fallback',
    source: 'fallback',
    endpoint: getGatewayModelEndpoint(),
    imageCount: images.length,
  });
}

export function buildPublicChatTranscript(history: PublicChatHistoryItem[]): string {
  return buildTranscript(sanitizePublicChatHistory(history));
}
