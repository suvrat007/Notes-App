import { useRef } from 'react';
import { IconCheck } from './icons';
import { HabitIcon } from './habitIcons';

type Props = {
  id: string;
  name: string;
  stars: number;
  done: boolean;
  icon?: string;
  /** Recurring habit rows are marked so the user knows a tap also logs the habit. */
  recurring?: boolean;
  /** Units needed to finish ("three videos" -> 3). 1 is an ordinary task. */
  targetCount?: number;
  /** Units done so far. */
  doneCount?: number;
  onToggle: (next: boolean) => void;
  /** Multi-unit tasks tick one unit at a time instead of toggling. */
  onAdvance?: () => void;
  onRegress?: () => void;
  onDelete?: () => void;
};

const LONG_PRESS_MS = 500;

export default function TaskRow({
  id, name, stars, done, icon, recurring,
  targetCount = 1, doneCount = 0,
  onToggle, onAdvance, onRegress, onDelete,
}: Props) {
  const timer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  const multi = targetCount > 1 && !!onAdvance;
  const progress = Math.min(doneCount, targetCount);

  const cancel = () => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  };

  // Multi-unit rows borrow the habit card's language: tap adds a unit,
  // long-press takes one back. A plain toggle can't express "2 of 3".
  const start = () => {
    didLongPress.current = false;
    timer.current = window.setTimeout(() => {
      didLongPress.current = true;
      onRegress?.();
    }, LONG_PRESS_MS);
  };

  const release = () => {
    const wasLong = didLongPress.current;
    cancel();
    if (wasLong) return;
    if (multi) onAdvance!();
    else onToggle(!done);
  };

  return (
    <div className={'task' + (done ? ' task--done' : '')} data-testid={`task-${id}`}>
      <button
        className={'task__check' + (multi && !done ? ' task__check--partial' : '')}
        role="checkbox"
        aria-checked={done}
        aria-label={multi ? `${name}, ${progress} of ${targetCount} done` : name}
        data-testid={`check-${id}`}
        onPointerDown={multi ? start : undefined}
        onPointerUp={multi ? release : undefined}
        onPointerLeave={multi ? cancel : undefined}
        onPointerCancel={multi ? cancel : undefined}
        onClick={multi ? undefined : () => onToggle(!done)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {done ? <IconCheck /> : multi && progress > 0 ? (
          <span className="task__frac num">{progress}</span>
        ) : null}
      </button>

      <span className="task__name">
        {icon && <span className="task__icon"><HabitIcon name={icon} size={16} /></span>}
        {name}
        {recurring && <span className="task__tag">habit</span>}
        {multi && (
          <span className="task__progress num" data-testid={`prog-${id}`}>
            {progress}/{targetCount}
          </span>
        )}
      </span>

      <span className="task__stars num" data-testid={`stars-${id}`}>+{stars}★</span>

      {onDelete && (
        <button className="task__del" onClick={onDelete}
                aria-label={`Delete ${name}`} data-testid={`del-${id}`}>✕</button>
      )}
    </div>
  );
}
