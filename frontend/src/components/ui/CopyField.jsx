import { useState } from 'react';
import { cn } from '@/lib/cn';
import { copyText } from '@/lib/format';
import { useToast } from './Toast';
import { IconCheck, IconCopy, IconEye, IconEyeOff } from './Icons';

/** Icon button that copies `value` and briefly confirms. */
export function CopyButton({ value, label = 'Copy', className }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint tap-target',
        'transition-colors hover:bg-surface hover:text-ink',
        copied && 'text-positive',
        className,
      )}
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
    </button>
  );
}

/**
 * Read-only labelled value with a copy affordance.
 *
 * `secret` hides the value behind a reveal toggle, and `mono` is used for IDs
 * and URLs. The value truncates rather than wrapping so long client IDs cannot
 * blow out the layout on a phone.
 */
export function CopyField({ label, value, secret = false, mono = true, className }) {
  const [revealed, setRevealed] = useState(false);
  const hidden = secret && !revealed;

  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">{label}</p>
      {/* Actions sit directly after the value instead of at the column edge, so a
          short value keeps its copy button within reading distance. */}
      <div className="mt-0.5 flex items-center gap-0.5">
        <span
          className={cn('min-w-0 truncate text-sm text-ink', mono && 'font-mono text-[0.8rem]')}
          title={hidden ? undefined : value}
        >
          {hidden ? '••••••••••••••••••••' : value || '—'}
        </span>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={revealed}
            className="ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint tap-target transition-colors hover:bg-surface hover:text-ink"
          >
            {revealed ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        )}
        {value && (
          <CopyButton value={value} label={`Copy ${label}`} className={secret ? undefined : 'ml-1'} />
        )}
      </div>
    </div>
  );
}
