import { useEffect, useState } from 'react';
import { db } from '../db/schema';
import { ensureAppState } from '../db/init';
import { addHabit, listActiveHabits, addTask, listTasksForDate, addReward, listRewards } from '../db/queries';
import { todayStr } from '../lib/dates';

/** TEMPORARY Phase 1 dev panel — replaced by the real dashboard in Phase 3. */
export default function HomeScreen() {
  const [out, setOut] = useState('(loading)');

  async function refresh() {
    const [habits, tasks, rewards, state] = await Promise.all([
      listActiveHabits(),
      listTasksForDate(todayStr()),
      listRewards(),
      db.appState.toArray(),
    ]);
    setOut(JSON.stringify({ habits, tasks, rewards, appState: state }, null, 1));
  }

  useEffect(() => {
    (async () => {
      await db.open();
      await ensureAppState();
      await refresh();
    })();
  }, []);

  return (
    <div className="screen" data-testid="screen-home">
      <h1 className="screen__title">Home</h1>
      <button data-testid="dev-add-habit" onClick={async () => {
        await addHabit({ name: 'Gym', polarity: 'good', icon: '🏋️', weeklyTarget: 5 });
        await refresh();
      }}>dev: add habit</button>
      <button data-testid="dev-add-task" onClick={async () => {
        await addTask({ name: 'Read 20 pages' });
        await refresh();
      }}>dev: add task</button>
      <button data-testid="dev-add-reward" onClick={async () => {
        await addReward('Cheesecake', 100);
        await refresh();
      }}>dev: add reward</button>
      <pre data-testid="dev-out" style={{ fontSize: 10, whiteSpace: 'pre-wrap' }}>{out}</pre>
    </div>
  );
}
