import { useEffect, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { useForge } from '../store/useForge';
import { HabitIcon } from '../components/habitIcons';
import SortableRow from '../components/SortableRow';
import VoiceModal from '../components/VoiceModal';
import { IconMic } from '../components/icons';
import { periodShortLabel } from '../engine/period';
import { HORIZON_LABEL, HORIZON_ORDER, type Horizon } from '../engine/series';
import type { Habit, Task } from '../db/schema';
import { toast } from '../store/useToast';

export default function ManageScreen() {
  const {
    ready, habits, upcomingTasks, loadToday, today,
    reorderHabits, reorderTasks, archiveHabit, removeTask, renameHabit,
    setTaskHorizon, stopRepeating, duplicateAcrossWeek,
    convertTaskToHabit, convertHabitToTask,
  } = useForge();

  const [localHabits, setLocalHabits] = useState<Habit[]>([]);
  const [buckets, setBuckets] = useState<Record<Horizon, Task[]>>({
    daily: [], weekly: [], monthly: [], once: [],
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [voice, setVoice] = useState(false);
  const [dropArmed, setDropArmed] = useState(false);

  // Hit-tested on drop, so a task dragged onto the Habits panel converts.
  const habitsRef = useRef<HTMLDivElement | null>(null);

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

  const commitRename = async (h: Habit) => {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === h.name) return;
    await renameHabit(h.id, name);
    toast.success(`Renamed to “${name}”.`);
  };

  /** True when a pointer release lands inside the Habits panel. */
  const overHabits = (x: number, y: number) => {
    const r = habitsRef.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const taskDropped = async (t: Task, e: PointerEvent | MouseEvent | TouchEvent) => {
    setDropArmed(false);
    const pt = 'clientX' in e ? e : (e as TouchEvent).changedTouches?.[0];
    if (pt && overHabits(pt.clientX, pt.clientY)) {
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
               className={'droppane' + (dropArmed ? ' droppane--armed' : '')}
               data-testid="habits-pane">
            {dropArmed && (
              <p className="droppane__hint" data-testid="drop-hint">Drop here to make it a habit</p>
            )}

            {localHabits.length === 0 && <p className="empty">No habits yet.</p>}

            <Reorder.Group axis="y" values={localHabits} onReorder={setLocalHabits}
                           as="div" className="mlist" data-testid="habit-list">
              {localHabits.map((h) => (
                <SortableRow key={h.id} value={h} testId={`mh-${h.id}`}
                             onDrop={() => void reorderHabits(localHabits.map((x) => x.id))}>
                  <span className={'mrow__icon' + (h.polarity === 'bad' ? ' mrow__icon--bad' : '')}>
                    <HabitIcon name={h.icon} size={18} />
                  </span>

                  <span className="mrow__body">
                    {editing === h.id ? (
                      <input className="mrow__edit" value={draft} autoFocus
                             data-testid={`mh-edit-${h.id}`}
                             onChange={(e) => setDraft(e.target.value)}
                             onBlur={() => void commitRename(h)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter') void commitRename(h);
                               if (e.key === 'Escape') setEditing(null);
                             }} />
                    ) : (
                      <button className="mrow__name" data-testid={`mh-name-${h.id}`}
                              onClick={() => { setEditing(h.id); setDraft(h.name); }}>
                        {h.name}
                      </button>
                    )}
                    <span className="mrow__meta">
                      {h.polarity === 'bad' ? 'Break' : 'Build'}
                      {h.targetReps > 0 &&
                        ` · ${h.targetReps}/${periodShortLabel(h.targetPeriodWeeks)}`}
                    </span>
                  </span>

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
                                 onDragStart={() => setDropArmed(true)}
                                 onDropAt={(e) => void taskDropped(t, e)}>
                      <span className="mrow__body">
                        <span className={'mrow__name' + (t.done ? ' mrow__name--done' : '')}>
                          {t.name}
                        </span>
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
        </section>
      </div>

      <button className="btn btn--primary btn--voice" data-testid="manage-voice"
              onClick={() => setVoice(true)}>
        <IconMic size={18} /> Command by voice
      </button>

      {voice && <VoiceModal mode="command" onClose={() => setVoice(false)} />}
    </div>
  );
}
