import { useState } from 'react';
import Modal from './Modal';
import type { NewTask } from '../db/queries';
import { todayStr, addDays } from '../lib/dates';

type Props = {
  onClose: () => void;
  onSave: (t: NewTask) => void;
};

export default function NewTaskModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [stars, setStars] = useState(10);
  const [dueDate, setDueDate] = useState(todayStr());
  // Empty = all-day. Only Google sync reads it; FORGE's own maths is day-keyed.
  const [dueTime, setDueTime] = useState('');

  const canSave = name.trim().length > 0 && stars > 0;

  return (
    <Modal title="New Task" onClose={onClose} testId="new-task-modal">
      <label className="field">
        <span className="field__label">Task</span>
        <input className="input" value={name} autoFocus data-testid="task-name"
               onChange={(e) => setName(e.target.value)} placeholder="Read 20 pages" />
      </label>

      <label className="field">
        <span className="field__label">Stars if done</span>
        <input className="input" type="number" min={1} value={stars} data-testid="task-stars"
               onChange={(e) => setStars(Number(e.target.value))} />
      </label>

      <div className="field">
        <span className="field__label">Due</span>
        <div className="seg seg--neutral">
          <button type="button" data-testid="due-today"
                  className={'seg__opt' + (dueDate === todayStr() ? ' seg__opt--on' : '')}
                  onClick={() => setDueDate(todayStr())}>Today</button>
          <button type="button" data-testid="due-tomorrow"
                  className={'seg__opt' + (dueDate === addDays(todayStr(), 1) ? ' seg__opt--on' : '')}
                  onClick={() => setDueDate(addDays(todayStr(), 1))}>Tomorrow</button>
        </div>
        <input className="input" type="date" value={dueDate} data-testid="task-due"
               style={{ marginTop: 8 }}
               onChange={(e) => e.target.value && setDueDate(e.target.value)} />
      </div>

      <label className="field">
        <span className="field__label">
          Time <span className="setting__hint">Optional — sets the calendar event's time.</span>
        </span>
        <input className="input" type="time" value={dueTime} data-testid="task-time"
               onChange={(e) => setDueTime(e.target.value)} />
      </label>

      <button className="btn btn--primary" disabled={!canSave} data-testid="task-save"
              onClick={() =>
                canSave && onSave({
                  name: name.trim(),
                  stars,
                  dueDate,
                  dueTime: dueTime || null,
                })}>
        Add Task
      </button>
    </Modal>
  );
}
