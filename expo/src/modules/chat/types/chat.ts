export type ChatFileType = 'image' | 'video' | 'pdf' | 'file';

export type MessageSendStatus = 'sending' | 'sent' | 'failed';

export type DeliveryMode =
  | 'primary_realtime'
  | 'primary_polling'
  | 'alternate_shared'
  | 'snapshot_fallback'
  | 'local_only';

export type StorageMode =
  | 'primary_supabase_tables'
  | 'alternate_room_schema'
  | 'snapshot_storage'
  | 'local_device_only';

export type RoomVisibility = 'private' | 'shared' | 'local_only';

export type WebUploadFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  type?: string;
  size?: number;
  name?: string;
};

export type UploadableFile = {
  uri?: string;
  file?: WebUploadFile | null;
  name: string;
  type?: string | null;
  size?: number | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderLabel?: string | null;
  text?: string | null;
  fileUrl?: string | null;
  fileType?: ChatFileType | null;
  fileName?: string | null;
  fileMime?: string | null;
  fileSize?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  readBy?: string[] | null;
  localOnly?: boolean;
  deliveryMode?: DeliveryMode;
  sendStatus?: MessageSendStatus;
  optimistic?: boolean;
  retryPayload?: SendMessageInput;
};

export type ChatConversation = {
  id: string;
  slug?: string | null;
  title: string;
  subtitle?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
};

export type ChatParticipant = {
  conversationId: string;
  userId: string;
  unreadCount?: number | null;
  lastReadAt?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type ChatRoomStatus = {
  storageMode: StorageMode;
  visibility: RoomVisibility;
  deliveryMethod: DeliveryMode;
  warning?: string;
};

export type CapabilityState = 'available' | 'degraded' | 'unavailable';

export type ServiceRuntimeHealth = 'active' | 'degraded' | 'inactive';

export type AIResponseState = 'inactive' | 'idle' | 'responding';

export type ChatRoomRuntimeSignals = {
  aiBackendHealth?: ServiceRuntimeHealth;
  knowledgeBackendHealth?: ServiceRuntimeHealth;
  ownerCommandAvailability?: ServiceRuntimeHealth;
  codeAwareServiceAvailability?: ServiceRuntimeHealth;
  aiResponseState?: AIResponseState;
};

export type InboxItem = {
  conversationId: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
};

export type SendMessageInput = {
  conversationId: string;
  senderId: string;
  senderLabel?: string | null;
  text?: string;
  fileUrl?: string;
  fileType?: ChatFileType;
  fileName?: string;
  fileMime?: string | null;
  fileSize?: number | null;
  upload?: UploadableFile;
};

export type MessageSubscription = {
  unsubscribe: () => void;
};

export interface ChatProvider {
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(input: SendMessageInput): Promise<void>;
  subscribeToMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
  ): () => void;
}
