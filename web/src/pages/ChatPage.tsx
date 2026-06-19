import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { sendChat, type ChatTurn } from '../api/chat';
import { useToast } from '../components/ui/Toast';

interface Msg extends ChatTurn {
  id: number;
}

export function ChatPage() {
  const toast = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy]);

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: Msg = { id: nextId.current++, role: 'user', content: text };
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setBusy(true);
    try {
      const { reply } = await sendChat(text, history);
      setMessages((m) => [...m, { id: nextId.current++, role: 'assistant', content: reply }]);
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Assistant unavailable' });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-trp-accent/15 text-trp-accent">
          <Sparkles size={18} />
        </span>
        <div>
          <h1 className="text-base font-bold">Ask the TRP Assistant</h1>
          <p className="text-xs text-trp-muted">Powered by the self-hosted Forge model</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-[14px] border border-trp-border bg-trp-surface p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-trp-muted">
            <Sparkles size={24} />
            <p className="text-sm">Ask about a listing’s availability, offers, or pet policy.</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] animate-trp-fade-in rounded-2xl px-3.5 py-2 text-sm ${
                  m.role === 'user'
                    ? 'rounded-br-sm bg-trp-accent text-trp-bg'
                    : 'rounded-bl-sm bg-trp-surface-hover text-trp-text'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-trp-surface-hover px-3.5 py-2 text-sm text-trp-muted">
                <Loader2 size={14} className="animate-trp-spin" /> Assistant is typing…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="mt-3 flex items-end gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your question…"
          className="flex-1 rounded-lg border border-trp-border bg-trp-bg px-3.5 py-2.5 text-sm text-trp-text outline-none focus:border-trp-accent"
        />
        <button
          onClick={() => void submit()}
          disabled={busy || !input.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-trp-accent text-trp-bg transition enabled:hover:bg-trp-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          {busy ? <Loader2 size={17} className="animate-trp-spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
