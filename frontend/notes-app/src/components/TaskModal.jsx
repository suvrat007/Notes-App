import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const TaskModal = ({ onClose, refreshData, showToast }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('daily');
  const [targetCount, setTargetCount] = useState(1);
  const [baseReward, setBaseReward] = useState(10);
  const [penaltyIntensity, setPenaltyIntensity] = useState(1);
  const [targetDate, setTargetDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/tasks', {
        title, type, targetCount, baseReward, penaltyIntensity,
        targetDate: type === 'occasional' ? targetDate : undefined,
      });
      refreshData();
      showToast?.('Task created');
      onClose();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not create task', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ease: 'easeOut' }}
        className="bg-[#16191e] border border-white/10 rounded-2xl p-7 w-full max-w-[420px] relative"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="font-heading font-bold text-lg text-white mb-6">CREATE NEW TASK</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Task Name</Label>
            <Input 
              type="text" 
              className="bg-[#0d0f12] border-white/10 text-white placeholder:text-white/30 h-11"
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              required 
              placeholder="e.g. Study, Don't eat junk food..." 
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Task Type</Label>
            <select 
              className="w-full bg-[#0d0f12] border border-white/10 text-white h-11 rounded-md px-3 text-sm focus:outline-none focus:border-focus-green"
              value={type} 
              onChange={(e) => setType(e.target.value)}
            >
              <option value="daily">Daily Habit</option>
              <option value="occasional">Occasional Task</option>
              <option value="avoid">Avoid (Negative Task)</option>
              <option value="break_day">Break Day (No Pressure)</option>
            </select>
          </div>

          {type === 'occasional' && (
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Scheduled Date</Label>
              <Input 
                type="date" 
                className="bg-[#0d0f12] border-white/10 text-white h-11"
                value={targetDate} 
                onChange={(e) => setTargetDate(e.target.value)} 
                required 
              />
            </div>
          )}

          {type !== 'break_day' && (
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Target Count</Label>
                <Input 
                  type="number" 
                  className="bg-[#0d0f12] border-white/10 text-white h-11" 
                  min="1" 
                  value={targetCount} 
                  onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)} 
                  required 
                />
              </div>

              {type !== 'avoid' ? (
                <div className="flex-1 space-y-2">
                  <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Stars Reward</Label>
                  <Input 
                    type="number" 
                    className="bg-[#0d0f12] border-white/10 text-white h-11" 
                    min="1" 
                    value={baseReward} 
                    onChange={(e) => setBaseReward(parseInt(e.target.value) || 1)} 
                    required 
                  />
                </div>
              ) : (
                <div className="flex-1 space-y-2">
                  <Label className="text-[10px] font-bold text-focus-red tracking-widest uppercase">Penalty / slip</Label>
                  <Input 
                    type="number" 
                    className="bg-[#0d0f12] border-white/10 text-white h-11 focus:border-focus-red" 
                    min="1" 
                    value={penaltyIntensity} 
                    onChange={(e) => setPenaltyIntensity(parseInt(e.target.value) || 1)} 
                    required 
                  />
                </div>
              )}
            </div>
          )}

          <Button 
            type="submit" 
            disabled={submitting} 
            className="w-full h-12 bg-focus-green hover:bg-focus-green-soft text-white font-bold tracking-widest text-sm mt-2 transition-colors"
          >
            {submitting ? 'CREATING...' : 'CREATE TASK'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default TaskModal;
