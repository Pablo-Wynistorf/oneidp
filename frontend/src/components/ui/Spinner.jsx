import { cn } from '@/lib/cn';

/** Indeterminate loading indicator. */
export function Spinner({ size = 20, className, label }) {
  return (
    <span
      role="status"
      aria-label={label || 'Loading'}
      className={cn('inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          opacity="0.2"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            transformOrigin: '12px 12px',
            animation: 'oneidp-spin 0.7s linear infinite',
          }}
        />
      </svg>
    </span>
  );
}

/** Placeholder block used while content loads. */
export function Skeleton({ className }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-lg bg-white/8', className)}
    />
  );
}
