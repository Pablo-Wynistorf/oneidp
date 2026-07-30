import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconCheck, IconClose } from './Icons';

const ToastContext = createContext(null);

const TONES = {
  success: { ring: 'border-positive/35', accent: 'text-positive', role: 'status' },
  error: { ring: 'border-danger/35', accent: 'text-danger', role: 'alert' },
  info: { ring: 'border-hairline-strong', accent: 'text-cyan', role: 'status' },
};

/**
 * Toast host. Replaces the Noty dependency the old pages loaded from a CDN.
 *
 * Notifications stack below the header on desktop and slide in from the top on
 * mobile, clear of the bottom tab bar.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, tone = 'info', duration = tone === 'error' ? 6000 : 4000) => {
      if (!message) return;
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-2), { id, message: String(message), tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error'),
      info: (message) => push(message, 'info'),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-0 top-0 z-100 flex flex-col items-center gap-2',
          'px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]',
          'sm:items-end sm:px-5 sm:pt-5',
        )}
      >
        {toasts.map((toast) => {
          const tone = TONES[toast.tone];
          return (
            <div
              key={toast.id}
              role={tone.role}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3',
                'bg-canvas-raised/95 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl',
                '[animation:oneidp-toast-in_0.2s_ease-out]',
                tone.ring,
              )}
            >
              <span className={cn('mt-0.5 shrink-0', tone.accent)}>
                {toast.tone === 'success' ? <IconCheck size={18} /> : <Dot />}
              </span>
              <p className="min-w-0 flex-1 text-sm break-words text-ink">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="-mt-0.5 -mr-1 shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
              >
                <IconClose size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function Dot() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 8v4.5M12 16h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Access the toast helpers: `toast.success(...)`, `toast.error(...)`. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
