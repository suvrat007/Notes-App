type Props = {
  id: string;
  name: string;
  stars: number;
  done: boolean;
  icon?: string;
  /** Recurring habit rows are marked so the user knows a tap also logs the habit. */
  recurring?: boolean;
  onToggle: (next: boolean) => void;
  onDelete?: () => void;
};

export default function TaskRow({
  id, name, stars, done, icon, recurring, onToggle, onDelete,
}: Props) {
  return (
    <div className={'task' + (done ? ' task--done' : '')} data-testid={`task-${id}`}>
      <button
        className="task__check"
        role="checkbox"
        aria-checked={done}
        aria-label={name}
        data-testid={`check-${id}`}
        onClick={() => onToggle(!done)}
      >
        {done ? '✓' : ''}
      </button>

      <span className="task__name">
        {icon && <span className="task__icon" aria-hidden="true">{icon} </span>}
        {name}
        {recurring && <span className="task__tag">habit</span>}
      </span>

      <span className="task__stars num" data-testid={`stars-${id}`}>+{stars}★</span>

      {onDelete && (
        <button className="task__del" onClick={onDelete}
                aria-label={`Delete ${name}`} data-testid={`del-${id}`}>✕</button>
      )}
    </div>
  );
}
