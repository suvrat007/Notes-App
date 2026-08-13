import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Plus } from 'lucide-react';
import api from '../utils/api';

// Renders one day's tasks as a connected timeline: each row has a status circle
// (empty ring = pending, filled = done/slipped) that logs progress for that
// specific date when clicked — the same /logs endpoint Home uses for "today".
const DayTimeline = ({ tasks, logs, date, refreshData, showToast, onAddTask }) => {
  const [loggingTaskId, setLoggingTaskId] = useState(null);
  const [count, setCount] = useState(1);

  const logFor = (taskId) => logs.find((l) => l.taskId && l.taskId._id === taskId && new Date(l.date).toLocaleDateString('en-CA') === date);

  const submitLog = async (taskId, completedCount) => {
    try {
      await api.post('/logs', { taskId, date, completedCount });
      setLoggingTaskId(null);
      setCount(1);
      refreshData();
      showToast?.('Progress logged');
    } catch (e) {
      showToast?.(e.response?.data?.message || 'Could not log progress', 'error');
    }
  };

  const handleClick = (task) => {
    if (task.type === 'avoid') {
      submitLog(task._id, 1);
    } else {
      setLoggingTaskId(task._id);
      setCount(logFor(task._id)?.completedCount || 1);
    }
  };

  if (tasks.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '30px 0', fontSize: '0.9rem' }}>
        No tasks yet.
      </p>
    );
  }

  return (
    <div className="timeline">
      {tasks.map((task, i) => {
        const log = logFor(task._id);
        const status = task.type === 'avoid'
          ? (log?.completedCount > 0 ? 'slipped' : '')
          : (log?.completedCount > 0 ? 'done' : '');

        return (
          <motion.div key={task._id} className="timeline-row" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 600 }}>{task.title}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {task.type.replace('_', ' ')}{log ? ` · ${log.completedCount} logged` : ''}
              </p>
            </div>

            {loggingTaskId === task._id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                  className="input-base"
                  style={{ width: 56, padding: '6px 8px', fontSize: '0.85rem' }}
                />
                <button onClick={() => submitLog(task._id, count)} className="icon-btn" style={{ width: 34, height: 34 }}>
                  <Check size={16} />
                </button>
                <button onClick={() => setLoggingTaskId(null)} className="icon-btn" style={{ width: 34, height: 34 }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button className={`timeline-status ${status}`} onClick={() => handleClick(task)} aria-label={`Log ${task.title}`}>
                {status === 'done' && <Check size={15} />}
                {status === 'slipped' && <X size={15} />}
              </button>
            )}
          </motion.div>
        );
      })}

      {onAddTask && (
        <button className="timeline-add-row" onClick={onAddTask}>
          <Plus size={16} /> Add a new task
        </button>
      )}
    </div>
  );
};

export default DayTimeline;
