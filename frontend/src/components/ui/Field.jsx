import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconEye, IconEyeOff } from './Icons';

const CONTROL = [
  'w-full rounded-xl border border-hairline bg-canvas-raised/70 text-ink',
  'px-3.5 py-2.5 text-[0.95rem] leading-6',
  'transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-hairline-strong',
  'focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ');

/** Label + control + hint/error wrapper. */
export function Field({ label, hint, error, htmlFor, required, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-muted">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

/**
 * Labelled text input.
 *
 * `inputMode`/`autoComplete` are passed straight through so callers can give
 * mobile keyboards the right layout (email, numeric, one-time-code).
 */
export function TextInput({
  label,
  hint,
  error,
  id,
  // Written out rather than left to the HTML default: `input[type="text"]`
  // selectors do not match an input with no `type` attribute, and that is how
  // several password managers enumerate the fields of a form.
  type = 'text',
  className,
  containerClassName,
  required,
  leading,
  trailing,
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = `${inputId}-desc`;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-faint">
            {leading}
          </span>
        )}
        <input
          id={inputId}
          type={type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? describedBy : undefined}
          className={cn(
            CONTROL,
            leading && 'pl-10',
            trailing && 'pr-11',
            error && 'border-danger focus:border-danger focus:ring-danger/20',
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-1.5 grid place-items-center">{trailing}</span>
        )}
      </div>
    </Field>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ label = 'Password', autoComplete, name = 'password', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <TextInput
      label={label}
      // Revealing the value keeps `name`/`autocomplete` intact, so password
      // managers still recognise the field while it is shown as plain text.
      type={visible ? 'text' : 'password'}
      name={name}
      autoComplete={autoComplete}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          // Keeps managers from reading the in-field toggle as the submit
          // control, or as a field they should annotate.
          data-form-type="other"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="grid size-9 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface hover:text-ink"
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      }
      {...props}
    />
  );
}

/**
 * Off-screen username field for password forms that do not show one.
 *
 * A password manager needs to know which account a `new-password` belongs to.
 * When changing or resetting a password the identifier is not part of the
 * visible form, so this read-only copy gives managers the anchor they look for
 * and lets them update the right entry instead of creating a new one.
 *
 * It is positioned off-screen rather than `display: none` — several managers
 * ignore hidden inputs — and kept out of the tab order and the a11y tree since
 * it carries no information for the person filling the form in.
 */
export function HiddenUsername({ value, autoComplete = 'username' }) {
  if (!value) return null;

  return (
    <input
      type="text"
      name="username"
      autoComplete={autoComplete}
      data-form-type="username"
      value={value}
      readOnly
      tabIndex={-1}
      aria-hidden
      className="sr-only"
    />
  );
}

/** Multi-line input, used for the bulk role JSON editor. */
export function TextArea({ label, hint, error, id, className, rows = 8, ...props }) {
  const generatedId = useId();
  const areaId = id || generatedId;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={areaId}>
      <textarea
        id={areaId}
        rows={rows}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'resize-y font-mono text-xs leading-5', className)}
        {...props}
      />
    </Field>
  );
}

/**
 * Accessible on/off switch.
 *
 * The whole row is the button rather than a `<label>` beside a small track. A
 * label's `for` only activates form controls — pointing it at a `role="switch"`
 * button does nothing, which left the text looking clickable while only the
 * 44px track responded. Wrapping everything gives one large hit area and the
 * correct accessible name from the label and description.
 */
export function Switch({ checked, onChange, label, description, id, disabled }) {
  const generatedId = useId();
  const switchId = id || generatedId;
  const descriptionId = `${switchId}-description`;

  return (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center justify-between gap-4 rounded-xl text-left',
        '-mx-2 px-2 py-1.5 transition-colors',
        // No hover tint while disabled: it would imply the control still works.
        'enabled:hover:bg-surface',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && (
          <span id={descriptionId} className="mt-0.5 block text-xs text-ink-muted">
            {description}
          </span>
        )}
      </span>

      <span
        aria-hidden
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200',
            checked ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

/**
 * Segmented two-option control. Clearer than a switch when both sides are
 * meaningful choices (Add/Remove, User IDs/User names).
 */
export function SegmentedControl({ options, value, onChange, label, className }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex w-full rounded-xl border border-hairline bg-canvas-raised/70 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors tap-target',
              active ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
