import { api } from '../lib/api';

export interface TurnResult {
  transcript: string;
  reply: string;
  audio: string | null; // data:audio/mpeg;base64,...
  empty?: boolean;
}

export const webcallStart = (sessionId: string) =>
  api.post<{ reply: string; audio: string }>('/api/webcall/start', { sessionId });

export const webcallTurn = (sessionId: string, audioBase64: string, mime: string) =>
  api.post<TurnResult>('/api/webcall/turn', { sessionId, audioBase64, mime });

export const webcallEnd = (sessionId: string) =>
  api.post<{ ok: boolean }>('/api/webcall/end', { sessionId });
