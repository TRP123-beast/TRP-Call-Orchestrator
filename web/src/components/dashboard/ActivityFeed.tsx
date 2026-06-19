import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Phone, MessageSquare, Activity as ActivityIcon } from 'lucide-react';
import { getActivity } from '../../api/dashboard';
import type { ActivityItem } from '../../api/types';
import { Panel } from '../shared/Panel';
import { EmptyState } from '../shared/EmptyState';
import { relativeTime } from '../../lib/format';

const ICON = { call: Phone, sms: MessageSquare } as const;
const TINT: Record<string, string> = {
  completed: 'text-trp-success bg-trp-success/15',
  confirmed: 'text-trp-success bg-trp-success/15',
  delivered: 'text-trp-success bg-trp-success/15',
  no_answer: 'text-trp-warning bg-trp-warning/15',
  voicemail: 'text-trp-purple bg-trp-purple/15',
  failed: 'text-trp-error bg-trp-error/15',
};

function Item({ a }: { a: ActivityItem }) {
  const navigate = useNavigate();
  const Icon = ICON[a.type];
  const tint = TINT[a.status] ?? 'text-trp-accent bg-trp-accent/15';
  return (
    <button
      onClick={() => navigate(a.link.page === 'messages' ? '/messages' : '/calls')}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-trp-surface-hover"
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{a.title}</div>
        {a.detail && <div className="truncate text-xs text-trp-muted">{a.detail}</div>}
      </div>
      <span className="shrink-0 text-[10px] text-trp-muted">{relativeTime(a.at)}</span>
    </button>
  );
}

export function ActivityFeed() {
  const { data: activity = [] } = useQuery({
    queryKey: ['activity'],
    queryFn: getActivity,
    refetchInterval: 10_000,
  });

  return (
    <Panel title="Recent Activity" bodyClassName={activity.length ? 'flex flex-col gap-0.5' : 'p-0'}>
      {activity.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activity yet" description="Calls and texts will show up here." />
      ) : (
        activity.map((a) => <Item key={a.id} a={a} />)
      )}
    </Panel>
  );
}
