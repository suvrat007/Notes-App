import React from 'react';
import { Plus, Minus, Check, Flame, Ban } from 'lucide-react';

/**
 * One habit row.
 *
 * A number only earns its place when there is something to count TOWARDS.
 * Three cases, in order of what the user actually promised:
 *
 *   "20 pushups a day"      -> today against the daily quota
 *   "10 sessions this week" -> the WEEK against the goal, because you may do
 *                              several in a day and none the next, and today's
 *                              tally alone would hide the pace
 *   "gym"                   -> nothing to count; a tick is the whole story
 *
 * Bad habits always show the raw tally: every slip costs, quota or not.
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

  return (
    <div
      className={`flex bg-black/40 border border-white/5 rounded-[20px] overflow-hidden ${edge} border-l-[3px]`}
      data-testid={`habit-${habit._id}`}
    >
      <div className="p-4 md:p-5 flex gap-4 w-full items-center">
        <div className={`w-12 h-12 rounded-2xl ${tileBg} flex items-center justify-center shrink-0`}>
          <Icon size={20} className={accent} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm md:text-base font-bold text-white truncate">{habit.name}</h4>
          <p className="text-[11px] text-white/50 mt-0.5">
            {isBad ? (
              <>
                {habit.dailyAllowance > 0
                  ? `${reps}/${habit.dailyAllowance} allowed`
                  : 'no allowance'}
                {' • '}next {habit.nextDelta}★
                {reps > habit.dailyAllowance && (
                  <span className="text-focus-red font-bold"> • over</span>
                )}
              </>
            ) : (
              <>
                +{habit.starsPerRep}★ each
                {habit.dailyTarget > 0 && ` • ${reps}/${habit.dailyTarget} today`}
                {habit.targetReps > 0 && ` • goal ${habit.targetReps}/wk`}
                {/* Several in one day and none the next is exactly the case
                    this exists for; without it today's part is invisible. */}
                {habit.targetReps > 0 && habit.dailyTarget === 0 && reps > 0 && ` • ${reps} today`}
              </>
            )}
          </p>
        </div>

        {/* The glyph reads at a glance; data-reps carries the exact number for
            anything that needs it, screen readers included. */}
        <span
          className={`font-heading font-black text-lg tabular-nums shrink-0 ${met ? accent : 'text-white/30'}`}
          data-testid={`count-${habit._id}`}
          data-reps={reps}
          aria-label={`${reps} today`}
        >
          {counted ? countText : (met ? <Check size={18} /> : '—')}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={reps === 0 || busy}
            onClick={() => onUndo(habit)}
            aria-label={`Remove one ${habit.name}`}
            data-testid={`undo-${habit._id}`}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/60 flex items-center justify-center disabled:opacity-30 hover:text-white transition-colors"
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onLog(habit)}
            aria-label={`Log ${habit.name}`}
            data-testid={`log-${habit._id}`}
            className={`w-11 h-11 rounded-xl ${tileBg} border border-white/10 ${accent} flex items-center justify-center disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform`}
          >
            <Plus size={19} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HabitCard;
