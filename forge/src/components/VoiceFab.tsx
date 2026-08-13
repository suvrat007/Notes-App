import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { IconMic } from './icons';

export type FabAction = 'speak' | 'type';

type Props = {
  onPick: (action: FabAction) => void;
};

/**
 * Floating voice button.
 *
 * Collapsed it breathes; tapping it fans out the two ways in. The choice is
 * offered here rather than inside the sheet so the first tap already commits
 * to speaking or typing, instead of landing on a form that asks again.
 */
export default function VoiceFab({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  // Any tap elsewhere, or Escape, closes it — a floating menu that traps the
  // user is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const choose = (a: FabAction) => {
    setOpen(false);
    onPick(a);
  };

  const ACTIONS: { key: FabAction; label: string; hint: string }[] = [
    { key: 'speak', label: 'Speak', hint: 'Say it out loud' },
    { key: 'type', label: 'Type', hint: 'Write it instead' },
  ];

  return (
    <div className="fab" ref={rootRef} data-testid="voice-fab">
      <AnimatePresence>
        {open && (
          <motion.div
            className="fab__menu"
            data-testid="fab-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            {ACTIONS.map((a, i) => (
              <motion.button
                key={a.key}
                className="fab__item"
                data-testid={`fab-${a.key}`}
                onClick={() => choose(a.key)}
                // Stagger upward so they read as rising out of the button.
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.94 }}
                transition={{
                  duration: 0.2,
                  delay: reduce ? 0 : (ACTIONS.length - 1 - i) * 0.05,
                  ease: [0.34, 1.4, 0.64, 1],
                }}
              >
                <span className="fab__label">{a.label}</span>
                <span className="fab__hint">{a.hint}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={'fab__btn' + (open ? ' fab__btn--open' : '')}
        data-testid="fab-toggle"
        aria-label={open ? 'Close voice options' : 'Voice'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Two rings on a slow offset pulse — alive without being a spinner,
            which would imply the app is busy. */}
        {!reduce && (
          <>
            <motion.span
              className="fab__ring"
              aria-hidden="true"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.span
              className="fab__ring"
              aria-hidden="true"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
            />
          </>
        )}

        <motion.span
          className="fab__core"
          aria-hidden="true"
          animate={reduce ? {} : { scale: [1, 1.06, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <motion.span
          className="fab__icon"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {open ? <span className="fab__x">✕</span> : <IconMic size={24} />}
        </motion.span>
      </button>
    </div>
  );
}
