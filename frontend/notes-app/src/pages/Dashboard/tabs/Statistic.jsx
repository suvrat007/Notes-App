import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, ReferenceLine, CartesianGrid,
} from 'recharts';
import { Flame } from 'lucide-react';
import api from '../../../utils/api';
import { Skeleton, SkeletonCard, SkeletonHeader, SkeletonRows } from '../../../components/Skeleton';
import { useDataVersion } from '../../../utils/DataContext';
import Select from '../../../components/Select';

/*
 * The palette, stated once. Green and red mean EARNED and LOST and nothing
 * else, so neither is ever used as decoration; MALTA carries everything
 * neutral. A chart that colours bars for variety teaches the eye to ignore
 * colour, which is the one channel a chart cannot afford to waste.
 */
const GOOD = '#3ecf8e';
const BAD = '#e5484d';
const ACCENT = '#c0b3a5';
const AXIS = '#8a929e';

const RANGES = [
  { key: 'day', label: 'DAY' },
  { key: 'week', label: 'WEEK' },
  { key: 'month', label: 'MONTH' },
];

/** Sequential ramp for the heatmap: dark steel through to full MALTA. */
const heatColor = (v, max) => {
  if (v <= 0) return '#1e232b';
  const t = Math.min(1, v / Math.max(1, max));
  // Interpolating from the deep end, because MALTA alone is too light to
  // tint from — five near-identical pale squares read as one blob.
  const from = [92, 81, 72];
  const to = [192, 179, 165];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * (0.25 + 0.75 * t)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

const CardBox = ({ title, right, children, delay = 0, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className={`bg-[#16191e] border border-white/5 rounded-3xl p-4 sm:p-5 md:p-6 md:flex md:flex-col md:min-h-0 ${className}`}
  >
    <div className="flex items-center justify-between mb-4 md:shrink-0">
      <h3 className="font-heading font-black text-white text-lg tracking-wide">{title}</h3>
      {right}
    </div>
    <div className="md:flex-1 md:min-h-0">{children}</div>
  </motion.div>
);

const Statistic = () => {
  const dataVersion = useDataVersion();
  const [range, setRange] = useState('day');
  const [heatHabit, setHeatHabit] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await api.get('/stats', {
          params: { range, ...(heatHabit ? { habit: heatHabit } : {}) },
        });
        if (!cancelled) { setData(d); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load stats');
      }
    })();
    return () => { cancelled = true; };
  }, [range, heatHabit, dataVersion]);

  if (error) return <p className="text-focus-red text-sm">{error}</p>;
  // Two charts and two panels, in their own places, before they arrive.
  if (!data) {
    return (
      <div className="space-y-4 md:space-y-5" data-testid="stats-loading">
        <SkeletonHeader />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="h-5 w-28 mb-4" />
              <Skeleton className="h-40 w-full" rounded="rounded-xl" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    );
  }

  const heatMax = Math.max(...data.heat.map((h) => h.value), 1);
  // Column-per-week so the grid reads as calendar weeks, like a contribution graph.
  const weeks = [];
  for (let i = 0; i < data.heat.length; i += 7) weeks.push(data.heat.slice(i, i + 7));

  return (
    <div className="space-y-4 md:space-y-5 md:h-full md:flex md:flex-col md:min-h-0" data-testid="screen-stats">
      <header className="md:shrink-0">
        <h1 className="text-2xl font-bold font-heading text-white tracking-wide">STATISTICS</h1>
        <p className="text-sm text-white/40 mt-1">Everything below is summed from your ledger.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 md:flex-1 md:min-h-0 pb-24 md:pb-0">
      <CardBox title="This Week" delay={0.05}>
        {/*
          On a phone the chart is the wrong shape for the data.
          Seven bars, two axes and a grid inside 300px leaves each bar a few
          pixels wide with the numbers pushed off to a tick label — so a day
          with 63 stars and a day with 3 look nearly identical. The same seven
          numbers as rows are legible at any width and say the figure outright.
        */}
        <ul className="sm:hidden space-y-1.5" data-testid="week-strip">
          {data.week.map((p) => {
            const peak = Math.max(...data.week.map((d) => Math.abs(d.value)), 1);
            const width = `${Math.round((Math.abs(p.value) / peak) * 100)}%`;
            return (
              <li key={p.label} className="flex items-center gap-2.5">
                <span className="w-9 shrink-0 text-[10px] font-bold tracking-wider text-white/40">
                  {p.label}
                </span>
                <span className="flex-1 h-5 rounded-md bg-white/[0.04] overflow-hidden">
                  <span
                    className="block h-full rounded-md"
                    style={{ width, background: p.value >= 0 ? GOOD : BAD }}
                  />
                </span>
                <span className={`w-10 shrink-0 text-right text-[11px] font-bold tabular-nums ${
                  p.value > 0 ? 'text-[#3ecf8e]' : p.value < 0 ? 'text-focus-red' : 'text-white/25'
                }`}>
                  {p.value > 0 ? `+${p.value}` : p.value}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="hidden sm:block h-52 md:h-full md:min-h-[160px]" data-testid="week-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.week} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
              {/* Zero is the line that matters: above it you built, below it you lost. */}
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
              <Tooltip
                contentStyle={{ background: '#0d0f12', border: '1px solid #2a2f38', borderRadius: 10 }}
                labelStyle={{ color: '#e6e8eb' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.week.map((p, i) => (
                  <Cell key={i} fill={p.value >= 0 ? GOOD : BAD} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardBox>

      <CardBox
        title="The Climb"
        delay={0.1}
        right={
          <div className="flex gap-1" data-testid="range-toggle">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                data-testid={`range-${r.key}`}
                className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-widest border transition-colors ${
                  range === r.key
                    ? 'border-[#c0b3a5] text-[#c0b3a5]'
                    : 'border-white/10 text-white/40'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-52 md:h-full md:min-h-[160px]" data-testid="climb-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.climb} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0d0f12', border: '1px solid #2a2f38', borderRadius: 10 }}
                labelStyle={{ color: '#e6e8eb' }}
              />
              {/* Lifetime only ever climbs, so no area fill is needed to say
                  which way is good, the shape already does. */}
              <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardBox>

      <CardBox
        title="Consistency"
        delay={0.15}
        right={
          <Select
            testId="heat-habit"
            ariaLabel="Which habit to show"
            className="w-40"
            value={heatHabit}
            onChange={setHeatHabit}
            options={[
              { value: '', label: 'All stars' },
              ...data.habits.map((h) => ({ value: h._id, label: h.name })),
            ]}
          />
        }
      >
        {/*
          The grid STRETCHES to its card instead of sitting as fixed 10px
          squares in the corner. Seven rows for the days of the week, one
          column per week flowing sideways, so it reads as a calendar and
          uses the space the card already reserved for it.
        */}
        <div className="flex flex-col h-full min-h-0">
          <div
            className="grid gap-[3px] flex-1 min-h-[84px]"
            data-testid="heatmap"
            style={{
              gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
              gridAutoFlow: 'column',
              gridAutoColumns: 'minmax(0, 1fr)',
            }}
          >
            {weeks.flatMap((wk) => wk).map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.value}`}
                className="w-full h-full rounded-[2px] min-h-[8px]"
                style={{ background: heatColor(d.value, heatMax) }}
              />
            ))}
          </div>
          <p className="text-[10px] text-white/40 mt-3 shrink-0">
            {heatHabit ? 'Reps per day' : 'Net stars per day'} · last {weeks.length} weeks
          </p>
        </div>
      </CardBox>

      <CardBox title="Per Habit" delay={0.2}>
        <div className="space-y-2 md:h-full md:overflow-y-auto md:pr-1" data-testid="per-habit">
          {data.perHabit.map((h) => (
            <div
              key={h.refId}
              className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-2xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{h.name}</p>
                <p className="text-[11px] text-white/50">{h.reps} reps</p>
              </div>
              {h.streak.current > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-[#c0b3a5]">
                  <Flame size={12} /> {h.streak.current}
                </span>
              )}
              <span
                className="font-heading font-black text-base tabular-nums"
                style={{ color: h.net >= 0 ? GOOD : BAD }}
              >
                {h.net >= 0 ? '+' : ''}{h.net}★
              </span>
            </div>
          ))}
          {data.perHabit.length === 0 && (
            <p className="text-center text-white/40 text-sm py-6">
              Nothing logged yet. The charts fill in as you go.
            </p>
          )}
        </div>
      </CardBox>
      </div>
    </div>
  );
};

export default Statistic;
