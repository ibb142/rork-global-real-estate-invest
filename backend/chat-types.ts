export type ChatMessageSource = 'user' | 'assistant' | 'system';

export interface ChatRoomMessage {
  id: string;
  roomId: string;
  username: string;
  text: string;
  source: ChatMessageSource;
  createdAt: string;
}

export interface ChatRoomState {
  roomId: string;
  onlineCount: number;
}
