import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import type { IVXMessage } from '@/shared/ivx';
import { ivxAIRequestService } from './ivxAIRequestService';
import { ivxChatService } from './ivxChatService';

/**
 * Result of one end-to-end Owner AI durability proof run. Every field is the
 * literal observed value — no narrative, no inferred state.
 */
export type OwnerAIDurabilityProofResult = {
  markerText: string;
  conversationId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  reloadUserMessageId: string | null;
  reloadAssistantMessageId: string | null;
  searchFound: boolean;
  idsMatch: boolean;
  startedAt: string;
  completedAt: string;
  error: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createMarkerText(): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `IVX durability proof ${stamp}-${random}`;
}

function findMessageId(messages: IVXMessage[], targetId: string | null): string | null {
  if (!targetId) {
    return null;
  }
  return messages.find((message) => message.id === targetId)?.id ?? null;
}

function findMessageIdByBody(
  messages: IVXMessage[],
  role: IVXMessage['senderRole'],
  marker: string,
): string | null {
  const normalizedMarker = marker.trim().toLowerCase();
  const match = messages.find(
    (message) =>
      message.senderRole === role &&
      (message.body ?? '').toLowerCase().includes(normalizedMarker),
  );
  return match?.id ?? null;
}

/**
 * Runs the full Owner AI durability proof against the live Owner AI room:
 * 1. Sends an Owner AI message tagged with a unique marker.
 * 2. Captures conversationId, userMessageId, assistantMessageId.
 * 3. Reloads the conversation from the source of truth.
 * 4. Searches for the exact marker text.
 * 5. Re-reads the IDs from the reloaded conversation.
 * 6. Compares the original IDs to the reloaded IDs.
 */
export async function runOwnerAIDurabilityProof(): Promise<OwnerAIDurabilityProofResult> {
  const startedAt = nowIso();
  const markerText = createMarkerText();

  const result: OwnerAIDurabilityProofResult = {
    markerText,
    conversationId: null,
    userMessageId: null,
    assistantMessageId: null,
    reloadUserMessageId: null,
    reloadAssistantMessageId: null,
    searchFound: false,
    idsMatch: false,
    startedAt,
    completedAt: startedAt,
    error: null,
  };

  try {
    // 1. Send the Owner AI message (persisted owner message → userMessageId).
    const sentMessage = await ivxChatService.sendOwnerTextMessage({
      body: markerText,
      senderLabel: 'IVX Owner',
      requireRemote: true,
    });
    result.userMessageId = sentMessage.id;
    result.conversationId = sentMessage.conversationId;

    // 2. Request the assistant reply (persisted → assistantMessageId).
    const aiResult = await ivxAIRequestService.requestOwnerAI({
      conversationId: sentMessage.conversationId || IVX_OWNER_AI_PROFILE.sharedRoom.id,
      message: markerText,
      senderLabel: 'IVX Owner',
      mode: 'chat',
      persistUserMessage: false,
      persistAssistantMessage: true,
    });
    result.conversationId = aiResult.conversationId || result.conversationId;
    result.assistantMessageId = aiResult.assistantMessageId ?? null;

    // 3. Reload the conversation from the source of truth.
    const reloadedMessages = await ivxChatService.listOwnerMessages();
    result.reloadUserMessageId =
      findMessageId(reloadedMessages, result.userMessageId) ??
      findMessageIdByBody(reloadedMessages, 'owner', markerText);
    result.reloadAssistantMessageId =
      findMessageId(reloadedMessages, result.assistantMessageId) ??
      findMessageIdByBody(reloadedMessages, 'assistant', markerText);

    // 4. Search for the exact marker text.
    const searchResults = await ivxChatService.searchOwnerMessages({
      query: markerText,
      limit: 50,
    });
    result.searchFound = searchResults.some(
      (entry) => (entry.message.body ?? '').includes(markerText),
    );

    // 5. Compare the original IDs to the reloaded IDs.
    const userMatches =
      !!result.userMessageId && result.userMessageId === result.reloadUserMessageId;
    const assistantMatches = result.assistantMessageId
      ? result.assistantMessageId === result.reloadAssistantMessageId
      : !!result.reloadAssistantMessageId;
    result.idsMatch = userMatches && assistantMatches;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Owner AI durability proof failed.';
    console.log('[IVXDurabilityProof] Proof run failed:', result.error);
  }

  result.completedAt = nowIso();
  console.log('[IVXDurabilityProof] Proof run complete:', result);
  return result;
}
