import type { ReactNode } from 'react';

type Variant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'default';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  success: 'bg-trp-success/15 text-trp-success',
  warning: 'bg-trp-warning/15 text-trp-warning',
  error: 'bg-trp-error/15 text-trp-error',
  info: 'bg-trp-accent/15 text-trp-accent',
  purple: 'bg-trp-purple/15 text-trp-purple',
  default: 'bg-trp-surface-hover text-trp-muted',
};

const SIZES: Record<Size, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide ${VARIANTS[variant]} ${SIZES[size]}`}
    >
      {children}
    </span>
  );
}
