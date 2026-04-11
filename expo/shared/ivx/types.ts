export const IVX_OWNER_AI_API_PATH = '/api/ivx/owner-ai';
export const IVX_OWNER_AI_BUCKET = 'ivx-owner-files';
export const IVX_OWNER_AI_MAX_UPLOAD_BYTES: number | null = null;

export const IVX_OWNER_AI_TABLES = {
  conversations: 'ivx_conversations',
  messages: 'ivx_messages',
  inboxState: 'ivx_inbox_state',
  aiRequests: 'ivx_ai_requests',
  knowledgeDocuments: 'ivx_knowledge_documents',
} as const;

export type IVXOwnerRole = 'owner';
export type IVXMessageSenderRole = 'owner' | 'assistant' | 'system';
export type IVXAttachmentKind = 'text' | 'image' | 'video' | 'pdf' | 'file' | 'command' | 'system';
export type IVXUploadSource = 'web' | 'mobile';
export type IVXRequestMode = 'chat' | 'command';

export type IVXConversation = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageText: string | null;
  lastMessageAt: string | null;
};

export type IVXMessage = {
  id: string;
  conversationId: string;
  senderUserId: string | null;
  senderRole: IVXMessageSenderRole;
  senderLabel: string | null;
  body: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  attachmentKind: IVXAttachmentKind;
  createdAt: string;
  updatedAt: string;
};

export type IVXInboxItem = {
  conversationId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  unreadCount: number;
  lastReadAt: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
};

export type IVXWebUploadFile = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  type?: string;
  size?: number;
  name?: string;
};

export type IVXUploadInput = {
  uri?: string;
  file?: IVXWebUploadFile | null;
  name: string;
  type?: string | null;
  size?: number | null;
};

export type IVXUploadedFile = {
  bucket: string;
  path: string;
  publicUrl: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  source: IVXUploadSource;
};

export type IVXOwnerAuthContext = {
  userId: string;
  email: string | null;
  role: IVXOwnerRole;
  accessToken: string;
};

export type IVXOwnerAIRequest = {
  conversationId?: string;
  message: string;
  senderLabel?: string | null;
  mode?: IVXRequestMode;
};

export type IVXOwnerAIResponse = {
  requestId: string;
  conversationId: string;
  answer: string;
  model: string;
  status: 'ok';
};

export type IVXOwnerAIRoomStatus = {
  storageMode: 'primary_supabase_tables' | 'alternate_room_schema' | 'snapshot_storage' | 'local_device_only';
  visibility: 'private' | 'shared' | 'local_only';
  deliveryMethod: 'primary_realtime' | 'primary_polling' | 'alternate_shared' | 'snapshot_fallback' | 'local_only';
  warning?: string;
};

export type IVXOwnerAIHealthProbeResponse = IVXOwnerAIResponse & {
  probe: true;
  resolvedSchema: 'ivx' | 'generic' | 'none';
  roomStatus: IVXOwnerAIRoomStatus;
  capabilities: {
    ai_chat: boolean;
    knowledge_answers: boolean;
    owner_commands: boolean;
    code_aware_support: boolean;
    file_upload: boolean;
    inbox_sync: boolean;
  };
};

export type IVXApiError = {
  error: string;
  statusCode: number;
};
