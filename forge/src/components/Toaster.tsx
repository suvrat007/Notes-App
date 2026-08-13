import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast, type Toast } from '../store/useToast';
import { IconCheck } from './icons';

function ToastRow({ t }: { t: Toast }) {
  const dismiss = useToast((s) => s.dismiss);

  useEffect(() => {
    if (t.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, dismiss]);

  return (
    <motion.div
      layout
      className={`toast toast--${t.kind}`}
      data-testid={`toast-${t.kind}`}
      // Errors interrupt; the rest are announced without stealing focus.
      role={t.kind === 'error' ? 'alert' : 'status'}
      aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
    >
      <span className="toast__icon" aria-hidden="true">
        {t.kind === 'success' ? <IconCheck size={15} /> : t.kind === 'error' ? '!' : 'i'}
      </span>

      <span className="toast__msg" data-testid="toast-msg">{t.message}</span>

      {t.action && (
        <button
          className="toast__action"
          data-testid="toast-action"
          onClick={() => {
            const keep = t.action!.onClick();
            if (keep !== true) dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}

      <button className="toast__x" aria-label="Dismiss"
              data-testid="toast-dismiss" onClick={() => dismiss(t.id)}>✕</button>
    </motion.div>
  );
}

/**
 * Toast host. Mounted once at the app root so toasts survive the unmounting
 * of whatever raised them.
 */
export default function Toaster() {
  const toasts = useToast((s) => s.toasts);

  return (
    <div className="toaster" data-testid="toaster">
      <AnimatePresence initial={false}>
        {toasts.map((t) => <ToastRow key={t.id} t={t} />)}
      </AnimatePresence>
    </div>
  );
}
