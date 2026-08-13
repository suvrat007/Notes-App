/**
 * Analytics aggregations. Pure — logs in, chart-ready rows out.
 *
 * On the server for the same reason the star maths is: the numbers a chart
 * draws have to be the numbers the database holds, and a client that computes
 * its own totals will eventually disagree with the ledger.
 */
const { dayNet, lifetimeFromLogs, dayKey } = require('./stars');

/** Net stars per day across the supplied day-keys. */
function starsPerDay(logs, dates, opts = {}) {
  return dates.map((date) => ({ date, value: dayNet(logs, date, opts) }));
}

/** Cumulative lifetime (positive earns only) at the end of each date. */
function cumulativeLifetime(logs, dates) {
  let acc = 0;
  return dates.map((date) => {
    acc += lifetimeFromLogs(logs.filter((l) => dayKey(l.date) === date));
    return { date, value: acc };
  });
}

/** Reps of one thing per day — the heatmap's raw grid. */
function repsPerDay(logs, refId, dates) {
  return dates.map((date) => ({
    date,
    value: logs
      .filter((l) => String(l.refId) === String(refId) && dayKey(l.date) === date)
      .reduce((s, l) => s + (l.count || 1), 0),
  }));
}

/** Net stars and rep count per habit, best first. */
function perHabitStats(logs) {
  const map = new Map();
  for (const l of logs) {
    if (l.kind !== 'habit') continue;
    const id = String(l.refId);
    const cur = map.get(id) ?? { refId: id, net: 0, reps: 0 };
    cur.net += l.starsDelta;
    cur.reps += l.count || 1;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

/**
 * Consecutive-day streak for a habit. A day counts when it met its daily share
 * of the goal (targetReps spread over the period, at least one rep).
 *
 * `dates` must be chronological. Today not yet being done does NOT break the
 * streak — we look back from yesterday in that case, because reporting a
 * streak as lost at 9am, before the day has even been lived, is just wrong.
 */
function habitStreak(logs, refId, dates, targetReps, periodWeeks = 1) {
  const days = Math.max(1, periodWeeks) * 7;
  const perDayNeed = targetReps > 0 ? Math.max(1, Math.round(targetReps / days)) : 1;
  const met = repsPerDay(logs, refId, dates).map((p) => p.value >= perDayNeed);

  let record = 0;
  let run = 0;
  for (const m of met) {
    run = m ? run + 1 : 0;
    if (run > record) record = run;
  }

  let current = 0;
  let i = met.length - 1;
  if (i >= 0 && !met[i]) i -= 1;   // today pending is not today failed
  for (; i >= 0 && met[i]; i--) current += 1;

  return { current, record };
}

module.exports = {
  starsPerDay, cumulativeLifetime, repsPerDay, perHabitStats, habitStreak,
};
