import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Workflow as WorkflowIcon } from 'lucide-react';
import { getActiveWorkflows } from '../../api/dashboard';
import type { Workflow } from '../../api/types';
import { Panel } from '../shared/Panel';
import { Avatar } from '../shared/Avatar';
import { Badge } from '../shared/Badge';
import { EmptyState } from '../shared/EmptyState';
import { relativeTime } from '../../lib/format';

const STATUS_VARIANT = { pending: 'warning', confirmed: 'success', canceled: 'error' } as const;

function Steps({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < step ? 'bg-trp-accent' : 'bg-trp-border'}`}
        />
      ))}
    </div>
  );
}

function Row({ w }: { w: Workflow }) {
  const navigate = useNavigate();
  const channel = w.channel === 'text' ? 'text' : 'call';
  return (
    <button
      onClick={() => navigate(channel === 'text' ? '/messages' : '/calls')}
      className="flex w-full items-center gap-3 rounded-lg border border-trp-border bg-trp-bg px-3.5 py-3 text-left transition hover:border-trp-accent/50 hover:bg-trp-surface-hover"
    >
      <Avatar name={w.agentName} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{w.agentName}</span>
          <Badge variant={channel === 'text' ? 'success' : 'info'} size="sm">
            {channel}
          </Badge>
        </div>
        <div className="truncate text-xs text-trp-muted">
          {w.agentPhone ?? '—'} · {w.propertyIds.length} propert{w.propertyIds.length === 1 ? 'y' : 'ies'}
        </div>
        <div className="mt-2">
          <Steps step={w.step} total={w.totalSteps} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Badge variant={STATUS_VARIANT[w.status]} size="sm">
          {w.status}
        </Badge>
        <span className="text-[10px] text-trp-muted">{relativeTime(w.startedAt)}</span>
      </div>
    </button>
  );
}

export function ActiveWorkflows() {
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', 'active'],
    queryFn: getActiveWorkflows,
    refetchInterval: 10_000,
  });

  return (
    <Panel
      title="Active Workflows"
      action={<span className="text-xs text-trp-muted">{workflows.length} active</span>}
      bodyClassName={workflows.length ? 'flex flex-col gap-2' : 'p-0'}
    >
      {workflows.length === 0 ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No active workflows"
          description="Start a call or text from Quick Actions to kick one off."
        />
      ) : (
        workflows.map((w) => <Row key={w.id} w={w} />)
      )}
    </Panel>
  );
}
