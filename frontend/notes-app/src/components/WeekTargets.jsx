import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, TrendingDown, Check } from 'lucide-react';
import api from '../utils/api';
import { useDataVersion } from '../utils/DataContext';

/**
 * WHAT THIS WEEK ASKED OF YOU.
 *
 * A goal set on Monday is invisible by Thursday unless something says it out
 * loud, so the home screen carries the week's promises next to the day's work.
 *
 * Each target shows progress AND the pace line — where you should be by now —
 * because "3 of 10" means something completely different on Tuesday than it
 * does on Saturday, and only one of those is a problem.
 */
const localKey = () => new Date().toLocaleDateString('en-CA');

const WeekTargets = ({ onNavigate }) => {
  const dataVersion = useDataVersion();
  const [nodes, setNodes] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/roadmap?date=${localKey()}`);
        if (!cancelled) setNodes(data.nodes ?? []);
      } catch {
        if (!cancelled) setNodes([]);
      }
    })();
    return () => { cancelled = true; };
  }, [dataVersion]);

  // Nothing with a weekly goal yet: say so once, quietly, and stop taking space.
  if (!nodes || nodes.length === 0) return null;

  return (
    <motion.section
      data-testid="week-targets"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-[#16191e] border border-white/5 rounded-2xl p-4"
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-white/50">
          <Target size={13} className="text-[#c0b3a5]" />
          THIS PERIOD
        </h3>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('roadmap')}
            className="text-[10px] font-bold tracking-wider text-white/30 hover:text-[#c0b3a5] transition-colors"
          >
            ROADMAP
          </button>
        )}
      </header>

      <ul className="space-y-2.5">
        {nodes.map((n, i) => {
          const done = n.done ?? 0;
          const target = n.target ?? 0;
          const complete = (n.met ?? (done >= target)) && target > 0;
          const unit = n.unit ? ' ' + n.unit : '';
          const behind = !complete && done < (n.expected ?? 0);
          const pct = Math.max(0, Math.min(1, n.fill ?? 0));
          const pace = Math.max(0, Math.min(1, target ? (n.expected ?? 0) / target : 0));

          return (
            <motion.li
              key={n._id}
              data-testid={`wt-${n._id}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.2 }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className={`text-[12px] font-bold truncate ${
                  complete ? 'text-white/40 line-through' : 'text-white'
                }`}>
                  {n.name}
                </span>
                <span className="flex items-center gap-1 shrink-0 text-[10px] font-bold tabular-nums">
                  <span className={complete ? 'text-[#3ecf8e]' : 'text-white/60'}>
                    {done}/{target}{unit}
                    {n.overBy > 0 && <span className="text-[#3ecf8e]"> +{n.overBy}</span>}
                  </span>
                  {complete ? (
                    <Check size={11} className="text-[#3ecf8e]" />
                  ) : behind ? (
                    <TrendingDown size={11} className="text-[#e5484d]" />
                  ) : (
                    <TrendingUp size={11} className="text-[#3ecf8e]" />
                  )}
                </span>
              </div>

              <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct * 100}%` }}
                  transition={{ duration: 0.5, delay: 0.04 * i }}
                  className={`h-full rounded-full ${complete ? 'bg-[#3ecf8e]' : 'bg-[#c0b3a5]'}`}
                />
                {/* Where "on track" sits right now. */}
                {!complete && pace > 0 && pace < 1 && (
                  <span
                    className="absolute top-0 bottom-0 w-px bg-white/50"
                    style={{ left: `${pace * 100}%` }}
                    aria-hidden="true"
                  />
                )}
              </div>

              {!complete && (
                <p className="mt-1 text-[10px] text-white/35">
                  {n.remaining}{unit} to go
                  {behind && <span className="text-[#e5484d]"> · behind pace</span>}
                </p>
              )}
            </motion.li>
          );
        })}
      </ul>
    </motion.section>
  );
};

export default WeekTargets;
