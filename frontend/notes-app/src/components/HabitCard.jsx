import React, { useEffect, useRef, useState } from 'react';
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
const PERIOD_WORD = { 1: 'this week', 4: 'this month', 12: 'this quarter' };

/** How long to wait after the last tap before telling the server. */
const FLUSH_MS = 600;

const HabitCard = ({ habit, onChange }) => {
  const isBad = habit.polarity === 'bad';
  /*
   * A habit measured in something needs to say HOW MUCH, not just that it
   * happened. A +1 button cannot express a four kilometre run, so unit habits
   * get a number to type into and the button logs that amount.
   */
  const unit = (habit.unit || '').trim();
  const [amount, setAmount] = useState(1);
  const quota = isBad ? habit.dailyAllowance : habit.dailyTarget;
  // The number the server judges the period by: a weekly goal smaller than a
  // day's quota is incoherent, so the larger of the two wins everywhere.
  const periodTarget = Math.max(habit.targetReps || 0, habit.dailyTarget || 0);
  const goalOnly = !isBad && quota === 0 && periodTarget > 0;
  const counted = quota > 0 || isBad || goalOnly;

  /*
   * Taps land instantly; the server hears the total once.
   *
   * Every tap used to POST and then reload the entire dashboard, with all
   * the cards disabled until it came back — so the number could not move
   * until a full round trip finished, and holding + felt broken. The count
   * shown is the server's plus whatever is still pending locally.
   */
  const [pending, setPending] = useState(0);
  /*
   * The same number, readable synchronously.
   *
   * The flush cannot ask setPending for the current value: React does not run
   * the updater before the next statement, so the timer read 0 every time and
   * returned without sending anything. The screen still showed the taps, so it
   * looked like it had worked while nothing at all was written.
   */
  const pendingRef = useRef(0);
  const timer = useRef(null);
  const inFlight = useRef(false);

  // A refresh from elsewhere wins, unless our own flush is still running —
  // that would snap the number back under the user's finger.
  useEffect(() => {
    if (!inFlight.current) { pendingRef.current = 0; setPending(0); }
  }, [habit.repsToday, habit.repsThisPeriod]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const reps = Math.max(0, (habit.repsToday ?? 0) + pending);
  const period = Math.max(0, (habit.repsThisPeriod ?? 0) + pending);
  const met = quota > 0 ? reps >= quota : reps > 0;

  const countText = quota > 0
    ? `${reps}/${quota}`
    : goalOnly ? `${period}/${periodTarget}` : String(reps);


  /**
   * Send the NET change once the tapping stops.
   *
   * Four taps become one request carrying +4, not four requests racing each
   * other into the wrong order. onChange resolves to the server refresh, so
   * the pending offset is only dropped once the real numbers have landed.
   */
  const queue = (delta) => {
    pendingRef.current += delta;
    setPending(pendingRef.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const net = pendingRef.current;
      if (net === 0) return;

      inFlight.current = true;
      try {
        await onChange(habit, net);
      } catch {
        // Put the number back; the server never took it.
      } finally {
        inFlight.current = false;
        /*
         * SUBTRACT what was sent, never reset.
         *
         * A tap landing while the request is in flight adds to the ref, and
         * zeroing afterwards counted it a second time on the next flush -
         * three taps wrote four reps. Taking off exactly what went leaves any
         * later tap intact and counted once.
         */
        pendingRef.current -= net;
        setPending(pendingRef.current);
      }
    }, FLUSH_MS);
  };

  const step = unit ? Math.max(1, Number(amount) || 1) : 1;
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
        periodTarget > 0 && `${period}/${periodTarget}${unit ? ' ' + unit : ''} ${PERIOD_WORD[habit.targetPeriodWeeks] ?? 'this period'}`,
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

        {/* How much of it. Only for habits that measure something; a plain
            rep has nothing to type. */}
        {unit && (
          <span className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              aria-label={`How many ${unit} of ${habit.name}`}
              data-testid={`amount-${habit._id}`}
              className="w-12 h-7 bg-[#0d0f12] border border-white/10 rounded-lg px-1.5 text-center text-white text-[11px] tabular-nums"
            />
            <span className="text-[10px] text-white/35">{unit}</span>
          </span>
        )}

        <button
          type="button"
          disabled={reps === 0}
          onClick={() => queue(-step)}
          aria-label={`Remove one ${habit.name}`}
          data-testid={`undo-${habit._id}`}
          className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/60 grid place-items-center disabled:opacity-30 hover:text-white transition-colors shrink-0"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={() => queue(step)}
          aria-label={`Log ${habit.name}`}
          data-testid={`log-${habit._id}`}
          className={`w-8 h-8 rounded-lg ${tileBg} border border-white/10 ${accent} grid place-items-center hover:scale-105 active:scale-95 transition-transform shrink-0`}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
};

export default HabitCard;
