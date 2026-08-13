import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Repeat, CalendarClock, ShieldAlert, Coffee } from 'lucide-react';
import api from '../utils/api';

const TYPE_META = {
  daily: { icon: Repeat, color: 'var(--accent-gold)' },
  occasional: { icon: CalendarClock, color: 'var(--accent-gold)' },
  avoid: { icon: ShieldAlert, color: 'var(--accent-red)' },
  break_day: { icon: Coffee, color: 'var(--accent-green)' },
};

const todayKey = () => new Date().toLocaleDateString('en-CA'); // yyyy-MM-dd, local calendar day

const TaskList = ({ tasks, refreshData, showToast }) => {
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

  const handleLog = (task) => {
    if (task.type === 'avoid') {
      submitLog(task._id, 1);
    } else {
      setLoggingTaskId(task._id);
    }
  };

  if (tasks.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '30px 0', fontSize: '0.9rem' }}>
        No tasks yet. Tap + to create your first one.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tasks.map((task, i) => {
        const meta = TYPE_META[task.type] ?? TYPE_META.daily;
        const Icon = meta.icon;
        return (
          <motion.div
            key={task._id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div className="icon-chip">
              <Icon size={18} color={meta.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {task.title}
              </p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {task.type.replace('_', ' ')}{task.type !== 'break_day' ? ` · Target ${task.targetCount}` : ''}
              </p>
            </div>

            {loggingTaskId === task._id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="1"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  className="input-base"
                  style={{ width: 56, padding: '6px 8px', fontSize: '0.85rem' }}
                />
                <button onClick={() => submitLog(task._id, count)} className="icon-btn" style={{ width: 34, height: 34 }}>
                  <Check size={16} color="var(--accent-green)" />
                </button>
                <button onClick={() => setLoggingTaskId(null)} className="icon-btn" style={{ width: 34, height: 34 }}>
                  <X size={16} color="var(--accent-red)" />
                </button>
              </div>
            ) : task.type === 'break_day' ? (
              <span className="delta-badge positive">Rest</span>
            ) : (
              <button
                onClick={() => handleLog(task)}
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '7px 14px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background: task.type === 'avoid' ? 'var(--accent-red-soft)' : 'var(--accent-gold-soft)',
                  color: task.type === 'avoid' ? 'var(--accent-red)' : 'var(--accent-gold)',
                }}
              >
                {task.type === 'avoid' ? 'Slipped Up' : 'Log'}
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};

export default TaskList;
