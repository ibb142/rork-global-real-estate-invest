import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID } from '@/constants/ivx-owner-ai';
import { getIVXAccessToken, getIVXOwnerAICandidateEndpoints, getIVXOwnerAIEndpoint } from '@/lib/ivx-supabase-client';
import type {
  IVXOwnerAIHealthProbeResponse,
  IVXOwnerAIRequest,
  IVXOwnerAIResponse,
  IVXOwnerAIRoomStatus,
} from '@/shared/ivx';
import type { ServiceRuntimeHealth } from '@/src/modules/chat/types/chat';

export type IVXOwnerAIProbeResult = {
  health: ServiceRuntimeHealth;
  roomStatus: IVXOwnerAIRoomStatus | null;
  source: 'remote_api' | 'toolkit_fallback';
};

type EndpointFetchResult = {
  endpoint: string;
  response: Response;
};

type OwnerAIRequestPayload = {
  conversationId: string;
  message: string;
  senderLabel: string | null;
  mode: 'chat' | 'command';
};

function readErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unable to reach IVX Owner AI.';
  }

  const record = payload as Record<string, unknown>;
  return typeof record.error === 'string' && record.error.trim().length > 0
    ? record.error.trim()
    : 'Unable to reach IVX Owner AI.';
}

function createLocalRequestId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldFallbackToToolkit(status: number | null, message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  if (status !== null && status !== 401 && status !== 403 && (status === 404 || status === 405 || status >= 500)) {
    return true;
  }

  return normalizedMessage.includes('network request failed')
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('load failed')
    || normalizedMessage.includes('not found')
    || normalizedMessage.includes('abort')
    || normalizedMessage.includes('only absolute urls are supported');
}

function buildToolkitPrompt(input: IVXOwnerAIRequest): string {
  const senderLabel = input.senderLabel?.trim() || 'IVX Owner';
  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.',
    'You are running in the in-app fallback path, so do not claim server-side actions were completed unless the user already confirmed them.',
    `Conversation ID: ${input.conversationId ?? IVX_OWNER_AI_ROOM_ID}`,
    `Mode: ${input.mode ?? 'chat'}`,
    `Sender label: ${senderLabel}`,
    `Owner request: ${input.message}`,
  ].join('\n\n');
}

function buildRequestPayload(input: IVXOwnerAIRequest): OwnerAIRequestPayload {
  return {
    conversationId: input.conversationId ?? IVX_OWNER_AI_ROOM_ID,
    message: input.message,
    senderLabel: input.senderLabel ?? null,
    mode: input.mode ?? 'chat',
  };
}

async function requestToolkitFallback(input: IVXOwnerAIRequest): Promise<IVXOwnerAIResponse> {
  const prompt = buildToolkitPrompt(input);
  const answer = (await toolkitGenerateText({
    messages: [{ role: 'user', content: prompt }],
  })).trim();

  if (!answer) {
    throw new Error('AI returned an empty fallback response.');
  }

  console.log('[IVXAIRequestService] Toolkit fallback reply received, length:', answer.length);

  return {
    requestId: createLocalRequestId('ivx-toolkit'),
    conversationId: input.conversationId ?? IVX_OWNER_AI_ROOM_ID,
    answer,
    model: 'rork-toolkit-fallback',
    status: 'ok',
  };
}

async function probeToolkitFallback(): Promise<IVXOwnerAIProbeResult> {
  try {
    const answer = (await toolkitGenerateText({
      messages: [{ role: 'user', content: 'Reply with READY only.' }],
    })).trim();

    if (!answer) {
      console.log('[IVXAIRequestService] Toolkit fallback probe returned empty output');
      return {
        health: 'inactive',
        roomStatus: null,
        source: 'toolkit_fallback',
      };
    }

    console.log('[IVXAIRequestService] Toolkit fallback probe succeeded');
    return {
      health: 'degraded',
      roomStatus: null,
      source: 'toolkit_fallback',
    };
  } catch (error) {
    console.log('[IVXAIRequestService] Toolkit fallback probe failed:', (error as Error)?.message ?? 'unknown');
    return {
      health: 'inactive',
      roomStatus: null,
      source: 'toolkit_fallback',
    };
  }
}

async function fetchOwnerAIEndpointWithFallback(
  accessToken: string,
  payload: OwnerAIRequestPayload,
  requestLabel: string,
): Promise<EndpointFetchResult> {
  const candidateEndpoints = getIVXOwnerAICandidateEndpoints();
  let lastResponse: EndpointFetchResult | null = null;
  let lastRecoverableError: Error | null = null;

  for (const endpoint of candidateEndpoints) {
    try {
      console.log(`[IVXAIRequestService] ${requestLabel} attempting endpoint:`, endpoint);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        console.log(`[IVXAIRequestService] ${requestLabel} endpoint unavailable:`, endpoint, 'status:', response.status);
        lastResponse = { endpoint, response };
        continue;
      }

      return { endpoint, response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown endpoint error';
      if (shouldFallbackToToolkit(null, message)) {
        console.log(`[IVXAIRequestService] ${requestLabel} endpoint failed, trying next candidate:`, endpoint, message);
        lastRecoverableError = error instanceof Error ? error : new Error(message);
        continue;
      }

      throw error;
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastRecoverableError ?? new Error(`Unable to reach IVX Owner AI at ${getIVXOwnerAIEndpoint()}`);
}

export const ivxAIRequestService = {
  async requestOwnerAI(input: IVXOwnerAIRequest): Promise<IVXOwnerAIResponse> {
    const accessToken = await getIVXAccessToken();
    const payload = buildRequestPayload(input);

    if (!accessToken) {
      console.log('[IVXAIRequestService] No auth token, using toolkit fallback for owner AI request');
      return await requestToolkitFallback(input);
    }

    console.log('[IVXAIRequestService] Sending AI request:', {
      endpoint: getIVXOwnerAIEndpoint(),
      conversationId: payload.conversationId,
      hasMessage: input.message.trim().length > 0,
      mode: payload.mode,
    });

    try {
      const result = await fetchOwnerAIEndpointWithFallback(accessToken, payload, 'Owner AI request');
      console.log('[IVXAIRequestService] Owner AI request resolved endpoint:', result.endpoint, 'status:', result.response.status);

      const payloadResponse = await result.response.json().catch(() => null);

      if (!result.response.ok) {
        const errorMessage = readErrorMessage(payloadResponse);
        if (shouldFallbackToToolkit(result.response.status, errorMessage)) {
          console.log('[IVXAIRequestService] Remote AI request unavailable, using toolkit fallback:', result.response.status, errorMessage);
          return await requestToolkitFallback(input);
        }
        throw new Error(errorMessage);
      }

      return payloadResponse as IVXOwnerAIResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach IVX Owner AI.';
      if (shouldFallbackToToolkit(null, message)) {
        console.log('[IVXAIRequestService] Request failed before remote response, using toolkit fallback:', message);
        return await requestToolkitFallback(input);
      }
      throw error;
    }
  },

  async probeOwnerAIHealth(): Promise<IVXOwnerAIProbeResult> {
    const accessToken = await getIVXAccessToken();
    const payload = buildRequestPayload({
      message: 'health_probe',
      mode: 'chat',
    });

    if (!accessToken) {
      console.log('[IVXAIRequestService] No auth token for owner AI probe, using toolkit fallback health');
      return await probeToolkitFallback();
    }

    console.log('[IVXAIRequestService] Probing owner AI health:', getIVXOwnerAIEndpoint());

    try {
      const result = await fetchOwnerAIEndpointWithFallback(accessToken, payload, 'Owner AI probe');
      console.log('[IVXAIRequestService] Owner AI probe resolved endpoint:', result.endpoint, 'status:', result.response.status);

      const payloadResponse = await result.response.json().catch(() => null);

      if (!result.response.ok) {
        const errorMessage = readErrorMessage(payloadResponse);
        if (result.response.status === 401 || result.response.status === 403) {
          console.log('[IVXAIRequestService] Owner AI probe unauthorized:', result.response.status, errorMessage);
          return {
            health: 'inactive',
            roomStatus: null,
            source: 'remote_api',
          };
        }

        if (shouldFallbackToToolkit(result.response.status, errorMessage)) {
          console.log('[IVXAIRequestService] Owner AI probe falling back to toolkit:', result.response.status, errorMessage);
          return await probeToolkitFallback();
        }

        return {
          health: 'inactive',
          roomStatus: null,
          source: 'remote_api',
        };
      }

      const data = payloadResponse as IVXOwnerAIHealthProbeResponse | null;
      return {
        health: 'active',
        roomStatus: data?.roomStatus ?? null,
        source: 'remote_api',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown probe error';
      if (shouldFallbackToToolkit(null, message)) {
        console.log('[IVXAIRequestService] Owner AI probe network failure, using toolkit fallback:', message);
        return await probeToolkitFallback();
      }

      console.log('[IVXAIRequestService] Owner AI probe failed:', message);
      return {
        health: 'inactive',
        roomStatus: null,
        source: 'remote_api',
      };
    }
  },
};
