import { Platform } from 'react-native';
import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import type { ChatMessage } from '@/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { fetchCanonicalDeals } from './canonical-deals';
import { CANONICAL_CLAIMS } from './published-deal-card-model';

const TOOLKIT_URL = (process.env.EXPO_PUBLIC_TOOLKIT_URL || '').trim();
const AI_ENDPOINT = process.env.EXPO_PUBLIC_AI_ENDPOINT || '';
const PROVIDER_TIMEOUT_MS = 12_000;
const PROVIDER_COOLDOWN_MS = 45_000;
const RESPONSE_CACHE_TTL_MS = 1000 * 60 * 2;
const MAX_RESPONSE_CACHE_ENTRIES = 60;
const MAX_CONTEXT_MESSAGES = 8;

export type AIProviderStatus = 'active' | 'failed' | 'idle';

interface AIProvider {
  id: string;
  name: string;
  priority: number;
  status: AIProviderStatus;
  failCount: number;
  lastError: string | null;
  lastUsed: number;
  cooldownUntil: number;
  generate: (prompt: string, context: InvestorContext) => Promise<string>;
}

interface InvestorContext {
  language: string;
  investorName?: string;
  investmentInterest?: string;
  deals: DealSummary[];
  platformInfo: string;
  conversationSummary?: string;
}

interface DealSummary {
  title: string;
  expectedROI: number;
  minInvestment: number;
  timeline: string;
  city: string;
  state: string;
  dealType: string;
  exitStrategy: string;
}

interface CachedAIResponse {
  result: AIResponseResult;
  timestamp: number;
}

interface AIResponseResult {
  text: string;
  provider: string;
  language: string;
  failovers: number;
}

const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  es: [/\b(hola|cómo|quiero|invertir|dinero|cuánto|gracias|buenos días|buenas tardes|por favor|dónde|necesito|interesado|inversión|ganar|retorno)\b/i],
  pt: [/\b(olá|como|quero|investir|dinheiro|quanto|obrigado|bom dia|por favor|onde|preciso|interessado|investimento|ganhar|retorno)\b/i],
  fr: [/\b(bonjour|comment|veux|investir|argent|combien|merci|s'il vous plaît|où|besoin|intéressé|investissement|gagner|rendement)\b/i],
  de: [/\b(hallo|wie|möchte|investieren|geld|wieviel|danke|bitte|wo|brauche|interessiert|investition|verdienen|rendite)\b/i],
  zh: [/[\u4e00-\u9fff]/],
  ja: [/[\u3040-\u309f\u30a0-\u30ff]/],
  ko: [/[\uac00-\ud7af]/],
  ar: [/[\u0600-\u06ff]/],
  hi: [/[\u0900-\u097f]/],
  ru: [/[\u0400-\u04ff]/],
};

export function detectLanguage(text: string): string {
  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        console.log('[AIInvestor] Language detected:', lang, 'from text:', text.substring(0, 30));
        return lang;
      }
    }
  }
  return 'en';
}

function getLanguageInstruction(lang: string): string {
  const instructions: Record<string, string> = {
    es: 'Responde SIEMPRE en español. Usa un tono profesional y amigable.',
    pt: 'Responda SEMPRE em português. Use um tom profissional e amigável.',
    fr: 'Répondez TOUJOURS en français. Utilisez un ton professionnel et amical.',
    de: 'Antworten Sie IMMER auf Deutsch. Verwenden Sie einen professionellen und freundlichen Ton.',
    zh: '请始终用中文回答。使用专业友好的语气。',
    ja: '常に日本語で回答してください。プロフェッショナルでフレンドリーなトーンを使用してください。',
    ko: '항상 한국어로 답변하세요. 전문적이고 친근한 톤을 사용하세요.',
    ar: 'أجب دائمًا باللغة العربية. استخدم نبرة مهنية وودية.',
    hi: 'हमेशा हिंदी में जवाब दें। पेशेवर और मैत्रीपूर्ण स्वर का प्रयोग करें।',
    ru: 'Всегда отвечайте на русском языке. Используйте профессиональный и дружелюбный тон.',
    en: 'Respond in English. Use a professional and friendly tone.',
  };
  return instructions[lang] || instructions.en;
}

function buildConversationSummary(conversationHistory: ChatMessage[]): string {
  return conversationHistory
    .filter((message) => message.message.trim().length > 0)
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => `${message.isSupport ? 'Assistant' : 'User'}: ${message.message.trim()}`)
    .join('\n');
}

async function loadDealsContext(): Promise<DealSummary[]> {
  try {
    const result = await fetchCanonicalDeals();
    if (result.deals.length > 0) {
      return result.deals.map((deal) => ({
        title: deal.title,
        expectedROI: deal.expectedROI,
        minInvestment: deal.minInvestment,
        timeline: deal.timeline,
        city: deal.city,
        state: deal.state,
        dealType: deal.dealType,
        exitStrategy: deal.exitStrategy,
      }));
    }
  } catch (err) {
    console.log('[AIInvestor] Failed to load deals:', (err as Error)?.message);
  }
  return [];
}

function buildSystemPrompt(context: InvestorContext): string {
  const langInstruction = getLanguageInstruction(context.language);
  const dealsInfo = context.deals.length > 0
    ? `\n\nCURRENT INVESTMENT OPPORTUNITIES:\n${context.deals.map((deal, index) => `${index + 1}. ${deal.title} — ${deal.dealType} in ${deal.city}, ${deal.state}\n   Expected ROI: ${deal.expectedROI}% | Min Investment: ${deal.minInvestment} | Timeline: ${deal.timeline}\n   Exit Strategy: ${deal.exitStrategy}`).join('\n')}`
    : '';
  const conversationInfo = context.conversationSummary
    ? `\n\nRECENT CONVERSATION CONTEXT:\n${context.conversationSummary}`
    : '';

  return `You are the IVX Holdings AI support assistant for investor guidance, product support, and technical triage.

${langInstruction}

CORE RESPONSIBILITIES:
- Help with investing, live deals, member onboarding, KYC, dividends, withdrawals, and account-access questions.
- Answer high-level technical questions about the IVX mobile and web frontend, backend services, Supabase auth and data flows, AWS S3 and CloudFront usage, and ChatGPT or OpenAI-style AI chat integrations.
- Explain what the platform already supports, what the next safest implementation or debugging step should be, and when human escalation is still required.
- When users ask for code or infrastructure help, give practical implementation guidance, but never claim that production code was changed, deployed, repaired, or approved automatically from this chat alone.

PLATFORM FACTS:
- Platform: ${CANONICAL_CLAIMS.platformName}
- Minimum investment: ${CANONICAL_CLAIMS.minInvestmentLabel}
- Distribution: ${CANONICAL_CLAIMS.distributionFrequency}
- ${CANONICAL_CLAIMS.riskDisclaimer}
- ${CANONICAL_CLAIMS.complianceNote}
- Frontend: Expo / React Native application with shared landing and app support chat flows across mobile and web.
- Backend: Supabase-backed data, auth, edge-function, and support-ticket workflows.
- AWS: S3 object storage and CloudFront delivery are used for media and distribution workflows.
- AI support: the platform uses a configured AI provider chain to answer investor, platform, and technical-support questions.
- ChatGPT-style integrations: the platform can support approved OpenAI or toolkit-backed chat experiences, but releases and production control still require human approval.
${dealsInfo}${conversationInfo}

RULES:
1. Always be transparent about risks, incidents, and platform limits.
2. Never guarantee returns, uptime, or automatic bug fixing.
3. Present actual deals when available.
4. For sensitive account, payment, security, or production issues, recommend human support escalation.
5. If a user asks whether AI can fully replace engineers or auto-fix the stack end to end, answer honestly that AI can assist, diagnose, and draft guidance, but human review is still required for production changes.
6. For technical questions, clearly state what the stack supports now, what to check next, and whether escalation is needed.
7. Detect the user's language and respond in that language.
8. Be concise, direct, and useful.
${context.investorName ? `\nInvestor name: ${context.investorName}` : ''}
${context.investmentInterest ? `\nInvestment interest: ${context.investmentInterest}` : ''}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function buildRequestKey(
  userMessage: string,
  language: string,
  investorName?: string,
  investmentInterest?: string,
  conversationSummary?: string
): string {
  const normalizedMessage = userMessage.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedName = investorName?.trim().toLowerCase() ?? '';
  const normalizedInterest = investmentInterest?.trim().toLowerCase() ?? '';
  const normalizedConversation = conversationSummary?.trim().toLowerCase().replace(/\s+/g, ' ').slice(-320) ?? '';
  return [language, normalizedName, normalizedInterest, normalizedConversation, normalizedMessage].join('|');
}

function createProvider1_RorkToolkit(): AIProvider {
  return {
    id: 'rork_toolkit',
    name: 'Rork AI Toolkit',
    priority: 1,
    status: 'idle',
    failCount: 0,
    lastError: null,
    lastUsed: 0,
    cooldownUntil: 0,
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      if (!TOOLKIT_URL) {
        throw new Error('Toolkit URL not configured');
      }

      const systemPrompt = buildSystemPrompt(context);
      const result = await toolkitGenerateText({
        messages: [
          { role: 'user', content: `${systemPrompt}\n\nUser message: ${prompt}` },
        ],
      });

      if (!result || result.length === 0) {
        throw new Error('Empty response from Rork toolkit');
      }

      return result;
    },
  };
}

function createProvider2_SupabaseEdge(): AIProvider {
  return {
    id: 'supabase_edge',
    name: 'Supabase Edge Function',
    priority: 2,
    status: 'idle',
    failCount: 0,
    lastError: null,
    lastUsed: 0,
    cooldownUntil: 0,
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured');
      }

      const systemPrompt = buildSystemPrompt(context);
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: { prompt: `${systemPrompt}\n\nUser: ${prompt}`, type: 'text' },
      });

      if (error) {
        throw new Error(error.message);
      }

      return data?.text || data?.result || '';
    },
  };
}

function createProvider3_CustomEndpoint(): AIProvider {
  return {
    id: 'custom_endpoint',
    name: 'Custom AI Endpoint',
    priority: 3,
    status: 'idle',
    failCount: 0,
    lastError: null,
    lastUsed: 0,
    cooldownUntil: 0,
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      if (!AI_ENDPOINT) {
        throw new Error('AI endpoint not configured');
      }

      const systemPrompt = buildSystemPrompt(context);
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${systemPrompt}\n\nUser: ${prompt}`,
          type: 'text',
          language: context.language,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.text || data.result || '';
    },
  };
}

function createProvider4_SmartFallback(): AIProvider {
  return {
    id: 'smart_fallback',
    name: 'Smart Local Fallback',
    priority: 4,
    status: 'idle',
    failCount: 0,
    lastError: null,
    lastUsed: 0,
    cooldownUntil: 0,
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      return generateSmartFallback(prompt, context);
    },
  };
}

function generateSmartFallback(prompt: string, context: InvestorContext): string {
  const lower = prompt.toLowerCase();
  const lang = context.language;
  const dealsText = context.deals.length > 0
    ? context.deals.map((deal) => `• ${deal.title} — ${deal.expectedROI}% ROI, min ${deal.minInvestment}, ${deal.timeline}`).join('\n')
    : '';

  const responses: Record<string, Record<string, string>> = {
    invest: {
      en: `IVX Holdings offers fractional real estate ownership starting at ${CANONICAL_CLAIMS.minInvestmentLabel}. ${CANONICAL_CLAIMS.distributionFrequency} distributions.${dealsText ? '\n\nCurrent opportunities:\n' + dealsText : ''}\n\nReview the deal terms carefully before committing.`,
      es: `IVX Holdings ofrece propiedad fraccionaria de bienes raíces desde ${CANONICAL_CLAIMS.minInvestmentLabel}. Distribuciones ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}.${dealsText ? '\n\nOportunidades actuales:\n' + dealsText : ''}\n\nRevise los términos de cada oferta antes de comprometer capital.`,
      pt: `IVX Holdings oferece propriedade fracionária de imóveis a partir de ${CANONICAL_CLAIMS.minInvestmentLabel}. Distribuições ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}.${dealsText ? '\n\nOportunidades atuais:\n' + dealsText : ''}\n\nRevise os termos da oferta antes de investir.`,
      fr: `IVX Holdings propose la propriété fractionnée immobilière à partir de ${CANONICAL_CLAIMS.minInvestmentLabel}. Distributions ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}.${dealsText ? '\n\nOpportunités actuelles:\n' + dealsText : ''}\n\nConsultez les documents de l'offre avant tout engagement.`,
    },
    withdraw: {
      en: 'Dividends are distributed monthly and can be withdrawn when available. Processing typically takes 3-5 business days to the linked payout destination.',
      es: 'Los dividendos se distribuyen mensualmente y se pueden retirar cuando estén disponibles. El procesamiento suele tardar 3-5 días hábiles.',
      pt: 'Os dividendos são distribuídos mensalmente e podem ser retirados quando disponíveis. O processamento normalmente leva 3-5 dias úteis.',
      fr: 'Les dividendes sont distribués mensuellement et peuvent être retirés lorsqu’ils sont disponibles. Le traitement prend généralement 3 à 5 jours ouvrés.',
    },
    waitlist: {
      en: 'You can join the investor intake by sharing your contact information, investment goals, and availability for follow-up. The IVX team reviews eligibility before live allocation access is opened.',
      es: 'Puede unirse al proceso de acceso del inversor compartiendo su información de contacto, objetivos de inversión y disponibilidad para seguimiento. El equipo de IVX revisa la elegibilidad antes de abrir el acceso.',
      pt: 'Você pode entrar no processo de acesso do investidor compartilhando seus dados de contato, objetivos de investimento e disponibilidade para acompanhamento. A equipe IVX revisa a elegibilidade antes de liberar o acesso.',
      fr: 'Vous pouvez rejoindre le parcours d’accès investisseur en partageant vos coordonnées, vos objectifs d’investissement et vos disponibilités. L’équipe IVX examine l’éligibilité avant d’ouvrir l’accès.',
    },
    technical: {
      en: 'The IVX stack supports shared Expo and React Native frontend flows, Supabase-backed backend workflows, AWS S3 and CloudFront delivery, and an AI support layer for guided answers. I can explain the architecture, outline debugging steps, and help triage a technical issue, but production code changes still require human review and release control.',
      es: 'La plataforma IVX combina frontend compartido con Expo y React Native, flujos backend sobre Supabase, entrega con AWS S3 y CloudFront, y una capa de soporte con IA. Puedo explicar la arquitectura, sugerir pasos de diagnóstico y ayudar a clasificar un problema técnico, pero los cambios en producción aún requieren revisión humana.',
      pt: 'A plataforma IVX combina frontend compartilhado em Expo e React Native, fluxos backend em Supabase, entrega com AWS S3 e CloudFront e uma camada de suporte com IA. Posso explicar a arquitetura, sugerir passos de depuração e ajudar na triagem, mas mudanças em produção ainda exigem revisão humana.',
      fr: 'La plateforme IVX combine un frontend partagé Expo et React Native, des flux backend avec Supabase, la diffusion via AWS S3 et CloudFront, et une couche de support IA. Je peux expliquer l’architecture, proposer des étapes de diagnostic et aider au triage, mais les changements en production exigent toujours une validation humaine.',
    },
    frontend: {
      en: 'For frontend support, IVX uses Expo and React Native across app and landing flows. The usual checks are route state, screen-level errors, keyboard and safe-area layout, web compatibility, and API response handling. I can help narrow the issue and suggest the next implementation step.',
      es: 'Para soporte frontend, IVX usa Expo y React Native en la app y el flujo público. Normalmente se revisan estado de rutas, errores de pantalla, teclado y safe area, compatibilidad web y manejo de respuestas API. Puedo ayudar a acotar el problema y sugerir el siguiente paso.',
      pt: 'Para suporte frontend, a IVX usa Expo e React Native no app e no fluxo público. Os pontos mais comuns são estado de rotas, erros de tela, teclado e safe area, compatibilidade web e tratamento de respostas de API. Posso ajudar a isolar o problema e sugerir o próximo passo.',
      fr: 'Pour le support frontend, IVX utilise Expo et React Native sur l’app et le flux public. Les vérifications habituelles concernent l’état des routes, les erreurs d’écran, le clavier et la safe area, la compatibilité web et la gestion des réponses API. Je peux aider à isoler le problème et proposer l’étape suivante.',
    },
    backend: {
      en: 'For backend support, IVX relies on Supabase for auth, data, and support workflows. The first checks are auth state, row-level access, function execution, request payloads, and database writes. I can help frame the likely failure point and what to inspect next.',
      es: 'Para soporte backend, IVX depende de Supabase para autenticación, datos y flujos de soporte. Primero conviene revisar estado de autenticación, acceso por filas, ejecución de funciones, payloads y escrituras en base de datos. Puedo ayudar a ubicar el punto probable de falla y qué revisar después.',
      pt: 'Para suporte backend, a IVX depende do Supabase para autenticação, dados e fluxos de suporte. Vale revisar primeiro estado de autenticação, acesso por linhas, execução de funções, payloads e gravações no banco. Posso ajudar a identificar o ponto provável de falha e o que verificar em seguida.',
      fr: 'Pour le support backend, IVX s’appuie sur Supabase pour l’authentification, les données et les flux de support. Il faut d’abord vérifier l’état d’auth, les règles d’accès, l’exécution des fonctions, les payloads et les écritures en base. Je peux aider à identifier le point de panne probable et la suite à contrôler.',
    },
    aws: {
      en: 'For AWS support, IVX uses S3 for storage and CloudFront for delivery. The main checks are bucket permissions, object paths, cache invalidation, public asset URLs, and origin configuration. I can help map the likely issue, but production changes still need human approval.',
      es: 'Para soporte AWS, IVX usa S3 para almacenamiento y CloudFront para entrega. Las revisiones principales son permisos del bucket, rutas de objetos, invalidación de caché, URLs públicas y configuración del origen. Puedo ayudar a identificar el problema probable, pero los cambios en producción siguen requiriendo aprobación humana.',
      pt: 'Para suporte AWS, a IVX usa S3 para armazenamento e CloudFront para entrega. As verificações principais são permissões do bucket, caminhos dos objetos, invalidação de cache, URLs públicas e configuração de origem. Posso ajudar a mapear o problema provável, mas mudanças em produção ainda exigem aprovação humana.',
      fr: 'Pour le support AWS, IVX utilise S3 pour le stockage et CloudFront pour la diffusion. Les vérifications principales portent sur les permissions du bucket, les chemins d’objet, l’invalidation du cache, les URL publiques et la configuration d’origine. Je peux aider à cadrer le problème probable, mais les changements en production exigent toujours une validation humaine.',
    },
    chatgpt: {
      en: 'For ChatGPT or OpenAI integration questions, the safest pattern is a controlled backend or approved toolkit layer, clear prompt rules, rate limits, error fallbacks, and human-governed releases. I can outline the integration approach and support flow, but I should not claim autonomous deployment or self-healing code.',
      es: 'Para preguntas sobre integración con ChatGPT u OpenAI, el patrón más seguro es una capa backend controlada o un toolkit aprobado, reglas claras de prompt, límites de uso, respuestas de fallback y lanzamientos gobernados por humanos. Puedo explicar el enfoque, pero no debo afirmar despliegue autónomo ni código que se autorepara.',
      pt: 'Para perguntas sobre integração com ChatGPT ou OpenAI, o padrão mais seguro é uma camada backend controlada ou toolkit aprovado, regras claras de prompt, limites, fallbacks e releases governados por humanos. Posso explicar a abordagem, mas não devo afirmar deploy autônomo nem código que se auto corrige.',
      fr: 'Pour les questions sur l’intégration ChatGPT ou OpenAI, le schéma le plus sûr passe par une couche backend contrôlée ou un toolkit approuvé, des règles de prompt claires, des limites d’usage, des fallbacks et des mises en production validées par des humains. Je peux décrire l’approche, mais je ne dois pas prétendre à un déploiement autonome ni à du code auto-réparé.',
    },
    automation: {
      en: 'AI can help draft code, explain frontend and backend architecture, support AWS troubleshooting, and answer technical questions 24/7. It should not be presented as having full autonomous control over production fixes, releases, or infrastructure without human review.',
      es: 'La IA puede ayudar a redactar código, explicar arquitectura frontend y backend, apoyar el diagnóstico en AWS y responder preguntas técnicas 24/7. No debe presentarse como si tuviera control autónomo total sobre correcciones, despliegues o infraestructura sin revisión humana.',
      pt: 'A IA pode ajudar a redigir código, explicar arquitetura frontend e backend, apoiar troubleshooting em AWS e responder perguntas técnicas 24/7. Ela não deve ser apresentada como tendo controle autônomo total sobre correções, releases ou infraestrutura sem revisão humana.',
      fr: 'L’IA peut aider à rédiger du code, expliquer l’architecture frontend et backend, assister le diagnostic AWS et répondre aux questions techniques 24/7. Elle ne doit pas être présentée comme disposant d’un contrôle autonome total sur les correctifs, les releases ou l’infrastructure sans validation humaine.',
    },
    support: {
      en: 'I can help with account access, KYC, onboarding, wallet readiness, payout questions, and technical triage. If the issue affects live funds, account security, or a production incident, request human support so the team can review your case directly.',
      es: 'Puedo ayudar con acceso a la cuenta, KYC, incorporación, preparación de billetera, pagos y diagnóstico técnico. Si el problema afecta fondos, seguridad o un incidente de producción, solicite soporte humano.',
      pt: 'Posso ajudar com acesso à conta, KYC, onboarding, preparação da carteira, saques e triagem técnica. Se o problema afetar fundos, segurança ou um incidente de produção, solicite suporte humano.',
      fr: 'Je peux aider pour l’accès au compte, le KYC, l’onboarding, la préparation du portefeuille, les paiements et le diagnostic technique. Si le problème touche les fonds, la sécurité ou un incident de production, demandez une assistance humaine.',
    },
    ai: {
      en: 'The AI chat module can answer investor, product, and technical-support questions, including frontend, backend, AWS, and integration topics. It can guide, triage, and draft recommendations, but it should not claim that code or infrastructure was changed automatically without human approval.',
      es: 'El módulo de chat con IA puede responder preguntas de inversión, producto y soporte técnico, incluyendo frontend, backend, AWS e integraciones. Puede orientar, clasificar incidencias y sugerir acciones, pero no debe afirmar que cambió código o infraestructura automáticamente sin aprobación humana.',
      pt: 'O módulo de chat com IA pode responder perguntas de investimento, produto e suporte técnico, incluindo frontend, backend, AWS e integrações. Ele pode orientar, fazer triagem e sugerir ações, mas não deve afirmar que alterou código ou infraestrutura automaticamente sem aprovação humana.',
      fr: 'Le module de chat IA peut répondre aux questions d’investissement, de produit et de support technique, y compris sur le frontend, le backend, AWS et les intégrations. Il peut guider, aider au triage et proposer des recommandations, mais il ne doit pas prétendre avoir modifié le code ou l’infrastructure automatiquement sans validation humaine.',
    },
    default: {
      en: `I can help with investing, account support, product questions, and technical triage across the IVX platform. ${CANONICAL_CLAIMS.riskDisclaimer} For direct follow-up, request human support or contact investors@ivxholding.com.`,
      es: `Puedo ayudar con inversión, soporte de cuenta, preguntas del producto y diagnóstico técnico dentro de IVX. ${CANONICAL_CLAIMS.riskDisclaimer} Para seguimiento directo, solicite soporte humano o escriba a investors@ivxholding.com.`,
      pt: `Posso ajudar com investimento, suporte de conta, perguntas sobre o produto e triagem técnica na IVX. ${CANONICAL_CLAIMS.riskDisclaimer} Para acompanhamento direto, solicite suporte humano ou envie e-mail para investors@ivxholding.com.`,
      fr: `Je peux aider pour l’investissement, le support de compte, les questions produit et le diagnostic technique sur IVX. ${CANONICAL_CLAIMS.riskDisclaimer} Pour un suivi direct, demandez une assistance humaine ou contactez investors@ivxholding.com.`,
    },
  };

  let category = 'default';

  if (/fix itself|fix automatically|automatic fix|auto fix|self heal|self-heal|autonomous|replace engineers|no human|full control|100% capacity|develop code for me/i.test(lower)) {
    category = 'automation';
  } else if (/chatgpt|openai|gpt|assistant|ai chat|ai module|integration ai|integrate ai/i.test(lower)) {
    category = 'chatgpt';
  } else if (/aws|amazon|s3|cloudfront|bucket|cdn/i.test(lower)) {
    category = 'aws';
  } else if (/backend|api|server|database|supabase|auth|edge function|webhook/i.test(lower)) {
    category = 'backend';
  } else if (/frontend|ui|screen|mobile app|landing page|expo|react native|web app|keyboard|tab bar|layout/i.test(lower)) {
    category = 'frontend';
  } else if (/ai support|ai module|assistant/i.test(lower)) {
    category = 'ai';
  } else if (/technical|deploy|deployment|code|bug|crash|incident|infrastructure|architecture|integration/i.test(lower)) {
    category = 'technical';
  } else if (/support|help|login|account|kyc|wallet|ticket|issue|problem|error/i.test(lower)) {
    category = 'support';
  } else if (/invest|buy|purchase|comprar|acheter|shares|stock|trade|deal|opportunity|property|propert|imóve|inmueble|bien/i.test(lower)) {
    category = 'invest';
  } else if (/withdraw|dividend|retir|payout|cash out/i.test(lower)) {
    category = 'withdraw';
  } else if (/waitlist|wait list|lista|join|sign up|registr/i.test(lower)) {
    category = 'waitlist';
  }

  const categoryResponses = responses[category] || responses.default;
  return categoryResponses[lang] || categoryResponses.en || responses.default.en;
}

class AIInvestorService {
  private providers: AIProvider[] = [];
  private initialized = false;
  private currentContext: InvestorContext | null = null;
  private totalRequests = 0;
  private totalFailovers = 0;
  private responseCache = new Map<string, CachedAIResponse>();
  private inflightRequests = new Map<string, Promise<AIResponseResult>>();

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.providers = [
      createProvider1_RorkToolkit(),
      createProvider2_SupabaseEdge(),
      createProvider3_CustomEndpoint(),
      createProvider4_SmartFallback(),
    ];

    const deals = await loadDealsContext();
    this.currentContext = {
      language: 'en',
      deals,
      platformInfo: `${CANONICAL_CLAIMS.platformName} | ${Platform.OS}`,
    };

    console.log('[AIInvestor] Initialized with', this.providers.length, 'providers |', deals.length, 'deals loaded');
  }

  private getCachedResponse(key: string): AIResponseResult | null {
    const cached = this.responseCache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.timestamp > RESPONSE_CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return null;
    }

    console.log('[AIInvestor] Response cache hit for key:', key.slice(0, 40));
    return cached.result;
  }

  private setCachedResponse(key: string, result: AIResponseResult): void {
    this.pruneResponseCache();
    this.responseCache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  private pruneResponseCache(): void {
    const now = Date.now();

    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > RESPONSE_CACHE_TTL_MS) {
        this.responseCache.delete(key);
      }
    }

    if (this.responseCache.size <= MAX_RESPONSE_CACHE_ENTRIES) {
      return;
    }

    const orderedKeys = [...this.responseCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .map(([key]) => key);

    const keysToDelete = orderedKeys.slice(0, this.responseCache.size - MAX_RESPONSE_CACHE_ENTRIES);
    keysToDelete.forEach((key) => {
      this.responseCache.delete(key);
    });
  }

  private getProvidersToTry(): AIProvider[] {
    const sortedProviders = [...this.providers].sort((a, b) => a.priority - b.priority);
    const now = Date.now();
    const availableProviders = sortedProviders.filter((provider) => provider.cooldownUntil <= now);

    if (availableProviders.length > 0) {
      return availableProviders;
    }

    console.log('[AIInvestor] All providers are cooling down, retrying full chain');
    return sortedProviders;
  }

  private async executeProviderChain(userMessage: string, context: InvestorContext): Promise<AIResponseResult> {
    let failovers = 0;

    for (const provider of this.getProvidersToTry()) {
      try {
        console.log(`[AIInvestor] Trying provider ${provider.priority}: ${provider.name}`);
        const startTime = Date.now();
        const text = await withTimeout(provider.generate(userMessage, context), PROVIDER_TIMEOUT_MS, provider.name);

        if (!text || text.trim().length === 0) {
          throw new Error('Empty response');
        }

        provider.status = 'active';
        provider.failCount = 0;
        provider.lastError = null;
        provider.lastUsed = Date.now();
        provider.cooldownUntil = 0;

        const latency = Date.now() - startTime;
        console.log(`[AIInvestor] Success via ${provider.name} (${latency}ms, lang: ${context.language})`);

        return {
          text,
          provider: provider.name,
          language: context.language,
          failovers,
        };
      } catch (err) {
        provider.status = 'failed';
        provider.failCount += 1;
        provider.lastError = (err as Error)?.message ?? 'Unknown error';
        provider.lastUsed = Date.now();
        failovers += 1;
        this.totalFailovers += 1;

        if (provider.id !== 'smart_fallback' && provider.failCount >= 2) {
          provider.cooldownUntil = Date.now() + PROVIDER_COOLDOWN_MS;
        }

        console.warn(`[AIInvestor] Provider ${provider.name} failed (attempt ${provider.failCount}):`, provider.lastError);
      }
    }

    console.error('[AIInvestor] ALL providers failed. Using emergency fallback.');
    return {
      text: generateSmartFallback(userMessage, context),
      provider: 'emergency_fallback',
      language: context.language,
      failovers,
    };
  }

  async generateResponse(
    userMessage: string,
    investorName?: string,
    investmentInterest?: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<AIResponseResult> {
    if (!this.initialized) {
      await this.init();
    }

    this.totalRequests += 1;

    const language = detectLanguage(userMessage);
    const deals = this.currentContext?.deals || [];
    const conversationSummary = buildConversationSummary(conversationHistory);
    const context: InvestorContext = {
      language,
      investorName,
      investmentInterest,
      deals,
      platformInfo: `${CANONICAL_CLAIMS.platformName} | ${Platform.OS}`,
      conversationSummary,
    };

    const requestKey = buildRequestKey(userMessage, language, investorName, investmentInterest, conversationSummary);
    const cachedResponse = this.getCachedResponse(requestKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const inflightRequest = this.inflightRequests.get(requestKey);
    if (inflightRequest) {
      console.log('[AIInvestor] Reusing inflight response for key:', requestKey.slice(0, 40));
      return inflightRequest;
    }

    const request = this.executeProviderChain(userMessage, context)
      .then((result) => {
        this.setCachedResponse(requestKey, result);
        return result;
      })
      .finally(() => {
        this.inflightRequests.delete(requestKey);
      });

    this.inflightRequests.set(requestKey, request);
    return request;
  }

  async refreshDeals(): Promise<void> {
    const deals = await loadDealsContext();
    if (this.currentContext) {
      this.currentContext.deals = deals;
    }
    this.responseCache.clear();
    console.log('[AIInvestor] Deals refreshed:', deals.length);
  }

  getProviderHealth(): Array<{
    id: string;
    name: string;
    priority: number;
    status: AIProviderStatus;
    failCount: number;
    lastError: string | null;
  }> {
    return this.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      priority: provider.priority,
      status: provider.status,
      failCount: provider.failCount,
      lastError: provider.lastError,
    }));
  }

  getStats(): {
    totalRequests: number;
    totalFailovers: number;
    providersCount: number;
    dealsLoaded: number;
  } {
    return {
      totalRequests: this.totalRequests,
      totalFailovers: this.totalFailovers,
      providersCount: this.providers.length,
      dealsLoaded: this.currentContext?.deals.length ?? 0,
    };
  }
}

export const aiInvestorService = new AIInvestorService();
export default aiInvestorService;
