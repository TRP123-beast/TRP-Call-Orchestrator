import { api } from '../lib/api';
import type { CallRecord } from './types';

export const getRecentCalls = () =>
  api.get<{ calls: CallRecord[] }>('/api/calls/recent').then((r) => r.calls);

export const getActiveCalls = () =>
  api.get<{ calls: CallRecord[] }>('/api/calls/active').then((r) => r.calls);

export const getTranscript = (id: string) =>
  api.get<{ call: CallRecord; transcript: string }>(`/api/calls/${id}/transcript`);

export const initiateCall = (agentId: string, propertyIds: string[]) =>
  api.post<{ callSid: string; status: string }>('/api/call/initiate', { agentId, propertyIds });
