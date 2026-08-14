import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { useDataVersion } from '../../../utils/DataContext';
import RowMenu from '../../../components/RowMenu';
import { GripVertical, Flame, Ban, CheckSquare, Trash2, Map, ListChecks, CalendarPlus, ArrowLeftRight, Pencil, Repeat, Share2 } from 'lucide-react';
import api from '../../../utils/api';
import HabitModal from '../../../components/HabitModal';
import TaskEditModal from '../../../components/TaskEditModal';
import { pushToGoogleTasks, pushToGoogleCalendar } from '../../../utils/googleSync';

const HORIZONS = [
  { key: 'daily', short: 'D', label: 'Daily' },
  { key: 'weekly', short: 'W', label: 'Weekly' },
  { key: 'monthly', short: 'M', label: 'Monthly' },
];

/**
 * A titled column of rows.
 *
 * MUST live at module scope. Declared inside Manage it would be a different
 * component type on every render, and React would unmount the whole list —
 * including the row being dragged — whenever anything else changed.
 */
const Panel = ({ title, count, children, testid, paneRef, armedHere }) => (
  <div
    className={`bg-[#16191e] border rounded-3xl p-5 md:p-6 md:flex md:flex-col md:min-h-0 transition-colors ${
      armedHere ? 'border-[#c0b3a5]/60' : 'border-white/5'
    }`}
    data-testid={testid}
  >
    <div className="flex items-center justify-between mb-4 md:shrink-0">
      <h3 className="font-heading font-black text-white text-lg tracking-wide">{title}</h3>
      <span className="text-[10px] text-white/35 tracking-wider">{count}</span>
    </div>
    <div ref={paneRef} className="md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">{children}</div>
  </div>
);
/**
 * A row you can pick up.
 *
 * The whole row is NOT the drag handle. Clicking the row opens the editor, and
 * a list where every press might be either a tap or the start of a drag makes
 * both feel unreliable — so dragging lives on the grip, and only the grip.
 */
const Row = ({ value, children, onDrop, onStart }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={(e, info) => onDrop(e, info)}
      className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-2xl px-3 py-2.5"
    >
      <button
        type="button"
        onPointerDown={(e) => { onStart?.(); controls.start(e); }}
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
  const dataVersion = useDataVersion();
  /** Hit-tested on release, so a row dropped on the other panel converts. */
  const habitsPane = useRef(null);
  const tasksPane = useRef(null);
  const [armed, setArmed] = useState(null);
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

  useEffect(() => { load(); }, [load, dataVersion]);

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

  const toggleRoadmap = async (task) => {
    try {
      const { data } = await api.patch(`/manage/tasks/${task._id}/roadmap`);
      showToast?.(data.message);
      await load();
      refreshData?.();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not update', 'error');
    }
  };

  /**
   * Convert between the two shapes.
   *
   * Some things are only discovered to be habits after a week of treating them
   * as tasks. History is not carried across: ledger rows point at the old id,
   * and re-pointing them would rewrite what those entries meant.
   */
  const convert = async (kind, item) => {
    try {
      const url = kind === 'task'
        ? `/manage/tasks/${item._id}/to-habit`
        : `/manage/habits/${item._id}/to-task`;
      const { data } = await api.post(url);
      showToast?.(data.message);
      await load();
      refreshData?.();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not convert', 'error');
    }
  };

  /** True when the pointer was released inside the given panel. */
  const inside = (ref, x, y) => {
    const r = ref.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  /**
   * Decide what a release meant.
   *
   * Dropped on the OTHER panel it is a conversion; dropped where it started it
   * is a reorder. Framer gives the release point in `info`, which is the only
   * reliable source — the row itself has already animated back into the list
   * by the time this runs.
   */
  const dropped = (kind, item, info) => {
    setArmed(null);
    const p = info?.point;
    const target = kind === 'task' ? habitsPane : tasksPane;
    if (p && inside(target, p.x, p.y)) {
      convert(kind, item);
      return;
    }
    saveOrder(kind === 'task' ? 'tasks' : 'habits');
  };

  /** Push to the user's own Google account, from their own browser. */
  const toGoogle = async (where, task) => {
    try {
      showToast?.('Asking Google...');
      if (where === 'tasks') await pushToGoogleTasks(task);
      else await pushToGoogleCalendar(task);
      showToast?.(`Added to Google ${where === 'tasks' ? 'Tasks' : 'Calendar'}`);
    } catch (err) {
      showToast?.(err.message || 'Google refused that', 'error');
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


  return (
    <div className="space-y-5 md:h-full md:flex md:flex-col md:min-h-0" data-testid="screen-manage">
      <header className="md:shrink-0">
        <h1 className="text-2xl font-bold font-heading text-white tracking-wide">MANAGE</h1>
        <p className="text-sm text-white/40 mt-1">
          Drag the handle to reorder, or onto the other panel to convert it.
          Click a row to change its terms.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 md:flex-1 md:min-h-0">
        <Panel title="Habits" count={`${habits.length}`} testid="manage-habits" paneRef={habitsPane} armedHere={armed === 'habits'}>
          <Reorder.Group
            axis="y" values={habits} onReorder={setHabits}
            as="div" className="space-y-2"
          >
            {habits.map((h) => (
              <Row key={h._id} value={h}
                   onStart={() => setArmed('tasks')}
                   onDrop={(e, info) => dropped('habit', h, info)}>
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
                  <span className="block text-[10px] text-white/40 truncate">
                    {h.polarity === 'bad' ? 'Break' : 'Build'}
                    {h.targetReps > 0 && ` · ${h.targetReps}/wk`}
                    {h.dailyTarget > 0 && ` · ${h.dailyTarget}/day`}
                  </span>
                </button>

                <RowMenu
                  testId={`mh-menu-${h._id}`}
                  ariaLabel={`Actions for ${h.name}`}
                  items={[
                    {
                      label: 'Edit habit',
                      icon: Pencil,
                      testId: `mh-edit-${h._id}`,
                      onSelect: () => setEditHabit(h),
                    },
                    {
                      label: 'Make it a task',
                      icon: CheckSquare,
                      testId: `mh-totask-${h._id}`,
                      onSelect: () => convert('habit', h),
                    },
                    { type: 'divider' },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      testId: `mh-delete-${h._id}`,
                      onSelect: () => archiveHabit(h),
                    },
                  ]}
                />
              </Row>
            ))}
          </Reorder.Group>

          {habits.length === 0 && (
            <p className="text-center text-white/40 text-sm py-8">
              No habits yet. Add one with the + button.
            </p>
          )}
        </Panel>

        <Panel title="Tasks" count={`${tasks.length}`} testid="manage-tasks" paneRef={tasksPane} armedHere={armed === 'tasks'}>
          <Reorder.Group
            axis="y" values={tasks} onReorder={setTasks}
            as="div" className="space-y-2"
          >
            {tasks.map((t) => (
              <Row key={t._id} value={t}
                   onStart={() => setArmed('habits')}
                   onDrop={(e, info) => dropped('task', t, info)}>
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
                  <span className="block text-[10px] text-white/40 truncate">
                    {t.date}
                    {t.targetCount > 1 && ` · ${t.doneCount}/${t.targetCount}`}
                    {t.seriesId && (
                      <span className="text-[#c0b3a5]"> · repeats · {t.upcoming} upcoming</span>
                    )}
                  </span>
                </button>

                {/* Everything this row can do, behind one dot. The roadmap
                    toggle is ours and instant; the Google ones ask that account
                    for permission the first time and never store a token. */}
                <RowMenu
                  testId={`mt-menu-${t._id}`}
                  ariaLabel={`Actions for ${t.title}`}
                  items={[
                    {
                      label: 'Edit task',
                      icon: Pencil,
                      testId: `mt-edit-${t._id}`,
                      onSelect: () => setEditTask(t),
                    },
                    {
                      label: t.onRoadmap ? 'On the roadmap' : 'Add to roadmap',
                      icon: Map,
                      active: t.onRoadmap,
                      testId: `mt-roadmap-${t._id}`,
                      onSelect: () => toggleRoadmap(t),
                    },
                    {
                      type: 'submenu',
                      label: 'Repeat',
                      icon: Repeat,
                      active: !!t.horizon && t.horizon !== 'once',
                      testId: `mt-repeat-${t._id}`,
                      items: HORIZONS.map((h) => ({
                        label: t.horizon === h.key ? `${h.label} (stop)` : h.label,
                        active: t.horizon === h.key,
                        testId: `mt-${h.key}-${t._id}`,
                        onSelect: () => setRepeat(t, h.key),
                      })),
                    },
                    {
                      type: 'submenu',
                      label: 'Send to',
                      icon: Share2,
                      testId: `mt-send-${t._id}`,
                      items: [
                        {
                          label: 'Google Tasks',
                          icon: ListChecks,
                          testId: `mt-gtasks-${t._id}`,
                          onSelect: () => toGoogle('tasks', t),
                        },
                        {
                          label: 'Google Calendar',
                          icon: CalendarPlus,
                          testId: `mt-gcal-${t._id}`,
                          onSelect: () => toGoogle('calendar', t),
                        },
                      ],
                    },
                    {
                      label: 'Make it a habit',
                      icon: Flame,
                      testId: `mt-tohabit-${t._id}`,
                      onSelect: () => convert('task', t),
                    },
                    { type: 'divider' },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      danger: true,
                      testId: `mt-delete-${t._id}`,
                      onSelect: () => removeTask(t),
                    },
                  ]}
                />

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
