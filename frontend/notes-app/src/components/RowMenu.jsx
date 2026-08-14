import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreVertical, ChevronRight, ChevronLeft, Check } from 'lucide-react';

/**
 * The row's actions, folded into one dot menu.
 *
 * Nine chips per row read as noise and, on a phone, collide with the task's own
 * name. Related actions group behind a parent (Repeat, Services) and open in
 * place, sliding sideways like a phone's settings screen. Two taps for a repeat
 * rule, one for the things people reach for most.
 *
 * Rendered through a PORTAL at fixed coordinates: the panel this sits in
 * scrolls and clips its overflow, so an absolutely positioned menu would be cut
 * off at the row below. Positioned from the button's own rect, flipped upward
 * when the bottom of the window is closer than the menu is tall.
 */
const MENU_W = 216;

const RowMenu = ({ items, testId, ariaLabel = 'More actions' }) => {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(null);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = () => { setOpen(false); setSub(null); };

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current.getBoundingClientRect();
      const h = menuRef.current?.offsetHeight ?? 220;
      const below = window.innerHeight - r.bottom;
      setPos({
        left: Math.max(8, Math.min(window.innerWidth - MENU_W - 8, r.right - MENU_W)),
        top: below < h + 12 ? Math.max(8, r.top - h - 6) : r.bottom + 6,
      });
    };
    place();
    // Re-place instead of drifting away from the button.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, sub]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) close();
    };
    const key = (e) => {
      if (e.key === 'Escape') (sub ? setSub(null) : close());
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open, sub]);

  const run = (fn) => { close(); fn(); };

  const active = sub ? items.find((i) => i.type === 'submenu' && i.label === sub) : null;
  const shown = active ? active.items : items;

  const Item = ({ item, i }) => {
    const Icon = item.icon;
    const isSub = item.type === 'submenu';
    return (
      <motion.button
        type="button"
        data-testid={item.testId}
        onClick={() => (isSub ? setSub(item.label) : run(item.onSelect))}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.025 * i, duration: 0.13 }}
        className={`w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-left text-[12px] font-medium transition-colors ${
          item.danger
            ? 'text-white/70 hover:bg-focus-red/15 hover:text-focus-red'
            : item.active
              ? 'text-[#c0b3a5] bg-white/[0.06]'
              : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
        }`}
      >
        {Icon && <Icon size={14} className="shrink-0" />}
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
        {isSub && <ChevronRight size={13} className="shrink-0 text-white/30" />}
        {!isSub && item.active && <Check size={13} className="shrink-0" />}
      </motion.button>
    );
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        data-testid={testId}
        /* Not a drag handle: the row above listens for pointer drags. */
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => (open ? close() : setOpen(true))}
        className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 transition-colors ${
          open ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/70 hover:bg-white/5'
        }`}
      >
        <MoreVertical size={15} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -2 }}
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
              style={{
                position: 'fixed',
                width: MENU_W,
                left: pos?.left ?? -9999,
                top: pos?.top ?? -9999,
                transformOrigin: 'top right',
              }}
              className="z-[300] bg-[#16191e] border border-white/10 rounded-xl p-1.5 shadow-2xl shadow-black/50 overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={sub ?? 'root'}
                  initial={{ opacity: 0, x: sub ? 22 : -22 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: sub ? -22 : 22 }}
                  transition={{ duration: 0.16, ease: [0.3, 0, 0.2, 1] }}
                >
                  {active && (
                    <button
                      type="button"
                      onClick={() => setSub(null)}
                      className="w-full flex items-center gap-1.5 px-2 h-8 mb-1 rounded-lg text-[9px] font-bold tracking-widest text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
                    >
                      <ChevronLeft size={13} />
                      {active.label.toUpperCase()}
                    </button>
                  )}

                  {shown.map((item, i) =>
                    item.type === 'divider' ? (
                      <div key={`d${i}`} className="h-px bg-white/[0.07] my-1.5 mx-1" />
                    ) : (
                      <Item key={item.label} item={item} i={i} />
                    ),
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};

export default RowMenu;
