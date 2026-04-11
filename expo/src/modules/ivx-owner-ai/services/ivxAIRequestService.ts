import { IVX_OWNER_AI_ROOM_ID } from '@/constants/ivx-owner-ai';
import { getIVXAccessToken, getIVXOwnerAIEndpoint } from '@/lib/ivx-supabase-client';
import type { IVXOwnerAIRequest, IVXOwnerAIResponse } from '@/shared/ivx';

function readErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unable to reach IVX Owner AI.';
  }

  const record = payload as Record<string, unknown>;
  return typeof record.error === 'string' && record.error.trim().length > 0
    ? record.error.trim()
    : 'Unable to reach IVX Owner AI.';
}

export const ivxAIRequestService = {
  async requestOwnerAI(input: IVXOwnerAIRequest): Promise<IVXOwnerAIResponse> {
    const accessToken = await getIVXAccessToken();
    const endpoint = getIVXOwnerAIEndpoint();

    if (!accessToken) {
      throw new Error('Please sign in before sending an IVX Owner AI request.');
    }

    console.log('[IVXAIRequestService] Sending AI request:', {
      endpoint,
      conversationId: input.conversationId ?? IVX_OWNER_AI_ROOM_ID,
      hasMessage: input.message.trim().length > 0,
      mode: input.mode ?? 'chat',
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        conversationId: input.conversationId ?? IVX_OWNER_AI_ROOM_ID,
        message: input.message,
        senderLabel: input.senderLabel ?? null,
        mode: input.mode ?? 'chat',
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(readErrorMessage(payload));
    }

    return payload as IVXOwnerAIResponse;
  },
};
