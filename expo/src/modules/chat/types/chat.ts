export type ChatFileType = 'image' | 'video' | 'pdf' | 'file';

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  text?: string | null;
  fileUrl?: string | null;
  fileType?: ChatFileType | null;
  createdAt: string;
};

export type SendMessageInput = {
  conversationId: string;
  senderId: string;
  text?: string;
  fileUrl?: string;
  fileType?: ChatFileType;
};

export interface ChatProvider {
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(input: SendMessageInput): Promise<void>;
  subscribeToMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
  ): () => void;
}
