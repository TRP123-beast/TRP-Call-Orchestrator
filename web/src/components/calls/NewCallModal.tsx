import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Phone, Loader2 } from 'lucide-react';
import { getAgents, getProperties } from '../../api/agents';
import { initiateCall } from '../../api/calls';
import { useToast } from '../ui/Toast';

export function NewCallModal({ onClose }: { onClose: () => void }) {
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

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const call = useMutation({
    mutationFn: () => initiateCall(agentId, [...selected]),
    onSuccess: (r) => {
      toast({ type: 'success', message: `Call initiated to ${agent?.name} (${r.status})` });
      void qc.invalidateQueries({ queryKey: ['calls'] });
      onClose();
    },
    onError: (e) => toast({ type: 'error', message: e instanceof Error ? e.message : 'Call failed' }),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-trp-border bg-trp-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">New Call</h2>
          <button onClick={onClose} className="text-trp-muted transition hover:text-trp-text">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-trp-muted">
          Agent
        </label>
        <select
          value={agentId}
          onChange={(e) => {
            setAgentId(e.target.value);
            setSelected(new Set());
          }}
          className="w-full rounded-lg border border-trp-border bg-trp-bg px-3 py-2 text-sm outline-none focus:border-trp-accent"
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
            <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
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
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => call.mutate()}
          disabled={!agentId || selected.size === 0 || call.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-trp-accent px-4 py-2.5 text-sm font-semibold text-trp-bg transition enabled:hover:bg-trp-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {call.isPending ? <Loader2 size={16} className="animate-trp-spin" /> : <Phone size={16} />}
          Call Now
        </button>
      </div>
    </div>
  );
}
