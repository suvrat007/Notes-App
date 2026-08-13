import { useState } from 'react';
import Modal from './Modal';
import type { NewHabit } from '../db/queries';
import type { Polarity } from '../db/schema';
import { PERIOD_OPTIONS } from '../engine/period';
import { HABIT_ICONS } from './habitIcons';

type Props = {
  onClose: () => void;
  onSave: (h: NewHabit) => void;
};

export default function NewHabitModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('dumbbell');
  const [polarity, setPolarity] = useState<Polarity>('good');
  const [starsPerRep, setStarsPerRep] = useState(10);
  const [dailyAllowance, setDailyAllowance] = useState(0);
  const [overagePenalty, setOveragePenalty] = useState(5);
  const [freeWithinAllowance, setFree] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(0);
  const [targetReps, setTargetReps] = useState(0);
  const [targetPeriodWeeks, setTargetPeriodWeeks] = useState(1);
  const [isRecurringTask, setRecurring] = useState(false);

  const isBad = polarity === 'bad';
  const canSave = name.trim().length > 0 && starsPerRep > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(), icon, polarity, starsPerRep,
      dailyAllowance: isBad ? dailyAllowance : 0,
      overagePenalty: isBad ? overagePenalty : 0,
      freeWithinAllowance: isBad ? freeWithinAllowance : false,
      dailyTarget: isBad ? 0 : dailyTarget,
      targetReps: isBad ? 0 : targetReps,
      targetPeriodWeeks: isBad ? 1 : targetPeriodWeeks,
      isRecurringTask: isBad ? false : isRecurringTask,
      color: isBad ? '#e5484d' : '#3ecf8e',
    });
  };

  return (
    <Modal title="New Habit" onClose={onClose} testId="new-habit-modal">
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} autoFocus data-testid="habit-name"
               onChange={(e) => setName(e.target.value)} placeholder="Gym" />
      </label>

      <div className="field">
        <span className="field__label">Icon</span>
        <div className="iconpick">
          {HABIT_ICONS.map(({ key, label, Icon }) => (
            <button key={key} type="button" title={label}
                    className={'iconpick__opt' + (key === icon ? ' iconpick__opt--on' : '')}
                    onClick={() => setIcon(key)} aria-label={label}
                    data-testid={`icon-${key}`}>
              <Icon size={20} />
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Polarity</span>
        <div className="seg">
          <button type="button" data-testid="pol-good"
                  className={'seg__opt' + (!isBad ? ' seg__opt--on' : '')}
                  onClick={() => setPolarity('good')}>Good — earn</button>
          <button type="button" data-testid="pol-bad"
                  className={'seg__opt' + (isBad ? ' seg__opt--on seg__opt--bad' : '')}
                  onClick={() => setPolarity('bad')}>Bad — lose</button>
        </div>
      </div>

      <label className="field">
        <span className="field__label">
          {isBad ? 'Base penalty per rep (★)' : 'Stars per rep'}
        </span>
        <input className="input" type="number" min={1} value={starsPerRep}
               data-testid="habit-stars"
               onChange={(e) => setStarsPerRep(Number(e.target.value))} />
      </label>

      {isBad ? (
        <>
          <label className="field">
            <span className="field__label">Daily allowance (reps before extra penalty)</span>
            <input className="input" type="number" min={0} value={dailyAllowance}
                   data-testid="habit-allowance"
                   onChange={(e) => setDailyAllowance(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field__label">Extra penalty per rep over allowance (★)</span>
            <input className="input" type="number" min={0} value={overagePenalty}
                   data-testid="habit-overage"
                   onChange={(e) => setOveragePenalty(Number(e.target.value))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={freeWithinAllowance}
                   data-testid="habit-free"
                   onChange={(e) => setFree(e.target.checked)} />
            <span>Reps within allowance are free (only overage costs)</span>
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field__label">Reps per day (0 = just tick it off)</span>
            <input className="input" type="number" min={0} value={dailyTarget}
                   data-testid="habit-daily-target"
                   onChange={(e) => setDailyTarget(Number(e.target.value))} />
            <span className="goalrow__hint">
              {dailyTarget > 0
                ? `Counts ${dailyTarget} a day and only reads as done at ${dailyTarget}.`
                : 'One tap a day marks it done — no counter.'}
            </span>
          </label>

          <div className="field">
            <span className="field__label">Goal (0 = no goal)</span>
            <div className="goalrow">
              <input className="input goalrow__reps" type="number" min={0}
                     value={targetReps} data-testid="habit-target"
                     onChange={(e) => setTargetReps(Number(e.target.value))} />
              <span className="goalrow__per">reps per</span>
              <select className="input goalrow__period" value={targetPeriodWeeks}
                      data-testid="habit-period"
                      onChange={(e) => setTargetPeriodWeeks(Number(e.target.value))}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.weeks} value={o.weeks}>{o.label}</option>
                ))}
              </select>
            </div>
            {targetReps > 0 && (
              <span className="goalrow__hint" data-testid="habit-goal-hint">
                {targetPeriodWeeks === 1
                  ? `About ${(targetReps / 7).toFixed(1)} a day.`
                  : `${(targetReps / targetPeriodWeeks).toFixed(1)} a week over ` +
                    `${targetPeriodWeeks} weeks — pace is judged across the whole window.`}
              </span>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={isRecurringTask}
                   data-testid="habit-recurring"
                   onChange={(e) => setRecurring(e.target.checked)} />
            <span>Also show on my daily task list</span>
          </label>
        </>
      )}

      <button className="btn btn--primary" disabled={!canSave} onClick={submit}
              data-testid="habit-save">Create Habit</button>
    </Modal>
  );
}
