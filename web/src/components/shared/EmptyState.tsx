import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-trp-surface-hover text-trp-muted">
        <Icon size={26} />
      </span>
      <h3 className="text-base font-semibold text-trp-text">{title}</h3>
      {description && <p className="max-w-xs text-sm text-trp-muted">{description}</p>}
      {action && (
        <Link
          to={action.href}
          className="mt-1 rounded-lg bg-trp-accent px-4 py-2 text-sm font-semibold text-trp-bg transition hover:bg-trp-accent-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
