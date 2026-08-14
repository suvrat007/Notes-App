import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Select from './Select';

/**
 * Change what a task ASKS OF YOU, after the fact.
 *
 * "Read 2 PDFs" turns out to be 5, or Friday turns out to be Monday. Progress
 * already made is kept — raising the target from 2 to 5 with one done leaves
 * you at 1 of 5, not back at zero. Lowering it below what is already done
 * settles at the new top rather than leaving a task that can never finish.
 */
const TaskEditModal = ({ task, onClose, refreshData, showToast }) => {
  const [title, setTitle] = useState(task.title);
  const [targetCount, setTargetCount] = useState(task.targetCount ?? 1);
  const [baseReward, setBaseReward] = useState(task.baseReward ?? 10);
  const [targetDate, setTargetDate] = useState(task.date ?? '');
  const [dueTime, setDueTime] = useState(task.dueTime ?? '');
  const [dueDate, setDueDate] = useState(task.dueKey ?? '');
  const [repCadence, setRepCadence] = useState(task.repCadence ?? 'anytime');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const target = Math.max(1, Math.round(Number(targetCount) || 1));
    try {
      await api.patch(`/tasks/${task._id}`, {
        title: title.trim(),
        targetCount: target,
        doneCount: Math.min(task.doneCount ?? 0, target),
        done: (task.doneCount ?? 0) >= target,
        baseReward: Number(baseReward),
        targetDate,
        dueDate: dueDate || null,
        repCadence,
        dueTime: dueTime.trim() || null,
      });
      await refreshData();
      showToast?.(`Updated “${title.trim()}”`);
      onClose();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not save', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#16191e] border border-white/10 rounded-2xl p-7 w-full max-w-[420px] relative max-h-[88vh] overflow-y-auto"
        data-testid="task-edit-modal"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 grid place-items-center text-white/60 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="font-heading font-bold text-lg text-white mb-6">EDIT TASK</h2>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <label className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Name</Label>
            <Input
              type="text" value={title} data-testid="et-name"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
              How many to finish it
            </Label>
            <Input
              type="number" min={1} value={targetCount} data-testid="et-count"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              onChange={(e) => setTargetCount(e.target.value)}
            />
            <span className="block text-[10px] text-white/40">
              {Number(targetCount) > 1
                ? `Done at ${targetCount}. ${task.doneCount ?? 0} already counted.`
                : 'A single tick finishes it.'}
            </span>
          </label>

          <label className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Scheduled date</Label>
            <Input
              type="date" value={targetDate} data-testid="et-date"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </label>

          {/* With a deadline the task shows every day until then, instead of
              only on its scheduled day. */}
          <label className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
              Due by <span className="text-white/30 normal-case tracking-normal">(optional)</span>
            </Label>
            <Input
              type="date" value={dueDate} min={targetDate} data-testid="et-due"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              onChange={(e) => setDueDate(e.target.value)}
            />
            <span className="block text-[10px] text-white/40">
              {dueDate
                ? 'Shows every day until then, or until it is finished.'
                : 'Without one it belongs to its scheduled day alone.'}
            </span>
          </label>

          {Number(targetCount) > 1 && (
            <label className="space-y-2">
              <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                How the {targetCount} are done
              </Label>
              <Select
                testId="et-cadence"
                ariaLabel="How the reps may be done"
                value={repCadence}
                onChange={setRepCadence}
                options={[
                  { value: 'anytime', label: 'Any number in a day' },
                  { value: 'daily', label: 'Once a day, no more' },
                ]}
              />
            </label>
          )}

          <label className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
              Time (optional)
            </Label>
            <Input
              type="time" value={dueTime} data-testid="et-time"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              onChange={(e) => setDueTime(e.target.value)}
            />
          </label>

          <label className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
              Stars when finished
            </Label>
            <Input
              type="number" min={0} value={baseReward} data-testid="et-stars"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              onChange={(e) => setBaseReward(e.target.value)}
            />
          </label>

          <p className="text-[10px] text-white/40 -mt-1">
            Use the D / W / M chips on the row to make it repeat.
          </p>

          <Button
            type="submit"
            disabled={submitting || !title.trim()}
            data-testid="et-save"
            className="w-full h-12 bg-[#c0b3a5] hover:bg-[#cfc4b8] text-black font-bold tracking-widest text-xs rounded-xl"
          >
            {submitting ? 'SAVING...' : 'SAVE CHANGES'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default TaskEditModal;
