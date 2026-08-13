import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Flame, Ban, CheckSquare, Trash2, Repeat } from 'lucide-react';
import api from '../../../utils/api';
import HabitModal from '../../../components/HabitModal';
import TaskEditModal from '../../../components/TaskEditModal';

const HORIZONS = [
  { key: 'daily', short: 'D', label: 'Daily' },
  { key: 'weekly', short: 'W', label: 'Weekly' },
  { key: 'monthly', short: 'M', label: 'Monthly' },
];

/**
 * A row you can pick up.
 *
 * The whole row is NOT the drag handle. Clicking the row opens the editor, and
 * a list where every press might be either a tap or the start of a drag makes
 * both feel unreliable — so dragging lives on the grip, and only the grip.
 */
const Row = ({ value, children, onDrop }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-2xl px-3 py-2.5"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label="Drag to reorder"
        className="text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <GripVertical size={16} />
      </button>
      {children}
    </Reorder.Item>
  );
};

const Manage = ({ refreshData, showToast }) => {
  const [habits, setHabits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [editHabit, setEditHabit] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [error, setError] = useState('');
  const habitsRef = useRef([]);
  const tasksRef = useRef([]);
  habitsRef.current = habits;
  tasksRef.current = tasks;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/manage');
      setHabits(data.habits);
      setTasks(data.tasks);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your lists');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * onDragEnd fires with the closure from the render BEFORE the reorder, so
   * reading `habits` there would persist the order the list had a moment ago.
   * The refs always hold the list as it is right now.
   */
  const saveOrder = async (kind) => {
    const list = kind === 'habits' ? habitsRef.current : tasksRef.current;
    try {
      await api.patch(`/manage/${kind}/order`, { ids: list.map((x) => x._id) });
    } catch {
      showToast?.('Could not save that order', 'error');
      load();
    }
  };

  const setRepeat = async (task, horizon) => {
    // Tapping the chip a task already has means "stop repeating".
    const next = task.horizon === horizon ? 'once' : horizon;
    try {
      const { data } = await api.patch(`/manage/tasks/${task._id}/repeat`, { horizon: next });
      showToast?.(data.message);
      await load();
      refreshData?.();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not change that', 'error');
    }
  };

  const removeTask = async (task) => {
    try {
      await api.delete(`/tasks/${task._id}`);
      showToast?.(`Deleted “${task.title}”`);
      await load();
      refreshData?.();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not delete', 'error');
    }
  };

  const archiveHabit = async (habit) => {
    try {
      await api.delete(`/habits/${habit._id}`);
      showToast?.(`${habit.name} archived. Its history is kept.`);
      await load();
      refreshData?.();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not archive', 'error');
    }
  };

  if (error) return <p className="text-focus-red text-sm">{error}</p>;

  const Panel = ({ title, count, children, testid }) => (
    <div
      className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:flex md:flex-col md:min-h-0"
      data-testid={testid}
    >
      <div className="flex items-center justify-between mb-4 md:shrink-0">
        <h3 className="font-heading font-black text-white text-lg tracking-wide">{title}</h3>
        <span className="text-[10px] text-white/35 tracking-wider">{count}</span>
      </div>
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">{children}</div>
    </div>
  );

  return (
    <div className="space-y-5 md:h-full md:flex md:flex-col md:min-h-0" data-testid="screen-manage">
      <header className="md:shrink-0">
        <h1 className="text-2xl font-bold font-heading text-white tracking-wide">MANAGE</h1>
        <p className="text-sm text-white/40 mt-1">
          Drag the handle to reorder. Click a row to change its terms.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 md:flex-1 md:min-h-0">
        <Panel title="Habits" count={`${habits.length}`} testid="manage-habits">
          <Reorder.Group
            axis="y" values={habits} onReorder={setHabits}
            as="div" className="space-y-2"
          >
            {habits.map((h) => (
              <Row key={h._id} value={h} onDrop={() => saveOrder('habits')}>
                <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
                  h.polarity === 'bad' ? 'bg-[#2a1a1a] text-focus-red' : 'bg-[#241f19] text-[#c0b3a5]'
                }`}>
                  {h.polarity === 'bad' ? <Ban size={14} /> : <Flame size={14} />}
                </span>

                <button
                  type="button"
                  onClick={() => setEditHabit(h)}
                  data-testid={`mh-${h._id}`}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block text-sm font-bold text-white truncate">{h.name}</span>
                  <span className="block text-[10px] text-white/40">
                    {h.polarity === 'bad' ? 'Break' : 'Build'}
                    {h.targetReps > 0 && ` · ${h.targetReps}/wk`}
                    {h.dailyTarget > 0 && ` · ${h.dailyTarget}/day`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => archiveHabit(h)}
                  aria-label={`Archive ${h.name}`}
                  className="text-white/25 hover:text-focus-red transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </Row>
            ))}
          </Reorder.Group>

          {habits.length === 0 && (
            <p className="text-center text-white/40 text-sm py-8">
              No habits yet. Add one with the + button.
            </p>
          )}
        </Panel>

        <Panel title="Tasks" count={`${tasks.length}`} testid="manage-tasks">
          <Reorder.Group
            axis="y" values={tasks} onReorder={setTasks}
            as="div" className="space-y-2"
          >
            {tasks.map((t) => (
              <Row key={t._id} value={t} onDrop={() => saveOrder('tasks')}>
                <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0 bg-[#1e232b] text-white/60">
                  <CheckSquare size={14} />
                </span>

                <button
                  type="button"
                  onClick={() => setEditTask(t)}
                  data-testid={`mt-${t._id}`}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block text-sm font-bold text-white truncate">{t.title}</span>
                  <span className="block text-[10px] text-white/40">
                    {t.date}
                    {t.targetCount > 1 && ` · ${t.doneCount}/${t.targetCount}`}
                    {t.seriesId && (
                      <span className="text-[#c0b3a5]"> · repeats · {t.upcoming} upcoming</span>
                    )}
                  </span>
                </button>

                {/* Move it between buckets without needing a precise drag. */}
                <span className="flex gap-1 shrink-0">
                  {HORIZONS.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      title={t.horizon === h.key ? 'Stop repeating' : `Repeat ${h.label.toLowerCase()}`}
                      onClick={() => setRepeat(t, h.key)}
                      data-testid={`mt-${h.key}-${t._id}`}
                      className={`w-7 h-7 rounded-lg border text-[10px] font-black transition-colors ${
                        t.horizon === h.key
                          ? 'border-[#c0b3a5] text-[#c0b3a5]'
                          : 'border-white/10 text-white/35 hover:text-white/70'
                      }`}
                    >
                      {h.short}
                    </button>
                  ))}
                </span>

                <button
                  type="button"
                  onClick={() => removeTask(t)}
                  aria-label={`Delete ${t.title}`}
                  className="text-white/25 hover:text-focus-red transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </Row>
            ))}
          </Reorder.Group>

          {tasks.length === 0 && (
            <p className="text-center text-white/40 text-sm py-8">
              Nothing upcoming. Add a task with the + button.
            </p>
          )}
        </Panel>
      </div>

      {editHabit && (
        <HabitModal
          habit={editHabit}
          onClose={() => setEditHabit(null)}
          refreshData={async () => { await load(); refreshData?.(); }}
          showToast={showToast}
        />
      )}

      {editTask && (
        <TaskEditModal
          task={editTask}
          onClose={() => setEditTask(null)}
          refreshData={async () => { await load(); refreshData?.(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default Manage;
