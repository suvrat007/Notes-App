import { Reorder, useDragControls } from 'framer-motion';
import type { ReactNode } from 'react';

type Props<T> = {
  value: T;
  testId: string;
  children: ReactNode;
  /** Simple case: the row was reordered within its own list. */
  onDrop?: () => void;
  /**
   * Richer case: receives the release event so the caller can hit-test where
   * the row was dropped — that is how a task dragged onto the Habits panel
   * becomes a habit, which a single-container Reorder cannot express.
   */
  onDropAt?: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  onDragStart?: () => void;
};

/**
 * One draggable row.
 *
 * Dragging is bound to an explicit handle rather than the whole row: the row
 * carries its own buttons (archive, delete), and a whole-row drag on a
 * touchscreen would swallow those taps and fight the page scroll.
 */
export default function SortableRow<T>({
  value, testId, children, onDrop, onDropAt, onDragStart,
}: Props<T>) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={(e) => { onDropAt?.(e); onDrop?.(); }}
      className="mrow"
      data-testid={testId}
      whileDrag={{ scale: 1.02, zIndex: 5, cursor: 'grabbing' }}
      transition={{ duration: 0.18 }}
    >
      <button
        className="mrow__grip"
        aria-label="Drag to reorder"
        data-testid={`${testId}-grip`}
        // Pointer-down starts the drag; touch-action:none (in CSS) stops the
        // browser claiming the gesture as a scroll first.
        onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
             fill="currentColor">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      {children}
    </Reorder.Item>
  );
}
