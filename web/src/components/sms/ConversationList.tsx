import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Conversation } from '../../api/types';
import { Avatar } from '../shared/Avatar';
import { relativeTime } from '../../lib/format';

type Filter = 'all' | 'active' | 'completed';

export function ConversationList({
  conversations,
  selectedKey,
  onSelect,
}: {
  conversations: Conversation[];
  selectedKey: string | null;
  onSelect: (c: Conversation) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q)) return false;
      if (filter === 'active') return !!c.agentId;
      if (filter === 'completed') return !c.agentId;
      return true;
    });
  }, [conversations, query, filter]);

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-r border-trp-border bg-trp-surface">
      {/* Search */}
      <div className="border-b border-trp-border p-3">
        <div className="flex items-center gap-2 rounded-lg border border-trp-border bg-trp-bg px-3 py-2">
          <Search size={15} className="text-trp-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-transparent text-sm text-trp-text outline-none placeholder:text-trp-muted"
          />
        </div>
        {/* Segmented filter */}
        <div className="mt-2 flex rounded-lg bg-trp-bg p-0.5">
          {(['all', 'active', 'completed'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition ${
                filter === f ? 'bg-trp-surface-hover text-trp-text' : 'text-trp-muted hover:text-trp-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-trp-muted">No conversations</p>
        )}
        {filtered.map((c) => {
          const active = c.key === selectedKey;
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c)}
              className={`flex w-full items-center gap-3 border-b border-trp-border/50 px-3 py-3 text-left transition ${
                active ? 'bg-trp-surface-hover' : 'hover:bg-trp-surface-hover/60'
              }`}
            >
              <div className="relative">
                <Avatar name={c.name} size="md" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-trp-surface ${
                    c.agentId ? 'bg-trp-success' : 'bg-trp-border'
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? 'font-bold' : 'font-medium'}`}>
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-trp-muted">{relativeTime(c.lastAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-trp-muted">{c.lastMessage || '—'}</span>
                  {c.unread > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-trp-accent px-1 text-[10px] font-bold text-trp-bg">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
