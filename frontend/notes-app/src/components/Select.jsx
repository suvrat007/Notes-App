import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

/**
 * A dropdown that belongs to this app.
 *
 * A native <select> hands its option list to the operating system, which draws
 * it in the OS's own colours and font. On a dark console UI that means a white
 * Windows menu appearing out of nowhere, and no amount of CSS reaches it. So
 * the list is ours: same surfaces, same MALTA accent, same rounded corners as
 * every other panel.
 *
 * Keeps the keyboard behaviour a select is expected to have, because losing
 * that is the usual price of rolling your own.
 */
const Select = ({ value, onChange, options, className = '', testId, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = options.findIndex((o) => String(o.value) === String(value));
        const next = e.key === 'ArrowDown'
          ? Math.min(options.length - 1, i + 1)
          : Math.max(0, i - 1);
        onChange(options[next].value);
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open, options, value, onChange]);

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 bg-[#0d0f12] border border-white/10 rounded-lg px-3 h-9 text-left hover:border-white/25 transition-colors"
      >
        <span className="flex-1 min-w-0 truncate text-[12px] text-white/80">
          {current?.label ?? 'Select'}
        </span>
        <ChevronDown
          size={13}
          className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            data-testid={testId ? `${testId}-list` : undefined}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            /* Above every panel, and scrollable rather than running off the
               bottom of a card that already clips its own overflow. */
            className="absolute z-[200] mt-1.5 w-full max-h-56 overflow-y-auto bg-[#16191e] border border-white/10 rounded-xl p-1 shadow-xl"
          >
            {options.map((o) => {
              const active = String(o.value) === String(value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={testId ? `${testId}-opt-${o.value}` : undefined}
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[12px] transition-colors ${
                      active ? 'text-[#c0b3a5] bg-white/[0.06]' : 'text-white/70 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex-1 min-w-0 truncate">{o.label}</span>
                    {active && <Check size={13} className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Select;
