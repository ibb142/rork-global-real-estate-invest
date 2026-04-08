import { getChatProvider } from './chatProvider';
import type { ChatMessage, SendMessageInput } from '../types/chat';

export const chatService = {
  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    return getChatProvider().listMessages(conversationId);
  },

  async sendMessage(input: SendMessageInput): Promise<void> {
    return getChatProvider().sendMessage(input);
  },

  subscribeToMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
  ): () => void {
    return getChatProvider().subscribeToMessages(conversationId, onMessage);
  },
};
