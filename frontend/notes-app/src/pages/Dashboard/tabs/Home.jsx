import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, ArrowRight, Sun, Calendar, Ban, Coffee, Check, X, Plus, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import api from '../../../utils/api';
import HabitCard from '../../../components/HabitCard';
import HabitModal from '../../../components/HabitModal';
import RewardPanel from '../../../components/RewardPanel';
import WeekTargets from '../../../components/WeekTargets';
import RankBadge from '../../../components/RankBadge';
import TaskRow from '../../../components/TaskRow';

const todayKey = () => new Date().toLocaleDateString('en-CA');

const Home = ({ user, tasks, logs, state, refreshData, showToast, onNavigate }) => {
  const [habitBusy, setHabitBusy] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);

  const habits = state?.habits ?? [];
  const carried = state?.carriedTasks ?? [];
  const rewards = state?.rewards ?? [];
  const stars = state?.stars;

  /**
   * Log a rep. The SERVER works out what it is worth — a bad habit's penalty
   * escalates past its allowance, so the number depends on how many reps
   * already exist today, which only the server can know for certain.
   */
  const logHabit = async (habit, amount = 1) => {
    setHabitBusy(true);
    try {
      const { data } = await api.post(`/habits/${habit._id}/log`, { amount });
      await refreshData();
      const d = data.starsDelta;
      const much = amount > 1 ? ` ${amount}${habit.unit ? ' ' + habit.unit : ''}` : '';
      showToast?.(`${habit.name}${much} ${d >= 0 ? '+' : ''}${d}★`);
    } catch (err) {
      // Hitting the rate limit is not a failure of theirs, so it is said
      // plainly rather than dressed as an error.
      const d = err.response?.data;
      showToast?.(d?.message || 'Could not log that', d?.rateLimited ? 'info' : 'error');
    } finally {
      setHabitBusy(false);
    }
  };

  const undoHabit = async (habit) => {
    setHabitBusy(true);
    try {
      await api.delete(`/habits/${habit._id}/log`);
      await refreshData();
      showToast?.(`Undid one ${habit.name}`);
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Nothing to undo', 'error');
    } finally {
      setHabitBusy(false);
    }
  };

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const firstName = user?.fullName?.split(' ')[0] || 'Operator';

  const todaysLogs = logs.filter((l) => new Date(l.date).toLocaleDateString('en-CA') === todayKey());

  const goalTasks = tasks.filter((t) => t.type === 'daily' || t.type === 'occasional');
  const maxToday = goalTasks.reduce((sum, t) => sum + t.baseReward, 0) || 1;
  const earnedToday = todaysLogs.reduce((sum, l) => sum + Math.max((l.starsDelta ?? 0), 0), 0);
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

  const getTaskVisuals = (type) => {
    switch (type) {
      case 'daily': return { icon: Sun, color: 'text-focus-teal', bg: 'bg-[#241f19]', border: 'border-l-focus-teal' };
      case 'occasional': return { icon: Calendar, color: 'text-purple-400', bg: 'bg-[#1e232b]', border: 'border-l-purple-400' };
      case 'avoid': return { icon: Ban, color: 'text-focus-red', bg: 'bg-[#2a1a1a]', border: 'border-l-focus-red' };
      case 'break_day': return { icon: Coffee, color: 'text-white/60', bg: 'bg-white/5', border: 'border-l-white/20' };
      default: return { icon: Sun, color: 'text-focus-teal', bg: 'bg-[#241f19]', border: 'border-l-focus-teal' };
    }
  };

  return (
    <div className="space-y-4 md:space-y-5 md:h-full md:flex md:flex-col md:min-h-0">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:shrink-0">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="bg-[#16191e] border-white/5 h-full rounded-2xl md:rounded-xl">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide">Today's Progress</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-6">
              <div className="relative w-36 h-36 flex items-center justify-center mb-2 mt-2">
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
                  <span className="text-3xl font-heading font-black text-white">{progressPercent}%</span>
                  <div className="flex gap-1 mt-1 text-white/40">
                    {Array.from({ length: Math.min(goalTasks.length, 4) || 1 }).map((_, i) => (
                      <Star key={i} size={10} fill="currentColor" className={i < goalsAchievedToday ? 'text-white' : 'text-white/10'} />
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-white/40">{goalsAchievedToday}/{goalTasks.length} Daily Goals Achieved</span>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-[#16191e] border-white/5 h-full flex flex-col justify-between rounded-2xl md:rounded-xl p-5">
            <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide mb-3">Total Stars</CardTitle>
            <div>
              <div className="flex items-end gap-3 mb-2">
                {/* Summed from the ledger by the server, so this is the number
                    the database agrees with rather than a client tally. */}
                <span className="text-4xl font-heading font-black text-white leading-none" data-testid="lifetime">
                  {(stars?.lifetime ?? user?.totalStars ?? 0).toLocaleString()}
                </span>
                <span className="bg-[#241f19] text-[#c0b3a5] px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 mb-1">
                  {(stars?.dayNet ?? netToday) >= 0 ? '+' : ''}{stars?.dayNet ?? netToday} <Star size={8} fill="currentColor" />
                </span>
              </div>

              {stars?.rank && (
                <div className="mb-5" data-testid="rank">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <RankBadge
                        badge={stars.rank.badge}
                        color={stars.rank.color}
                        size="sm"
                        title={stars.rank.title}
                      />
                      <span
                        className="text-[10px] font-black tracking-[0.15em] uppercase px-2 py-0.5 rounded-full border truncate"
                        style={{ color: stars.rank.color, borderColor: stars.rank.color }}
                      >
                        {stars.rank.title} {stars.rank.level}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-white/40 tabular-nums shrink-0">
                      {stars.rank.nextAt === null ? 'MAX' : `${stars.rank.toNext}★ to next`}
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
                </div>
              )}
              <div className="flex items-end gap-1.5 h-10 w-full" title="Stars earned each of the last 7 days">
                {starsByDay.map((v, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${i === 6 ? 'bg-[#c0b3a5]' : 'bg-white/10'}`}
                    style={{ height: `${Math.max(8, Math.round((Math.max(v, 0) / maxBar) * 100))}%` }}
                  />
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-[#16191e] border-white/5 h-full flex flex-col justify-between rounded-2xl md:rounded-xl p-5">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 md:flex-1 md:min-h-0">
      {/* ---- Habits: the things you repeat, as opposed to finish ---- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
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

        <div className="space-y-2 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
          {habits.map((h) => (
            <HabitCard
              key={h._id}
              habit={h}
              busy={habitBusy}
              onLog={logHabit}
              onUndo={undoHabit}
            />
          ))}
          {habits.length === 0 && (
            <p className="text-center text-white/40 text-sm py-6" data-testid="habits-empty">
              No habits yet. Add the first thing you want to build, or break.
            </p>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 md:flex md:flex-col md:min-h-0 md:overflow-hidden" data-testid="plan-section">
        {/* Work that did not stop being owed at midnight. Shown with the day's
            own list, so it is something to do today rather than a wall of
            shame parked somewhere else. */}
        {carried.length > 0 && (
          <div className="mb-6" data-testid="carried-section">
            <h4 className="text-[11px] font-bold text-focus-red tracking-widest uppercase mb-3">
              Still owed
            </h4>
            <div className="space-y-2">
              {carried.map((t) => (
                <div
                  key={t._id}
                  className="flex items-center gap-3 bg-black/40 border border-white/5 border-l-[3px] border-l-focus-red rounded-2xl px-4 py-3"
                  data-testid={`carried-${t._id}`}
                >
                  <Clock size={15} className="text-focus-red shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-white/50">
                      {t.targetCount > 1 && `${t.targetCount - t.doneCount} left · `}
                      {t.lateBy === 1 ? 'since yesterday' : `${t.lateBy} days late`}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-white/40 tabular-nums">+{t.baseReward}★</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading font-black text-white text-xl">Today's Plan</h3>
          <button className="flex items-center gap-1 text-[11px] font-bold text-white/60 hover:text-white transition-colors" onClick={() => onNavigate?.('calendar')}>
            View Calendar <ArrowRight size={12} />
          </button>
        </div>

        <div className="space-y-2 md:flex-1 md:min-h-0 md:overflow-y-auto md:pr-1">
          {/* Logged where it sits: a one-off is a checkbox, a multi-unit job
              is a counter. Neither opens a form to describe an action the
              user could simply have performed. */}
          {dayTasks.map((task) => (
            <TaskRow
              key={task._id}
              task={task}
              onLog={logTask}
              showToast={showToast}
            />
          ))}

          {tasks.length === 0 && (
            <div className="p-8 text-center text-white/40 text-sm">No tasks scheduled for today.</div>
          )}
        </div>
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
    </div>
  );
};

export default Home;
