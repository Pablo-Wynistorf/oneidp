import { cn } from '@/lib/cn';

const TONES = {
  neutral: 'bg-surface-strong text-ink-muted border-hairline',
  accent: 'bg-accent/15 text-[#c3b5ff] border-accent/30',
  cyan: 'bg-cyan/15 text-[#8ee9f8] border-cyan/30',
  positive: 'bg-positive/15 text-[#8ce7c4] border-positive/30',
  warning: 'bg-warning/15 text-[#f6d488] border-warning/30',
  danger: 'bg-danger/15 text-[#ffa8b2] border-danger/30',
};

/** Small inline label for scopes, roles, counts and status. */
export function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Coloured dot + label, for boolean-ish state such as MFA on/off. */
export function StatusDot({ active, children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm', className)}>
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          active
            ? 'bg-positive shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-positive)_25%,transparent)]'
            : 'bg-ink-faint',
        )}
      />
      {children}
    </span>
  );
}
