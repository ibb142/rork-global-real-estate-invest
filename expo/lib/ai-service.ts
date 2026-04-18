import { useState, useCallback, useRef } from 'react';
import { generateObject as rorkGenerateObject, generateText as rorkGenerateText } from '@rork-ai/toolkit-sdk';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const AI_ENDPOINT = (process.env.EXPO_PUBLIC_AI_ENDPOINT ?? '').trim();
const TOOLKIT_URL = (process.env.EXPO_PUBLIC_TOOLKIT_URL ?? '').trim();
const DEFAULT_WORKSPACE_ASSISTANT_SYSTEM_PROMPT = 'You are the in-app assistant for this workspace.';

type RawContentPart = {
  type: string;
  text?: string;
  image?: string;
};

type SupportedContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string };

type RawMessage = {
  role: string;
  content: string | RawContentPart[];
};

type ToolkitMessage = {
  role: 'user' | 'assistant';
  content: string | SupportedContentPart[];
};

interface GenerateTextOptions {
  messages?: RawMessage[];
}

interface GenerateObjectOptions<T = Record<string, unknown>> {
  messages: RawMessage[];
  schema: { parse: (data: unknown) => T };
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
}

interface UseAgentOptions {
  tools?: Record<string, unknown>;
  systemPrompt?: string;
}

interface UseAgentReturn {
  messages: AgentMessage[];
  sendMessage: (text: string) => void;
  updateLastAssistantMessage: (partialText: string) => void;
}

function getPlainTextFromContent(content: string | RawContentPart[]): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0)
    .map((part) => part.text?.trim() ?? '')
    .join(' ')
    .trim();
}

function normalizeMessagesForToolkit(messages: RawMessage[] | undefined): ToolkitMessage[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  const normalizedMessages: ToolkitMessage[] = [];
  const pendingSystemInstructions: string[] = [];

  for (const message of messages) {
    const role = message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user';

    if (role === 'system') {
      const systemText = getPlainTextFromContent(message.content);
      if (systemText.length > 0) {
        pendingSystemInstructions.push(systemText);
      }
      continue;
    }

    if (typeof message.content === 'string') {
      const baseContent = message.content.trim();
      const contentWithSystem = pendingSystemInstructions.length > 0 && role === 'user'
        ? `${pendingSystemInstructions.join('\n\n')}\n\n${baseContent}`.trim()
        : baseContent;

      if (pendingSystemInstructions.length > 0) {
        pendingSystemInstructions.length = 0;
      }

      if (contentWithSystem.length > 0) {
        normalizedMessages.push({ role, content: contentWithSystem });
      }
      continue;
    }

    const normalizedParts: SupportedContentPart[] = [];

    if (pendingSystemInstructions.length > 0) {
      if (role === 'user') {
        normalizedParts.push({
          type: 'text',
          text: pendingSystemInstructions.join('\n\n'),
        });
      } else {
        normalizedMessages.push({
          role: 'user',
          content: pendingSystemInstructions.join('\n\n'),
        });
      }
      pendingSystemInstructions.length = 0;
    }

    for (const part of message.content) {
      if (part.type === 'image' && typeof part.image === 'string' && part.image.trim().length > 0) {
        normalizedParts.push({ type: 'image', image: part.image.trim() });
        continue;
      }

      if (typeof part.text === 'string' && part.text.trim().length > 0) {
        normalizedParts.push({ type: 'text', text: part.text.trim() });
      }
    }

    if (normalizedParts.length > 0) {
      normalizedMessages.push({ role, content: normalizedParts });
    }
  }

  if (pendingSystemInstructions.length > 0) {
    normalizedMessages.push({
      role: 'user',
      content: pendingSystemInstructions.join('\n\n'),
    });
  }

  return normalizedMessages;
}

function buildPromptFromMessages(messages: RawMessage[] | undefined): string {
  if (!messages || messages.length === 0) {
    return '';
  }

  return messages
    .map((message) => {
      const content = getPlainTextFromContent(message.content);
      return content.length > 0 ? `${message.role.toUpperCase()}: ${content}` : '';
    })
    .filter((value) => value.length > 0)
    .join('\n');
}

function isLikelyZodSchema<T>(schema: GenerateObjectOptions<T>['schema']): boolean {
  const candidate = schema as {
    safeParse?: unknown;
    parse?: unknown;
  };

  return typeof candidate.parse === 'function' && typeof candidate.safeParse === 'function';
}

async function callToolkitText(messages: ToolkitMessage[]): Promise<string | null> {
  if (messages.length === 0) {
    return null;
  }

  try {
    console.log('[AI] Trying Rork toolkit text generation:', {
      hasToolkitUrl: TOOLKIT_URL.length > 0,
      messageCount: messages.length,
    });
    const response = await rorkGenerateText({ messages: messages as never });
    const normalizedResponse = response.trim();

    if (normalizedResponse.length > 0) {
      console.log('[AI] Rork toolkit text generation succeeded');
      return normalizedResponse;
    }

    console.log('[AI] Rork toolkit text generation returned empty response');
    return null;
  } catch (error) {
    console.log('[AI] Rork toolkit text generation failed:', (error as Error)?.message ?? 'Unknown error');
    return null;
  }
}

async function callToolkitObject<T>(options: GenerateObjectOptions<T>): Promise<T | null> {
  if (!isLikelyZodSchema(options.schema)) {
    console.log('[AI] Toolkit object generation skipped because schema is not a Zod schema');
    return null;
  }

  const messages = normalizeMessagesForToolkit(options.messages);
  if (messages.length === 0) {
    return null;
  }

  try {
    console.log('[AI] Trying Rork toolkit object generation:', {
      hasToolkitUrl: TOOLKIT_URL.length > 0,
      messageCount: messages.length,
    });
    const result = await rorkGenerateObject({
      messages: messages as never,
      schema: options.schema as never,
    });
    console.log('[AI] Rork toolkit object generation succeeded');
    return result as T;
  } catch (error) {
    console.log('[AI] Rork toolkit object generation failed:', (error as Error)?.message ?? 'Unknown error');
    return null;
  }
}

async function callSupabaseAI(prompt: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    console.log('[AI] Supabase not configured, using fallback');
    return getFallbackResponse(prompt);
  }

  try {
    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: { prompt, type: 'text' },
    });

    if (error) {
      console.log('[AI] Supabase function error:', error.message);
      return getFallbackResponse(prompt);
    }

    return data?.text || data?.result || getFallbackResponse(prompt);
  } catch (err) {
    console.log('[AI] Supabase AI call failed:', err);
    return getFallbackResponse(prompt);
  }
}

async function callSupabaseAIObject(messages: GenerateObjectOptions['messages']): Promise<Record<string, unknown>> {
  if (!isSupabaseConfigured()) {
    console.log('[AI] Supabase not configured for object generation');
    return {};
  }

  try {
    const prompt = buildPromptFromMessages(messages);

    const { data, error } = await supabase.functions.invoke('ai-generate', {
      body: { prompt, type: 'object', messages },
    });

    if (error) {
      console.log('[AI] Supabase object generation error:', error.message);
      return {};
    }

    return data?.object || data?.result || data || {};
  } catch (err) {
    console.log('[AI] Supabase AI object call failed:', err);
    return {};
  }
}

function getFallbackResponse(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes('investment') || lower.includes('invest')) {
    return 'IVX Holdings offers fractional real estate ownership with quarterly dividends. Our minimum investment starts at $100, with projected returns of 8-12% annually. Visit our investment portal for current opportunities.';
  }
  if (lower.includes('withdraw') || lower.includes('dividend')) {
    return 'Dividends are distributed quarterly and can be withdrawn anytime. Processing takes 3-5 business days to your linked bank account.';
  }
  if (lower.includes('stock') || lower.includes('trading')) {
    return 'Daily stock trading is available during market hours (9:30 AM - 4:00 PM ET). You can buy and sell shares of all listed properties on the platform.';
  }
  if (lower.includes('social') || lower.includes('post') || lower.includes('content')) {
    return 'Invest in premium real estate with IVX Holdings. Fractional ownership starting at $100. Join thousands of investors building wealth through real estate. #RealEstate #Investment #IVXHoldings';
  }
  if (lower.includes('email') || lower.includes('subject') || lower.includes('reply')) {
    return 'Thank you for your interest in IVX Holdings. Our team will review your inquiry and respond within 24 hours. For immediate assistance, please contact us at investors@ivxholding.com.';
  }
  if (lower.includes('narration') || lower.includes('script') || lower.includes('video')) {
    return 'NARRATION: IVX Holdings transforms real estate investing with fractional ownership, making premium properties accessible to everyone. Our platform delivers quarterly dividends and transparent portfolio management.\nBULLETS: Fractional Ownership | Quarterly Dividends | Premium Properties | Transparent Management';
  }
  if (lower.includes('marketing') || lower.includes('campaign') || lower.includes('growth')) {
    return 'Focus on high-value investor segments through targeted digital campaigns. Leverage social proof with testimonials and performance data. Optimize conversion funnels with A/B testing on landing pages.';
  }
  if (lower.includes('engagement') || lower.includes('re-engage') || lower.includes('inactive')) {
    return 'We noticed you have been away! Great news — your portfolio has grown. Log in to see your latest dividends and new investment opportunities waiting for you.';
  }

  return 'Thank you for reaching out. Our AI assistant is currently processing your request. For immediate help, please contact our support team at investors@ivxholding.com or call +1 (305) 555-0123.';
}

export async function generateText(
  input: string | GenerateTextOptions
): Promise<string> {
  const messages = typeof input === 'string'
    ? [{ role: 'user', content: input.trim() } satisfies RawMessage]
    : input.messages ?? [];
  const prompt = buildPromptFromMessages(messages);
  const toolkitMessages = normalizeMessagesForToolkit(messages);

  console.log('[AI] generateText called:', {
    promptLength: prompt.length,
    messageCount: messages.length,
  });

  const toolkitResponse = await callToolkitText(toolkitMessages);
  if (toolkitResponse) {
    return toolkitResponse;
  }

  if (AI_ENDPOINT) {
    try {
      console.log('[AI] Trying custom AI endpoint');
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'text' }),
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.text || data.result || '';
        if (typeof text === 'string' && text.trim().length > 0) {
          console.log('[AI] Custom AI endpoint succeeded');
          return text.trim();
        }
      }
    } catch (err) {
      console.log('[AI] Custom endpoint failed, trying Supabase:', err);
    }
  }

  return callSupabaseAI(prompt);
}

export async function generateWorkspaceAssistantReply(
  userMessage: string,
  systemPrompt: string = DEFAULT_WORKSPACE_ASSISTANT_SYSTEM_PROMPT
): Promise<string> {
  const normalizedMessage = userMessage.trim();

  console.log('[AI] generateWorkspaceAssistantReply called:', {
    hasSystemPrompt: systemPrompt.trim().length > 0,
    messageLength: normalizedMessage.length,
  });

  if (normalizedMessage.length === 0) {
    return 'Please enter a message so I can help.';
  }

  return generateText({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: normalizedMessage },
    ],
  });
}

export async function generateObject<T = Record<string, unknown>>(
  options: GenerateObjectOptions<T>
): Promise<T> {
  console.log('[AI] generateObject called:', {
    messageCount: options.messages.length,
  });

  const toolkitResult = await callToolkitObject(options);
  if (toolkitResult !== null) {
    return toolkitResult;
  }

  if (AI_ENDPOINT) {
    try {
      console.log('[AI] Trying custom AI endpoint object generation');
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: options.messages, type: 'object' }),
      });
      if (response.ok) {
        const data = await response.json();
        const obj = data.object || data.result || data;
        try {
          return options.schema.parse(obj) as T;
        } catch {
          return obj as T;
        }
      }
    } catch (err) {
      console.log('[AI] Custom endpoint object gen failed:', err);
    }
  }

  const result = await callSupabaseAIObject(options.messages);
  try {
    return options.schema.parse(result) as T;
  } catch {
    return result as T;
  }
}

export async function generateImage(prompt: string, size: string = '1024x1024'): Promise<{ base64Data: string; mimeType: string } | null> {
  console.log('[AI] generateImage called, prompt:', prompt.substring(0, 50));

  if (AI_ENDPOINT) {
    try {
      const response = await fetch(AI_ENDPOINT.replace('/text', '/images').replace(/\/$/, '') + '/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, size }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.image || null;
      }
    } catch (err) {
      console.log('[AI] Custom image endpoint failed:', err);
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.functions.invoke('ai-image-generate', {
        body: { prompt, size },
      });
      if (!error && data?.image) {
        return data.image;
      }
      console.log('[AI] Supabase image generation error:', error?.message);
    } catch (err) {
      console.log('[AI] Supabase image generation failed:', err);
    }
  }

  console.log('[AI] No image generation service available');
  return null;
}

export function useLocalAgent(options?: UseAgentOptions): UseAgentReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const messageIdRef = useRef(0);

  const updateLastAssistantMessage = useCallback((partialText: string) => {
    const normalizedText = partialText;
    setMessages((prev) => {
      const lastAssistantIndex = [...prev].reverse().findIndex((message) => message.role === 'assistant');

      if (lastAssistantIndex === -1) {
        const assistantMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
        const assistantMessage: AgentMessage = {
          id: assistantMsgId,
          role: 'assistant',
          parts: [{ type: 'text', text: normalizedText }],
        };

        return [...prev, assistantMessage];
      }

      const targetIndex = prev.length - 1 - lastAssistantIndex;
      return prev.map((message, index) => {
        if (index !== targetIndex) {
          return message;
        }

        return {
          ...message,
          parts: [{ type: 'text', text: normalizedText }],
        };
      });
    });
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const normalizedText = text.trim();
    if (normalizedText.length === 0) {
      return;
    }

    const userMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
    const userMessage: AgentMessage = {
      id: userMsgId,
      role: 'user',
      parts: [{ type: 'text', text: normalizedText }],
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = options?.systemPrompt
        ? await generateText({
            messages: [
              { role: 'system', content: options.systemPrompt },
              { role: 'user', content: normalizedText },
            ],
          })
        : await generateText(normalizedText);
      const assistantMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
      const assistantMessage: AgentMessage = {
        id: assistantMsgId,
        role: 'assistant',
        parts: [{ type: 'text', text: response }],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.log('[AI] Agent response error:', err);
      const errorMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
      const errorMessage: AgentMessage = {
        id: errorMsgId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'I apologize, but I am unable to process your request right now. Please try again or contact support.' }],
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, [options?.systemPrompt]);

  return { messages, sendMessage, updateLastAssistantMessage };
}
