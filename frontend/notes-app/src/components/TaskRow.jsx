import React, { useEffect, useRef, useState } from 'react';
import { Check, Plus, Minus, Sun, Calendar, Ban, Coffee } from 'lucide-react';
import EntryRow from './EntryRow';

/** How long to wait after the last tap before telling the server. */
const FLUSH_MS = 600;

const VISUALS = {
  daily: { icon: Sun, colour: 'text-[#c0b3a5]', tile: 'bg-[#241f19]', edge: 'border-l-[#c0b3a5]' },
  occasional: { icon: Calendar, colour: 'text-purple-400', tile: 'bg-[#1e232b]', edge: 'border-l-purple-400' },
  avoid: { icon: Ban, colour: 'text-focus-red', tile: 'bg-[#2a1a1a]', edge: 'border-l-focus-red' },
  break_day: { icon: Coffee, colour: 'text-white/60', tile: 'bg-white/5', edge: 'border-l-white/20' },
};

/**
 * One task, logged where it sits.
 *
 * There is no "Log" button opening a form. A one-off is a checkbox, and
 * something with a count is a counter — the two shapes a task can actually
 * have, each with the control that matches it. Anything else asks the user to
 * describe an action they could simply have performed.
 *
 * The layout is EntryRow, shared with habits, so the two read alike.
 *
 * Taps are DEBOUNCED rather than sent one by one: ticking off four of five
 * units is four taps in about a second, and firing four requests means four
 * chances to arrive out of order and leave the count wrong. The screen updates
 * instantly and the server hears the final number once.
 */
const TaskRow = ({ task, onLog, showToast, lateBy }) => {
  const target = Math.max(1, task.targetCount || 1);
  const isMulti = target > 1;

  // What the user sees, which runs ahead of what the server knows.
  const [count, setCount] = useState(task.doneCount ?? 0);
  const timer = useRef(null);
  const pending = useRef(null);

  // A refresh from elsewhere wins, unless a flush is still in flight — that
  // would snap the number back under the user's finger.
  useEffect(() => {
    if (pending.current === null) setCount(task.doneCount ?? 0);
  }, [task.doneCount]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = async (value) => {
    pending.current = value;
    try {
      await onLog(task, value);
    } catch {
      setCount(task.doneCount ?? 0);   // put it back if the server refused
      showToast?.('Could not save that', 'error');
    } finally {
      pending.current = null;
    }
  };

  const queue = (next) => {
    const clamped = Math.max(0, Math.min(target, next));
    setCount(clamped);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(clamped), FLUSH_MS);
  };

  const done = count >= target;

  /*
   * A once-a-day task will not take a second unit today however much is still
   * owed, so the + has to stop at today's share rather than at the target.
   * The server enforces the same cap; this only keeps the button honest.
   */
  const perDayCap = task.repCadence === 'daily'
    ? (task.doneCount ?? 0) - (task.doneToday ?? 0) + 1
    : target;
  const ceiling = Math.min(target, perDayCap);
  const spentToday = task.repCadence === 'daily' && count >= ceiling && !done;
  // Late work borrows the red edge, so the list reads at a glance.
  const v = lateBy > 0
    ? { ...VISUALS.occasional, edge: 'border-l-focus-red' }
    : (VISUALS[task.type] ?? VISUALS.daily);

  const terms = (
    <>
      {task.type.replace('_', ' ')}
      {` · +${task.baseReward}★`}
      {/* A deadline is the thing you most need to see on a task that has been
          sitting in the list for three days. */}
      {task.dueKey && !done && (
        <span className={task.daysLeft <= 1 ? 'text-[#e5484d]' : 'text-[#c0b3a5]'}>
          {task.daysLeft === 0 ? ' · due today'
            : task.daysLeft === 1 ? ' · due tomorrow'
            : task.daysLeft > 1 ? ` · ${task.daysLeft} days left`
            : ` · ${Math.abs(task.daysLeft)}d overdue`}
        </span>
      )}
      {spentToday && <span className="text-white/30"> · done for today</span>}
      {lateBy > 0 && (
        <span className="text-focus-red">
          {lateBy === 1 ? ' · since yesterday' : ` · ${lateBy} days late`}
        </span>
      )}
    </>
  );

  const controls = isMulti ? (
    <span className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        aria-label={`Remove one from ${task.title}`}
        data-testid={`minus-${task._id}`}
        disabled={count === 0}
        onClick={() => queue(count - 1)}
        className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-white/60 grid place-items-center disabled:opacity-30 hover:text-white transition-colors"
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        aria-label={`Add one to ${task.title}`}
        data-testid={`plus-${task._id}`}
        disabled={count >= ceiling}
        onClick={() => queue(Math.min(ceiling, count + 1))}
        className={`w-8 h-8 rounded-lg ${v.tile} border border-white/10 ${v.colour} grid place-items-center disabled:opacity-30 hover:scale-105 active:scale-95 transition-transform`}
      >
        <Plus size={15} />
      </button>
    </span>
  ) : (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={task.title}
      data-testid={`check-${task._id}`}
      onClick={() => queue(done ? 0 : target)}
      className={`w-8 h-8 rounded-lg border grid place-items-center shrink-0 transition-colors ${
        done
          ? 'bg-[#3ecf8e] border-[#3ecf8e] text-[#0d0f12]'
          : 'bg-white/5 border-white/15 text-transparent hover:border-white/40'
      }`}
    >
      <Check size={17} strokeWidth={3} />
    </button>
  );

  return (
    <EntryRow
      testId={`task-${task._id}`}
      data-done={done}
      icon={v.icon}
      accent={v.colour}
      tile={v.tile}
      edge={v.edge}
      title={task.title}
      titleStruck={done}
      figure={isMulti ? `${count}/${target}` : null}
      figureLit={done}
      figureTestId={`count-${task._id}`}
      terms={terms}
      controls={controls}
    />
  );
};

export default TaskRow;
