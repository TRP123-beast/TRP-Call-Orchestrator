import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { getActiveWorkflows } from '../../api/dashboard';
import { getConversations } from '../../api/sms';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/calls': 'Calls',
  '/messages': 'Messages',
};

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const breadcrumb = TITLES[location.pathname] ?? 'TRP Call Orchestrator';

  // Sidebar badges (cheap polls, shared via the query cache).
  const { data: workflows } = useQuery({
    queryKey: ['workflows', 'active'],
    queryFn: getActiveWorkflows,
    refetchInterval: 10_000,
  });
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 5_000,
  });

  const activeCalls = (workflows ?? []).filter((w) => w.channel === 'call').length;
  const unread = (conversations ?? []).reduce((n, c) => n + c.unread, 0);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        activeCalls={activeCalls}
        unread={unread}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header breadcrumb={breadcrumb} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
