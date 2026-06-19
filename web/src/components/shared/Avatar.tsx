import { colorFromName, initials } from '../../lib/format';

type Size = 'sm' | 'md' | 'lg';
const SIZES: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

export function Avatar({ name, size = 'md' }: { name: string; size?: Size }) {
  const bg = colorFromName(name);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${SIZES[size]}`}
      style={{ backgroundColor: `${bg}33`, color: bg }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
