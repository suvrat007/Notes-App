import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Flame, Ban, CheckSquare, Gift, Clock } from 'lucide-react';
import api from '../../../utils/api';

const KIND_ICON = {
  habit: Flame,
  task: CheckSquare,
  redeem: Gift,
  'missed-task': Clock,
};

const fmtDay = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

const Tile = ({ label, value, tone = 'neutral', sub }) => {
  const colour = tone === 'good' ? 'text-[#3ecf8e]'
    : tone === 'bad' ? 'text-focus-red'
    : 'text-white';
  return (
    <div className="bg-[#16191e] border border-white/5 rounded-2xl px-5 py-4">
      <p className="text-[10px] font-bold tracking-widest uppercase text-white/40">{label}</p>
      <p className={`font-heading font-black text-3xl leading-none mt-2 tabular-nums ${colour}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-white/35 mt-1.5">{sub}</p>}
    </div>
  );
};

/**
 * THE LEDGER — every star, and where it came from.
 *
 * The old version of this screen summarised fields that no longer exist, so it
 * confidently reported zero while the user had thirty stars. This one reads
 * the ledger itself: the same rows every total in the app is summed from, so
 * if a number anywhere looks wrong, this page is the answer to "why".
 *
 * Grouped by day, newest first, because "what did I do on Tuesday" is the
 * question people actually bring to a history.
 */
const Ledger = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await api.get('/ledger');
        if (!cancelled) { setData(d); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load your ledger');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const exportCsv = () => {
    const rows = [
      ['date', 'kind', 'name', 'count', 'stars'],
      ...(data?.entries ?? []).map((e) => [e.date, e.kind, e.name, e.count, e.starsDelta]),
    ];
    // Quote every field: habit names contain commas more often than you think.
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return <p className="text-focus-red text-sm">{error}</p>;
  if (!data) return <p className="text-white/40 text-sm">Loading your ledger…</p>;

  // Group by day, preserving the newest-first order the server sent.
  const days = [];
  for (const entry of data.entries) {
    const last = days[days.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else days.push({ date: entry.date, entries: [entry] });
  }

  return (
    <div className="space-y-5 md:h-full md:flex md:flex-col md:min-h-0" data-testid="screen-ledger">
      <header className="flex items-end justify-between gap-4 md:shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-heading text-white tracking-wide">LEDGER</h1>
          <p className="text-sm text-white/40 mt-1">Every star, and where it came from.</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          data-testid="export-csv"
          className="flex items-center gap-2 px-4 h-10 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/30 text-[11px] font-bold tracking-widest transition-colors shrink-0"
        >
          <Download size={14} /> EXPORT CSV
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:shrink-0">
        <Tile label="Earned" value={`+${data.totals.earned}`} tone="good" />
        <Tile label="Lost" value={data.totals.lost} tone="bad" />
        <Tile label="Net" value={data.totals.net} />
        <Tile
          label="Lifetime"
          value={data.totals.lifetime}
          sub="what your rank is built on"
        />
      </div>

      <div
        className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:flex-1 md:min-h-0 md:flex md:flex-col"
        data-testid="ledger-list"
      >
        <div className="flex items-center justify-between mb-4 md:shrink-0">
          <h3 className="font-heading font-black text-white text-lg tracking-wide">History</h3>
          <span className="text-[10px] text-white/35 tracking-wider">
            {data.totals.count} {data.totals.count === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="space-y-5 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
          {days.map((day) => {
            const net = day.entries.reduce((s, e) => s + e.starsDelta, 0);
            return (
              <div key={day.date}>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-white/40">
                    {fmtDay(day.date)}
                  </p>
                  <p className={`text-[11px] font-bold tabular-nums ${
                    net >= 0 ? 'text-[#3ecf8e]' : 'text-focus-red'
                  }`}>
                    {net >= 0 ? '+' : ''}{net}★
                  </p>
                </div>

                <div className="space-y-1.5">
                  {day.entries.map((e) => {
                    const Icon = KIND_ICON[e.kind] ?? Flame;
                    const good = e.starsDelta >= 0;
                    return (
                      <div
                        key={e._id}
                        className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-xl px-3.5 py-2.5"
                      >
                        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${
                          good ? 'bg-[#241f19] text-[#c0b3a5]' : 'bg-[#2a1a1a] text-focus-red'
                        }`}>
                          <Icon size={13} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-white truncate">{e.name}</span>
                          <span className="block text-[10px] text-white/35">
                            {e.kindLabel}{e.count > 1 ? ` ×${e.count}` : ''}
                          </span>
                        </span>
                        <span className={`font-heading font-bold text-sm tabular-nums shrink-0 ${
                          good ? 'text-[#3ecf8e]' : 'text-focus-red'
                        }`}>
                          {good ? '+' : ''}{e.starsDelta}★
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {days.length === 0 && (
            <p className="text-center text-white/40 text-sm py-10" data-testid="ledger-empty">
              Nothing logged yet. Every rep and task you complete lands here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Ledger;
