import { useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/api-base';

const DEFAULT_WORKSPACE_ASSISTANT_SYSTEM_PROMPT = 'You are the in-app assistant for this workspace.';
const DEFAULT_ASSISTANT_MODEL = 'openai/gpt-4o-mini';

type RawContentPart = {
  type: string;
  text?: string;
  image?: string;
};

type RawMessage = {
  role: string;
  content: string | RawContentPart[];
};

interface GenerateTextOptions {
  messages?: RawMessage[];
  flow?: 'generate' | 'replace' | 'new-project';
  conversationId?: string;
  projectId?: string;
  systemPrompt?: string;
  model?: string;
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

type AssistantApiResponse = {
  ok?: boolean;
  answer?: string;
  text?: string;
  generatedSummary?: string;
  requestId?: string;
  provider?: string;
  source?: string;
  model?: string;
  providerMetadata?: Record<string, unknown>;
  promptRun?: Record<string, unknown>;
  persistence?: Record<string, unknown>;
  error?: string;
};

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

function getLastUserMessage(messages: RawMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const text = getPlainTextFromContent(lastUserMessage?.content ?? '');
  if (text.length > 0) {
    return text;
  }

  return buildPromptFromMessages(messages);
}

function resolveAssistantEndpoint(): string {
  const explicitEndpoint = (process.env.EXPO_PUBLIC_AI_ASSISTANT_ENDPOINT ?? '').trim();
  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  return `${getApiBaseUrl().replace(/\/$/, '')}/api/assistant`;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`Unable to read Supabase session: ${error.message}`);
  }

  const token = data.session?.access_token ?? '';
  if (!token) {
    throw new Error('A verified owner session is required for AI generation.');
  }

  return token;
}

function normalizeFlow(value: GenerateTextOptions['flow']): 'generate' | 'replace' | 'new-project' {
  if (value === 'replace' || value === 'new-project') {
    return value;
  }

  return 'generate';
}

async function callAssistantRuntime(input: string | GenerateTextOptions): Promise<AssistantApiResponse> {
  const messages = typeof input === 'string'
    ? [{ role: 'user', content: input.trim() } satisfies RawMessage]
    : input.messages ?? [];
  const prompt = typeof input === 'string' ? input.trim() : getLastUserMessage(messages);
  const systemPrompt = typeof input === 'string'
    ? null
    : input.systemPrompt ?? messages.filter((message) => message.role === 'system').map((message) => getPlainTextFromContent(message.content)).join('\n\n');
  const accessToken = await getAccessToken();
  const endpoint = resolveAssistantEndpoint();

  console.log('[AI] Calling P0 assistant runtime:', {
    endpoint,
    promptLength: prompt.length,
    messageCount: messages.length,
    flow: typeof input === 'string' ? 'generate' : normalizeFlow(input.flow),
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: prompt,
      flow: typeof input === 'string' ? 'generate' : normalizeFlow(input.flow),
      conversationId: typeof input === 'string' ? undefined : input.conversationId,
      projectId: typeof input === 'string' ? undefined : input.projectId,
      systemPrompt: systemPrompt && systemPrompt.trim().length > 0 ? systemPrompt : undefined,
      model: typeof input === 'string' ? DEFAULT_ASSISTANT_MODEL : input.model ?? DEFAULT_ASSISTANT_MODEL,
      saveUserMessage: true,
    }),
  });

  const text = await response.text();
  let payload: AssistantApiResponse = {};
  try {
    payload = JSON.parse(text) as AssistantApiResponse;
  } catch {
    payload = { error: text };
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `AI assistant request failed with status ${response.status}.`);
  }

  const answer = typeof payload.answer === 'string' ? payload.answer.trim() : typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!answer) {
    throw new Error('AI assistant returned an empty response.');
  }

  console.log('[AI] P0 assistant runtime succeeded:', {
    requestId: payload.requestId ?? null,
    provider: payload.provider ?? null,
    source: payload.source ?? null,
    model: payload.model ?? null,
    promptRunSaved: payload.promptRun?.saved ?? null,
  });

  return {
    ...payload,
    answer,
    text: answer,
  };
}

export async function generateText(input: string | GenerateTextOptions): Promise<string> {
  const result = await callAssistantRuntime(input);
  return result.answer ?? result.text ?? '';
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
    flow: 'generate',
  });
}

export async function generateObject<T = Record<string, unknown>>(
  options: GenerateObjectOptions<T>
): Promise<T> {
  console.log('[AI] generateObject called through P0 assistant runtime:', {
    messageCount: options.messages.length,
  });

  const prompt = `${buildPromptFromMessages(options.messages)}\n\nReturn valid JSON only.`;
  const responseText = await generateText({
    messages: [{ role: 'user', content: prompt }],
    flow: 'generate',
  });
  let parsed: unknown = {};

  try {
    parsed = JSON.parse(responseText);
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('AI assistant did not return valid JSON.');
    }
  }

  return options.schema.parse(parsed) as T;
}

export async function generateImage(prompt: string, size: string = '1024x1024'): Promise<{ base64Data: string; mimeType: string } | null> {
  console.log('[AI] generateImage called, prompt:', prompt.substring(0, 50));

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

  console.log('[AI] No real image generation service available');
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
        parts: [{ type: 'text', text: 'AI generation needs a verified owner session and the remote ChatGPT runtime. Please sign in as an owner and try again.' }],
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, [options?.systemPrompt]);

  return { messages, sendMessage, updateLastAssistantMessage };
}
