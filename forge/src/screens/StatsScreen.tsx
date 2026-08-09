import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import { useForge } from '../store/useForge';
import * as q from '../db/queries';
import type { LogEntry } from '../db/schema';
import {
  starsPerDay, cumulativeLifetime, repsPerDay, perHabitStats, habitStreak,
} from '../engine/analytics';
import { weekDates, weekStartOf, todayStr, addDays, shortDayName } from '../lib/dates';
import Heatmap from '../components/Heatmap';
import { IconFlame } from '../components/icons';
import { useIsDesktop } from '../lib/useMediaQuery';

const GOOD = '#3ecf8e';
const BAD = '#e5484d';
const ACCENT = '#c0b3a5';
const AXIS = '#8a929e';

type Range = 'day' | 'week' | 'month';
/** A phone fits ~12 weeks of cells; a desktop column fits far more history. */
const HEATMAP_WEEKS_MOBILE = 12;
const HEATMAP_WEEKS_DESKTOP = 26;

export default function StatsScreen() {
  const { ready, habits, appState, loadToday } = useForge();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [range, setRange] = useState<Range>('day');
  const [heatHabit, setHeatHabit] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const heatWeeks = isDesktop ? HEATMAP_WEEKS_DESKTOP : HEATMAP_WEEKS_MOBILE;

  useEffect(() => { void loadToday(); }, [loadToday]);

  // Stats read a wider window than the dashboard's current week.
  useEffect(() => {
    void (async () => {
      const start = addDays(todayStr(), -365);
      setLogs(await q.listLogsInRange(start, todayStr()));
    })();
  }, [ready, habits.length]);

  const today = todayStr();
  const floor = appState?.settings.negativeFloor ?? false;
  const weekStartDay = appState?.settings.weekResetDay ?? 1;

  const weekPoints = useMemo(() => {
    const dates = weekDates(weekStartOf(today, weekStartDay));
    return starsPerDay(logs, dates, { floor }).map((p) => ({
      ...p,
      label: shortDayName(p.date),
    }));
  }, [logs, today, floor, weekStartDay]);

  const lifetimePoints = useMemo(() => {
    const span = range === 'day' ? 30 : range === 'week' ? 120 : 365;
    const dates = Array.from({ length: span }, (_, i) => addDays(today, -(span - 1 - i)));
    const points = cumulativeLifetime(logs, dates);
    // Bucket so the x-axis stays readable at longer ranges.
    const size = range === 'day' ? 1 : range === 'week' ? 7 : 30;
    if (size === 1) return points.map((p) => ({ ...p, label: p.date.slice(5) }));
    const out: typeof points = [];
    for (let i = 0; i < points.length; i += size) {
      const slice = points.slice(i, i + size);
      out.push({ date: slice[0].date, value: slice[slice.length - 1].value });
    }
    return out.map((p) => ({ ...p, label: p.date.slice(5) }));
  }, [logs, today, range]);

  const goodHabits = habits.filter((h) => h.polarity === 'good');
  const activeHeatHabit = heatHabit ?? goodHabits[0]?.id ?? null;

  const heatPoints = useMemo(() => {
    if (!activeHeatHabit) return [];
    // Align to the configured week start so rows are consistent weekdays.
    const end = weekStartOf(today, weekStartDay);
    const start = addDays(end, -7 * (heatWeeks - 1));
    const dates = Array.from(
      { length: heatWeeks * 7 },
      (_, i) => addDays(start, i),
    );
    return repsPerDay(logs, activeHeatHabit, dates);
  }, [logs, activeHeatHabit, today, weekStartDay, heatWeeks]);

  const heatMax = Math.max(1, ...heatPoints.map((p) => p.value));

  // Best/worst: this calendar month.
  const monthStats = useMemo(() => {
    const monthStart = today.slice(0, 8) + '01';
    const monthLogs = logs.filter((l) => l.date >= monthStart && l.date <= today);
    return perHabitStats(monthLogs)
      .map((s) => ({ ...s, habit: habits.find((h) => h.id === s.refId) }))
      .filter((s) => s.habit);
  }, [logs, habits, today]);

  const streaks = useMemo(() => {
    const span = 120;
    const dates = Array.from({ length: span }, (_, i) => addDays(today, -(span - 1 - i)));
    return goodHabits.map((h) => ({
      habit: h,
      ...habitStreak(logs, h.id, dates, h.targetReps, h.targetPeriodWeeks),
    }));
  }, [logs, goodHabits, today]);

  if (!ready) return <div className="screen" data-testid="screen-stats">Loading…</div>;

  const hasData = logs.length > 0;

  return (
    <div className="screen" data-testid="screen-stats">
      <h1 className="screen__title">Stats</h1>

      {!hasData && (
        <p className="empty" data-testid="stats-empty">
          Nothing logged yet. Your charts appear once you start forging.
        </p>
      )}

      <div className="stats-grid">

      <section className="stats-cell">
      {/* 7.1 — stars per day this week. Sign is encoded by position about the
          zero baseline as well as by color, so it never reads as color alone. */}
      <h2 className="sect">Stars per day · this week</h2>
      <div className="chart" data-testid="chart-week">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekPoints} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#2a2f38" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }}
                   axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke={AXIS} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#1e232b', border: '1px solid #2a2f38',
                              borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: '#e6e8eb' }}
              formatter={(v) => {
                const n = Number(v ?? 0);
                return [`${n > 0 ? '+' : ''}${n} ★`, 'Net'];
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {weekPoints.map((p) => (
                <Cell key={p.date} fill={p.value < 0 ? BAD : GOOD} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      </section>

      <section className="stats-cell">
      {/* 7.2 — cumulative lifetime */}
      <h2 className="sect">Lifetime stars</h2>
      <div className="seg seg--neutral" style={{ marginBottom: 8 }}>
        {(['day', 'week', 'month'] as Range[]).map((r) => (
          <button key={r} data-testid={`range-${r}`}
                  className={'seg__opt' + (range === r ? ' seg__opt--on' : '')}
                  onClick={() => setRange(r)}>
            {r === 'day' ? 'Day' : r === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>
      <div className="chart" data-testid="chart-lifetime">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={lifetimePoints} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#2a2f38" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }}
                   axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e232b', border: '1px solid #2a2f38',
                              borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: '#e6e8eb' }}
              formatter={(v) => [`${Number(v ?? 0)} ★`, 'Lifetime']}
            />
            <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2}
                  dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      </section>

      <section className="stats-cell">
      {/* 7.3 — per-habit heatmap */}
      <h2 className="sect">Consistency · last {heatWeeks} weeks</h2>
      {goodHabits.length === 0 ? (
        <p className="empty">No good habits yet.</p>
      ) : (
        <>
          <div className="chips">
            {goodHabits.map((h) => (
              <button key={h.id} data-testid={`heat-${h.id}`}
                      className={'chip' + (h.id === activeHeatHabit ? ' chip--on' : '')}
                      onClick={() => setHeatHabit(h.id)}>
                {h.icon} {h.name}
              </button>
            ))}
          </div>
          <Heatmap points={heatPoints} max={heatMax} />
        </>
      )}

      </section>

      <section className="stats-cell">
      {/* 7.4 — best/worst + streaks */}
      <h2 className="sect">Best &amp; worst · this month</h2>
      {monthStats.length === 0 ? (
        <p className="empty">Nothing logged this month yet.</p>
      ) : (
        <div className="card" data-testid="table-bestworst">
          {monthStats.map((s) => (
            <div className="card__row" key={s.refId}>
              <span className="card__label">{s.habit!.icon} {s.habit!.name}</span>
              <span className="card__val num"
                    style={{ color: s.net < 0 ? BAD : GOOD }}
                    data-testid={`net-${s.refId}`}>
                {s.net > 0 ? '+' : ''}{s.net} ★
              </span>
            </div>
          ))}
        </div>
      )}

      </section>

      <section className="stats-cell">
      <h2 className="sect">Streaks</h2>
      {streaks.length === 0 ? (
        <p className="empty">No good habits yet.</p>
      ) : (
        <div className="card" data-testid="table-streaks">
          {streaks.map((s) => (
            <div className="card__row" key={s.habit.id}>
              <span className="card__label">{s.habit.icon} {s.habit.name}</span>
              <span className="card__val num" data-testid={`streak-${s.habit.id}`}>
                {s.current > 0 && (
                  <span className="streak__flame"><IconFlame /></span>
                )}
                {s.current}d
                <span className="streak__record"> · best {s.record}d</span>
              </span>
            </div>
          ))}
        </div>
      )}
      </section>

      </div>
    </div>
  );
}
