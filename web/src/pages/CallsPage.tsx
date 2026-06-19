import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Plus, PhoneOff, Search } from 'lucide-react';
import type { CallFilters } from '../api/types';
import { getCallHistory } from '../api/calls';
import { useLiveCalls } from '../lib/useLiveCalls';
import { ActiveCallPanel } from '../components/calls/ActiveCallPanel';
import { CallCard } from '../components/calls/CallCard';
import { NewCallModal } from '../components/calls/NewCallModal';
import { Panel } from '../components/shared/Panel';
import { EmptyState } from '../components/shared/EmptyState';

type DateRange = 'today' | 'week' | 'month' | 'all';
const RANGE_MS: Record<DateRange, number> = {
  today: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  all: Number.POSITIVE_INFINITY,
};

const SELECT =
  'rounded-lg border border-trp-border bg-trp-bg px-2.5 py-1.5 text-xs text-trp-text outline-none focus:border-trp-accent';

export function CallsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState<CallFilters>({ type: 'all', status: 'all', search: '' });
  const [range, setRange] = useState<DateRange>('week');

  const active = useLiveCalls();

  const { data: history = [] } = useQuery({
    queryKey: ['calls', 'history', filters],
    queryFn: () => getCallHistory(filters),
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    const cutoff = Date.now() - RANGE_MS[range];
    return history.filter((c) => new Date(c.createdAt).getTime() >= cutoff);
  }, [history, range]);

  const set = (patch: Partial<CallFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Calls</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-trp-accent px-4 py-2 text-sm font-semibold text-trp-bg transition hover:bg-trp-accent-hover"
        >
          <Plus size={16} /> New Call
        </button>
      </div>

      {/* Active calls */}
      {active.length > 0 ? (
        <ActiveCallPanel calls={active} />
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-trp-border px-4 py-3 text-sm text-trp-muted">
          <PhoneOff size={16} />
          No active calls — start one with “New Call”.
        </div>
      )}

      {/* History */}
      <Panel
        title="Call History"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select value={range} onChange={(e) => setRange(e.target.value as DateRange)} className={SELECT}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All</option>
            </select>
            <select
              value={filters.type}
              onChange={(e) => set({ type: e.target.value as CallFilters['type'] })}
              className={SELECT}
            >
              <option value="all">All types</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => set({ status: e.target.value as CallFilters['status'] })}
              className={SELECT}
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="no_answer">No answer</option>
              <option value="voicemail">Voicemail</option>
              <option value="failed">Failed</option>
            </select>
            <div className="flex items-center gap-1.5 rounded-lg border border-trp-border bg-trp-bg px-2.5 py-1.5">
              <Search size={13} className="text-trp-muted" />
              <input
                value={filters.search}
                onChange={(e) => set({ search: e.target.value })}
                placeholder="Agent…"
                className="w-24 bg-transparent text-xs text-trp-text outline-none placeholder:text-trp-muted"
              />
            </div>
          </div>
        }
        bodyClassName={filtered.length ? 'flex flex-col gap-2' : 'p-0'}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="No calls match"
            description="Adjust the filters, or place a call with “New Call”."
          />
        ) : (
          filtered.map((c) => <CallCard key={c.id} call={c} />)
        )}
      </Panel>

      {modalOpen && <NewCallModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
