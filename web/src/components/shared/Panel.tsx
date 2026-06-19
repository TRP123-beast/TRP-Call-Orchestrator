import type { ReactNode } from 'react';

export function Panel({
  title,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-[14px] border border-trp-border bg-trp-surface ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-trp-border px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-trp-accent">
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
