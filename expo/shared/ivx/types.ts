import type { PrivilegedIVXRole } from './access';

export const IVX_OWNER_AI_API_PATH = '/api/ivx/owner-ai';
export const IVX_OWNER_AI_BUCKET = 'ivx-owner-files';
export const IVX_CHAT_UPLOAD_BUCKET = 'ivx-chat-uploads';
export const IVX_OWNER_AI_MAX_UPLOAD_BYTES: number | null = null;

export const IVX_OWNER_AI_TABLES = {
  conversations: 'ivx_conversations',
  messages: 'ivx_messages',
  inboxState: 'ivx_inbox_state',
  aiRequests: 'ivx_ai_requests',
  knowledgeDocuments: 'ivx_knowledge_documents',
  knowledgeChunks: 'ivx_knowledge_chunks',
  commandLogs: 'ivx_command_logs',
  accessTestRows: 'ivx_access_test_rows',
} as const;

export type IVXOwnerRole = PrivilegedIVXRole;
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
  requestId?: string;
  conversationId?: string;
  message: string;
  senderLabel?: string | null;
  mode?: IVXRequestMode;
  persistUserMessage?: boolean;
  persistAssistantMessage?: boolean;
  devTestModeActive?: boolean;
};

export type IVXOwnerAIToolOutput = {
  tool: string;
  ok: boolean;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  timestamp: string;
};

export type IVXOwnerAIResponse = {
  requestId: string;
  conversationId: string;
  answer: string;
  model: string;
  status: 'ok';
  source?: 'remote_api' | 'local_app_brain' | 'provider_fallback';
  provider?: 'chatgpt';
  endpoint?: string;
  deploymentMarker?: string;
  assistantMessageId?: string | null;
  assistantPersisted?: boolean;
  selectedTool?: string | null;
  toolInput?: Record<string, unknown>[];
  toolOutput?: unknown[];
  fallbackUsed?: boolean;
  toolOutputs?: IVXOwnerAIToolOutput[];
};

export type IVXOwnerAICanonicalResponse = {
  requestId: string;
  conversationId: string;
  answer: string;
  model: string;
  status: 'ok';
  source: 'remote_api' | 'local_app_brain';
  provider?: 'chatgpt';
  deploymentMarker?: string;
  assistantMessageId?: string | null;
  assistantPersisted?: boolean;
  selectedTool?: string | null;
  toolInput?: Record<string, unknown>[];
  toolOutput?: unknown[];
  fallbackUsed?: boolean;
  toolOutputs?: IVXOwnerAIToolOutput[];
};

export type IVXOwnerAIRejectedResponse = {
  reason:
    | 'non_object_payload'
    | 'missing_request_id'
    | 'missing_conversation_id'
    | 'missing_answer'
    | 'missing_model'
    | 'invalid_status'
    | 'invalid_source'
    | 'invalid_deployment_marker';
  payloadType: 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'undefined';
};

export type IVXOwnerAIRoomStatus = {
  storageMode: 'primary_supabase_tables' | 'alternate_room_schema' | 'snapshot_storage' | 'local_device_only';
  visibility: 'private' | 'shared' | 'local_only';
  deliveryMethod: 'primary_realtime' | 'primary_polling' | 'alternate_shared' | 'snapshot_fallback' | 'local_only';
  warning?: string;
};

export type IVXOwnerAICapabilityId =
  | 'ai_chat'
  | 'knowledge_answers'
  | 'owner_commands'
  | 'code_aware_support'
  | 'file_upload'
  | 'inbox_sync'
  | 'backend_access'
  | 'supabase_inspection'
  | 'supabase_tables'
  | 'supabase_schema'
  | 'supabase_columns'
  | 'supabase_rls';

export type IVXOwnerAICapabilityProof = {
  success: boolean;
  executable: boolean;
  functionName: string;
  checkedAt: string;
  proof: Record<string, unknown>;
  error?: string;
};

export type IVXOwnerAIHealthProbeResponse = IVXOwnerAIResponse & {
  probe: true;
  resolvedSchema: 'ivx' | 'generic' | 'none';
  roomStatus: IVXOwnerAIRoomStatus;
  capabilities: Record<IVXOwnerAICapabilityId, boolean>;
  capabilityProofs: Record<IVXOwnerAICapabilityId, IVXOwnerAICapabilityProof>;
};

export type IVXApiError = {
  error: string;
  statusCode: number;
};
