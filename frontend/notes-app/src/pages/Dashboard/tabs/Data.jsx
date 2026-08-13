import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Terminal, Star, Download, Info } from 'lucide-react';
import { format } from 'date-fns';

const TYPE_LABEL = { daily: 'Daily', occasional: 'Occasional', avoid: 'Avoid', break_day: 'Break Day' };
const TYPE_COLOR = { daily: '#ffffff', occasional: '#5bc0be', avoid: '#e87070', break_day: '#a3c4b6' };

const SystemAnalytics = ({ logs, breakdown }) => {
  const efficiencyData = useMemo(() => {
    const byDate = {};
    logs.forEach((log) => {
      const key = format(new Date(log.date), 'MMM dd');
      byDate[key] = (byDate[key] || 0) + log.starsEarned;
    });
    return Object.entries(byDate)
      .map(([time, value]) => ({ time, value }))
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .slice(-10);
  }, [logs]);

  const recentActivity = useMemo(
    () =>
      [...logs]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 4)
        .map((l) => ({
          date: format(new Date(l.date), 'MMM dd'),
          title: l.taskId?.title ?? 'Unknown task',
          stars: l.starsEarned,
        })),
    [logs]
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-heading text-white tracking-widest uppercase">System Analytics</h1>
        <p className="text-xs text-focus-teal font-mono tracking-widest mt-1">LIVE // FROM YOUR LOGGED ACTIVITY</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div className="md:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="bg-[#121214] border-white/5 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Star Trend (recent days)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                {efficiencyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={efficiencyData}>
                      <defs>
                        <linearGradient id="effFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#5bc0be" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#5bc0be" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#121214', border: '1px solid rgba(255,255,255,0.1)' }} itemStyle={{ color: '#5bc0be' }} />
                      <Area type="monotone" dataKey="value" stroke="#5bc0be" fill="url(#effFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-white/30 text-xs">No activity logged yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-[#121214] border-white/5 h-full flex flex-col">
            <CardHeader className="pb-0">
              <CardTitle className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Category Mix</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center pt-2">
              <div className="h-[140px] w-full relative flex items-center justify-center">
                {breakdown.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={breakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                          {breakdown.map((entry) => <Cell key={entry.type} fill={TYPE_COLOR[entry.type]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-heading font-bold text-white">{breakdown[0]?.pct ?? 0}%</span>
                    </div>
                  </>
                ) : (
                  <div className="text-white/30 text-xs">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-[#0a0a0c] border-white/10 h-full overflow-hidden">
            <CardHeader className="bg-white/5 py-3 border-b border-white/5 flex flex-row items-center gap-2">
              <Terminal size={14} className="text-white/40" />
              <CardTitle className="text-[10px] font-mono text-white/60 tracking-widest">RECENT_ACTIVITY_LOG</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="font-mono text-[10px] text-focus-teal/80 space-y-1.5">
                {recentActivity.length > 0 ? (
                  recentActivity.map((a, i) => (
                    <p key={i}>
                      &gt; {a.date} — {a.title} {a.stars >= 0 ? `+${a.stars}` : a.stars} stars
                    </p>
                  ))
                ) : (
                  <p>&gt; AWAITING FIRST LOGGED TASK_</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
};

const DataBreakdown = ({ totalEarned, totalLost, breakdown, onDownload }) => {
  const netStars = totalEarned - totalLost;
  const total = totalEarned + totalLost || 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold font-heading text-white">DATA</h1>
        <p className="text-sm text-white/40 mt-1 italic">Where your stars come from</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-[#121214] border-white/5 rounded-3xl p-6">
            <div className="flex justify-between items-start mb-6">
              <span className="text-[11px] font-bold tracking-widest text-white/60 uppercase">Stars Earned</span>
              <Star size={16} className="text-white/80" fill="currentColor" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-heading font-black text-white">{totalEarned.toLocaleString()}</span>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="bg-[#121214] border-white/5 rounded-3xl p-6">
            <div className="flex justify-between items-start mb-6">
              <span className="text-[11px] font-bold tracking-widest text-white/60 uppercase">Stars Lost</span>
              <Star size={16} className="text-white/20" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-heading font-black text-white/40">{totalLost.toLocaleString()}</span>
            </div>
          </Card>
        </motion.div>

        <motion.div className="md:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-[#121214] border-white/5 rounded-2xl p-4">
            <span className="text-[10px] font-bold tracking-widest text-white/60 uppercase block mb-1">Completion Rate</span>
            <span className="text-lg font-mono text-white/80">{total > 0 ? Math.round((totalEarned / total) * 100) : 0}%</span>
          </Card>
        </motion.div>

        <motion.div className="md:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="bg-[#121214] border-white/5 rounded-3xl p-6 pt-5">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-medium text-white/80">Star Activity Breakdown</h3>
              <Info size={16} className="text-white/40" />
            </div>

            {breakdown.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-10">No activity logged yet</p>
            ) : (
              <>
                <div className="relative h-[220px] w-full flex justify-center items-center mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ name: 'Earned', value: totalEarned || 0.0001 }, { name: 'Lost', value: totalLost }]}
                        cx="50%" cy="50%"
                        startAngle={220} endAngle={-40}
                        innerRadius={70} outerRadius={90}
                        paddingAngle={0}
                        dataKey="value" stroke="none" cornerRadius={45}
                      >
                        <Cell fill="#ffffff" />
                        <Cell fill="rgba(255,255,255,0.08)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                    <span className="text-4xl font-heading font-black text-white">{netStars}</span>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-white/40">Net Stars</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-6 gap-x-4 pt-6 border-t border-white/10 relative">
                  <div className="absolute top-6 bottom-0 left-1/2 w-px bg-white/10 -translate-x-1/2"></div>
                  {breakdown.map((b, i) => (
                    <div key={b.type} className={i % 2 === 1 ? 'pl-4' : ''}>
                      <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 block mb-1">{TYPE_LABEL[b.type]}</span>
                      <span className="text-lg font-heading text-white" style={{ color: TYPE_COLOR[b.type] }}>{b.value}</span>
                      <span className="text-xs text-white/30 ml-1">({b.pct}%)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="w-full h-14 bg-white text-black font-bold text-xs rounded-full flex items-center justify-center gap-2 hover:bg-white/90 transition-colors md:col-span-2 mt-2"
          onClick={onDownload}
        >
          <Download size={16} /> DOWNLOAD MY DATA
        </motion.button>

        <p className="text-center text-[9px] font-bold tracking-widest uppercase text-white/30 md:col-span-2 mt-2">
          Export your full log history as a CSV file.
        </p>
      </div>
    </motion.div>
  );
};

const Data = ({ logs }) => {
  const [view, setView] = useState('breakdown');

  const totalEarned = useMemo(() => logs.filter((l) => l.starsEarned > 0).reduce((s, l) => s + l.starsEarned, 0), [logs]);
  const totalLost = useMemo(() => logs.filter((l) => l.starsEarned < 0).reduce((s, l) => s + Math.abs(l.starsEarned), 0), [logs]);

  const breakdown = useMemo(() => {
    const totals = {};
    logs.forEach((log) => {
      const type = log.taskId?.type;
      if (!type) return;
      totals[type] = (totals[type] || 0) + Math.abs(log.starsEarned);
    });
    const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(totals)
      .map(([type, value]) => ({ type, value, pct: Math.round((value / grand) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [logs]);

  const downloadCsv = () => {
    const rows = [['date', 'task', 'type', 'completedCount', 'starsEarned']];
    logs.forEach((l) => rows.push([
      new Date(l.date).toLocaleDateString('en-CA'),
      l.taskId?.title ?? '',
      l.taskId?.type ?? '',
      l.completedCount,
      l.starsEarned,
    ]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'focus-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex bg-[#121214] border border-white/5 p-1 rounded-xl w-full mb-6">
        <button
          className={`flex-1 px-4 py-2 text-[11px] font-bold tracking-wide uppercase rounded-lg transition-colors ${view === 'breakdown' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
          onClick={() => setView('breakdown')}
        >
          Data Breakdown
        </button>
        <button
          className={`flex-1 px-4 py-2 text-[11px] font-bold tracking-wide uppercase rounded-lg transition-colors ${view === 'analytics' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
          onClick={() => setView('analytics')}
        >
          System Analytics
        </button>
      </div>

      <AnimatePresence mode="wait">
        {view === 'breakdown' ? (
          <DataBreakdown key="breakdown" totalEarned={totalEarned} totalLost={totalLost} breakdown={breakdown} onDownload={downloadCsv} />
        ) : (
          <SystemAnalytics key="analytics" logs={logs} breakdown={breakdown} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Data;
