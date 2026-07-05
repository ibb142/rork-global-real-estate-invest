import type { ChatProvider } from '../types/chat';

let activeProvider: ChatProvider | null = null;

export const setChatProvider = (provider: ChatProvider): void => {
  console.log('[ChatProvider] Provider configured');
  activeProvider = provider;
};

export const getChatProvider = (): ChatProvider => {
  if (!activeProvider) {
    throw new Error('Chat provider not configured. Configure it during app bootstrap before using the chat module.');
  }

  return activeProvider;
};
