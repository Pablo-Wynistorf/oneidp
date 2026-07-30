import { useId } from 'react';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: { mark: 'size-7', text: 'text-base' },
  md: { mark: 'size-9', text: 'text-lg' },
  lg: { mark: 'size-12', text: 'text-2xl' },
};

/**
 * The ONEIDP mark: a keyhole glyph on the violet -> cyan accent ramp.
 *
 * Drawn inline rather than loaded as an image so it stays crisp at every size
 * and needs no extra request on first paint. The geometry mirrors
 * public/icons/oneidp-mark.svg, which is what the favicon and the platform
 * icons are cut from -- change one and run scripts/generate-icons.sh to keep
 * the whole set aligned.
 *
 * Decorative by default: every call site either pairs it with the wordmark or
 * sits inside a link that carries its own label.
 */
export function BrandMark({ size = 'md', className }) {
  const gradient = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={cn(
        'shrink-0 drop-shadow-[0_6px_18px_#7c5cff59]',
        SIZES[size]?.mark ?? SIZES.md.mark,
        className,
      )}
    >
      <defs>
        <linearGradient id={gradient} x1="4" y1="2" x2="60" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-accent, #7c5cff)" />
          <stop offset="1" stopColor="var(--color-cyan, #22d3ee)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradient})`} />
      {/* Inner hairline: keeps the tile from melting into the dark canvas. */}
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="15.25"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.22"
        strokeWidth="1.5"
      />
      <g fill="#ffffff">
        <circle cx="32" cy="24" r="10" />
        <rect x="28" y="27" width="8" height="23" rx="4" />
      </g>
    </svg>
  );
}

/** Wordmark: the mark plus the ONEIDP lettering. */
export function Brand({ size = 'md', showText = true, className }) {
  const scale = SIZES[size] ?? SIZES.md;

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={size} />
      {showText && (
        <span className={cn('font-semibold tracking-tight text-ink', scale.text)}>
          ONE<span className="text-ink-muted">IDP</span>
        </span>
      )}
    </span>
  );
}
