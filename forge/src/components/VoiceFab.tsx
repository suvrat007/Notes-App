import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { IconPlus } from './icons';

/** What the user ended up asking for. `speak` is the whole voice flow. */
export type FabAction = 'speak' | 'task' | 'habit';

type Props = {
  onPick: (action: FabAction) => void;
};

type Step = 'how' | 'what';

const HOW: { key: 'speak' | 'type'; label: string; hint: string }[] = [
  { key: 'speak', label: 'Audio', hint: 'Say your whole day' },
  { key: 'type', label: 'Text', hint: 'Fill it in yourself' },
];

const WHAT: { key: FabAction; label: string; hint: string }[] = [
  { key: 'task', label: 'Add task', hint: 'Something to finish' },
  { key: 'habit', label: 'Add habit', hint: 'Something to keep doing' },
];

/**
 * The one place anything gets added.
 *
 * Collapsed it breathes; tapping it asks how you want to say it, and only
 * then what you are adding. Two small questions beat one screen of buttons,
 * and the answer to the first decides what the second even offers — picking
 * Text and then being shown a microphone would defeat the point of asking.
 */
export default function VoiceFab({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('how');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  const close = () => { setOpen(false); setStep('how'); };

  // Any tap elsewhere, or Escape, closes it — a floating menu that traps the
  // user is worse than no menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  /** Audio needs no second question; text does. */
  const chooseHow = (key: 'speak' | 'type') => {
    if (key === 'speak') { close(); onPick('speak'); return; }
    setStep('what');
  };

  const chooseWhat = (key: FabAction) => { close(); onPick(key); };

  const options = step === 'how' ? HOW : WHAT;

  return (
    <div className="fab" ref={rootRef} data-testid="voice-fab">
      <AnimatePresence>
        {open && (
          <motion.div
            className="fab__menu"
            data-testid="fab-menu"
            data-step={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            {step === 'what' && (
              <motion.button
                className="fab__back"
                data-testid="fab-back"
                onClick={() => setStep('how')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                ← Back
              </motion.button>
            )}

            {options.map((a, i) => (
              <motion.button
                key={a.key}
                className="fab__item"
                data-testid={`fab-${a.key}`}
                onClick={() =>
                  step === 'how'
                    ? chooseHow(a.key as 'speak' | 'type')
                    : chooseWhat(a.key as FabAction)}
                // Stagger upward so they read as rising out of the button.
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.94 }}
                transition={{
                  duration: 0.2,
                  delay: reduce ? 0 : (options.length - 1 - i) * 0.05,
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
        aria-label={open ? 'Close' : 'Add'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
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

        {/* The plus rotates into a cross rather than swapping glyphs, so the
            button never blinks. */}
        <motion.span
          className="fab__icon"
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <IconPlus size={26} />
        </motion.span>
      </button>
    </div>
  );
}
