import { useRef } from 'react';
import type React from 'react';
import type { Habit } from '../db/schema';
import { IconPlus } from './icons';
import { periodShortLabel } from '../engine/period';

type Props = {
  habit: Habit;
  reps: number;
  /** Receives the release point so the floating delta can rise from the tap. */
  onLog: (at: { clientX: number; clientY: number }) => void;
  onUndo: () => void;
};

const LONG_PRESS_MS = 500;

/**
 * One habit row: tap the big `+` zone to log a rep, long-press it to undo
 * the last one. Good habits read green, bad habits red on a darker surface.
 */
export default function HabitCard({ habit, reps, onLog, onUndo }: Props) {
  const timer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  const start = () => {
    didLongPress.current = false;
    timer.current = window.setTimeout(() => {
      didLongPress.current = true;
      onUndo();
    }, LONG_PRESS_MS);
  };

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Fires on pointer release; a completed long-press has already acted.
  const release = (e: React.PointerEvent) => {
    const wasLongPress = didLongPress.current;
    cancel();
    if (!wasLongPress) onLog({ clientX: e.clientX, clientY: e.clientY });
  };

  const isBad = habit.polarity === 'bad';
  const overAllowance = isBad && reps > habit.dailyAllowance;

  return (
    <div className={'habit' + (isBad ? ' habit--bad' : '')} data-testid={`habit-${habit.id}`}>
      <span className="habit__icon" aria-hidden="true">{habit.icon}</span>

      <div className="habit__meta">
        <span className="habit__name">{habit.name}</span>
        <span className="habit__sub">
          {isBad ? (
            <>
              {habit.dailyAllowance > 0
                ? `${reps}/${habit.dailyAllowance} allowed today`
                : `−${habit.starsPerRep}★ each`}
              {overAllowance && <span className="habit__warn"> · over</span>}
            </>
          ) : (
            <>
              +{habit.starsPerRep}★ each
              {habit.targetReps > 0 &&
                ` · goal ${habit.targetReps}/${periodShortLabel(habit.targetPeriodWeeks)}`}
            </>
          )}
        </span>
      </div>

      <span className="habit__count num" data-testid={`count-${habit.id}`}>{reps}</span>

      <button
        className="habit__log no-select"
        data-testid={`log-${habit.id}`}
        aria-label={`Log ${habit.name}`}
        onPointerDown={start}
        onPointerUp={release}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <IconPlus />
      </button>
    </div>
  );
}
