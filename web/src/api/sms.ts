import { api } from '../lib/api';
import type { AgentSummary, Conversation, SmsMessage } from './types';

export const getConversations = () =>
  api.get<{ conversations: Conversation[] }>('/api/sms/conversations').then((r) => r.conversations);

export const getConversation = (agentId: string) =>
  api.get<{ agent: AgentSummary | null; messages: SmsMessage[] }>(
    `/api/sms/conversation/${agentId}`,
  );

export const sendSms = (to: string, body: string, listingAgentId?: string) =>
  api.post<{ ok: boolean; sid: string }>('/api/sms/send', { to, body, listingAgentId });
