import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import Select from './Select';

const PERIODS = [
  { weeks: 1, label: 'Week' },
  { weeks: 2, label: 'Fortnight' },
  { weeks: 4, label: 'Month' },
  { weeks: 12, label: 'Quarter' },
];

/**
 * Create or edit a habit.
 *
 * The two promises people actually make are kept apart on purpose. "20 pushups
 * a day" is a quota that only reads as done at 20. "5 gym sessions a week" is a
 * pace you might hit three times on Monday and never on Tuesday. Collapsing
 * them into one field makes both meaningless.
 */
const HabitModal = ({ habit, onClose, refreshData, showToast }) => {
  const editing = !!habit;
  const [name, setName] = useState(habit?.name ?? '');
  const [polarity, setPolarity] = useState(habit?.polarity ?? 'good');
  const [starsPerRep, setStarsPerRep] = useState(habit?.starsPerRep ?? 10);
  const [dailyTarget, setDailyTarget] = useState(habit?.dailyTarget ?? 0);
  const [targetReps, setTargetReps] = useState(habit?.targetReps ?? 0);
  const [targetPeriodWeeks, setPeriodWeeks] = useState(habit?.targetPeriodWeeks ?? 1);
  const [dailyAllowance, setAllowance] = useState(habit?.dailyAllowance ?? 0);
  const [overagePenalty, setOverage] = useState(habit?.overagePenalty ?? 5);
  const [freeWithinAllowance, setFree] = useState(habit?.freeWithinAllowance ?? false);
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [shortfallPenalty, setShortfall] = useState(habit?.shortfallPenalty ?? 0);
  const [submitting, setSubmitting] = useState(false);

  const isBad = polarity === 'bad';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const body = {
      name: name.trim(),
      starsPerRep: Number(starsPerRep),
      dailyTarget: isBad ? 0 : Number(dailyTarget),
      targetReps: isBad ? 0 : Number(targetReps),
      targetPeriodWeeks: isBad ? 1 : Number(targetPeriodWeeks),
      unit: isBad ? '' : unit.trim(),
      shortfallPenalty: isBad ? 0 : Math.max(0, Number(shortfallPenalty) || 0),
      dailyAllowance: isBad ? Number(dailyAllowance) : 0,
      overagePenalty: isBad ? Number(overagePenalty) : 0,
      freeWithinAllowance: isBad ? freeWithinAllowance : false,
    };
    try {
      // Polarity is fixed once created: a good habit's logs are earns and a
      // bad one's are penalties, so flipping it rewrites what history meant.
      if (editing) await api.patch(`/habits/${habit._id}`, body);
      else await api.post('/habits', { ...body, polarity });
      refreshData();
      showToast?.(editing ? 'Habit updated' : 'Habit created');
      onClose();
    } catch (err) {
      showToast?.(err.response?.data?.message || 'Could not save habit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const seg = (on) =>
    `flex-1 h-11 rounded-xl text-[11px] font-bold tracking-wider transition-colors border ${
      on ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-white/10 text-white/50'
    }`;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1000] p-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ease: 'easeOut' }}
        className="bg-[#16191e] border border-white/10 rounded-2xl p-7 w-full max-w-[420px] relative max-h-[88vh] overflow-y-auto"
        data-testid="habit-modal"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="font-heading font-bold text-lg text-white mb-6">
          {editing ? 'EDIT HABIT' : 'NEW HABIT'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Habit Name</Label>
            <Input
              type="text"
              placeholder="Gym"
              data-testid="habit-name"
              className="bg-[#0d0f12] border-white/10 text-white placeholder:text-white/30 h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {!editing && (
            <div className="space-y-2">
              <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Kind</Label>
              <div className="flex gap-2">
                <button type="button" data-testid="pol-good" className={seg(!isBad)} onClick={() => setPolarity('good')}>
                  BUILD, EARN
                </button>
                <button type="button" data-testid="pol-bad" className={seg(isBad)} onClick={() => setPolarity('bad')}>
                  BREAK, LOSE
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
              {isBad ? 'Base penalty per slip (★)' : 'Stars per rep'}
            </Label>
            <Input
              type="number" min={0} data-testid="habit-stars"
              className="bg-[#0d0f12] border-white/10 text-white h-11"
              value={starsPerRep}
              onChange={(e) => setStarsPerRep(e.target.value)}
            />
          </div>

          {isBad ? (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                  Daily limit before the extra penalty
                </Label>
                <Input
                  type="number" min={0} data-testid="habit-allowance"
                  className="bg-[#0d0f12] border-white/10 text-white h-11"
                  value={dailyAllowance}
                  onChange={(e) => setAllowance(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                  Extra penalty per slip over the limit (★)
                </Label>
                <Input
                  type="number" min={0} data-testid="habit-overage"
                  className="bg-[#0d0f12] border-white/10 text-white h-11"
                  value={overagePenalty}
                  onChange={(e) => setOverage(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox" data-testid="habit-free"
                  checked={freeWithinAllowance}
                  onChange={(e) => setFree(e.target.checked)}
                  className="w-4 h-4 accent-[#c0b3a5]"
                />
                <span className="text-xs text-white/70">Slips within the limit are free</span>
              </label>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                  Reps per day (0 = just tick it off)
                </Label>
                <Input
                  type="number" min={0} data-testid="habit-daily-target"
                  className="bg-[#0d0f12] border-white/10 text-white h-11"
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(e.target.value)}
                />
                <p className="text-[10px] text-white/40">
                  {Number(dailyTarget) > 0
                    ? `Counts ${dailyTarget} a day and only reads as done at ${dailyTarget}.`
                    : 'One tap a day marks it done, no counter.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                  Goal (0 = no goal)
                </Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number" min={0} data-testid="habit-target"
                    className="bg-[#0d0f12] border-white/10 text-white h-11 w-20"
                    value={targetReps}
                    onChange={(e) => setTargetReps(e.target.value)}
                  />
                  <Input
                    type="text" data-testid="habit-unit" maxLength={16}
                    placeholder="reps"
                    className="bg-[#0d0f12] border-white/10 text-white h-11 w-24 text-center"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                  <span className="text-[10px] text-white/40 tracking-wider">PER</span>
                  <Select
                    testId="habit-period"
                    ariaLabel="Goal period"
                    className="flex-1"
                    value={targetPeriodWeeks}
                    onChange={setPeriodWeeks}
                    options={PERIODS.map((p) => ({ value: p.weeks, label: p.label }))}
                  />
                </div>
                <p className="text-[10px] text-white/40">
                  {unit.trim()
                    ? `Logged in ${unit.trim()}, so ${starsPerRep}★ per ${unit.trim()} and going over still earns.`
                    : 'Counted across the whole period, several in one day is fine.'}
                </p>
              </div>

              {/* A goal with no cost for missing it is a wish. Off by default:
                  a penalty nobody asked for is a nasty surprise. */}
              {Number(targetReps) > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-white/60 tracking-widest uppercase">
                    Penalty per {unit.trim() || 'rep'} missed at the end (★, 0 = none)
                  </Label>
                  <Input
                    type="number" min={0} data-testid="habit-shortfall"
                    className="bg-[#0d0f12] border-white/10 text-white h-11"
                    value={shortfallPenalty}
                    onChange={(e) => setShortfall(e.target.value)}
                  />
                  <p className="text-[10px] text-white/40">
                    {Number(shortfallPenalty) > 0
                      ? `Stopping at ${Math.max(0, Number(targetReps) - 1)} of ${targetReps} would cost ${shortfallPenalty}★ when the period closes.`
                      : 'Nothing is charged for falling short.'}
                  </p>
                </div>
              )}
            </>
          )}

          <Button
            type="submit"
            disabled={submitting || !name.trim()}
            data-testid="habit-save"
            className="w-full h-12 bg-[#c0b3a5] hover:bg-[#cfc4b8] text-black font-bold tracking-widest text-xs mt-2 rounded-xl"
          >
            {submitting ? 'SAVING...' : editing ? 'SAVE CHANGES' : 'CREATE HABIT'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default HabitModal;
