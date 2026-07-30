import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

const VARIANTS = {
  primary:
    'bg-accent text-white shadow-[0_8px_24px_-10px_var(--color-accent)] hover:bg-accent-hover active:brightness-95',
  secondary:
    'bg-surface-strong text-ink border border-hairline backdrop-blur hover:bg-white/12 active:bg-white/8',
  ghost: 'text-ink-muted hover:bg-surface hover:text-ink',
  danger:
    'bg-danger text-white shadow-[0_8px_24px_-10px_var(--color-danger)] hover:bg-danger-hover',
  outlineDanger:
    'border border-danger/40 text-danger hover:bg-danger/10 active:bg-danger/15',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-xl justify-center',
};

/**
 * Primary action element.
 *
 * `loading` keeps the button's width stable by swapping the label for a spinner
 * rather than collapsing the content, and marks the control `aria-busy`.
 */
export function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  className,
  children,
  ...props
}) {
  const isButton = Component === 'button';
  const isDisabled = disabled || loading;

  return (
    <Component
      {...(isButton ? { type: props.type || 'button', disabled: isDisabled } : {})}
      aria-busy={loading || undefined}
      aria-disabled={!isButton && isDisabled ? true : undefined}
      className={cn(
        'relative inline-flex items-center justify-center font-medium select-none',
        'transition-[background-color,color,transform,opacity] duration-150',
        'active:scale-[0.985] tap-target',
        // `disabled` already blocks clicks on a real <button>, so the cursor is
        // left visible to signal *why* nothing happens. Link-style buttons have
        // no disabled attribute, so those do need pointer-events removed.
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        !isButton && isDisabled && 'pointer-events-none opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={size === 'lg' ? 22 : 18} />
        </span>
      )}
    </Component>
  );
}

/** Compact icon-only button. `label` becomes the accessible name. */
export function IconButton({ label, className, variant = 'ghost', ...props }) {
  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={label}
      title={label}
      className={cn('shrink-0', className)}
      {...props}
    />
  );
}
