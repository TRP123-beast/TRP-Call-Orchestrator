import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  Download,
  RefreshCw,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import type { CallRecord } from '../../api/types';
import { initiateCall } from '../../api/calls';
import { Avatar } from '../shared/Avatar';
import { Badge } from '../shared/Badge';
import { CallTranscript } from './CallTranscript';
import { useToast } from '../ui/Toast';
import { duration, relativeTime } from '../../lib/format';

const STATUS: Record<string, { variant: 'success' | 'warning' | 'error' | 'purple' | 'info'; label: string }> = {
  completed: { variant: 'success', label: 'Completed' },
  no_answer: { variant: 'warning', label: 'No answer' },
  voicemail: { variant: 'purple', label: 'Voicemail' },
  failed: { variant: 'error', label: 'Failed' },
  answered: { variant: 'info', label: 'In progress' },
  initiated: { variant: 'info', label: 'Initiated' },
};

/** First spoken line as a one-line outcome summary. */
function outcome(transcript: string | null): string {
  if (!transcript) return '';
  const line = transcript.split('\n').find((l) => /^(ai|assistant)\s*:/i.test(l.trim()));
  return (line ?? transcript.split('\n')[0] ?? '').replace(/^(ai|assistant|caller|agent)\s*:\s*/i, '').slice(0, 70);
}

export function CallCard({ call }: { call: CallRecord }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const outbound = call.callType.startsWith('outbound');
  const status = STATUS[call.status] ?? { variant: 'info' as const, label: call.status };
  const name = call.agentName ?? 'Unknown agent';
  const retryable = call.status === 'no_answer' || call.status === 'failed';

  const retry = useMutation({
    mutationFn: () => initiateCall(call.agentId as string, call.propertyIds),
    onSuccess: (r) => {
      toast({ type: 'success', message: `Retrying call to ${name} (${r.status})` });
      void qc.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: (e) => toast({ type: 'error', message: e instanceof Error ? e.message : 'Retry failed' }),
  });

  const download = () => {
    const blob = new Blob([call.transcript ?? ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-${call.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-trp-border bg-trp-bg">
      {/* Row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-trp-surface-hover"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${outbound ? 'bg-trp-accent/15 text-trp-accent' : 'bg-trp-success/15 text-trp-success'}`}
        >
          {outbound ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
        </span>
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="hidden text-xs text-trp-muted sm:inline">{call.agentPhone ?? ''}</span>
          </div>
          <div className="truncate text-xs text-trp-muted">{outcome(call.transcript) || `${call.propertyIds.length} propert${call.propertyIds.length === 1 ? 'y' : 'ies'}`}</div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {call.propertyIds.slice(0, 2).map((id) => (
            <Badge key={id} size="sm">
              {id.slice(0, 6)}
            </Badge>
          ))}
          {call.propertyIds.length > 2 && (
            <span className="text-[10px] text-trp-muted">+{call.propertyIds.length - 2}</span>
          )}
        </div>
        <span className="w-16 shrink-0 text-right text-xs text-trp-muted tabular-nums">
          {duration(call.durationSeconds)}
        </span>
        <Badge variant={status.variant} size="sm">
          {status.label}
        </Badge>
        <span className="hidden w-20 shrink-0 text-right text-[10px] text-trp-muted lg:inline">
          {relativeTime(call.createdAt)}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-trp-muted transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded */}
      {open && (
        <div className="animate-trp-fade-in border-t border-trp-border bg-trp-surface px-4 py-4">
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-trp-muted">
                Transcript
              </h4>
              <CallTranscript transcript={call.transcript ?? ''} />
            </div>
            <div className="text-xs text-trp-muted">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider">Metadata</h4>
              <dl className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <dt>Call ID</dt>
                  <dd className="truncate font-mono text-trp-text/80">{call.id.slice(0, 8)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Type</dt>
                  <dd className="text-trp-text/80">{call.callType}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Duration</dt>
                  <dd className="text-trp-text/80">{duration(call.durationSeconds)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Properties</dt>
                  <dd className="text-trp-text/80">{call.propertyIds.length}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {retryable && call.agentId && (
              <button
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-trp-accent px-3 py-1.5 text-xs font-semibold text-trp-bg transition enabled:hover:bg-trp-accent-hover disabled:opacity-40"
              >
                {retry.isPending ? <Loader2 size={13} className="animate-trp-spin" /> : <RefreshCw size={13} />}
                Retry Call
              </button>
            )}
            <button
              onClick={() => toast({ type: 'info', message: 'Switch to SMS — start a text from the Messages page.' })}
              className="flex items-center gap-1.5 rounded-lg border border-trp-border px-3 py-1.5 text-xs font-semibold transition hover:bg-trp-surface-hover"
            >
              <MessageSquare size={13} />
              Switch to SMS
            </button>
            <button
              onClick={download}
              disabled={!call.transcript}
              className="flex items-center gap-1.5 rounded-lg border border-trp-border px-3 py-1.5 text-xs font-semibold transition enabled:hover:bg-trp-surface-hover disabled:opacity-40"
            >
              <Download size={13} />
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
