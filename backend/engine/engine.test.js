/**
 * Assertion suite for the star engine. `node engine/engine.test.js`.
 *
 * These encode THE CONTRACT. The numbers are carried over verbatim from the
 * prototype's suite, so a failure here means the port changed a rule rather
 * than moved it — which is the one thing this move was not allowed to do.
 */
const s = require('./stars');
const r = require('./rank');

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else failures.push(`${name}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const habit = (over = {}) => ({
  starsPerRep: 10, dailyAllowance: 0, overagePenalty: 5,
  freeWithinAllowance: false, ...over,
});

/* ---- per-event deltas ---- */
check('good habit rep = +10', s.goodHabitDelta(habit()), 10);
check('task done = +10', s.taskDelta({ baseReward: 10 }), 10);
check('missed task = -10', s.missedTaskDelta({ baseReward: 10 }), -10);

// THE CIGARETTE EXAMPLE: allowance 1, overage 5, starsPerRep 10.
const cig = habit({ dailyAllowance: 1, overagePenalty: 5 });
check('cigarette rep0 = -10', s.badHabitRepDelta(cig, 0), -10);
check('cigarette rep1 = -15', s.badHabitRepDelta(cig, 1), -15);
check('cigarette 2 reps = -25', s.badHabitDayTotal(cig, 2), -25);
check('cigarette 3 reps = -40', s.badHabitDayTotal(cig, 3), -40);

const freeCig = habit({ dailyAllowance: 1, overagePenalty: 5, freeWithinAllowance: true });
check('free-mode rep0 = 0', s.badHabitRepDelta(freeCig, 0), 0);
check('free-mode rep1 = -5', s.badHabitRepDelta(freeCig, 1), -5);

/* ---- rewards priced as a share of everything earned ---- */
check('20% of 500 = 100', s.rewardCost(500, 20), 100);
check('100% wipes the lot', s.rewardCost(500, 100), 500);
check('rounds UP so any share still costs', s.rewardCost(11, 20), 3);
check('nothing earned = nothing to spend', s.rewardCost(0, 100), 0);
check('a negative total cannot pay out', s.rewardCost(-50, 40), 0);
check('a week off is total damage', s.suggestDamage('a week off'), 100);
check('a big purchase is severe', s.suggestDamage('new phone'), 80);
check('a night out is fair', s.suggestDamage('dinner out'), 40);
check('a cheesecake is small', s.suggestDamage('cheesecake'), 20);
check('an unnamed reward defaults gently', s.suggestDamage('   '), 20);

/* ---- aggregates over the ledger ---- */
const L = (over = {}) => ({
  refId: 'h1', date: '2026-01-05T00:00:00.000Z', count: 1, starsDelta: 10, ...over,
});
const week = [
  L(),
  L({ date: '2026-01-06T00:00:00.000Z' }),
  L({ refId: 'bad1', date: '2026-01-06T00:00:00.000Z', starsDelta: -15 }),
  L({ refId: 'r1', date: '2026-01-07T00:00:00.000Z', starsDelta: -100 }),
];
check('balance sums every delta = -95', s.balanceOf(week), -95);
check('lifetime ignores penalties = 20', s.lifetimeFromLogs(week), 20);
check('dayNet 2026-01-06 = -5', s.dayNet(week, '2026-01-06'), -5);
check('dayNet floored = 0', s.dayNet(week, '2026-01-06', { floor: true }), 0);
check('dayNet on an empty day = 0', s.dayNet(week, '2026-01-09'), 0);
check('repsOn counts same-day reps', s.repsOn(week, 'h1', '2026-01-05'), 1);
check('repsInDates counts across days',
  s.repsInDates(week, 'h1', ['2026-01-05', '2026-01-06']), 2);

/* ---- dates ---- */
check('dayKey normalises to YYYY-MM-DD', s.dayKey('2026-01-05T13:45:00.000Z'), '2026-01-05');
check('addDays crosses a month', s.addDays('2026-01-31', 1), '2026-02-01');
check('daysBetween is signed', s.daysBetween('2026-01-05', '2026-01-03'), -2);
check('weekStartOf Monday', s.weekStartOf('2026-01-07', 1), '2026-01-05');
check('weekDates spans seven days', s.weekDates('2026-01-05').length, 7);

/* ---- rank ---- */
check('level 1 is free', r.starsForLevel(1), 0);
check('level 2 costs 303', r.starsForLevel(2), 303);
check('zero stars = level 1', r.rankFor(0).level, 1);
check('303 stars = level 2', r.rankFor(303).level, 2);
check('rank 0 is Recruit', r.rankFor(0).title, 'Recruit');
check('progress is clamped to 1 at the ceiling', r.rankFor(99_999_999).progress, 1);
check('a negative lifetime cannot go below level 1', r.rankFor(-500).level, 1);

/* ---- report ---- */
if (failures.length === 0) {
  console.log(`\n  ✔ star engine: ${pass}/${pass} asserts passed\n`);
  process.exit(0);
} else {
  console.log(`\n  ✘ star engine: ${failures.length} of ${pass + failures.length} FAILED`);
  for (const f of failures) console.log(`    - ${f}`);
  console.log('');
  process.exit(1);
}
