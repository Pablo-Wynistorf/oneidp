import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/Brand';
import { useDecorativeEffects } from '@/hooks/use-media';
import { cn } from '@/lib/cn';

// The Aurora shader pulls in ogl/WebGL, so it is code-split and only requested
// on devices that will actually render it.
const Aurora = lazy(() => import('@/components/reactbits/Aurora'));

/**
 * Shell for the unauthenticated flows (login, signup, MFA, recovery, consent).
 *
 * Single-column and vertically centred so it works identically on a phone and a
 * desktop. The WebGL backdrop is decorative only and is skipped on small
 * screens, low-core devices and for `prefers-reduced-motion`, where a static
 * CSS gradient stands in.
 */
export function AuthLayout({ title, subtitle, children, footer, width = 'md' }) {
  const showAurora = useDecorativeEffects();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {showAurora && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[65vh] opacity-45">
          <Suspense fallback={null}>
            <Aurora colorStops={['#7c5cff', '#22d3ee', '#7c5cff']} amplitude={0.9} blend={0.6} />
          </Suspense>
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-8">
        <Link to="/" aria-label="ONEIDP home" className="rounded-lg">
          <Brand />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 sm:px-6">
        <div
          className={cn(
            'w-full',
            width === 'sm' && 'max-w-sm',
            width === 'md' && 'max-w-md',
            width === 'lg' && 'max-w-lg',
          )}
        >
          {(title || subtitle) && (
            <div className="mb-7 text-center">
              {title && (
                <h1 className="text-[1.75rem] leading-tight font-semibold sm:text-3xl">{title}</h1>
              )}
              {subtitle && (
                <p className="mt-2.5 text-[0.95rem] text-ink-muted text-pretty">{subtitle}</p>
              )}
            </div>
          )}

          <div
            className={cn(
              'rounded-[var(--radius-card)] border border-hairline bg-canvas-raised/70 p-5 sm:p-7',
              'shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_30px_70px_-40px_rgba(0,0,0,0.95)]',
              'backdrop-blur-2xl',
            )}
          >
            {children}
          </div>

          {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-xs text-ink-faint">
        <Link to="/privacy-policy" className="rounded transition-colors hover:text-ink-muted">
          Privacy policy
        </Link>
        <Link to="/imprint" className="rounded transition-colors hover:text-ink-muted">
          Imprint
        </Link>
      </footer>
    </div>
  );
}
