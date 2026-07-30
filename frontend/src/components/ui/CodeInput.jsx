import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Fixed-length numeric code entry (TOTP).
 *
 * A single real `<input>` sits transparently on top of the rendered digit
 * boxes. That keeps SMS/authenticator autofill working, gives mobile keyboards
 * `one-time-code` semantics, and avoids the focus-juggling bugs that per-digit
 * inputs are prone to.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label = 'Verification code',
  disabled = false,
  autoFocus = false,
  error,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const completedFor = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Fire `onComplete` once per distinct full-length value, so re-renders do not
  // resubmit and a corrected code can be submitted again.
  useEffect(() => {
    if (value.length === length && completedFor.current !== value) {
      completedFor.current = value;
      onComplete?.(value);
    }
    if (value.length < length) {
      completedFor.current = null;
    }
  }, [value, length, onComplete]);

  const handleChange = (event) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, length);
    onChange(digits);
  };

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          type="text"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          // Dashlane's annotation for a one-time code, so it offers the TOTP it
          // holds for the account instead of ignoring the field.
          data-form-type="otp"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={length}
          aria-invalid={error ? true : undefined}
          aria-label={label}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
        />
        <div aria-hidden className="flex justify-center gap-2 sm:gap-2.5">
          {Array.from({ length }).map((_, index) => {
            const char = value[index] ?? '';
            const isActive = focused && !disabled && index === activeIndex;
            return (
              <div
                key={index}
                className={cn(
                  'grid h-14 flex-1 max-w-13 place-items-center rounded-xl border',
                  'bg-canvas-raised/70 font-mono text-xl font-semibold tabular-nums',
                  'transition-[border-color,box-shadow] duration-150',
                  error
                    ? 'border-danger'
                    : isActive
                      ? 'border-accent ring-4 ring-accent/20'
                      : char
                        ? 'border-hairline-strong'
                        : 'border-hairline',
                  disabled && 'opacity-60',
                )}
              >
                {char || <span className="text-ink-faint">·</span>}
              </div>
            );
          })}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-center text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
