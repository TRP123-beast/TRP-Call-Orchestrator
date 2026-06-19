import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Phone, ExternalLink, Loader2, Check } from 'lucide-react';
import { getAgent } from '../../api/agents';
import { getAgentWorkflows } from '../../api/dashboard';
import { initiateCall } from '../../api/calls';
import { Avatar } from '../shared/Avatar';
import { Badge } from '../shared/Badge';
import { useToast } from '../ui/Toast';

const STEPS = ['Initial', 'Availability', 'Offers', 'Pets', 'Confirm'];
const STATUS_PROP: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  pending: 'warning',
  unavailable: 'error',
  tenanted: 'default',
};

export function AgentContext({ agentId, fallbackName, fallbackPhone }: {
  agentId: string | null;
  fallbackName: string;
  fallbackPhone: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => getAgent(agentId as string),
    enabled: !!agentId,
  });
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', 'agent', agentId],
    queryFn: () => getAgentWorkflows(agentId as string),
    enabled: !!agentId,
    refetchInterval: 10_000,
  });

  const agent = data?.agent;
  const properties = data?.properties ?? [];
  const workflow = workflows[0];

  const call = useMutation({
    mutationFn: () => initiateCall(agentId as string, properties.map((p) => p.id)),
    onSuccess: (r) => {
      toast({ type: 'success', message: `Call initiated to ${agent?.name} (${r.status})` });
      void qc.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (e) => toast({ type: 'error', message: e instanceof Error ? e.message : 'Call failed' }),
  });

  return (
    <aside className="hidden w-[280px] shrink-0 flex-col overflow-y-auto border-l border-trp-border bg-trp-surface lg:flex">
      {/* Agent card */}
      <div className="flex flex-col items-center gap-2 border-b border-trp-border p-5 text-center">
        <Avatar name={agent?.name ?? fallbackName} size="lg" />
        <div>
          <div className="text-base font-bold">{agent?.name ?? fallbackName}</div>
          <div className="text-xs text-trp-muted">{agent?.phone ?? fallbackPhone}</div>
        </div>
        {agent?.email && <div className="text-xs text-trp-muted">{agent.email}</div>}
        {agent?.brokerage && <div className="text-xs text-trp-muted">{agent.brokerage}</div>}
        {agent && (
          <Badge variant="info" size="sm">
            Prefers {agent.preferredContact}
          </Badge>
        )}
      </div>

      {!agentId && (
        <p className="px-5 py-6 text-center text-xs text-trp-muted">
          This number isn't linked to a known agent, so there's no profile to show.
        </p>
      )}

      {/* Properties */}
      {properties.length > 0 && (
        <div className="border-b border-trp-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-trp-muted">
            Properties
          </h3>
          <div className="flex flex-col gap-2">
            {properties.map((p) => (
              <div key={p.id} className="rounded-lg border border-trp-border bg-trp-bg px-3 py-2">
                <div className="truncate text-xs font-medium">{p.address}</div>
                <div className="mt-1 flex items-center justify-between">
                  <Badge variant={STATUS_PROP[p.status] ?? 'default'} size="sm">
                    {p.status}
                  </Badge>
                  <span className="text-[10px] text-trp-muted">{p.mlsNumber}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workflow stepper */}
      {workflow && (
        <div className="border-b border-trp-border p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-trp-muted">
            Workflow · {workflow.channel}
          </h3>
          <ol className="flex flex-col gap-0">
            {STEPS.map((label, i) => {
              const done = i + 1 < workflow.step;
              const current = i + 1 === workflow.step;
              return (
                <li key={label} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        done
                          ? 'bg-trp-success text-trp-bg'
                          : current
                            ? 'bg-trp-accent text-trp-bg'
                            : 'bg-trp-surface-hover text-trp-muted'
                      }`}
                    >
                      {done ? <Check size={11} /> : i + 1}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className={`h-5 w-px ${done ? 'bg-trp-success' : 'bg-trp-border'}`} />
                    )}
                  </div>
                  <span
                    className={`pt-0.5 text-xs ${current ? 'font-semibold text-trp-text' : 'text-trp-muted'}`}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 text-[11px] text-trp-muted">
            Attempts: {workflow.attempts} · via {workflow.channel}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-auto flex flex-col gap-2 p-4">
        <button
          onClick={() => call.mutate()}
          disabled={!agentId || properties.length === 0 || call.isPending}
          className="flex items-center justify-center gap-2 rounded-lg bg-trp-accent px-4 py-2.5 text-sm font-semibold text-trp-bg transition enabled:hover:bg-trp-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {call.isPending ? <Loader2 size={15} className="animate-trp-spin" /> : <Phone size={15} />}
          Call Agent
        </button>
        <Link
          to="/"
          className="flex items-center justify-center gap-2 rounded-lg border border-trp-border px-4 py-2.5 text-sm font-semibold text-trp-text transition hover:bg-trp-surface-hover"
        >
          <ExternalLink size={15} />
          View in Dashboard
        </Link>
      </div>
    </aside>
  );
}
