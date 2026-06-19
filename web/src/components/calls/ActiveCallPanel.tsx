import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PhoneOff, PhoneForwarded, MicOff, Loader2 } from 'lucide-react';
import type { LiveCall } from '../../api/types';
import { endLiveCall } from '../../api/calls';
import { Avatar } from '../shared/Avatar';
import { Badge } from '../shared/Badge';
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

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-8 items-center gap-0.5">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-trp-accent/70"
          style={{
            height: `${20 + Math.abs(Math.sin(i * 0.9)) * 80}%`,
            animation: active ? `trp-pulse ${0.8 + (i % 5) * 0.12}s ease-in-out ${i * 0.04}s infinite` : 'none',
          }}
        />
      ))}
    </div>
  );
}

function ActiveCard({ call }: { call: LiveCall }) {
  const elapsed = useElapsed(call.startedAt);
  const toast = useToast();
  const live = call.status === 'in-progress';
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [call.transcript.length]);

  const end = useMutation({
    mutationFn: () => endLiveCall(call.callSid),
    onSuccess: () => toast({ type: 'success', message: 'Call ended' }),
    onError: (e) => toast({ type: 'error', message: e instanceof Error ? e.message : 'Could not end call' }),
  });

  const notAvailable = () =>
    toast({ type: 'info', message: 'Mute/Transfer aren’t supported over Twilio Media Streams.' });

  return (
    <div className="rounded-xl bg-trp-surface p-5">
      <div className="flex items-center gap-3">
        {live ? (
          <span className="flex items-center gap-1.5 rounded-full bg-trp-error/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-trp-error">
            <span className="h-2 w-2 rounded-full bg-trp-error animate-trp-pulse" />
            Live
          </span>
        ) : (
          <Badge variant="default" size="sm">
            ended
          </Badge>
        )}
        <Avatar name={call.agentName} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{call.agentName}</div>
          <div className="text-xs text-trp-muted">{call.agentPhone ?? ''}</div>
        </div>
        <span className="ml-auto font-mono text-lg tabular-nums text-trp-accent">{elapsed}</span>
      </div>

      <div className="my-4">
        <Waveform active={live} />
      </div>

      <div className="max-h-40 overflow-y-auto rounded-lg border border-trp-border bg-trp-bg p-3">
        {call.transcript.length === 0 ? (
          <p className="text-sm text-trp-muted">Listening…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {call.transcript.map((l, i) => (
              <div key={i} className="animate-trp-fade-in flex gap-2 text-sm">
                <span
                  className={`shrink-0 font-semibold ${l.role === 'ai' ? 'text-trp-accent' : 'text-trp-success'}`}
                >
                  {l.role === 'ai' ? 'AI' : 'Caller'}
                </span>
                <span className="text-trp-text/90">{l.text}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => end.mutate()}
          disabled={!live || end.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-trp-error px-3.5 py-2 text-xs font-semibold text-white transition enabled:hover:opacity-90 disabled:opacity-40"
        >
          {end.isPending ? <Loader2 size={14} className="animate-trp-spin" /> : <PhoneOff size={14} />}
          End Call
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

export function ActiveCallPanel({ calls }: { calls: LiveCall[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="rounded-2xl bg-gradient-to-r from-trp-accent to-trp-success p-px">
      <div className="rounded-2xl bg-trp-bg p-1">
        <div className="flex flex-col gap-3">
          {calls.map((c) => (
            <ActiveCard key={c.callSid} call={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
