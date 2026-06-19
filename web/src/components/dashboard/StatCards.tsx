import { useQuery } from '@tanstack/react-query';
import { Activity, Phone, MessageSquare, TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { getStats } from '../../api/dashboard';

function Card({
  label,
  value,
  icon: Icon,
  children,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-trp-border bg-trp-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-trp-muted">{label}</span>
        <Icon size={16} className="text-trp-muted" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {children}
      </div>
    </div>
  );
}

export function StatCards() {
  const { data } = useQuery({ queryKey: ['stats'], queryFn: getStats, refetchInterval: 10_000 });

  const trend = data?.callsTrendPct ?? null;
  const success = data?.successRate ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Active workflows" value={data?.activeWorkflows ?? 0} icon={Activity}>
        {(data?.activeWorkflows ?? 0) > 0 && (
          <span className="mb-1.5 h-2 w-2 rounded-full bg-trp-success animate-trp-pulse" />
        )}
      </Card>

      <Card label="Calls today" value={data?.callsToday ?? 0} icon={Phone}>
        {trend !== null && (
          <span
            className={`mb-1 flex items-center gap-0.5 text-xs font-semibold ${trend >= 0 ? 'text-trp-success' : 'text-trp-error'}`}
          >
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend)}%
          </span>
        )}
      </Card>

      <Card label="Messages today" value={data?.messagesToday ?? 0} icon={MessageSquare} />

      <Card label="Success rate" value={`${success}%`} icon={TrendingUp}>
        <span
          className={`mb-2 h-2 w-2 rounded-full ${success >= 50 ? 'bg-trp-success' : 'bg-trp-error'}`}
        />
      </Card>
    </div>
  );
}
