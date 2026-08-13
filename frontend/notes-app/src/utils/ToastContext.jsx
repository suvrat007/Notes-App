import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

/**
 * Toasts, top-right.
 *
 * Top rather than bottom because the bottom of this app is where the thumb
 * lives — the nav bar and the add button both sit there, and a toast landing
 * over them either blocks a tap or gets dismissed by accident. Right rather
 * than centre so it never covers the thing that just changed.
 *
 * The stack itself is click-through; only the toasts themselves take a tap.
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    // Errors linger: they usually ask the reader to do something about it.
    const life = type === 'error' ? 6000 : 3000;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), life);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}

      <div
        data-testid="toast-stack"
        className="fixed top-0 right-0 z-[2000] flex flex-col items-end gap-2 p-3 pointer-events-none"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              data-testid={`toast-${t.type}`}
              /* Errors interrupt; everything else is announced without
                 stealing focus from what the user is doing. */
              role={t.type === 'error' ? 'alert' : 'status'}
              aria-live={t.type === 'error' ? 'assertive' : 'polite'}
              initial={{ opacity: 0, y: -14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className={`pointer-events-auto flex items-center gap-2.5 max-w-[min(92vw,360px)]
                bg-[#16191e] border rounded-xl px-3.5 py-2.5 shadow-xl ${
                t.type === 'error' ? 'border-focus-red/50' : 'border-white/10'
              }`}
            >
              <span className={t.type === 'error' ? 'text-focus-red' : 'text-[#c0b3a5]'}>
                {t.type === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
              </span>
              <span className="text-[13px] text-white/90 leading-snug flex-1 min-w-0"
                    data-testid="toast-msg">
                {t.message}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-white/30 hover:text-white transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
