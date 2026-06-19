import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, MessageSquare, Loader2 } from 'lucide-react';
import { getAgents, getProperties } from '../../api/agents';
import { initiateCall } from '../../api/calls';
import { sendSms } from '../../api/sms';
import { useToast } from '../ui/Toast';
import { Panel } from '../shared/Panel';

export function QuickActions() {
  const toast = useToast();
  const qc = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: getAgents });
  const { data: properties = [] } = useQuery({
    queryKey: ['properties', agentId],
    queryFn: () => getProperties(agentId),
    enabled: !!agentId,
  });

  const agent = agents.find((a) => a.id === agentId);
  const chosen = properties.filter((p) => selected.has(p.id));

  const onPickAgent = (id: string) => {
    setAgentId(id);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['workflows', 'active'] });
    void qc.invalidateQueries({ queryKey: ['activity'] });
  };

  const call = useMutation({
    mutationFn: () => initiateCall(agentId, [...selected]),
    onSuccess: (r) => {
      toast({ type: 'success', message: `Call initiated to ${agent?.name} (${r.status})` });
      refresh();
    },
    onError: (e) => toast({ type: 'error', message: e instanceof Error ? e.message : 'Call failed' }),
  });

  const text = useMutation({
    mutationFn: () => {
      const addr = chosen[0]?.address ?? 'your listing';
      const body = `Hi ${agent?.name ?? 'there'}, this is TRP following up about ${addr} — is it still available for showings?`;
      return sendSms(agent?.phone ?? '', body, agentId);
    },
    onSuccess: () => {
      toast({ type: 'success', message: `Text sent to ${agent?.name}` });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refresh();
    },
    onError: (e) => toast({ type: 'error', message: e instanceof Error ? e.message : 'Send failed' }),
  });

  const canAct = !!agentId && selected.size > 0;
  const busy = call.isPending || text.isPending;

  return (
    <Panel title="Quick Actions">
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-trp-muted">
        Listing agent
      </label>
      <select
        value={agentId}
        onChange={(e) => onPickAgent(e.target.value)}
        className="w-full rounded-lg border border-trp-border bg-trp-bg px-3 py-2 text-sm text-trp-text outline-none focus:border-trp-accent"
      >
        <option value="">Select an agent…</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.phone}
          </option>
        ))}
      </select>

      {agentId && (
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-trp-muted">
            Properties ({selected.size} selected)
          </div>
          <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
            {properties.length === 0 && (
              <p className="text-xs text-trp-muted">No properties for this agent.</p>
            )}
            {properties.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-trp-border bg-trp-bg px-3 py-2 text-sm transition hover:border-trp-accent/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="accent-trp-accent"
                />
                <span className="flex-1 truncate">{p.address}</span>
                <span className="text-[10px] uppercase text-trp-muted">{p.status}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2.5">
        <button
          disabled={!canAct || busy}
          onClick={() => call.mutate()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-trp-accent px-4 py-2.5 text-sm font-semibold text-trp-bg transition enabled:hover:bg-trp-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {call.isPending ? <Loader2 size={16} className="animate-trp-spin" /> : <Phone size={16} />}
          Call Agent
        </button>
        <button
          disabled={!canAct || busy}
          onClick={() => text.mutate()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-trp-border px-4 py-2.5 text-sm font-semibold text-trp-text transition enabled:hover:bg-trp-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {text.isPending ? (
            <Loader2 size={16} className="animate-trp-spin" />
          ) : (
            <MessageSquare size={16} />
          )}
          Text Agent
        </button>
      </div>
    </Panel>
  );
}
