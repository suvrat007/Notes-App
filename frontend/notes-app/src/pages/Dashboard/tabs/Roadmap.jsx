import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flame, TrendingUp, TrendingDown } from 'lucide-react';
import api from '../../../utils/api';
import { Skeleton, SkeletonCard, SkeletonHeader, SkeletonRows } from '../../../components/Skeleton';
import { useDataVersion } from '../../../utils/DataContext';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * THE ROADMAP — the week as something you can win.
 *
 * Every track shows two things: how far you have come, and where you SHOULD be
 * by now. Progress without a pace line is how someone reaches Sunday with five
 * sessions left and no idea it was coming — so the expected mark is drawn on
 * the bar itself rather than buried in a number underneath.
 */
const Roadmap = () => {
  const dataVersion = useDataVersion();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await api.get('/roadmap');
        if (!cancelled) { setData(d); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load your roadmap');
      }
    })();
    return () => { cancelled = true; };
  }, [dataVersion]);

  if (error) return <p className="text-focus-red text-sm">{error}</p>;
  // The shape of the week, while the week is on its way.
  if (!data) {
    return (
      <div className="space-y-5" data-testid="roadmap-loading">
        <SkeletonHeader />
        <SkeletonCard>
          <div className="grid grid-cols-2 sm:flex sm:gap-8 gap-3">
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-12 w-20" />
            <Skeleton className="h-12 w-28" />
          </div>
          <Skeleton className="h-2 w-full mt-5" rounded="rounded-full" />
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-5 w-24 mb-4" />
          <SkeletonRows rows={3} height="h-24" />
        </SkeletonCard>
      </div>
    );
  }

  const { summary, nodes, daysLeft } = data;

  return (
    <div className="space-y-5 md:h-full md:flex md:flex-col md:min-h-0" data-testid="screen-roadmap">
      <header className="md:shrink-0">
        <h1 className="text-2xl font-bold font-heading text-white tracking-wide">ROADMAP</h1>
        <p className="text-sm text-white/40 mt-1">
          This week's goals, and whether you are on pace.
        </p>
      </header>

      {/* ---- the week at a glance ---- */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:shrink-0"
        data-testid="roadmap-summary"
      >
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-x-6 gap-y-3 sm:gap-x-8 sm:gap-y-4">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/40">This week</p>
            <p className="font-heading font-black text-3xl sm:text-4xl text-white leading-none mt-1.5 tabular-nums">
              {summary.done}<span className="text-white/30 text-2xl"> / {summary.target}</span>
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/40">Days left</p>
            <p className="font-heading font-black text-3xl sm:text-4xl text-white leading-none mt-1.5 tabular-nums">
              {daysLeft}
            </p>
          </div>

          <div className="sm:flex-1 sm:min-w-[180px]">
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/40">
              Still on the table
            </p>
            <p className="font-heading font-black text-3xl sm:text-4xl leading-none mt-1.5 tabular-nums text-[#c0b3a5]">
              {summary.starsOnTheTable}★
            </p>
          </div>

          <span
            data-testid="roadmap-verdict"
            className={`col-span-2 sm:col-auto flex items-center justify-center sm:justify-start gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold tracking-wider ${
              summary.onTrack
                ? 'border-[#3ecf8e]/40 text-[#3ecf8e]'
                : 'border-focus-red/40 text-focus-red'
            }`}
          >
            {summary.onTrack ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {nodes.length === 0 ? 'NO GOALS SET' : summary.onTrack ? 'ON PACE' : 'BEHIND PACE'}
          </span>
        </div>

        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mt-5">
          <motion.div
            className="h-full rounded-full bg-[#c0b3a5]"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(summary.fill * 100)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </motion.div>

      {/* ---- one track per goal ---- */}
      <div
        className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:flex-1 md:min-h-0 md:flex md:flex-col"
        data-testid="roadmap-tracks"
      >
        <h3 className="font-heading font-black text-white text-lg tracking-wide mb-4 md:shrink-0">
          Tracks
        </h3>

        <div className="space-y-4 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
          {nodes.map((n, i) => (
            <motion.div
              key={n._id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i }}
              className="bg-black/40 border border-white/5 rounded-2xl p-4"
              data-testid={`track-${n._id}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-lg bg-[#241f19] text-[#c0b3a5] grid place-items-center shrink-0">
                  {n.done >= n.target ? <Trophy size={14} /> : <Flame size={14} />}
                </span>
                <p className="flex-1 min-w-0 text-sm font-bold text-white truncate">{n.name}</p>
                <p className="font-heading font-black text-lg tabular-nums shrink-0"
                   style={{ color: n.done >= n.target ? '#3ecf8e' : '#c0b3a5' }}>
                  {n.done}<span className="text-white/30">/{n.target}</span>
                </p>
              </div>

              {/* The bar carries the pace line: the notch is where "on track"
                  sits right now, so ahead and behind are visible at a glance. */}
              <div className="relative h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: n.done >= n.target ? '#3ecf8e' : '#c0b3a5' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(n.fill * 100)}%` }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                />
                {n.expected > 0 && n.expected < n.target && (
                  <span
                    className="absolute top-0 bottom-0 w-[2px] bg-white/45"
                    style={{ left: `${Math.min(100, (n.expected / n.target) * 100)}%` }}
                    title={`On pace: ${n.expected}`}
                  />
                )}
              </div>

              <div className="flex items-center justify-between mt-2.5">
                <span className="flex gap-1" title="This week, day by day">
                  {n.perDay.map((d, j) => (
                    <span
                      key={d.date}
                      title={`${d.date}: ${d.reps}`}
                      className={`w-5 h-5 rounded text-[9px] font-bold grid place-items-center ${
                        d.reps > 0
                          ? 'bg-[#c0b3a5] text-[#0d0f12]'
                          : d.isFuture ? 'bg-white/[0.03] text-white/20' : 'bg-white/5 text-white/30'
                      } ${d.isToday ? 'ring-1 ring-white/40' : ''}`}
                    >
                      {d.reps > 0 ? d.reps : DAY_LETTERS[j]}
                    </span>
                  ))}
                </span>

                <span className={`text-[11px] font-bold tabular-nums ${
                  n.onTrack ? 'text-[#3ecf8e]' : 'text-focus-red'
                }`}>
                  {n.done >= n.target
                    ? 'DONE'
                    : n.aheadBy >= 0
                      ? `+${n.aheadBy} ahead`
                      : `${Math.abs(n.aheadBy)} behind`}
                </span>
              </div>
            </motion.div>
          ))}

          {nodes.length === 0 && (
            <p className="text-center text-white/40 text-sm py-10" data-testid="roadmap-empty">
              No weekly goals yet. Give a habit a goal, like 5 gym sessions a week, 
              and it becomes a track you can win.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
