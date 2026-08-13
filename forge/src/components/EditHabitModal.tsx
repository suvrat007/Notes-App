import { useState } from 'react';
import Modal from './Modal';
import type { Habit } from '../db/schema';
import { PERIOD_OPTIONS } from '../engine/period';

type Props = {
  habit: Habit;
  onClose: () => void;
  onSave: (patch: Partial<Habit>) => void;
};

/**
 * Change what a habit ASKS OF YOU, after the fact.
 *
 * A habit is a promise you renegotiate: "run once a week" becomes "run three
 * times a week" as you get fitter. Without this the only way to change the
 * terms was to archive and recreate, which throws away the history that made
 * the change worth making.
 *
 * Only the terms are editable. Polarity is not: a good habit's logs are earns
 * and a bad one's are penalties, so flipping it would silently rewrite what
 * every past entry meant.
 */
export default function EditHabitModal({ habit, onClose, onSave }: Props) {
  const [name, setName] = useState(habit.name);
  const [starsPerRep, setStarsPerRep] = useState(habit.starsPerRep);
  const [dailyTarget, setDailyTarget] = useState(habit.dailyTarget ?? 0);
  const [targetReps, setTargetReps] = useState(habit.targetReps);
  const [targetPeriodWeeks, setPeriodWeeks] = useState(habit.targetPeriodWeeks);
  const [dailyAllowance, setAllowance] = useState(habit.dailyAllowance);
  const [overagePenalty, setOverage] = useState(habit.overagePenalty);
  const [freeWithinAllowance, setFree] = useState(habit.freeWithinAllowance);
  const [isRecurringTask, setRecurring] = useState(habit.isRecurringTask);

  const isBad = habit.polarity === 'bad';
  const canSave = name.trim().length > 0 && starsPerRep > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      starsPerRep,
      dailyTarget: isBad ? 0 : dailyTarget,
      targetReps: isBad ? 0 : targetReps,
      targetPeriodWeeks: isBad ? 1 : targetPeriodWeeks,
      dailyAllowance: isBad ? dailyAllowance : 0,
      overagePenalty: isBad ? overagePenalty : 0,
      freeWithinAllowance: isBad ? freeWithinAllowance : false,
      isRecurringTask: isBad ? false : isRecurringTask,
    });
  };

  return (
    <Modal title={`Edit ${habit.name}`} onClose={onClose} testId="edit-habit-modal">
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} autoFocus data-testid="eh-name"
               onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        <span className="field__label">{isBad ? 'Base penalty per rep (★)' : 'Stars per rep'}</span>
        <input className="input" type="number" min={1} value={starsPerRep}
               data-testid="eh-stars"
               onChange={(e) => setStarsPerRep(Number(e.target.value))} />
      </label>

      {isBad ? (
        <>
          <label className="field">
            <span className="field__label">Daily limit (reps before extra penalty)</span>
            <input className="input" type="number" min={0} value={dailyAllowance}
                   data-testid="eh-allowance"
                   onChange={(e) => setAllowance(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field__label">Extra penalty per rep over the limit (★)</span>
            <input className="input" type="number" min={0} value={overagePenalty}
                   data-testid="eh-overage"
                   onChange={(e) => setOverage(Number(e.target.value))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={freeWithinAllowance} data-testid="eh-free"
                   onChange={(e) => setFree(e.target.checked)} />
            <span>Reps within the limit are free (only overage costs)</span>
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field__label">Reps per day (0 = just tick it off)</span>
            <input className="input" type="number" min={0} value={dailyTarget}
                   data-testid="eh-daily"
                   onChange={(e) => setDailyTarget(Number(e.target.value))} />
          </label>

          <div className="field">
            <span className="field__label">Goal (0 = no goal)</span>
            <div className="goalrow">
              <input className="input goalrow__reps" type="number" min={0} value={targetReps}
                     data-testid="eh-target"
                     onChange={(e) => setTargetReps(Number(e.target.value))} />
              <span className="goalrow__per">reps per</span>
              <select className="input goalrow__period" value={targetPeriodWeeks}
                      data-testid="eh-period"
                      onChange={(e) => setPeriodWeeks(Number(e.target.value))}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.weeks} value={o.weeks}>{o.label}</option>
                ))}
              </select>
            </div>
            <span className="goalrow__hint">
              {targetReps > 0
                ? 'Counted across the whole period — several in one day is fine.'
                : 'No goal, so it never appears on the roadmap.'}
            </span>
          </div>

          <label className="check">
            <input type="checkbox" checked={isRecurringTask} data-testid="eh-recurring"
                   onChange={(e) => setRecurring(e.target.checked)} />
            <span>Also show on my daily task list</span>
          </label>
        </>
      )}

      <button className="btn btn--primary" disabled={!canSave} onClick={submit}
              data-testid="eh-save">Save changes</button>
    </Modal>
  );
}
