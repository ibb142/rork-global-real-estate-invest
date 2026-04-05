import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { fetchCanonicalDeals } from './canonical-deals';
import { CANONICAL_CLAIMS } from './published-deal-card-model';
import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';

const TOOLKIT_URL = (process.env.EXPO_PUBLIC_TOOLKIT_URL || '').trim();
const AI_ENDPOINT = process.env.EXPO_PUBLIC_AI_ENDPOINT || '';

export type AIProviderStatus = 'active' | 'failed' | 'idle';

interface AIProvider {
  id: string;
  name: string;
  priority: number;
  status: AIProviderStatus;
  failCount: number;
  lastError: string | null;
  lastUsed: number;
  generate: (prompt: string, context: InvestorContext) => Promise<string>;
}

interface InvestorContext {
  language: string;
  investorName?: string;
  investmentInterest?: string;
  deals: DealSummary[];
  platformInfo: string;
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

async function loadDealsContext(): Promise<DealSummary[]> {
  try {
    const result = await fetchCanonicalDeals();
    if (result.deals.length > 0) {
      return result.deals.map(d => ({
        title: d.title,
        expectedROI: d.expectedROI,
        minInvestment: d.minInvestment,
        timeline: d.timeline,
        city: d.city,
        state: d.state,
        dealType: d.dealType,
        exitStrategy: d.exitStrategy,
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
    ? `\n\nCURRENT INVESTMENT OPPORTUNITIES:\n${context.deals.map((d, i) => `${i + 1}. ${d.title} — ${d.dealType} in ${d.city}, ${d.state}\n   Expected ROI: ${d.expectedROI}% | Min Investment: $${d.minInvestment} | Timeline: ${d.timeline}\n   Exit Strategy: ${d.exitStrategy}`).join('\n')}`
    : '';

  return `You are the AI Investment Advisor for IVX Holdings LLC — a real estate fractional ownership platform.

${langInstruction}

PLATFORM FACTS:
- Platform: ${CANONICAL_CLAIMS.platformName}
- Minimum investment: ${CANONICAL_CLAIMS.minInvestmentLabel}
- Distribution: ${CANONICAL_CLAIMS.distributionFrequency}
- ${CANONICAL_CLAIMS.riskDisclaimer}
- ${CANONICAL_CLAIMS.complianceNote}
${dealsInfo}

KEY CAPABILITIES:
- Fractional real estate ownership with ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()} dividends
- Daily stock trading during market hours (9:30 AM - 4:00 PM ET)
- Withdraw dividends anytime (3-5 business days)
- Principal stays invested until property exit
- Waitlist available for upcoming opportunities

RULES:
1. Always be transparent about risks
2. Never guarantee returns
3. Present actual deals when available
4. Direct complex questions to human advisors
5. If user asks about waitlist, guide them to join
6. Detect user's language and respond in that language
7. Be concise (2-4 sentences for quick questions)
${context.investorName ? `\nInvestor name: ${context.investorName}` : ''}
${context.investmentInterest ? `\nInvestment interest: ${context.investmentInterest}` : ''}`;
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
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      if (!TOOLKIT_URL) throw new Error('Toolkit URL not configured');
      const systemPrompt = buildSystemPrompt(context);
      const result = await toolkitGenerateText({
        messages: [
          { role: 'user', content: `${systemPrompt}\n\nUser message: ${prompt}` },
        ],
      });
      if (!result || result.length === 0) throw new Error('Empty response from Rork toolkit');
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
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
      const systemPrompt = buildSystemPrompt(context);
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: { prompt: `${systemPrompt}\n\nUser: ${prompt}`, type: 'text' },
      });
      if (error) throw new Error(error.message);
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
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      if (!AI_ENDPOINT) throw new Error('AI endpoint not configured');
      const systemPrompt = buildSystemPrompt(context);
      const resp = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${systemPrompt}\n\nUser: ${prompt}`,
          type: 'text',
          language: context.language,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
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
    generate: async (prompt: string, context: InvestorContext): Promise<string> => {
      return generateSmartFallback(prompt, context);
    },
  };
}

function generateSmartFallback(prompt: string, context: InvestorContext): string {
  const lower = prompt.toLowerCase();
  const lang = context.language;

  const dealsText = context.deals.length > 0
    ? context.deals.map(d => `• ${d.title} — ${d.expectedROI}% ROI, min $${d.minInvestment}, ${d.timeline}`).join('\n')
    : '';

  const responses: Record<string, Record<string, string>> = {
    invest: {
      en: `IVX Holdings offers fractional real estate ownership starting at ${CANONICAL_CLAIMS.minInvestmentLabel}. ${CANONICAL_CLAIMS.distributionFrequency} distributions.${dealsText ? '\n\nCurrent opportunities:\n' + dealsText : ''}\n\nJoin our waitlist to get started!`,
      es: `IVX Holdings ofrece propiedad fraccionaria de bienes raíces desde ${CANONICAL_CLAIMS.minInvestmentLabel}. Distribuciones ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}.${dealsText ? '\n\nOportunidades actuales:\n' + dealsText : ''}\n\n¡Únase a nuestra lista de espera para comenzar!`,
      pt: `IVX Holdings oferece propriedade fracionária de imóveis a partir de ${CANONICAL_CLAIMS.minInvestmentLabel}. Distribuições ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}.${dealsText ? '\n\nOportunidades atuais:\n' + dealsText : ''}\n\nJunte-se à nossa lista de espera!`,
      fr: `IVX Holdings propose la propriété fractionnée immobilière à partir de ${CANONICAL_CLAIMS.minInvestmentLabel}. Distributions ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}.${dealsText ? '\n\nOpportunités actuelles:\n' + dealsText : ''}\n\nRejoignez notre liste d'attente!`,
    },
    withdraw: {
      en: 'Dividends are distributed monthly and can be withdrawn anytime. Processing takes 3-5 business days to your linked bank account.',
      es: 'Los dividendos se distribuyen mensualmente y se pueden retirar en cualquier momento. El procesamiento toma 3-5 días hábiles.',
      pt: 'Os dividendos são distribuídos mensalmente e podem ser retirados a qualquer momento. O processamento leva 3-5 dias úteis.',
      fr: 'Les dividendes sont distribués mensuellement et peuvent être retirés à tout moment. Le traitement prend 3-5 jours ouvrés.',
    },
    waitlist: {
      en: 'Great choice! You can join our waitlist by providing your name, email, phone, investment amount, and expected returns timeline. Our team will reach out during your preferred hours.',
      es: '¡Gran elección! Puede unirse a nuestra lista de espera proporcionando su nombre, correo electrónico, teléfono, monto de inversión y línea de tiempo de retornos esperados.',
      pt: 'Ótima escolha! Você pode se juntar à nossa lista de espera fornecendo seu nome, e-mail, telefone, valor de investimento e prazo de retornos esperados.',
      fr: 'Excellent choix! Vous pouvez rejoindre notre liste d\'attente en fournissant votre nom, e-mail, téléphone, montant d\'investissement et délai de rendements attendus.',
    },
    default: {
      en: `Thank you for your interest in IVX Holdings. We offer fractional real estate ownership with ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()} distributions. ${CANONICAL_CLAIMS.riskDisclaimer} For immediate assistance: investors@ivxholding.com`,
      es: `Gracias por su interés en IVX Holdings. Ofrecemos propiedad fraccionaria de bienes raíces con distribuciones ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}. Para asistencia inmediata: investors@ivxholding.com`,
      pt: `Obrigado pelo seu interesse na IVX Holdings. Oferecemos propriedade fracionária de imóveis com distribuições ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}. Para assistência imediata: investors@ivxholding.com`,
      fr: `Merci pour votre intérêt pour IVX Holdings. Nous offrons la propriété fractionnée immobilière avec des distributions ${CANONICAL_CLAIMS.distributionFrequency.toLowerCase()}. Pour une assistance immédiate: investors@ivxholding.com`,
    },
  };

  let category = 'default';
  if (/invest|buy|purchase|comprar|acheter|shares|stock|trade/i.test(lower)) category = 'invest';
  else if (/withdraw|dividend|retir|payout|cash out/i.test(lower)) category = 'withdraw';
  else if (/waitlist|wait list|lista|join|sign up|registr/i.test(lower)) category = 'waitlist';
  else if (/deal|opportunity|property|propert|imóve|inmueble|bien/i.test(lower)) category = 'invest';

  const categoryResponses = responses[category] || responses.default;
  return categoryResponses[lang] || categoryResponses.en || responses.default.en;
}

class AIInvestorService {
  private providers: AIProvider[] = [];
  private initialized = false;
  private currentContext: InvestorContext | null = null;
  private totalRequests = 0;
  private totalFailovers = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
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

  async generateResponse(userMessage: string, investorName?: string, investmentInterest?: string): Promise<{
    text: string;
    provider: string;
    language: string;
    failovers: number;
  }> {
    if (!this.initialized) await this.init();
    this.totalRequests++;

    const language = detectLanguage(userMessage);
    const deals = this.currentContext?.deals || [];

    const context: InvestorContext = {
      language,
      investorName,
      investmentInterest,
      deals,
      platformInfo: `${CANONICAL_CLAIMS.platformName} | ${Platform.OS}`,
    };

    let failovers = 0;
    const sortedProviders = [...this.providers].sort((a, b) => a.priority - b.priority);

    for (const provider of sortedProviders) {
      try {
        console.log(`[AIInvestor] Trying provider ${provider.priority}: ${provider.name}`);
        const startTime = Date.now();
        const text = await provider.generate(userMessage, context);

        if (text && text.length > 0) {
          provider.status = 'active';
          provider.failCount = 0;
          provider.lastError = null;
          provider.lastUsed = Date.now();
          const latency = Date.now() - startTime;
          console.log(`[AIInvestor] Success via ${provider.name} (${latency}ms, lang: ${language})`);
          return { text, provider: provider.name, language, failovers };
        }

        throw new Error('Empty response');
      } catch (err) {
        provider.status = 'failed';
        provider.failCount++;
        provider.lastError = (err as Error)?.message ?? 'Unknown error';
        failovers++;
        this.totalFailovers++;
        console.warn(`[AIInvestor] Provider ${provider.name} failed (attempt ${provider.failCount}):`, provider.lastError);
      }
    }

    console.error('[AIInvestor] ALL providers failed. Using emergency fallback.');
    const emergencyText = generateSmartFallback(userMessage, context);
    return { text: emergencyText, provider: 'emergency_fallback', language, failovers };
  }

  async refreshDeals(): Promise<void> {
    const deals = await loadDealsContext();
    if (this.currentContext) {
      this.currentContext.deals = deals;
    }
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
    return this.providers.map(p => ({
      id: p.id,
      name: p.name,
      priority: p.priority,
      status: p.status,
      failCount: p.failCount,
      lastError: p.lastError,
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
