import { useEffect, useRef } from 'react';
import type { SmsMessage, Workflow } from '../../api/types';
import { MessageBubble } from './MessageBubble';
import { dayLabel } from '../../lib/format';

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-trp-border" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-trp-muted">{label}</span>
      <span className="h-px flex-1 bg-trp-border" />
    </div>
  );
}

const STAGE_HINT: Record<string, string> = {
  initial: 'Initial outreach → awaiting availability',
  availability: 'Availability confirmed → asking about offers/pets',
  offers: 'Reviewing offers → confirming pet policy',
  pets: 'Pet policy confirmed → final confirmation',
  confirm: 'Finalizing the showing',
};

function stageBanner(stage: string | null): string {
  const s = (stage ?? '').toLowerCase();
  const key = Object.keys(STAGE_HINT).find((k) => s.includes(k));
  return key ? STAGE_HINT[key] : 'Workflow in progress';
}

export function MessageThread({
  messages,
  workflow,
}: {
  messages: SmsMessage[];
  workflow?: Workflow;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Group consecutive messages by day for separators.
  let lastDay = '';

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
      {workflow && (
        <div className="mb-3 rounded-lg border border-trp-accent/30 bg-trp-accent/10 px-3.5 py-2 text-xs text-trp-accent">
          <span className="font-semibold uppercase tracking-wide">Stage:</span>{' '}
          {stageBanner(workflow.stage)}
        </div>
      )}

      {messages.length === 0 && (
        <p className="m-auto text-sm text-trp-muted">No messages in this conversation yet.</p>
      )}

      <div className="flex flex-col gap-2">
        {messages.map((m) => {
          const day = dayLabel(m.createdAt);
          const sep = day && day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {sep && <DateSeparator label={day} />}
              <MessageBubble m={m} />
            </div>
          );
        })}
      </div>
      <div ref={endRef} />
    </div>
  );
}
