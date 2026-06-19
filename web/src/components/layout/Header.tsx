import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { getHealth } from '../../api/dashboard';
import { StatusDot } from '../shared/StatusDot';
import { clockTime } from '../../lib/format';

export function Header({ breadcrumb }: { breadcrumb: string }) {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const s = health?.services;
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-trp-border bg-trp-bg px-6">
      <h1 className="text-sm font-semibold text-trp-text">{breadcrumb}</h1>

      <div className="ml-auto flex items-center gap-5">
        <div className="hidden items-center gap-3.5 rounded-lg border border-trp-border bg-trp-surface px-3 py-1.5 md:flex">
          <StatusDot status={s?.whisper ?? '...'} label="Whisper" />
          <StatusDot status={s?.llm ?? '...'} label="Forge" />
          <StatusDot status={s?.tts ?? '...'} label="Kokoro" />
          <StatusDot status={s?.twilio ?? '...'} label="Twilio" />
        </div>
        <span className="font-mono text-xs text-trp-muted tabular-nums">{clockTime(now)}</span>
        <button className="text-trp-muted transition hover:text-trp-text" aria-label="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
