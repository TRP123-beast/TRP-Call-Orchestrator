import { Check, CheckCheck, Clock } from 'lucide-react';
import type { SmsMessage } from '../../api/types';
import { timeLabel } from '../../lib/format';

function StatusIcon({ status }: { status: string }) {
  if (status === 'sending') return <Clock size={12} className="text-trp-bg/70" />;
  if (status === 'delivered') return <CheckCheck size={12} className="text-trp-bg/70" />;
  if (status === 'failed') return <span className="text-[10px] font-bold text-trp-error">failed</span>;
  return <Check size={12} className="text-trp-bg/70" />;
}

export function MessageBubble({ m }: { m: SmsMessage }) {
  const outbound = m.direction === 'outbound';
  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%]">
        <div
          className={`animate-trp-fade-in rounded-2xl px-3.5 py-2 text-sm ${
            outbound
              ? 'rounded-br-sm bg-trp-accent text-trp-bg'
              : 'rounded-bl-sm bg-trp-surface-hover text-trp-text'
          }`}
        >
          {m.body}
        </div>
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] text-trp-muted ${outbound ? 'justify-end' : 'justify-start'}`}
        >
          {timeLabel(m.createdAt)}
          {outbound && <StatusIcon status={m.status} />}
        </div>
      </div>
    </div>
  );
}
