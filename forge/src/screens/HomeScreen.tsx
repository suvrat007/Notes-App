import { useEffect, useRef, useState } from 'react';
import { useForge } from '../store/useForge';
import HabitCard from '../components/HabitCard';
import TodayRing from '../components/TodayRing';
import NewHabitModal from '../components/NewHabitModal';
import NewTaskModal from '../components/NewTaskModal';
import TaskRow from '../components/TaskRow';
import TargetBanner from '../components/TargetBanner';
import RewardList from '../components/RewardList';
import FloatingDelta, { type Delta } from '../components/FloatingDelta';
import LevelUpFlash from '../components/LevelUpFlash';
import { rankFor, type RankInfo } from '../engine/rank';
import { tapPulse, penaltyPulse, levelUpPulse } from '../lib/haptics';

export default function HomeScreen() {
  const {
    ready, habits, appState, loadToday, logHabitRep, undoHabitRep,
    createHabit, repsToday, weekBalance, todayNet,
    todayTasks, createTask, completeTask, uncompleteTask, removeTask, recurringRows,
    dailyTarget, suggestedTarget, acceptDailyTarget, effectiveTarget,
    rewardViews, redeemReward,
  } = useForge();
  const [showNew, setShowNew] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [deltas, setDeltas] = useState<Delta[]>([]);
  const [levelUp, setLevelUp] = useState<RankInfo | null>(null);
  const deltaId = useRef(0);
  // Tracks the level we last rendered, so a threshold crossing fires once.
  const lastLevel = useRef<number | null>(null);

  const lifetime = appState?.lifetimeStars ?? 0;
  const rank = rankFor(lifetime);

  useEffect(() => {
    if (!ready) return;
    if (lastLevel.current === null) {
      lastLevel.current = rank.level;   // first render: no flash
      return;
    }
    if (rank.level > lastLevel.current) {
      setLevelUp(rank);
      levelUpPulse();
    }
    lastLevel.current = rank.level;
  }, [ready, rank.level, rank]);

  /** Log a rep, then float the delta from the tap point and buzz. */
  const logWithFeedback = async (habitId: string, e: { clientX: number; clientY: number }) => {
    const delta = await logHabitRep(habitId);
    if (delta === null) return;
    if (delta < 0) penaltyPulse(); else tapPulse();
    const id = ++deltaId.current;
    setDeltas((d) => [...d, { id, value: delta, x: e.clientX, y: e.clientY }]);
    window.setTimeout(() => setDeltas((d) => d.filter((x) => x.id !== id)), 700);
  };

  useEffect(() => { void loadToday(); }, [loadToday]);

  if (!ready) return <div className="screen" data-testid="screen-home">Loading…</div>;

  const good = habits.filter((h) => h.polarity === 'good');
  const bad = habits.filter((h) => h.polarity === 'bad');
  const balance = weekBalance();
  const recurring = recurringRows();
  const hasTasks = todayTasks.length > 0 || recurring.length > 0;
  const affordable = rewardViews().filter((v) => v.affordable);

  return (
    <div className="screen" data-testid="screen-home">
      <header className="hero">
        <div className="hero__stats">
          <div className="stat">
            <span className="stat__label">Lifetime</span>
            <span className="stat__value num" data-testid="lifetime">
              {lifetime} ★
            </span>
            <span className="rankbadge" data-testid="rank"
                  style={{ color: rank.color, borderColor: rank.color }}>
              {rank.title} {rank.level}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">This week</span>
            <span
              className={'stat__value num' + (balance < 0 ? ' stat__value--neg' : '')}
              data-testid="week-balance"
            >
              {balance > 0 ? '+' : ''}{balance} ★
            </span>
          </div>
        </div>
        <TodayRing value={todayNet()} target={effectiveTarget()} />
      </header>

      {dailyTarget === null && (
        <TargetBanner suggested={suggestedTarget}
                      onAccept={(v) => void acceptDailyTarget(v)} />
      )}

      {habits.length === 0 && (
        <p className="empty" data-testid="empty-habits">
          No habits yet. Add the first thing you want to forge.
        </p>
      )}

      {good.length > 0 && (
        <section>
          <h2 className="sect">Build</h2>
          {good.map((h) => (
            <HabitCard key={h.id} habit={h} reps={repsToday(h.id)}
                       onLog={(e) => void logWithFeedback(h.id, e)}
                       onUndo={() => void undoHabitRep(h.id)} />
          ))}
        </section>
      )}

      {bad.length > 0 && (
        <section>
          <h2 className="sect">Break</h2>
          {bad.map((h) => (
            <HabitCard key={h.id} habit={h} reps={repsToday(h.id)}
                       onLog={(e) => void logWithFeedback(h.id, e)}
                       onUndo={() => void undoHabitRep(h.id)} />
          ))}
        </section>
      )}

      {hasTasks && (
        <section data-testid="tasks-section">
          <h2 className="sect">Today's Tasks</h2>
          {/* Recurring habits render as virtual rows — completing one logs the
              habit rep itself, so there is no separate record to double-count. */}
          {recurring.map((r) => (
            <TaskRow
              key={r.id} id={r.id} name={r.name} stars={r.stars} done={r.done}
              icon={r.icon} recurring
              onToggle={(next) =>
                void (next ? logHabitRep(r.habitId) : undoHabitRep(r.habitId))}
            />
          ))}
          {todayTasks.map((t) => (
            <TaskRow
              key={t.id} id={t.id} name={t.name} stars={t.stars} done={t.done}
              onToggle={(next) => void (next ? completeTask(t.id) : uncompleteTask(t.id))}
              onDelete={() => void removeTask(t.id)}
            />
          ))}
        </section>
      )}

      {affordable.length > 0 && (
        <section data-testid="affordable-section">
          <h2 className="sect">Affordable</h2>
          <RewardList views={affordable} affordableOnly
                      onRedeem={(id) => void redeemReward(id)} />
        </section>
      )}

      <button className="btn btn--ghost" onClick={() => setShowNewTask(true)}
              data-testid="new-task">+ New Task</button>
      <button className="btn btn--ghost" onClick={() => setShowNew(true)}
              data-testid="new-habit">+ New Habit</button>

      {showNew && (
        <NewHabitModal
          onClose={() => setShowNew(false)}
          onSave={async (h) => { await createHabit(h); setShowNew(false); }}
        />
      )}
      {showNewTask && (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onSave={async (t) => { await createTask(t); setShowNewTask(false); }}
        />
      )}
      <FloatingDelta deltas={deltas} />
      <LevelUpFlash rank={levelUp} onDone={() => setLevelUp(null)} />
    </div>
  );
}
