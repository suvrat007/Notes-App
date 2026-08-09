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
