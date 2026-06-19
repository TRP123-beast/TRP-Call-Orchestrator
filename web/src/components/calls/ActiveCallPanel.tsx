import { useEffect, useState } from 'react';
import { PhoneOff, PhoneForwarded, MicOff } from 'lucide-react';
import type { CallRecord } from '../../api/types';
import { Avatar } from '../shared/Avatar';
import { CallTranscript } from './CallTranscript';
import { useToast } from '../ui/Toast';

function useElapsed(since: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function Waveform() {
  // Purely decorative animated bars.
  return (
    <div className="flex h-8 items-center gap-0.5">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-trp-accent/70"
          style={{
            height: `${20 + Math.abs(Math.sin(i * 0.9)) * 80}%`,
            animation: `trp-pulse ${0.8 + (i % 5) * 0.12}s ease-in-out ${i * 0.04}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ActiveCard({ call }: { call: CallRecord }) {
  const elapsed = useElapsed(call.createdAt);
  const toast = useToast();
  const notAvailable = () =>
    toast({ type: 'info', message: 'Live call controls connect to the voice server (:5050) — not wired in this build.' });

  return (
    <div className="rounded-xl bg-trp-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-full bg-trp-error/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-trp-error">
          <span className="h-2 w-2 rounded-full bg-trp-error animate-trp-pulse" />
          Live
        </span>
        <Avatar name={call.agentName ?? 'Unknown'} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{call.agentName ?? 'Unknown agent'}</div>
          <div className="text-xs text-trp-muted">{call.agentPhone ?? ''}</div>
        </div>
        <span className="ml-auto font-mono text-lg tabular-nums text-trp-accent">{elapsed}</span>
      </div>

      <div className="my-4">
        <Waveform />
      </div>

      <div className="max-h-32 overflow-y-auto rounded-lg border border-trp-border bg-trp-bg p-3">
        <CallTranscript transcript={call.transcript ?? ''} />
        {!call.transcript && <p className="text-sm text-trp-muted">Listening…</p>}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={notAvailable}
          className="flex items-center gap-1.5 rounded-lg bg-trp-error px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
        >
          <PhoneOff size={14} /> End Call
        </button>
        <button
          onClick={notAvailable}
          className="flex items-center gap-1.5 rounded-lg border border-trp-border px-3.5 py-2 text-xs font-semibold transition hover:bg-trp-surface-hover"
        >
          <PhoneForwarded size={14} /> Transfer
        </button>
        <button
          onClick={notAvailable}
          className="flex items-center gap-1.5 rounded-lg border border-trp-border px-3.5 py-2 text-xs font-semibold transition hover:bg-trp-surface-hover"
        >
          <MicOff size={14} /> Mute
        </button>
      </div>
    </div>
  );
}

export function ActiveCallPanel({ calls }: { calls: CallRecord[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="rounded-2xl bg-gradient-to-r from-trp-accent to-trp-success p-px">
      <div className="rounded-2xl bg-trp-bg p-1">
        <div className="flex flex-col gap-3">
          {calls.map((c) => (
            <ActiveCard key={c.id} call={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
