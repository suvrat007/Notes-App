import { useState } from 'react';
import Modal from './Modal';
import type { Task, TaskHorizon } from '../db/schema';
import { HORIZON_LABEL, HORIZON_ORDER } from '../engine/series';

type Props = {
  task: Task;
  /** Upcoming occurrences this row stands for, when it repeats. */
  seriesCount?: number;
  onClose: () => void;
  onSave: (patch: Partial<Task>, horizon: TaskHorizon) => void;
};

/**
 * Change what a task ASKS OF YOU, after the fact.
 *
 * The mirror of editing a habit: "read 2 PDFs" turns out to be 5, or Friday
 * turns out to be Monday. Progress already made is kept — raising the target
 * from 2 to 5 with one done leaves you at 1 of 5, not back at zero.
 */
export default function EditTaskModal({ task, seriesCount = 1, onClose, onSave }: Props) {
  const [name, setName] = useState(task.name);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [dueTime, setDueTime] = useState(task.dueTime ?? '');
  const [targetCount, setTargetCount] = useState(task.targetCount);
  const [stars, setStars] = useState(task.stars);
  const [horizon, setHorizon] = useState<TaskHorizon>(task.horizon ?? 'once');

  const canSave = name.trim().length > 0 && targetCount >= 1;
  const repeats = (task.horizon ?? 'once') !== 'once';

  const submit = () => {
    if (!canSave) return;
    const target = Math.max(1, Math.round(targetCount));
    onSave({
      name: name.trim(),
      dueDate,
      dueTime: dueTime.trim() || null,
      targetCount: target,
      // Lowering the target below what is already done would leave a task
      // that can never be finished by ticking, so it settles at the new top.
      doneCount: Math.min(task.doneCount, target),
      done: task.doneCount >= target,
      stars,
    }, horizon);
  };

  return (
    <Modal title={`Edit ${task.name}`} onClose={onClose} testId="edit-task-modal">
      <label className="field">
        <span className="field__label">Name</span>
        <input className="input" value={name} autoFocus data-testid="et-name"
               onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        <span className="field__label">How many to finish it</span>
        <input className="input" type="number" min={1} value={targetCount}
               data-testid="et-count"
               onChange={(e) => setTargetCount(Number(e.target.value))} />
        <span className="goalrow__hint">
          {targetCount > 1
            ? `Done at ${targetCount}. ${task.doneCount} already counted.`
            : 'A single tick finishes it.'}
        </span>
      </label>

      <label className="field">
        <span className="field__label">Due date</span>
        <input className="input" type="date" value={dueDate} data-testid="et-date"
               onChange={(e) => setDueDate(e.target.value)} />
      </label>

      <label className="field">
        <span className="field__label">Time (optional)</span>
        <input className="input" type="time" value={dueTime} data-testid="et-time"
               onChange={(e) => setDueTime(e.target.value)} />
      </label>

      <label className="field">
        <span className="field__label">Stars when finished</span>
        <input className="input" type="number" min={0} value={stars} data-testid="et-stars"
               onChange={(e) => setStars(Number(e.target.value))} />
      </label>

      <div className="field">
        <span className="field__label">Repeats</span>
        <div className="seg">
          {HORIZON_ORDER.map((h) => (
            <button key={h} type="button" data-testid={`et-hz-${h}`}
                    className={'seg__opt' + (horizon === h ? ' seg__opt--on' : '')}
                    onClick={() => setHorizon(h)}>
              {HORIZON_LABEL[h]}
            </button>
          ))}
        </div>
        {repeats && (
          <span className="goalrow__hint">
            Changing this rebuilds the {seriesCount} upcoming
            {seriesCount === 1 ? ' occurrence' : ' occurrences'}.
          </span>
        )}
      </div>

      <button className="btn btn--primary" disabled={!canSave} onClick={submit}
              data-testid="et-save">Save changes</button>
    </Modal>
  );
}
