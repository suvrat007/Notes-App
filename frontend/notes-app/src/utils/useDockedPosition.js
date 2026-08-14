import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag something to whichever edge suits your thumb, and have it stay there.
 *
 * A floating button is only where it is because someone guessed. Right-handed
 * on a large phone it is fine; left-handed, or one-handed on a tall screen, and
 * it sits exactly where the thumb cannot reach — and it covers whatever is
 * underneath it. So it can be picked up and put down anywhere.
 *
 * It SNAPS to the nearest edge rather than floating free: a button loose in the
 * middle of the screen covers content and looks dropped rather than placed. The
 * position is remembered, because moving it every session is worse than it
 * being in the wrong place once.
 *
 * A drag must not also fire a click. `moved` says whether the pointer actually
 * travelled, and the caller checks it before acting on a tap.
 */

const KEY = 'fab-dock';
const EDGE_GAP = 16;
/* Below this, a press is a tap that wobbled rather than a drag. */
const DRAG_SLOP = 8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') return raw;
  } catch {
    /* corrupt or unavailable storage just means the default corner */
  }
  return null;
}

export default function useDockedPosition({ size = 60, bottomInset = 84 } = {}) {
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const origin = useRef({ x: 0, y: 0, px: 0, py: 0 });

  /** Where it sits by default: the bottom-right, clear of the nav bar. */
  const fallback = useCallback(() => ({
    x: window.innerWidth - size - EDGE_GAP,
    y: window.innerHeight - size - bottomInset,
  }), [size, bottomInset]);

  useEffect(() => {
    const saved = load();
    const start = saved ?? fallback();
    setPos({
      x: clamp(start.x, EDGE_GAP, window.innerWidth - size - EDGE_GAP),
      y: clamp(start.y, EDGE_GAP, window.innerHeight - size - EDGE_GAP),
    });
  }, [fallback, size]);

  // A rotated phone or a resized window must not leave it off-screen.
  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? {
        x: clamp(p.x, EDGE_GAP, window.innerWidth - size - EDGE_GAP),
        y: clamp(p.y, EDGE_GAP, window.innerHeight - size - EDGE_GAP),
      } : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [size]);

  /** Put it against whichever edge the drop was closest to. */
  const snap = useCallback((raw) => {
    const maxX = window.innerWidth - size - EDGE_GAP;
    const maxY = window.innerHeight - size - EDGE_GAP;
    const x = clamp(raw.x, EDGE_GAP, maxX);
    const y = clamp(raw.y, EDGE_GAP, maxY);

    const gaps = {
      left: x - EDGE_GAP,
      right: maxX - x,
      top: y - EDGE_GAP,
      bottom: maxY - y,
    };
    const nearest = Object.keys(gaps).reduce((a, b) => (gaps[a] <= gaps[b] ? a : b));

    const docked = { x, y };
    if (nearest === 'left') docked.x = EDGE_GAP;
    else if (nearest === 'right') docked.x = maxX;
    else if (nearest === 'top') docked.y = EDGE_GAP;
    else docked.y = maxY;

    try {
      localStorage.setItem(KEY, JSON.stringify(docked));
    } catch {
      /* not being able to remember is not a reason to refuse the move */
    }
    return docked;
  }, [size]);

  const onPointerDown = useCallback((e) => {
    if (!pos) return;
    moved.current = false;
    origin.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
    setDragging(true);
    // Keeps the move events coming even when the pointer leaves the button.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    const dx = e.clientX - origin.current.px;
    const dy = e.clientY - origin.current.py;
    if (!moved.current && Math.hypot(dx, dy) < DRAG_SLOP) return;
    moved.current = true;
    setPos({ x: origin.current.x + dx, y: origin.current.y + dy });
  }, [dragging]);

  const onPointerUp = useCallback((e) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (moved.current) setPos((p) => (p ? snap(p) : p));
  }, [dragging, snap]);

  /** Which half it ended up in, so a menu opens away from the screen edge. */
  const side = pos && pos.x > window.innerWidth / 2 ? 'right' : 'left';
  const vertical = pos && pos.y > window.innerHeight / 2 ? 'bottom' : 'top';

  return {
    pos,
    dragging,
    side,
    vertical,
    /** True while the last gesture was a drag, so a click can be ignored. */
    didDrag: () => moved.current,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
