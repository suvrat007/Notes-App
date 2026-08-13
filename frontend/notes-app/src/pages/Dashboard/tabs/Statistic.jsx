import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, BarChart, Bar, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, subDays, subMonths, isAfter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Award, Flame, CalendarCheck } from 'lucide-react';

const RANGES = [
  { key: '7d', label: 'Week', fn: () => subDays(new Date(), 7) },
  { key: '1m', label: 'Month', fn: () => subMonths(new Date(), 1) },
  { key: '3m', label: '3 Months', fn: () => subMonths(new Date(), 3) },
];

const chartConfig = {
  stars: { label: "Stars", color: "#ffffff" },
};
const barConfig = {
  done: { label: "Completed", color: "#ffffff" },
  target: { label: "Target", color: "#333333" },
};

const Statistic = ({ logs, tasks }) => {
  const [range, setRange] = useState('7d');
  const cutoff = useMemo(() => RANGES.find((r) => r.key === range).fn(), [range]);

  const filteredLogs = useMemo(
    () => logs.filter((l) => isAfter(new Date(l.date), cutoff)),
    [logs, cutoff]
  );

  const lineData = useMemo(() => {
    const byDate = filteredLogs.reduce((acc, log) => {
      const dateStr = format(new Date(log.date), 'MMM dd');
      if (!acc[dateStr]) acc[dateStr] = { date: dateStr, stars: 0, hasPenalty: false };
      acc[dateStr].stars += log.starsEarned;
      if (log.starsEarned < 0) acc[dateStr].hasPenalty = true;
      return acc;
    }, {});
    return Object.values(byDate).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [filteredLogs]);

  const barData = useMemo(
    () =>
      tasks
        .filter((t) => t.type !== 'break_day')
        .map((task) => {
          const taskLogs = filteredLogs.filter((l) => l.taskId && l.taskId._id === task._id);
          const done = taskLogs.reduce((sum, l) => sum + l.completedCount, 0);
          const isAvoid = task.type === 'avoid';
          return {
            name: task.title.length > 8 ? `${task.title.slice(0, 7)}…` : task.title,
            done,
            // Avoid tasks don't have a meaningful "target" (the goal is zero).
            target: isAvoid ? null : task.targetCount * Math.max(1, taskLogs.length),
            isAvoid,
          };
        }),
    [tasks, filteredLogs]
  );

  const daysInRange = Math.max(1, Math.round((Date.now() - cutoff.getTime()) / 86400000));

  const weeklyAverage = useMemo(() => {
    const goalLogs = filteredLogs.filter((l) => l.taskId && (l.taskId.type === 'daily' || l.taskId.type === 'occasional'));
    if (goalLogs.length === 0) return 0;
    const ratios = goalLogs.map((l) => Math.min(l.completedCount / (l.taskId.targetCount || 1), 1));
    return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100);
  }, [filteredLogs]);

  const avoidanceSuccess = useMemo(() => {
    const avoidTasks = tasks.filter((t) => t.type === 'avoid');
    if (avoidTasks.length === 0) return null;
    const slipDays = new Set(
      filteredLogs.filter((l) => l.taskId?.type === 'avoid' && l.completedCount > 0).map((l) => format(new Date(l.date), 'yyyy-MM-dd'))
    ).size;
    return Math.max(0, Math.round(((daysInRange - slipDays) / daysInRange) * 100));
  }, [tasks, filteredLogs, daysInRange]);

  const personalBest = useMemo(() => {
    const byDate = logs.reduce((acc, l) => {
      const key = format(new Date(l.date), 'yyyy-MM-dd');
      acc[key] = (acc[key] || 0) + l.starsEarned;
      return acc;
    }, {});
    const values = Object.values(byDate);
    return values.length ? Math.max(...values) : 0;
  }, [logs]);

  const currentStreak = useMemo(() => {
    const activeDays = new Set(
      logs.filter((l) => l.completedCount > 0 && l.starsEarned > 0).map((l) => new Date(l.date).toLocaleDateString('en-CA'))
    );
    let streak = 0;
    const cursor = new Date();
    while (activeDays.has(cursor.toLocaleDateString('en-CA'))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [logs]);

  const consistency = useMemo(() => {
    const activeDays = new Set(filteredLogs.map((l) => format(new Date(l.date), 'yyyy-MM-dd'))).size;
    return Math.round((activeDays / daysInRange) * 100);
  }, [filteredLogs, daysInRange]);
  const consistencyLabel = consistency >= 70 ? 'High' : consistency >= 40 ? 'Medium' : 'Low';

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="hidden md:flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-white">Statistics</h1>
          <p className="text-sm text-white/40 mt-1">Your star trend over time</p>
        </div>
      </header>

      {/* Mobile only header */}
      <div className="md:hidden pt-2 mb-4">
        <h1 className="text-xl font-bold font-heading text-white">Statistic</h1>
        <p className="text-xs text-white/40 mt-1">Your star trend over time</p>
      </div>

      <div className="flex bg-[#121214] border border-white/5 p-1 rounded-xl w-full md:w-fit mb-4">
        {RANGES.map((r) => (
          <button 
            key={r.key} 
            className={`flex-1 md:flex-none px-6 py-2 text-xs font-semibold rounded-lg transition-colors ${range === r.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Star Progression */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="bg-[#121214] border-white/5 h-full rounded-3xl p-2 pb-0">
            <CardHeader className="flex flex-row items-start justify-between pb-0 pt-4 px-4">
              <div>
                <CardTitle className="text-lg font-bold text-white leading-tight">Star<br/>Progression</CardTitle>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-bold text-white/60 flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-white"></div> Stars</span>
                <span className="text-[9px] font-bold text-white/40 flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full border border-white/40"></div> penalty day</span>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="h-[200px] w-full mt-4">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <AreaChart data={lineData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillStars" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.02)" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 'bold' }}
                      dy={10}
                    />
                    <ChartTooltip cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="stars"
                      stroke="#ffffff"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#fillStars)"
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (payload.hasPenalty) {
                          return <circle cx={cx} cy={cy} r={3} fill="#121214" stroke="#ffffff" strokeWidth={1.5} key={payload.date} />;
                        }
                        return <circle cx={cx} cy={cy} r={3} fill="#ffffff" key={payload.date} />;
                      }}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Completed vs Target */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-[#121214] border-white/5 h-full rounded-3xl p-6">
            <CardHeader className="p-0 pb-6">
              <CardTitle className="text-base font-bold text-white">Completed vs Target</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[180px] w-full mb-6">
                <ChartContainer config={barConfig} className="h-full w-full">
                  <BarChart data={barData} barGap={0} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold' }}
                      dy={10}
                    />
                    <ChartTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTooltipContent />} />
                    <Bar dataKey="done" radius={[2, 2, 0, 0]} maxBarSize={16}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.isAvoid ? 'rgba(255,255,255,0.2)' : '#ffffff'} />
                      ))}
                    </Bar>
                    <Bar dataKey="target" fill="rgba(255,255,255,0.1)" radius={[2, 2, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ChartContainer>
              </div>
              <div className="space-y-3 border-t border-white/5 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white/60">Weekly Average</span>
                  <span className="text-lg font-heading font-black text-white">{weeklyAverage}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white/60">Avoidance Success</span>
                  <span className="text-lg font-heading font-black text-[#5bc0be]">{avoidanceSuccess === null ? '—' : `${avoidanceSuccess}%`}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Personal Best', value: `${personalBest} Stars`, icon: Award, color: 'text-white', bg: 'bg-[#1e2a24]', iconColor: 'text-[#a3c4b6]' },
          { label: 'Current Streak', value: `${currentStreak} Day${currentStreak === 1 ? '' : 's'}`, icon: Flame, color: 'text-white', bg: 'bg-white/5', iconColor: 'text-white/60' },
          { label: 'Consistency', value: `${consistencyLabel} (${consistency}%)`, icon: CalendarCheck, color: 'text-white', bg: 'bg-white/5', iconColor: 'text-white/60' }
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + (i * 0.05) }}>
              <Card className="bg-[#121214] border-white/5 rounded-2xl p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                  <Icon size={20} className={stat.iconColor} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-white/40">{stat.label}</span>
                  <h3 className={`text-base font-bold font-heading ${stat.color}`}>{stat.value}</h3>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Statistic;
