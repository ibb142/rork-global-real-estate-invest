import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID } from '@/constants/ivx-owner-ai';

type KnownChatRoom = {
  canonicalId: string;
  displayId: string;
  aliases: string[];
  title: string;
  subtitle: string;
};

type ChatActorFallbackKey = 'preview' | 'admin';

export const IVX_OWNER_ROOM_ID = IVX_OWNER_AI_ROOM_ID;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAT_ACTOR_FALLBACK_IDS: Record<ChatActorFallbackKey, string> = {
  preview: '0ecf4e4c-8f72-4ca0-9fbe-d31e8df4f001',
  admin: '0ecf4e4c-8f72-4ca0-9fbe-d31e8df4f002',
};

const KNOWN_CHAT_ROOMS: KnownChatRoom[] = [
  {
    canonicalId: IVX_OWNER_ROOM_ID,
    displayId: 'ivx-owner-room',
    aliases: ['ivx-owner-room', 'owner-room', 'ivx_owner_room'],
    title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
  },
];

function normalizeRoomKey(value: string): string {
  return value.trim().toLowerCase();
}

export function getKnownChatRoom(value: string | null | undefined): KnownChatRoom | null {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) {
    return null;
  }

  const normalizedValue = normalizeRoomKey(trimmedValue);

  for (const room of KNOWN_CHAT_ROOMS) {
    if (normalizeRoomKey(room.canonicalId) === normalizedValue) {
      return room;
    }

    if (normalizeRoomKey(room.displayId) === normalizedValue) {
      return room;
    }

    if (room.aliases.some((alias) => normalizeRoomKey(alias) === normalizedValue)) {
      return room;
    }
  }

  return null;
}

export function isUuidConversationId(value: string | null | undefined): boolean {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) {
    return false;
  }

  return UUID_PATTERN.test(trimmedValue);
}

export function resolveChatActorId(
  value: string | null | undefined,
  fallbackKey: ChatActorFallbackKey = 'preview',
): string {
  const trimmedValue = value?.trim() ?? '';
  if (isUuidConversationId(trimmedValue)) {
    return trimmedValue;
  }

  return CHAT_ACTOR_FALLBACK_IDS[fallbackKey];
}

export function resolveChatConversationId(value: string | null | undefined): string {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) {
    return '';
  }

  return getKnownChatRoom(trimmedValue)?.canonicalId ?? trimmedValue;
}

export function getChatConversationDisplayId(value: string | null | undefined): string {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) {
    return '';
  }

  return getKnownChatRoom(trimmedValue)?.displayId ?? trimmedValue;
}

export function getChatConversationTitle(
  value: string | null | undefined,
  fallbackTitle?: string | null,
): string | null {
  const trimmedFallback = fallbackTitle?.trim();
  if (trimmedFallback) {
    return trimmedFallback;
  }

  return getKnownChatRoom(value)?.title ?? null;
}

export function getChatConversationSubtitle(
  value: string | null | undefined,
  fallbackSubtitle?: string | null,
): string | null {
  const trimmedFallback = fallbackSubtitle?.trim();
  if (trimmedFallback) {
    return trimmedFallback;
  }

  return getKnownChatRoom(value)?.subtitle ?? null;
}

export function getChatConversationBootstrap(value: string | null | undefined): {
  conversationId: string;
  title: string;
  subtitle: string;
} | null {
  const room = getKnownChatRoom(value);
  if (!room) {
    return null;
  }

  return {
    conversationId: room.canonicalId,
    title: room.title,
    subtitle: room.subtitle,
  };
}
