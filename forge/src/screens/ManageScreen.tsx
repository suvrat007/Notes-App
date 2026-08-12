import { useEffect, useState } from 'react';
import { Reorder } from 'framer-motion';
import { useForge } from '../store/useForge';
import { HabitIcon } from '../components/habitIcons';
import SortableRow from '../components/SortableRow';
import VoiceModal from '../components/VoiceModal';
import { IconMic } from '../components/icons';
import { periodShortLabel } from '../engine/period';
import type { Habit, Task } from '../db/schema';
import { toast } from '../store/useToast';

export default function ManageScreen() {
  const {
    ready, habits, upcomingTasks, loadToday,
    reorderHabits, reorderTasks, archiveHabit, removeTask, renameHabit,
  } = useForge();

  // Local copies so a drag animates at 60fps without waiting on Dexie; the
  // store reload on drop is what makes it durable.
  const [localHabits, setLocalHabits] = useState<Habit[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [voice, setVoice] = useState(false);

  useEffect(() => { void loadToday(); }, [loadToday]);
  useEffect(() => { setLocalHabits(habits); }, [habits]);
  useEffect(() => { setLocalTasks(upcomingTasks); }, [upcomingTasks]);

  if (!ready) return <div className="screen" data-testid="screen-manage">Loading…</div>;

  const commitRename = async (h: Habit) => {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === h.name) return;
    await renameHabit(h.id, name);
    toast.success(`Renamed to “${name}”.`);
  };

  return (
    <div className="screen" data-testid="screen-manage">
      <h1 className="screen__title">Manage</h1>
      <p className="manage__hint">
        Drag the handle to set the order you want to see things in.
      </p>

      <div className="manage-grid">
        <section className="manage-col">
          <h2 className="sect">Habits · {localHabits.length}</h2>

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
                    <input
                      className="mrow__edit" value={draft} autoFocus
                      data-testid={`mh-edit-${h.id}`}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => void commitRename(h)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(h);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
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
                    {h.isRecurringTask && ' · daily'}
                  </span>
                </span>

                <button className="mrow__del" aria-label={`Archive ${h.name}`}
                        data-testid={`mh-archive-${h.id}`}
                        onClick={async () => {
                          await archiveHabit(h.id);
                          // Archiving keeps the ledger intact — say so, since
                          // "archive" next to a habit reads as data loss.
                          toast.success(`${h.name} archived. Its history is kept.`);
                        }}>✕</button>
              </SortableRow>
            ))}
          </Reorder.Group>
        </section>

        <section className="manage-col">
          <h2 className="sect">Tasks · {localTasks.length}</h2>

          {localTasks.length === 0 && <p className="empty">Nothing scheduled.</p>}

          <Reorder.Group axis="y" values={localTasks} onReorder={setLocalTasks}
                         as="div" className="mlist" data-testid="task-list">
            {localTasks.map((t) => (
              <SortableRow key={t.id} value={t} testId={`mt-${t.id}`}
                           onDrop={() => void reorderTasks(localTasks.map((x) => x.id))}>
                <span className="mrow__body">
                  <span className={'mrow__name' + (t.done ? ' mrow__name--done' : '')}>
                    {t.name}
                  </span>
                  <span className="mrow__meta">
                    {t.dueDate}{t.dueTime ? ` · ${t.dueTime}` : ''} · {t.stars}★
                    {t.done && ' · done'}
                  </span>
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
