// Renders a plain-text transcript ("Caller: …\nAI: …") as a chat-like list.
interface Line {
  role: 'caller' | 'ai' | 'note';
  text: string;
}

function parse(transcript: string): Line[] {
  return transcript
    .split('\n')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(caller|agent|ai|assistant)\s*:\s*(.*)$/i.exec(line);
      if (!m) return { role: 'note' as const, text: line };
      const who = m[1].toLowerCase();
      return { role: who === 'ai' || who === 'assistant' ? 'ai' : 'caller', text: m[2] };
    });
}

export function CallTranscript({ transcript }: { transcript: string }) {
  const lines = parse(transcript);
  if (lines.length === 0) {
    return <p className="text-sm text-trp-muted">No transcript captured for this call.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 text-sm">
          <span
            className={`shrink-0 font-semibold ${l.role === 'ai' ? 'text-trp-accent' : l.role === 'caller' ? 'text-trp-success' : 'text-trp-muted'}`}
          >
            {l.role === 'ai' ? 'AI' : l.role === 'caller' ? 'Agent' : '·'}
          </span>
          <span className="text-trp-text/90">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
