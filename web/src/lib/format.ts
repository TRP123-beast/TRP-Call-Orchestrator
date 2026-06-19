import { formatDistanceToNowStrict } from 'date-fns';

/** Initials from a name: "Sarah Chen" → "SC", "Mike" → "MI". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A small, readable palette for avatar backgrounds (consistent per name).
const AVATAR_COLORS = [
  '#00B4D8',
  '#22C55E',
  '#A855F7',
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#EC4899',
  '#14B8A6',
];

/** Deterministic color from a name hash. */
export function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Relative time: "2m ago", "1h ago". Falls back to '' on bad input. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return '';
  }
}

/** Wall-clock time like "3:42 PM". */
export function clockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Seconds → "3m 42s" (or "—" when null/0 for unanswered). */
export function duration(sec: number | null | undefined): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
