import React from 'react';
import { Plus, Minus, Check, Flame, Ban } from 'lucide-react';

/**
 * One habit row, built for a NARROW column.
 *
 * Name and score on top, terms and controls beneath. Squeezing all four into
 * one row is what turned "Reading" into "Read…" and wrapped the terms onto
 * four lines; two short rows fit a third of a desktop and a whole phone alike.
 *
 * A number only earns its place when there is something to count TOWARDS:
 *
 *   "20 pushups a day"      -> today against the daily quota
 *   "10 sessions this week" -> the WEEK against the goal, because you may do
 *                              several in a day and none the next
 *   "gym"                   -> nothing to count; a tick is the whole story
 *
 * Bad habits always show the tally: every slip costs, quota or not.
 */
const HabitCard = ({ habit, onLog, onUndo, busy }) => {
  const isBad = habit.polarity === 'bad';
  const quota = isBad ? habit.dailyAllowance : habit.dailyTarget;
  const goalOnly = !isBad && quota === 0 && habit.targetReps > 0;
  const counted = quota > 0 || isBad || goalOnly;

  const reps = habit.repsToday ?? 0;
  const period = habit.repsThisPeriod ?? 0;
  const met = quota > 0 ? reps >= quota : reps > 0;

  const countText = quota > 0
    ? `${reps}/${quota}`
    : goalOnly ? `${period}/${habit.targetReps}` : String(reps);

  const Icon = isBad ? Ban : Flame;
  const accent = isBad ? 'text-focus-red' : 'text-[#c0b3a5]';
  const tileBg = isBad ? 'bg-[#2a1a1a]' : 'bg-[#241f19]';
  const edge = isBad ? 'border-l-focus-red' : 'border-l-[#c0b3a5]';

  /* One line, always. Long enough to say what matters, short enough to fit. */
  const terms = isBad
    ? [
        habit.dailyAllowance > 0 ? `${reps}/${habit.dailyAllowance} allowed` : 'no allowance',
        `next ${habit.nextDelta}★`,
      ].join(' · ')
    : [
        `+${habit.starsPerRep}★`,
        habit.dailyTarget > 0 && `${reps}/${habit.dailyTarget} today`,
        habit.targetReps > 0 && `goal ${habit.targetReps}/wk`,
        habit.targetReps > 0 && habit.dailyTarget === 0 && reps > 0 && `${reps} today`,
      ].filter(Boolean).join(' · ');

  return (
    <div
      className={`bg-black/40 border border-white/5 rounded-xl ${edge} border-l-[3px] px-3 py-2`}
      data-testid={`habit-${habit._id}`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg ${tileBg} grid place-items-center shrink-0`}>
          <Icon size={14} className={accent} />
        </span>

        <h4 className="flex-1 min-w-0 text-sm font-bold text-white truncate">{habit.name}</h4>

        {/* The glyph reads at a glance; data-reps carries the exact number for
            anything that needs it, screen readers included. */}
        <span
          className={`font-heading font-black text-base leading-none tabular-nums shrink-0 ${
            met ? accent : 'text-white/30'
          }`}
          data-testid={`count-${habit._id}`}
          data-reps={reps}
          aria-label={`${reps} today`}
        >
          {counted ? countText : (met ? <Check size={17} /> : '-')}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        <p className="flex-1 min-w-0 text-[11px] text-white/45 truncate" title={terms}>
          {terms}
          {/* Being past the allowance changes what the NEXT tap costs, so it
              has to be said on the card and not left to be discovered. */}
          {isBad && reps > habit.dailyAllowance && (
            <span className="text-focus-red font-bold"> · over</span>
          )}
        </p>

        <button
          type="button"
          disabled={reps === 0 || busy}
          onClick={() => onUndo(habit)}
          aria-label={`Remove one ${habit.name}`}
          data-testid={`undo-${habit._id}`}
          className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/60 grid place-items-center disabled:opacity-30 hover:text-white transition-colors shrink-0"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onLog(habit)}
          aria-label={`Log ${habit.name}`}
          data-testid={`log-${habit._id}`}
          className={`w-8 h-8 rounded-lg ${tileBg} border border-white/10 ${accent} grid place-items-center disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform shrink-0`}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
};

export default HabitCard;
