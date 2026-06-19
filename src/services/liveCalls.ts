import { EventEmitter } from 'node:events';

/**
 * In-memory registry of calls currently in progress, shared between the voice
 * pipeline (:5050) and the dashboard API (:3000) — both run in one process.
 *
 * The voice pipeline writes here as a call progresses (start → transcript lines
 * → end); the dashboard reads a snapshot (/api/calls/live) and subscribes to the
 * 'update' event over SSE (/api/calls/stream) for real-time updates.
 */

export type LiveRole = 'caller' | 'ai';
export interface LiveLine {
  role: LiveRole;
  text: string;
  at: string;
}
export type LiveStatus = 'in-progress' | 'ended';
export interface LiveCall {
  callSid: string;
  agentName: string;
  agentPhone: string | null;
  status: LiveStatus;
  startedAt: string;
  transcript: LiveLine[];
}

export interface StartInfo {
  agentName?: string;
  agentPhone?: string | null;
}

// Keep ended calls visible briefly so the UI can show the wrap-up.
const LINGER_MS = 6_000;

class LiveCallStore extends EventEmitter {
  private calls = new Map<string, LiveCall>();

  start(callSid: string, info: StartInfo = {}): void {
    if (this.calls.has(callSid)) return;
    this.calls.set(callSid, {
      callSid,
      agentName: info.agentName ?? 'Caller',
      agentPhone: info.agentPhone ?? null,
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      transcript: [],
    });
    this.emit('update');
  }

  addLine(callSid: string, role: LiveRole, text: string): void {
    const call = this.calls.get(callSid);
    if (!call || !text.trim()) return;
    call.transcript.push({ role, text: text.trim(), at: new Date().toISOString() });
    this.emit('update');
  }

  end(callSid: string): void {
    const call = this.calls.get(callSid);
    if (!call) return;
    call.status = 'ended';
    this.emit('update');
    setTimeout(() => {
      this.calls.delete(callSid);
      this.emit('update');
    }, LINGER_MS).unref();
  }

  has(callSid: string): boolean {
    return this.calls.has(callSid);
  }

  list(): LiveCall[] {
    return [...this.calls.values()];
  }
}

export const liveCalls = new LiveCallStore();
// SSE means one listener per connected dashboard tab — lift the default cap.
liveCalls.setMaxListeners(100);
