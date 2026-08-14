import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Moon, ClipboardList, CalendarPlus, Check, X } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, isSameMonth, isToday, format,
} from 'date-fns';
import api from '../../../utils/api';
import TaskModal from '../../../components/TaskModal';
import { Switch } from '@/components/ui/switch';

const toKey = (d) => d.toLocaleDateString('en-CA');

const Calendar = ({ tasks, logs, refreshData, showToast }) => {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState(toKey(new Date()));
  const [breakDays, setBreakDays] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loggingTaskId, setLoggingTaskId] = useState(null);
  const [count, setCount] = useState(1);

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const loadBreakDays = async () => {
    try {
      const { data } = await api.get('/break-days', {
        params: { startDate: gridStart.toISOString(), endDate: gridEnd.toISOString() },
      });
      setBreakDays(new Set(data.breakDays.map((b) => toKey(new Date(b.date)))));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadBreakDays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const activeDays = useMemo(() => new Set(logs.map((l) => toKey(new Date(l.date)))), [logs]);

  const toggleBreakDay = async () => {
    try {
      const { data } = await api.post('/break-days', { date: selected });
      setBreakDays((prev) => {
        const next = new Set(prev);
        if (data.isBreakDay) next.add(selected); else next.delete(selected);
        return next;
      });
      showToast?.(data.isBreakDay ? 'Marked as a break day' : 'Break day removed');
    } catch {
      showToast?.('Could not update break day', 'error');
    }
  };

  const selectedDateObj = new Date(`${selected}T00:00:00`);
  const selectedLabelMonth = format(selectedDateObj, 'MMMM d');
  const selectedLabelDay = format(selectedDateObj, 'EEEE');
  const isSelectedBreakDay = breakDays.has(selected);

  const logFor = (taskId) => logs.find((l) =>
    String(l.refId ?? l.taskId?._id ?? l.taskId) === String(taskId)
    && toKey(new Date(l.date)) === selected);

  /*
   * Only the SELECTED day's tasks.
   *
   * This used to hand back every task the user owns, so picking the 15th
   * showed the 14th's list under a heading that said the 15th — a day view
   * that ignores the day. Daily tasks are the one exception: they are due
   * every day by definition.
   */
  const tasksForSelected = tasks.filter((t) => {
    if (t.type === 'daily') return true;
    if (!t.targetDate) return false;
    const start = toKey(new Date(t.targetDate));

    /*
     * A task with a deadline belongs to every day between its start and that
     * date, so picking Wednesday shows what is still owed by Friday rather
     * than only what happens to be dated Wednesday. Once it is finished it
     * leaves the run, staying only on the day it was scheduled.
     */
    if (t.dueDate) {
      const due = toKey(new Date(t.dueDate));
      if (selected >= start && selected <= due) return !t.done || start === selected;
    }
    return start === selected;
  });

  const submitLog = async (taskId, completedCount) => {
    try {
      await api.post('/logs', { taskId, date: selected, completedCount });
      setLoggingTaskId(null);
      setCount(1);
      refreshData();
      showToast?.('Progress logged');
    } catch (e) {
      showToast?.(e.response?.data?.message || 'Could not log progress', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4 md:space-y-5">
      <header className="hidden md:block">
        <h1 className="text-2xl font-bold font-heading text-white">CALENDAR <span className="text-white/30 font-normal">| Plan and track any day</span></h1>
      </header>

      {/* Mobile only header */}
      <div className="md:hidden pt-2">
        <h1 className="text-xl font-bold font-heading text-[#c0b3a5]">Calendar</h1>
        <p className="text-xs text-white/40 mt-1">Plan and track any day</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-5 items-stretch w-full lg:flex-1 lg:min-h-0">
        {/* Left Calendar Grid */}
        <motion.div 
          className="w-full lg:w-[58%] xl:w-[62%] shrink-0 bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6 lg:h-full lg:flex lg:flex-col lg:min-h-0"
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-4 shrink-0">
            <span className="font-heading text-sm text-white flex items-center gap-2">
              {format(month, 'MMMM yyyy')} <CalendarPlus size={14} className="text-white/40" />
            </span>
            <div className="flex gap-2">
              <button className="w-8 h-8 rounded bg-black/40 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors" onClick={() => setMonth((m) => subMonths(m, 1))}>
                <ChevronLeft size={16} />
              </button>
              <button className="w-8 h-8 rounded bg-black/40 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-1.5 shrink-0 mb-1.5">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => (
              <div key={i} className="text-center text-[9px] md:text-[10px] font-bold text-white/40">{d}</div>
            ))}
          </div>

          <div
            className="grid grid-cols-7 gap-1 md:gap-1.5 lg:flex-1 lg:min-h-0"
            style={{ gridAutoRows: 'minmax(0, 1fr)' }}
          >
            {days.map((day) => {
              const key = toKey(day);
              const isSelected = key === selected;
              const isBreak = breakDays.has(key);
              const hasActivity = activeDays.has(key);
              const isCurrentMonth = isSameMonth(day, month);
              
              // Shift the days array to start on Monday for calculation if needed,
              // but date-fns startOfWeek handles locale. We assume standard display.
              
              return (
                <button 
                  key={key} 
                  className={`
                    aspect-square lg:aspect-auto lg:h-full rounded-lg flex flex-col items-center justify-center relative transition-all duration-200 border border-transparent
                    ${!isCurrentMonth ? 'opacity-30' : 'bg-[#1a1a1c]'}
                    ${isSelected ? 'bg-white text-black font-bold outline outline-2 outline-offset-[-2px] outline-white z-10' : 'text-white/80 hover:bg-white/[0.06]'}
                    ${isBreak && !isSelected ? 'text-[#c0b3a5]' : ''}
                  `}
                  onClick={() => setSelected(key)}
                >
                  <span className="text-xs md:text-sm font-medium z-10">{day.getDate()}</span>
                  <div className="flex gap-1 mt-1 z-10">
                    {hasActivity && <div className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-white/60'}`} />}
                    {isBreak && !isSelected && <Moon size={8} className="text-[#c0b3a5] absolute bottom-2" />}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Right Day Panel */}
        <motion.div 
          className="w-full lg:flex-1 lg:min-h-0 lg:overflow-y-auto bg-[#16191e] border border-white/5 rounded-3xl p-5 md:p-6"
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
        >
          {/* Day Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-base font-bold text-white">{selectedLabelMonth}</h2>
              <p className="text-sm text-white/60">{selectedLabelDay}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <ClipboardList size={18} className="text-white/40" />
            </div>
          </div>
          
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/5">
            <span className="text-sm font-bold text-white/80 flex items-center gap-2">
              <Moon size={16} className="text-white/40" /> Mark Break Day
            </span>
            <Switch checked={isSelectedBreakDay} onCheckedChange={toggleBreakDay} className="data-[state=checked]:bg-[#c0b3a5]" />
          </div>

          {/* Schedule Timeline */}
          <div>
            <h3 className="text-[11px] font-bold text-white/60 tracking-widest uppercase mb-6">TODAY'S FOCUS</h3>
            <div className="relative pl-[14px] space-y-6">
              {/* Vertical line connecting timeline items */}
              <div className="absolute left-[3px] top-2 bottom-4 w-px bg-white/10 z-0"></div>

              {tasksForSelected.map((task) => {
                const log = logFor(task._id);
                const status = task.type === 'avoid'
                  ? (log?.completedCount > 0 ? 'slipped' : '')
                  : (log?.completedCount > 0 ? 'done' : '');
                const isLogging = loggingTaskId === task._id;

                return (
                  <div key={task._id} className="relative z-10 flex items-start gap-4">
                    <div className={`absolute -left-[14px] top-1.5 w-2 h-2 rounded-full ${status ? 'bg-[#c0b3a5]' : 'bg-white/40'}`}></div>

                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-white mb-0.5">{task.title}</h4>
                      <p className="text-[11px] text-white/40 truncate mb-2">
                        <span className="capitalize">{task.type.replace('_', ' ')}</span>
                        {log ? ` • ${log.completedCount} logged` : task.type !== 'break_day' ? ` • Target ${task.targetCount}` : ''}
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
                          <button onClick={() => submitLog(task._id, count)} className="px-3 py-1.5 bg-[#c0b3a5] text-black rounded-lg text-[10px] font-bold flex items-center gap-1">
                            <Check size={12} />
                          </button>
                          <button onClick={() => setLoggingTaskId(null)} className="px-3 py-1.5 bg-transparent border border-white/10 text-white/60 rounded-lg text-[10px] font-bold flex items-center gap-1">
                            <X size={12} />
                          </button>
                        </div>
                      ) : task.type === 'break_day' ? (
                        <span className="inline-block px-3 py-1 bg-white/5 text-white/50 rounded-md text-[10px] font-bold">Rest day</span>
                      ) : task.type === 'avoid' ? (
                        <button
                          className={`px-3 py-1 rounded-md text-[10px] font-bold ${status === 'slipped' ? 'bg-focus-red/20 text-focus-red' : 'bg-transparent border border-white/10 text-white/60 hover:border-focus-red hover:text-focus-red'}`}
                          onClick={() => submitLog(task._id, 1)}
                        >
                          {status === 'slipped' ? 'Slipped Up' : 'Mark Slip-up'}
                        </button>
                      ) : (
                        <button
                          className={`px-3 py-1 rounded-md text-[10px] font-bold ${status === 'done' ? 'bg-[#c0b3a5]/20 text-[#c0b3a5]' : 'bg-transparent border border-white/10 text-white/60 hover:border-white/30 hover:text-white'}`}
                          onClick={() => { setLoggingTaskId(task._id); setCount(log?.completedCount || task.targetCount); }}
                        >
                          {status === 'done' ? 'Logged' : 'Log'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {tasksForSelected.length === 0 && (
                <p className="text-sm text-white/40">No tasks scheduled.</p>
              )}

            </div>
            
            {/* One button, one action. The icon beside it did exactly the same
                thing, which only makes people wonder what the difference is. */}
            <div className="mt-8">
              <button
                type="button"
                className="w-full h-12 rounded-xl bg-[#c0b3a5] text-black font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#cfc4b8] transition-colors"
                onClick={() => setIsModalOpen(true)}
              >
                <CalendarPlus size={16} /> Add a task on this day
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {isModalOpen && <TaskModal onClose={() => setIsModalOpen(false)} refreshData={refreshData} showToast={showToast} />}
    </div>
  );
};

export default Calendar;
