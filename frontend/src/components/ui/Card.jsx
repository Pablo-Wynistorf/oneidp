import { cn } from '@/lib/cn';

/** Layered glass panel used for every content block. */
export function Card({ as: Component = 'section', className, children, ...props }) {
  return (
    <Component
      className={cn(
        'rounded-[var(--radius-card)] border border-hairline bg-surface',
        'shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_20px_50px_-30px_rgba(0,0,0,0.9)]',
        'backdrop-blur-xl',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Card heading row. Wraps on narrow screens so a title plus action buttons
 * never overflow on a phone.
 */
export function CardHeader({ title, description, actions, className, children }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-hairline px-4 py-4 sm:px-6',
        'sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {title && (
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">{title}</h2>
        )}
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...props }) {
  return (
    <div className={cn('px-4 py-4 sm:px-6 sm:py-5', className)} {...props}>
      {children}
    </div>
  );
}

/** Centered message for empty / error / loading states inside a card. */
export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface-strong text-ink-muted">
          {icon}
        </div>
      )}
      <p className="font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
