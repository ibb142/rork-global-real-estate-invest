import { useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const AI_ENDPOINT = process.env.EXPO_PUBLIC_AI_ENDPOINT || '';

interface GenerateTextOptions {
  messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string; image?: string }> }>;
}

interface GenerateObjectOptions<T = Record<string, unknown>> {
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image?: string }> }>;
  schema: { parse: (data: unknown) => T };
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: 'text'; text: string }>;
}

interface UseAgentOptions {
  tools?: Record<string, unknown>;
}

interface UseAgentReturn {
  messages: AgentMessage[];
  sendMessage: (text: string) => void;
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
    const prompt = messages.map(m => {
      if (typeof m.content === 'string') return m.content;
      return m.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
    }).join('\n');

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
  let prompt = '';

  if (typeof input === 'string') {
    prompt = input;
  } else if (input.messages && input.messages.length > 0) {
    prompt = input.messages.map(m => {
      if (typeof m.content === 'string') return m.content;
      return m.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
    }).join('\n');
  }

  console.log('[AI] generateText called, prompt length:', prompt.length);

  if (AI_ENDPOINT) {
    try {
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'text' }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.text || data.result || '';
      }
    } catch (err) {
      console.log('[AI] Custom endpoint failed, trying Supabase:', err);
    }
  }

  return callSupabaseAI(prompt);
}

export async function generateObject<T = Record<string, unknown>>(
  options: GenerateObjectOptions<T>
): Promise<T> {
  console.log('[AI] generateObject called');

  if (AI_ENDPOINT) {
    try {
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

export function useLocalAgent(_options?: UseAgentOptions): UseAgentReturn {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const messageIdRef = useRef(0);

  const sendMessage = useCallback(async (text: string) => {
    const userMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
    const userMessage: AgentMessage = {
      id: userMsgId,
      role: 'user',
      parts: [{ type: 'text', text }],
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await generateText(text);
      const assistantMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
      const assistantMessage: AgentMessage = {
        id: assistantMsgId,
        role: 'assistant',
        parts: [{ type: 'text', text: response }],
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.log('[AI] Agent response error:', err);
      const errorMsgId = `msg-${Date.now()}-${messageIdRef.current++}`;
      const errorMessage: AgentMessage = {
        id: errorMsgId,
        role: 'assistant',
        parts: [{ type: 'text', text: 'I apologize, but I am unable to process your request right now. Please try again or contact support.' }],
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }, []);

  return { messages, sendMessage };
}
