import { useId } from 'react';
import { cn } from '@/lib/cn';
import { IconClose, IconSearch } from './Icons';

/** Filter box with a leading magnifier and a clear button once populated. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  label,
  className,
  ...props
}) {
  const id = useId();

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label || placeholder}
      </label>
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-faint">
        <IconSearch size={18} />
      </span>
      <input
        id={id}
        type="search"
        role="searchbox"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          'w-full rounded-xl border border-hairline bg-canvas-raised/70 py-2.5 pr-10 pl-10',
          'text-[0.95rem] text-ink transition-[border-color,box-shadow] duration-150',
          'hover:border-hairline-strong',
          'focus:border-accent focus:ring-4 focus:ring-accent/20 focus:outline-none',
          // Safari renders its own clear button for type=search; we supply ours.
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute inset-y-0 right-1.5 my-auto grid size-9 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface hover:text-ink"
        >
          <IconClose size={16} />
        </button>
      )}
    </div>
  );
}
