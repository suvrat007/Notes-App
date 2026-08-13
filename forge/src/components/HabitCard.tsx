import { useRef } from 'react';
import type React from 'react';
import type { Habit } from '../db/schema';
import { IconPlus, IconMinus, IconCheck } from './icons';
import { periodShortLabel } from '../engine/period';
import { badHabitRepDelta } from '../engine/stars';
import { HabitIcon } from './habitIcons';

type Props = {
  habit: Habit;
  reps: number;
  /**
   * Reps inside the habit's own goal period. A "5 a week" goal is progress
   * across days, so the card has to show the week, not just today.
   */
  periodReps?: number;
  /** Receives the release point so the floating delta can rise from the tap. */
  onLog: (at: { clientX: number; clientY: number }) => void;
  onUndo: () => void;
};

const LONG_PRESS_MS = 500;

/**
 * One habit row: tap the big `+` zone to log a rep, long-press it to undo
 * the last one. Good habits read green, bad habits red on a darker surface.
 */
export default function HabitCard({ habit, reps, periodReps = 0, onLog, onUndo }: Props) {
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
  // Ask the engine rather than restating the maths, so the card can never
  // drift from what tapping actually does.
  const nextCost = isBad ? badHabitRepDelta(habit, reps) : habit.starsPerRep;

  /*
   * A number only earns its place when there is something to count TOWARDS.
   * Three cases, in order of what the user actually promised:
   *
   *   "20 pushups a day"      -> today against the daily quota
   *   "10 sessions this week" -> the WEEK against the goal, because you may
   *                              do several in a day and none the next, and
   *                              today's tally alone would hide the pace
   *   "gym"                   -> nothing to count; a tick is the whole story
   *
   * Bad habits always show the raw tally: every slip costs, quota or not.
   */
  const quota = isBad ? habit.dailyAllowance : habit.dailyTarget;
  const goalOnly = !isBad && quota === 0 && habit.targetReps > 0;
  const counted = quota > 0 || isBad || goalOnly;
  const metToday = quota > 0 ? reps >= quota : reps > 0;

  const countText = quota > 0 ? `${reps}/${quota}`
    : goalOnly ? `${periodReps}/${habit.targetReps}`
    : String(reps);

  return (
    <div className={'habit' + (isBad ? ' habit--bad' : '')} data-testid={`habit-${habit.id}`}>
      <span className="habit__icon"><HabitIcon name={habit.icon} /></span>

      <div className="habit__meta">
        <span className="habit__name">{habit.name}</span>
        <span className="habit__sub">
          {isBad ? (
            <>
              {/* Show what the NEXT tap actually costs. Quoting starsPerRep
                  here was a lie once the allowance was used up: with an
                  allowance of 0 every rep already carries the overage. */}
              {habit.dailyAllowance > 0
                ? `${reps}/${habit.dailyAllowance} allowed · next ${nextCost}★`
                : `no allowance · ${nextCost}★ each`}
              {overAllowance && <span className="habit__warn"> · over</span>}
            </>
          ) : (
            <>
              +{habit.starsPerRep}★ each
              {/* Today's quota and the period goal are different promises, so
                  the card states both rather than collapsing them. */}
              {habit.dailyTarget > 0 && ` · ${reps}/${habit.dailyTarget} today`}
              {/* The goal itself always spelled out; the counter carries the
                  progress towards it. When the counter is busy showing the
                  day instead, the period progress moves here. */}
              {habit.targetReps > 0
                && ` · goal ${habit.targetReps}/${periodShortLabel(habit.targetPeriodWeeks)}`}
              {habit.targetReps > 0 && (
                habit.dailyTarget > 0
                  ? ` · ${periodReps} so far`
                  // Several in one day and none the next is the case this
                  // exists for: without it today's contribution is invisible.
                  : (reps > 0 ? ` · ${reps} today` : '')
              )}
            </>
          )}
        </span>
      </div>

      {/* The glyph says what matters at a glance; data-reps and the label
          carry the exact number for anything that needs it — a screen reader,
          or a test asserting that a rep really landed. */}
      <span className={'habit__count num' + (metToday ? ' habit__count--met' : '')}
            data-testid={`count-${habit.id}`}
            data-reps={reps}
            aria-label={`${reps} today`}>
        {counted ? countText : (metToday ? <IconCheck size={18} /> : '—')}
      </span>

      {/* Long-press already undid a rep, but nothing advertised it. An
          explicit minus is the only discoverable way back. */}
      <button
        className="habit__undo no-select"
        data-testid={`undo-${habit.id}`}
        aria-label={`Remove one ${habit.name}`}
        disabled={reps === 0}
        onClick={onUndo}
      >
        <IconMinus />
      </button>

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
