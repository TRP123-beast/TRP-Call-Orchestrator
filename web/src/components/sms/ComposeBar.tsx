import { useRef, useState, type KeyboardEvent } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';

interface Template {
  label: string;
  build: (ctx: { name: string; property: string }) => string;
}

const TEMPLATES: Template[] = [
  {
    label: 'Initial availability check',
    build: ({ name, property }) =>
      `Hi ${name}, this is TRP following up about ${property} — is it still available for showings?`,
  },
  {
    label: 'Follow-up on offers/pets',
    build: ({ name, property }) =>
      `Thanks ${name}! Are there any registered offers on ${property}, and what's the pet policy?`,
  },
  {
    label: 'Confirmation message',
    build: ({ property }) =>
      `Great — confirming the showing for ${property}. We'll send the details shortly.`,
  },
  { label: 'Custom message', build: () => '' },
];

export function ComposeBar({
  agentName,
  property,
  disabled,
  sending,
  onSend,
}: {
  agentName: string;
  property: string;
  disabled?: boolean;
  sending?: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`; // ~4 lines max
  };

  const submit = () => {
    const t = text.trim();
    if (!t || sending) return;
    onSend(t);
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const applyTemplate = (t: Template) => {
    const filled = t.build({ name: agentName, property });
    setText(filled);
    setMenuOpen(false);
    requestAnimationFrame(() => taRef.current && (taRef.current.focus(), grow(taRef.current)));
  };

  return (
    <div className="relative border-t border-trp-border bg-trp-surface p-3">
      {menuOpen && (
        <div className="absolute bottom-full left-3 mb-2 w-64 overflow-hidden rounded-lg border border-trp-border bg-trp-surface shadow-xl">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t)}
              className="block w-full px-3 py-2.5 text-left text-sm text-trp-text transition hover:bg-trp-surface-hover"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-trp-border text-trp-muted transition hover:bg-trp-surface-hover hover:text-trp-accent disabled:opacity-40"
          aria-label="Templates"
        >
          <Sparkles size={17} />
        </button>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            grow(e.target);
          }}
          onKeyDown={onKeyDown}
          placeholder={disabled ? 'Select a conversation…' : 'Type a message…'}
          className="max-h-28 flex-1 resize-none rounded-lg border border-trp-border bg-trp-bg px-3 py-2.5 text-sm text-trp-text outline-none focus:border-trp-accent disabled:opacity-40"
        />
        <button
          onClick={submit}
          disabled={disabled || sending || !text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-trp-accent text-trp-bg transition enabled:hover:bg-trp-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          {sending ? <Loader2 size={17} className="animate-trp-spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
}
