import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, ArrowRight, Sun, Calendar, Ban, Coffee, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import api from '../../../utils/api';

const todayKey = () => new Date().toLocaleDateString('en-CA');

const Home = ({ user, tasks, logs, refreshData, showToast, onNavigate }) => {
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const firstName = user?.fullName?.split(' ')[0] || 'Operator';

  const todaysLogs = logs.filter((l) => new Date(l.date).toLocaleDateString('en-CA') === todayKey());

  const goalTasks = tasks.filter((t) => t.type === 'daily' || t.type === 'occasional');
  const maxToday = goalTasks.reduce((sum, t) => sum + t.baseReward, 0) || 1;
  const earnedToday = todaysLogs.reduce((sum, l) => sum + Math.max(l.starsEarned, 0), 0);
  const netToday = todaysLogs.reduce((sum, l) => sum + l.starsEarned, 0);

  const progressPercent = Math.min(100, Math.round((earnedToday / maxToday) * 100)) || 0;
  const goalsAchievedToday = goalTasks.filter((t) =>
    todaysLogs.some((l) => l.taskId && l.taskId._id === t._id && l.completedCount >= t.targetCount)
  ).length;
  const tasksDoneToday = todaysLogs.filter((l) => l.completedCount > 0).length;
  const totalTasks = tasks.length || 1;
  const tasksDonePercent = Math.round((tasksDoneToday / totalTasks) * 100) || 0;

  // Real last-7-days star totals (instead of a decorative random bar chart).
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en-CA');
  });
  const starsByDay = last7.map((key) =>
    logs.filter((l) => new Date(l.date).toLocaleDateString('en-CA') === key).reduce((sum, l) => sum + l.starsEarned, 0)
  );
  const maxBar = Math.max(...starsByDay, 1);

  const [loggingTaskId, setLoggingTaskId] = useState(null);
  const [count, setCount] = useState(1);

  const submitLog = async (taskId, completedCount) => {
    try {
      await api.post('/logs', { taskId, date: todayKey(), completedCount });
      setLoggingTaskId(null);
      setCount(1);
      refreshData();
      showToast?.('Progress logged');
    } catch (e) {
      showToast?.(e.response?.data?.message || 'Could not log progress', 'error');
    }
  };

  const getTaskVisuals = (type) => {
    switch (type) {
      case 'daily': return { icon: Sun, color: 'text-focus-teal', bg: 'bg-[#1a2522]', border: 'border-l-focus-teal' };
      case 'occasional': return { icon: Calendar, color: 'text-purple-400', bg: 'bg-[#1f1b26]', border: 'border-l-purple-400' };
      case 'avoid': return { icon: Ban, color: 'text-focus-red', bg: 'bg-[#291818]', border: 'border-l-focus-red' };
      case 'break_day': return { icon: Coffee, color: 'text-white/60', bg: 'bg-white/5', border: 'border-l-white/20' };
      default: return { icon: Sun, color: 'text-focus-teal', bg: 'bg-[#1a2522]', border: 'border-l-focus-teal' };
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="bg-[#121214] border-white/5 h-full rounded-2xl md:rounded-xl">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide">Today's Progress</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-6">
              <div className="relative w-36 h-36 flex items-center justify-center mb-2 mt-2">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
                  <circle
                    cx="50" cy="50" r="40"
                    stroke="#a3c4b6"
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
          <Card className="bg-[#121214] border-white/5 h-full flex flex-col justify-between rounded-2xl md:rounded-xl p-5">
            <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide mb-3">Total Stars</CardTitle>
            <div>
              <div className="flex items-end gap-3 mb-6">
                <span className="text-4xl font-heading font-black text-white leading-none">{user?.totalStars?.toLocaleString()}</span>
                <span className="bg-[#1a2522] text-[#a3c4b6] px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 mb-1">
                  {netToday >= 0 ? '+' : ''}{netToday} <Star size={8} fill="currentColor" />
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-10 w-full" title="Stars earned each of the last 7 days">
                {starsByDay.map((v, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${i === 6 ? 'bg-[#a3c4b6]' : 'bg-white/10'}`}
                    style={{ height: `${Math.max(8, Math.round((Math.max(v, 0) / maxBar) * 100))}%` }}
                  />
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-[#121214] border-white/5 h-full flex flex-col justify-between rounded-2xl md:rounded-xl p-5">
            <CardTitle className="text-[11px] font-bold text-white/60 tracking-wide mb-3">Tasks Done Today</CardTitle>
            <div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-heading font-black text-white leading-none">{tasksDoneToday}</span>
                <span className="text-xl text-white/40 font-heading font-bold">/ {totalTasks}</span>
              </div>
              <Progress value={tasksDonePercent} className="h-2 bg-white/5 [&>div]:bg-[#a3c4b6] rounded-full" />
              <p className="text-[10px] font-bold text-white/40 mt-3">
                {tasksDonePercent >= 100 ? 'All tasks done today!' : `${totalTasks - tasksDoneToday} task(s) left today`}
              </p>
            </div>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[#121214] border border-white/5 rounded-3xl p-5 md:p-6 pb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading font-black text-white text-xl">Today's Plan</h3>
          <button className="flex items-center gap-1 text-[11px] font-bold text-white/60 hover:text-white transition-colors" onClick={() => onNavigate?.('calendar')}>
            View Calendar <ArrowRight size={12} />
          </button>
        </div>

        <div className="space-y-4">
          {tasks.map((task) => {
            const visuals = getTaskVisuals(task.type);
            const Icon = visuals.icon;
            const todayLog = todaysLogs.find((l) => l.taskId && l.taskId._id === task._id);
            const isLogging = loggingTaskId === task._id;

            return (
              <div key={task._id} className={`flex bg-black/40 border border-white/5 rounded-[20px] overflow-hidden ${visuals.border} border-l-[3px]`}>
                <div className="p-4 md:p-5 flex gap-4 w-full">
                  <div className={`w-12 h-12 rounded-2xl ${visuals.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={20} className={visuals.color} />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-sm md:text-base font-bold text-white truncate pr-2">{task.title}</h4>
                      {todayLog && (
                        <span className="text-[10px] font-bold text-white/40 whitespace-nowrap">{todayLog.completedCount} logged</span>
                      )}
                    </div>

                    <p className="text-[11px] text-white/50 mb-3 line-clamp-2">
                      <span className="capitalize">{task.type.replace('_', ' ')}</span>
                      {task.type !== 'break_day' && <> • Target {task.targetCount}</>}
                    </p>

                    {isLogging ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          value={count}
                          onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                          className="w-16 bg-black/60 border border-white/10 rounded-lg text-white text-xs px-2 py-1.5"
                        />
                        <button onClick={() => submitLog(task._id, count)} className="px-3 py-1.5 bg-[#a3c4b6] text-black rounded-lg text-[10px] font-bold flex items-center gap-1">
                          <Check size={12} /> Confirm
                        </button>
                        <button onClick={() => setLoggingTaskId(null)} className="px-3 py-1.5 bg-transparent border border-white/10 text-white/60 rounded-lg text-[10px] font-bold flex items-center gap-1">
                          <X size={12} /> Cancel
                        </button>
                      </div>
                    ) : task.type === 'avoid' ? (
                      <div className="flex gap-2">
                        <button
                          className="px-5 py-1.5 bg-[#a3c4b6] text-black rounded-lg text-[10px] font-bold transition-transform hover:scale-105"
                          onClick={() => showToast?.('Marked safe for today')}
                        >
                          Still Safe
                        </button>
                        <button
                          className="px-4 py-1.5 bg-transparent border border-white/10 hover:border-focus-red hover:text-focus-red text-white rounded-lg text-[10px] font-bold transition-colors"
                          onClick={() => submitLog(task._id, 1)}
                        >
                          Slipped Up
                        </button>
                      </div>
                    ) : task.type === 'break_day' ? (
                      <span className="inline-block px-4 py-1.5 bg-white/5 text-white/50 rounded-lg text-[10px] font-bold">Rest day — no pressure</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          className="px-6 py-1.5 bg-[#a3c4b6] text-black rounded-lg text-[10px] font-bold transition-transform hover:scale-105"
                          onClick={() => { setLoggingTaskId(task._id); setCount(todayLog?.completedCount || task.targetCount); }}
                        >
                          Log
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {tasks.length === 0 && (
            <div className="p-8 text-center text-white/40 text-sm">No tasks scheduled for today.</div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Home;
