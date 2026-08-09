/**
 * Dev-only assertion suite for the star engine. No test runner needed —
 * `runStarEngineTests()` is called on startup in dev and logs results.
 *
 * These encode THE STAR ENGINE CONTRACT. If one fails, the spine is broken
 * and nothing downstream can be trusted.
 */
import {
  goodHabitDelta,
  taskDelta,
  missedTaskDelta,
  badHabitRepDelta,
  badHabitDayTotal,
  redeemDelta,
  weeklyBalance,
  weeklyBalanceFloored,
  lifetimeFromLogs,
  dayNet,
  repsOn,
  repsInDates,
} from './stars';
import {
  habitPaceToday,
  suggestDailyTarget,
  recentDailyAverage,
  buildRoadmap,
  projectedWeekFinish,
} from './targets';
import { runningBalances, affordableStreak, buildRewardViews } from './rewards';
import { starsForLevel, rankFor, MAX_LEVEL } from './rank';
import {
  starsPerDay,
  cumulativeLifetime,
  repsPerDay,
  perHabitStats,
  habitStreak,
} from './analytics';
import type { HabitLike, LogLike } from './types';

const habit = (over: Partial<HabitLike> = {}): HabitLike => ({
  id: 'h1',
  polarity: 'good',
  starsPerRep: 10,
  dailyAllowance: 0,
  overagePenalty: 5,
  freeWithinAllowance: false,
  weeklyTarget: 0,
  ...over,
});

const log = (over: Partial<LogLike> = {}): LogLike => ({
  date: '2026-01-05',
  kind: 'habit',
  refId: 'h1',
  count: 1,
  starsDelta: 10,
  ...over,
});

export type TestResult = { name: string; ok: boolean; detail?: string };

export function runStarEngineTests(): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, actual: unknown, expected: unknown) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({
      name,
      ok,
      detail: ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    });
  };

  // 1 — good habit rep earns its face value
  check('good habit rep = +10', goodHabitDelta(habit()), 10);

  // 2 — task done earns its face value
  check('task done = +10', taskDelta({ id: 't1', stars: 10 }), 10);

  // 3 — missed task costs its face value, once
  check('missed task = -10', missedTaskDelta({ id: 't1', stars: 10 }), -10);

  // 4 — THE CIGARETTE EXAMPLE from the contract:
  //     allowance 1, overagePenalty 5, starsPerRep 10
  //     rep0 (within allowance) = -10 ; rep1 (over) = -10 - 5 = -15
  const cig = habit({ polarity: 'bad', dailyAllowance: 1, overagePenalty: 5, starsPerRep: 10 });
  check('cigarette rep0 = -10', badHabitRepDelta(cig, 0), -10);
  check('cigarette rep1 = -15', badHabitRepDelta(cig, 1), -15);
  check('cigarette 2 reps total = -25', badHabitDayTotal(cig, 2), -25);
  check('cigarette 3 reps total = -40', badHabitDayTotal(cig, 3), -40);

  // 5 — freeWithinAllowance mode: allowance reps cost 0, only overage bites
  const freeCig = habit({
    polarity: 'bad', dailyAllowance: 1, overagePenalty: 5,
    starsPerRep: 10, freeWithinAllowance: true,
  });
  check('free-mode rep0 = 0', badHabitRepDelta(freeCig, 0), 0);
  check('free-mode rep1 = -5', badHabitRepDelta(freeCig, 1), -5);

  // 6 — redeem subtracts the cost
  check('redeem 100 = -100', redeemDelta({ id: 'r1', cost: 100 }), -100);

  // 7 — weekly balance sums every delta, signs included
  const week: LogLike[] = [
    log({ starsDelta: 10 }),
    log({ starsDelta: 10, date: '2026-01-06' }),
    log({ starsDelta: -15, kind: 'habit', refId: 'bad1', date: '2026-01-06' }),
    log({ starsDelta: -100, kind: 'redeem', refId: 'r1', date: '2026-01-07' }),
  ];
  check('weekly balance = -95', weeklyBalance(week), -95);

  // 8 — LIFETIME IGNORES PENALTIES: only positive earns count
  check('lifetime ignores penalties = 20', lifetimeFromLogs(week), 20);
  check(
    'lifetime unaffected by redeem',
    lifetimeFromLogs([log({ starsDelta: 50 }), log({ kind: 'redeem', starsDelta: -50, refId: 'r1' })]),
    50,
  );
  check(
    'lifetime unaffected by missed task',
    lifetimeFromLogs([log({ kind: 'missed-task', starsDelta: -10, refId: 't1' })]),
    0,
  );

  // 9 — dayNet, with and without the negative floor
  check('dayNet 2026-01-06 = -5', dayNet(week, '2026-01-06'), -5);
  check('dayNet floored = 0', dayNet(week, '2026-01-06', { floor: true }), 0);
  check('dayNet on an empty day = 0', dayNet(week, '2026-01-09'), 0);

  // 10 — floored weekly balance drops negative days rather than subtracting them
  const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
                 '2026-01-09', '2026-01-10', '2026-01-11'];
  check('weekly floored = 10 (day1 +10, day2 clamped 0, day3 clamped 0)',
    weeklyBalanceFloored(week, dates, { floor: true }), 10);
  check('weekly unfloored via same fn = -95',
    weeklyBalanceFloored(week, dates, { floor: false }), -95);

  // 11 — rep counting drives the bad-habit allowance ladder
  check('repsOn counts same-day reps', repsOn(week, 'h1', '2026-01-05'), 1);
  check('repsInDates counts across the week', repsInDates(week, 'h1', dates), 2);

  /* ---- targets (Phase 5) ---- */

  // 12 — pace: 5/wk target, 4 done, 3 days left → 1 rep today → 10 stars
  const gym = habit({ weeklyTarget: 5, starsPerRep: 10 });
  check('pace: 4/5 done, 3 days left = 10★', habitPaceToday(gym, 4, 3), 10);
  check('pace: 0/5 done, 5 days left = 10★', habitPaceToday(gym, 0, 5), 10);
  check('pace: 0/5 done, 2 days left = 30★ (ceil 5/2 = 3 reps)', habitPaceToday(gym, 0, 2), 30);
  check('pace: target already met = 0★', habitPaceToday(gym, 5, 3), 0);
  check('pace: no weekly target = 0★', habitPaceToday(habit({ weeklyTarget: 0 }), 0, 3), 0);

  // 13 — first-ever day (no history) uses the raw need, uncapped
  check(
    'suggest with no history = raw need (20 task + 10 pace)',
    suggestDailyTarget({
      tasksDueToday: 20,
      activeGoodHabits: [{ habit: gym, repsThisWeek: 4 }],
      recentDailyAvg: 0,
      daysLeftInWeek: 3,
    }),
    30,
  );

  // 14 — GROWTH CAP: raw need of 200 against a 50 average is clamped to 55
  check(
    'suggest is capped at recentAvg * 1.10',
    suggestDailyTarget({
      tasksDueToday: 200,
      activeGoodHabits: [],
      recentDailyAvg: 50,
      daysLeftInWeek: 3,
    }),
    55,
  );

  // 15 — a modest need blends 50/50 rather than hitting the cap
  check(
    'suggest blends 50/50 when under the cap (raw 40, avg 50 → 45)',
    suggestDailyTarget({
      tasksDueToday: 40,
      activeGoodHabits: [],
      recentDailyAvg: 50,
      daysLeftInWeek: 3,
    }),
    45,
  );

  check('recentDailyAverage of [10,20,30] = 20', recentDailyAverage([10, 20, 30]), 20);
  check('recentDailyAverage of [] = 0', recentDailyAverage([]), 0);

  // 16 — roadmap node fill = reps this week / weekly target
  const roadmap = buildRoadmap(
    [{ ...gym, id: 'gym', name: 'Gym', icon: '🏋️' },
     { ...habit({ id: 'x', weeklyTarget: 0 }), name: 'No target', icon: '⚡' }],
    (id) => (id === 'gym' ? 4 : 0),
  );
  check('roadmap only includes habits with a weekly target', roadmap.length, 1);
  check('roadmap node fill = 4/5 = 0.8', roadmap[0].fill, 0.8);
  check('roadmap fill clamps at 1 when over target',
    buildRoadmap([{ ...gym, id: 'gym', name: 'Gym', icon: '🏋️' }], () => 9)[0].fill, 1);

  // 17 — straight-line projection of the week's finish
  check('projection: 40★ over 2 days → 140 for the week', projectedWeekFinish(40, 2), 140);

  /* ---- rewards (Phase 6) ---- */

  // 18 — running balance accumulates across the week
  const rwLogs: LogLike[] = [
    log({ date: dates[0], starsDelta: 60 }),
    log({ date: dates[1], starsDelta: 60 }),
    log({ date: dates[2], starsDelta: 30 }),
  ];
  check('runningBalances accumulate', runningBalances(rwLogs, dates.slice(0, 4)),
    [60, 120, 150, 150]);

  // 19 — affordable streak counts back from today only
  check('affordable for the last 3 days at cost 100',
    affordableStreak([60, 120, 150, 150], 100), 3);
  check('not affordable today = streak 0',
    affordableStreak([150, 150, 20], 100), 0);

  // 20 — reward views: affordable, remaining, and the 2-day nudge
  const views = buildRewardViews(
    [{ id: 'r1', cost: 100, name: 'Cheesecake' }, { id: 'r2', cost: 500, name: 'Headphones' }],
    150,
    [60, 120, 150, 150],
  );
  check('affordable reward has remaining 0', [views[0].affordable, views[0].remaining], [true, 0]);
  check('locked reward reports stars remaining', [views[1].affordable, views[1].remaining],
    [false, 350]);
  check('nudge fires after 2+ affordable days', views[0].nudge, true);
  check('no nudge on an unaffordable reward', views[1].nudge, false);

  /* ---- analytics (Phase 7) ---- */

  // 21 — stars per day mirrors dayNet across the week
  check('starsPerDay values', starsPerDay(week, dates.slice(0, 3)).map((p) => p.value),
    [10, -5, -100]);

  // 22 — cumulative lifetime only ever climbs
  check('cumulativeLifetime ignores penalties and never falls',
    cumulativeLifetime(week, dates.slice(0, 4)).map((p) => p.value), [10, 20, 20, 20]);

  // 23 — reps per day for the heatmap
  check('repsPerDay counts reps', repsPerDay(week, 'h1', dates.slice(0, 3)).map((p) => p.value),
    [1, 1, 0]);

  // 24 — per-habit net, best first, ignoring non-habit kinds
  const stats = perHabitStats(week);
  check('perHabitStats best first', stats.map((s) => [s.refId, s.net]),
    [['h1', 20], ['bad1', -15]]);

  // 25 — streaks. target 7/wk → needs 1 rep a day.
  const sLogs: LogLike[] = [
    log({ date: '2026-01-05' }), log({ date: '2026-01-06' }),
    // 01-07 missed
    log({ date: '2026-01-08' }), log({ date: '2026-01-09' }), log({ date: '2026-01-10' }),
  ];
  const sDates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
                  '2026-01-09', '2026-01-10'];
  check('streak: record 3, current 3', habitStreak(sLogs, 'h1', sDates, 7), { current: 3, record: 3 });

  // an unfinished today must not be reported as a broken streak
  check('streak tolerates an unfinished today',
    habitStreak(sLogs, 'h1', [...sDates, '2026-01-11'], 7), { current: 3, record: 3 });

  // a genuine gap does break it
  /* ---- rank (Phase 8) ---- */

  // 26 — the curve: level N needs 100 * N^1.6
  check('level 1 is free', starsForLevel(1), 0);
  check('level 2 needs 303', starsForLevel(2), 303);
  check('level 30 needs 23196', starsForLevel(30), Math.round(100 * Math.pow(30, 1.6)));

  check('0 stars = level 1 Recruit', [rankFor(0).level, rankFor(0).title], [1, 'Recruit']);
  check('302 stars is still level 1', rankFor(302).level, 1);
  check('303 stars crosses to level 2', rankFor(303).level, 2);

  // 27 — band titles map to the specified level ranges
  check('level 5 = Recruit', rankFor(starsForLevel(5)).title, 'Recruit');
  check('level 6 = Disciplined', rankFor(starsForLevel(6)).title, 'Disciplined');
  check('level 11 = Ironclad', rankFor(starsForLevel(11)).title, 'Ironclad');
  check('level 19 = Vanguard', rankFor(starsForLevel(19)).title, 'Vanguard');
  check('level 26 = Warlord', rankFor(starsForLevel(26)).title, 'Warlord');

  // 28 — progress and the max-level ceiling
  check('progress is 0 exactly at a level floor', rankFor(starsForLevel(4)).progress, 0);
  check('level is capped at 30', rankFor(99_999_999).level, MAX_LEVEL);
  check('max level has no next', [rankFor(99_999_999).nextAt, rankFor(99_999_999).progress],
    [null, 1]);
  check('rank never goes below level 1 on garbage input', rankFor(-500).level, 1);

  check('streak broken by a real gap',
    habitStreak(sLogs, 'h1', [...sDates, '2026-01-11', '2026-01-12'], 7),
    { current: 0, record: 3 });

  return results;
}

/** Run the suite and log it. Returns true if every assert passed. */
export function reportStarEngineTests(): boolean {
  const results = runStarEngineTests();
  const failed = results.filter((r) => !r.ok);

  if (failed.length === 0) {
    console.log(
      `%c★ star engine: ${results.length}/${results.length} asserts passed`,
      'color:#3ecf8e;font-weight:bold',
    );
    return true;
  }

  console.error(`★ star engine: ${failed.length} of ${results.length} asserts FAILED`);
  failed.forEach((f) => console.error(`  ✘ ${f.name} — ${f.detail}`));
  return false;
}
