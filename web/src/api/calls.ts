import { api } from '../lib/api';
import type { CallFilters, CallRecord } from './types';

export const getCallHistory = (f: CallFilters) => {
  const q = new URLSearchParams({ type: f.type, status: f.status, search: f.search }).toString();
  return api.get<{ calls: CallRecord[] }>(`/api/calls/history?${q}`).then((r) => r.calls);
};

export const endLiveCall = (sid: string) =>
  api.post<{ ok: boolean }>(`/api/calls/${sid}/end`, {});

export const getTranscript = (id: string) =>
  api.get<{ call: CallRecord; transcript: string }>(`/api/calls/${id}/transcript`);

export const initiateCall = (agentId: string, propertyIds: string[]) =>
  api.post<{ callSid: string; status: string }>('/api/call/initiate', { agentId, propertyIds });
