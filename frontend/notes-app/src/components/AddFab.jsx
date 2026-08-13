import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';

const HOW = [
  { key: 'speak', label: 'Audio', hint: 'Say your whole day' },
  { key: 'type', label: 'Text', hint: 'Fill it in yourself' },
];

const WHAT = [
  { key: 'task', label: 'Add task', hint: 'Something to finish' },
  { key: 'habit', label: 'Add habit', hint: 'Something to keep doing' },
];

/**
 * The one place anything gets added.
 *
 * Collapsed it breathes; tapping it asks how you want to say it, and only then
 * what you are adding. Two small questions beat one screen of buttons, and the
 * answer to the first decides what the second even offers — picking Text and
 * then being shown a microphone would defeat the point of asking.
 */
const AddFab = ({ onPick }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('how');
  const rootRef = useRef(null);
  const reduce = useReducedMotion();

  const close = () => { setOpen(false); setStep('how'); };

  // Any tap elsewhere, or Escape, closes it — a floating menu that traps the
  // user is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!rootRef.current?.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  /** Audio needs no second question; text does. */
  const chooseHow = (key) => {
    if (key === 'speak') { close(); onPick('speak'); return; }
    setStep('what');
  };

  const options = step === 'how' ? HOW : WHAT;

  return (
    <div
      ref={rootRef}
      data-testid="add-fab"
      /* Clears the bottom nav and the phone's own gesture bar. */
      className="fixed right-4 md:right-7 z-[120] flex flex-col items-end gap-2.5"
      style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            className="flex flex-col items-end gap-2"
            data-testid="fab-menu"
            data-step={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            {step === 'what' && (
              <motion.button
                type="button"
                data-testid="fab-back"
                onClick={() => setStep('how')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] font-bold tracking-widest uppercase text-white/50 hover:text-white px-2 py-1"
              >
                ← Back
              </motion.button>
            )}

            {options.map((a, i) => (
              <motion.button
                key={a.key}
                type="button"
                data-testid={`fab-${a.key}`}
                onClick={() => (step === 'how' ? chooseHow(a.key) : (close(), onPick(a.key)))}
                /* Staggered upward so they read as rising out of the button. */
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.94 }}
                transition={{
                  duration: 0.2,
                  delay: reduce ? 0 : (options.length - 1 - i) * 0.05,
                  ease: [0.34, 1.4, 0.64, 1],
                }}
                className="flex flex-col items-end bg-[#16191e] border border-white/10 rounded-2xl px-4 py-2.5 shadow-lg hover:border-[#c0b3a5]/50 transition-colors"
              >
                <span className="text-sm font-bold text-white leading-tight">{a.label}</span>
                <span className="text-[10px] text-white/45 leading-tight">{a.hint}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        data-testid="fab-toggle"
        aria-label={open ? 'Close' : 'Add'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="relative w-[60px] h-[60px] rounded-full bg-[#c0b3a5] text-[#0d0f12] grid place-items-center shadow-xl active:scale-95 transition-transform"
      >
        {/* Two rings on a slow offset pulse — alive without being a spinner,
            which would imply the app is busy. Purely decorative, so they must
            never intercept the tap. */}
        {!reduce && (
          <>
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-[#c0b3a5] pointer-events-none"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-[#c0b3a5] pointer-events-none"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
            />
          </>
        )}

        {/* The plus rotates into a cross rather than swapping glyphs, so the
            button never blinks. */}
        <motion.span
          className="relative"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <Plus size={26} strokeWidth={2.5} />
        </motion.span>
      </button>
    </div>
  );
};

export default AddFab;
