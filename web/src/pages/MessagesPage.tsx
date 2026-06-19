import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import type { Conversation, SmsMessage } from '../api/types';
import { getConversations, getConversation, sendSms } from '../api/sms';
import { getAgentWorkflows } from '../api/dashboard';
import { ConversationList } from '../components/sms/ConversationList';
import { MessageThread } from '../components/sms/MessageThread';
import { ComposeBar } from '../components/sms/ComposeBar';
import { AgentContext } from '../components/sms/AgentContext';
import { Badge } from '../components/shared/Badge';
import { Avatar } from '../components/shared/Avatar';
import { EmptyState } from '../components/shared/EmptyState';
import { useToast } from '../components/ui/Toast';

export function MessagesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [pending, setPending] = useState<SmsMessage[]>([]);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 5_000,
  });

  // Auto-select the first conversation on first load.
  useEffect(() => {
    if (!selectedKey && conversations.length > 0) {
      setSelectedKey(conversations[0].key);
      setSelected(conversations[0]);
    }
  }, [conversations, selectedKey]);

  const { data: thread } = useQuery({
    queryKey: ['conversation', selectedKey],
    queryFn: () => getConversation(selectedKey as string),
    enabled: !!selectedKey,
    refetchInterval: 5_000,
  });

  const agentId = thread?.agent?.id ?? selected?.agentId ?? null;
  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows', 'agent', agentId],
    queryFn: () => getAgentWorkflows(agentId as string),
    enabled: !!agentId,
    refetchInterval: 10_000,
  });

  const onSelect = (c: Conversation) => {
    setSelectedKey(c.key);
    setSelected(c);
    setPending([]);
  };

  const send = useMutation({
    mutationFn: (text: string) => sendSms(selected?.phone ?? '', text, agentId ?? undefined),
    onMutate: (text: string) => {
      const optimistic: SmsMessage = {
        id: `tmp-${Date.now()}`,
        direction: 'outbound',
        from: null,
        to: selected?.phone ?? null,
        body: text,
        status: 'sending',
        createdAt: new Date().toISOString(),
      };
      setPending((p) => [...p, optimistic]);
    },
    onSuccess: () => {
      setPending([]);
      void qc.invalidateQueries({ queryKey: ['conversation', selectedKey] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => {
      setPending((p) => p.map((m) => ({ ...m, status: 'failed' })));
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Failed to send' });
    },
  });

  const messages = [...(thread?.messages ?? []), ...pending];
  const name = thread?.agent?.name ?? selected?.name ?? '';
  const phone = thread?.agent?.phone ?? selected?.phone ?? '';

  if (conversations.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Texts you send and inbound replies will appear here. Start one from the dashboard."
          action={{ label: 'Go to Dashboard', href: '/' }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <ConversationList conversations={conversations} selectedKey={selectedKey} onSelect={onSelect} />

      {/* Center */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-trp-border px-5">
              <Avatar name={name} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{name}</div>
                <div className="text-xs text-trp-muted">{phone}</div>
              </div>
              <div className="ml-auto">
                <Badge variant={agentId ? 'success' : 'default'} size="sm">
                  {agentId ? 'active' : 'contact'}
                </Badge>
              </div>
            </div>
            <MessageThread messages={messages} workflow={workflows[0]} />
            <ComposeBar
              agentName={name}
              property="your listing"
              sending={send.isPending}
              onSend={(t) => send.mutate(t)}
            />
          </>
        ) : (
          <div className="m-auto text-sm text-trp-muted">Select a conversation</div>
        )}
      </div>

      <AgentContext agentId={agentId} fallbackName={name} fallbackPhone={phone} />
    </div>
  );
}
