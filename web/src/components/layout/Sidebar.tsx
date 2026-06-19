import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Phone,
  MessageSquare,
  Users,
  Settings,
  Radio,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  disabled?: boolean;
}

export function Sidebar({
  collapsed,
  onToggle,
  activeCalls = 0,
  unread = 0,
}: {
  collapsed: boolean;
  onToggle: () => void;
  activeCalls?: number;
  unread?: number;
}) {
  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/calls', label: 'Calls', icon: Phone, badge: activeCalls },
    { to: '/messages', label: 'Messages', icon: MessageSquare, badge: unread },
    { to: '/agents', label: 'Agents', icon: Users, disabled: true },
    { to: '/settings', label: 'Settings', icon: Settings, disabled: true },
  ];

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-trp-border bg-trp-surface transition-[width] duration-200 ${collapsed ? 'w-[64px]' : 'w-[240px]'}`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-trp-accent text-trp-bg">
          <Radio size={20} />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-bold">TRP</div>
            <div className="text-[11px] text-trp-muted">Orchestrator</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.disabled ? '#' : item.to}
            end={item.to === '/'}
            onClick={(e) => item.disabled && e.preventDefault()}
            className={({ isActive }) =>
              [
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                item.disabled
                  ? 'cursor-not-allowed text-trp-muted/40'
                  : isActive
                    ? 'bg-trp-surface-hover text-trp-text'
                    : 'text-trp-muted hover:bg-trp-surface-hover hover:text-trp-text',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && !item.disabled && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-trp-accent" />
                )}
                <item.icon
                  size={19}
                  className={isActive && !item.disabled ? 'text-trp-accent' : ''}
                />
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && item.disabled && (
                  <span className="text-[9px] uppercase text-trp-muted/50">soon</span>
                )}
                {!!item.badge && item.badge > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-trp-accent px-1.5 text-[10px] font-bold text-trp-bg">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="m-2 rounded-lg px-3 py-2 text-left text-xs text-trp-muted transition hover:bg-trp-surface-hover hover:text-trp-text"
      >
        {collapsed ? '»' : '« Collapse'}
      </button>
    </aside>
  );
}
