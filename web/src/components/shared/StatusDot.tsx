// Connection indicator. "reachable"/"configured"/"connected" read as healthy
// (green); anything else is treated as down (red).
const HEALTHY = new Set(['reachable', 'configured', 'connected', 'ok', 'healthy']);

export function StatusDot({ status, label }: { status: string; label: string }) {
  const ok = HEALTHY.has(status);
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label}: ${status}`}>
      <span
        className={`h-2 w-2 rounded-full ${ok ? 'bg-trp-success' : 'bg-trp-error'} ${ok ? 'shadow-[0_0_8px] shadow-trp-success/60' : ''}`}
      />
      <span className="text-xs text-trp-muted">{label}</span>
    </span>
  );
}
