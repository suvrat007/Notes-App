import { useState } from 'react';
import Modal from './Modal';
import type { NewHabit } from '../db/queries';
import type { Polarity } from '../db/schema';

const ICONS = ['🏋️', '📚', '🏃', '🧘', '💧', '🥗', '🛏️', '✍️', '🎸', '🧹',
               '🚬', '🍺', '🍔', '📱', '🎮', '🛒', '😴', '☕'];

type Props = {
  onClose: () => void;
  onSave: (h: NewHabit) => void;
};

export default function NewHabitModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🏋️');
  const [polarity, setPolarity] = useState<Polarity>('good');
  const [starsPerRep, setStarsPerRep] = useState(10);
  const [dailyAllowance, setDailyAllowance] = useState(0);
  const [overagePenalty, setOveragePenalty] = useState(5);
  const [freeWithinAllowance, setFree] = useState(false);
  const [weeklyTarget, setWeeklyTarget] = useState(0);
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
      weeklyTarget: isBad ? 0 : weeklyTarget,
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
          {ICONS.map((i) => (
            <button key={i} type="button"
                    className={'iconpick__opt' + (i === icon ? ' iconpick__opt--on' : '')}
                    onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>{i}</button>
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
            <span className="field__label">Weekly target (reps/week, 0 = none)</span>
            <input className="input" type="number" min={0} value={weeklyTarget}
                   data-testid="habit-target"
                   onChange={(e) => setWeeklyTarget(Number(e.target.value))} />
          </label>
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
