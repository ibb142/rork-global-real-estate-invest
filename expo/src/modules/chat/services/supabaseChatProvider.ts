import {
  loadRoomMessages,
  sendAttachmentMessage,
  sendTextMessage,
  subscribeToRoomMessages,
} from './ivxChat';
import {
  type RoomStateSnapshot,
  getAuthorativeRoomStatus,
  getRoomStateSnapshot,
  initRoomStateManager,
  subscribeToRoomState,
  generateSendCorrelationId,
} from './roomStateManager';
import type { ChatProvider, ChatRoomStatus, SendMessageInput } from '../types/chat';

type ChatStorageMode = 'unknown' | 'primary' | 'room' | 'fallback' | 'local';

export type ChatStorageStatus = {
  mode: ChatStorageMode;
  label: string;
  detail: string;
  persistenceLabel: string;
  deliveryLabel: string;
  visibilityLabel: string;
  warning?: string | null;
};

const storageModeListeners = new Set<(mode: ChatStorageMode) => void>();
const roomStatusListeners = new Set<(status: ChatRoomStatus | null) => void>();
let currentRoomStatus: ChatRoomStatus | null = null;
let roomStateWired = false;
let currentStorageStatus: ChatStorageStatus = {
  mode: 'unknown',
  label: 'Detecting room backend',
  detail: 'The app is checking which IVX chat storage path is available for this room right now.',
  persistenceLabel: 'Checking now',
  deliveryLabel: 'Checking now',
  visibilityLabel: 'Checking now',
  warning: null,
};

function buildStorageStatus(mode: ChatStorageMode, warning?: string | null): ChatStorageStatus {
  switch (mode) {
    case 'primary':
      return {
        mode,
        label: 'Primary Supabase chat',
        detail: 'This IVX room is using the main conversations, participants, and messages tables with live sync.',
        persistenceLabel: 'Shared in Supabase',
        deliveryLabel: 'Realtime + polling fallback',
        visibilityLabel: 'Visible to room participants',
        warning: warning ?? null,
      };
    case 'room':
      return {
        mode,
        label: 'Alternate room schema',
        detail: 'This IVX room is using the alternate chat_rooms and room_messages storage path.',
        persistenceLabel: 'Shared in Supabase',
        deliveryLabel: 'Alternate shared delivery',
        visibilityLabel: 'Visible to room participants',
        warning: warning ?? null,
      };
    case 'fallback':
      return {
        mode,
        label: 'Snapshot fallback',
        detail: 'This IVX room is storing messages in the snapshot fallback path because the shared room tables are unavailable.',
        persistenceLabel: 'Shared in Supabase',
        deliveryLabel: 'Polling snapshot mode',
        visibilityLabel: 'Shared fallback visibility',
        warning: warning ?? null,
      };
    case 'local':
      return {
        mode,
        label: 'Local device fallback',
        detail: 'This IVX room is only saving messages on the current device because shared writes are blocked right now.',
        persistenceLabel: 'Only on this device',
        deliveryLabel: 'Local cache only',
        visibilityLabel: 'Not shared with other users',
        warning: warning ?? null,
      };
    case 'unknown':
    default:
      return {
        mode: 'unknown',
        label: 'Detecting room backend',
        detail: 'The app is checking which IVX chat storage path is available for this room right now.',
        persistenceLabel: 'Checking now',
        deliveryLabel: 'Checking now',
        visibilityLabel: 'Checking now',
        warning: warning ?? null,
      };
  }
}

function mapRoomStatusToStorageMode(status: ChatRoomStatus): ChatStorageMode {
  switch (status.storageMode) {
    case 'primary_supabase_tables':
      return 'primary';
    case 'alternate_room_schema':
      return 'room';
    case 'snapshot_storage':
      return 'fallback';
    case 'local_device_only':
      return 'local';
    default:
      return 'unknown';
  }
}

function syncStorageStatus(status: ChatRoomStatus): void {
  const nextMode = mapRoomStatusToStorageMode(status);
  const nextStatus = buildStorageStatus(nextMode, status.warning ?? null);
  const currentStorageSignature = JSON.stringify(currentStorageStatus);
  const nextStorageSignature = JSON.stringify(nextStatus);
  const currentRoomSignature = JSON.stringify(currentRoomStatus);
  const nextRoomSignature = JSON.stringify(status);

  currentRoomStatus = status;
  if (currentRoomSignature !== nextRoomSignature) {
    console.log('[SupabaseChatProvider] Chat room status changed:', currentRoomStatus);
    roomStatusListeners.forEach((listener) => {
      listener(currentRoomStatus);
    });
  }

  if (currentStorageSignature === nextStorageSignature) {
    return;
  }

  currentStorageStatus = nextStatus;
  console.log('[SupabaseChatProvider] Chat storage status changed:', currentStorageStatus);
  storageModeListeners.forEach((listener) => {
    listener(currentStorageStatus.mode);
  });
}

function wireRoomStateManager(): void {
  if (roomStateWired) return;
  roomStateWired = true;

  initRoomStateManager();
  subscribeToRoomState((snapshot: RoomStateSnapshot) => {
    if (snapshot.status) {
      syncStorageStatus(snapshot.status);
    }
  });

  const initial = getRoomStateSnapshot();
  if (initial.status) {
    syncStorageStatus(initial.status);
  }
}

export function subscribeToChatStorageMode(listener: (mode: ChatStorageMode) => void): () => void {
  storageModeListeners.add(listener);
  return () => {
    storageModeListeners.delete(listener);
  };
}

export function subscribeToChatRoomStatus(listener: (status: ChatRoomStatus | null) => void): () => void {
  roomStatusListeners.add(listener);
  return () => {
    roomStatusListeners.delete(listener);
  };
}

export function getCurrentChatRoomStatus(): ChatRoomStatus | null {
  wireRoomStateManager();
  const authoritative = getAuthorativeRoomStatus();
  if (authoritative && authoritative.storageMode !== 'local_device_only') {
    return authoritative;
  }
  return currentRoomStatus ?? authoritative;
}

export function getChatStorageStatus(mode: ChatStorageMode = currentStorageStatus.mode): ChatStorageStatus {
  if (mode === currentStorageStatus.mode) {
    return currentStorageStatus;
  }

  return buildStorageStatus(mode, currentStorageStatus.warning ?? null);
}

export const supabaseChatProvider: ChatProvider = {
  async listMessages(conversationId: string) {
    wireRoomStateManager();
    console.log('[SupabaseChatProvider] Loading IVX room messages:', conversationId);
    const loaded = await loadRoomMessages(conversationId);
    syncStorageStatus(loaded.status);
    return loaded.messages;
  },

  async sendMessage(input: SendMessageInput) {
    wireRoomStateManager();
    const sendCid = generateSendCorrelationId();
    const roomSnapshot = getRoomStateSnapshot();

    console.log('[SupabaseChatProvider] Send start:', {
      cid: sendCid,
      conversationId: input.conversationId,
      senderId: input.senderId,
      hasText: !!input.text?.trim(),
      hasFileUrl: !!input.fileUrl,
      hasUpload: !!input.upload,
      fileType: input.fileType ?? null,
      roomPhase: roomSnapshot.phase,
      roomMode: roomSnapshot.status?.storageMode ?? 'unknown',
    });

    const hasAttachment = !!input.upload || !!input.fileUrl?.trim();
    const result = hasAttachment
      ? await sendAttachmentMessage(input)
      : await sendTextMessage(input);

    console.log('[SupabaseChatProvider] Send complete:', {
      cid: sendCid,
      resultMode: result.status.storageMode,
      resultDelivery: result.status.deliveryMethod,
      messageId: result.message?.id ?? 'unknown',
    });

    syncStorageStatus(result.status);
  },

  subscribeToMessages(conversationId: string, onMessage) {
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      try {
        const subscription = await subscribeToRoomMessages(
          conversationId,
          (message) => {
            if (disposed) {
              return;
            }

            onMessage(message);
          },
          (status) => {
            if (disposed) {
              return;
            }

            syncStorageStatus(status);
          },
        );

        if (disposed) {
          subscription.unsubscribe();
          return;
        }

        cleanup = subscription.unsubscribe;
      } catch (error) {
        console.log('[SupabaseChatProvider] Room subscription note:', (error as Error)?.message ?? 'Unknown error');
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  },
};
