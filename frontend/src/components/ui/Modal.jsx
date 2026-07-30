import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';
import { IconClose } from './Icons';

/**
 * Native `<dialog>` based modal.
 *
 * Using the platform element gives us focus trapping, `Escape` handling and
 * top-layer stacking for free. On phones the panel is pinned to the bottom of
 * the screen as a sheet (thumb-reachable, respects the home indicator); from
 * `sm` up it becomes a centred dialog.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // `cancel` covers Escape; `close` covers programmatic and form-driven exits.
    const handleCancel = (event) => {
      event.preventDefault();
      onClose();
    };
    const handleClose = () => {
      if (open) onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [open, onClose]);

  // Prevent the page behind the sheet from scrolling on iOS.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      // Clicking the backdrop (the dialog element itself) dismisses.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className={cn(
        'm-0 max-h-none max-w-none border-0 bg-transparent p-0 text-ink outline-none',
        'fixed inset-0 h-full w-full',
        // A layout `display` must only apply while the dialog is open. Setting
        // it unconditionally would override the user-agent
        // `dialog:not([open]) { display: none }` rule — author styles win over
        // UA styles — leaving the dialog permanently on screen.
        'hidden open:grid items-end justify-items-center sm:place-items-center',
      )}
    >
      <div
        className={cn(
          'flex max-h-[90dvh] w-full flex-col overflow-hidden border border-hairline bg-canvas-raised/95 backdrop-blur-2xl',
          'rounded-t-[1.75rem] pb-[env(safe-area-inset-bottom)] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.9)]',
          'sm:max-h-[85dvh] sm:rounded-[1.5rem] sm:pb-0 sm:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]',
          '[animation:oneidp-sheet-up_0.22s_ease-out]',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        {/* Grab handle: a visual affordance that this sheet is dismissible. */}
        <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />

        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
            )}
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
            <IconClose />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-hairline px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

/**
 * Yes/no confirmation dialog.
 *
 * The confirming action is rendered last in DOM order but appears on the right
 * on desktop and on top on mobile, which keeps the destructive button away from
 * where a thumb rests.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading} fullWidth className="sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            fullWidth
            className="sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span className="sr-only">{description}</span>
    </Modal>
  );
}
