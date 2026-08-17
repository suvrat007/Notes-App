import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Star, ArrowRight, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import api from '../../../utils/api';
import HabitCard from '../../../components/HabitCard';
import HabitModal from '../../../components/HabitModal';
import RewardPanel from '../../../components/RewardPanel';
import WeekTargets from '../../../components/WeekTargets';
import RankBadge from '../../../components/RankBadge';
import TaskRow from '../../../components/TaskRow';
import { usePref, SHOW_BACKLOG, CARRY_DAYS } from '../../../utils/prefs';

/*
 * One rhythm for the whole screen.
 *
 * Five hand-written delays drift apart the moment anything is added or
 * reordered, and they all used framer's default easing, which starts at full
 * speed and stops dead. A container that staggers its own children keeps the
 * sequence right by itself, and the curve below eases in AND out so the cards
 * settle instead of snapping.
 */
const EASE = [0.4, 0, 0.2, 1];

const screen = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const rise = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/*
 * The rows inside a list, dealt out rather than appearing at once.
 *
 * The card they sit in already eases in; without this the contents simply
 * exist inside it, which reads as the list being painted rather than filled.
 * A shorter travel than the cards so it stays subordinate to them, and a
 * tight stagger so a long list still finishes quickly.
 */
const list = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.06 } },
};

const row = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};
const todayKey = () => new Date().toLocaleDateString('en-CA');

const Home = ({ user, tasks, logs, state, refreshData, showToast, onNavigate }) => {
  const reduce = useReducedMotion();
  const [showHabitModal, setShowHabitModal] = useState(false);
  // Some people want yesterday in front of them; some find it discouraging.
  const [showBacklog] = usePref(SHOW_BACKLOG, true);
  const [carryDays] = usePref(CARRY_DAYS, 2);

  const habits = state?.habits ?? [];
  // Owed work, but only while it is still worth chasing. Past the window it
  // drops off the home screen; it is not deleted, and Manage still has it.
  const carried = (state?.carriedTasks ?? []).filter((t) => t.lateBy <= carryDays);
  const rewards = state?.rewards ?? [];
  const stars = state?.stars;

  /**
   * Apply a habit change the card has already shown.
   *
   * The card debounces, so this arrives ONCE with the net delta rather than
   * per tap. A positive delta is a single request carrying the amount; the
   * server still decides what it is worth, since a bad habit escalates past
   * its allowance and a goal pays less once beaten. A negative delta removes
   * that many of the most recent reps.
   *
   * It deliberately does NOT catch: the card needs the rejection to put its
   * own number back.
   */
  const changeHabit = async (habit, delta) => {
    if (delta > 0) {
      /*
       * The DAY is the user's, not the server's. Without it the entry is
       * dated by the box's UTC clock, which is still on yesterday until the
       * morning in India — so a rep logged now lands on a day the dashboard
       * is not looking at, and the card silently springs back to zero.
       */
      const { data } = await api.post(`/habits/${habit._id}/log`, {
        amount: delta,
        date: todayKey(),
      });
      const d = data.starsDelta;
      const unit = habit.unit ? ` ${habit.unit}` : '';
      const much = delta > 1 ? ` ${delta}${unit}` : '';
      showToast?.(`${habit.name}${much} ${d >= 0 ? '+' : ''}${d}★`);
    } else {
      for (let i = 0; i < -delta; i++) {
        await api.delete(`/habits/${habit._id}/log`, { params: { date: todayKey() } });
      }
      showToast?.(`Undid ${-delta} × ${habit.name}`);
    }
    await refreshData();
  };

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const firstName = user?.fullName?.split(' ')[0] || 'Operator';

  const todaysLogs = logs.filter((l) => new Date(l.date).toLocaleDateString('en-CA') === todayKey());

  const netToday = todaysLogs.reduce((sum, l) => sum + (l.starsDelta ?? 0), 0);

  /*
   * Progress counts HABITS as well as tasks.
   *
   * The old sum read fields the ledger no longer has, so it sat at 0% while
   * the day's stars climbed and a habit card plainly showed 3/5 — a dashboard
   * contradicting itself on the same screen. A habit counts as done when it
   * met its daily quota, or when it has been logged at all if it has none.
   */
  const habitDone = (h) => {
    const quota = h.polarity === 'bad' ? 0 : h.dailyTarget;
    return quota > 0 ? (h.repsToday ?? 0) >= quota : (h.repsToday ?? 0) > 0;
  };
  const goodHabits = habits.filter((h) => h.polarity === 'good');
  const dayTasks = state?.tasks ?? [];

  const doneToday = goodHabits.filter(habitDone).length + dayTasks.filter((t) => t.done).length;
  const dueToday = goodHabits.length + dayTasks.length;
  const progressPercent = dueToday === 0 ? 0 : Math.round((doneToday / dueToday) * 100);
  const goalsAchievedToday = doneToday;
  /*
   * "Tasks done TODAY" counts today's tasks.
   *
   * It divided by `tasks`, which is every task the account has ever had —
   * including every occurrence a repeating task generates months ahead. That
   * read "0 / 128" on a day with four things on it. `dayTasks` is the day's
   * own list, already carrying its own done flags from the server.
   */
  const tasksDoneToday = dayTasks.filter((t) => t.done).length;
  const totalTasks = dayTasks.length;
  const tasksDonePercent = totalTasks === 0
    ? 0
    : Math.round((tasksDoneToday / totalTasks) * 100);

  // Real last-7-days star totals (instead of a decorative random bar chart).
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-CA');
  });
  const starsByDay = last7.map((key) =>
    logs.filter((l) => new Date(l.date).toLocaleDateString('en-CA') === key).reduce((sum, l) => sum + (l.starsDelta ?? 0), 0)
  );
  const maxBar = Math.max(...starsByDay, 1);

  /**
   * Persist a task's progress.
   *
   * The row has already debounced the taps and shown the result, so this sends
   * the settled number once. It deliberately does NOT catch: the row needs the
   * rejection to put its own number back.
   */
  const logTask = async (task, completedCount) => {
    await api.post('/logs', { taskId: task._id, date: todayKey(), completedCount });
    await refreshData();
  };



  return (
    <motion.div
      className="space-y-4 md:space-y-5 md:h-full md:flex md:flex-col md:min-h-0"
      variants={screen}
      initial={reduce ? false : 'hidden'}
      animate="shown"
    >
      <header className="hidden md:block">
        <motion.h1
          initial={{ x: -16, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="text-2xl font-bold font-heading text-white"
        >
          Welcome back, {firstName}
        </motion.h1>
        <p className="text-sm text-white/40 mt-1">{todayStr}</p>
      </header>

      <div className="md:hidden pt-2">
        <h1 className="text-xl font-bold font-heading text-white">Welcome back, {firstName}</h1>
        <p className="text-xs text-focus-teal mt-1">{todayStr}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:shrink-0 items-stretch">
        <motion.div variants={rise} className="order-1 md:order-none">
          <Card className="bg-[#16191e] border-white/5 h-full rounded-2xl md:rounded-xl">
            <CardHeader className="pb-2 px-4 sm:px-5 pt-4 sm:pt-5">
              <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide">Today's Progress</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-4 sm:pb-6 px-2">
              <div className="relative w-[104px] h-[104px] sm:w-32 sm:h-32 md:w-36 md:h-36 flex items-center justify-center mb-2 mt-2">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
                  <circle
                    cx="50" cy="50" r="40"
                    stroke="#c0b3a5"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${progressPercent * 2.51} 251.2`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center mt-1">
                  <span className="text-2xl sm:text-3xl font-heading font-black text-white">{progressPercent}%</span>
                  <div className="flex gap-1 mt-1 text-white/40">
                    {Array.from({ length: Math.min(dueToday, 4) || 1 }).map((_, i) => (
                      <Star key={i} size={10} fill="currentColor" className={i < goalsAchievedToday ? 'text-white' : 'text-white/10'} />
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-white/40">{goalsAchievedToday}/{dueToday} due today</span>
            </CardContent>
          </Card>
        </motion.div>
        {/* Two small figures share the right half on a phone; on a desktop
            this wrapper is display:contents and they become columns again. */}

        <motion.div variants={rise} className="order-3 col-span-2 md:order-none md:col-span-1">
          <Card className="bg-[#16191e] border-white/5 h-full flex flex-col justify-between rounded-2xl md:rounded-xl p-4 sm:p-5">
            <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide mb-3">Total Stars</CardTitle>
            <div>
              <div className="flex items-end gap-3 mb-2">
                {/* Summed from the ledger by the server, so this is the number
                    the database agrees with rather than a client tally. */}
                <span className="text-3xl sm:text-4xl font-heading font-black text-white leading-none" data-testid="lifetime">
                  {(stars?.lifetime ?? user?.totalStars ?? 0).toLocaleString()}
                </span>
                <span className="bg-[#241f19] text-[#c0b3a5] px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 mb-1">
                  {(stars?.dayNet ?? netToday) >= 0 ? '+' : ''}{stars?.dayNet ?? netToday} <Star size={8} fill="currentColor" />
                </span>
              </div>

              {stars?.rank && (
                <div className="mb-3" data-testid="rank">
                  {/*
                    The badge IS the rank marker, so the bordered pill beside it
                    was a second one competing for the same job. Name in the
                    rank colour, level after it, and the distance to the next on
                    its own quiet line rather than wrapping against the title.
                  */}
                  <div className="flex items-center gap-2 mb-1.5 min-w-0">
                    <RankBadge
                      badge={stars.rank.badge}
                      color={stars.rank.color}
                      size="sm"
                      title={stars.rank.title}
                    />
                    <span className="min-w-0 truncate">
                      <span
                        className="text-[12px] font-black tracking-wide uppercase"
                        style={{ color: stars.rank.color }}
                      >
                        {stars.rank.title}
                      </span>
                      <span className="text-[11px] font-bold text-white/35 ml-1.5">
                        LVL {stars.rank.level}
                      </span>
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(stars.rank.progress * 100)}%`,
                        background: stars.rank.color,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-white/35 mt-1 tabular-nums">
                    {stars.rank.nextAt === null
                      ? 'Highest rank reached'
                      : `${stars.rank.toNext}★ to ${stars.rank.nextTitle ?? 'the next level'}`}
                  </p>
                </div>
              )}
              {/*
                Seven days, on a baseline. Floating stubs of differing heights
                with nothing to sit on read as damage rather than data, so the
                bars grow from a line and today is the only one in colour.
              */}
              <div className="mt-auto pt-3">
                <div
                  className="flex items-end gap-1 h-9 w-full border-b border-white/10"
                  title="Stars earned each of the last 7 days"
                >
                  {starsByDay.map((v, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-sm ${i === 6 ? 'bg-[#c0b3a5]' : 'bg-white/[0.14]'}`}
                      style={{ height: `${Math.max(6, Math.round((Math.max(v, 0) / maxBar) * 100))}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={rise} className="order-2 md:order-none">
          <Card className="bg-[#16191e] border-white/5 h-full flex flex-col justify-between rounded-2xl md:rounded-xl p-4 sm:p-5">
            <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide mb-3">Tasks Done Today</CardTitle>
            <div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-heading font-black text-white leading-none">{tasksDoneToday}</span>
                <span className="text-xl text-white/40 font-heading font-bold">/ {totalTasks}</span>
              </div>
              <Progress value={tasksDonePercent} className="h-2 bg-white/5 [&>div]:bg-[#c0b3a5] rounded-full" />
              <p className="text-[10px] font-bold text-white/40 mt-3">
                {totalTasks === 0
                  ? 'Nothing scheduled today'
                  : tasksDoneToday >= totalTasks
                    ? 'All tasks done today!'
                    : `${totalTasks - tasksDoneToday} task${totalTasks - tasksDoneToday === 1 ? '' : 's'} left today`}
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      {/*
        Stars taken for deadlines that passed.
        A penalty applied silently is indistinguishable from a bug, so the
        charge is stated once, with what was missed and what it cost.
      */}
      {(state?.missed?.length ?? 0) > 0 && (
        <div
          className="bg-focus-red/10 border border-focus-red/30 rounded-2xl p-4"
          data-testid="missed-notice"
        >
          <p className="text-[11px] font-bold tracking-widest text-focus-red mb-2">
            RAN OUT OF TIME
          </p>
          <ul className="space-y-1">
            {state.missed.map((m) => (
              <li key={m.taskId} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-white/70 truncate">
                  {m.title}
                  <span className="text-white/35"> · {m.done}/{m.target} by {m.due}</span>
                </span>
                <span className="font-bold text-focus-red tabular-nums shrink-0">
                  {m.starsDelta}★
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What the week asked for, kept in sight while the day is worked. */}
      <div className="md:shrink-0">
        <WeekTargets onNavigate={onNavigate} />
      </div>

      {/*
        Desktop gets columns, not one long scroll. Habits, today's plan and
        rewards are three separate questions, "what am I keeping up", "what
        is left today", "what am I working towards", and stacking them means
        the answer to the third is always below the fold. On a phone the
        single column stays, because side-by-side at 390px is unreadable.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 md:flex-1 md:min-h-[22rem]">
      {/* ---- Habits: the things you repeat, as opposed to finish ---- */}
      <motion.div
        variants={rise}
        className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:flex md:flex-col md:min-h-0 md:overflow-hidden"
        data-testid="habits-section"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading font-black text-white text-xl">Habits</h3>
          <button
            className="flex items-center gap-1 text-[11px] font-bold text-white/60 hover:text-white transition-colors"
            onClick={() => setShowHabitModal(true)}
            data-testid="new-habit"
          >
            <Plus size={13} /> New Habit
          </button>
        </div>

        <motion.div
          variants={list}
          className="roll-list space-y-2 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1"
        >
          {habits.map((h) => (
            <motion.div key={h._id} variants={row}>
              <HabitCard habit={h} onChange={changeHabit} />
            </motion.div>
          ))}
          {habits.length === 0 && (
            <p className="text-center text-white/40 text-sm py-6" data-testid="habits-empty">
              No habits yet. Add the first thing you want to build, or break.
            </p>
          )}
        </motion.div>
      </motion.div>

      <motion.div variants={rise} className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:flex md:flex-col md:min-h-0 md:overflow-hidden" data-testid="plan-section">
        {/* Work that did not stop being owed at midnight. Shown with the day's
            own list, so it is something to do today rather than a wall of
            shame parked somewhere else. */}
        {showBacklog && carried.length > 0 && (
          <div className="mb-6" data-testid="carried-section">
            <h4 className="text-[11px] font-bold text-focus-red tracking-widest uppercase mb-3">
              Still owed
            </h4>
            {/* Owed work you can actually finish. These were plain text: you
                could see what was outstanding but had no way to tick it off,
                so the only route to clearing it was to go back to the day it
                was set. Same row as everything else, same controls. */}
            <motion.div variants={list} className="space-y-2">
              {carried.map((t) => (
                <motion.div key={t._id} variants={row} data-testid={`carried-${t._id}`}>
                  <TaskRow task={t} onLog={logTask} showToast={showToast} lateBy={t.lateBy} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading font-black text-white text-xl">Today's Plan</h3>
          <button className="flex items-center gap-1 text-[11px] font-bold text-white/60 hover:text-white transition-colors" onClick={() => onNavigate?.('calendar')}>
            View Calendar <ArrowRight size={12} />
          </button>
        </div>

        <motion.div
          variants={list}
          className="roll-list space-y-2 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1"
        >
          {/* Logged where it sits: a one-off is a checkbox, a multi-unit job
              is a counter. Neither opens a form to describe an action the
              user could simply have performed. */}
          {dayTasks.map((task) => (
            <motion.div key={task._id} variants={row}>
              <TaskRow task={task} onLog={logTask} showToast={showToast} />
            </motion.div>
          ))}

          {tasks.length === 0 && (
            <div className="p-8 text-center text-white/40 text-sm">No tasks scheduled for today.</div>
          )}
        </motion.div>
      </motion.div>

      <RewardPanel
        rewards={rewards}
        lifetime={stars?.lifetime ?? 0}
        refreshData={refreshData}
        showToast={showToast}
      />
      </div>

      {showHabitModal && (
        <HabitModal
          onClose={() => setShowHabitModal(false)}
          refreshData={refreshData}
          showToast={showToast}
        />
      )}
    </motion.div>
  );
};

export default Home;
