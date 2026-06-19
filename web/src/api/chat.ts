import { api } from '../lib/api';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const sendChat = (message: string, history: ChatTurn[]) =>
  api.post<{ reply: string }>('/api/chat', { message, history });
