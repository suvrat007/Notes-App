import { useEffect, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { useForge } from '../store/useForge';
import { HabitIcon } from '../components/habitIcons';
import SortableRow from '../components/SortableRow';
import { periodShortLabel } from '../engine/period';
import { HORIZON_LABEL, HORIZON_ORDER, type Horizon } from '../engine/series';
import EditHabitModal from '../components/EditHabitModal';
import EditTaskModal from '../components/EditTaskModal';
import type { Habit, Task, TaskHorizon } from '../db/schema';
import { toast } from '../store/useToast';

export default function ManageScreen() {
  const {
    ready, habits, upcomingTasks, loadToday, today,
    reorderHabits, reorderTasks, archiveHabit, removeTask,
    setTaskHorizon, stopRepeating, duplicateAcrossWeek,
    convertTaskToHabit, convertHabitToTask, updateHabitFields, updateTaskFields,
  } = useForge();

  const [localHabits, setLocalHabits] = useState<Habit[]>([]);
  const [buckets, setBuckets] = useState<Record<Horizon, Task[]>>({
    daily: [], weekly: [], monthly: [], once: [],
  });
  // Which habit is having its weekly roadmap target entered, and the number.
  const [goalFor, setGoalFor] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState('5');
  // The row whose full spec is being edited, if any.
  const [editHabit, setEditHabit] = useState<Habit | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  /** Which panel is lit up as a drop target: whichever one is NOT the source. */
  const [dropArmed, setDropArmed] = useState<'habits' | 'tasks' | null>(null);

  // Hit-tested on drop, so a row dragged onto the other panel converts.
  // Both directions, because a one-way conversion is a trapdoor.
  const habitsRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void loadToday(); }, [loadToday]);
  useEffect(() => { setLocalHabits(habits); }, [habits]);
  useEffect(() => {
    const next: Record<Horizon, Task[]> = { daily: [], weekly: [], monthly: [], once: [] };
    /*
     * Collapse a series to its NEXT occurrence. Manage is where you shape what
     * repeats; listing all 60-odd materialised copies of a daily task would
     * bury everything else. The individual occurrences live on Home, a day at
     * a time, which is where acting on one of them makes sense.
     */
    const seenSeries = new Set<string>();
    for (const t of upcomingTasks) {
      if (t.seriesId) {
        if (seenSeries.has(t.seriesId)) continue;
        seenSeries.add(t.seriesId);
      }
      next[(t.horizon ?? 'once') as Horizon].push(t);
    }
    setBuckets(next);
  }, [upcomingTasks]);

  /** How many upcoming occurrences a collapsed series stands for. */
  const seriesCount = (t: Task) =>
    t.seriesId ? upcomingTasks.filter((x) => x.seriesId === t.seriesId).length : 1;

  if (!ready) return <div className="screen" data-testid="screen-manage">Loading…</div>;

  /** Put a habit on the weekly roadmap by giving it a per-week target. */
  const commitGoal = async (h: Habit) => {
    const reps = Math.max(0, Math.round(Number(goalDraft) || 0));
    setGoalFor(null);
    if (reps <= 0) return;
    await updateHabitFields(h.id, { targetReps: reps, targetPeriodWeeks: 1 });
    toast.success(`“${h.name}” is on the roadmap — ${reps} a week.`);
  };

  /**
   * Move a task between the repeat buckets, from anywhere.
   *
   * Going back to `once` is a different operation from switching between
   * daily/weekly/monthly: it has to tear down the future occurrences rather
   * than regenerate them, and the user should be told how many vanished.
   */
  const changeHorizon = async (id: string, horizon: TaskHorizon, name: string) => {
    if (horizon === 'once') {
      const n = await stopRepeating(id);
      toast.success(n > 0
        ? `Stopped repeating — ${n} future one${n === 1 ? '' : 's'} removed.`
        : `Updated “${name}”.`);
      return;
    }
    await setTaskHorizon(id, horizon);
    toast.success(`“${name}” now repeats ${horizon}.`);
  };

  /** True when a pointer release lands inside the given panel. */
  const inside = (ref: typeof habitsRef, x: number, y: number) => {
    const r = ref.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  /** The release point, whichever pointer flavour the event carries. */
  const pointOf = (e: PointerEvent | MouseEvent | TouchEvent) =>
    ('clientX' in e ? e : (e as TouchEvent).changedTouches?.[0]) ?? null;

  const habitDropped = async (h: Habit, e: PointerEvent | MouseEvent | TouchEvent) => {
    setDropArmed(null);
    const pt = pointOf(e);
    if (pt && inside(tasksRef, pt.clientX, pt.clientY)) {
      await convertHabitToTask(h.id);
      toast.success(`“${h.name}” is now a task. Its history is kept.`);
      return;
    }
    await reorderHabits(localHabits.map((x) => x.id));
  };

  const taskDropped = async (t: Task, e: PointerEvent | MouseEvent | TouchEvent) => {
    setDropArmed(null);
    const pt = pointOf(e);
    if (pt && inside(habitsRef, pt.clientX, pt.clientY)) {
      await convertTaskToHabit(t.id);
      toast.success(`“${t.name}” is now a habit.`);
      return;
    }
    // Otherwise it was a reorder within its own bucket.
    await reorderTasks(buckets[(t.horizon ?? 'once') as Horizon].map((x) => x.id));
  };

  return (
    <div className="screen" data-testid="screen-manage">
      <h1 className="screen__title">Manage</h1>
      <p className="manage__hint">
        Drag the handle to reorder. Drop a task on Habits to turn it into one,
        or use the chips to move it between Daily, Weekly and Monthly.
      </p>

      <div className="manage-grid">
        {/* ---------------- Habits ---------------- */}
        <section className="manage-col">
          <h2 className="sect">Habits · {localHabits.length}</h2>

          <div ref={habitsRef}
               className={'droppane' + (dropArmed === 'habits' ? ' droppane--armed' : '')}
               data-testid="habits-pane">
            {dropArmed === 'habits' && (
              <p className="droppane__hint" data-testid="drop-hint">Drop here to make it a habit</p>
            )}

            {localHabits.length === 0 && <p className="empty">No habits yet.</p>}

            <Reorder.Group axis="y" values={localHabits} onReorder={setLocalHabits}
                           as="div" className="mlist" data-testid="habit-list">
              {localHabits.map((h) => (
                <SortableRow key={h.id} value={h} testId={`mh-${h.id}`}
                             onDragStart={() => setDropArmed('tasks')}
                             onDropAt={(e) => void habitDropped(h, e)}>
                  <span className={'mrow__icon' + (h.polarity === 'bad' ? ' mrow__icon--bad' : '')}>
                    <HabitIcon name={h.icon} size={18} />
                  </span>

                  <span className="mrow__body">
                    {/* Renaming now happens inside the full editor, where the
                        rest of the habit's terms live too. */}
                    <button className="mrow__name" data-testid={`mh-name-${h.id}`}
                            title="Change what this habit asks of you"
                            onClick={() => setEditHabit(h)}>
                      {h.name}
                    </button>
                    <span className="mrow__meta">
                      {h.polarity === 'bad' ? 'Break' : 'Build'}
                      {h.targetReps > 0 &&
                        ` · ${h.targetReps}/${periodShortLabel(h.targetPeriodWeeks)}`}
                    </span>
                  </span>

                  {/* The roadmap is exactly "good habits with a goal", so
                      putting one on the roadmap IS giving it a weekly target.
                      Asking for the number beats guessing it. */}
                  {h.polarity === 'good' && (
                    goalFor === h.id ? (
                      <input className="mrow__edit mrow__goal" type="number" min={1} autoFocus
                             value={goalDraft} data-testid={`mh-goal-${h.id}`}
                             onChange={(e) => setGoalDraft(e.target.value)}
                             onBlur={() => setGoalFor(null)}
                             onKeyDown={(e) => {
                               if (e.key === 'Escape') setGoalFor(null);
                               if (e.key !== 'Enter') return;
                               void commitGoal(h);
                             }} />
                    ) : (
                      <button
                        className={'mrow__chip' + (h.targetReps > 0 ? ' mrow__chip--on' : '')}
                        data-testid={`mh-roadmap-${h.id}`}
                        title={h.targetReps > 0
                          ? 'On the weekly roadmap — tap to take it off'
                          : 'Add to the weekly roadmap'}
                        onClick={async () => {
                          if (h.targetReps > 0) {
                            await updateHabitFields(h.id, { targetReps: 0 });
                            toast.success(`“${h.name}” is off the roadmap.`);
                            return;
                          }
                          setGoalDraft('5');
                          setGoalFor(h.id);
                        }}>
                        {h.targetReps > 0
                          ? `${h.targetReps}/${periodShortLabel(h.targetPeriodWeeks)}`
                          : '+ roadmap'}
                      </button>
                    )
                  )}

                  <button className="mrow__chip" data-testid={`mh-totask-${h.id}`}
                          title="Turn this habit into a one-off task"
                          onClick={async () => {
                            await convertHabitToTask(h.id);
                            toast.success(`“${h.name}” is now a task. Its history is kept.`);
                          }}>→ task</button>

                  <button className="mrow__del" aria-label={`Archive ${h.name}`}
                          data-testid={`mh-archive-${h.id}`}
                          onClick={async () => {
                            await archiveHabit(h.id);
                            toast.success(`${h.name} archived. Its history is kept.`);
                          }}>✕</button>
                </SortableRow>
              ))}
            </Reorder.Group>
          </div>
        </section>

        {/* ---------------- Tasks, bucketed ---------------- */}
        <section className="manage-col">
          <h2 className="sect">Tasks · {upcomingTasks.length}</h2>

          <div ref={tasksRef}
               className={'droppane' + (dropArmed === 'tasks' ? ' droppane--armed' : '')}
               data-testid="tasks-pane">
            {dropArmed === 'tasks' && (
              <p className="droppane__hint" data-testid="drop-hint-task">
                Drop here to make it a task
              </p>
            )}

          {HORIZON_ORDER.map((hz) => (
            <div className="bucket" key={hz} data-testid={`bucket-${hz}`}>
              <h3 className="bucket__title">
                {HORIZON_LABEL[hz]}
                <span className="bucket__count">{buckets[hz].length}</span>
              </h3>

              {buckets[hz].length === 0 ? (
                <p className="bucket__empty">Nothing {HORIZON_LABEL[hz].toLowerCase()}.</p>
              ) : (
                <Reorder.Group axis="y" values={buckets[hz]}
                               onReorder={(v) => setBuckets((b) => ({ ...b, [hz]: v }))}
                               as="div" className="mlist" data-testid={`task-list-${hz}`}>
                  {buckets[hz].map((t) => (
                    <SortableRow key={t.id} value={t} testId={`mt-${t.id}`}
                                 onDragStart={() => setDropArmed('habits')}
                                 onDropAt={(e) => void taskDropped(t, e)}>
                      <span className="mrow__body">
                        <button className={'mrow__name' + (t.done ? ' mrow__name--done' : '')}
                                data-testid={`mt-name-${t.id}`}
                                title="Change this task's terms"
                                onClick={() => setEditTask(t)}>
                          {t.name}
                        </button>
                        <span className="mrow__meta">
                          {t.dueDate === today ? 'today' : t.dueDate}
                          {t.dueTime ? ` · ${t.dueTime}` : ''}
                          {t.targetCount > 1 && ` · ${t.doneCount}/${t.targetCount}`}
                          {t.seriesId && ` · repeats · ${seriesCount(t)} upcoming`}
                        </span>
                      </span>

                      {/* Move between buckets without needing a precise drag. */}
                      <span className="mrow__chips">
                        {(['daily', 'weekly', 'monthly'] as Horizon[]).map((h) => (
                          <button key={h}
                                  className={'mrow__chip' + (t.horizon === h ? ' mrow__chip--on' : '')}
                                  data-testid={`mt-${h}-${t.id}`}
                                  title={`Repeat ${h}`}
                                  onClick={async () => {
                                    if (t.horizon === h) {
                                      const n = await stopRepeating(t.id);
                                      toast.success(n > 0
                                        ? `Stopped repeating — ${n} future one${n === 1 ? '' : 's'} removed.`
                                        : 'No longer repeating.');
                                    } else {
                                      await setTaskHorizon(t.id, h);
                                      toast.success(`“${t.name}” now repeats ${h}.`);
                                    }
                                  }}>
                            {h[0].toUpperCase()}
                          </button>
                        ))}
                        <button className="mrow__chip" data-testid={`mt-dupweek-${t.id}`}
                                title="Copy onto the rest of this week"
                                onClick={async () => {
                                  const n = await duplicateAcrossWeek(t.id);
                                  toast.success(n > 0
                                    ? `Copied to ${n} more day${n === 1 ? '' : 's'} this week.`
                                    : 'Already on every remaining day this week.');
                                }}>wk</button>
                      </span>

                      <button className="mrow__del" aria-label={`Delete ${t.name}`}
                              data-testid={`mt-del-${t.id}`}
                              onClick={async () => {
                                await removeTask(t.id);
                                toast.success(`Deleted “${t.name}”.`);
                              }}>✕</button>
                    </SortableRow>
                  ))}
                </Reorder.Group>
              )}
            </div>
          ))}
          </div>
        </section>
      </div>

      {/* Voice moved to the floating button, which is app-wide and opens in
          command mode while this screen is showing. */}

      {editHabit && (
        <EditHabitModal
          habit={editHabit}
          onClose={() => setEditHabit(null)}
          onSave={async (patch) => {
            await updateHabitFields(editHabit.id, patch);
            setEditHabit(null);
            toast.success(`Updated “${patch.name ?? editHabit.name}”.`);
          }}
        />
      )}

      {editTask && (
        <EditTaskModal
          task={editTask}
          seriesCount={seriesCount(editTask)}
          onClose={() => setEditTask(null)}
          onSave={async (patch, horizon) => {
            const id = editTask.id;
            const was = editTask.horizon ?? 'once';
            setEditTask(null);
            await updateTaskFields(id, patch);
            // Rebuilding the series is a separate, heavier step, so it only
            // runs when the answer to "how often" actually changed.
            if (horizon !== was) await changeHorizon(id, horizon, patch.name ?? editTask.name);
            else toast.success(`Updated “${patch.name ?? editTask.name}”.`);
          }}
        />
      )}
    </div>
  );
}
